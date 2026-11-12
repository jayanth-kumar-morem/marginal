//! Sample values shared by the integration tests. Each builder takes `full`: `true` sets every
//! optional field and uses data-carrying variants, `false` unsets and simplifies.
#![allow(dead_code)]

use borsh::{BorshDeserialize, BorshSerialize};
use core::fmt::Debug;
use marginal_core::audit::{AuditEntry, AuditKind};
use marginal_core::certificate::{
    ForgetCertificateV1, Measurement, Scope, NP_PROCESS_EXIT, NP_TEE_MEMORY,
};
use marginal_core::commit::JobCore;
use marginal_core::delivery::{DeliveryEntry, DeliveryV1};
use marginal_core::verdict::{
    JudgeFactor, ModelProof, OpenBody, SealedBody, ShownField, VerdictStatus, VerdictV1,
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
pub fn assert_every_edit_changes_the_digest<T: Clone + PartialEq + Debug>(
    base: &T,
    edits: &[Edit<T>],
    digest: impl Fn(&T) -> [u8; 32],
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
