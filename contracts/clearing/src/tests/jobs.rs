//! E5.5 and E5.6: `request_appraisal`, check by check, and the key release that starts the work.

use super::*;

/// The room reads the keys it has to seal a delivery to out of `get_job`, so the view has to carry
/// them — including the compliance copy, which is the one that is optional (SDD §3.19, AC-55).
#[test]
fn get_job_carries_the_keys_a_room_needs_to_deliver() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let plain = created(&c.request_appraisal(b64(&request(listing_id))));
    let job = c.get_job(U64(plain)).unwrap();
    assert_eq!(job["delivery_pk"], to_hex(&[0x11; 32]));
    assert_eq!(job["context_auth_pk"], to_hex(&[0x22; 32]));
    assert_eq!(job["compliance_pk"], Value::Null);
    assert_eq!(job["mode"], "Blind");
    assert_eq!(job["snapshot_id"], Value::Null);

    call_as(BUYER, no_deposit());
    let with_copy = created(&c.request_appraisal(b64(&AppraisalRequest {
        compliance_pk: Some([0x33; 32]),
        ..request(listing_id)
    })));
    assert_eq!(
        c.get_job(U64(with_copy)).unwrap()["compliance_pk"],
        to_hex(&[0x33; 32])
    );
}

/// The whole request: funds move, leakage is reserved, a room is assigned and the commitment is
/// the one KeyPolicy will be shown.
#[test]
fn a_request_funds_reserves_assigns_and_commits() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));

    let job = c.get_job(U64(job_id)).unwrap();
    assert_eq!(job["kind"], "Appraisal");
    assert_eq!(job["state"], "Assigned");
    assert_eq!(job["listing_id"], listing_id);
    assert_eq!(job["assigned"], json!([to_hex(&room_key())]));
    assert_eq!(job["buyer"], BUYER);
    assert_eq!(job["deadline_height"], HEIGHT + 200);
    assert_eq!(c.get_jobs_for_room(to_hex(&room_key())).len(), 1);

    let logged = events();
    let requested = logged
        .iter()
        .find(|e| e["event"] == "job_requested")
        .unwrap();
    assert_eq!(requested["data"][0]["budget"], "500000000");
    assert_eq!(
        requested["data"][0]["job_commitment"],
        job["job_commitment"]
    );
    let reserved = logged
        .iter()
        .find(|e| e["event"] == "leakage_reserved")
        .unwrap();
    assert_eq!(
        reserved["data"][0]["reserved_mbits"],
        job["max_debit_mbits"]
    );
    assert!(logged.iter().any(|e| e["event"] == "job_assigned"));
}

