//! E6.4 and E6.5: the delivery receipt, the challenge window, timeouts (D11) and claims.

use super::*;
use marginal_core::credential::{payout_approval_signing_bytes, PayoutApproval};

/// The compliance service's key, and an approval it would sign for this seller's route.
fn compliance_key() -> SigningKey {
    SigningKey::from_bytes(&[4; 32])
}

fn approval(c: &Clearing, listing_id: u64, blocked: bool) -> (PayoutApproval, Base64VecU8) {
    let listing = c.listing(listing_id);
    let approval = PayoutApproval {
        domain: PayoutApproval::DOMAIN,
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        subject: SELLER.into(),
        route_hash: marginal_core::codec::hash_of(&listing.payout),
        list_version: [0x11; 32],
        screening_id: [0x22; 32],
        blocked,
        expiry_height: HEIGHT + 1_000,
    };
    let sig = Base64VecU8(
        compliance_key()
            .sign(&payout_approval_signing_bytes(&approval))
            .to_bytes()
            .to_vec(),
    );
    (approval, sig)
}

/// A job that has settled as a deal, with the compliance key registered.
fn dealt(c: &mut Clearing) -> (u64, u64) {
    let (listing_id, job_id) = computing(c);
    call_as(GOV, no_deposit());
    c.set_compliance_key(to_hex(&compliance_key().verifying_key().to_bytes()));
    let verdict = verdict_for(c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    call_as(OPERATOR, no_deposit());
    c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    (listing_id, job_id)
}

#[test]
fn the_room_reports_what_it_delivered_and_the_hash_must_match() {
    let mut c = contract();
    let (_, job_id) = dealt(&mut c);

    call_as(OPERATOR, no_deposit());
    expect_panic("E_COMMITMENT_MISMATCH", || {
        c.submit_delivery_receipt(U64(job_id), to_hex(&[0xaa; 32]));
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_DECODE", || {
        c.submit_delivery_receipt(U64(job_id), "zz".into());
    });

    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    assert_eq!(
        c.get_settlement(U64(job_id)).unwrap()["delivery_receipt"],
        to_hex(&[0xd1; 32])
    );
    assert_eq!(events()[0]["event"], "delivery_receipt");

    // Once is enough.
    call_as(OPERATOR, no_deposit());
    expect_panic("E_RECEIPT_REPLAY", || {
        c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    });
}

/// The seller is paid once the good arrived and the window has passed, never before.
#[test]
fn the_proceeds_are_released_after_the_window() {
    let mut c = contract();
    let (listing_id, job_id) = dealt(&mut c);
    let (approval, sig) = approval(&c, listing_id, false);

    // No receipt yet.
    call_as(BUYER, no_deposit());
    expect_panic("E_DELIVERY_MISSING", || {
        c.release_held(U64(job_id), b64(&approval), sig.clone());
    });
    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));

    // The window has not passed.
    call_as(BUYER, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.release_held(U64(job_id), b64(&approval), sig.clone());
    });

    // Ten minutes later, anyone can release it, and the money goes to the seller's claimable.
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    let answer = c.release_held(U64(job_id), b64(&approval), sig.clone());
    assert_eq!(answer["status"], "Released");
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Final");
    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["held"], "0");
    assert_eq!(record["payout"], "Claimable");
    let proceeds: u128 = answer["proceeds"].as_str().unwrap().parse().unwrap();
    assert!(c.get_claimable(account(SELLER), account(TOKEN)).0 >= proceeds);
    assert_eq!(events()[0]["event"], "held_released");

    // And only once.
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    expect_panic("E_JOB_STATE", || {
        c.release_held(U64(job_id), b64(&approval), sig);
    });
}

/// AC-47: a sanctions match leaves the payout blocked, with the screening it came from, rather
/// than paying it or dropping it silently.
#[test]
fn a_sanctions_match_blocks_the_payout_and_says_which_screening() {
    let mut c = contract();
    let (listing_id, job_id) = dealt(&mut c);
    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    let (approval, sig) = approval(&c, listing_id, true);

    let before = c.get_claimable(account(SELLER), account(TOKEN));
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    let answer = c.release_held(U64(job_id), b64(&approval), sig);
    assert_eq!(answer["status"], "Blocked");
    assert_eq!(answer["screening_id"], to_hex(&[0x22; 32]));
    assert_eq!(
        c.get_claimable(account(SELLER), account(TOKEN)),
        before,
        "the proceeds were not paid; only the leakage compensation from settlement is owed"
    );
    let record = c.get_settlement(U64(job_id)).unwrap();
    assert!(record["payout"].as_str().unwrap().contains("Blocked"));
    assert_eq!(events()[0]["event"], "payout_blocked");
}

