//! E5: the job state machine (SDD §3.5), the nullifier credential (§3.20) and what a job costs
//! (§3.9.1).

use marginal_core::codec::to_bytes;
use marginal_core::credential::*;
use marginal_core::funding::{compensation, fee_bps, fund, total};
use marginal_core::lifecycle::{is_terminal, transition};
use marginal_core::*;

mod common;
use common::{assert_every_edit_changes_the_digest, h, nullifier, rt};

const ALL: [JobState; 12] = [
    JobState::PendingApproval,
    JobState::Requested,
    JobState::Assigned,
    JobState::Computing,
    JobState::Verdicted,
    JobState::Deal,
    JobState::NoDeal,
    JobState::Restricted,
    JobState::InputRejected,
    JobState::Final,
    JobState::DeliveryFailure,
    JobState::Timeout,
];

/// The Done line: every pair of M1 states, allowed or refused, with nothing left to judgement.
#[test]
fn every_pair_of_states_is_decided() {
    let allowed: &[(JobState, JobState)] = &[
        (JobState::PendingApproval, JobState::Requested),
        (JobState::Requested, JobState::Assigned),
        (JobState::Requested, JobState::Timeout),
        (JobState::Assigned, JobState::Computing),
        (JobState::Assigned, JobState::Timeout),
        (JobState::Computing, JobState::Verdicted),
        (JobState::Computing, JobState::Timeout),
        (JobState::Verdicted, JobState::Deal),
        (JobState::Verdicted, JobState::NoDeal),
        (JobState::Verdicted, JobState::Restricted),
        (JobState::Verdicted, JobState::InputRejected),
        (JobState::Deal, JobState::Final),
        (JobState::Deal, JobState::DeliveryFailure),
    ];
    let mut seen = 0;
    for from in ALL {
        for to in ALL {
            let expected = allowed.contains(&(from, to));
            seen += usize::from(expected);
            assert_eq!(transition(from, to).is_ok(), expected, "{from:?} -> {to:?}");
            if expected {
                assert_eq!(transition(from, to), Ok(to));
            } else {
                assert_eq!(transition(from, to), Err(CoreError::JobStateInvalid));
            }
        }
    }
    assert_eq!(seen, allowed.len(), "every allowed move was tried");
}

/// A settled job cannot settle again: no terminal state has a way out, whatever is asked for.
#[test]
fn a_settled_job_cannot_settle_again() {
    for state in ALL {
        if !is_terminal(state) {
            continue;
        }
        for to in ALL {
            assert_eq!(
                transition(state, to),
                Err(CoreError::JobStateInvalid),
                "{state:?} is terminal but moved to {to:?}"
            );
        }
    }
    for terminal in [
        JobState::Final,
        JobState::NoDeal,
        JobState::Restricted,
        JobState::InputRejected,
        JobState::DeliveryFailure,
        JobState::Timeout,
    ] {
        assert!(is_terminal(terminal));
    }
    for live in [
        JobState::PendingApproval,
        JobState::Requested,
        JobState::Assigned,
        JobState::Computing,
        JobState::Verdicted,
        JobState::Deal,
    ] {
        assert!(!is_terminal(live));
    }
}

