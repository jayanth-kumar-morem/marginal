//! E2.1: every §3.3 type round-trips through Borsh, enum discriminants are pinned (they are the
//! wire format), and the four stored records decode strictly.

use core::fmt::Debug;
use marginal_core::*;
use proptest::prelude::*;

mod common;
use common::{h, pin, rt};

#[test]
fn enum_discriminants_are_pinned() {
    use AssetClass::*;
    pin(vec![Knowledge, Dataset, EvalSet, Model, Exploit, Signal]);
    pin(vec![
        ValueClass::L,
        ValueClass::M,
        ValueClass::H,
        ValueClass::X,
    ]);
    pin(vec![KeyReleaseMode::Ckd, KeyReleaseMode::RoomSealed]);
    pin(vec![
        AttestationMode::OnChainDcap,
        AttestationMode::AttesterQuorum,
        AttestationMode::Simulated,
    ]);
    pin(vec![VerdictPrivacy::Open, VerdictPrivacy::Sealed]);
    pin(vec![DisplayMode::Blind, DisplayMode::Fields(vec![1, 2])]);
    pin(vec![
        DisclosurePolicy::DisputeOnly,
        DisclosurePolicy::AuditorEscrow,
        DisclosurePolicy::DelayedAggregate,
        DisclosurePolicy::PublishWithBuyerConsent,
    ]);
    pin(vec![Tier::Id0, Tier::Id1, Tier::Id2, Tier::Id3]);
    pin(vec![
        PricingRule::Posted { ask: 1 },
        PricingRule::ValueIndexed {
            p_min: 1,
            p_full: 2,
            price_quantum_bps: 100,
        },
        PricingRule::SurplusSplitLegacy { ask: 1 },
        PricingRule::SealedRound {
            k: 3,
            reserve: 4,
            close_height: 5,
        },
        PricingRule::Tender { tender_id: 6 },
    ]);
    pin(vec![
        FormulaId::KnowledgeV1,
        FormulaId::DatasetLiteV0,
        FormulaId::DatasetV1,
    ]);
    {
        use ListingStatus::*;
        pin(vec![
            Draft,
            Provisioning,
            Screening,
            Held,
            Active,
            Paused,
            Exhausted,
            SoldOut,
            Closed,
            Archived,
        ]);
    }
    pin(vec![
        PayoutRoute::NearAccount("a.near".into()),
        PayoutRoute::IntentsAccount("a.near".into()),
        PayoutRoute::ChainSig {
            chain: "base".into(),
            address: "0x1".into(),
        },
        PayoutRoute::DryQuote {
            chain: "sol".into(),
            asset: "usdc".into(),
            address: "x".into(),
        },
    ]);
    {
        use PayoutStatus::*;
        pin(vec![
            Held,
            Released,
            Pending,
            Completed,
            Claimable,
            Blocked {
                screening_ref: h(9),
            },
        ]);
    }
    {
        use ContextKind::*;
        pin(vec![Notes, DataIndex, EvalSet, Model, RestrictedList]);
    }
    {
        use JobKind::*;
        pin(vec![
            Appraisal,
            Screening,
            Provisioning,
            Redelivery,
            Dispute,
            Session,
        ]);
    }
    pin(vec![
        BuyerRef::Account("b.near".into()),
        BuyerRef::Nullifier(h(1)),
    ]);
    pin(vec![
        RefundRoute::Balance,
        RefundRoute::NearAccount("a.near".into()),
        RefundRoute::IntentsAccount("a.near".into()),
    ]);
    {
        use JobState::*;
        pin(vec![
            PendingApproval,
            Requested,
            Assigned,
            Computing,
            Verdicted,
            NoDeal,
            Restricted,
            InputRejected,
            Deal,
            Final,
            DeliveryFailure,
            Timeout,
            Revoked,
            Fault,
        ]);
    }
    {
        use Outcome::*;
        pin(vec![
            Deal,
            NoDeal,
            Restricted,
            InputRejected,
            Timeout,
            Fault,
            Revoked,
            DeliveryFailure,
        ]);
    }
}

// ---------------------------------------------------------------------------------------------
// Samples. `full` sets every Option and uses data-carrying variants; `bare` unsets and simplifies.

fn schema() -> OutputSchema {
    OutputSchema {
        fields: vec![FieldSpec {
            id: 0,
            name: "novelty".into(),
            alphabet: 11,
        }],
        component_alphabets: vec![21, 21],
        judge_scale: 11,
    }
}