/// The approval has to be this compliance key's, for this seller, this route, and unexpired.
#[test]
fn an_approval_is_checked_field_by_field() {
    let mut c = contract();
    let (listing_id, job_id) = dealt(&mut c);
    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    let (good, good_sig) = approval(&c, listing_id, false);

    type Edit = (&'static str, Box<dyn Fn(&mut PayoutApproval)>);
    let edits: Vec<Edit> = vec![
        (
            "E_BINDING",
            Box::new(|a: &mut PayoutApproval| a.chain_id = "mainnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|a: &mut PayoutApproval| a.clearing = "other.testnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|a: &mut PayoutApproval| a.subject = BUYER.into()),
        ),
        (
            "E_BINDING",
            Box::new(|a: &mut PayoutApproval| a.route_hash = [0xee; 32]),
        ),
        (
            "E_BINDING",
            Box::new(|a: &mut PayoutApproval| a.domain = [0; 16]),
        ),
        (
            "E_CREDENTIAL",
            Box::new(|a: &mut PayoutApproval| a.expiry_height = HEIGHT - 1),
        ),
    ];
    for (code, edit) in edits {
        let mut bad = good.clone();
        edit(&mut bad);
        let sig = Base64VecU8(
            compliance_key()
                .sign(&payout_approval_signing_bytes(&bad))
                .to_bytes()
                .to_vec(),
        );
        call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
        expect_panic(code, || {
            c.release_held(U64(job_id), b64(&bad), sig.clone());
        });
    }
    // Signed by someone else, or not signed at all.
    let impostor = SigningKey::from_bytes(&[9; 32]);
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    expect_panic("E_CREDENTIAL", || {
        let sig = Base64VecU8(
            impostor
                .sign(&payout_approval_signing_bytes(&good))
                .to_bytes()
                .to_vec(),
        );
        c.release_held(U64(job_id), b64(&good), sig);
    });
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    expect_panic("E_CREDENTIAL", || {
        c.release_held(U64(job_id), b64(&good), Base64VecU8(vec![1, 2]));
    });
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    expect_panic("E_DECODE", || {
        c.release_held(U64(job_id), Base64VecU8(vec![1]), good_sig.clone());
    });

    // With no compliance key registered, no payout can be released at all.
    c.compliance_key = None;
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    expect_panic("E_CREDENTIAL", || {
        c.release_held(U64(job_id), b64(&good), good_sig);
    });
}

// ---------------------------------------------------------------------------------------------
// D11: the room is killed mid-job

/// DRC-11: after the deadline, anyone calls `refund_expired` and the buyer is made whole, exactly.
#[test]
fn a_job_nobody_finished_refunds_the_buyer_to_the_unit() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    let funded = before - c.get_balance(account(BUYER), account(TOKEN)).0;
    let deadline = c.get_job(U64(job_id)).unwrap()["deadline_height"]
        .as_u64()
        .unwrap();

    // Not yet: the room still has until the deadline.
    call_as(SELLER, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.refund_expired(U64(job_id));
    });

    // Anyone may call it, and the buyer gets back exactly what the job cost.
    call_at(SELLER, no_deposit(), deadline + 1, NOW);
    let answer = c.refund_expired(U64(job_id));
    assert_eq!(answer["status"], "Timeout");
    assert_eq!(
        answer["refund"].as_str().unwrap().parse::<u128>().unwrap(),
        funded
    );
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)).0,
        before,
        "made whole, to the unit"
    );
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Timeout");

    // The leakage reservation is released, so the listing can sell again.
    let leakage = c.get_leakage(U64(listing_id)).unwrap();
    assert_eq!(leakage["reserved_mbits"], 0);
    assert_eq!(leakage["spent_mbits"], 0);
    assert_eq!(leakage["remaining_mbits"], 100_000);
    assert_eq!(
        c.get_jobs_for_room(to_hex(&room_key())).len(),
        0,
        "the room's queue is clear"
    );

    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["outcome"], "Timeout");
    assert_eq!(record["price"], "0");
    assert_eq!(events()[0]["event"], "refund");

    // A settled job cannot be refunded again.
    call_at(SELLER, no_deposit(), deadline + 2, NOW);
    expect_panic("E_JOB_STATE", || {
        c.refund_expired(U64(job_id));
    });
    call_as(SELLER, no_deposit());
    expect_panic("E_TICKET", || {
        c.refund_expired(U64(999));
    });
}

