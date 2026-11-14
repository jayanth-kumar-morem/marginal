//! Room attestation checks (SDD §3.13): everything KeyPolicy decides about a quote *after* the
//! locked verifier has checked its signatures, as pure functions. KeyPolicy only adds state (the
//! nonce, the stored record). The room and the operator run the same functions to pre-check a
//! registration before spending about 170 TGas on it.
//!
//! The dstack event log is replayed here rather than taken from near/mpc's `attestation` crate:
//! that crate hard-codes MPC's own compose policy (it requires `public_logs` and a local key
//! provider, the opposite of ours) and keeps its replay private. The replay below is checked against
//! near/mpc's real fixture (`tests/attest.rs`): replaying a real dstack event log reproduces the
//! RTMR3 of a real quote.

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::certificate::Measurement;
use crate::codec::{sha256, sha384, sha512, to_bytes};
use crate::error::CoreError;
use crate::json::{hex, hex_opt};
use crate::types::{AccountId, RoomClass};
use crate::verifier::{Collateral, VerificationResult};

/// Domain of the report-data binding.
pub const ROOM_REPORT_DOMAIN: &[u8] = b"marginal-room-v1";
/// Domain of [`room_pop_signing_bytes`].
pub const ROOM_POP_DOMAIN: &[u8] = b"marginal/room-pop/v1";
/// Domain of [`ppid_hash`].
pub const PPID_DOMAIN: &[u8] = b"marginal/ppid/v1";
/// Every event dstack measures into RTMR3 has this type.
pub const DSTACK_EVENT_TYPE: u32 = 0x0800_0001;
/// The only TCB status accepted: the platform is fully patched. Governance cannot loosen this; a
/// looser rule is a new KeyPolicy version.
pub const TCB_UP_TO_DATE: &str = "UpToDate";
pub const PPID_LEN: usize = 16;
/// How long an attestation lasts at most (it also ends with the collateral).
pub const MAX_ATTESTATION_SECS: u64 = 24 * 60 * 60;
/// The `key-provider` event payload of a room started with `key_provider: "none"`: no KMS.
pub const KEY_PROVIDER_NONE: &[u8] = br#"{"name":"none","id":""}"#;
/// `td_attributes[0]` bit 0: a debug TD, whose memory the host can read.
const TD_DEBUG: u8 = 0x01;

/// Everything a quote's report data binds, so a quote cannot be replayed elsewhere: this chain,
/// this KeyPolicy, these keys, this nonce.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct RoomBinding {
    pub chain_id: String,
    pub keypolicy: AccountId,
    #[serde(with = "hex")]
    pub sign_pk: [u8; 32],
    #[serde(with = "hex")]
    pub box_pk: [u8; 32],
    #[serde(with = "hex")]
    pub nonce: [u8; 32],
}

/// The 64 bytes a room puts in its quote: `SHA-512("marginal-room-v1" ‖ borsh(binding))`.
///
/// The SDD writes a plain concatenation of the fields. Borsh length-prefixes the two strings, so
/// no two different bindings can produce the same bytes.
pub fn room_report_data(binding: &RoomBinding) -> [u8; 64] {
    sha512(&[ROOM_REPORT_DOMAIN, &to_bytes(binding)])
}

/// What the room signs with its ed25519 `sign_sk` to register: the report data of the registration.
///
/// A quote proves what software is running and what it bound, but not that the registrant holds the
/// signing key it names: a quote from anyone's TDX machine can name someone else's public key. This
/// signature is that proof, and without it a room's key could be taken in a race with its own
/// registration. (An addition to the SDD: it is not in §3.13.)
pub fn room_pop_signing_bytes(binding: &RoomBinding) -> Vec<u8> {
    [ROOM_POP_DOMAIN, &room_report_data(binding)].concat()
}

/// `SHA-256("marginal/ppid/v1" ‖ ppid)`: how a platform is named in the registry.
pub fn ppid_hash(ppid: &[u8]) -> [u8; 32] {
    sha256(&[PPID_DOMAIN, ppid])
}

/// One event of the RTMR3 event log: what dstack measured, in order.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Rtmr3Event {
    pub event_type: u32,
    pub name: String,
    #[serde(with = "hex")]
    pub payload: Vec<u8>,
}

/// dstack's digest of an event: `SHA-384(type ‖ ":" ‖ name ‖ ":" ‖ payload)`, the type little endian.
pub fn event_digest(event: &Rtmr3Event) -> [u8; 48] {
    sha384(&[
        &event.event_type.to_le_bytes(),
        b":",
        event.name.as_bytes(),
        b":",
        &event.payload,
    ])
}

