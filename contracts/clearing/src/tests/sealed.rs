//! E10.2: Sealed verdicts, checked by a Groth16 proof instead of a recompute (SDD §3.17, D10).
//!
//! The proofs are committed in `fixtures/groth16-vectors.json` under `sealed`, because making one
//! needs the circuit, the witness generator and the proving key — none of which a unit test can
//! have. They are made for **this** job: the public inputs include the `job_commitment` the helper
//! below builds, so a change to the request, the budget or the listing invalidates them, and
//! `the_fixtures_are_made_for_this_job` is what says so instead of a pairing failure.

use super::*;
use marginal_core::groth16::{decimal_le, ProofJson, VerifyingKeyJson};
use marginal_core::verdict::{SealedBody, ShownField};

/// The committed vectors.
fn vectors() -> Value {
    near_sdk::serde_json::from_str(include_str!("../../../../fixtures/groth16-vectors.json"))
        .expect("the groth16 vectors parse")
}

/// The verifying key, in the prepared bytes `set_verifying_key` takes.
fn prepared_key() -> Base64VecU8 {
    let key: VerifyingKeyJson =
        near_sdk::serde_json::from_value(vectors()["vkey"].clone()).expect("a verifying key");
    Base64VecU8(key.prepare().expect("it prepares"))
}

/// One committed proof: what it proves, and the job it was made for.
struct Fixture {
    commitment: [u8; 32],
    proof: Vec<u8>,
    outcome: Outcome,
    price: u128,
}

fn fixture(name: &str) -> Fixture {
    let case = vectors()["sealed"][name].clone();
    let inputs = &case["inputs"];
    let proof: ProofJson =
        near_sdk::serde_json::from_value(case["proof"].clone()).expect("a proof");
    Fixture {
        commitment: decimal_le(case["commitment"].as_str().expect("a decimal"))
            .expect("it fits the field"),
        proof: proof.encode().expect("it encodes"),
        outcome: match inputs["outcome"].as_str().expect("a decimal") {
            "1" => Outcome::Deal,
            _ => Outcome::NoDeal,
        },
        price: inputs["price"]
            .as_str()
            .expect("a decimal")
            .parse()
            .expect("an amount"),
    }
}

/// A Sealed job waiting for its verdict, with the verifying key in place.
fn sealed_computing(c: &mut Clearing) -> (u64, u64) {
    let listing_id = ready(c);
    call_as(GOV, no_deposit());
    c.set_verifying_key(prepared_key());
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&AppraisalRequest {
        privacy: VerdictPrivacy::Sealed,
        ..request(listing_id)
    })));
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(job_id, to_hex(&room_key()), path, commitment, json!("M"));
    (listing_id, job_id)
}

/// The verdict a room signs for a Sealed job, from one of the committed proofs.
fn sealed_verdict(c: &Clearing, job_id: u64, case: &Fixture) -> VerdictV1 {
    let job: Job = crate::store::get(crate::store::Table::Job, &crate::store::num(job_id)).unwrap();
    let listing = c.listing(job.listing_id);
    VerdictV1 {
        domain: VerdictV1::DOMAIN,
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        job_commitment: job.job_commitment,
        listing_id: job.listing_id,
        listing_version: job.listing_version,
        appraiser: listing.appraiser.clone(),
        status: VerdictStatus::Ok,
        privacy: VerdictPrivacy::Sealed,
        open: None,
        sealed: Some(SealedBody {
            commitment: case.commitment,
            shown: vec![],
            outcome: case.outcome,
            price: case.price,
            proof: case.proof.clone(),
        }),
        delivery_commitment: Some([0xd1; 32]),
        cert_hash: [0xce; 32],
        room_key: room_key(),
        nonce: [0x5b; 16],
        t_start: HEIGHT,
        t_end: HEIGHT + 1,
    }
}

fn submit(c: &mut Clearing, verdict: &VerdictV1) -> Value {
    call_as(OPERATOR, no_deposit());
    c.submit_verdict(b64(verdict), sign_verdict(verdict))
}

