//! E6: settlement by outcome (SDD §3.9.2) and the judge-receipt rules (§3.16).

use marginal_core::funding::{fund, total};
use marginal_core::judge::*;
use marginal_core::leakage::OUTCOME_MBITS;
use marginal_core::settle::{reverse_for_delivery_failure, settle, split, FeeShares};
use marginal_core::*;

mod common;
use common::nullifier;

const USDC: u128 = 1_000_000;

fn shares() -> FeeShares {
    FeeShares {
        treasury_bps: 5_000,
        operator_pool_bps: 3_000,
        assurance_pool_bps: 2_000,
    }
}

/// A job funded the way `request_appraisal` funds one: 1,000 USDC budget, 10 USDC compute, 2,400
/// millibits at 0.05 USDC a bit, 25 bps buyer fee.
fn funded() -> Buckets {
    fund(1_000 * USDC, 10 * USDC, USDC / 20, 2_400, 25).unwrap()
}

/// Whatever the outcome, the money is all still there: paid out, held, or given back (AC-4).
fn assert_conserved(before: &Buckets, settled: &marginal_core::settle::Settled) {
    let moved_out = settled.seller_comp
        + settled.operator_compute
        + settled.fees.treasury
        + settled.fees.operator_pool
        + settled.fees.assurance_pool;
    assert_eq!(
        total(before).unwrap(),
        total(&settled.buckets).unwrap() + moved_out,
        "nothing was created or lost"
    );
    assert_eq!(
        conservation::check_conservation(total(before).unwrap(), &settled.buckets, moved_out),
        Ok(())
    );
}

#[test]
fn a_deal_holds_the_price_pays_the_room_and_refunds_the_rest() {
    let before = funded();
    let price = 400 * USDC;
    let settled = settle(
        Outcome::Deal,
        &before,
        price,
        USDC / 20,
        2_400,
        25,
        shares(),
    )
    .unwrap();

    assert_eq!(
        settled.held, price,
        "the seller's proceeds wait for the window"
    );
    assert_eq!(settled.seller_comp, 120_000, "0.05 USDC a bit for 2.4 bits");
    assert_eq!(settled.operator_compute, 10 * USDC);
    assert_eq!(
        settled.leakage_debit_mbits, 2_400,
        "the debit equals the reservation"
    );
    let fee = 400 * USDC * 25 / 10_000;
    assert_eq!(
        settled.fees.treasury + settled.fees.operator_pool + settled.fees.assurance_pool,
        fee,
        "the fee is taken on the price, not the budget"
    );
    assert_eq!(settled.fees.operator_pool, fee * 3 / 10);
    assert_eq!(
        settled.refund,
        600 * USDC + (2_500_000 - fee),
        "the unspent budget and the unused fee go back"
    );
    assert_conserved(&before, &settled);
}

#[test]
fn no_deal_still_pays_for_the_work_and_the_leakage() {
    let before = funded();
    let settled = settle(Outcome::NoDeal, &before, 0, USDC / 20, 2_400, 25, shares()).unwrap();
    assert_eq!(settled.held, 0);
    assert_eq!(settled.seller_comp, 120_000, "the room still read the good");
    assert_eq!(settled.operator_compute, 10 * USDC);
    assert_eq!(settled.fees.treasury, 0, "no price, no fee");
    assert_eq!(settled.refund, 1_000 * USDC + 2_500_000);
    assert_conserved(&before, &settled);
}

/// Only the outcome bit was revealed, so that is all the seller is compensated for.
#[test]
fn a_restricted_verdict_debits_one_bit() {
    let before = funded();
    let settled = settle(
        Outcome::Restricted,
        &before,
        0,
        USDC / 20,
        2_400,
        25,
        shares(),
    )
    .unwrap();
    assert_eq!(settled.leakage_debit_mbits, OUTCOME_MBITS);
    assert_eq!(settled.seller_comp, 50_000, "one bit at 0.05 USDC");
    assert_eq!(settled.operator_compute, 10 * USDC);
    assert_conserved(&before, &settled);

    // A reservation smaller than one bit is debited whole, never more than was reserved.
    let small = fund(100, 0, 1_000, 500, 0).unwrap();
    let settled = settle(Outcome::Restricted, &small, 0, 1_000, 500, 0, shares()).unwrap();
    assert_eq!(settled.leakage_debit_mbits, 500);
    assert_conserved(&small, &settled);
}