fn listing(full: bool) -> Listing {
    Listing {
        v: LISTING_V,
        id: u64::MAX,
        seller: "seller.testnet".into(),
        version: 3,
        status: ListingStatus::Active,
        asset_class: AssetClass::Knowledge,
        category: CategoryId(7),
        licence_class: 2,
        good_commitment: h(1),
        ciphertext: BlobRef {
            uri_hash: h(2),
            sha256: h(3),
            size_class: 4,
        },
        key_mode: KeyReleaseMode::Ckd,
        key_path_hash: h(4),
        pk_l: full.then(|| h(5)),
        appraiser: AppraiserRef {
            id: "knowledge".into(),
            version: 1,
            formula_id: FormulaId::KnowledgeV1,
        },
        schema: schema(),
        schema_hash: h(6),
        rule: if full {
            PricingRule::ValueIndexed {
                p_min: 1,
                p_full: u128::MAX,
                price_quantum_bps: 500,
            }
        } else {
            PricingRule::Posted { ask: 400_000_000 }
        },
        token: "musdc.testnet".into(),
        max_copies: 5,
        copies: 1,
        l_floor_bps: 5_000,
        external_judges_allowed: full,
        privacy_default: VerdictPrivacy::Open,
        disclosure_policy: DisclosurePolicy::DisputeOnly,
        leakage: LeakageAccount {
            budget_mbits: 32_000,
            reserved_mbits: 1_000,
            spent_mbits: 16_706,
            price_per_bit: u128::MAX,
            sub_budget_mbits_per_identity: 0,
            verified_reserve_bps: 2_500,
        },
        value_class: ValueClass::M,
        eligibility: Eligibility {
            min_tier: Tier::Id1,
            min_anonymity_set: 5,
            nullifier_gated: full,
            cooling_blocks: 0,
        },
        challenge_window_blocks: 600,
        delivery_deadline_blocks: 1_200,
        publish_height: full.then_some(123_456),
        payout: if full {
            PayoutRoute::DryQuote {
                chain: "sol".into(),
                asset: "usdc".into(),
                address: "9xQ".into(),
            }
        } else {
            PayoutRoute::NearAccount("seller.testnet".into())
        },
        dossier_hash: full.then(|| h(7)),
    }
}

fn snapshot(full: bool) -> Snapshot {
    Snapshot {
        v: SNAPSHOT_V,
        id: 9,
        owner: "buyer.testnet".into(),
        kind: if full {
            ContextKind::RestrictedList
        } else {
            ContextKind::Notes
        },
        content_hash: h(8),
        blob: BlobRef {
            uri_hash: h(9),
            sha256: h(10),
            size_class: 2,
        },
        anchor_height: 77,
        standing: full,
    }
}

fn job(full: bool) -> Job {
    Job {
        v: JOB_V,
        id: 11,
        kind: JobKind::Appraisal,
        listing_id: 1,
        listing_version: 3,
        snapshot_id: full.then_some(9),
        buyer: Some(if full {
            BuyerRef::Nullifier(h(12))
        } else {
            BuyerRef::Account("buyer.testnet".into())
        }),
        token: "musdc.testnet".into(),
        buckets: Buckets {
            budget: 1_000_000_000,
            compute: 1,
            comp_reserved: 2,
            fee_reserved: 3,
            storage: 4,
            held: 5,
            refund: u128::MAX,
        },
        mode: if full {
            DisplayMode::Fields(vec![0, 2])
        } else {
            DisplayMode::Blind
        },
        privacy: VerdictPrivacy::Sealed,
        max_debit_mbits: 1_000,
        job_commitment: h(13),
        delivery_pk: h(14),
        compliance_pk: full.then(|| h(15)),
        context_auth_pk: h(16),
        refund_to: if full {
            RefundRoute::IntentsAccount("0xabc".into())
        } else {
            RefundRoute::Balance
        },
        assigned: if full { vec![h(17), h(18)] } else { vec![] },
        requested_height: 100,
        deadline_height: 400,
        delivery_deadline_height: full.then_some(900),
        fast_yield: full.then(|| h(19)),
        state: JobState::Computing,
        locked: full,
    }
}

fn settlement(full: bool) -> SettlementRecord {
    SettlementRecord {
        v: SETTLEMENT_V,
        job_id: 11,
        outcome: Outcome::Deal,
        privacy: if full {
            VerdictPrivacy::Open
        } else {
            VerdictPrivacy::Sealed
        },
        value: full.then_some(720_000_000),
        components_commitment: (!full).then(|| h(20)),
        price: 400_000_000,
        fees: FeeSplit {
            compute: 1,
            treasury: 2,
            operator_pool: 3,
            assurance_pool: 4,
        },
        refund: 5,
        leakage_debit_mbits: 16_706,
        leakage_comp: 6,
        held: 400_000_000,
        held_until: full.then_some(5_000),
        delivery_commitment: full.then(|| h(21)),
        delivery_receipt: full.then(|| h(22)),
        cert_hashes: if full { vec![h(23), h(24)] } else { vec![] },
        simulated_flags: if full {
            SIM_ATTESTATION | SIM_JUDGE | SIM_SETTLEMENT
        } else {
            0
        },
        audit_seq: 42,
        audit_head: h(25),
        payout: if full {
            PayoutStatus::Blocked {
                screening_ref: h(26),
            }
        } else {
            PayoutStatus::Held
        },
    }
}

