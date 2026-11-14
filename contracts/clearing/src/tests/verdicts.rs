//! E6.1 and E6.2: `submit_verdict` in Open mode, and the judge receipts behind it.

use super::*;

/// The price is clearing's, not the room's: it recomputes `m` and the rule from the published
/// components and factors (AC-1).
#[test]
fn a_deal_is_priced_by_clearing_from_what_the_room_published() {
    let mut c = contract();
    let (listing_id, job_id) = computing(&mut c);
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    call_as(OPERATOR, no_deposit());
    let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));

    assert_eq!(answer["status"], "Settled");
    assert_eq!(answer["outcome"], "Deal");
    assert_eq!(answer["price"], "400000000", "the listing's ask");
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Deal");

    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["outcome"], "Deal");
    assert_eq!(record["held"], "400000000");
    assert_eq!(record["payout"], "Held");
    assert_eq!(record["cert_hashes"], json!([to_hex(&[0xce; 32])]));
    assert_eq!(record["delivery_commitment"], to_hex(&[0xd1; 32]));
    assert!(record["held_until"].as_u64().unwrap() >= NOW + 600);
    assert_eq!(
        record["simulated_flags"], 0,
        "a real attestation and real receipts"
    );

    // The seller is owed its leakage compensation, the operator its compute fee.
    let leakage = c.get_leakage(U64(listing_id)).unwrap();
    assert_eq!(leakage["reserved_mbits"], 0, "the reservation was spent");
    assert!(leakage["spent_mbits"].as_u64().unwrap() > 0);
    assert_eq!(
        c.get_claimable(account(SELLER), account(TOKEN)).0,
        record["leakage_comp"]
            .as_str()
            .unwrap()
            .parse::<u128>()
            .unwrap()
    );
    assert_eq!(c.get_claimable(account(OPERATOR), account(TOKEN)), U128(10));
    // The listing sold its only copy.
    assert_eq!(status(&c, listing_id), "SoldOut");
    let logged = events();
    assert!(logged.iter().any(|e| e["event"] == "verdict_accepted"));
    assert!(logged.iter().any(|e| e["event"] == "job_settled"));
    assert!(logged.iter().any(|e| e["event"] == "leakage_debited"));
}

/// A judge that scores low enough makes the valuation fall under the ask: no deal, and the buyer
/// gets the budget back.
#[test]
fn a_low_score_ends_in_no_deal_and_a_refund() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(1)]);
    call_as(OPERATOR, no_deposit());
    let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));

    assert_eq!(answer["outcome"], "NoDeal");
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "NoDeal");
    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["held"], "0");
    assert_eq!(record["payout"], "Released");
    // The budget comes back; the room is still paid for what it read.
    let refund: u128 = record["refund"].as_str().unwrap().parse().unwrap();
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)).0,
        before + refund
    );
    assert!(record["leakage_comp"].as_str().unwrap() != "0");
}

#[test]
fn a_restricted_or_rejected_verdict_ends_the_job_without_a_price() {
    for (status, outcome, state) in [
        (VerdictStatus::Restricted, "Restricted", "Restricted"),
        (
            VerdictStatus::InputRejected,
            "InputRejected",
            "InputRejected",
        ),
        (VerdictStatus::InputError, "InputRejected", "InputRejected"),
    ] {
        let mut c = contract();
        let (_, job_id) = computing(&mut c);
        let verdict = verdict_for(&c, job_id, status, vec![]);
        call_as(OPERATOR, no_deposit());
        let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
        assert_eq!(answer["outcome"], outcome);
        assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], state);
        let record = c.get_settlement(U64(job_id)).unwrap();
        assert_eq!(record["price"], "0");
        // `Restricted` pays for the one bit it revealed; `InputRejected` reveals nothing.
        let comp: u128 = record["leakage_comp"].as_str().unwrap().parse().unwrap();
        assert_eq!(comp > 0, outcome == "Restricted", "{outcome}");
    }
}

/// Only the room the job was given to, still current, with a signature over these exact bytes.
#[test]
fn a_verdict_must_come_from_the_room_that_holds_the_job() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10)]);

    let impostor = SigningKey::from_bytes(&[8; 32]);
    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || {
        let forged = Base64VecU8(
            impostor
                .sign(&verdict_signing_bytes(&verdict))
                .to_bytes()
                .to_vec(),
        );
        c.submit_verdict(b64(&verdict), forged);
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || {
        c.submit_verdict(b64(&verdict), Base64VecU8(vec![1, 2, 3]));
    });
    let other_room = VerdictV1 {
        room_key: impostor.verifying_key().to_bytes(),
        ..verdict.clone()
    };
    call_as(OPERATOR, no_deposit());
    expect_panic("E_ROOM_NOT_ASSIGNED", || {
        let sig = Base64VecU8(
            impostor
                .sign(&verdict_signing_bytes(&other_room))
                .to_bytes()
                .to_vec(),
        );
        c.submit_verdict(b64(&other_room), sig);
    });
    // A room whose attestation has lapsed cannot report.
    call_at(
        OPERATOR,
        no_deposit(),
        HEIGHT,
        NOW + MAX_ATTESTATION_SECS + 1,
    );
    expect_panic("E_ROOM_REVOKED", || {
        c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    });
}

