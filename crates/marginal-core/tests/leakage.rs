//! E2.2: the millibit table is exact, and `max_debit` gives the numbers the demo relies on
//! (Blind + Sealed = 1,000 mbits, Open = 16.7 bits).

use marginal_core::leakage::{max_debit, mbits, MAX_ALPHABET, OUTCOME_MBITS};
use marginal_core::*;
use num_bigint::BigUint;
use proptest::prelude::*;

/// Every entry: `k` is the smallest integer with `2^k >= n^1000`, checked with big integers.
#[test]
fn table_is_exact_for_every_alphabet() {
    for n in 1..=MAX_ALPHABET {
        let k = mbits(n).unwrap();
        let power = BigUint::from(n).pow(1000);
        assert!(BigUint::from(1u8) << k >= power, "n={n}: 2^{k} < n^1000");
        if k > 0 {
            assert!(
                BigUint::from(1u8) << (k - 1) < power,
                "n={n}: 2^{} already >= n^1000",
                k - 1
            );
        }
    }
}

#[test]
fn table_edges() {
    assert_eq!(mbits(1), Ok(0));
    assert_eq!(mbits(2), Ok(1_000));
    assert_eq!(mbits(3), Ok(1_585));
    assert_eq!(mbits(11), Ok(3_460));
    assert_eq!(mbits(21), Ok(4_393));
    assert_eq!(mbits(4096), Ok(12_000));
    for bad in [0, 4097, u16::MAX] {
        assert_eq!(mbits(bad), Err(CoreError::SchemaInvalid), "n={bad}");
    }
    assert_eq!(MAX_ALPHABET, 4096);
}

/// The knowledge appraiser's schema (SDD §3.15.1): two components at 21 levels, judges on 0..=10.
fn knowledge_schema() -> OutputSchema {
    OutputSchema {
        fields: vec![],
        component_alphabets: vec![21, 21],
        judge_scale: 11,
    }
}

const R1: PricingRule = PricingRule::Posted { ask: 400_000_000 };

#[test]
fn blind_sealed_debits_exactly_one_bit() {
    let d = max_debit(
        &knowledge_schema(),
        &DisplayMode::Blind,
        &R1,
        VerdictPrivacy::Sealed,
        2,
    );
    assert_eq!(d, Ok(1_000));
    assert_eq!(d, Ok(OUTCOME_MBITS));
    // Sealed never reads the schema, so even a degenerate one costs one bit.
    let odd = OutputSchema {
        fields: vec![],
        component_alphabets: vec![0, 9999],
        judge_scale: 0,
    };
    assert_eq!(
        max_debit(&odd, &DisplayMode::Blind, &R1, VerdictPrivacy::Sealed, 9),
        Ok(1_000)
    );
}

#[test]
fn blind_open_is_about_16_7_bits() {
    // 1 + 2*log2(21) + 2*log2(11) = 16.706 bits, with two judges.
    let d = max_debit(
        &knowledge_schema(),
        &DisplayMode::Blind,
        &R1,
        VerdictPrivacy::Open,
        2,
    )
    .unwrap();
    assert_eq!(d, 1_000 + 2 * 4_393 + 2 * 3_460);
    assert_eq!(d, 16_706);
    assert!((16_650..16_750).contains(&d), "about 16.7 bits");
}

#[test]
fn open_with_no_judges_counts_only_the_components() {
    let d = max_debit(
        &knowledge_schema(),
        &DisplayMode::Blind,
        &R1,
        VerdictPrivacy::Open,
        0,
    );
    assert_eq!(d, Ok(1_000 + 2 * 4_393));
}

#[test]
fn malformed_schemas_are_refused_in_open_mode() {
    let bad = OutputSchema {
        fields: vec![],
        component_alphabets: vec![21, 0],
        judge_scale: 11,
    };
    assert_eq!(
        max_debit(&bad, &DisplayMode::Blind, &R1, VerdictPrivacy::Open, 1),
        Err(CoreError::SchemaInvalid)
    );
    let bad_scale = OutputSchema {
        fields: vec![],
        component_alphabets: vec![21],
        judge_scale: 5000,
    };
    assert_eq!(
        max_debit(
            &bad_scale,
            &DisplayMode::Blind,
            &R1,
            VerdictPrivacy::Open,
            1
        ),
        Err(CoreError::SchemaInvalid)
    );
}

#[test]
fn features_not_built_are_refused_not_undercounted() {
    let s = knowledge_schema();
    let fields = DisplayMode::Fields(vec![0]);
    assert_eq!(
        max_debit(&s, &fields, &R1, VerdictPrivacy::Sealed, 2),
        Err(CoreError::DisplayDisabled)
    );
    let r2 = PricingRule::ValueIndexed {
        p_min: 1,
        p_full: 2,
        price_quantum_bps: 100,
    };
    assert_eq!(
        max_debit(&s, &DisplayMode::Blind, &r2, VerdictPrivacy::Sealed, 2),
        Err(CoreError::RuleDisabled)
    );
}

proptest! {
    /// For any valid schema: Sealed is one bit, Open is at least that, and each extra judge adds
    /// exactly one judge-scale's worth.
    #[test]
    fn open_is_the_sum_of_its_parts(alphabets in prop::collection::vec(1u16..=4096, 0..6),
                                    scale in 1u16..=4096, judges in 0u8..=5) {
        let s = OutputSchema { fields: vec![], component_alphabets: alphabets.clone(), judge_scale: scale };
        let sealed = max_debit(&s, &DisplayMode::Blind, &R1, VerdictPrivacy::Sealed, judges).unwrap();
        let open = max_debit(&s, &DisplayMode::Blind, &R1, VerdictPrivacy::Open, judges).unwrap();
        let comps: u64 = alphabets.iter().map(|a| mbits(*a).unwrap()).sum();
        prop_assert_eq!(sealed, 1_000);
        prop_assert_eq!(open, 1_000 + comps + u64::from(judges) * mbits(scale).unwrap());
        prop_assert!(open >= sealed);
    }

    /// The table is monotone: a bigger alphabet never costs fewer bits.
    #[test]
    fn mbits_is_monotone(n in 1u16..4096) {
        prop_assert!(mbits(n).unwrap() <= mbits(n + 1).unwrap());
    }
}
