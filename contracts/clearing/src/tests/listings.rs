//! E4.4 to E4.6: listings from `create_listing` to `Active`, and snapshots.

use super::*;

#[test]
fn a_listing_starts_in_draft_with_its_key_path_fixed() {
    let mut c = contract();
    with_room(&mut c);
    let id = draft(&mut c);

    let listing = c.get_listing(U64(id)).unwrap();
    assert_eq!(listing["seller"], SELLER);
    assert_eq!(listing["status"], "Draft");
    assert_eq!(listing["version"], 1);
    assert_eq!(listing["appraiser"], "knowledge@1");
    assert_eq!(listing["pk_l"], Value::Null);
    assert_eq!(listing["copies"], 0);
    // The key path is the one KeyPolicy derives for (seller, listing, version).
    let path = marginal_core::keyrelease::listing_path(&SELLER.to_string(), id, 1);
    assert_eq!(
        listing["key_path_hash"],
        to_hex(&marginal_core::keyrelease::path_hash(&path))
    );
    assert_eq!(
        listing["schema_hash"],
        to_hex(&marginal_core::codec::hash_of(&schema()))
    );
    assert_eq!(listing["leakage"]["remaining_mbits"], 100_000);
    assert_eq!(c.get_listing(U64(999)), None);

    let logged = events();
    assert_eq!(logged[0]["event"], "listing_created");
    assert_eq!(logged[0]["data"][0]["asset_class"], "Knowledge");
}