/// Each check in SDD §3.4's order, and each failure leaves the contract exactly as it was.
#[test]
fn every_check_refuses_without_changing_anything() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let snapshot = {
        call_as(BUYER, SNAPSHOT_FEE);
        c.anchor_snapshot(
            "Notes".into(),
            to_hex(&[0x11; 32]),
            b64(&BlobRef {
                uri_hash: [1; 32],
                sha256: [2; 32],
                size_class: 1,
            }),
            false,
        )
        .0
    };
    let before = (
        c.get_balance(account(BUYER), account(TOKEN)),
        c.get_leakage(U64(listing_id)).unwrap(),
        c.config()["next_job_id"].clone(),
    );
    let unchanged = |c: &Clearing| {
        assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), before.0);
        assert_eq!(c.get_leakage(U64(listing_id)).unwrap(), before.1);
        assert_eq!(c.config()["next_job_id"], before.2);
    };

    // The request itself must be well formed.
    for (code, request) in [
        (
            "E_RULE_PARAMS",
            AppraisalRequest {
                n_judges: 9,
                ..request(listing_id)
            },
        ),
        (
            "E_RULE_PARAMS",
            AppraisalRequest {
                budget: 0,
                ..request(listing_id)
            },
        ),
        (
            "E_DISPLAY_DISABLED",
            AppraisalRequest {
                mode: DisplayMode::Fields(vec![1]),
                ..request(listing_id)
            },
        ),
        // 1. the listing: another version, and a budget that cannot meet the ask.
        (
            "E_LISTING_NOT_ACTIVE",
            AppraisalRequest {
                listing_version: 2,
                ..request(listing_id)
            },
        ),
        (
            "E_RULE_PARAMS",
            AppraisalRequest {
                budget: 399_999_999,
                ..request(listing_id)
            },
        ),
        // 3. the snapshot: someone else's.
        (
            "E_SNAPSHOT_OWNER",
            AppraisalRequest {
                snapshot_id: Some(999),
                ..request(listing_id)
            },
        ),
    ] {
        call_as(BUYER, no_deposit());
        expect_panic(code, || {
            c.request_appraisal(b64(&request));
        });
        unchanged(&c);
    }

    // 3. a snapshot that belongs to someone else.
    call_as(SELLER, SNAPSHOT_FEE);
    let sellers = c
        .anchor_snapshot(
            "Notes".into(),
            to_hex(&[0x12; 32]),
            b64(&BlobRef {
                uri_hash: [1; 32],
                sha256: [2; 32],
                size_class: 1,
            }),
            false,
        )
        .0;
    call_as(BUYER, no_deposit());
    expect_panic("E_SNAPSHOT_OWNER", || {
        c.request_appraisal(b64(&AppraisalRequest {
            snapshot_id: Some(sellers),
            ..request(listing_id)
        }));
    });
    unchanged(&c);

    // 5. a balance that does not cover the job.
    call_as(SELLER, no_deposit());
    expect_panic("E_BALANCE_LOW", || {
        c.request_appraisal(b64(&request(listing_id)));
    });
    unchanged(&c);

    // The buyer's own snapshot works.
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&AppraisalRequest {
        snapshot_id: Some(snapshot),
        ..request(listing_id)
    })));
    assert_eq!(c.get_job(U64(job_id)).unwrap()["listing_id"], listing_id);
}

/// A snapshot must have been anchored before the job, by at least the cooling period (AC-6).
#[test]
fn a_snapshot_must_have_cooled() {
    call_as(GOV, no_deposit());
    let mut c = Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        ProfileConfig {
            cooling_blocks: 10,
            ..profile()
        },
    );
    call_as(GOV, no_deposit());
    c.set_appraiser("knowledge".into(), 1, "KnowledgeV1".into(), U128(10), true);
    let listing_id = ready(&mut c);

    call_at(BUYER, SNAPSHOT_FEE, HEIGHT, NOW);
    let snapshot = c
        .anchor_snapshot(
            "Notes".into(),
            to_hex(&[0x11; 32]),
            b64(&BlobRef {
                uri_hash: [1; 32],
                sha256: [2; 32],
                size_class: 1,
            }),
            false,
        )
        .0;
    let with_snapshot = AppraisalRequest {
        snapshot_id: Some(snapshot),
        ..request(listing_id)
    };

    call_at(BUYER, no_deposit(), HEIGHT + 9, NOW);
    expect_panic("E_SNAPSHOT_TOO_NEW", || {
        c.request_appraisal(b64(&with_snapshot));
    });
    call_at(BUYER, no_deposit(), HEIGHT + 10, NOW);
    created(&c.request_appraisal(b64(&with_snapshot)));
}

/// A listing that is not selling takes no jobs: sold out, held, or exhausted.
#[test]
fn a_listing_that_is_not_selling_takes_no_jobs() {
    let mut c = contract();
    let listing_id = ready(&mut c);

    // Sold out: `max_copies` is 1 and one copy has gone.
    let mut listing = c.listing(listing_id);
    listing.copies = listing.max_copies;
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );
    call_as(BUYER, no_deposit());
    expect_panic("E_LISTING_NOT_ACTIVE", || {
        c.request_appraisal(b64(&request(listing_id)));
    });

    // Held, after a flag.
    let (held_id, job_id) = screening_job(&mut c);
    let flag = screening_report(held_id, job_id, ScreeningResult::Flag { reason: FLAG_MNPI });
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&flag), sign(&screening_signing_bytes(&flag)));
    call_as(BUYER, no_deposit());
    expect_panic("E_LISTING_NOT_ACTIVE", || {
        c.request_appraisal(b64(&request(held_id)));
    });
    call_as(BUYER, no_deposit());
    expect_panic("E_LISTING_NOT_ACTIVE", || {
        c.request_appraisal(b64(&request(999)));
    });
    call_as(BUYER, no_deposit());
    expect_panic("E_DECODE", || {
        c.request_appraisal(Base64VecU8(vec![1, 2]));
    });
}

