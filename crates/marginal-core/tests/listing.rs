//! E4: the listing checks (SDD §3.4) and the two reports a room signs about a listing.

use marginal_core::codec::to_bytes;
use marginal_core::leakage::MAX_ALPHABET;
use marginal_core::listing::{validate_rule, validate_schema, validate_spec};
use marginal_core::reports::*;
use marginal_core::*;

mod common;
use common::{assert_every_edit_changes_the_digest, h, pin, provisioning, rt, schema, screening};

// ---------------------------------------------------------------------------------------------
// The schema

#[test]
fn a_schema_of_finite_alphabets_is_accepted() {
    assert_eq!(validate_schema(&schema()), Ok(()));
    // The extremes of the millibit table, and a schema with no shown fields at all.
    let edge = OutputSchema {
        fields: vec![],
        component_alphabets: vec![1, MAX_ALPHABET],
        judge_scale: MAX_ALPHABET,
    };
    assert_eq!(validate_schema(&edge), Ok(()));
}

/// A field or component with no alphabet is free text: unbounded, so its leakage cannot be priced.
#[test]
fn a_free_text_field_or_component_is_refused() {
    let mut no_field_alphabet = schema();
    no_field_alphabet.fields[0].alphabet = 0;
    assert_eq!(
        validate_schema(&no_field_alphabet),
        Err(CoreError::FreeTextField)
    );

    let mut no_component_alphabet = schema();
    no_component_alphabet.component_alphabets[1] = 0;
    assert_eq!(
        validate_schema(&no_component_alphabet),
        Err(CoreError::FreeTextField)
    );

    let mut no_judge_scale = schema();
    no_judge_scale.judge_scale = 0;
    assert_eq!(
        validate_schema(&no_judge_scale),
        Err(CoreError::FreeTextField)
    );
}

#[test]
fn a_schema_the_millibit_table_cannot_price_is_refused() {
    for too_wide in [MAX_ALPHABET + 1, u16::MAX] {
        let mut wide_component = schema();
        wide_component.component_alphabets[0] = too_wide;
        assert_eq!(
            validate_schema(&wide_component),
            Err(CoreError::SchemaInvalid),
            "{too_wide} components"
        );
        let mut wide_field = schema();
        wide_field.fields[0].alphabet = too_wide;
        assert_eq!(validate_schema(&wide_field), Err(CoreError::SchemaInvalid));
        let mut wide_judge = schema();
        wide_judge.judge_scale = too_wide;
        assert_eq!(validate_schema(&wide_judge), Err(CoreError::SchemaInvalid));
    }
}

/// A listing with no components has nothing to measure, so no price could be recomputed (§3.7).
#[test]
fn a_schema_with_no_components_is_refused() {
    let mut empty = schema();
    empty.component_alphabets.clear();
    assert_eq!(validate_schema(&empty), Err(CoreError::SchemaInvalid));
}

/// A verdict names a shown field by id, so two fields cannot share one, and a nameless field cannot
/// be told from another.
#[test]
fn fields_must_be_distinct_and_named() {
    let mut duplicate = schema();
    duplicate.fields.push(FieldSpec {
        id: 1,
        name: "other".into(),
        alphabet: 4,
    });
    assert_eq!(validate_schema(&duplicate), Err(CoreError::SchemaInvalid));

    let mut nameless = schema();
    nameless.fields[0].name = String::new();
    assert_eq!(validate_schema(&nameless), Err(CoreError::SchemaInvalid));

    // Two fields with different ids are fine.
    let mut two = schema();
    two.fields.push(FieldSpec {
        id: 2,
        name: "other".into(),
        alphabet: 4,
    });
    assert_eq!(validate_schema(&two), Ok(()));
}

// ---------------------------------------------------------------------------------------------
// The pricing rule

#[test]
fn only_a_posted_price_with_a_positive_ask_is_accepted() {
    assert_eq!(validate_rule(&PricingRule::Posted { ask: 1 }), Ok(()));
    assert_eq!(
        validate_rule(&PricingRule::Posted { ask: 0 }),
        Err(CoreError::RuleParams),
        "no deal could ever be struck"
    );
    for disabled in [
        PricingRule::ValueIndexed {
            p_min: 1,
            p_full: 2,
            price_quantum_bps: 100,
        },
        PricingRule::SurplusSplitLegacy { ask: 1 },
        PricingRule::SealedRound {
            k: 2,
            reserve: 1,
            close_height: 9,
        },
        PricingRule::Tender { tender_id: 1 },
    ] {
        assert_eq!(validate_rule(&disabled), Err(CoreError::RuleDisabled));
    }
}

// ---------------------------------------------------------------------------------------------
// What a room signs

#[test]
fn enum_discriminants_are_pinned() {
    pin(vec![
        ScreeningResult::Pass,
        ScreeningResult::Flag { reason: FLAG_MNPI },
    ]);
}

