//! E4.1: the governance setters. In M1 `gov` sets policy directly (no time-lock, E19).

use super::*;

#[test]
fn init_fixes_the_deployment_and_starts_the_chain_at_genesis() {
    let c = contract();
    let config = c.config();
    assert_eq!(config["gov"], GOV);
    assert_eq!(config["keypolicy"], KEYPOLICY);
    assert_eq!(config["chain_id"], "sandbox");
    assert_eq!(config["tokens"], json!([TOKEN]));
    assert_eq!(config["profile"]["challenge_window_secs"], 600);
    assert_eq!(config["next_listing_id"], 1);
    // The appraiser `contract()` registered bumped the policy version once and made one entry.
    assert_eq!(config["policy_version"], 1);
    assert_eq!(c.audit_head()["seq"], 1);
    // A deployment that has done nothing yet starts at the genesis head.
    call_as(GOV, no_deposit());
    let fresh = Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        profile(),
    );
    assert_eq!(
        fresh.audit_head()["head"],
        to_hex(&marginal_core::audit::AUDIT_GENESIS)
    );
    assert_eq!(fresh.audit_head()["seq"], 0);
}

#[test]
#[should_panic(expected = "no settlement token")]
fn init_refuses_a_deployment_with_no_token() {
    call_as(GOV, no_deposit());
    Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![],
        profile(),
    );
}

#[test]
#[should_panic(expected = "no chain id")]
fn init_refuses_a_deployment_with_no_chain_id() {
    call_as(GOV, no_deposit());
    Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        String::new(),
        vec![account(TOKEN)],
        profile(),
    );
}

#[test]
#[should_panic(expected = "no rule enabled")]
fn init_refuses_a_profile_with_no_rule() {
    call_as(GOV, no_deposit());
    let mut p = profile();
    p.rules_enabled.clear();
    Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        p,
    );
}

#[test]
#[should_panic(expected = "no asset class enabled")]
fn init_refuses_a_profile_with_no_asset_class() {
    call_as(GOV, no_deposit());
    let mut p = profile();
    p.asset_classes_enabled.clear();
    Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        p,
    );
}

#[test]
#[should_panic(expected = "challenge window must be positive")]
fn init_refuses_a_zero_challenge_window() {
    call_as(GOV, no_deposit());
    let mut p = profile();
    p.challenge_window_secs = 0;
    Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        p,
    );
}

#[test]
fn state_serialises_with_borsh() {
    let c = contract();
    assert!(near_sdk::borsh::to_vec(&c).is_ok());
}

#[test]
fn only_gov_sets_policy() {
    let mut c = contract();
    for (name, call) in [
        (
            "set_appraiser",
            Box::new(|c: &mut Clearing| {
                c.set_appraiser("a".into(), 1, "KnowledgeV1".into(), U128(1), true)
            }) as Box<dyn FnOnce(&mut Clearing)>,
        ),
        (
            "set_tokens",
            Box::new(|c: &mut Clearing| c.set_tokens(vec![account(TOKEN)])),
        ),
        (
            "set_issuer_key",
            Box::new(|c: &mut Clearing| c.set_issuer_key(to_hex(&[1u8; 32]))),
        ),
        (
            "set_compliance_key",
            Box::new(|c: &mut Clearing| c.set_compliance_key(to_hex(&[1u8; 32]))),
        ),
        (
            "set_ai_signer",
            Box::new(|c: &mut Clearing| c.set_ai_signer(to_hex(&[1u8; 32]), NOW + 60)),
        ),
        (
            "set_fees",
            Box::new(|c: &mut Clearing| c.set_fees(FeeTable::default())),
        ),
        (
            "approve_measurement_set",
            Box::new(|c: &mut Clearing| {
                c.approve_measurement_set(Base64VecU8(
                    near_sdk::borsh::to_vec(&measurement_set()).unwrap(),
                ))
            }),
        ),
        (
            "admit_platform",
            Box::new(|c: &mut Clearing| {
                c.admit_platform(hex::encode(PPID), account(OPERATOR), U128(1))
            }),
        ),
    ] {
        call_as(SELLER, SET_FEE);
        expect_panic("only gov", || call(&mut c));
        assert_eq!(c.config()["policy_version"], 1, "{name} changed nothing");
    }
}

