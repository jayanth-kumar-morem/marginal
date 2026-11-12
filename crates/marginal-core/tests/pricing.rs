//! E2.2: pricing arithmetic and the properties the SDD builds on: AC-2 (monotone in judge
//! factors), AC-3 (`ask <= price <= budget`), AC-5 (R1 price independent of budget) and AC-41
//! (a judge can only discount). Default case count is small for speed; `make props` runs
//! `PROPTEST_CASES=1000000` in release mode, the SPEC's AC-2 bar.

use marginal_core::pricing::*;
use marginal_core::*;
use proptest::prelude::*;

const USDC: u128 = 1_000_000;
const KNOWLEDGE: FormulaId = FormulaId::KnowledgeV1;
const NO_PARAMS: FormulaParams = FormulaParams { delta_star_bps: 0 };

// ---------------------------------------------------------------------------------------------
// Examples

#[test]
fn judgement_factor_cases() {
    assert_eq!(judgement_factor(3_000, &[]), BPS, "no judges: no discount");
    assert_eq!(
        judgement_factor(0, &[9_000, 7_000, 8_000]),
        7_000,
        "the lowest factor wins"
    );
    assert_eq!(
        judgement_factor(5_000, &[2_000]),
        5_000,
        "the floor wins over a lower factor"
    );
    assert_eq!(
        judgement_factor(5_000, &[0]),
        5_000,
        "a parse failure resolves to the floor"
    );
    assert_eq!(judgement_factor(0, &[0]), 0);
    assert_eq!(
        judgement_factor(0, &[u32::MAX, 40_000]),
        BPS,
        "factors are clamped to 100%"
    );
    assert_eq!(
        judgement_factor(u32::MAX, &[BPS]),
        BPS,
        "a floor above 100% is clamped"
    );
}

#[test]
fn knowledge_ceiling() {
    let d = |c: &[u32]| ceiling(KNOWLEDGE, c, &NO_PARAMS);
    assert_eq!(d(&[10_000, 10_000]), Ok(10_000));
    assert_eq!(d(&[5_000, 5_000]), Ok(2_500));
    assert_eq!(d(&[8_000, 10_000]), Ok(8_000));
    assert_eq!(d(&[0, 10_000]), Ok(0));
    assert_eq!(d(&[3, 3]), Ok(0), "rounds down");
    assert_eq!(
        d(&[10_001, 10_000]),
        Err(CoreError::Schema),
        "component above 100%"
    );
    assert_eq!(d(&[10_000]), Err(CoreError::Schema), "too few components");
    assert_eq!(d(&[1, 2, 3]), Err(CoreError::Schema), "too many components");
    assert_eq!(d(&[]), Err(CoreError::Schema));
}

#[test]
fn dataset_lite_ceiling() {
    let p = FormulaParams {
        delta_star_bps: 500,
    };
    let d = |c: &[u32]| ceiling(FormulaId::DatasetLiteV0, c, &p);
    assert_eq!(
        d(&[250, 2_000]),
        Ok(4_000),
        "half the target gain, 20% overlap: 0.5 * 0.8"
    );
    assert_eq!(d(&[500, 0]), Ok(10_000), "full gain, no overlap");
    assert_eq!(
        d(&[9_000, 0]),
        Ok(10_000),
        "gain above the target is capped"
    );
    assert_eq!(d(&[0, 0]), Ok(0));
    assert_eq!(d(&[500, 10_000]), Ok(0), "complete overlap is worthless");
    assert_eq!(d(&[500]), Err(CoreError::Schema));
    // delta_star 0 behaves as 1 (it never divides by zero); any positive delta is full gain.
    assert_eq!(
        ceiling(FormulaId::DatasetLiteV0, &[1, 0], &NO_PARAMS),
        Ok(10_000)
    );
}

#[test]
fn formulas_not_built_are_refused() {
    assert_eq!(
        ceiling(FormulaId::DatasetV1, &[1, 2], &NO_PARAMS),
        Err(CoreError::FormulaDisabled)
    );
}

