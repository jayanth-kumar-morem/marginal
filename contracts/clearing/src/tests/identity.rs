//! E5.4: nullifiers (SDD §3.20, AC-14). One identity, one appraisal per listing per epoch.

use super::*;

fn gated_listing(c: &mut Clearing) -> u64 {
    call_as(GOV, no_deposit());
    c.set_issuer_key(to_hex(&issuer_key().verifying_key().to_bytes()));
    let gated = ListingSpec {
        eligibility: Eligibility {
            nullifier_gated: true,
            ..spec().eligibility
        },
        ..spec()
    };
    with_room(c);
    // The same path as `active`, with a gated listing.
    call_as(SELLER, LISTING_FEE);
    let listing_id = c.create_listing(b64(&gated)).0;
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
    call_as(OPERATOR, no_deposit());
    c.submit_provisioning(b64(&report), sign(&provisioning_signing_bytes(&report)));
    call_as(SELLER, PUBLISH_FEE);
    let job_id = c.publish_listing(U64(listing_id), b64(&publish_spec())).0;
    let screening = screening_report(listing_id, job_id, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&screening), sign(&screening_signing_bytes(&screening)));
    fund_buyer(c, 10_000_000_000);
    listing_id
}

fn gated_request(listing_id: u64, epoch: u32) -> AppraisalRequest {
    let (credential, sig) = credential(listing_id, epoch);
    AppraisalRequest {
        nullifier: Some(credential),
        nullifier_sig: Some(sig),
        ..request(listing_id)
    }
}

/// One verified identity gets one appraisal per listing per epoch, whatever account it uses.
#[test]
fn a_nullifier_buys_once_per_listing_and_epoch() {
    let mut c = contract();
    let listing_id = gated_listing(&mut c);
    let (credential, _) = credential(listing_id, 7);

    assert!(!c.is_nullifier_used(U64(listing_id), 7, to_hex(&credential.nullifier)));
    call_as(BUYER, no_deposit());
    created(&c.request_appraisal(b64(&gated_request(listing_id, 7))));
    assert!(c.is_nullifier_used(U64(listing_id), 7, to_hex(&credential.nullifier)));

    // The same credential again, even for a new job, is refused.
    call_as(BUYER, no_deposit());
    expect_panic("E_NULLIFIER_USED", || {
        c.request_appraisal(b64(&gated_request(listing_id, 7)));
    });
    // The next epoch is a fresh allowance.
    call_as(BUYER, no_deposit());
    created(&c.request_appraisal(b64(&gated_request(listing_id, 8))));

    let logged = events();
    let spent = logged
        .iter()
        .find(|e| e["event"] == "nullifier_spent")
        .unwrap();
    assert_eq!(spent["data"][0]["epoch"], 8);
    assert_eq!(
        spent["data"][0]["tag"],
        to_hex(&Clearing::nullifier_tag(&credential.nullifier)),
        "the event carries a tag, not the nullifier itself"
    );
}

/// A gated listing needs a credential, and the credential must be this issuer's, for this buyer,
/// this listing, this chain and this contract, and unexpired.
#[test]
fn a_credential_is_checked_field_by_field() {
    let mut c = contract();
    let listing_id = gated_listing(&mut c);

    call_as(BUYER, no_deposit());
    expect_panic("E_CREDENTIAL", || {
        c.request_appraisal(b64(&request(listing_id)));
    });

    let valid = gated_request(listing_id, 7);
    type Edit = (&'static str, Box<dyn Fn(&mut NullifierCredential)>);
    let edits: Vec<Edit> = vec![
        (
            "E_BINDING",
            Box::new(|n: &mut NullifierCredential| n.chain_id = "mainnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|n: &mut NullifierCredential| n.clearing = "other.testnet".into()),
        ),
        (
            "E_BINDING",
            Box::new(|n: &mut NullifierCredential| n.subject = SELLER.into()),
        ),
        (
            "E_BINDING",
            Box::new(|n: &mut NullifierCredential| n.listing_id += 1),
        ),
        (
            "E_BINDING",
            Box::new(|n: &mut NullifierCredential| n.domain = [0; 16]),
        ),
        // Signed, but for a different nullifier: the signature no longer matches.
        (
            "E_CREDENTIAL",
            Box::new(|n: &mut NullifierCredential| n.nullifier = [0xee; 32]),
        ),
    ];
    for (code, edit) in edits {
        let mut credential = valid.nullifier.clone().unwrap();
        edit(&mut credential);
        let bad = AppraisalRequest {
            nullifier: Some(credential),
            ..valid.clone()
        };
        call_as(BUYER, no_deposit());
        expect_panic(code, || {
            c.request_appraisal(b64(&bad));
        });
    }

    // An expired credential, correctly signed: only the expiry can be the reason it is refused.
    let mut expired = valid.nullifier.clone().unwrap();
    expired.expiry_height = HEIGHT - 1;
    let signed_expired = AppraisalRequest {
        nullifier_sig: Some(
            issuer_key()
                .sign(&nullifier_signing_bytes(&expired))
                .to_bytes(),
        ),
        nullifier: Some(expired),
        ..valid.clone()
    };
    call_as(BUYER, no_deposit());
    expect_panic("E_CREDENTIAL", || {
        c.request_appraisal(b64(&signed_expired));
    });

    // Signed by someone who is not the registered issuer.
    let impostor = SigningKey::from_bytes(&[9; 32]);
    let credential = valid.nullifier.clone().unwrap();
    let forged = AppraisalRequest {
        nullifier_sig: Some(
            impostor
                .sign(&nullifier_signing_bytes(&credential))
                .to_bytes(),
        ),
        ..valid.clone()
    };
    call_as(BUYER, no_deposit());
    expect_panic("E_CREDENTIAL", || {
        c.request_appraisal(b64(&forged));
    });

    // A request that carries one half of a credential is malformed.
    let half = AppraisalRequest {
        nullifier_sig: None,
        ..valid.clone()
    };
    call_as(BUYER, no_deposit());
    expect_panic("E_CREDENTIAL", || {
        c.request_appraisal(b64(&half));
    });

    // Nothing above spent the nullifier, so the real one still works.
    call_as(BUYER, no_deposit());
    created(&c.request_appraisal(b64(&valid)));
}

/// With no issuer key registered, no credential can be checked, so a gated listing sells nothing.
#[test]
fn a_gated_listing_needs_an_issuer_key() {
    let mut c = contract();
    let listing_id = gated_listing(&mut c);
    c.issuer_key = None;
    call_as(BUYER, no_deposit());
    expect_panic("E_CREDENTIAL", || {
        c.request_appraisal(b64(&gated_request(listing_id, 7)));
    });
}

/// The SDK checks the nullifier before a buyer spends gas on a request that could only be refused.
#[test]
fn the_nullifier_view_says_what_has_been_spent() {
    let mut c = contract();
    let listing_id = gated_listing(&mut c);
    let (credential, _) = credential(listing_id, 7);
    let tag = to_hex(&credential.nullifier);

    assert!(!c.is_nullifier_used(U64(listing_id), 7, tag.clone()));
    call_as(BUYER, no_deposit());
    created(&c.request_appraisal(b64(&gated_request(listing_id, 7))));
    assert!(c.is_nullifier_used(U64(listing_id), 7, tag.clone()));
    assert!(
        !c.is_nullifier_used(U64(listing_id), 8, tag),
        "another epoch"
    );
    assert!(
        !c.is_nullifier_used(U64(listing_id), 7, "zz".into()),
        "not a nullifier"
    );
}
