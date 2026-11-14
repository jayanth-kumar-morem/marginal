//! D4 and SC-10: sybil probing hits the leakage wall, on a real chain.
//!
//! Many buyer identities probe one listing with a small budget. Every appraisal debits what it could
//! possibly have revealed and pays the seller π·d for it; once the listing's budget can no longer
//! cover another job, the contract refuses to open one. The same identity behind two accounts is
//! refused earlier still, by its nullifier.
//!
//! Needs `make wasm-dev`.

mod common;

use anyhow::Result;
use common::{appraisal, ask, core_ok, world, FEE_BUYER_BPS};
use marginal_core::funding::{compensation, fund, total};
use marginal_core::leakage::max_debit;
use marginal_core::listing::ListingSpec;
use marginal_core::pricing::BPS;
use marginal_core::request::AppraisalRequest;
use marginal_core::verdict::VerdictStatus;
use marginal_core::{DisplayMode, Eligibility, LeakageAccount, VerdictPrivacy};
use serde_json::json;

/// How many probes the listing's budget below pays for.
const PROBES: usize = 3;

/// SC-10, D4, AC-12 and AC-14: the wall, and the nullifier in front of it.
#[tokio::test]
async fn sybil_probing_hits_the_leakage_wall_and_pays_for_every_bit() -> Result<()> {
    // Four identities: three the budget can serve, and one that arrives too late.
    let w = world(PROBES + 1).await?;
    let base = w.spec();
    let debit = max_debit(
        &base.schema,
        &DisplayMode::Blind,
        &base.rule,
        VerdictPrivacy::Open,
        0,
    )
    .expect("an Open, Blind job under R1");
    // A budget that pays for exactly three probes, with less than one bit left over: the wall is
    // the ledger, not the listing's status.
    let budget_mbits = debit * PROBES as u64 + 1_000;
    let spec = ListingSpec {
        leakage: LeakageAccount {
            budget_mbits,
            ..base.leakage
        },
        eligibility: Eligibility {
            nullifier_gated: true,
            ..base.eligibility
        },
        ..base
    };
    let listing_id = w.active_listing(&spec).await?;
    let ppb = spec.leakage.price_per_bit;
    let ask = ask(&spec);
    let comp = core_ok(compensation(ppb, debit));
    let deposit = core_ok(total(&core_ok(fund(
        ask,
        common::COMPUTE_FEE,
        ppb,
        debit,
        FEE_BUYER_BPS,
    ))));
    let expiry = w.height().await? + 1_000;

    // Each identity probes with a budget at the ask and gets a no deal: half the good is already in
    // its own notes, so the measured value never reaches the posted price.
    for i in 0..PROBES {
        let (credential, signature) = w.nullifier(w.buyer(i), listing_id, [i as u8; 32], expiry);
        let job = w
            .created(
                w.buyer(i),
                &AppraisalRequest {
                    n_judges: 0,
                    nullifier: Some(credential),
                    nullifier_sig: Some(signature),
                    ..appraisal(listing_id, ask, 0)
                },
            )
            .await?;
        let settled = w
            .appraise(job, VerdictStatus::Ok, vec![BPS / 2, BPS], vec![])
            .await?;
        assert_eq!(settled["outcome"], "NoDeal");
        let record = w.settlement(job).await?;
        assert_eq!(
            record["leakage_debit_mbits"], debit,
            "a probe is debited what it could have revealed, whatever it learned"
        );
        assert_eq!(record["leakage_comp"], comp.to_string());
        assert_eq!(
            record["refund"],
            (deposit - common::COMPUTE_FEE - comp).to_string()
        );
        assert_eq!(
            w.balance(w.buyer(i)).await?,
            common::MINT - common::COMPUTE_FEE - comp,
            "every probe costs the prober the compute fee and the bits it bought"
        );
        assert_eq!(
            w.leakage(listing_id).await?["spent_mbits"],
            debit * (i as u64 + 1)
        );
    }

    // Σ π·d, once for every probe: the seller is paid for the reconstruction risk it ran.
    assert_eq!(w.claimable(&w.seller).await?, comp * PROBES as u128);
    let leakage = w.leakage(listing_id).await?;
    assert_eq!(leakage["spent_mbits"], debit * PROBES as u64);
    assert_eq!(leakage["reserved_mbits"], 0);
    assert_eq!(leakage["remaining_mbits"], 1_000);

    // AC-14: the same identity behind another account is the same nullifier, and it has been spent.
    let last = w.buyer(PROBES);
    let (reused, signature) = w.nullifier(last, listing_id, [0u8; 32], expiry);
    let refused = w
        .request(
            last,
            &AppraisalRequest {
                n_judges: 0,
                nullifier: Some(reused),
                nullifier_sig: Some(signature),
                ..appraisal(listing_id, ask, 0)
            },
        )
        .await?;
    common::assert_refused(&refused, "E_NULLIFIER_USED");

    // AC-12: a fresh identity gets no further. What is left of the budget cannot cover another
    // job's reservation, so the contract refuses to open one — the listing is still live, and the
    // refusal is the ledger's.
    let (fresh, signature) = w.nullifier(last, listing_id, [0xff; 32], expiry);
    let exhausted = w
        .request(
            last,
            &AppraisalRequest {
                n_judges: 0,
                nullifier: Some(fresh),
                nullifier_sig: Some(signature),
                ..appraisal(listing_id, ask, 0)
            },
        )
        .await?;
    common::assert_refused(&exhausted, "E_BUDGET_EXHAUSTED");
    assert_eq!(w.listing(listing_id).await?["status"], "Active");

    // Neither refusal cost the prober anything, spent a nullifier or moved the ledger.
    assert_eq!(w.balance(last).await?, common::MINT);
    assert_eq!(
        w.leakage(listing_id).await?,
        leakage,
        "the ledger is where the three probes left it"
    );
    assert!(
        common::view(
            &w.clearing,
            "is_nullifier_used",
            json!({
                "listing_id": listing_id.to_string(),
                "epoch": 1,
                "nullifier": marginal_core::json::to_hex(&[0u8; 32]),
            }),
        )
        .await?
        .as_bool()
        .expect("a boolean"),
        "the first identity's nullifier is spent"
    );
    assert!(
        !common::view(
            &w.clearing,
            "is_nullifier_used",
            json!({
                "listing_id": listing_id.to_string(),
                "epoch": 1,
                "nullifier": marginal_core::json::to_hex(&[0xffu8; 32]),
            }),
        )
        .await?
        .as_bool()
        .expect("a boolean"),
        "and the refused one was never spent"
    );
    Ok(())
}