/// The guard on every test below: the committed proofs are bound to this job's commitment, and to
/// the budget, ask and floor its public inputs were taken from.
#[test]
fn the_fixtures_are_made_for_this_job() {
    let mut c = contract();
    let (listing_id, job_id) = sealed_computing(&mut c);
    let job = c.get_job(U64(job_id)).unwrap();
    let listing = c.get_listing(U64(listing_id)).unwrap();
    for name in ["deal", "nodeal"] {
        let case = vectors()["sealed"][name].clone();
        assert_eq!(
            job["job_commitment"], case["job_commitment"],
            "{name}: regenerate the fixture — `cargo test -p clearing the_fixtures_are_made_for_this_job -- --nocapture` prints what to prove, and `node circuits/prove.mjs` proves it"
        );
        assert_eq!(job["buckets"]["budget"], case["inputs"]["budget"], "{name}");
        assert_eq!(
            listing["rule"]["Posted"]["ask"], case["inputs"]["ask"],
            "{name}"
        );
        assert_eq!(
            listing["l_floor_bps"].as_u64().unwrap().to_string(),
            case["inputs"]["l_floor"].as_str().unwrap(),
            "{name}"
        );
    }
    println!("SEALED job_commitment={}", job["job_commitment"]);
    println!("SEALED budget={}", job["buckets"]["budget"]);
    println!("SEALED listing={listing}");
}

/// What a Sealed deal settles to: the price the proof carries, and nothing about the measurement.
#[test]
fn a_sealed_deal_settles_on_the_proof_alone() {
    let mut c = contract();
    let (listing_id, job_id) = sealed_computing(&mut c);
    let case = fixture("deal");
    let verdict = sealed_verdict(&c, job_id, &case);
    let answer = submit(&mut c, &verdict);

    assert_eq!(answer["status"], "Settled", "{answer}");
    assert_eq!(answer["outcome"], "Deal");
    assert_eq!(answer["price"], "400000000", "the listing's ask");
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Deal");

    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["held"], "400000000");
    // Sealed mode's record keeps the commitment instead of the components (§3.3).
    assert_eq!(
        record["components_commitment"],
        to_hex(&case.commitment),
        "the settlement is what a later opening is replayed against"
    );
    assert_eq!(
        record["leakage_debit_mbits"], 1_000,
        "a deal spends the whole reservation, sealed or not"
    );
    assert!(
        record["leakage_comp"].as_str().unwrap() != "0",
        "the seller is compensated"
    );
    assert_eq!(status(&c, listing_id), "SoldOut");
    assert!(events().iter().any(|e| e["event"] == "verdict_accepted"));
}

/// The same job, a proof of the other outcome: no deal, the budget back, the room still paid.
#[test]
fn a_sealed_no_deal_refunds_the_buyer() {
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let before = c.get_balance(account(BUYER), account(TOKEN)).0;
    let case = fixture("nodeal");
    let verdict = sealed_verdict(&c, job_id, &case);
    let answer = submit(&mut c, &verdict);

    assert_eq!(answer["outcome"], "NoDeal", "{answer}");
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "NoDeal");
    let record = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(record["held"], "0");
    let refund: u128 = record["refund"].as_str().unwrap().parse().unwrap();
    assert_eq!(
        c.get_balance(account(BUYER), account(TOKEN)).0,
        before + refund
    );
    assert_eq!(record["components_commitment"], to_hex(&case.commitment));
    assert_eq!(record["leakage_debit_mbits"], 1_000);
}

/// An Open verdict's record has no commitment: the components are published instead.
#[test]
fn an_open_settlement_has_no_commitment() {
    let mut c = contract();
    let (_, job_id) = computing(&mut c);
    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    submit(&mut c, &verdict);
    assert_eq!(
        c.get_settlement(U64(job_id)).unwrap()["components_commitment"],
        Value::Null
    );
}

/// A valid proof of the other outcome does not prove this one. The pairing fails, the verdict is
/// rejected, and the job stays open so the room can send the right one (§3.17).
#[test]
fn a_proof_of_another_outcome_is_refused_and_the_job_stays_open() {
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let real = fixture("nodeal");
    let mut verdict = sealed_verdict(&c, job_id, &real);
    // The no-deal proof, dressed as a deal at the ask.
    let body = verdict.sealed.as_mut().unwrap();
    body.outcome = Outcome::Deal;
    body.price = 400_000_000;
    let answer = submit(&mut c, &verdict);

    assert_eq!(answer["status"], "Rejected", "{answer}");
    assert_eq!(answer["reason"], "E_PROOF_INVALID");
    assert_eq!(
        c.get_job(U64(job_id)).unwrap()["state"],
        "Computing",
        "a rejected verdict leaves the job open"
    );
    assert!(c.get_settlement(U64(job_id)).is_none());
    let logged = events();
    assert!(logged.iter().any(|e| e["event"] == "verdict_rejected"));
    assert!(logged.iter().all(|e| e["event"] != "job_settled"));
}

