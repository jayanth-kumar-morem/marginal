//! Every way an M1 job ends without a sale, on a real chain (SC-15, SC-29, SC-14; D5, D11).
//!
//! `refund_expired` from each live state a job can actually be in, a job its buyer's agent parked
//! until a human approved it, the two unpriced outcomes with the debit the outcome table gives them,
//! and a deal whose good never arrived.
//!
//! Needs `make wasm-dev`.

mod common;

use anyhow::Result;
use common::{appraisal, ask, core_ok, judged, world, FEE_BUYER_BPS};
use marginal_core::funding::{compensation, fee_bps, fund, total};
use marginal_core::leakage::{max_debit, OUTCOME_MBITS};
use marginal_core::listing::ListingSpec;
use marginal_core::pricing::BPS;
use marginal_core::verdict::VerdictStatus;
use marginal_core::{DisplayMode, VerdictPrivacy};
use serde_json::json;

/// Deadlines short enough to wait out a block at a time, and long enough that opening three jobs
/// does not run the first one out before the suite has looked at it.
fn impatient(spec: &ListingSpec, copies: u16) -> ListingSpec {
    ListingSpec {
        delivery_deadline_blocks: 40,
        max_copies: copies,
        ..spec.clone()
    }
}

/// What an agent key may spend (§3.21): the demo's caps, with a human threshold under the budget
/// the agent asks for.
fn caps() -> serde_json::Value {
    json!({
        "per_job_budget_max": "600000000",
        "window_max": "2000000000",
        "window_secs": 3_600,
        "max_jobs_per_window": 4,
        "human_above": "450000000",
    })
}

/// Two judges on the sample schema, which is what each job below reserves.
fn debit_of(spec: &ListingSpec) -> u64 {
    max_debit(
        &spec.schema,
        &DisplayMode::Blind,
        &spec.rule,
        VerdictPrivacy::Open,
        2,
    )
    .expect("an Open, Blind job under R1")
}

