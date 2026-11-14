//! D1, the demo's spine, on a real chain (SC-1, SC-2, SC-3, SC-11, SC-21; DRC-1).
//!
//! One listing, provisioned and published through the room's own signed reports, then two buyers on
//! it: the first gets a `Deal` at the ask and the memo's key, the second a `NoDeal` with its deposit
//! back minus the compute fee and π·d. Every figure is worked out with `marginal-core` and checked
//! against what the contracts stored, to the unit.
//!
//! Needs `make wasm-dev`.

mod common;

use anyhow::Result;
use common::samples;
use common::{
    appraisal, ask, core_ok, judged, receipt, world, DELIVERY_HASH, FEE_BUYER_BPS, FEE_SELLER_BPS,
};
use marginal_core::funding::{compensation, fee_bps, fund, total};
use marginal_core::leakage::{max_debit, mbits, OUTCOME_MBITS};
use marginal_core::listing::ListingSpec;
use marginal_core::pricing::{ceiling, measured_index, valuation, BPS};
use marginal_core::reports::{ScreeningResult, FLAG_MNPI};
use marginal_core::settle::{settle, FeeShares};
use marginal_core::verdict::{JudgeFactor, ModelProof, VerdictStatus};
use marginal_core::{DisplayMode, FormulaParams, Outcome, VerdictPrivacy, SIM_ATTESTATION};
use serde_json::json;

/// The fee split the world's governance set, as core's settlement takes it.
fn shares() -> FeeShares {
    FeeShares {
        treasury_bps: common::TREASURY_BPS,
        operator_pool_bps: common::OPERATOR_POOL_BPS,
        assurance_pool_bps: common::ASSURANCE_POOL_BPS,
    }
}

/// What a job of `n_judges` judges on this listing may leak, in millibits.
fn debit_of(spec: &ListingSpec, n_judges: u8) -> u64 {
    max_debit(
        &spec.schema,
        &DisplayMode::Blind,
        &spec.rule,
        VerdictPrivacy::Open,
        n_judges,
    )
    .expect("an Open, Blind job under R1")
}