/// A deal whose good never arrived: the held price and its fee go back to the buyer.
#[test]
fn a_deal_with_no_delivery_ends_in_delivery_failure() {
    let mut c = contract();
    let (_, job_id) = dealt(&mut c);
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    let record = c.get_settlement(U64(job_id)).unwrap();
    let held: u128 = record["held"].as_str().unwrap().parse().unwrap();
    let deadline = c.get_job(U64(job_id)).unwrap()["delivery_deadline_height"]
        .as_u64()
        .unwrap();

    // The delivery deadline has not passed.
    call_as(SELLER, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.refund_expired(U64(job_id));
    });

    call_at(SELLER, no_deposit(), deadline + 1, NOW);
    let answer = c.refund_expired(U64(job_id));
    assert_eq!(answer["status"], "DeliveryFailure");
    let returned: u128 = answer["refund"].as_str().unwrap().parse().unwrap();
    assert!(
        returned >= held,
        "the price comes back, with the fee taken on it"
    );
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)).0,
        before + returned
    );
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "DeliveryFailure");
    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["outcome"], "DeliveryFailure");
    assert_eq!(record["held"], "0");

    // A delivered deal is not a delivery failure.
    let (_, other) = dealt(&mut c);
    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(other), to_hex(&[0xd1; 32]));
    let deadline = c.get_job(U64(other)).unwrap()["delivery_deadline_height"]
        .as_u64()
        .unwrap();
    call_at(SELLER, no_deposit(), deadline + 1, NOW);
    expect_panic("E_JOB_STATE", || {
        c.refund_expired(U64(other));
    });
}

// ---------------------------------------------------------------------------------------------
// E6.5: claims

#[test]
fn a_claim_pays_out_and_comes_back_if_the_token_refuses() {
    let mut c = contract();
    let (listing_id, job_id) = dealt(&mut c);
    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    let (approval, sig) = approval(&c, listing_id, false);
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    c.release_held(U64(job_id), b64(&approval), sig);
    let owed = c.get_claimable(account(SELLER), account(TOKEN));
    assert!(owed.0 > 0);

    // The token refused: the balance comes back, and the seller can try again.
    call_as(SELLER, NearToken::from_yoctonear(1));
    let _ = c.claim(account(TOKEN));
    assert_eq!(
        c.get_claimable(account(SELLER), account(TOKEN)),
        U128(0),
        "taken while in flight"
    );
    call_as(CLEARING, no_deposit());
    assert!(!c.on_claim(
        account(SELLER),
        account(TOKEN),
        owed,
        Err(near_sdk::PromiseError::Failed)
    ));
    assert_eq!(
        c.get_claimable(account(SELLER), account(TOKEN)),
        owed,
        "nothing was lost"
    );
    assert_eq!(events()[0]["event"], "claim_failed");

    // And again, this time the token pays.
    call_as(SELLER, NearToken::from_yoctonear(1));
    let _ = c.claim(account(TOKEN));
    call_as(CLEARING, no_deposit());
    assert!(c.on_claim(account(SELLER), account(TOKEN), owed, Ok(())));
    assert_eq!(c.get_claimable(account(SELLER), account(TOKEN)), U128(0));
    assert_eq!(events()[0]["event"], "claim");
}

#[test]
fn a_claim_needs_a_yocto_something_to_claim_and_a_key_that_is_not_an_agents() {
    let mut c = contract();
    let (_, job_id) = dealt(&mut c);
    assert!(c.get_settlement(U64(job_id)).is_some());

    call_as(SELLER, no_deposit());
    expect_panic("Requires attached deposit of exactly 1 yoctoNEAR", || {
        let _ = c.claim(account(TOKEN));
    });
    call_as(BUYER, NearToken::from_yoctonear(1));
    expect_panic("nothing to claim", || {
        let _ = c.claim(account(TOKEN));
    });

    call_as(SELLER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());
    let mut pk = vec![0u8];
    pk.extend_from_slice(&agent_key());
    testing_env!(context(SELLER, NearToken::from_yoctonear(1), HEIGHT, NOW)
        .signer_account_pk(pk.try_into().unwrap())
        .build());
    expect_panic("E_AGENT_CAP", || {
        let _ = c.claim(account(TOKEN));
    });
}