/// SC-15, D11, AC-9 and AC-34: the room is killed, and after the deadline anyone ends the job and
/// the buyer is made whole — from every live state a job can be in before a verdict.
#[tokio::test]
async fn a_killed_room_refunds_every_live_job_to_the_unit() -> Result<()> {
    let w = world(3).await?;
    let spec = impatient(&w.spec(), 3);
    let listing_id = w.active_listing(&spec).await?;
    let debit = debit_of(&spec);
    let budget = 500_000_000u128;
    let deposit = core_ok(total(&core_ok(fund(
        budget,
        common::COMPUTE_FEE,
        spec.leakage.price_per_bit,
        debit,
        FEE_BUYER_BPS,
    ))));

    // One job in each state a job can be caught in: assigned to the room, already computing, and
    // parked for a human who never comes. `Requested` is not reachable on chain — the same call
    // that creates or approves a job assigns its room — so these three are every live state.
    let assigned = w
        .created(w.buyer(0), &appraisal(listing_id, budget, 2))
        .await?;
    let computing = w
        .created(w.buyer(1), &appraisal(listing_id, budget, 2))
        .await?;
    w.release_key(computing).await?;
    let agent = w.agent_key(w.buyer(2), caps()).await?;
    let parked = common::succeeded(w.request(&agent, &appraisal(listing_id, budget, 2)).await?)?;
    assert_eq!(parked["status"], "Parked");
    let parked = common::id_of(&parked["job_id"]);
    assert_eq!(w.job(parked).await?["state"], "PendingApproval");

    let jobs = [assigned, computing, parked];
    for (i, job) in jobs.iter().enumerate() {
        assert_eq!(
            w.balance(w.buyer(i)).await?,
            common::MINT - deposit,
            "each buyer funded the same buckets"
        );
        let job_view = w.job(*job).await?;
        assert!(
            w.height().await? <= job_view["deadline_height"].as_u64().expect("a deadline"),
            "the deadline must still be ahead for the refusal below to mean anything"
        );
        // Before the deadline nobody can take the job away from the room.
        common::assert_refused(&w.refund_expired(*job).await?, "E_JOB_STATE");
    }
    assert_eq!(
        w.leakage(listing_id).await?["reserved_mbits"],
        debit * 3,
        "all three reservations are held while the jobs are live"
    );

    // The room never answers. Past the deadline, anyone ends the job.
    let mut deadline = 0;
    for job in jobs {
        deadline = deadline.max(
            w.job(job).await?["deadline_height"]
                .as_u64()
                .expect("a deadline"),
        );
    }
    w.fast_forward_past(deadline).await?;
    for (i, job) in jobs.iter().enumerate() {
        let answer = common::succeeded(w.refund_expired(*job).await?)?;
        assert_eq!(answer["status"], "Timeout");
        assert_eq!(answer["refund"], deposit.to_string());
        assert_eq!(
            w.balance(w.buyer(i)).await?,
            common::MINT,
            "made whole, to the unit"
        );
        assert_eq!(w.job(*job).await?["state"], "Timeout");
        let record = w.settlement(*job).await?;
        assert_eq!(record["outcome"], "Timeout");
        assert_eq!(record["refund"], deposit.to_string());
        assert_eq!(record["held"], "0");
        assert_eq!(record["price"], "0");
        assert_eq!(
            record["leakage_debit_mbits"], 0,
            "nothing ran, so nothing leaked"
        );
        assert_eq!(record["leakage_comp"], "0");
        assert_eq!(record["cert_hashes"], json!([]));
        // A job that has ended cannot end again.
        common::assert_refused(&w.refund_expired(*job).await?, "E_JOB_STATE");
    }

    // Every reservation is released, so the listing can sell again, and the room's queue is clear.
    let leakage = w.leakage(listing_id).await?;
    assert_eq!(leakage["reserved_mbits"], 0);
    assert_eq!(leakage["spent_mbits"], 0);
    assert_eq!(leakage["remaining_mbits"], spec.leakage.budget_mbits);
    assert_eq!(w.listing(listing_id).await?["status"], "Active");
    assert_eq!(
        common::view(
            &w.clearing,
            "get_jobs_for_room",
            json!({ "room_key": marginal_core::json::to_hex(&common::room_key()) }),
        )
        .await?,
        json!([])
    );
    assert_eq!(
        w.claimable(&w.seller).await?,
        0,
        "and nobody was paid for work nobody did"
    );
    Ok(())
}

/// SC-14 and D5: a prompt-injected agent asks for more than its caps allow. One request is above
/// the human threshold and is parked until the buyer themselves approves it; one is over the
/// per-job cap and is blocked outright, creating nothing.
#[tokio::test]
async fn an_agents_job_is_parked_for_a_human_or_blocked_outright() -> Result<()> {
    let w = world(1).await?;
    let spec = impatient(&w.spec(), 1);
    let listing_id = w.active_listing(&spec).await?;
    let ask = ask(&spec);
    let agent = w.agent_key(w.buyer(0), caps()).await?;

    // Over the per-job cap: nothing is created, and the attempt is on the audit chain.
    let before = w.balance(w.buyer(0)).await?;
    let next_job_id = common::view(&w.clearing, "config", json!({})).await?["next_job_id"].clone();
    let blocked = common::succeeded(
        w.request(&agent, &appraisal(listing_id, 700_000_000, 2))
            .await?,
    )?;
    assert_eq!(
        blocked,
        json!({ "status": "Blocked", "cap": "per_job_budget_max" })
    );
    assert_eq!(w.balance(w.buyer(0)).await?, before, "no money moved");
    assert_eq!(w.leakage(listing_id).await?["reserved_mbits"], 0);
    assert_eq!(
        common::view(&w.clearing, "config", json!({})).await?["next_job_id"],
        next_job_id,
        "no job id was spent"
    );

    // Above the human threshold: parked, with no room assigned until a human approves it.
    let parked = common::succeeded(
        w.request(&agent, &appraisal(listing_id, 500_000_000, 2))
            .await?,
    )?;
    assert_eq!(parked["status"], "Parked");
    let job = common::id_of(&parked["job_id"]);
    assert_eq!(w.job(job).await?["state"], "PendingApproval");
    assert_eq!(w.job(job).await?["assigned"], json!([]));

    // The buyer's own key — not an agent key — approves it, and the job runs like any other.
    common::call(
        w.buyer(0),
        &w.clearing,
        "approve_parked",
        json!({ "job_id": job.to_string() }),
        common::no_deposit(),
    )
    .await?
    .into_result()?;
    assert_eq!(w.job(job).await?["state"], "Assigned");
    let settled = w
        .appraise(
            job,
            VerdictStatus::Ok,
            vec![BPS, BPS],
            vec![judged(10, 1), judged(10, 2)],
        )
        .await?;
    assert_eq!(settled["outcome"], "Deal");
    assert_eq!(settled["price"], ask.to_string());
    Ok(())
}