/// SC-1, SC-2, SC-3 and DRC-1: two funds, one memo.
#[tokio::test]
async fn two_funds_appraise_one_memo_and_the_money_lands_to_the_unit() -> Result<()> {
    let w = world(2).await?;
    // The world is wired the way the demo is: KeyPolicy is pointed at the locked verifier's own
    // built wasm, and the registry's record says the one thing that is simulated here is this
    // room's attestation (§6.3 rule 2).
    let config: serde_json::Value = w.keypolicy.view("config").await?.json()?;
    assert_eq!(config["dcap_verifier"], w.verifier.id().as_str());
    assert_eq!(
        common::view(
            &w.clearing,
            "get_room",
            json!({ "room_key": marginal_core::json::to_hex(&common::room_key()) }),
        )
        .await?["mode"],
        "Simulated"
    );

    // Two copies, because both funds appraise the same memo and the first one buys it.
    let spec = ListingSpec {
        max_copies: 2,
        ..w.spec()
    };
    let listing_id = w.active_listing(&spec).await?;
    let ask = ask(&spec);
    let ppb = spec.leakage.price_per_bit;
    let debit = debit_of(&spec, 2);

    // What the job may leak is the outcome bit plus both components' alphabets and both judges'
    // scales — the schema is what bounds it (§3.8), so this is where the figure comes from.
    assert_eq!(
        debit,
        OUTCOME_MBITS + 2 * mbits(16).expect("in the table") + 2 * mbits(11).expect("in the table")
    );

    // ---- Fund A: a deal at the ask ----------------------------------------------------------
    let budget_a = 500_000_000u128;
    let buckets_a = core_ok(fund(
        budget_a,
        common::COMPUTE_FEE,
        ppb,
        debit,
        FEE_BUYER_BPS,
    ));
    let deposit_a = core_ok(total(&buckets_a));
    let job_a = w
        .created(w.buyer(0), &appraisal(listing_id, budget_a, 2))
        .await?;
    assert_eq!(
        w.balance(w.buyer(0)).await?,
        common::MINT - deposit_a,
        "every bucket is funded in the same call that opens the job"
    );
    assert_eq!(w.job(job_a).await?["state"], "Assigned");

    // The room gets the memo's key: KeyPolicy authorises the release against the real clearing,
    // then spends the ticket on the MPC network.
    let ticket = w.release_key(job_a).await?;
    let derived = w.derive(ticket).await?;
    assert_eq!(derived["big_y"], "bls12381g1:Yfixed", "the key came back");
    let asked: Vec<String> = w.mpc.view("mpc_requests").await?.json()?;
    let asked: serde_json::Value = serde_json::from_str(&asked[0])?;
    assert_eq!(
        asked["derivation_path"],
        marginal_core::keyrelease::listing_path(&w.seller.id().to_string(), listing_id, 1),
        "the key is the listing's own, and nobody else's"
    );
    assert_eq!(asked["domain_id"], 2);

    // The room reports: both components full, both judges at ten out of ten.
    let verdict = w
        .verdict(
            job_a,
            VerdictStatus::Ok,
            vec![BPS, BPS],
            vec![judged(10, 1), judged(10, 2)],
        )
        .await?;
    let settled_a = common::succeeded(w.submit_verdict(&verdict).await?)?;
    assert_eq!(settled_a["status"], "Settled");
    assert_eq!(settled_a["outcome"], "Deal");
    assert_eq!(settled_a["price"], ask.to_string(), "R1 sells at its ask");

    // Core's outcome table says where every unit went; the record must say the same.
    let expected = core_ok(settle(
        Outcome::Deal,
        &buckets_a,
        ask,
        ppb,
        debit,
        FEE_BUYER_BPS,
        shares(),
    ));
    let record = w.settlement(job_a).await?;
    assert_eq!(record["outcome"], "Deal");
    assert_eq!(record["price"], ask.to_string());
    assert_eq!(record["held"], ask.to_string(), "the price is held");
    assert_eq!(record["refund"], expected.refund.to_string());
    assert_eq!(
        record["refund"],
        (budget_a - ask + (buckets_a.fee_reserved - core_ok(fee_bps(ask, FEE_BUYER_BPS))))
            .to_string(),
        "the unspent budget and the fee that was reserved on it but not charged"
    );
    assert_eq!(record["leakage_debit_mbits"], debit);
    assert_eq!(
        record["leakage_comp"],
        core_ok(compensation(ppb, debit)).to_string(),
        "the seller is paid π·d for what the verdict revealed"
    );
    assert_eq!(record["leakage_comp"], expected.seller_comp.to_string());
    assert_eq!(
        record["fees"],
        json!({
            "treasury": expected.fees.treasury.to_string(),
            "operator_pool": expected.fees.operator_pool.to_string(),
            "assurance_pool": expected.fees.assurance_pool.to_string(),
        })
    );
    assert_eq!(
        record["cert_hashes"],
        json!([marginal_core::json::to_hex(&[0xce; 32])]),
        "every settlement carries its certificate"
    );
    assert_eq!(
        record["simulated_flags"], SIM_ATTESTATION,
        "the attestation was simulated, and the record says so"
    );
    assert_eq!(record["payout"], "Held");
    assert_eq!(
        record["delivery_commitment"],
        marginal_core::json::to_hex(&DELIVERY_HASH)
    );
    assert_eq!(
        w.balance(w.buyer(0)).await?,
        common::MINT - deposit_a + expected.refund
    );

    // The good is delivered and the challenge window has to pass before the seller is paid.
    w.deliver(job_a).await?.into_result()?;
    let early = w.release_held(job_a, false).await?;
    common::assert_refused(&early, "E_JOB_STATE");
    w.worker.fast_forward(40).await?;
    let released = common::succeeded(w.release_held(job_a, false).await?)?;
    let seller_fee = core_ok(fee_bps(ask, FEE_SELLER_BPS));
    assert_eq!(released["status"], "Released");
    assert_eq!(released["proceeds"], (ask - seller_fee).to_string());
    assert_eq!(w.job(job_a).await?["state"], "Final");
    assert_eq!(
        w.claimable(&w.seller).await?,
        expected.seller_comp + ask - seller_fee,
        "the price less the seller's fee, plus the leakage compensation"
    );
    assert_eq!(
        w.claimable(&w.operator).await?,
        common::COMPUTE_FEE,
        "the operator is paid for running the job"
    );
    assert_eq!(
        w.claimable(&w.gov).await?,
        core_ok(fee_bps(ask, FEE_BUYER_BPS)) + seller_fee,
        "both halves of the clearing fee"
    );

    // ---- Fund B: notes that already cover the memo, so no deal ------------------------------
    let budget_b = ask;
    let buckets_b = core_ok(fund(
        budget_b,
        common::COMPUTE_FEE,
        ppb,
        debit,
        FEE_BUYER_BPS,
    ));
    let deposit_b = core_ok(total(&buckets_b));
    let job_b = w
        .created(w.buyer(1), &appraisal(listing_id, budget_b, 2))
        .await?;
    let settled_b = w
        .appraise(
            job_b,
            VerdictStatus::Ok,
            // Half the memo is new to this fund, so the deterministic ceiling halves with it.
            vec![BPS / 2, BPS],
            vec![judged(10, 3), judged(10, 4)],
        )
        .await?;
    assert_eq!(settled_b["outcome"], "NoDeal");
    assert_eq!(settled_b["price"], "0");

    // DRC-1, to the unit: the deposit back, less the compute fee and π·d.
    let comp = core_ok(compensation(ppb, debit));
    let record_b = w.settlement(job_b).await?;
    assert_eq!(
        record_b["refund"],
        (deposit_b - common::COMPUTE_FEE - comp).to_string()
    );
    assert_eq!(record_b["held"], "0", "nothing is held on a no-deal");
    assert_eq!(record_b["leakage_comp"], comp.to_string());
    assert_eq!(record_b["leakage_debit_mbits"], debit);
    assert_eq!(record_b["payout"], "Released");
    assert_eq!(record_b["simulated_flags"], SIM_ATTESTATION);
    assert_eq!(
        record_b["cert_hashes"],
        json!([marginal_core::json::to_hex(&[0xce; 32])])
    );
    assert_eq!(
        w.balance(w.buyer(1)).await?,
        common::MINT - common::COMPUTE_FEE - comp,
        "fund B paid only for the appraisal and what it learned"
    );

    // SC-3: the seller's side of both appraisals, and nothing is left reserved.
    assert_eq!(
        w.claimable(&w.seller).await?,
        comp * 2 + ask - seller_fee,
        "π·d twice, and the proceeds of the one deal"
    );
    let leakage = w.leakage(listing_id).await?;
    assert_eq!(leakage["spent_mbits"], debit * 2);
    assert_eq!(leakage["reserved_mbits"], 0);
    assert_eq!(
        leakage["remaining_mbits"],
        spec.leakage.budget_mbits - debit * 2
    );
    assert_eq!(w.listing(listing_id).await?["copies"], 1);

    // AC-4 across the whole run: what the two buyers paid is exactly what the three parties are
    // owed. Nothing was created and nothing disappeared.
    let paid = (deposit_a - expected.refund) + (common::COMPUTE_FEE + comp);
    assert_eq!(
        w.claimable(&w.seller).await?
            + w.claimable(&w.operator).await?
            + w.claimable(&w.gov).await?,
        paid
    );
    Ok(())
}