#[test]
fn a_listing_must_pass_cores_own_checks() {
    let mut c = contract();
    for (code, edit) in [
        (
            "E_FREE_TEXT_FIELD",
            Box::new(|s: &mut ListingSpec| s.schema.component_alphabets[0] = 0)
                as Box<dyn FnOnce(&mut ListingSpec)>,
        ),
        (
            "E_RULE_PARAMS",
            Box::new(|s: &mut ListingSpec| s.rule = PricingRule::Posted { ask: 0 }),
        ),
        (
            "E_RULE_DISABLED",
            Box::new(|s: &mut ListingSpec| s.rule = PricingRule::SurplusSplitLegacy { ask: 1 }),
        ),
        (
            "E_RULE_PARAMS",
            Box::new(|s: &mut ListingSpec| s.max_copies = 0),
        ),
        (
            "E_RULE_PARAMS",
            Box::new(|s: &mut ListingSpec| s.challenge_window_blocks = 0),
        ),
        (
            "E_BUDGET_EXHAUSTED",
            Box::new(|s: &mut ListingSpec| s.leakage.budget_mbits = 0),
        ),
        (
            "E_RULE_PARAMS",
            Box::new(|s: &mut ListingSpec| s.leakage.spent_mbits = 5),
        ),
    ] {
        let mut spec = spec();
        edit(&mut spec);
        call_as(SELLER, LISTING_FEE);
        expect_panic(code, || {
            c.create_listing(b64(&spec));
        });
    }
    call_as(SELLER, LISTING_FEE);
    expect_panic("E_DECODE", || {
        c.create_listing(Base64VecU8(vec![9, 9]));
    });
    call_as(
        SELLER,
        NearToken::from_yoctonear(LISTING_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || {
        c.create_listing(b64(&spec()));
    });
}

/// The deployment profile and the governance tables decide what a listing may name (SDD §6.2).
#[test]
fn a_listing_must_match_the_profile_and_the_governance_tables() {
    let mut c = contract();
    let disabled_class = ListingSpec {
        asset_class: AssetClass::Model,
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    expect_panic("E_RULE_DISABLED", || {
        c.create_listing(b64(&disabled_class));
    });

    let other_token = ListingSpec {
        token: "other.testnet".into(),
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    expect_panic("E_RULE_PARAMS", || {
        c.create_listing(b64(&other_token));
    });

    let unknown_appraiser = ListingSpec {
        appraiser: AppraiserRef {
            id: "nope".into(),
            version: 1,
            formula_id: FormulaId::KnowledgeV1,
        },
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    expect_panic("E_FORMULA_DISABLED", || {
        c.create_listing(b64(&unknown_appraiser));
    });

    // Registered, but for a different formula than the listing names.
    let wrong_formula = ListingSpec {
        appraiser: AppraiserRef {
            id: "knowledge".into(),
            version: 1,
            formula_id: FormulaId::DatasetLiteV0,
        },
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    expect_panic("E_FORMULA_DISABLED", || {
        c.create_listing(b64(&wrong_formula));
    });
}

/// A profile with R1 switched off cannot take listings at all.
#[test]
fn a_profile_without_r1_takes_no_listing() {
    call_as(GOV, no_deposit());
    let mut p = profile();
    p.rules_enabled = vec!["R2".into()];
    let mut c = Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        p,
    );
    call_as(GOV, no_deposit());
    c.set_appraiser("knowledge".into(), 1, "KnowledgeV1".into(), U128(10), true);
    call_as(SELLER, LISTING_FEE);
    expect_panic("E_RULE_DISABLED", || {
        c.create_listing(b64(&spec()));
    });
}

#[test]
fn only_the_seller_moves_their_own_listing() {
    let mut c = contract();
    with_room(&mut c);
    let id = draft(&mut c);
    call_as(BUYER, no_deposit());
    expect_panic("only the seller", || {
        c.begin_provisioning(U64(id));
    });
    call_as(BUYER, PUBLISH_FEE);
    expect_panic("only the seller", || {
        c.publish_listing(U64(id), b64(&publish_spec()));
    });
    call_as(SELLER, no_deposit());
    expect_panic("E_LISTING_NOT_ACTIVE", || {
        c.begin_provisioning(U64(999));
    });
}

#[test]
fn provisioning_assigns_a_room_and_stores_the_key_it_reports() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = draft(&mut c);
    call_as(SELLER, no_deposit());
    let job_id = c.begin_provisioning(U64(listing_id)).0;

    assert_eq!(status(&c, listing_id), "Provisioning");
    let job = c.get_job(U64(job_id)).unwrap();
    assert_eq!(job["kind"], "Provisioning");
    assert_eq!(job["state"], "Assigned");
    assert_eq!(job["assigned"], json!([to_hex(&room_key())]));
    assert_eq!(job["deadline_height"], HEIGHT + 200);
    assert_eq!(
        c.get_jobs_for_room(to_hex(&room_key())).len(),
        1,
        "the room has work"
    );

    let report = ProvisioningV1 {
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        pk_l: [0x5a; 32],
        cert_hash: [0x6b; 32],
        ..provisioning()
    };
    call_as(OPERATOR, no_deposit());
    c.submit_provisioning(b64(&report), sign(&provisioning_signing_bytes(&report)));

    assert_eq!(
        status(&c, listing_id),
        "Draft",
        "back to draft, now provisioned"
    );
    assert_eq!(
        c.get_listing(U64(listing_id)).unwrap()["pk_l"],
        to_hex(&[0x5a; 32])
    );
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Verdicted");
    assert_eq!(
        c.get_jobs_for_room(to_hex(&room_key())).len(),
        0,
        "and the queue is clear"
    );
    let logged = events();
    assert_eq!(logged[0]["event"], "listing_provisioned");
    assert_eq!(logged[0]["data"][0]["cert_hash"], to_hex(&[0x6b; 32]));
}

#[test]
fn provisioning_is_for_ckd_listings_in_draft_only() {
    let mut c = contract();
    with_room(&mut c);
    let sealed = ListingSpec {
        key_mode: KeyReleaseMode::RoomSealed,
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    let sealed_id = c.create_listing(b64(&sealed)).0;
    call_as(SELLER, no_deposit());
    expect_panic("E_RULE_DISABLED", || {
        c.begin_provisioning(U64(sealed_id));
    });

    let id = draft(&mut c);
    call_as(SELLER, no_deposit());
    c.begin_provisioning(U64(id));
    call_as(SELLER, no_deposit());
    expect_panic("E_LISTING_NOT_ACTIVE", || {
        c.begin_provisioning(U64(id));
    });
}

/// A relayer sends the report, so the room's signature is the only authority (SDD §3.4).
#[test]
fn a_report_must_be_signed_by_the_room_the_job_was_given_to() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = draft(&mut c);
    call_as(SELLER, no_deposit());
    let job_id = c.begin_provisioning(U64(listing_id)).0;
    let report = ProvisioningV1 {
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        ..provisioning()
    };
    let good = sign(&provisioning_signing_bytes(&report));

    // Signed by another key.
    let impostor = SigningKey::from_bytes(&[8; 32]);
    let forged = Base64VecU8(
        impostor
            .sign(&provisioning_signing_bytes(&report))
            .to_bytes()
            .to_vec(),
    );
    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || {
        c.submit_provisioning(b64(&report), forged)
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || {
        c.submit_provisioning(b64(&report), Base64VecU8(vec![1, 2, 3]))
    });

    // A room that is not the one assigned.
    let other_room = ProvisioningV1 {
        room_key: impostor.verifying_key().to_bytes(),
        ..report.clone()
    };
    call_as(OPERATOR, no_deposit());
    expect_panic("E_ROOM_NOT_ASSIGNED", || {
        let sig = Base64VecU8(
            impostor
                .sign(&provisioning_signing_bytes(&other_room))
                .to_bytes()
                .to_vec(),
        );
        c.submit_provisioning(b64(&other_room), sig)
    });

    // Another chain, another clearing, another listing version, another job.
    for (code, edit) in [
        (
            "E_BINDING",
            Box::new(|r: &mut ProvisioningV1| r.chain_id = "mainnet".into())
                as Box<dyn FnOnce(&mut ProvisioningV1)>,
        ),
        (
            "E_BINDING",
            Box::new(|r: &mut ProvisioningV1| r.clearing = "other.testnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|r: &mut ProvisioningV1| r.listing_version = 2),
        ),
        (
            "E_BINDING",
            Box::new(|r: &mut ProvisioningV1| r.listing_id = 77),
        ),
        (
            "E_TICKET",
            Box::new(|r: &mut ProvisioningV1| r.job_id = 999),
        ),
    ] {
        let mut bad = report.clone();
        edit(&mut bad);
        call_as(OPERATOR, no_deposit());
        expect_panic(code, || {
            c.submit_provisioning(b64(&bad), sign(&provisioning_signing_bytes(&bad)))
        });
    }
    call_as(OPERATOR, no_deposit());
    expect_panic("E_DECODE", || {
        c.submit_provisioning(Base64VecU8(vec![0]), good.clone())
    });

    // A screening report cannot answer a provisioning job, and a job is answered once.
    let screening = screening_report(listing_id, job_id, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || {
        c.submit_screening(b64(&screening), sign(&screening_signing_bytes(&screening)))
    });
    call_as(OPERATOR, no_deposit());
    c.submit_provisioning(b64(&report), good.clone());
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || c.submit_provisioning(b64(&report), good));
}

/// A room whose attestation has lapsed cannot report, even for a job it was given earlier.
#[test]
fn a_room_that_is_no_longer_current_cannot_report() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = draft(&mut c);
    call_as(SELLER, no_deposit());
    let job_id = c.begin_provisioning(U64(listing_id)).0;
    let report = ProvisioningV1 {
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        ..provisioning()
    };
    call_at(
        OPERATOR,
        no_deposit(),
        HEIGHT,
        NOW + MAX_ATTESTATION_SECS + 1,
    );
    expect_panic("E_ROOM_REVOKED", || {
        c.submit_provisioning(b64(&report), sign(&provisioning_signing_bytes(&report)))
    });
}

#[test]
fn publishing_opens_a_screening_job_and_screening_decides_the_listing() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = provisioned(&mut c);
    call_as(SELLER, PUBLISH_FEE);
    let job_id = c.publish_listing(U64(listing_id), b64(&publish_spec())).0;

    assert_eq!(status(&c, listing_id), "Screening");
    let listing = c.get_listing(U64(listing_id)).unwrap();
    assert_eq!(listing["good_commitment"], to_hex(&[0xab; 32]));
    assert_eq!(listing["ciphertext"]["sha256"], to_hex(&[2u8; 32]));
    assert_eq!(listing["publish_height"], Value::Null);
    assert_eq!(c.get_job(U64(job_id)).unwrap()["kind"], "Screening");

    let report = screening_report(listing_id, job_id, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&report), sign(&screening_signing_bytes(&report)));
    assert_eq!(status(&c, listing_id), "Active");
    assert_eq!(
        c.get_listing(U64(listing_id)).unwrap()["publish_height"],
        HEIGHT
    );
    let logged = events();
    assert_eq!(logged[0]["event"], "screening_result");
    assert_eq!(logged[0]["data"][0]["result"], "Pass");
}