#[test]
fn measured_index_and_valuation() {
    // D = 0.8, judges 0.9 and 1.0, floor 0.5: L = 0.9, m = 0.72.
    let m = measured_index(
        KNOWLEDGE,
        &[8_000, 10_000],
        &NO_PARAMS,
        5_000,
        &[9_000, 10_000],
    )
    .unwrap();
    assert_eq!(m, 7_200);
    assert_eq!(valuation(1_000 * USDC, m), Ok(720 * USDC));
    assert_eq!(
        valuation(u128::MAX, BPS),
        Ok(u128::MAX),
        "no overflow at the extreme"
    );
    assert_eq!(valuation(1, 9_999), Ok(0), "rounds down");
    assert_eq!(
        valuation(1_000, BPS + 1),
        Err(CoreError::Schema),
        "m above 100% would exceed the budget"
    );
}

#[test]
fn posted_price_clears_exactly_at_the_ask() {
    let rule = PricingRule::Posted { ask: 400 * USDC };
    // Budget 1,000 USDC at m = 0.72 values the good at 720: a deal at the ask, not at the value.
    assert_eq!(
        apply_rule(&rule, 1_000 * USDC, 7_200),
        Ok(RuleOutcome::Deal { price: 400 * USDC })
    );
    // Boundary: V == ask clears, one unit less does not.
    assert_eq!(
        apply_rule(&rule, 400 * USDC, BPS),
        Ok(RuleOutcome::Deal { price: 400 * USDC })
    );
    assert_eq!(
        apply_rule(&rule, 400 * USDC - 1, BPS),
        Ok(RuleOutcome::NoDeal)
    );
    assert_eq!(
        apply_rule(&rule, 1_000 * USDC, 0),
        Ok(RuleOutcome::NoDeal),
        "worthless to this buyer"
    );
}

#[test]
fn rules_not_built_are_refused() {
    let refused = [
        PricingRule::ValueIndexed {
            p_min: 1,
            p_full: 2,
            price_quantum_bps: 100,
        },
        PricingRule::SurplusSplitLegacy { ask: 1 },
        PricingRule::SealedRound {
            k: 1,
            reserve: 1,
            close_height: 1,
        },
        PricingRule::Tender { tender_id: 1 },
    ];
    for r in refused {
        assert_eq!(
            apply_rule(&r, 1_000, 5_000),
            Err(CoreError::RuleDisabled),
            "{r:?}"
        );
    }
    assert_eq!(
        apply_rule(&PricingRule::Posted { ask: 0 }, 1_000, 5_000),
        Err(CoreError::RuleParams)
    );
}

// ---------------------------------------------------------------------------------------------
// Properties

fn formula() -> impl Strategy<Value = (FormulaId, FormulaParams)> {
    prop_oneof![
        Just((FormulaId::KnowledgeV1, NO_PARAMS)),
        (0u32..=20_000).prop_map(|d| (
            FormulaId::DatasetLiteV0,
            FormulaParams { delta_star_bps: d }
        )),
    ]
}

fn components() -> impl Strategy<Value = Vec<u32>> {
    prop::collection::vec(0u32..=BPS, 2)
}

/// Judge factors, including ones above 100% and zeros (parse failures).
fn factors_between(min: usize, max: usize) -> impl Strategy<Value = Vec<u32>> {
    prop::collection::vec(
        prop_oneof![3 => 0u32..=BPS, 1 => Just(0u32), 1 => Just(BPS), 1 => any::<u32>()],
        min..=max,
    )
}

fn factors() -> impl Strategy<Value = Vec<u32>> {
    factors_between(0, 4)
}

fn floor() -> impl Strategy<Value = u32> {
    prop_oneof![3 => 0u32..=BPS, 1 => Just(0u32), 1 => Just(BPS), 1 => any::<u32>()]
}

fn ask() -> impl Strategy<Value = u128> {
    prop_oneof![3 => 1u128..=1_000_000_000_000, 1 => 1u128..=u128::MAX]
}

fn budget() -> impl Strategy<Value = u128> {
    prop_oneof![3 => 0u128..=1_000_000_000_000, 1 => any::<u128>()]
}

/// Deal beats no deal; among deals, a higher price is higher.
fn rank(o: RuleOutcome) -> (bool, u128) {
    match o {
        RuleOutcome::Deal { price } => (true, price),
        RuleOutcome::NoDeal => (false, 0),
    }
}