#[test]
fn a_rejected_input_pays_for_the_work_but_leaks_nothing() {
    let before = funded();
    let settled = settle(
        Outcome::InputRejected,
        &before,
        0,
        USDC / 20,
        2_400,
        25,
        shares(),
    )
    .unwrap();
    assert_eq!(
        settled.leakage_debit_mbits, 0,
        "the reservation is released"
    );
    assert_eq!(settled.seller_comp, 0);
    assert_eq!(settled.operator_compute, 10 * USDC, "the room did the work");
    assert_eq!(settled.refund, 1_000 * USDC + 120_000 + 2_500_000);
    assert_conserved(&before, &settled);
}

/// D11: nothing ran, so the buyer is made whole, to the unit.
#[test]
fn a_timeout_returns_everything() {
    let before = funded();
    let settled = settle(Outcome::Timeout, &before, 0, USDC / 20, 2_400, 25, shares()).unwrap();
    assert_eq!(settled.held, 0);
    assert_eq!(settled.seller_comp, 0);
    assert_eq!(settled.operator_compute, 0);
    assert_eq!(
        settled.refund,
        total(&before).unwrap(),
        "exactly what was paid in"
    );
    assert_conserved(&before, &settled);
}

#[test]
fn an_outcome_that_is_not_a_first_settlement_is_refused() {
    let before = funded();
    for outcome in [Outcome::DeliveryFailure, Outcome::Revoked, Outcome::Fault] {
        assert_eq!(
            settle(outcome, &before, 0, 0, 0, 0, shares()),
            Err(CoreError::JobStateInvalid)
        );
    }
    // A price above the budget is not a price this job could pay.
    assert_eq!(
        settle(Outcome::Deal, &before, 1_001 * USDC, 0, 0, 0, shares()),
        Err(CoreError::Arithmetic)
    );
}

/// A deal that was never delivered: the held price and its fee go back, the appraisal stays paid.
#[test]
fn a_delivery_failure_reverses_the_price_and_the_fee() {
    let before = funded();
    let settled = settle(
        Outcome::Deal,
        &before,
        400 * USDC,
        USDC / 20,
        2_400,
        25,
        shares(),
    )
    .unwrap();
    let reversed = reverse_for_delivery_failure(&settled.buckets, &settled.fees).unwrap();
    let fee = 400 * USDC * 25 / 10_000;
    assert_eq!(reversed.held, 0);
    assert_eq!(reversed.refund, settled.refund + 400 * USDC + fee);
    assert_eq!(
        total(&reversed).unwrap(),
        total(&settled.buckets).unwrap() + fee,
        "the fee comes back into the job"
    );
}

#[test]
fn a_fee_is_split_into_whole_parts() {
    let split = split(1_000, shares()).unwrap();
    assert_eq!(
        (split.treasury, split.operator_pool, split.assurance_pool),
        (500, 300, 200)
    );
    assert_eq!(
        split.treasury + split.operator_pool + split.assurance_pool,
        1_000
    );
    // The remainder of the division goes to the treasury, so the parts always add up.
    let odd = split_fee(7);
    assert_eq!(odd.0 + odd.1 + odd.2, 7);
    assert_eq!(split_fee(0), (0, 0, 0));
}

fn split_fee(fee: u128) -> (u128, u128, u128) {
    let s = split(fee, shares()).unwrap();
    (s.treasury, s.operator_pool, s.assurance_pool)
}

// ---------------------------------------------------------------------------------------------
// Judge receipts (§3.16)