/// A job cannot reserve more than the listing's budget still allows (AC-12).
#[test]
fn a_request_that_would_leak_too_much_is_refused() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let mut listing = c.listing(listing_id);
    listing.leakage.reserved_mbits = listing.leakage.budget_mbits;
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &listing,
    );
    call_as(BUYER, no_deposit());
    expect_panic("E_BUDGET_EXHAUSTED", || {
        c.request_appraisal(b64(&request(listing_id)));
    });
}

/// The appraiser the listing names must still be enabled when the job is requested: governance can
/// retire one, and jobs stop rather than run on a formula nobody stands behind.
#[test]
fn a_retired_appraiser_stops_new_jobs() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(GOV, no_deposit());
    c.set_appraiser("knowledge".into(), 1, "KnowledgeV1".into(), U128(10), false);
    call_as(BUYER, no_deposit());
    expect_panic("E_FORMULA_DISABLED", || {
        c.request_appraisal(b64(&request(listing_id)));
    });
}

/// The buyer seals the context key to the room in the request (HDP, §3.12.4), and the room reads
/// it back from the contract.
#[test]
fn the_sealed_context_key_is_kept_for_the_room() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&AppraisalRequest {
        sealed_context_key: vec![9, 8, 7],
        ..request(listing_id)
    })));
    assert_eq!(
        c.get_context_key(U64(job_id)),
        Some(Base64VecU8(vec![9, 8, 7]))
    );

    call_as(BUYER, no_deposit());
    let plain = created(&c.request_appraisal(b64(&request(listing_id))));
    assert_eq!(c.get_context_key(U64(plain)), None, "a job with no context");
}

// ---------------------------------------------------------------------------------------------
// E5.6: the key release

fn authorized(c: &mut Clearing, listing_id: u64) -> (u64, [u8; 32]) {
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&hex::decode(commitment).unwrap());
    (job_id, hash)
}

#[test]
fn keypolicy_starts_the_work_and_nobody_else_can() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let (job_id, commitment) = authorized(&mut c, listing_id);
    let listing = c.listing(listing_id);
    let path = to_hex(&listing.key_path_hash);

    call_as(SELLER, no_deposit());
    expect_panic("only keypolicy", || {
        c.authorize_release(
            job_id,
            to_hex(&room_key()),
            path.clone(),
            to_hex(&commitment),
            json!("M"),
        );
    });
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(
        job_id,
        to_hex(&room_key()),
        path.clone(),
        to_hex(&commitment),
        json!("M"),
    );
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Computing");
    let logged = events();
    assert_eq!(logged[0]["event"], "key_release_authorized");
    assert_eq!(logged[0]["data"][0]["value_class"], "M");
    assert_eq!(logged[0]["data"][0]["path_hash"], path);
    assert_eq!(
        logged[0]["data"][0]["platform_hash"],
        to_hex(&ppid_hash(&PPID)),
        "what the value at risk is counted against"
    );

    // A second release for the same job is refused: it has left `Assigned`.
    call_as(KEYPOLICY, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.authorize_release(
            job_id,
            to_hex(&room_key()),
            path,
            to_hex(&commitment),
            json!("M"),
        );
    });
}