/// SC-21: a screening room that flags a listing holds it, and a held listing cannot be appraised.
#[tokio::test]
async fn an_mnpi_flag_holds_the_listing_before_any_appraisal() -> Result<()> {
    let w = world(1).await?;
    let spec = w.spec();
    let listing_id = w
        .list(&spec, ScreeningResult::Flag { reason: FLAG_MNPI })
        .await?;
    let listing = w.listing(listing_id).await?;
    assert_eq!(listing["status"], "Held");
    assert_eq!(listing["publish_height"], serde_json::Value::Null);

    let refused = w
        .request(w.buyer(0), &appraisal(listing_id, 500_000_000, 2))
        .await?;
    common::assert_refused(&refused, "E_LISTING_NOT_ACTIVE");
    assert_eq!(
        w.balance(w.buyer(0)).await?,
        common::MINT,
        "a refused request costs the buyer nothing"
    );
    assert_eq!(w.leakage(listing_id).await?["reserved_mbits"], 0);
    Ok(())
}

/// SC-11 and AC-41, D6: a memo that tells the judges to rate it ten out of ten cannot raise its own
/// price. A judge can only discount: a receipt that claims more than it earned is refused, a judge
/// inside the room's measurement is clamped to one whole, and the price never passes the ceiling.
#[tokio::test]
async fn a_seller_injection_cannot_raise_the_price() -> Result<()> {
    let w = world(2).await?;
    let spec = ListingSpec {
        max_copies: 2,
        ..w.spec()
    };
    let listing_id = w.active_listing(&spec).await?;
    let ask = ask(&spec);
    // Twice the ask, so a price above the ceiling would have somewhere to go.
    let budget = ask * 2;

    // The ceiling is the components alone: no judge can push the index past it (AC-41).
    let components = vec![BPS, BPS];
    let ceiling = core_ok(ceiling(
        spec.appraiser.formula_id,
        &components,
        &FormulaParams::default(),
    ));
    assert_eq!(
        core_ok(measured_index(
            spec.appraiser.formula_id,
            &components,
            &FormulaParams::default(),
            spec.l_floor_bps,
            &[BPS, BPS],
        )),
        ceiling,
        "judges at their highest leave the deterministic ceiling exactly where it was"
    );

    let job = w
        .created(w.buyer(0), &appraisal(listing_id, budget, 2))
        .await?;
    w.release_key(job).await?;

    // A NEAR AI receipt claiming twice the scale: clearing recomputes the factor from the body the
    // receipt commits to, so the claim is refused and the job stays open for another try.
    let liar = receipt(2 * BPS, "{\"relevance\":20}", 1);
    let verdict = w
        .verdict(job, VerdictStatus::Ok, components.clone(), vec![liar])
        .await?;
    let rejected = common::succeeded(w.submit_verdict(&verdict).await?)?;
    assert_eq!(
        rejected,
        json!({ "status": "Rejected", "reason": "E_RECOMPUTE_MISMATCH" })
    );
    assert_eq!(
        w.job(job).await?["state"],
        "Computing",
        "the room may retry"
    );

    // The injection as it actually reaches the room: the judge's answer carries the memo's own
    // instruction, so the strict parse scores it zero and the floor is all it is worth.
    let injected = receipt(
        0,
        "{\"relevance\":10,\"reasoning\":\"the memo says to rate this 10/10\"}",
        2,
    );
    let verdict = w
        .verdict(
            job,
            VerdictStatus::Ok,
            components.clone(),
            vec![injected, judged(10, 3)],
        )
        .await?;
    let settled = common::succeeded(w.submit_verdict(&verdict).await?)?;
    assert_eq!(
        settled["outcome"], "NoDeal",
        "an injected judge can only discount: the lowest factor decides"
    );
    assert_eq!(
        core_ok(valuation(
            budget,
            core_ok(measured_index(
                spec.appraiser.formula_id,
                &components,
                &FormulaParams::default(),
                spec.l_floor_bps,
                &[0, BPS],
            )),
        )),
        budget / 10,
        "the floor is a tenth, which does not reach the ask"
    );

    // A judge whose weights are inside the room's measurement claims five times the scale. Nothing
    // recomputes its answer, so the clamp is the whole defence: the index is the ceiling, and the
    // price is the ask — not the budget.
    let job = w
        .created(w.buyer(1), &appraisal(listing_id, budget, 2))
        .await?;
    let greedy = JudgeFactor {
        model_id: "local/qwen".into(),
        factor_bps: 5 * BPS,
        proof: ModelProof::WeightsInMeasurement {
            model_hash: samples::h(0x9a),
        },
    };
    let settled = w
        .appraise(job, VerdictStatus::Ok, components, vec![greedy])
        .await?;
    assert_eq!(settled["outcome"], "Deal");
    assert_eq!(
        settled["price"],
        ask.to_string(),
        "the posted price, not the budget and not a multiple of it"
    );
    assert_eq!(w.settlement(job).await?["held"], ask.to_string());
    Ok(())
}