/// SC-29 and the second unpriced outcome: a restricted good costs the buyer the one outcome bit it
/// revealed, and an input the appraiser could not read costs no bits at all. The room is paid for
/// its compute either way, because it did the work.
#[tokio::test]
async fn a_restricted_good_debits_one_bit_and_a_rejected_input_debits_none() -> Result<()> {
    let w = world(2).await?;
    let spec = impatient(&w.spec(), 2);
    let listing_id = w.active_listing(&spec).await?;
    let ppb = spec.leakage.price_per_bit;
    let debit = debit_of(&spec);
    let budget = 500_000_000u128;
    let buckets = core_ok(fund(budget, common::COMPUTE_FEE, ppb, debit, FEE_BUYER_BPS));
    let deposit = core_ok(total(&buckets));

    // The buyer's restricted list matches the listing's issuers, so the room answers before it
    // appraises anything: one bit, and that bit is paid for.
    let restricted = w
        .created(w.buyer(0), &appraisal(listing_id, budget, 2))
        .await?;
    let answer = w
        .appraise(restricted, VerdictStatus::Restricted, vec![], vec![])
        .await?;
    assert_eq!(answer["outcome"], "Restricted");
    assert_eq!(answer["price"], "0");
    assert_eq!(w.job(restricted).await?["state"], "Restricted");
    let one_bit = core_ok(compensation(ppb, OUTCOME_MBITS));
    let record = w.settlement(restricted).await?;
    assert_eq!(record["leakage_debit_mbits"], OUTCOME_MBITS);
    assert_eq!(record["leakage_comp"], one_bit.to_string());
    assert_eq!(record["held"], "0");
    assert_eq!(record["payout"], "Released");
    assert_eq!(
        record["refund"],
        (deposit - common::COMPUTE_FEE - one_bit).to_string()
    );
    assert_eq!(
        record["fees"],
        json!({ "treasury": "0", "operator_pool": "0", "assurance_pool": "0" }),
        "there was no price, so there is no fee on it"
    );
    assert_eq!(
        w.balance(w.buyer(0)).await?,
        common::MINT - common::COMPUTE_FEE - one_bit
    );

    // Nothing was revealed at all, so the whole reservation goes back; only the compute is owed.
    let rejected = w
        .created(w.buyer(1), &appraisal(listing_id, budget, 2))
        .await?;
    let answer = w
        .appraise(rejected, VerdictStatus::InputRejected, vec![], vec![])
        .await?;
    assert_eq!(answer["outcome"], "InputRejected");
    assert_eq!(w.job(rejected).await?["state"], "InputRejected");
    let record = w.settlement(rejected).await?;
    assert_eq!(record["leakage_debit_mbits"], 0);
    assert_eq!(record["leakage_comp"], "0");
    assert_eq!(
        record["refund"],
        (deposit - common::COMPUTE_FEE).to_string()
    );
    assert_eq!(
        w.balance(w.buyer(1)).await?,
        common::MINT - common::COMPUTE_FEE
    );

    // The ledger spent exactly the one bit, and the operator was paid for both jobs.
    let leakage = w.leakage(listing_id).await?;
    assert_eq!(leakage["spent_mbits"], OUTCOME_MBITS);
    assert_eq!(leakage["reserved_mbits"], 0);
    assert_eq!(w.claimable(&w.seller).await?, one_bit);
    assert_eq!(w.claimable(&w.operator).await?, common::COMPUTE_FEE * 2);
    assert_eq!(w.claimable(&w.gov).await?, 0);
    Ok(())
}