#[test]
fn a_verdict_must_name_this_chain_this_contract_and_this_job() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let good = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10)]);
    type Edit = (&'static str, Box<dyn Fn(&mut VerdictV1)>);
    let edits: Vec<Edit> = vec![
        (
            "E_BINDING",
            Box::new(|v: &mut VerdictV1| v.chain_id = "mainnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|v: &mut VerdictV1| v.clearing = "other.testnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|v: &mut VerdictV1| v.domain = [0; 16]),
        ),
        ("E_BINDING", Box::new(|v: &mut VerdictV1| v.listing_id += 1)),
        (
            "E_BINDING",
            Box::new(|v: &mut VerdictV1| v.listing_version += 1),
        ),
        (
            "E_COMMITMENT_MISMATCH",
            Box::new(|v: &mut VerdictV1| v.job_commitment = [0xaa; 32]),
        ),
    ];
    for (code, edit) in edits {
        let mut bad = good.clone();
        edit(&mut bad);
        call_as(OPERATOR, no_deposit());
        expect_panic(code, || {
            c.submit_verdict(b64(&bad), sign_verdict(&bad));
        });
    }
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || {
        let mut other = good.clone();
        other.job_id = 999;
        c.submit_verdict(b64(&other), sign_verdict(&other));
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_DECODE", || {
        c.submit_verdict(Base64VecU8(vec![1]), sign_verdict(&good));
    });
    // A job that is not `Computing` has no key out yet, or has already settled.
    call_as(OPERATOR, no_deposit());
    c.submit_verdict(b64(&good), sign_verdict(&good));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.submit_verdict(b64(&good), sign_verdict(&good));
    });
}

/// A signed verdict that does not check out is **rejected, not settled**: the job stays open so the
/// room can try again before the deadline (SDD §3.17).
#[test]
fn a_verdict_that_does_not_check_out_leaves_the_job_open() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let good = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10)]);
    type Edit = (&'static str, Box<dyn Fn(&mut VerdictV1)>);
    let edits: Vec<Edit> = vec![
        // A deal has to say where the good went, and every verdict carries its certificate.
        (
            "E_DELIVERY_MISSING",
            Box::new(|v: &mut VerdictV1| v.delivery_commitment = None),
        ),
        (
            "E_CERT_MISSING",
            Box::new(|v: &mut VerdictV1| v.cert_hash = [0; 32]),
        ),
        // The appraiser and the schema are the listing's.
        (
            "E_SCHEMA",
            Box::new(|v: &mut VerdictV1| v.appraiser.version = 9),
        ),
        (
            "E_SCHEMA",
            Box::new(|v: &mut VerdictV1| {
                v.open.as_mut().unwrap().components = vec![10_000];
            }),
        ),
        ("E_SCHEMA", Box::new(|v: &mut VerdictV1| v.open = None)),
        (
            "E_DISPLAY_DISABLED",
            Box::new(|v: &mut VerdictV1| {
                v.open.as_mut().unwrap().shown =
                    vec![marginal_core::verdict::ShownField { id: 1, index: 0 }];
            }),
        ),
        // The mode is bound into `job_commitment`, so an Open job answered in Sealed mode is a
        // schema refusal, whatever the sealed body says. E10's own tests cover the Sealed path.
        (
            "E_SCHEMA",
            Box::new(|v: &mut VerdictV1| v.privacy = VerdictPrivacy::Sealed),
        ),
        (
            "E_SCHEMA",
            Box::new(|v: &mut VerdictV1| v.status = VerdictStatus::SchemaFailure),
        ),
        // The room's own factor must be the one the receipt supports.
        (
            "E_RECOMPUTE_MISMATCH",
            Box::new(|v: &mut VerdictV1| {
                v.open.as_mut().unwrap().factors[0].factor_bps = 9_999;
            }),
        ),
    ];
    for (code, edit) in edits {
        let mut bad = good.clone();
        edit(&mut bad);
        call_as(OPERATOR, no_deposit());
        let answer = c.submit_verdict(b64(&bad), sign_verdict(&bad));
        assert_eq!(
            answer,
            json!({"status": "Rejected", "reason": code}),
            "{code}"
        );
        assert_eq!(
            c.get_job(U64(job_id)).unwrap()["state"],
            "Computing",
            "{code}: the job is still open"
        );
        assert!(
            c.get_settlement(U64(job_id)).is_none(),
            "{code}: nothing settled"
        );
        assert_eq!(events()[0]["event"], "verdict_rejected");
    }
    // And the good one still settles afterwards.
    call_as(OPERATOR, no_deposit());
    assert_eq!(
        c.submit_verdict(b64(&good), sign_verdict(&good))["status"],
        "Settled"
    );
}

