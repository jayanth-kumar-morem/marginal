//! E5.2 and E5.3: balances, and the buckets and leakage ledger behind a job.

use super::*;
use marginal_core::funding::{fund, total};
use marginal_core::leakage::OUTCOME_MBITS;

#[test]
fn a_deposit_credits_the_account_it_names() {
    let mut c = contract();
    fund_buyer(&mut c, 500);
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(500));
    fund_buyer(&mut c, 250);
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)),
        U128(750),
        "deposits add up"
    );
    assert_eq!(c.get_balance(account(SELLER), account(TOKEN)), U128(0));
    assert_eq!(c.get_claimable(account(SELLER), account(TOKEN)), U128(0));

    let logged = events();
    assert_eq!(logged[0]["event"], "deposit");
    assert_eq!(logged[0]["data"][0]["amount"], "250");
    assert_eq!(logged[0]["data"][0]["balance"], "750");
}

/// `Deposit{for}` credits the account the message names, not whoever sent the tokens: a relayer or
/// an exchange can fund a buyer (SDD §3.9.3).
#[test]
fn a_deposit_credits_the_named_account_not_the_sender() {
    let mut c = contract();
    testing_env!(context(TOKEN, no_deposit(), HEIGHT, NOW).build());
    assert_eq!(
        c.ft_on_transfer(
            account(SELLER),
            U128(600),
            json!({"Deposit": {"account": BUYER}}).to_string(),
        ),
        U128(0),
        "all of it was used"
    );
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(600));
    assert_eq!(
        c.get_balance(account(SELLER), account(TOKEN)),
        U128(0),
        "the sender funded someone else"
    );
    assert_eq!(events()[0]["data"][0]["from"], SELLER);
}

/// Anything clearing cannot use is sent straight back: NEP-141 credits the sender with whatever
/// `ft_on_transfer` returns.
#[test]
fn a_transfer_it_cannot_use_is_returned_whole() {
    let mut c = contract();
    let deposit = json!({"Deposit": {"account": BUYER}}).to_string();

    testing_env!(context("other-token.testnet", no_deposit(), HEIGHT, NOW).build());
    assert_eq!(
        c.ft_on_transfer(account(BUYER), U128(100), deposit.clone()),
        U128(100),
        "a token nobody allow-listed"
    );
    testing_env!(context(TOKEN, no_deposit(), HEIGHT, NOW).build());
    for msg in ["", "not json", &json!({"Appraise": {}}).to_string()] {
        assert_eq!(
            c.ft_on_transfer(account(BUYER), U128(100), msg.to_string()),
            U128(100),
            "{msg}"
        );
    }
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(0));
    assert!(
        events().is_empty(),
        "nothing happened, so nothing is logged"
    );
}

#[test]
fn a_withdrawal_leaves_the_balance_and_comes_back_if_the_token_call_fails() {
    let mut c = contract();
    fund_buyer(&mut c, 1_000);
    call_as(BUYER, NearToken::from_yoctonear(1));
    let _ = c.withdraw_balance(account(TOKEN), U128(400));
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(600));

    // The token reported success.
    call_as(CLEARING, no_deposit());
    assert!(c.on_withdraw(account(BUYER), account(TOKEN), U128(400), Ok(())));
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(600));
    assert_eq!(events()[0]["event"], "withdrawal");

    // The token call failed: the balance is restored.
    call_as(BUYER, NearToken::from_yoctonear(1));
    let _ = c.withdraw_balance(account(TOKEN), U128(600));
    call_as(CLEARING, no_deposit());
    assert!(!c.on_withdraw(
        account(BUYER),
        account(TOKEN),
        U128(600),
        Err(near_sdk::PromiseError::Failed)
    ));
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)),
        U128(600),
        "nothing was lost"
    );
    assert_eq!(events()[0]["event"], "withdrawal_failed");
}

