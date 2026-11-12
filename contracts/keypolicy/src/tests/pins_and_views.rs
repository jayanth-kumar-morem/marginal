//! `set_pins` and the views.

use super::*;
use crate::store::{self, pin_id, Table};
use marginal_core::keyrelease::{listing_key_id, PinMode, MAX_PINS};

fn stored_pins(seller: &str, listing: u64, version: u32) -> Option<PinMode> {
    store::get(
        Table::Pins,
        &pin_id(&listing_key_id(&seller.to_string(), listing), version),
    )
}

#[test]
fn a_seller_pins_rooms_by_measurement_or_follows_governance() {
    let mut c = contract();
    let hashes = vec![to_hex(&[1; 32]), to_hex(&[2; 32])];
    set_pins(&mut c, "seller.testnet", 3, 1, Some(hashes));
    assert_eq!(
        stored_pins("seller.testnet", 3, 1),
        Some(PinMode::Explicit(vec![[1; 32], [2; 32]]))
    );
    let logged = events();
    assert_eq!(logged[0]["event"], "pins_set");
    assert_eq!(logged[0]["data"][0]["seller"], "seller.testnet");
    assert_eq!(
        logged[0]["data"][0]["mode"],
        json!({"Explicit": [to_hex(&[1; 32]), to_hex(&[2; 32])]})
    );

    // Calling again replaces them.
    set_pins(&mut c, "seller.testnet", 3, 1, None);
    assert_eq!(
        stored_pins("seller.testnet", 3, 1),
        Some(PinMode::FollowGovernance)
    );
    assert_eq!(events()[0]["data"][0]["mode"], "FollowGovernance");
}

/// The key id includes the caller, so a seller can only ever write pins for their own listings.
#[test]
fn nobody_can_write_pins_for_someone_elses_listing() {
    let mut c = contract();
    set_pins(&mut c, "seller.testnet", 3, 1, Some(vec![to_hex(&[1; 32])]));
    set_pins(
        &mut c,
        "attacker.testnet",
        3,
        1,
        Some(vec![to_hex(&[0xaa; 32])]),
    );
    assert_eq!(
        stored_pins("seller.testnet", 3, 1),
        Some(PinMode::Explicit(vec![[1; 32]])),
        "unchanged"
    );
    assert_eq!(
        stored_pins("attacker.testnet", 3, 1),
        Some(PinMode::Explicit(vec![[0xaa; 32]]))
    );
}

#[test]
fn pins_cost_their_storage_and_must_be_valid() {
    let mut c = contract();
    call_as(
        "seller.testnet",
        NearToken::from_yoctonear(PINS_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || c.set_pins(U64(3), 1, None));

    call_as("seller.testnet", PINS_FEE);
    expect_panic("E_DECODE", || {
        c.set_pins(U64(3), 1, Some(vec!["not hex".into()]))
    });
    expect_panic("E_DECODE", || {
        c.set_pins(U64(3), 1, Some(vec!["ab".into()]))
    });
    expect_panic("E_NOT_PINNED", || c.set_pins(U64(3), 1, Some(vec![])));
    expect_panic("E_NOT_PINNED", || {
        c.set_pins(U64(3), 1, Some(vec![to_hex(&[1; 32]), to_hex(&[1; 32])]))
    });
    let too_many: Vec<String> = (0..=MAX_PINS as u8).map(|i| to_hex(&[i; 32])).collect();
    expect_panic("E_NOT_PINNED", || c.set_pins(U64(3), 1, Some(too_many)));
    assert_eq!(
        stored_pins("seller.testnet", 3, 1),
        None,
        "nothing was stored"
    );
}

#[test]
fn the_pins_fee_covers_the_biggest_pin_set() {
    let mut c = contract();
    let full: Vec<String> = (0..MAX_PINS as u8).map(|i| to_hex(&[i; 32])).collect();
    call_as("seller.testnet", PINS_FEE);
    let before = env::storage_usage();
    c.set_pins(U64(u64::MAX), u32::MAX, Some(full));
    let used = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
    assert!(
        used <= PINS_FEE.as_yoctonear(),
        "{used} yocto stored for a fee of {}",
        PINS_FEE.as_yoctonear()
    );
}

// ---------------------------------------------------------------------------------------------
// Views

#[test]
fn config_shows_what_was_fixed_at_deployment_and_what_is_built_in() {
    let c = contract();
    let config = serde_json::to_value(c.config()).unwrap();
    assert_eq!(config["version"], 1);
    assert_eq!(config["chain_id"], "testnet");
    assert_eq!(config["registry"], REGISTRY);
    assert_eq!(config["clearing"], CLEARING);
    assert_eq!(config["mpc"], MPC);
    assert_eq!(config["ckd_domain_id"], 2);
    assert_eq!(config["dcap_verifier"], VERIFIER);
    assert_eq!(config["nonce_ttl_blocks"], NONCE_TTL_BLOCKS);
    assert_eq!(config["ticket_ttl_blocks"], 50);
    assert_eq!(config["nonce_fee"], NONCE_FEE.as_yoctonear().to_string());
    assert_eq!(
        config["attestation_fee"],
        ATTESTATION_FEE.as_yoctonear().to_string()
    );
    assert_eq!(config["pins_fee"], PINS_FEE.as_yoctonear().to_string());
    assert_eq!(config["ticket_fee"], TICKET_FEE.as_yoctonear().to_string());
}

#[test]
fn an_attestation_can_be_read_back() {
    let mut c = contract();
    registered_room(&mut c);
    let view = c.get_attestation(to_hex(&room_key())).expect("registered");
    assert_eq!(view["room_key"], to_hex(&room_key()));
    assert_eq!(view["box_pk"], to_hex(&[2; 32]));
    assert_eq!(view["class"], "K");
    assert_eq!(view["mode"], "OnChainDcap");
    assert_eq!(view["tcb_status"], "UpToDate");
    assert_eq!(view["expires_at"], NOW + 86_400);
    assert_eq!(view["verified_height"], HEIGHT);
    assert_eq!(
        view["measurement"]["compose_hash"],
        to_hex(&common::COMPOSE)
    );
    assert_eq!(view["measurement_hash"], room_measurement_hash(&c));
    assert!(
        c.get_attestation(to_hex(&[0x99; 32])).is_none(),
        "a room that never registered"
    );
    assert!(c.get_attestation("not a key".into()).is_none());
}

#[test]
fn pins_and_tickets_can_be_read_back() {
    let mut c = contract();
    assert!(c.get_pins(account("seller.testnet"), U64(3), 1).is_none());
    set_pins(&mut c, "seller.testnet", 3, 1, None);
    let pins = c.get_pins(account("seller.testnet"), U64(3), 1).unwrap();
    assert_eq!(pins["mode"], "FollowGovernance");
    assert_eq!(
        pins["key_id"],
        to_hex(&listing_key_id(&"seller.testnet".into(), 3))
    );

    assert!(c.get_ticket(U64(1)).is_none());
    let request = ready(&mut c);
    issue_ticket(&mut c, &request);
    let ticket = c.get_ticket(U64(1)).unwrap();
    assert_eq!(ticket["room_key"], to_hex(&room_key()));
    assert_eq!(ticket["path"], request.path.as_str());
    assert_eq!(ticket["job_id"], 11);
    assert_eq!(ticket["expires_height"], HEIGHT + 50);
    assert_eq!(ticket["used"], false);
    assert_eq!(ticket["app_key"]["pk1"], "05".repeat(48));
}
