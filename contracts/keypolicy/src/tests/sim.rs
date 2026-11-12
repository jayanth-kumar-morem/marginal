//! The `sim-attestation` build: rooms with no quote, for contract tests only. Compiled and tested only
//! with the feature, so it can never be part of the default (deployable) build.

use super::*;
use crate::store::{self, Attestation, Table};
use marginal_core::attest::SimRoom;

fn sim_room(nonce: [u8; 32]) -> SimRoom {
    SimRoom {
        sign_pk: room_key(),
        box_pk: [2; 32],
        nonce,
        class: RoomClass::K,
        measurement: common::measurement(false),
        ppid_hash: [0x77; 32],
    }
}

fn register_simulated(c: &mut KeyPolicy, room: &SimRoom) {
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room_simulated(b64(to_bytes(room)));
}

#[test]
fn a_simulated_room_is_recorded_as_simulated_and_sent_to_the_registry() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    register_simulated(&mut c, &sim_room(nonce));

    let record: Attestation = store::get(Table::Attestation, &room_key()).unwrap();
    assert_eq!(record.mode, marginal_core::AttestationMode::Simulated);
    assert_eq!(record.tcb_status, "Simulated");
    assert_eq!(record.expires_at, NOW + 86_400);
    assert_eq!(
        (record.quote_hash, record.collateral_hash),
        ([0; 32], [0; 32]),
        "no quote was involved"
    );
    assert_eq!(record.measurement, common::measurement(false));

    let calls = sent();
    assert_eq!(
        (calls[0].to.as_str(), calls[0].method.as_str()),
        (REGISTRY, "admit_room")
    );
    assert_eq!(calls[0].json()["room"]["attestation_mode"], "Simulated");
    assert_eq!(events()[0]["data"][0]["mode"], "Simulated");
}

#[test]
fn a_simulated_registration_still_needs_a_nonce_the_fee_and_a_readable_request() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    call_as(
        "operator.testnet",
        NearToken::from_yoctonear(ATTESTATION_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || {
        c.register_room_simulated(b64(to_bytes(&sim_room(nonce))))
    });
    call_as("operator.testnet", ATTESTATION_FEE);
    expect_panic("E_DECODE", || c.register_room_simulated(b64(vec![1, 2])));
    expect_panic("E_NONCE", || {
        c.register_room_simulated(b64(to_bytes(&sim_room([0xee; 32]))))
    });
}

#[test]
fn a_simulated_room_cannot_take_over_a_registered_key_either() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    register_simulated(&mut c, &sim_room(nonce));
    let nonce = issue_nonce(&mut c);
    call_as("operator.testnet", ATTESTATION_FEE);
    let other = SimRoom {
        measurement: common::measurement(true),
        ..sim_room(nonce)
    };
    expect_panic("E_ROOM_KEY_IN_USE", || {
        c.register_room_simulated(b64(to_bytes(&other)))
    });
}

/// A simulated room works end to end with pins and `authorize`, so contract tests can drive the
/// whole key-release path without TDX hardware.
#[test]
fn a_simulated_room_can_be_authorised_like_a_real_one() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    register_simulated(&mut c, &sim_room(nonce));
    set_pins(&mut c, &seller().to_string(), 3, 1, None);
    authorize(&mut c, &request_with(&listing_path(&seller(), 3, 1)));
    assert_eq!(sent().len(), 3);
}