// ---------------------------------------------------------------------------------------------
// E6.2: judge receipts

/// A receipt must be signed by a registered, unexpired signer for the model it names, commit to
/// the body it carries, parse to the factor the room claimed, and never have been used before.
#[test]
fn every_receipt_check_refuses_on_its_own_code() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);

    let cases: Vec<(&str, JudgeFactor)> = vec![
        // Signed by a key nobody registered.
        ("E_RECEIPT_SIGNER", {
            let mut factor = judged(10);
            if let ModelProof::NearAiReceipt { sig65, .. } = &mut factor.proof {
                sig65[10] ^= 1;
            }
            factor
        }),
        // A model the signer is not registered for.
        (
            "E_MODEL_NOT_ALLOWED",
            JudgeFactor {
                model_id: "z-ai/glm-5.3-flash".into(),
                ..judged(10)
            },
        ),
        // The text does not commit to this body.
        (
            "E_RECEIPT_BODY_HASH",
            JudgeFactor {
                proof: sign_receipt("chat-42 response=deadbeef", r#"{"relevance":10}"#),
                ..judged(10)
            },
        ),
        // The body parses to something else than the factor claimed.
        (
            "E_RECOMPUTE_MISMATCH",
            JudgeFactor {
                proof: receipt(r#"{"relevance":4}"#),
                ..judged(10)
            },
        ),
        // Reasoning in a published body is refused outright (DR-13), so it scores zero.
        (
            "E_RECOMPUTE_MISMATCH",
            JudgeFactor {
                proof: receipt(r#"{"reasoning_content":"because","relevance":10}"#),
                ..judged(10)
            },
        ),
    ];
    for (code, factor) in cases {
        let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![factor]);
        call_as(OPERATOR, no_deposit());
        let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
        assert_eq!(answer["reason"], code, "{answer}");
    }

    // An expired signer is no signer.
    call_at(OPERATOR, no_deposit(), HEIGHT, NOW + 3_600);
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10)]);
    let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    assert_eq!(answer["reason"], "E_RECEIPT_SIGNER");
}

/// One receipt, one job: a text that has been used cannot be used again (§3.16).
#[test]
fn a_receipt_cannot_be_used_twice() {
    let mut c = contract();
    let (listing_id, job_id) = computing(&mut c);
    let factor = judged(10);
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![factor.clone()]);
    call_as(OPERATOR, no_deposit());
    assert_eq!(
        c.submit_verdict(b64(&verdict), sign_verdict(&verdict))["status"],
        "Settled"
    );

    // A second job, with the same receipt.
    call_as(SELLER, no_deposit());
    let mut listing = c.listing(listing_id);
    listing.status = marginal_core::ListingStatus::Active;
    listing.copies = 0;
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );
    call_as(BUYER, no_deposit());
    let second = created(&c.request_appraisal(b64(&request(listing_id))));
    let commitment = c.get_job(U64(second)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(second, to_hex(&room_key()), path, commitment, json!("M"));

    let replayed = verdict_for(&c, second, VerdictStatus::Ok, vec![factor]);
    call_as(OPERATOR, no_deposit());
    let answer = c.submit_verdict(b64(&replayed), sign_verdict(&replayed));
    assert_eq!(answer["reason"], "E_RECEIPT_REPLAY");
}

/// A judge whose weights are in the room's measurement needs no receipt; a simulated one is
/// flagged on chain and cannot raise a price.
#[test]
fn the_other_two_kinds_of_judge_proof() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let in_measurement = JudgeFactor {
        model_id: "knowledge-local".into(),
        factor_bps: 10_000,
        proof: ModelProof::WeightsInMeasurement {
            model_hash: [0x77; 32],
        },
    };
    let simulated = JudgeFactor {
        model_id: "sim".into(),
        factor_bps: 10_000,
        proof: ModelProof::Simulated {
            signer: "sandbox".into(),
        },
    };
    let verdict = verdict_for(
        &c,
        job_id,
        VerdictStatus::Ok,
        vec![in_measurement, simulated],
    );
    call_as(OPERATOR, no_deposit());
    let answer = c.submit_verdict(b64(&verdict), sign_verdict(&verdict));

    // The simulated judge resolves to the listing's floor (10%), so the valuation is far under the
    // ask and the deal does not happen.
    assert_eq!(answer["outcome"], "NoDeal");
    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(
        record["simulated_flags"], 2,
        "the judge was simulated; the attestation was not"
    );

    // A room registered under a simulated attestation sets the other bit (§6.3 rule 2).
    let mut c = contract();
    with_simulated_room(&mut c);
    let listing_id = active(&mut c);
    fund_buyer(&mut c, 10_000_000_000);
    register_judge(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(job_id, to_hex(&room_key()), path, commitment, json!("M"));
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    call_as(OPERATOR, no_deposit());
    c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    assert_eq!(
        c.get_settlement(U64(job_id)).unwrap()["simulated_flags"],
        1,
        "the attestation was simulated"
    );
}