/// D8: a flagged listing is held for a consented review, not published.
#[test]
fn a_flagged_listing_is_held() {
    let mut c = contract();
    with_room(&mut c);
    let (listing_id, job_id) = screening_job(&mut c);
    let report = screening_report(
        listing_id,
        job_id,
        ScreeningResult::Flag { reason: FLAG_MNPI },
    );
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&report), sign(&screening_signing_bytes(&report)));

    assert_eq!(status(&c, listing_id), "Held");
    assert_eq!(
        c.get_listing(U64(listing_id)).unwrap()["publish_height"],
        Value::Null
    );
    let logged = events();
    assert_eq!(
        logged[0]["data"][0]["result"],
        json!({"Flag": {"reason": 1}})
    );
    assert_eq!(logged[0]["data"][0]["status"], "Held");
}

#[test]
fn a_listing_is_published_once_from_draft_and_only_when_provisioned() {
    let mut c = contract();
    with_room(&mut c);
    let unprovisioned = draft(&mut c);
    call_as(SELLER, PUBLISH_FEE);
    expect_panic("E_NOT_PINNED", || {
        c.publish_listing(U64(unprovisioned), b64(&publish_spec()));
    });

    let listing_id = provisioned(&mut c);
    call_as(
        SELLER,
        NearToken::from_yoctonear(PUBLISH_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || {
        c.publish_listing(U64(listing_id), b64(&publish_spec()));
    });
    call_as(SELLER, PUBLISH_FEE);
    expect_panic("E_DECODE", || {
        c.publish_listing(U64(listing_id), Base64VecU8(vec![7]));
    });
    call_as(SELLER, PUBLISH_FEE);
    c.publish_listing(U64(listing_id), b64(&publish_spec()));
    call_as(SELLER, PUBLISH_FEE);
    expect_panic("E_LISTING_NOT_ACTIVE", || {
        c.publish_listing(U64(listing_id), b64(&publish_spec()));
    });
}

/// A `RoomSealed` listing has no listing key to provision, so it publishes straight from `Draft`.
#[test]
fn a_room_sealed_listing_publishes_without_provisioning() {
    let mut c = contract();
    with_room(&mut c);
    let sealed = ListingSpec {
        key_mode: KeyReleaseMode::RoomSealed,
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    let id = c.create_listing(b64(&sealed)).0;
    call_as(SELLER, PUBLISH_FEE);
    c.publish_listing(U64(id), b64(&publish_spec()));
    assert_eq!(status(&c, id), "Screening");
}

#[test]
fn a_screening_report_must_match_the_listing_it_answers() {
    let mut c = contract();
    with_room(&mut c);
    let (listing_id, job_id) = screening_job(&mut c);
    let report = screening_report(listing_id, job_id, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&report), sign(&screening_signing_bytes(&report)));
    // The listing has left `Screening`: the same report cannot be replayed.
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || {
        c.submit_screening(b64(&report), sign(&screening_signing_bytes(&report)))
    });
    call_as(OPERATOR, no_deposit());
    expect_panic("E_DECODE", || {
        c.submit_screening(Base64VecU8(vec![3]), sign(b"x"))
    });
}