#[test]
fn a_job_with_no_settlement_has_no_record() {
    let c = contract();
    assert!(c.get_settlement(U64(1)).is_none());
}

/// With a fee table set, the clearing fee comes off the price at settlement and off the proceeds
/// at release, and a delivery failure reverses the first of them (SDD §3.9.1, §3.9.2).
#[test]
fn the_clearing_fee_is_taken_on_the_price_and_on_the_proceeds() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    c.set_fees(FeeTable {
        clearing_fee_buyer_bps: 100,
        clearing_fee_seller_bps: 200,
        treasury_bps: 5_000,
        operator_pool_bps: 3_000,
        assurance_pool_bps: 2_000,
    });
    let (listing_id, job_id) = dealt(&mut c);

    // 1% of the 400 USDC price, split 50/30/20, is owed to governance.
    let record = c.get_settlement(U64(job_id)).unwrap();
    let buyer_fee = 400_000_000u128 * 100 / 10_000;
    assert_eq!(record["fees"]["treasury"], (buyer_fee / 2).to_string());
    assert_eq!(
        record["fees"]["operator_pool"],
        (buyer_fee * 3 / 10).to_string()
    );
    assert_eq!(
        record["fees"]["assurance_pool"],
        (buyer_fee / 5).to_string()
    );
    let gov_owed = c.get_claimable(account(GOV), account(TOKEN)).0;
    assert_eq!(gov_owed, buyer_fee);

    // 2% of the proceeds comes off at release.
    call_as(OPERATOR, no_deposit());
    c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    let (approval, sig) = approval(&c, listing_id, false);
    call_at(BUYER, no_deposit(), HEIGHT, NOW + 600);
    let answer = c.release_held(U64(job_id), b64(&approval), sig);
    let seller_fee = 400_000_000u128 * 200 / 10_000;
    assert_eq!(
        answer["proceeds"]
            .as_str()
            .unwrap()
            .parse::<u128>()
            .unwrap(),
        400_000_000 - seller_fee
    );
    assert_eq!(
        c.get_claimable(account(GOV), account(TOKEN)).0,
        buyer_fee + seller_fee
    );
}

/// A delivery failure gives the buyer back the fee that was taken on the price, not just the price.
#[test]
fn a_delivery_failure_reverses_the_fee_as_well_as_the_price() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    c.set_fees(FeeTable {
        clearing_fee_buyer_bps: 100,
        ..FeeTable::default()
    });
    let (_, job_id) = dealt(&mut c);
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    let gov_before = c.get_claimable(account(GOV), account(TOKEN)).0;
    let buyer_fee = 400_000_000u128 * 100 / 10_000;
    assert_eq!(gov_before, buyer_fee);

    let deadline = c.get_job(U64(job_id)).unwrap()["delivery_deadline_height"]
        .as_u64()
        .unwrap();
    call_at(SELLER, no_deposit(), deadline + 1, NOW);
    let answer = c.refund_expired(U64(job_id));
    let returned: u128 = answer["refund"].as_str().unwrap().parse().unwrap();
    assert_eq!(returned, 400_000_000 + buyer_fee, "the price and its fee");
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)).0,
        before + returned
    );
    assert_eq!(
        c.get_claimable(account(GOV), account(TOKEN)).0,
        0,
        "the fee was taken back"
    );
    assert_eq!(
        c.get_settlement(U64(job_id)).unwrap()["fees"]["treasury"],
        "0"
    );
}

/// A receipt is only for a job that struck a deal, and only a job with a buyer can be refunded.
#[test]
fn the_other_jobs_have_no_receipt_and_no_refund() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));

    // The job has not struck a deal: there is nothing to deliver.
    call_as(OPERATOR, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.submit_delivery_receipt(U64(job_id), to_hex(&[0xd1; 32]));
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.release_held(U64(job_id), Base64VecU8(vec![]), Base64VecU8(vec![]));
    });

    // A provisioning job has no buyer and no money, so `refund_expired` has nobody to pay.
    let other = draft(&mut c);
    call_as(SELLER, no_deposit());
    let provisioning_job = c.begin_provisioning(U64(other)).0;
    call_at(SELLER, no_deposit(), HEIGHT + 1_000, NOW);
    expect_panic("E_JOB_STATE", || {
        c.refund_expired(U64(provisioning_job));
    });
}