/// Two more ways a signed verdict fails to check out: a sealed body in Open mode, and components
/// the formula cannot price.
#[test]
fn a_verdict_the_formula_cannot_price_is_rejected() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let good = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10)]);

    let mut sealed_too = good.clone();
    sealed_too.sealed = Some(marginal_core::verdict::SealedBody {
        commitment: [1; 32],
        shown: vec![],
        outcome: marginal_core::Outcome::Deal,
        price: 1,
        proof: vec![],
    });
    call_as(OPERATOR, no_deposit());
    assert_eq!(
        c.submit_verdict(b64(&sealed_too), sign_verdict(&sealed_too))["reason"],
        "E_SCHEMA"
    );

    let mut out_of_range = good.clone();
    out_of_range.open.as_mut().unwrap().components = vec![10_001, 10_000];
    call_as(OPERATOR, no_deposit());
    assert_eq!(
        c.submit_verdict(b64(&out_of_range), sign_verdict(&out_of_range))["reason"],
        "E_SCHEMA",
        "a component above 100% is not a score"
    );
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Computing");
}

/// The listing is exhausted when what is left of its budget cannot pay for another job (§3.8).
#[test]
fn a_listing_whose_budget_runs_out_stops_selling() {
    let mut c = contract();
    let (listing_id, job_id) = computing(&mut c);
    // Leave just under one more job's worth of budget.
    let mut listing = c.listing(listing_id);
    let reserved = listing.leakage.reserved_mbits;
    listing.leakage.budget_mbits = reserved + 999;
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );

    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    call_as(OPERATOR, no_deposit());
    c.submit_verdict(b64(&verdict), sign_verdict(&verdict));

    assert_eq!(status(&c, listing_id), "Exhausted");
    let logged = events();
    let status_event = logged
        .iter()
        .find(|e| e["event"] == "listing_status")
        .unwrap();
    assert_eq!(status_event["data"][0]["status"], "Exhausted");
}

/// The last two ways a receipt or a rule can fail: a signature nothing can be recovered from, and
/// a stored rule whose price is not a price.
#[test]
fn a_signature_that_recovers_nothing_and_a_rule_that_prices_nothing() {
    let mut c = contract();
    let (listing_id, job_id) = computing(&mut c);

    // A recovery byte outside 0..=3 (which the host would abort on), and a signature nothing can
    // be recovered from at all.
    for bad in [[0xff; 65], [0u8; 65]] {
        let mut factor = judged(10);
        if let ModelProof::NearAiReceipt { sig65, .. } = &mut factor.proof {
            *sig65 = bad;
        }
        let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![factor]);
        call_as(OPERATOR, no_deposit());
        assert_eq!(
            c.submit_verdict(b64(&verdict), sign_verdict(&verdict))["reason"],
            "E_RECEIPT_SIGNER"
        );
    }

    // A listing stored with an ask of nothing cannot be priced (`create_listing` refuses one).
    let mut listing = c.listing(listing_id);
    listing.rule = PricingRule::Posted { ask: 0 };
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10)]);
    call_as(OPERATOR, no_deposit());
    assert_eq!(
        c.submit_verdict(b64(&verdict), sign_verdict(&verdict))["reason"],
        "E_RULE_PARAMS"
    );
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Computing");
}

/// The reservation's counters are checked, not wrapped (SDD §3.8).
#[test]
fn a_debit_that_does_not_add_up_is_refused() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let mut listing = c.listing(listing_id);

    // More released than was ever reserved.
    expect_panic("E_ARITHMETIC", || {
        let mut over = listing.clone();
        c.debit_leakage(&mut over, 1_000, 1_000);
    });
    // Spending that would pass the end of the counter.
    listing.leakage.reserved_mbits = 2_000;
    listing.leakage.spent_mbits = u64::MAX;
    expect_panic("E_ARITHMETIC", || {
        let mut over = listing.clone();
        c.debit_leakage(&mut over, 2_000, 2_000);
    });
}