#[test]
fn a_withdrawal_needs_a_yocto_and_a_balance_that_covers_it() {
    let mut c = contract();
    fund_buyer(&mut c, 100);
    call_as(BUYER, no_deposit());
    expect_panic("Requires attached deposit of exactly 1 yoctoNEAR", || {
        let _ = c.withdraw_balance(account(TOKEN), U128(50));
    });
    call_as(BUYER, NearToken::from_yoctonear(1));
    expect_panic("E_BALANCE_LOW", || {
        let _ = c.withdraw_balance(account(TOKEN), U128(101));
    });
    call_as(BUYER, NearToken::from_yoctonear(1));
    expect_panic("nothing to move", || {
        let _ = c.withdraw_balance(account(TOKEN), U128(0));
    });
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(100));
}

/// A function-call key must not be able to move tokens out, whatever its method list says (§3.21).
#[test]
fn an_agent_key_cannot_withdraw() {
    let mut c = contract();
    fund_buyer(&mut c, 1_000);
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());

    call_with_key(BUYER, agent_key());
    testing_env!(context(BUYER, NearToken::from_yoctonear(1), HEIGHT, NOW)
        .signer_account_pk({
            let mut pk = vec![0u8];
            pk.extend_from_slice(&agent_key());
            pk.try_into().unwrap()
        })
        .build());
    expect_panic("E_AGENT_CAP", || {
        let _ = c.withdraw_balance(account(TOKEN), U128(100));
    });
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), U128(1_000));
}

// ---------------------------------------------------------------------------------------------
// The leakage ledger (E5.3)

/// The reservation is what a job could leak, and it comes out of the listing's budget before the
/// job runs (AC-12).
#[test]
fn a_reservation_is_taken_before_the_job_runs_and_given_back_if_it_does_not() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let answer = {
        call_as(BUYER, no_deposit());
        c.request_appraisal(b64(&request(listing_id)))
    };
    let job_id = created(&answer);
    let job = c.get_job(U64(job_id)).unwrap();
    let reserved = job["max_debit_mbits"].as_u64().unwrap();
    assert!(
        reserved > OUTCOME_MBITS,
        "the outcome bit plus the components"
    );
    let leakage = c.get_leakage(U64(listing_id)).unwrap();
    assert_eq!(leakage["reserved_mbits"], reserved);
    assert_eq!(leakage["remaining_mbits"], 100_000 - reserved);

    // Giving it back when the job reveals nothing is settlement's step (E6.3).
    assert_eq!(
        c.remaining_mbits(&c.listing(listing_id)),
        100_000 - reserved
    );
}

/// A listing cannot promise more than its budget, and the budget is what bounds every job.
#[test]
fn the_budget_is_the_bound_on_everything() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let mut listing = c.listing(listing_id);
    c.reserve_leakage(&mut listing, 100_000);
    expect_panic("E_BUDGET_EXHAUSTED", || {
        let mut over = listing.clone();
        c.reserve_leakage(&mut over, 1);
    });
    // A reservation that would overflow the counters is refused, not wrapped.
    expect_panic("E_ARITHMETIC", || {
        let mut over = listing.clone();
        c.reserve_leakage(&mut over, u64::MAX);
    });
}

/// Conservation (AC-4): what the buyer paid is exactly what sits in the job's buckets.
#[test]
fn a_funded_job_holds_exactly_what_the_buyer_paid() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    let after = c.get_balance(account(BUYER), account(TOKEN)).0;

    let job: Job = crate::store::get(crate::store::Table::Job, &crate::store::num(job_id)).unwrap();
    let paid = before - after;
    assert_eq!(total(&job.buckets).unwrap(), paid);
    assert_eq!(
        marginal_core::conservation::check_conservation(paid, &job.buckets, 0),
        Ok(())
    );
    let expected = fund(500_000_000, 10, 1_000, job.max_debit_mbits, 0).unwrap();
    assert_eq!(job.buckets, expected);
}

/// Counters that would overflow are refused, not wrapped: value is never created by arithmetic.
#[test]
fn balances_and_counters_refuse_to_overflow() {
    let mut c = contract();
    ready(&mut c);

    // A balance that would pass the end of the counter takes no more deposits.
    fund_buyer(&mut c, u128::MAX - 10_000_000_000);
    testing_env!(context(TOKEN, no_deposit(), HEIGHT, NOW).build());
    expect_panic("E_ARITHMETIC", || {
        c.ft_on_transfer(
            account(BUYER),
            U128(1),
            json!({"Deposit": {"account": BUYER}}).to_string(),
        );
    });
}
