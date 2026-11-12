//! Room registration (SDD §3.13): a nonce, a quote checked by the locked verifier, then the
//! attestation record and the registry's admission. The policy is `marginal_core::attest`; this file
//! adds the state: the one-time nonce and the stored record.

use marginal_core::attest::{
    evaluate_quote, room_pop_signing_bytes, room_report_data, AdmitRoom, Attested,
    RegisterRoomRequest, RoomBinding, Rtmr3Event,
};
use marginal_core::audit::AuditKind;
use marginal_core::certificate::measurement_hash;
use marginal_core::codec::{from_bytes, hash_of, sha256, to_bytes};
use marginal_core::json::to_hex;
use marginal_core::verifier::{verify_args, VerificationResult};
use marginal_core::{AttestationMode, CoreError, RoomClass};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::json;
use near_sdk::{env, near, Gas};

use crate::calls::{self, Call};
use crate::fees::{charge, ATTESTATION_FEE, NONCE_FEE};
use crate::store::{self, Attestation, NonceRecord, Table};
use crate::{fail, now_secs, KeyPolicy, KeyPolicyExt};

/// A nonce is good for about an hour.
pub const NONCE_TTL_BLOCKS: u64 = 5_000;
/// The locked verifier needs about 124 TGas; it is given 200. Unused gas goes to the callback.
const VERIFY_GAS: Gas = Gas::from_tgas(200);
const ON_VERIFIED_GAS: Gas = Gas::from_tgas(60);
const ADMIT_GAS: Gas = Gas::from_tgas(15);
/// A verifier reply is about 700 bytes, or a rejection message.
const MAX_VERIFIER_REPLY: usize = 16 * 1024;

/// What the verifier callback needs from the registration call.
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct Pending {
    sign_pk: [u8; 32],
    box_pk: [u8; 32],
    class: RoomClass,
    events: Vec<Rtmr3Event>,
    quote_hash: [u8; 32],
    collateral_hash: [u8; 32],
    expected_report_data: [u8; 64],
}

/// An accepted room, ready to be stored.
pub(crate) struct NewRoom {
    pub sign_pk: [u8; 32],
    pub box_pk: [u8; 32],
    pub class: RoomClass,
    pub attested: Attested,
    pub quote_hash: [u8; 32],
    pub collateral_hash: [u8; 32],
    pub mode: AttestationMode,
}

/// Spends a nonce: it must have been issued here, to the caller, and not have expired. A nonce works
/// once, whatever happens next; an operator that needs to retry asks for a new one.
pub(crate) fn spend_nonce(nonce: &[u8; 32]) {
    match store::take::<NonceRecord>(Table::Nonce, nonce) {
        Some(record)
            if env::block_height() <= record.expiry
                && env::predecessor_account_id() == record.issuer => {}
        _ => fail(CoreError::Nonce),
    }
}

#[near]
impl KeyPolicy {
    /// A fresh nonce for a room to bind into its quote, good for the caller only. Costs
    /// [`NONCE_FEE`], because it is stored.
    #[payable]
    pub fn issue_nonce(&mut self) -> String {
        charge(NONCE_FEE);
        self.nonce_counter += 1;
        let nonce = sha256(&[
            &env::random_seed(),
            &self.nonce_counter.to_le_bytes(),
            env::predecessor_account_id().as_bytes(),
            &env::block_height().to_le_bytes(),
        ]);
        let record = NonceRecord {
            expiry: env::block_height() + NONCE_TTL_BLOCKS,
            issuer: env::predecessor_account_id(),
        };
        store::put(Table::Nonce, &nonce, &record);
        to_hex(&nonce)
    }

    /// Registers a room. `request` is the Borsh of `marginal_core::attest::RegisterRoomRequest`, as
    /// base64. Costs [`ATTESTATION_FEE`] and about 300 TGas: the quote goes to the locked verifier,
    /// and [`Self::on_quote_verified`] does the rest.
    #[payable]
    pub fn register_room(&mut self, request: Base64VecU8) {
        charge(ATTESTATION_FEE);
        let request: RegisterRoomRequest = from_bytes(&request.0).unwrap_or_else(|e| fail(e));
        spend_nonce(&request.nonce);
        let binding = RoomBinding {
            chain_id: self.chain_id.clone(),
            keypolicy: env::current_account_id().to_string(),
            sign_pk: request.sign_pk,
            box_pk: request.box_pk,
            nonce: request.nonce,
        };
        // The registrant must hold the signing key it names. A quote proves what software runs, not
        // who holds a key: without this, anyone with a TDX machine could register a room's public key
        // with a box key of their own, in a race with the room's own registration.
        if !env::ed25519_verify(
            &request.sign_sig,
            room_pop_signing_bytes(&binding),
            &request.sign_pk,
        ) {
            fail(CoreError::BadSignature)
        }
        // A registered key keeps its box key and class: refuse early, before paying for the verifier.
        if let Some(existing) = store::get::<Attestation>(Table::Attestation, &request.sign_pk) {
            if existing.box_pk != request.box_pk || existing.class != request.class {
                fail(CoreError::RoomKeyInUse)
            }
        }
        let pending = Pending {
            sign_pk: request.sign_pk,
            box_pk: request.box_pk,
            class: request.class,
            quote_hash: sha256(&[&request.quote]),
            collateral_hash: hash_of(&request.collateral),
            expected_report_data: room_report_data(&binding),
            events: request.events,
        };
        let verify = Call {
            method: "verify_quote_with_collateral_dates",
            args: verify_args(&request.quote, &request.collateral),
            deposit: near_sdk::NearToken::from_yoctonear(0),
            gas: VERIFY_GAS,
            weight: 0,
        };
        let verified = calls::start(&self.dcap_verifier, &verify);
        let mut callback = Call::callback(
            "on_quote_verified",
            "pending",
            to_bytes(&pending),
            ON_VERIFIED_GAS,
        );
        callback.weight = 1;
        calls::return_value(calls::then(verified, &env::current_account_id(), &callback));
    }