/// The states M1 does not build are refused in both directions, so a job can never reach one.
#[test]
fn the_states_m1_does_not_build_are_unreachable() {
    for state in [JobState::Revoked, JobState::Fault] {
        for other in ALL {
            assert_eq!(transition(other, state), Err(CoreError::JobStateInvalid));
            assert_eq!(transition(state, other), Err(CoreError::JobStateInvalid));
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The nullifier credential

#[test]
fn the_credential_round_trips_and_its_domains_are_fixed() {
    rt(&nullifier());
    assert_eq!(NullifierCredential::DOMAIN, *b"marginal/nullif\0");
    assert_eq!(NULLIFIER_SIGNING_DOMAIN, b"marginal/nullifier/v1");
    assert_eq!(
        nullifier_signing_bytes(&nullifier()),
        [NULLIFIER_SIGNING_DOMAIN, &to_bytes(&nullifier())].concat()
    );
}

/// A credential issued for one subject, listing, epoch or chain is not valid for another.
#[test]
fn every_field_of_a_credential_is_signed() {
    let edits: &[common::Edit<NullifierCredential>] = &[
        ("chain", |c| c.chain_id = "mainnet".into()),
        ("clearing", |c| c.clearing = "other.near".into()),
        ("subject", |c| c.subject = "someone.else".into()),
        ("listing", |c| c.listing_id += 1),
        ("epoch", |c| c.epoch += 1),
        ("nullifier", |c| c.nullifier = h(9)),
        ("expiry", |c| c.expiry_height += 1),
    ];
    assert_every_edit_changes_the_digest(&nullifier(), edits, nullifier_signing_bytes);
}

// ---------------------------------------------------------------------------------------------
// What a job costs

/// The worked example from the SDD: a 1,000 USDC budget, a 10 USDC compute fee, 2,400 millibits at
/// 0.05 USDC a bit, and a 25 bps buyer fee.
#[test]
fn a_job_is_funded_bucket_by_bucket() {
    let usdc = 1_000_000u128;
    let buckets = fund(1_000 * usdc, 10 * usdc, usdc / 20, 2_400, 25).unwrap();
    assert_eq!(buckets.budget, 1_000 * usdc);
    assert_eq!(buckets.compute, 10 * usdc);
    assert_eq!(buckets.comp_reserved, 120_000, "0.05 USDC * 2.4 bits");
    assert_eq!(buckets.fee_reserved, 2_500_000, "25 bps of 1,000 USDC");
    assert_eq!(buckets.storage, 0, "paid by the attached deposit in M1");
    assert_eq!(buckets.held, 0);
    assert_eq!(buckets.refund, 0);
    assert_eq!(
        total(&buckets).unwrap(),
        1_000 * usdc + 10 * usdc + 120_000 + 2_500_000
    );
}

#[test]
fn compensation_and_fees_round_down_and_refuse_to_overflow() {
    assert_eq!(compensation(1_000, 1_000).unwrap(), 1_000, "one whole bit");
    assert_eq!(compensation(1_000, 1).unwrap(), 1, "one millibit, rounded");
    assert_eq!(compensation(999, 1).unwrap(), 0, "less than one unit");
    assert_eq!(compensation(0, 5_000).unwrap(), 0, "a free listing");
    assert_eq!(fee_bps(10_000, 25).unwrap(), 25);
    assert_eq!(fee_bps(10_000, 0).unwrap(), 0);
    assert_eq!(fee_bps(1, 1).unwrap(), 0, "rounds down, never up");
    assert_eq!(fee_bps(u128::MAX, 10_000).unwrap(), u128::MAX);
    assert_eq!(
        compensation(u128::MAX, u64::MAX),
        Err(CoreError::Arithmetic)
    );
    // `fund` does not trust the fee it is handed: a rate above one whole can overflow, and a
    // deployment whose governance set one would refuse jobs rather than wrap.
    assert_eq!(fund(u128::MAX, 0, 0, 0, 20_000), Err(CoreError::Arithmetic));
    assert_eq!(
        fund(u128::MAX, 0, u128::MAX, 2_000, 0),
        Err(CoreError::Arithmetic)
    );
    let mut buckets = fund(u128::MAX, 0, 0, 0, 0).unwrap();
    buckets.compute = 1;
    assert_eq!(total(&buckets), Err(CoreError::Arithmetic));
}

/// Conservation (AC-4) holds for a freshly funded job: the deposit is exactly the buckets.
#[test]
fn a_funded_job_conserves_what_was_paid() {
    let buckets = fund(500, 7, 3, 2_000, 100).unwrap();
    let deposit = total(&buckets).unwrap();
    assert_eq!(
        marginal_core::conservation::check_conservation(deposit, &buckets, 0),
        Ok(())
    );
    assert_eq!(
        marginal_core::conservation::check_conservation(deposit - 1, &buckets, 0),
        Err(CoreError::Conservation)
    );
}

/// What a budget must reach before a deal is possible under each rule (SDD §3.4, check 5).
#[test]
fn only_a_posted_price_has_a_minimum_a_buyer_can_meet() {
    use marginal_core::pricing::min_price;
    assert_eq!(min_price(&PricingRule::Posted { ask: 400 }), Ok(400));
    assert_eq!(min_price(&PricingRule::Posted { ask: 0 }), Ok(0));
    for disabled in [
        PricingRule::ValueIndexed {
            p_min: 1,
            p_full: 2,
            price_quantum_bps: 1,
        },
        PricingRule::SurplusSplitLegacy { ask: 1 },
        PricingRule::SealedRound {
            k: 1,
            reserve: 1,
            close_height: 1,
        },
        PricingRule::Tender { tender_id: 1 },
    ] {
        assert_eq!(min_price(&disabled), Err(CoreError::RuleDisabled));
    }
}

// ---------------------------------------------------------------------------------------------
// What a buyer may ask for

/// Every check on a request that does not need contract state (SDD §3.4).
#[test]
fn a_request_must_be_one_this_build_can_run() {
    use marginal_core::request::{validate_request, AppraisalRequest, MAX_JUDGES};
    let base = AppraisalRequest {
        listing_id: 3,
        listing_version: 1,
        snapshot_id: None,
        budget: 500,
        mode: DisplayMode::Blind,
        privacy: VerdictPrivacy::Open,
        n_judges: 2,
        delivery_pk: h(1),
        compliance_pk: None,
        context_auth_pk: h(2),
        sealed_context_key: vec![],
        refund_to: RefundRoute::Balance,
        nullifier: None,
        nullifier_sig: None,
    };
    assert_eq!(validate_request(&base), Ok(()));
    assert_eq!(
        validate_request(&AppraisalRequest {
            n_judges: MAX_JUDGES,
            ..base.clone()
        }),
        Ok(()),
        "the bound itself is allowed"
    );
    assert_eq!(
        validate_request(&AppraisalRequest {
            n_judges: MAX_JUDGES + 1,
            ..base.clone()
        }),
        Err(CoreError::RuleParams),
        "more judges than the leakage table can price"
    );
    assert_eq!(
        validate_request(&AppraisalRequest {
            budget: 0,
            ..base.clone()
        }),
        Err(CoreError::RuleParams)
    );
    assert_eq!(
        validate_request(&AppraisalRequest {
            mode: DisplayMode::Fields(vec![1]),
            ..base.clone()
        }),
        Err(CoreError::DisplayDisabled),
        "shown fields are M2"
    );
    // A credential without its signature, or a signature without its credential, is half an answer.
    assert_eq!(
        validate_request(&AppraisalRequest {
            nullifier: Some(nullifier()),
            ..base.clone()
        }),
        Err(CoreError::CredentialInvalid)
    );
    assert_eq!(
        validate_request(&AppraisalRequest {
            nullifier_sig: Some([7; 64]),
            ..base.clone()
        }),
        Err(CoreError::CredentialInvalid)
    );
    assert_eq!(
        validate_request(&AppraisalRequest {
            nullifier: Some(nullifier()),
            nullifier_sig: Some([7; 64]),
            ..base
        }),
        Ok(())
    );
}
