//! E4.3: the room-policy registry inside clearing (SDD §3.11).

use super::*;

#[test]
fn governance_approves_a_measurement_set_and_a_platform() {
    let mut c = contract();
    call_as(GOV, SET_FEE);
    c.approve_measurement_set(Base64VecU8(
        near_sdk::borsh::to_vec(&measurement_set()).unwrap(),
    ));
    let logged = events();
    assert_eq!(logged[0]["event"], "measurement_approved");
    assert_eq!(logged[0]["data"][0]["members"], 1);
    assert_eq!(logged[0]["data"][0]["source_tag"], "v0.1.0 abcdef");

    call_as(GOV, PLATFORM_FEE);
    c.admit_platform(hex::encode(PPID), account(OPERATOR), U128(1_000));
    let logged = events();
    assert_eq!(logged[0]["event"], "platform_admitted");
    assert_eq!(logged[0]["data"][0]["ppid_hash"], to_hex(&ppid_hash(&PPID)));
    assert_eq!(logged[0]["data"][0]["operator"], OPERATOR);
}

/// Phala's published PPID list contains an empty entry (SDD §3.13), so a short or missing PPID must
/// never be admitted as a platform.
#[test]
fn a_platform_ppid_must_be_exactly_sixteen_bytes() {
    let mut c = contract();
    for bad in ["", &hex::encode([0u8; 15]), &hex::encode([0u8; 17]), "zz"] {
        call_as(GOV, PLATFORM_FEE);
        expect_panic("E_PPID", || {
            c.admit_platform(bad.to_string(), account(OPERATOR), U128(1))
        });
    }
}

#[test]
fn a_measurement_set_needs_an_id_and_members_and_must_decode() {
    let mut c = contract();
    call_as(GOV, SET_FEE);
    expect_panic("E_DECODE", || {
        c.approve_measurement_set(Base64VecU8(vec![1, 2, 3]))
    });
    call_as(GOV, SET_FEE);
    expect_panic("measurement set id", || {
        let mut set = measurement_set();
        set.id = String::new();
        c.approve_measurement_set(Base64VecU8(near_sdk::borsh::to_vec(&set).unwrap()))
    });
    call_as(GOV, SET_FEE);
    expect_panic("measurement set members", || {
        let mut set = measurement_set();
        set.members.clear();
        c.approve_measurement_set(Base64VecU8(near_sdk::borsh::to_vec(&set).unwrap()))
    });
}

#[test]
fn every_registry_record_must_be_paid_for() {
    let mut c = contract();
    let short = |fee: NearToken| NearToken::from_yoctonear(fee.as_yoctonear() - 1);
    call_as(GOV, short(SET_FEE));
    expect_panic("E_DEPOSIT", || {
        c.approve_measurement_set(Base64VecU8(vec![]))
    });
    call_as(GOV, short(PLATFORM_FEE));
    expect_panic("E_DEPOSIT", || {
        c.admit_platform(hex::encode(PPID), account(OPERATOR), U128(1))
    });
}

#[test]
fn only_keypolicy_admits_a_room() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    expect_panic("only keypolicy", || {
        c.admit_room(admit(room_key(), measurement(false), PPID))
    });
}

#[test]
fn a_room_joins_the_pool_and_can_be_checked_and_assigned() {
    let mut c = contract();
    with_room(&mut c);
    let key = to_hex(&room_key());

    let room = c.get_room(key.clone()).unwrap();
    assert_eq!(room["measurement_set"], "knowledge-room@1.0.0");
    assert_eq!(room["class"], "Kcpu");
    assert_eq!(room["current"], true);
    assert_eq!(room["expires_at"], NOW + MAX_ATTESTATION_SECS);

    assert_eq!(
        c.check_room(key.clone()),
        json!({"ok": true, "deny_reasons": []})
    );
    assert_eq!(c.eligible("Kcpu".into(), None), vec![key.clone()]);
    assert_eq!(
        c.eligible("K".into(), None),
        Vec::<String>::new(),
        "another class"
    );
    assert_eq!(
        c.eligible("Kcpu".into(), Some(vec![key])),
        Vec::<String>::new(),
        "excluded"
    );
    assert!(c.get_room(to_hex(&[0u8; 32])).is_none());
    assert!(c.get_room("zz".into()).is_none(), "not hex");

    let logged = events();
    assert_eq!(logged[0]["event"], "room_admitted");
    assert_eq!(logged[0]["data"][0]["mode"], "OnChainDcap");
}

/// KeyPolicy verified the quote; the registry applies its own policy on top (SDD §3.11).
#[test]
fn a_room_needs_an_admitted_platform_and_an_approved_measurement() {
    let mut c = contract();
    call_as(GOV, SET_FEE);
    c.approve_measurement_set(Base64VecU8(
        near_sdk::borsh::to_vec(&measurement_set()).unwrap(),
    ));
    call_as(KEYPOLICY, no_deposit());
    expect_panic("E_PLATFORM_NOT_ADMITTED", || {
        c.admit_room(admit(room_key(), measurement(false), PPID))
    });

    call_as(GOV, PLATFORM_FEE);
    c.admit_platform(hex::encode(PPID), account(OPERATOR), U128(1_000));
    call_as(KEYPOLICY, no_deposit());
    expect_panic("E_MEASUREMENT_NOT_APPROVED", || {
        c.admit_room(room_key_with_other_software())
    });

    call_as(KEYPOLICY, no_deposit());
    expect_panic("E_DECODE", || c.admit_room(json!({"not": "a room"})));
}