/// Every binding the release depends on: the job, the room, the commitment, the path, the class.
#[test]
fn a_release_must_match_the_job_it_names() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    let (job_id, commitment) = authorized(&mut c, listing_id);
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    let good = (
        to_hex(&room_key()),
        path.clone(),
        to_hex(&commitment),
        json!("M"),
    );

    for (code, room, path, commitment, class) in [
        (
            "E_TICKET",
            good.0.clone(),
            good.1.clone(),
            good.2.clone(),
            good.3.clone(),
        ),
        (
            "E_ROOM_NOT_ASSIGNED",
            to_hex(&[0xaa; 32]),
            good.1.clone(),
            good.2.clone(),
            good.3.clone(),
        ),
        (
            "E_DECODE",
            "zz".into(),
            good.1.clone(),
            good.2.clone(),
            good.3.clone(),
        ),
        (
            "E_COMMITMENT_MISMATCH",
            good.0.clone(),
            good.1.clone(),
            to_hex(&[0xbb; 32]),
            good.3.clone(),
        ),
        (
            "E_DECODE",
            good.0.clone(),
            good.1.clone(),
            "zz".into(),
            good.3.clone(),
        ),
        (
            "E_PATH",
            good.0.clone(),
            to_hex(&[0xcc; 32]),
            good.2.clone(),
            good.3.clone(),
        ),
        (
            "E_DECODE",
            good.0.clone(),
            "zz".into(),
            good.2.clone(),
            good.3.clone(),
        ),
        (
            "E_BINDING",
            good.0.clone(),
            good.1.clone(),
            good.2.clone(),
            json!("X"),
        ),
    ] {
        let job = if code == "E_TICKET" { 999 } else { job_id };
        call_as(KEYPOLICY, no_deposit());
        expect_panic(code, || {
            c.authorize_release(
                job,
                room.clone(),
                path.clone(),
                commitment.clone(),
                class.clone(),
            );
        });
        assert_eq!(
            c.get_job(U64(job_id)).unwrap()["state"],
            "Assigned",
            "{code}"
        );
    }
}

/// Arithmetic that cannot be trusted is refused, never wrapped: a listing whose leakage price would
/// overflow the compensation, and a budget that would overflow the buckets.
#[test]
fn a_job_that_cannot_be_priced_in_whole_units_is_refused() {
    let mut c = contract();
    with_room(&mut c);
    let absurd = ListingSpec {
        leakage: LeakageAccount {
            price_per_bit: u128::MAX,
            ..spec().leakage
        },
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    let listing_id = c.create_listing(b64(&absurd)).0;
    publish_through_screening(&mut c, listing_id);
    fund_buyer(&mut c, u128::MAX);

    call_as(BUYER, no_deposit());
    expect_panic("E_ARITHMETIC", || {
        c.request_appraisal(b64(&request(listing_id)));
    });

    // A budget that would overflow the sum of the buckets is refused in the same way.
    let listing_id = active(&mut c);
    call_as(BUYER, no_deposit());
    expect_panic("E_ARITHMETIC", || {
        c.request_appraisal(b64(&AppraisalRequest {
            budget: u128::MAX,
            ..request(listing_id)
        }));
    });
}

/// A stored listing this build cannot price or measure sells nothing. Nothing in M1 can create one
/// — `create_listing` refuses both — but a record written by an older policy or a migration could
/// exist, and a job must stop rather than run on it.
#[test]
fn a_listing_this_build_cannot_price_sells_nothing() {
    let mut c = contract();
    let listing_id = ready(&mut c);

    let mut disabled = c.listing(listing_id);
    disabled.rule = PricingRule::SurplusSplitLegacy { ask: 1 };
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &disabled,
    );
    call_as(BUYER, no_deposit());
    expect_panic("E_RULE_DISABLED", || {
        c.request_appraisal(b64(&request(listing_id)));
    });

    let mut unmeasurable = c.listing(listing_id);
    unmeasurable.rule = PricingRule::Posted { ask: 1 };
    unmeasurable.schema.component_alphabets = vec![0];
    crate::store::put(
        crate::store::Table::Listing,
        &crate::store::num(listing_id),
        &unmeasurable,
    );
    call_as(BUYER, no_deposit());
    expect_panic("E_SCHEMA_INVALID", || {
        c.request_appraisal(b64(&request(listing_id)));
    });
}