#[test]
fn every_setter_records_what_governance_chose() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    c.set_tokens(vec![account(TOKEN), account("other.testnet")]);
    assert_eq!(c.config()["tokens"], json!([TOKEN, "other.testnet"]));

    call_as(GOV, no_deposit());
    c.set_issuer_key(to_hex(&[0xaa; 32]));
    call_as(GOV, no_deposit());
    c.set_compliance_key(to_hex(&[0xbb; 32]));
    let config = c.config();
    assert_eq!(config["issuer_key"], to_hex(&[0xaa; 32]));
    assert_eq!(config["compliance_key"], to_hex(&[0xbb; 32]));

    let fees = FeeTable {
        clearing_fee_buyer_bps: 50,
        clearing_fee_seller_bps: 100,
        treasury_bps: 5_000,
        operator_pool_bps: 3_000,
        assurance_pool_bps: 2_000,
    };
    call_as(GOV, no_deposit());
    c.set_fees(fees.clone());
    assert_eq!(c.config()["fees"]["operator_pool_bps"], 3_000);
    // Four changes after the appraiser `contract()` registered, each with its own event.
    assert_eq!(c.config()["policy_version"], 5);
    assert_eq!(events().len(), 1, "one event per call");
}

#[test]
fn a_fee_table_must_be_a_fraction_and_split_into_whole_shares() {
    let mut c = contract();
    for (reason, fees) in [
        (
            "fee over 100%",
            FeeTable {
                clearing_fee_buyer_bps: 10_001,
                ..FeeTable::default()
            },
        ),
        (
            "fee over 100%",
            FeeTable {
                clearing_fee_seller_bps: 10_001,
                ..FeeTable::default()
            },
        ),
        (
            "fee shares must add up to 100%",
            FeeTable {
                treasury_bps: 1,
                ..FeeTable::default()
            },
        ),
    ] {
        call_as(GOV, no_deposit());
        expect_panic(reason, || c.set_fees(fees.clone()));
    }
}

#[test]
fn a_key_must_be_thirty_two_bytes_of_hex() {
    let mut c = contract();
    for bad in ["zz", &to_hex(&[1u8; 31])] {
        call_as(GOV, no_deposit());
        expect_panic("E_DECODE", || c.set_issuer_key(bad.to_string()));
    }
}

/// A signer is listed until its expiry, and setting one that has already expired removes it
/// (SDD §3.16: every entry on the list expires).
#[test]
fn an_ai_signer_is_added_with_an_expiry_and_removed_when_it_passes() {
    let mut c = contract();
    let key = [0xcc; 32];
    call_as(GOV, no_deposit());
    c.set_ai_signer(to_hex(&key), NOW + 3_600);
    assert_eq!(
        crate::store::get::<u64>(crate::store::Table::Signer, &key),
        Some(NOW + 3_600)
    );

    call_as(GOV, no_deposit());
    c.set_ai_signer(to_hex(&key), NOW);
    assert_eq!(
        crate::store::get::<u64>(crate::store::Table::Signer, &key),
        None,
        "expired: removed"
    );
}

#[test]
fn an_appraiser_must_be_registered_enabled_and_match_its_formula() {
    let mut c = contract();
    assert!(c.appraiser("knowledge", 1).is_some());
    assert!(c.appraiser("knowledge", 2).is_none(), "another version");
    assert!(c.appraiser("other", 1).is_none());

    call_as(GOV, no_deposit());
    c.set_appraiser("knowledge".into(), 1, "KnowledgeV1".into(), U128(10), false);
    assert!(c.appraiser("knowledge", 1).is_none(), "disabled");

    call_as(GOV, no_deposit());
    expect_panic("E_DECODE", || {
        c.set_appraiser("knowledge".into(), 1, "NoSuchFormula".into(), U128(1), true)
    });
    call_as(GOV, no_deposit());
    expect_panic("appraiser id", || {
        c.set_appraiser(String::new(), 1, "KnowledgeV1".into(), U128(1), true)
    });
}

#[test]
#[should_panic(expected = "no settlement token")]
fn the_token_allow_list_is_never_emptied() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    c.set_tokens(vec![]);
}