/// Replays the log into RTMR3: starting from zeros, `rtmr = SHA-384(rtmr ‖ digest)` per event.
/// A log with an event that is not a dstack event cannot be replayed.
pub fn replay_rtmr3(events: &[Rtmr3Event]) -> Result<[u8; 48], CoreError> {
    let mut rtmr = [0u8; 48];
    for event in events {
        if event.event_type != DSTACK_EVENT_TYPE {
            return Err(CoreError::Rtmr3Events);
        }
        rtmr = sha384(&[&rtmr, &event_digest(event)]);
    }
    Ok(rtmr)
}

/// What the event log proves about the room's configuration.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct RoomEvents {
    #[serde(with = "hex")]
    pub compose_hash: [u8; 32],
    #[serde(with = "hex")]
    pub key_provider_digest: [u8; 48],
    #[serde(with = "hex_opt")]
    pub gpu_policy_hash: Option<[u8; 32]>,
}

fn events_named<'a>(
    events: &'a [Rtmr3Event],
    name: &'a str,
) -> impl Iterator<Item = &'a Rtmr3Event> {
    events.iter().filter(move |e| e.name == name)
}

/// The payload of the only event with this name. Missing or repeated is a violation.
fn single<'a>(events: &'a [Rtmr3Event], name: &'a str) -> Result<&'a Rtmr3Event, CoreError> {
    let mut found = events_named(events, name);
    match (found.next(), found.next()) {
        (Some(event), None) => Ok(event),
        _ => Err(CoreError::Rtmr3Events),
    }
}

fn expect(payload: &[u8], wanted: &[u8]) -> Result<(), CoreError> {
    if payload == wanted {
        Ok(())
    } else {
        Err(CoreError::Rtmr3Events)
    }
}

/// The room policy on the event log (SDD §3.13 step 7). Exactly one each of `compose-hash`,
/// `key-provider` (no KMS), `app-id` (the first 20 bytes of the compose hash), `instance-id` (empty),
/// `storage-encrypted` (`1`) and `system-ready`; no `os-image-hash` and no `init-script-hash`,
/// whose absence proves no KMS and no injected scripts; at most one `gpu-policy-hash`.
pub fn room_events(events: &[Rtmr3Event]) -> Result<RoomEvents, CoreError> {
    for forbidden in ["os-image-hash", "init-script-hash"] {
        if events_named(events, forbidden).next().is_some() {
            return Err(CoreError::Rtmr3Events);
        }
    }
    let compose_hash: [u8; 32] = single(events, "compose-hash")?
        .payload
        .as_slice()
        .try_into()
        .map_err(|_| CoreError::Rtmr3Events)?;
    expect(&single(events, "app-id")?.payload, &compose_hash[..20])?;
    let key_provider = single(events, "key-provider")?;
    expect(&key_provider.payload, KEY_PROVIDER_NONE)?;
    expect(&single(events, "instance-id")?.payload, b"")?;
    expect(&single(events, "storage-encrypted")?.payload, b"1")?;
    single(events, "system-ready")?;
    let mut gpu = events_named(events, "gpu-policy-hash");
    let gpu_policy_hash = match (gpu.next(), gpu.next()) {
        (None, _) => None,
        (Some(event), None) => Some(
            event
                .payload
                .as_slice()
                .try_into()
                .map_err(|_| CoreError::Rtmr3Events)?,
        ),
        _ => return Err(CoreError::Rtmr3Events),
    };
    Ok(RoomEvents {
        compose_hash,
        key_provider_digest: event_digest(key_provider),
        gpu_policy_hash,
    })
}

/// What KeyPolicy records about an accepted room.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Attested {
    pub measurement: Measurement,
    #[serde(with = "hex")]
    pub ppid_hash: [u8; 32],
    pub tcb_status: String,
    #[serde(with = "hex")]
    pub tee_tcb_svn: [u8; 16],
    /// Unix seconds: the earlier of 24 hours from now and the end of the collateral.
    pub expires_at: u64,
    /// Unix seconds: when the newest piece of collateral was issued, for the registry's own policy.
    pub collateral_issued_at: u64,
}