/// Until governance has set a key there is nothing to check a Sealed verdict against, and the
/// contract says so rather than settling on the room's word.
#[test]
fn a_sealed_verdict_without_a_verifying_key_is_refused() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&AppraisalRequest {
        privacy: VerdictPrivacy::Sealed,
        ..request(listing_id)
    })));
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(job_id, to_hex(&room_key()), path, commitment, json!("M"));

    let verdict = sealed_verdict(&c, job_id, &fixture("deal"));
    let answer = submit(&mut c, &verdict);
    assert_eq!(answer["reason"], "E_PROOF_DISABLED", "{answer}");
}

/// The mode is bound into `job_commitment`, so neither body can answer the other's job, and a
/// verdict that carries both is malformed.
#[test]
fn a_sealed_job_takes_a_sealed_body_and_nothing_else() {
    let case = fixture("deal");
    // An Open verdict for a Sealed job.
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let mut verdict = sealed_verdict(&c, job_id, &case);
    verdict.privacy = VerdictPrivacy::Open;
    verdict.open = Some(OpenBody {
        components: vec![10_000, 10_000],
        factors: vec![],
        shown: vec![],
    });
    verdict.sealed = None;
    assert_eq!(submit(&mut c, &verdict)["reason"], "E_SCHEMA");

    // Both bodies at once.
    let mut both = sealed_verdict(&c, job_id, &case);
    both.open = Some(OpenBody {
        components: vec![10_000, 10_000],
        factors: vec![],
        shown: vec![],
    });
    assert_eq!(submit(&mut c, &both)["reason"], "E_SCHEMA");

    // Sealed, with no sealed body.
    let mut empty = sealed_verdict(&c, job_id, &case);
    empty.sealed = None;
    assert_eq!(submit(&mut c, &empty)["reason"], "E_SCHEMA");

    // A body can only say deal or no deal: the circuit proves one bit.
    let mut restricted = sealed_verdict(&c, job_id, &case);
    restricted.sealed.as_mut().unwrap().outcome = Outcome::Restricted;
    assert_eq!(submit(&mut c, &restricted)["reason"], "E_SCHEMA");

    // A status that has no price to prove must come with no body at all.
    let mut both_ways = sealed_verdict(&c, job_id, &case);
    both_ways.status = VerdictStatus::Restricted;
    assert_eq!(submit(&mut c, &both_ways)["reason"], "E_SCHEMA");

    // And a schema failure is a refusal, not an outcome.
    let mut broken = sealed_verdict(&c, job_id, &case);
    broken.status = VerdictStatus::SchemaFailure;
    broken.sealed = None;
    assert_eq!(submit(&mut c, &broken)["reason"], "E_SCHEMA");

    // A Sealed body on an Open job.
    let mut open_job = contract();
    let (_, open_id) = computing(&mut open_job);
    let mut sealed = sealed_verdict(&open_job, open_id, &case);
    sealed.privacy = VerdictPrivacy::Open;
    assert_eq!(submit(&mut open_job, &sealed)["reason"], "E_SCHEMA");
}

/// M1 shows no fields, and a Sealed verdict is the one that must show none: the proof says nothing
/// about the scores, so a shown field would be the room's unchecked word.
#[test]
fn a_sealed_verdict_cannot_show_a_field() {
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let mut verdict = sealed_verdict(&c, job_id, &fixture("deal"));
    verdict.sealed.as_mut().unwrap().shown = vec![ShownField { id: 1, index: 2 }];
    assert_eq!(submit(&mut c, &verdict)["reason"], "E_DISPLAY_DISABLED");
}

/// A deal must say where the good went, in Sealed mode as in Open (§3.18).
#[test]
fn a_sealed_deal_must_carry_a_delivery_commitment() {
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let mut verdict = sealed_verdict(&c, job_id, &fixture("deal"));
    verdict.delivery_commitment = None;
    assert_eq!(submit(&mut c, &verdict)["reason"], "E_DELIVERY_MISSING");
}

