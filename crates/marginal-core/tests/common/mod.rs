//! Sample values shared by the integration tests. Each builder takes `full`: `true` sets every
//! optional field and uses data-carrying variants, `false` unsets and simplifies.
#![allow(dead_code)]

use borsh::{BorshDeserialize, BorshSerialize};
use core::fmt::Debug;
use marginal_core::attest::{RoomBinding, Rtmr3Event, DSTACK_EVENT_TYPE, KEY_PROVIDER_NONE};
use marginal_core::audit::{AuditEntry, AuditKind};
use marginal_core::certificate::{
    ForgetCertificateV1, Measurement, Scope, NP_PROCESS_EXIT, NP_TEE_MEMORY,
};
use marginal_core::commit::JobCore;
use marginal_core::credential::NullifierCredential;
use marginal_core::delivery::{DeliveryEntry, DeliveryV1};
use marginal_core::keyrelease::{listing_path, AppKey, KeyRequest};
use marginal_core::listing::ListingSpec;
use marginal_core::reports::{ProvisioningV1, ScreeningResult, ScreeningV1};
use marginal_core::verdict::{
    JudgeFactor, ModelProof, OpenBody, SealedBody, ShownField, VerdictStatus, VerdictV1,
};
use marginal_core::verifier::{
    CollateralDates, Report, TDReport10, TcbStatus, TcbStatusWithAdvisory, VerificationResult,
    VerifiedReport,
};
use marginal_core::*;

pub fn h(n: u8) -> [u8; 32] {
    [n; 32]
}

/// Encode, decode, compare, and check the encoding is canonical. Returns the bytes.
pub fn rt<T: BorshSerialize + BorshDeserialize + PartialEq + Debug>(v: &T) -> Vec<u8> {
    let bytes = borsh::to_vec(v).unwrap();
    let back: T = borsh::from_slice(&bytes).unwrap();
    assert_eq!(&back, v);
    assert_eq!(
        borsh::to_vec(&back).unwrap(),
        bytes,
        "encoding is canonical"
    );
    bytes
}

/// Variants listed in declaration order: variant `i` must encode with discriminant `i`.
pub fn pin<T: BorshSerialize + BorshDeserialize + PartialEq + Debug>(variants: Vec<T>) {
    for (i, v) in variants.iter().enumerate() {
        assert_eq!(rt(v)[0], i as u8, "discriminant of {v:?}");
    }
}

pub fn job_core(full: bool) -> JobCore {
    JobCore {
        chain_id: "testnet".into(),
        clearing: "clearing.marginal-demo.testnet".into(),
        job_id: 11,
        kind: JobKind::Appraisal,
        listing_id: 3,
        listing_version: 2,
        snapshot_id: full.then_some(9),
        snapshot_content_hash: full.then(|| h(1)),
        budget: 1_000_000_000,
        rule: PricingRule::Posted { ask: 400_000_000 },
        formula_params: FormulaParams {
            delta_star_bps: 500,
        },
        mode: if full {
            DisplayMode::Fields(vec![0, 2])
        } else {
            DisplayMode::Blind
        },
        privacy: VerdictPrivacy::Open,
        disclosure_policy: DisclosurePolicy::DisputeOnly,
        max_debit_mbits: 16_706,
        delivery_pk: h(2),
        compliance_pk: full.then(|| h(3)),
        context_auth_pk: h(4),
        assigned_rooms: if full { vec![h(5), h(6)] } else { vec![h(5)] },
        deadline_height: 400,
    }
}

pub fn appraiser() -> AppraiserRef {
    AppraiserRef {
        id: "knowledge".into(),
        version: 1,
        formula_id: FormulaId::KnowledgeV1,
    }
}