    /// The verifier's answer. Any refusal panics with its stable code and leaves nothing behind;
    /// the nonce is already spent.
    #[private]
    pub fn on_quote_verified(&mut self, pending: Base64VecU8) {
        let pending: Pending = from_bytes(&pending.0).expect("our own pending record");
        let reply = env::promise_result_checked(0, MAX_VERIFIER_REPLY)
            .unwrap_or_else(|_| fail(CoreError::VerifierUnavailable));
        let result: VerificationResult = from_bytes(&reply).unwrap_or_else(|e| fail(e));
        let attested = evaluate_quote(
            &result,
            &pending.events,
            &pending.expected_report_data,
            now_secs(),
        )
        .unwrap_or_else(|e| fail(e));
        let admit = self.record_room(NewRoom {
            sign_pk: pending.sign_pk,
            box_pk: pending.box_pk,
            class: pending.class,
            attested,
            quote_hash: pending.quote_hash,
            collateral_hash: pending.collateral_hash,
            mode: AttestationMode::OnChainDcap,
        });
        calls::return_value(admit);
    }
}

impl KeyPolicy {
    /// Stores an accepted room, logs it, and asks the registry to admit it. A room key's measurement,
    /// platform and box key never change: only a fresh quote of the *same* room renews it. Otherwise
    /// anyone with a TDX machine could overwrite the record of a room whose public key they have seen.
    pub(crate) fn record_room(&mut self, room: NewRoom) -> near_sdk::PromiseIndex {
        if let Some(existing) = store::get::<Attestation>(Table::Attestation, &room.sign_pk) {
            let same_room = existing.box_pk == room.box_pk
                && existing.class == room.class
                && existing.measurement == room.attested.measurement
                && existing.ppid_hash == room.attested.ppid_hash;
            if !same_room {
                fail(CoreError::RoomKeyInUse)
            }
        }
        let attested = room.attested;
        store::put(
            Table::Attestation,
            &room.sign_pk,
            &Attestation {
                measurement: attested.measurement.clone(),
                ppid_hash: attested.ppid_hash,
                box_pk: room.box_pk,
                class: room.class,
                tcb_status: attested.tcb_status.clone(),
                tee_tcb_svn: attested.tee_tcb_svn,
                collateral_hash: room.collateral_hash,
                quote_hash: room.quote_hash,
                mode: room.mode,
                verified_height: env::block_height(),
                expires_at: attested.expires_at,
            },
        );
        self.emit(
            AuditKind::RoomRegistered,
            "room_registered",
            u64::from_le_bytes(room.sign_pk[..8].try_into().expect("8 bytes")),
            json!({
                "room_key": to_hex(&room.sign_pk),
                "quote_hash": to_hex(&room.quote_hash),
                "measurement_hash": to_hex(&measurement_hash(&attested.measurement)),
                "ppid_hash": to_hex(&attested.ppid_hash),
                "mode": format!("{:?}", room.mode),
                "expires_at": attested.expires_at,
            }),
        );
        let admit = AdmitRoom {
            room_key: room.sign_pk,
            box_pk: room.box_pk,
            ppid_hash: attested.ppid_hash,
            measurement: attested.measurement,
            class: room.class,
            tcb_status: attested.tcb_status,
            tee_tcb_svn: attested.tee_tcb_svn,
            registered_height: env::block_height(),
            expires_at: attested.expires_at,
            collateral_issued_at: attested.collateral_issued_at,
            quote_hash: room.quote_hash,
            attestation_mode: room.mode,
        };
        calls::start(
            &self.registry,
            &Call::json("admit_room", &json!({ "room": admit }), ADMIT_GAS, 1),
        )
    }
}