/// One verifying key, one rule. R1 is the only rule M1 publishes, so this is reached by changing
/// the stored listing: a key for another rule would prove the wrong statement.
#[test]
fn a_sealed_verdict_is_only_checked_under_the_rule_its_key_is_for() {
    let mut c = contract();
    let (listing_id, job_id) = sealed_computing(&mut c);
    let mut listing = c.listing(listing_id);
    listing.rule = PricingRule::ValueIndexed {
        p_min: 1,
        p_full: 2,
        price_quantum_bps: 100,
    };
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );
    let verdict = sealed_verdict(&c, job_id, &fixture("deal"));
    assert_eq!(submit(&mut c, &verdict)["reason"], "E_RULE_DISABLED");
}

/// The key is stored already prepared, so its shape is checked when it is set rather than on every
/// verdict. Only governance can set it.
#[test]
fn a_verifying_key_is_checked_when_it_is_set() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    c.set_verifying_key(prepared_key());
    let logged = events();
    let set = logged
        .iter()
        .find(|e| e["event"] == "verifying_key_set")
        .unwrap_or_else(|| panic!("{logged:?}"))
        .clone();
    assert_eq!(
        set["data"][0]["inputs"], 8,
        "jc_hi, jc_lo, B, ask, floor, outcome, price, C"
    );

    call_as(GOV, no_deposit());
    expect_panic("E_PROOF_INVALID", || {
        c.set_verifying_key(Base64VecU8(vec![0; 10]));
    });

    call_as(BUYER, no_deposit());
    expect_panic("only gov", || {
        c.set_verifying_key(prepared_key());
    });
}

/// A Sealed job that has nothing to price ends on the status alone: no body, no proof, no key
/// needed. Without this a restricted good in Sealed mode could only ever time out.
#[test]
fn a_sealed_job_can_end_without_a_price() {
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
        let (_, job_id) = sealed_computing(&mut c);
        let mut verdict = sealed_verdict(&c, job_id, &fixture("deal"));
        verdict.status = status;
        verdict.sealed = None;
        verdict.delivery_commitment = None;
        let answer = submit(&mut c, &verdict);
        assert_eq!(answer["outcome"], outcome, "{answer}");
        assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], state);
        let record = c.get_settlement(U64(job_id)).unwrap();
        assert_eq!(record["price"], "0");
        assert_eq!(
            record["components_commitment"],
            Value::Null,
            "there is nothing to open"
        );
    }
}

/// Every record says which toggles produced it (§6.3 rule 2), Sealed or not: the proof says nothing
/// about the hardware the measurement ran on.
#[test]
fn a_simulated_attestation_is_flagged_on_a_sealed_settlement() {
    let mut c = contract();
    with_simulated_room(&mut c);
    let listing_id = active(&mut c);
    fund_buyer(&mut c, 10_000_000_000);
    call_as(GOV, no_deposit());
    c.set_verifying_key(prepared_key());
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&AppraisalRequest {
        privacy: VerdictPrivacy::Sealed,
        ..request(listing_id)
    })));
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(job_id, to_hex(&room_key()), path, commitment, json!("M"));

    let verdict = sealed_verdict(&c, job_id, &fixture("deal"));
    let answer = submit(&mut c, &verdict);
    assert_eq!(answer["outcome"], "Deal", "{answer}");
    assert_eq!(
        c.get_settlement(U64(job_id)).unwrap()["simulated_flags"],
        1,
        "the attestation was simulated"
    );
}

/// Every verdict names its forget certificate (§3.18), and a proof does not excuse one.
#[test]
fn a_sealed_verdict_must_carry_a_certificate() {
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let mut verdict = sealed_verdict(&c, job_id, &fixture("deal"));
    verdict.cert_hash = [0; 32];
    assert_eq!(submit(&mut c, &verdict)["reason"], "E_CERT_MISSING");
}

/// The two ways verification itself cannot run. Neither can be reached through `set_verifying_key`,
/// which checks a key's shape before storing it, so the stored key is set directly here: these are
/// the refusals that stand between a corrupt state and a settlement.
#[test]
fn a_key_or_a_proof_that_cannot_be_read_is_refused_rather_than_trusted() {
    let mut c = contract();
    let (_, job_id) = sealed_computing(&mut c);
    let verdict = sealed_verdict(&c, job_id, &fixture("deal"));

    // A proof that is not 256 bytes: `verify` refuses it before spending any gas on the curve.
    let mut short = verdict.clone();
    short.sealed.as_mut().unwrap().proof.truncate(100);
    assert_eq!(submit(&mut c, &short)["reason"], "E_PROOF_INVALID");

    // A stored key that is not a key.
    c.verifying_key = vec![7; 100];
    assert_eq!(submit(&mut c, &verdict)["reason"], "E_PROOF_INVALID");
}