/// The strict parse (DR-2): the answer is `{"relevance":k}` on a 0..10 scale, and anything else
/// scores zero, which resolves to the listing's floor.
#[test]
fn only_a_strict_relevance_answer_scores() {
    assert_eq!(parse_relevance(r#"{"relevance":7}"#), 7_000);
    assert_eq!(parse_relevance(r#"{"relevance":10}"#), 10_000);
    assert_eq!(parse_relevance(r#"{"relevance":0}"#), 0);
    assert_eq!(
        parse_relevance("  { \"relevance\" : 3 }  "),
        3_000,
        "constrained decoding may add whitespace"
    );
    for bad in [
        "",
        "{}",
        r#"{"relevance":11}"#,
        r#"{"relevance":07}"#,
        r#"{"relevance":-1}"#,
        r#"{"relevance":7.5}"#,
        r#"{"relevance":"7"}"#,
        r#"{"relevance":7}, and here is why"#,
        r#"{"score":7}"#,
        r#"{"relevance":7"#,
        "the answer is 7",
    ] {
        assert_eq!(parse_relevance(bad), 0, "{bad:?}");
    }
}

/// In Open mode the body is published, and reasoning can quote the good (DR-13).
#[test]
fn a_body_with_reasoning_is_refused() {
    assert!(has_reasoning(
        r#"{"reasoning_content":"...","relevance":7}"#
    ));
    assert!(has_reasoning(r#"{"thinking":"..."}"#));
    assert!(has_reasoning(r#"{"thought":"..."}"#));
    assert!(!has_reasoning(r#"{"relevance":7}"#));
}

#[test]
fn a_receipt_commits_to_the_body_it_signs_for() {
    let body = r#"{"relevance":7}"#;
    let hash = marginal_core::json::to_hex(&codec::sha256(&[body.as_bytes()]));
    assert!(binds_body(&format!("chat 42 response {hash}"), body));
    assert!(!binds_body("chat 42 response deadbeef", body));
    assert!(!binds_body(
        &format!("chat 42 response {hash}"),
        r#"{"relevance":8}"#
    ));
}

#[test]
fn the_signed_preimage_is_the_personal_sign_envelope() {
    assert_eq!(
        personal_sign_preimage("abc"),
        b"\x19Ethereum Signed Message:\n3abc".to_vec()
    );
    assert_eq!(
        personal_sign_preimage(""),
        b"\x19Ethereum Signed Message:\n0".to_vec()
    );
    let long = "x".repeat(1_234);
    assert!(personal_sign_preimage(&long).starts_with(b"\x19Ethereum Signed Message:\n1234x"));
}

#[test]
fn a_receipt_id_is_domain_separated_and_unique_per_text() {
    assert_ne!(receipt_id("a"), receipt_id("b"));
    assert_eq!(
        receipt_id("a"),
        codec::sha256(&[b"marginal/receipt/v1", b"a"]),
        "its own domain, so it cannot collide with another hash of the same text"
    );
    assert_eq!(BPS_PER_POINT * MAX_RELEVANCE, pricing::BPS);
    assert_eq!(nullifier().epoch, 7);
}

/// Every outcome either ends a job in a state of its own, or is not a first settlement at all.
#[test]
fn each_outcome_has_its_end_state() {
    use marginal_core::settle::state_for;
    assert_eq!(state_for(Outcome::Deal), Ok(JobState::Deal));
    assert_eq!(state_for(Outcome::NoDeal), Ok(JobState::NoDeal));
    assert_eq!(state_for(Outcome::Restricted), Ok(JobState::Restricted));
    assert_eq!(
        state_for(Outcome::InputRejected),
        Ok(JobState::InputRejected)
    );
    assert_eq!(state_for(Outcome::Timeout), Ok(JobState::Timeout));
    for reversal in [Outcome::DeliveryFailure, Outcome::Revoked, Outcome::Fault] {
        assert_eq!(state_for(reversal), Err(CoreError::JobStateInvalid));
    }
    // Every end state is one a job in `Verdicted` may actually move to (§3.5).
    for outcome in [
        Outcome::Deal,
        Outcome::NoDeal,
        Outcome::Restricted,
        Outcome::InputRejected,
    ] {
        let state = state_for(outcome).unwrap();
        assert_eq!(lifecycle::transition(JobState::Verdicted, state), Ok(state));
    }
}

/// Core does not trust its caller: every amount that could pass the end of the counter is an error,
/// never a wrapped number.
#[test]
fn settlement_never_wraps() {
    let huge = Buckets {
        budget: u128::MAX,
        compute: 1,
        comp_reserved: 0,
        fee_reserved: 0,
        storage: 0,
        held: 0,
        refund: 0,
    };
    // The buckets themselves do not add up to one amount.
    assert_eq!(
        settle(Outcome::Deal, &huge, 0, 0, 0, 0, shares()),
        Err(CoreError::Arithmetic)
    );
    let funded = fund(1_000, 10, 1_000, 2_000, 0).unwrap();
    // A leakage price that cannot be paid in whole units.
    assert_eq!(
        settle(Outcome::Deal, &funded, 0, u128::MAX, 2_000, 0, shares()),
        Err(CoreError::Arithmetic)
    );
    // A fee rate above one whole, on a price large enough that it cannot be worked out.
    let whale = Buckets {
        budget: u128::MAX / 2,
        ..fund(0, 0, 0, 0, 0).unwrap()
    };
    assert_eq!(
        settle(
            Outcome::Deal,
            &whale,
            u128::MAX / 2,
            0,
            0,
            100_000,
            shares()
        ),
        Err(CoreError::Arithmetic)
    );
    // Shares that do not add up: clearing's setter refuses such a table, and core refuses the split.
    let bad = FeeShares {
        treasury_bps: 10_000,
        operator_pool_bps: 10_000,
        assurance_pool_bps: 10_000,
    };
    assert_eq!(split(1_000, bad), Err(CoreError::Arithmetic));
    // A fee so large that its own share cannot be worked out.
    for shares in [
        FeeShares {
            treasury_bps: 0,
            operator_pool_bps: 30_000,
            assurance_pool_bps: 0,
        },
        FeeShares {
            treasury_bps: 0,
            operator_pool_bps: 0,
            assurance_pool_bps: 30_000,
        },
    ] {
        assert_eq!(split(u128::MAX, shares), Err(CoreError::Arithmetic));
    }
    let with_fee = fund(1_000, 10, 1_000, 2_000, 100).unwrap();
    assert_eq!(
        settle(Outcome::Deal, &with_fee, 1_000, 0, 0, 100, bad),
        Err(CoreError::Arithmetic)
    );
    // A job whose refund bucket is already at the end of the counter.
    let stuffed = Buckets {
        refund: u128::MAX,
        ..fund(1_000, 0, 0, 0, 0).unwrap()
    };
    assert_eq!(
        settle(Outcome::Timeout, &stuffed, 0, 0, 0, 0, shares()),
        Err(CoreError::Arithmetic)
    );

    // Reversing a delivery that cannot fit back into the job.
    let fees = FeeSplit {
        compute: 0,
        treasury: u128::MAX,
        operator_pool: u128::MAX,
        assurance_pool: 0,
    };
    assert_eq!(
        reverse_for_delivery_failure(&funded, &fees),
        Err(CoreError::Arithmetic)
    );
    let full = Buckets {
        held: u128::MAX,
        refund: 2,
        ..funded.clone()
    };
    assert_eq!(
        reverse_for_delivery_failure(
            &full,
            &FeeSplit {
                compute: 0,
                treasury: u128::MAX,
                operator_pool: 0,
                assurance_pool: 0
            }
        ),
        Err(CoreError::Arithmetic)
    );
}

/// A buyer is an account in M1; the nullifier-only buyer is the v2 private mode (§3.25).
#[test]
fn a_buyer_is_an_account_or_a_nullifier() {
    assert_eq!(
        BuyerRef::Account("buyer.testnet".into())
            .account()
            .map(String::as_str),
        Some("buyer.testnet")
    );
    assert_eq!(BuyerRef::Nullifier([7; 32]).account(), None);
}