pub fn verdict(full: bool) -> VerdictV1 {
    let open = OpenBody {
        components: vec![8_000, 10_000],
        factors: vec![
            JudgeFactor {
                model_id: "Qwen/Qwen3.8-27B".into(),
                factor_bps: 9_000,
                proof: ModelProof::Simulated {
                    signer: "sim".into(),
                },
            },
            JudgeFactor {
                model_id: "z-ai/glm-5.3-flash".into(),
                factor_bps: 10_000,
                proof: if full {
                    ModelProof::NearAiReceipt {
                        text: "receipt".into(),
                        sig65: [7; 65],
                        response_body: "{}".into(),
                    }
                } else {
                    ModelProof::WeightsInMeasurement { model_hash: h(8) }
                },
            },
        ],
        shown: if full {
            vec![ShownField { id: 0, index: 4 }]
        } else {
            vec![]
        },
    };
    VerdictV1 {
        domain: VerdictV1::DOMAIN,
        chain_id: "testnet".into(),
        clearing: "clearing.marginal-demo.testnet".into(),
        job_id: 11,
        job_commitment: h(9),
        listing_id: 3,
        listing_version: 2,
        appraiser: appraiser(),
        status: VerdictStatus::Ok,
        privacy: if full {
            VerdictPrivacy::Sealed
        } else {
            VerdictPrivacy::Open
        },
        open: (!full).then_some(open),
        sealed: full.then(|| SealedBody {
            commitment: h(10),
            shown: vec![],
            outcome: Outcome::Deal,
            price: 400_000_000,
            proof: vec![1, 2, 3],
        }),
        delivery_commitment: full.then(|| h(11)),
        cert_hash: h(12),
        room_key: h(13),
        nonce: [14; 16],
        t_start: 100,
        t_end: 130,
    }
}

pub fn measurement(full: bool) -> Measurement {
    Measurement {
        mrtd: [1; 48],
        rtmr0: [2; 48],
        rtmr1: [3; 48],
        rtmr2: [4; 48],
        compose_hash: h(5),
        key_provider_digest: [6; 48],
        gpu_policy_hash: full.then(|| h(7)),
    }
}

pub fn certificate(full: bool) -> ForgetCertificateV1 {
    ForgetCertificateV1 {
        domain: ForgetCertificateV1::DOMAIN,
        chain_id: "testnet".into(),
        clearing: "clearing.marginal-demo.testnet".into(),
        keypolicy: "keypolicy.marginal-demo.testnet".into(),
        job_id: 11,
        job_commitment: h(9),
        listing_id: 3,
        listing_version: 2,
        kind: JobKind::Appraisal,
        scope: if full {
            vec![Scope::BuyerContext, Scope::GoodPlaintext]
        } else {
            vec![Scope::BuyerContext]
        },
        input_commitments: vec![h(20), h(21)],
        room_key: h(13),
        measurement: measurement(full),
        ppid_hash: h(22),
        attestation_ref: h(23),
        attestation_mode: if full {
            AttestationMode::OnChainDcap
        } else {
            AttestationMode::Simulated
        },
        policy_version: 4,
        key_ids_destroyed: if full { vec![h(24)] } else { vec![] },
        egress_summary: vec![h(25), h(26)],
        t_start: 100,
        t_end: 130,
        outcome: Outcome::Deal,
        non_persistence_basis: NP_PROCESS_EXIT | NP_TEE_MEMORY,
    }
}

pub fn delivery(entries: usize) -> DeliveryV1 {
    DeliveryV1 {
        eph_pk: h(30),
        entries: (0..entries as u8)
            .map(|i| DeliveryEntry {
                recipient: h(40 + i),
                ciphertext: vec![i; 24 + usize::from(i)],
            })
            .collect(),
    }
}

pub fn audit_entry(seq: u64) -> AuditEntry {
    AuditEntry {
        seq,
        height: 1_000 + seq,
        kind: AuditKind::JobRequested,
        subject_id: 11,
        payload_hash: h(50),
    }
}