/// The last M1 refund path (SDD §3.9.2, `DeliveryFailure`): a deal whose good never arrived. The
/// held price and the fee on it go back to the buyer; what the appraisal itself earned stays paid,
/// because the appraisal did happen.
#[tokio::test]
async fn a_deal_whose_good_never_arrives_gives_the_price_back() -> Result<()> {
    let w = world(1).await?;
    let spec = impatient(&w.spec(), 1);
    let listing_id = w.active_listing(&spec).await?;
    let ask = ask(&spec);
    let ppb = spec.leakage.price_per_bit;
    let debit = debit_of(&spec);
    let comp = core_ok(compensation(ppb, debit));
    let budget = 500_000_000u128;

    let job = w
        .created(w.buyer(0), &appraisal(listing_id, budget, 2))
        .await?;
    let settled = w
        .appraise(
            job,
            VerdictStatus::Ok,
            vec![BPS, BPS],
            vec![judged(10, 1), judged(10, 2)],
        )
        .await?;
    assert_eq!(settled["outcome"], "Deal");
    let fee_on_price = core_ok(fee_bps(ask, FEE_BUYER_BPS));
    assert_eq!(w.claimable(&w.gov).await?, fee_on_price);

    // No receipt arrives. Past the delivery deadline, anyone ends it.
    let deadline = w.job(job).await?["delivery_deadline_height"]
        .as_u64()
        .expect("a deal has a delivery deadline");
    common::assert_refused(&w.refund_expired(job).await?, "E_JOB_STATE");
    w.fast_forward_past(deadline).await?;
    let answer = common::succeeded(w.refund_expired(job).await?)?;
    assert_eq!(answer["status"], "DeliveryFailure");
    assert_eq!(
        answer["refund"],
        (ask + fee_on_price).to_string(),
        "the price and the fee taken on it"
    );
    assert_eq!(w.job(job).await?["state"], "DeliveryFailure");

    let record = w.settlement(job).await?;
    assert_eq!(record["outcome"], "DeliveryFailure");
    assert_eq!(record["held"], "0");
    assert_eq!(record["payout"], "Released");
    assert_eq!(
        record["fees"],
        json!({ "treasury": "0", "operator_pool": "0", "assurance_pool": "0" }),
        "the fee is reversed with the price"
    );
    assert_eq!(
        w.claimable(&w.gov).await?,
        0,
        "and taken back out of the treasury's balance"
    );
    assert_eq!(
        w.balance(w.buyer(0)).await?,
        common::MINT - common::COMPUTE_FEE - comp,
        "the buyer paid for the appraisal it got, and for nothing else"
    );
    assert_eq!(
        w.claimable(&w.seller).await?,
        comp,
        "the seller keeps what the verdict revealed, and loses the sale"
    );
    assert_eq!(w.claimable(&w.operator).await?, common::COMPUTE_FEE);

    // There is nothing left to release, and the job cannot end twice.
    common::assert_refused(&w.release_held(job, false).await?, "E_JOB_STATE");
    common::assert_refused(&w.refund_expired(job).await?, "E_JOB_STATE");
    Ok(())
}