proptest! {
    /// AC-2: raising any judge factor never lowers the index, the outcome or the price.
    #[test]
    fn ac2_outcome_and_price_are_non_decreasing_in_every_factor(
        (f, p) in formula(), c in components(), l_floor in floor(), l in factors_between(1, 4),
        which in any::<prop::sample::Index>(), raised in any::<u32>(),
        b in budget(), a in ask(),
    ) {
        let i = which.index(l.len());
        let mut higher = l.clone();
        higher[i] = l[i].max(raised);

        let m0 = measured_index(f, &c, &p, l_floor, &l).unwrap();
        let m1 = measured_index(f, &c, &p, l_floor, &higher).unwrap();
        prop_assert!(m1 >= m0, "index fell: {m0} -> {m1}");

        let rule = PricingRule::Posted { ask: a };
        let o0 = apply_rule(&rule, b, m0).unwrap();
        let o1 = apply_rule(&rule, b, m1).unwrap();
        prop_assert!(rank(o1) >= rank(o0), "{o0:?} -> {o1:?}");
    }

    /// AC-3: a deal never costs more than the budget or less than the ask.
    #[test]
    fn ac3_price_is_between_ask_and_budget(m in 0u32..=BPS, b in budget(), a in ask()) {
        match apply_rule(&PricingRule::Posted { ask: a }, b, m).unwrap() {
            RuleOutcome::Deal { price } => {
                prop_assert!(price <= b, "price {price} above budget {b}");
                prop_assert!(price >= a, "price {price} below ask {a}");
            }
            RuleOutcome::NoDeal => prop_assert!(valuation(b, m).unwrap() < a),
        }
        prop_assert!(valuation(b, m).unwrap() <= b);
    }

    /// AC-5: under R1 the budget decides only whether the deal clears, never what it costs.
    #[test]
    fn ac5_posted_price_does_not_depend_on_the_budget(m in 0u32..=BPS, b1 in budget(), b2 in budget(), a in ask()) {
        let (lo, hi) = (b1.min(b2), b1.max(b2));
        let rule = PricingRule::Posted { ask: a };
        let (o_lo, o_hi) = (apply_rule(&rule, lo, m).unwrap(), apply_rule(&rule, hi, m).unwrap());
        if let RuleOutcome::Deal { price } = o_lo {
            prop_assert_eq!(o_hi, RuleOutcome::Deal { price }, "a larger budget keeps the deal at the same price");
        }
        if let (RuleOutcome::Deal { price: p1 }, RuleOutcome::Deal { price: p2 }) = (o_lo, o_hi) {
            prop_assert_eq!(p1, p2);
            prop_assert_eq!(p1, a);
        }
    }

    /// AC-41: whatever the judges (or an injected memo) make them say, the index never exceeds the
    /// deterministic ceiling, a parse failure (0) resolves to the floor, and no judge output can
    /// create a deal that the ceiling alone would not.
    #[test]
    fn ac41_judges_can_only_discount(
        (f, p) in formula(), c in components(), l_floor in floor(), l in factors(),
        b in budget(), a in ask(),
    ) {
        let d = ceiling(f, &c, &p).unwrap();
        let m = measured_index(f, &c, &p, l_floor, &l).unwrap();
        prop_assert!(m <= d, "index {m} above ceiling {d}");

        let factor = judgement_factor(l_floor, &l);
        prop_assert!(factor <= BPS);
        prop_assert!(factor >= l_floor.min(BPS), "below the seller's floor");
        if l.contains(&0) {
            prop_assert_eq!(factor, l_floor.min(BPS), "a failed judge resolves to the floor");
        }

        let rule = PricingRule::Posted { ask: a };
        let with_judges = apply_rule(&rule, b, m).unwrap();
        let ceiling_only = apply_rule(&rule, b, d).unwrap();
        prop_assert!(rank(with_judges) <= rank(ceiling_only), "judges raised the outcome");
    }

    /// Components out of range are refused, never clamped or wrapped.
    #[test]
    fn out_of_range_components_are_refused(over in (BPS + 1)..=u32::MAX, ok in 0u32..=BPS, first in any::<bool>()) {
        let c = if first { vec![over, ok] } else { vec![ok, over] };
        for f in [FormulaId::KnowledgeV1, FormulaId::DatasetLiteV0] {
            prop_assert_eq!(ceiling(f, &c, &FormulaParams { delta_star_bps: 500 }), Err(CoreError::Schema));
        }
    }
}