/// One named change to one field.
pub type Edit<T> = (&'static str, fn(&mut T));

/// A digest must commit to every field: each edit must change `base`, change its digest, and give a
/// digest no other edit gives.
pub fn assert_every_edit_changes_the_digest<
    T: Clone + PartialEq + Debug,
    D: Eq + std::hash::Hash,
>(
    base: &T,
    edits: &[Edit<T>],
    digest: impl Fn(&T) -> D,
) {
    let mut seen = std::collections::HashSet::from([digest(base)]);
    for (name, edit) in edits {
        let mut changed = base.clone();
        edit(&mut changed);
        assert_ne!(&changed, base, "{name}: the edit did nothing");
        assert!(
            seen.insert(digest(&changed)),
            "{name} is not committed to by the digest"
        );
    }
}

// ---------------------------------------------------------------------------------------------
// Attestation

/// A fixed "now" (Unix seconds) for attestation tests.
pub const NOW: u64 = 1_794_000_000;

/// Directory of the committed fixtures, from any crate under `crates/`.
pub fn fixture(name: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

/// The real reply of the live testnet verifier for a real quote (see `tests/verifier.rs`).
pub fn real_reply_bytes() -> Vec<u8> {
    std::fs::read(fixture("tee-verifier-reply.borsh")).unwrap()
}

/// The real dstack RTMR3 events of that quote, from near/mpc's test assets.
pub fn real_events() -> Vec<Rtmr3Event> {
    let file: serde_json::Value =
        serde_json::from_slice(&std::fs::read(fixture("dstack-rtmr3-events.json")).unwrap())
            .unwrap();
    file["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| Rtmr3Event {
            event_type: e["event_type"].as_u64().unwrap() as u32,
            name: e["event"].as_str().unwrap().into(),
            payload: hex::decode(e["event_payload"].as_str().unwrap()).unwrap(),
        })
        .collect()
}

pub fn binding() -> RoomBinding {
    RoomBinding {
        chain_id: "testnet".into(),
        keypolicy: "keypolicy.marginal-demo.testnet".into(),
        sign_pk: h(1),
        box_pk: h(2),
        nonce: h(3),
    }
}

pub fn event(name: &str, payload: &[u8]) -> Rtmr3Event {
    Rtmr3Event {
        event_type: DSTACK_EVENT_TYPE,
        name: name.into(),
        payload: payload.to_vec(),
    }
}

/// The compose hash of the sample room.
pub const COMPOSE: [u8; 32] = [0xc0; 32];

/// An event log that meets the room policy, in dstack's order.
pub fn valid_log() -> Vec<Rtmr3Event> {
    vec![
        event("system-preparing", b""),
        event("app-id", &COMPOSE[..20]),
        event("compose-hash", &COMPOSE),
        event("instance-id", b""),
        event("boot-mr-done", b""),
        event("key-provider", KEY_PROVIDER_NONE),
        event("storage-fs", b"zfs"),
        event("storage-encrypted", b"1"),
        event("system-ready", b""),
    ]
}

pub fn td10(report_data: [u8; 64], rtmr3: [u8; 48]) -> TDReport10 {
    TDReport10 {
        tee_tcb_svn: [1; 16],
        mr_seam: [2; 48],
        mr_signer_seam: [3; 48],
        seam_attributes: [4; 8],
        td_attributes: [0, 0, 0, 0x10, 0, 0, 0, 0],
        xfam: [6; 8],
        mr_td: [7; 48],
        mr_config_id: [8; 48],
        mr_owner: [9; 48],
        mr_owner_config: [10; 48],
        rt_mr0: [11; 48],
        rt_mr1: [12; 48],
        rt_mr2: [13; 48],
        rt_mr3: rtmr3,
        report_data,
    }
}

pub fn up_to_date() -> TcbStatusWithAdvisory {
    TcbStatusWithAdvisory {
        status: TcbStatus::UpToDate,
        advisory_ids: vec![],
    }
}

/// A verified report for a room with these events and report data.
pub fn verified_for(events: &[Rtmr3Event], report_data: [u8; 64]) -> VerificationResult {
    VerificationResult::Verified {
        report: VerifiedReport {
            status: "UpToDate".into(),
            advisory_ids: vec![],
            report: Report::TD10(td10(
                report_data,
                marginal_core::attest::replay_rtmr3(events).unwrap(),
            )),
            ppid: vec![0xab; 16],
            qe_status: up_to_date(),
            platform_status: up_to_date(),
        },
        collateral_dates: CollateralDates {
            earliest_issue_date: 1,
            latest_issue_date: NOW - 86_400,
            earliest_expiration_date: NOW + 10 * 86_400,
            qe_iden_earliest_issue_date: 1,
            qe_iden_latest_issue_date: NOW - 86_400,
            qe_iden_earliest_expiration_date: NOW + 10 * 86_400,
        },
    }
}

// ---------------------------------------------------------------------------------------------
// Key release

pub fn seller() -> AccountId {
    "seller.testnet".into()
}

pub fn key_request() -> KeyRequest {
    KeyRequest {
        chain_id: "testnet".into(),
        keypolicy: "keypolicy.marginal-demo.testnet".into(),
        room_key: h(1),
        job_id: 11,
        path: listing_path(&seller(), 3, 1),
        app_key: AppKey {
            pk1: [5; 48],
            pk2: [6; 96],
        },
        job_commitment: h(7),
        value_class: ValueClass::M,
    }
}

// ---------------------------------------------------------------------------------------------
// Listings (E4)

/// A schema that passes every check: two components, one shown field, an 11-level judge scale.
pub fn schema() -> OutputSchema {
    OutputSchema {
        fields: vec![FieldSpec {
            id: 1,
            name: "sector".into(),
            alphabet: 8,
        }],
        component_alphabets: vec![16, 16],
        judge_scale: 11,
    }
}

pub fn provisioning() -> ProvisioningV1 {
    ProvisioningV1 {
        domain: ProvisioningV1::DOMAIN,
        chain_id: "testnet".into(),
        clearing: "clearing.marginal-demo.testnet".into(),
        job_id: 4,
        listing_id: 3,
        listing_version: 1,
        room_key: h(1),
        pk_l: h(9),
        cert_hash: h(8),
    }
}

pub fn screening(result: ScreeningResult) -> ScreeningV1 {
    ScreeningV1 {
        domain: ScreeningV1::DOMAIN,
        chain_id: "testnet".into(),
        clearing: "clearing.marginal-demo.testnet".into(),
        job_id: 5,
        listing_id: 3,
        listing_version: 1,
        room_key: h(1),
        result,
        cert_hash: h(8),
    }
}

/// A listing a seller could create: knowledge, posted price, one copy.
pub fn spec() -> ListingSpec {
    ListingSpec {
        asset_class: AssetClass::Knowledge,
        category: CategoryId(1),
        licence_class: 1,
        key_mode: KeyReleaseMode::Ckd,
        appraiser: AppraiserRef {
            id: "knowledge".into(),
            version: 1,
            formula_id: FormulaId::KnowledgeV1,
        },
        schema: schema(),
        rule: PricingRule::Posted { ask: 400_000_000 },
        token: "musdc.marginal-demo.testnet".into(),
        max_copies: 1,
        l_floor_bps: 1_000,
        external_judges_allowed: true,
        privacy_default: VerdictPrivacy::Open,
        disclosure_policy: DisclosurePolicy::DisputeOnly,
        leakage: LeakageAccount {
            budget_mbits: 100_000,
            reserved_mbits: 0,
            spent_mbits: 0,
            price_per_bit: 1_000,
            sub_budget_mbits_per_identity: 0,
            verified_reserve_bps: 0,
        },
        value_class: ValueClass::M,
        eligibility: Eligibility {
            min_tier: Tier::Id1,
            min_anonymity_set: 0,
            nullifier_gated: false,
            cooling_blocks: 0,
        },
        challenge_window_blocks: 100,
        delivery_deadline_blocks: 200,
        dossier_hash: None,
    }
}

/// A nullifier credential the compliance service could have issued.
pub fn nullifier() -> NullifierCredential {
    NullifierCredential {
        domain: NullifierCredential::DOMAIN,
        chain_id: "testnet".into(),
        clearing: "clearing.marginal-demo.testnet".into(),
        subject: "buyer.testnet".into(),
        listing_id: 3,
        epoch: 7,
        nullifier: h(4),
        expiry_height: 2_000,
    }
}