/// Records this build could not have written are refused with a stable code, never acted on.
#[test]
fn a_record_no_build_of_ours_wrote_is_refused() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));

    // A job whose token is not an account id at all.
    let mut job: Job =
        crate::store::get(crate::store::Table::Job, &crate::store::num(job_id)).unwrap();
    job.token = "not an account".into();
    crate::store::put(crate::store::Table::Job, &crate::store::num(job_id), &job);
    call_at(SELLER, no_deposit(), job.deadline_height + 1, NOW);
    expect_panic("E_DECODE", || {
        c.refund_expired(U64(job_id));
    });

    // A reservation cannot be debited for more than it holds.
    let mut listing = c.listing(listing_id);
    expect_panic("E_ARITHMETIC", || {
        c.debit_leakage(&mut listing, 1_000, 2_000);
    });
}

/// Settlement that cannot be worked out in whole units is refused, not wrapped. Nothing in M1 can
/// set a leakage price this high on a live listing — `request_appraisal` refuses the job — but the
/// seller could raise it between the request and the verdict.
#[test]
fn a_settlement_that_cannot_be_worked_out_is_refused() {
    let mut c = contract();
    let (listing_id, job_id) = computing(&mut c);
    let mut listing = c.listing(listing_id);
    listing.leakage.price_per_bit = u128::MAX;
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );

    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    call_as(OPERATOR, no_deposit());
    expect_panic("E_ARITHMETIC", || {
        c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    });
    assert_eq!(
        c.get_job(U64(job_id)).unwrap()["state"],
        "Computing",
        "and nothing moved"
    );
}

/// A job that was parked and never approved still times out, or its funds would be locked for good.
#[test]
fn a_parked_job_nobody_approved_times_out() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    call_with_key(BUYER, agent_key());
    let answer = c.request_appraisal(b64(&AppraisalRequest {
        budget: 560_000_000,
        ..request(listing_id)
    }));
    assert_eq!(answer["status"], "Parked");
    let job_id: u64 = answer["job_id"].as_str().unwrap().parse().unwrap();
    let deadline = c.get_job(U64(job_id)).unwrap()["deadline_height"]
        .as_u64()
        .unwrap();

    call_at(SELLER, no_deposit(), deadline + 1, NOW);
    assert_eq!(c.refund_expired(U64(job_id))["status"], "Timeout");
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Timeout");
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)).0,
        before,
        "the buyer is whole again"
    );
}

/// A job whose budget is exactly the ask leaves nothing to refund.
#[test]
fn a_deal_at_the_whole_budget_refunds_nothing() {
    let mut c = contract();
    let (listing_id, job_id) = computing(&mut c);
    // The job was funded at 500 USDC against a 400 USDC ask; make the ask the whole budget and
    // leave no leakage or fee reserve.
    let mut job: Job =
        crate::store::get(crate::store::Table::Job, &crate::store::num(job_id)).unwrap();
    job.buckets.budget = 400_000_000;
    job.buckets.compute = 0;
    job.buckets.comp_reserved = 0;
    job.buckets.fee_reserved = 0;
    crate::store::put(crate::store::Table::Job, &crate::store::num(job_id), &job);
    let mut listing = c.listing(listing_id);
    listing.leakage.price_per_bit = 0;
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;

    // Full marks from both judges, so the valuation is the whole budget and the deal is struck.
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(10)]);
    call_as(OPERATOR, no_deposit());
    let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    assert_eq!(answer["outcome"], "Deal");
    assert_eq!(c.get_settlement(U64(job_id)).unwrap()["refund"], "0");
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)).0, before);
}

#[test]
fn a_receipt_or_a_release_for_a_job_that_does_not_exist() {
    let mut c = contract();
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || {
        c.submit_delivery_receipt(U64(999), to_hex(&[0xd1; 32]));
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || {
        c.release_held(U64(999), Base64VecU8(vec![]), Base64VecU8(vec![]));
    });
}