/// Round trip through `Record`, and every way a stored record can be damaged.
fn check_record<T: Record + PartialEq + Debug>(value: &T) {
    let bytes = value.encode();
    assert_eq!(bytes[0], T::VERSION, "the version byte comes first");
    assert_eq!(&T::decode(&bytes).unwrap(), value);

    let mut other = bytes.clone();
    other[0] = T::VERSION.wrapping_add(1);
    assert_eq!(T::decode(&other), Err(CoreError::Version));
    assert_eq!(T::decode(&[]), Err(CoreError::Decode));

    let mut trailing = bytes.clone();
    trailing.push(0);
    assert_eq!(
        T::decode(&trailing),
        Err(CoreError::Decode),
        "trailing bytes"
    );

    for cut in 1..bytes.len() {
        assert_eq!(
            T::decode(&bytes[..cut]),
            Err(CoreError::Decode),
            "truncated to {cut} of {} bytes",
            bytes.len()
        );
    }
}

#[test]
fn listing_round_trips() {
    for full in [false, true] {
        check_record(&listing(full));
    }
}

#[test]
fn snapshot_round_trips() {
    for full in [false, true] {
        check_record(&snapshot(full));
    }
}

#[test]
fn job_round_trips() {
    for full in [false, true] {
        check_record(&job(full));
    }
}

#[test]
fn settlement_round_trips() {
    for full in [false, true] {
        check_record(&settlement(full));
    }
}

#[test]
fn nested_types_round_trip() {
    rt(&schema());
    rt(&FormulaParams {
        delta_star_bps: 500,
    });
    rt(&Buckets::default());
    rt(&FeeSplit::default());
    rt(&Eligibility {
        min_tier: Tier::Id3,
        min_anonymity_set: u32::MAX,
        nullifier_gated: true,
        cooling_blocks: u64::MAX,
    });
    rt(&CategoryId(u16::MAX));
}

/// A golden encoding: the layout of one record, byte by byte. If this fails, a Borsh layout
/// changed. Bump `SNAPSHOT_V` and `CORE_VERSION`, and write the migration, before updating it.
#[test]
fn snapshot_golden_layout() {
    let s = Snapshot {
        v: SNAPSHOT_V,
        id: 7,
        owner: "a.near".into(),
        kind: ContextKind::DataIndex,
        content_hash: h(1),
        blob: BlobRef {
            uri_hash: h(2),
            sha256: h(3),
            size_class: 4,
        },
        anchor_height: 99,
        standing: true,
    };
    let mut want = vec![SNAPSHOT_V];
    want.extend(7u64.to_le_bytes());
    want.extend(6u32.to_le_bytes());
    want.extend(b"a.near");
    want.push(1); // DataIndex
    want.extend(h(1));
    want.extend(h(2));
    want.extend(h(3));
    want.push(4);
    want.extend(99u64.to_le_bytes());
    want.push(1);
    assert_eq!(s.encode(), want);
}

#[test]
fn simulated_flag_bits_are_distinct() {
    assert_eq!([SIM_ATTESTATION, SIM_JUDGE, SIM_SETTLEMENT], [1, 2, 4]);
}

// Property tests over the numeric extremes the samples cannot enumerate.
proptest! {
    #[test]
    fn buckets_round_trip(a in any::<u128>(), b in any::<u128>(), c in any::<u128>(), d in any::<u128>(),
                          e in any::<u128>(), f in any::<u128>(), g in any::<u128>()) {
        rt(&Buckets { budget: a, compute: b, comp_reserved: c, fee_reserved: d, storage: e, held: f, refund: g });
    }

    #[test]
    fn leakage_account_round_trips(a in any::<u64>(), b in any::<u64>(), c in any::<u64>(), p in any::<u128>(),
                                   s in any::<u64>(), r in any::<u32>()) {
        rt(&LeakageAccount { budget_mbits: a, reserved_mbits: b, spent_mbits: c, price_per_bit: p,
                             sub_budget_mbits_per_identity: s, verified_reserve_bps: r });
    }

    #[test]
    fn snapshot_round_trips_for_any_owner(id in any::<u64>(), owner in ".{0,80}", height in any::<u64>(), standing in any::<bool>()) {
        let mut s = snapshot(false);
        s.id = id;
        s.owner = owner;
        s.anchor_height = height;
        s.standing = standing;
        check_record(&s);
    }

    #[test]
    fn pricing_rule_round_trips(ask in any::<u128>(), lo in any::<u128>(), hi in any::<u128>(), q in any::<u32>(),
                                k in any::<u16>(), height in any::<u64>(), which in 0..5u8) {
        let rule = match which {
            0 => PricingRule::Posted { ask },
            1 => PricingRule::ValueIndexed { p_min: lo, p_full: hi, price_quantum_bps: q },
            2 => PricingRule::SurplusSplitLegacy { ask },
            3 => PricingRule::SealedRound { k, reserve: ask, close_height: height },
            _ => PricingRule::Tender { tender_id: height },
        };
        rt(&rule);
    }
}