/// Everything KeyPolicy checks about a verified quote. `expected_report_data` is
/// [`room_report_data`] of the registration, and `now_secs` is the block time.
///
/// The checks run in this order and each has its own error: the verifier accepted the quote and it
/// is a TD report; the TCB is `UpToDate`; the TD is not a debug TD; the report data matches; the PPID
/// is 16 bytes; the collateral has not expired; the event log replays to the quoted RTMR3; and the
/// event log meets the room policy.
pub fn evaluate_quote(
    result: &VerificationResult,
    events: &[Rtmr3Event],
    expected_report_data: &[u8; 64],
    now_secs: u64,
) -> Result<Attested, CoreError> {
    let (verified, dates) = match result {
        VerificationResult::Verified {
            report,
            collateral_dates,
        } => (report, collateral_dates),
        VerificationResult::Rejected(_) => return Err(CoreError::QuoteSig),
    };
    let td = verified.report.as_td10().ok_or(CoreError::QuoteSig)?;
    if verified.status != TCB_UP_TO_DATE {
        return Err(CoreError::TcbStatus);
    }
    if td.td_attributes[0] & TD_DEBUG != 0 {
        return Err(CoreError::DebugTd);
    }
    if &td.report_data != expected_report_data {
        return Err(CoreError::ReportData);
    }
    if verified.ppid.len() != PPID_LEN {
        return Err(CoreError::Ppid);
    }
    if dates.earliest_expiration_date <= now_secs {
        return Err(CoreError::CollateralStale);
    }
    if replay_rtmr3(events)? != td.rt_mr3 {
        return Err(CoreError::Rtmr3Replay);
    }
    let room = room_events(events)?;
    Ok(Attested {
        measurement: Measurement {
            mrtd: td.mr_td,
            rtmr0: td.rt_mr0,
            rtmr1: td.rt_mr1,
            rtmr2: td.rt_mr2,
            compose_hash: room.compose_hash,
            key_provider_digest: room.key_provider_digest,
            gpu_policy_hash: room.gpu_policy_hash,
        },
        ppid_hash: ppid_hash(&verified.ppid),
        tcb_status: verified.status.clone(),
        tee_tcb_svn: td.tee_tcb_svn,
        expires_at: dates
            .earliest_expiration_date
            .min(now_secs.saturating_add(MAX_ATTESTATION_SECS)),
        collateral_issued_at: dates.latest_issue_date,
    })
}

/// What an operator sends to `register_room`, Borsh-encoded: the quote and its collateral, the RTMR3
/// events, and the room's keys, the nonce and the class the report data binds.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct RegisterRoomRequest {
    #[serde(with = "hex")]
    pub quote: Vec<u8>,
    pub collateral: Collateral,
    pub events: Vec<Rtmr3Event>,
    #[serde(with = "hex")]
    pub sign_pk: [u8; 32],
    #[serde(with = "hex")]
    pub box_pk: [u8; 32],
    #[serde(with = "hex")]
    pub nonce: [u8; 32],
    pub class: RoomClass,
    /// The room's ed25519 signature over [`room_pop_signing_bytes`] of this registration.
    #[serde(with = "hex")]
    pub sign_sig: [u8; 64],
}

/// A set of measurements that are the same program (SDD §3.11). A room is admitted when its own
/// measurement is one of the members of an approved set.
///
/// It lives here rather than in clearing because three places build the same bytes: governance
/// approving a set, the deploy script seeding a profile's policy, and the tests. `approve_measurement_set`
/// takes it as opaque Borsh, so it is not in the contract's ABI surface.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MeasurementSet {
    pub id: String,
    pub members: Vec<Measurement>,
    /// Git tag and commit the members were built from (SDD §3.11), for the demo README.
    pub source_tag: String,
}

/// A registration with no quote, for `keypolicy-sim` test builds only (SDD §6.1): a room that claims
/// what a quote would have proved. The deployable KeyPolicy has no method that accepts it.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SimRoom {
    #[serde(with = "hex")]
    pub sign_pk: [u8; 32],
    #[serde(with = "hex")]
    pub box_pk: [u8; 32],
    #[serde(with = "hex")]
    pub nonce: [u8; 32],
    pub class: RoomClass,
    pub measurement: Measurement,
    #[serde(with = "hex")]
    pub ppid_hash: [u8; 32],
}

/// What KeyPolicy tells the registry when it admits a room, as JSON. The registry applies its own
/// policy to it: the platform allow-list, approved measurement sets, TCB policy and class rules.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AdmitRoom {
    #[serde(with = "hex")]
    pub room_key: [u8; 32],
    #[serde(with = "hex")]
    pub box_pk: [u8; 32],
    #[serde(with = "hex")]
    pub ppid_hash: [u8; 32],
    pub measurement: Measurement,
    pub class: RoomClass,
    pub tcb_status: String,
    #[serde(with = "hex")]
    pub tee_tcb_svn: [u8; 16],
    pub registered_height: u64,
    pub expires_at: u64,
    pub collateral_issued_at: u64,
    #[serde(with = "hex")]
    pub quote_hash: [u8; 32],
    pub attestation_mode: crate::types::AttestationMode,
}