/// Two listings cannot be provisioned by a room that has no capacity left, and a listing cannot be
/// created when no room can take its work.
#[test]
fn work_needs_a_room_that_can_take_it() {
    let mut c = contract();
    let id = draft(&mut c);
    call_as(SELLER, no_deposit());
    expect_panic("E_NO_ELIGIBLE_ROOM", || {
        c.begin_provisioning(U64(id));
    });

    with_room(&mut c);
    // Fill the room's queue.
    for _ in 0..crate::store::MAX_OPEN_JOBS {
        let listing_id = draft(&mut c);
        call_as(SELLER, no_deposit());
        c.begin_provisioning(U64(listing_id));
    }
    let listing_id = draft(&mut c);
    call_as(SELLER, no_deposit());
    expect_panic("E_NO_ELIGIBLE_ROOM", || {
        c.begin_provisioning(U64(listing_id));
    });
    assert_eq!(
        c.get_jobs_for_room(to_hex(&room_key())).len(),
        crate::store::MAX_OPEN_JOBS
    );
}

// ---------------------------------------------------------------------------------------------
// Snapshots (E4.6)

#[test]
fn a_snapshot_is_anchored_at_the_height_it_was_stored() {
    let mut c = contract();
    let blob = BlobRef {
        uri_hash: [1; 32],
        sha256: [2; 32],
        size_class: 4,
    };
    call_at(BUYER, SNAPSHOT_FEE, HEIGHT + 7, NOW);
    let id = c
        .anchor_snapshot("DataIndex".into(), to_hex(&[0x11; 32]), b64(&blob), true)
        .0;

    let snapshot = c.get_snapshot(U64(id)).unwrap();
    assert_eq!(snapshot["owner"], BUYER);
    assert_eq!(snapshot["kind"], "DataIndex");
    assert_eq!(snapshot["content_hash"], to_hex(&[0x11; 32]));
    assert_eq!(snapshot["anchor_height"], HEIGHT + 7);
    assert_eq!(snapshot["standing"], true);
    assert_eq!(snapshot["blob"]["size_class"], 4);
    assert_eq!(c.get_snapshot(U64(99)), None);

    let logged = events();
    assert_eq!(logged[0]["event"], "snapshot_anchored");
    assert_eq!(logged[0]["data"][0]["anchor_height"], HEIGHT + 7);
}

#[test]
fn a_snapshot_must_be_paid_for_and_well_formed() {
    let mut c = contract();
    let blob = BlobRef {
        uri_hash: [1; 32],
        sha256: [2; 32],
        size_class: 1,
    };
    call_as(
        BUYER,
        NearToken::from_yoctonear(SNAPSHOT_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || {
        c.anchor_snapshot("Notes".into(), to_hex(&[1u8; 32]), b64(&blob), false);
    });
    call_as(BUYER, SNAPSHOT_FEE);
    expect_panic("E_DECODE", || {
        c.anchor_snapshot("Nope".into(), to_hex(&[1u8; 32]), b64(&blob), false);
    });
    call_as(BUYER, SNAPSHOT_FEE);
    expect_panic("E_DECODE", || {
        c.anchor_snapshot("Notes".into(), "zz".into(), b64(&blob), false);
    });
    call_as(BUYER, SNAPSHOT_FEE);
    expect_panic("E_DECODE", || {
        c.anchor_snapshot(
            "Notes".into(),
            to_hex(&[1u8; 32]),
            Base64VecU8(vec![1]),
            false,
        );
    });
}