fn room_key_with_other_software() -> Value {
    admit(room_key(), measurement(true), PPID)
}

/// A renewal replaces the record in place and does not grow the pool (SDD §3.13: renewal is a fresh
/// quote with the same keys).
#[test]
fn a_renewal_replaces_the_record_without_growing_the_pool() {
    let mut c = contract();
    with_room(&mut c);
    call_at(KEYPOLICY, no_deposit(), HEIGHT + 10, NOW + 10);
    c.admit_room(admit(room_key(), measurement(false), PPID));
    assert_eq!(c.pool(RoomClass::Kcpu).len(), 1);
    // KeyPolicy's own expiry still bounds it: the renewal quote has the same collateral.
    assert_eq!(
        c.get_room(to_hex(&room_key())).unwrap()["expires_at"],
        NOW + MAX_ATTESTATION_SECS
    );
}

/// The registry's own 24 h limit applies even when KeyPolicy's attestation would last longer.
#[test]
fn the_registry_caps_a_rooms_life_at_a_day() {
    let mut c = contract();
    call_as(GOV, SET_FEE);
    c.approve_measurement_set(Base64VecU8(
        near_sdk::borsh::to_vec(&measurement_set()).unwrap(),
    ));
    call_as(GOV, PLATFORM_FEE);
    c.admit_platform(hex::encode(PPID), account(OPERATOR), U128(1_000));

    let mut room = admit(room_key(), measurement(false), PPID);
    room["expires_at"] = json!(NOW + 10 * MAX_ATTESTATION_SECS);
    call_as(KEYPOLICY, no_deposit());
    c.admit_room(room);
    assert_eq!(
        c.get_room(to_hex(&room_key())).unwrap()["expires_at"],
        NOW + MAX_ATTESTATION_SECS,
        "a day, not what the collateral allowed"
    );
}

#[test]
fn check_room_names_every_reason_a_room_gets_no_key() {
    let mut c = contract();
    with_room(&mut c);
    let key = to_hex(&room_key());

    assert_eq!(
        c.check_room(to_hex(&[0xee; 32])),
        json!({"ok": false, "deny_reasons": ["unknown"]})
    );
    assert_eq!(
        c.check_room("zz".into()),
        json!({"ok": false, "deny_reasons": ["unknown"]}),
        "not hex"
    );

    // A day later the record has expired.
    call_at(BUYER, no_deposit(), HEIGHT, NOW + MAX_ATTESTATION_SECS);
    assert_eq!(
        c.check_room(key.clone()),
        json!({"ok": false, "deny_reasons": ["expired"]})
    );
    assert_eq!(
        c.eligible("Kcpu".into(), None),
        Vec::<String>::new(),
        "and it leaves the pool"
    );

    // The platform record is gone: the room it hosts is no longer current either, even though its
    // own attestation has not expired.
    crate::store::remove(crate::store::Table::Platform, &ppid_hash(&PPID));
    call_as(BUYER, no_deposit());
    assert_eq!(
        c.check_room(key),
        json!({"ok": false, "deny_reasons": ["platform_not_admitted"]})
    );
    assert_eq!(
        c.eligible("Kcpu".into(), None),
        Vec::<String>::new(),
        "and it leaves the pool"
    );

    // And a room whose record is gone altogether (what E16's `remove_room` will do) is skipped.
    crate::store::remove(crate::store::Table::Room, &room_key());
    assert_eq!(c.eligible("Kcpu".into(), None), Vec::<String>::new());
    assert!(!c.current(&room_key()));
}

#[test]
fn a_class_must_be_one_core_knows() {
    let c = contract();
    expect_panic("E_DECODE", || {
        c.eligible("Nope".into(), None);
    });
}

/// The pool is bounded, and a full pool first drops the rooms that are no longer current.
#[test]
fn the_pool_is_capped_and_makes_room_for_live_rooms() {
    let mut c = contract();
    with_room(&mut c);
    for i in 0..(crate::registry::MAX_POOL as u8) {
        let mut key = [0u8; 32];
        key[0] = i;
        key[1] = 0xff;
        call_as(KEYPOLICY, no_deposit());
        if i + 1 < crate::registry::MAX_POOL as u8 {
            c.admit_room(admit(key, measurement(false), PPID));
        } else {
            // The pool is full of current rooms: nothing can be dropped.
            expect_panic("room pool is full", || {
                c.admit_room(admit(key, measurement(false), PPID))
            });
        }
    }
    assert_eq!(c.pool(RoomClass::Kcpu).len(), crate::registry::MAX_POOL);

    // A day on, every record has expired, so the next admission reclaims the space.
    let mut key = [0u8; 32];
    key[0] = 0xaa;
    call_at(
        KEYPOLICY,
        no_deposit(),
        HEIGHT,
        NOW + MAX_ATTESTATION_SECS + 1,
    );
    c.admit_room(admit(key, measurement(false), PPID));
    assert_eq!(
        c.pool(RoomClass::Kcpu),
        vec![key],
        "the dead rooms were dropped"
    );
}