#[test]
fn the_reports_round_trip_and_their_domains_are_fixed() {
    rt(&provisioning());
    rt(&screening(ScreeningResult::Pass));
    rt(&screening(ScreeningResult::Flag { reason: FLAG_MNPI }));
    assert_eq!(ProvisioningV1::DOMAIN, *b"marginal/provis\0");
    assert_eq!(ScreeningV1::DOMAIN, *b"marginal/screen\0");
    assert_eq!(PROVISIONING_SIGNING_DOMAIN, b"marginal/provisioning/v1");
    assert_eq!(SCREENING_SIGNING_DOMAIN, b"marginal/screening/v1");
    assert_eq!(FLAG_MNPI, 1);
}

#[test]
fn signing_bytes_are_the_domain_then_the_borsh_bytes() {
    let p = provisioning();
    assert_eq!(
        provisioning_signing_bytes(&p),
        [PROVISIONING_SIGNING_DOMAIN, &to_bytes(&p)].concat()
    );
    let s = screening(ScreeningResult::Pass);
    assert_eq!(
        screening_signing_bytes(&s),
        [SCREENING_SIGNING_DOMAIN, &to_bytes(&s)].concat()
    );
}

/// A signature for one report must not be valid for the other, nor for a different chain, contract,
/// job, listing, room, key or result.
#[test]
fn every_field_of_a_report_is_signed() {
    let provisioning_edits: &[common::Edit<ProvisioningV1>] = &[
        ("chain", |p| p.chain_id = "mainnet".into()),
        ("clearing", |p| p.clearing = "other.near".into()),
        ("job", |p| p.job_id += 1),
        ("listing", |p| p.listing_id += 1),
        ("version", |p| p.listing_version += 1),
        ("room", |p| p.room_key = h(2)),
        ("pk_l", |p| p.pk_l = h(3)),
        ("cert", |p| p.cert_hash = h(4)),
    ];
    assert_every_edit_changes_the_digest(&provisioning(), provisioning_edits, |p| {
        provisioning_signing_bytes(p)
    });

    let screening_edits: &[common::Edit<ScreeningV1>] = &[
        ("chain", |s| s.chain_id = "mainnet".into()),
        ("clearing", |s| s.clearing = "other.near".into()),
        ("job", |s| s.job_id += 1),
        ("listing", |s| s.listing_id += 1),
        ("version", |s| s.listing_version += 1),
        ("room", |s| s.room_key = h(2)),
        ("result", |s| s.result = ScreeningResult::Flag { reason: 1 }),
        ("reason", |s| s.result = ScreeningResult::Flag { reason: 2 }),
        ("cert", |s| s.cert_hash = h(4)),
    ];
    assert_every_edit_changes_the_digest(&screening(ScreeningResult::Pass), screening_edits, |s| {
        screening_signing_bytes(s)
    });

    // The two kinds cannot be confused: different domains, and the type's own domain field after it.
    let (p, s) = (
        provisioning_signing_bytes(&provisioning()),
        screening_signing_bytes(&screening(ScreeningResult::Pass)),
    );
    assert!(p.starts_with(b"marginal/provisioning/v1") && s.starts_with(b"marginal/screening/v1"));
    assert_eq!(&p[24..40], b"marginal/provis\0");
    assert_eq!(&s[21..37], b"marginal/screen\0");
}

// ---------------------------------------------------------------------------------------------
// The whole spec

/// Every check `create_listing` makes that depends only on what the seller sent.
#[test]
fn a_spec_must_be_sellable() {
    let base = common::spec();
    assert_eq!(validate_spec(&base), Ok(()));
    type Refusal = (CoreError, fn(&mut marginal_core::listing::ListingSpec));
    let refused: &[Refusal] = &[
        (CoreError::FreeTextField, |s| s.schema.judge_scale = 0),
        (CoreError::RuleParams, |s| {
            s.rule = PricingRule::Posted { ask: 0 }
        }),
        (CoreError::RuleParams, |s| s.max_copies = 0),
        (CoreError::RuleParams, |s| s.l_floor_bps = 10_001),
        (CoreError::RuleParams, |s| s.challenge_window_blocks = 0),
        (CoreError::RuleParams, |s| s.delivery_deadline_blocks = 0),
        (CoreError::RuleParams, |s| s.leakage.reserved_mbits = 1),
        (CoreError::RuleParams, |s| s.leakage.spent_mbits = 1),
        (CoreError::BudgetExhausted, |s| s.leakage.budget_mbits = 0),
    ];
    for (error, edit) in refused {
        let mut spec = base.clone();
        edit(&mut spec);
        assert_eq!(validate_spec(&spec), Err(*error));
    }
    // A floor of exactly 100% is a fraction, so it is allowed.
    let mut whole = base.clone();
    whole.l_floor_bps = 10_000;
    assert_eq!(validate_spec(&whole), Ok(()));
}
