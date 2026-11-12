//! `authorize`, `on_authorized`, `derive` and `on_derived`: the path from a room's signed request to a
//! key from the MPC network, and every way it can be stopped on the way.

use super::*;
use crate::store::{self, Table, Ticket};
use marginal_core::audit::{audit_step, AuditEntry, AuditKind, AUDIT_GENESIS};
use marginal_core::keyrelease::AppKey;

fn ticket(id: u64) -> Option<Ticket> {
    store::get(Table::Ticket, &id.to_le_bytes())
}

fn refused(code: &str, request: &KeyRequest, c: &mut KeyPolicy) {
    call_as("relayer.testnet", TICKET_FEE);
    let (bytes, sig) = signed(request);
    expect_panic(code, || c.authorize(bytes, sig));
}

fn ckd_reply() -> PromiseResult {
    ok_json(json!({"big_y": "bls12381g1:Y", "big_c": "bls12381g1:C"}))
}

// ---------------------------------------------------------------------------------------------
// authorize

#[test]
fn authorize_asks_the_registry_and_clearing_and_waits_for_both() {
    let mut c = contract();
    let request = ready(&mut c);
    authorize(&mut c, &request);

    let calls = sent();
    assert_eq!(calls.len(), 3);
    let room = to_hex(&room_key());

    assert_eq!(
        (calls[0].to.as_str(), calls[0].method.as_str()),
        (REGISTRY, "check_room")
    );
    assert_eq!(calls[0].json(), json!({"room_key": room}));
    assert_eq!(
        (calls[0].deposit, calls[0].gas, calls[0].weight),
        (0, Gas::from_tgas(10).as_gas(), 0)
    );

    assert_eq!(
        (calls[1].to.as_str(), calls[1].method.as_str()),
        (CLEARING, "authorize_release")
    );
    assert_eq!(
        calls[1].json(),
        json!({"job_id": 11, "room_key": room, "path_hash": to_hex(&path_hash(&request.path)), "job_commitment": to_hex(&request.job_commitment), "value_class": "M"})
    );
    assert_eq!(
        (calls[1].deposit, calls[1].gas, calls[1].weight),
        (0, Gas::from_tgas(40).as_gas(), 1)
    );

    assert_eq!(
        (calls[2].to.as_str(), calls[2].method.as_str()),
        (KEYPOLICY, "on_authorized")
    );
    let carried: Base64VecU8 = serde_json::from_value(calls[2].json()["request"].clone()).unwrap();
    assert_eq!(
        carried.0,
        to_bytes(&request),
        "the callback carries the request it is about"
    );
    assert_eq!(
        (calls[2].deposit, calls[2].gas, calls[2].weight),
        (0, Gas::from_tgas(20).as_gas(), 0)
    );
}

#[test]
fn a_room_can_be_pinned_by_name_or_by_governance() {
    // Pinned by name.
    let mut c = contract();
    let request = ready(&mut c);
    authorize(&mut c, &request);
    // Following governance lets any room the registry approves through.
    set_pins(&mut c, &seller().to_string(), 3, 1, None);
    authorize(&mut c, &request);
    // Pinning only other measurements does not.
    set_pins(
        &mut c,
        &seller().to_string(),
        3,
        1,
        Some(vec![to_hex(&[0x11; 32])]),
    );
    refused("E_NOT_PINNED", &request, &mut c);
}

#[test]
fn authorize_needs_the_fee_and_a_request_it_can_read() {
    let mut c = contract();
    let request = ready(&mut c);
    let (bytes, sig) = signed(&request);
    call_as(
        "relayer.testnet",
        NearToken::from_yoctonear(TICKET_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || c.authorize(bytes.clone(), sig.clone()));
    call_as("relayer.testnet", TICKET_FEE);
    expect_panic("E_DECODE", || c.authorize(b64(vec![1, 2, 3]), sig.clone()));
    let mut trailing = bytes.0.clone();
    trailing.push(0);
    expect_panic("E_DECODE", || c.authorize(b64(trailing), sig.clone()));
}

#[test]
fn a_request_for_another_chain_or_another_keypolicy_is_refused() {
    let mut c = contract();
    let request = ready(&mut c);
    // Correctly signed by the room, but for somewhere else: a signature cannot be replayed here.
    refused(
        "E_BINDING",
        &KeyRequest {
            chain_id: "mainnet".into(),
            ..request.clone()
        },
        &mut c,
    );
    refused(
        "E_BINDING",
        &KeyRequest {
            keypolicy: "keypolicy2.marginal-demo.testnet".into(),
            ..request.clone()
        },
        &mut c,
    );
}

#[test]
fn only_the_attested_room_can_sign_for_itself() {
    let mut c = contract();
    let request = ready(&mut c);
    let (bytes, sig) = signed(&request);

    call_as("relayer.testnet", TICKET_FEE);
    // The request changed after signing.
    let changed = KeyRequest {
        job_id: request.job_id + 1,
        ..request.clone()
    };
    expect_panic("E_BAD_SIGNATURE", || {
        c.authorize(b64(to_bytes(&changed)), sig.clone())
    });
    // The right bytes with someone else's signature.
    let forged = SigningKey::from_bytes(&[0x66; 32])
        .sign(&key_request_signing_bytes(&request))
        .to_bytes()
        .to_vec();
    expect_panic("E_BAD_SIGNATURE", || {
        c.authorize(bytes.clone(), b64(forged))
    });
    // A signature of the wrong length, and an empty one.
    expect_panic("E_BAD_SIGNATURE", || {
        c.authorize(bytes.clone(), b64(sig.0[..63].to_vec()))
    });
    expect_panic("E_BAD_SIGNATURE", || {
        c.authorize(bytes.clone(), b64(vec![]))
    });
    // A signature over the bare request, without our domain.
    let bare = room_signing_key()
        .sign(&to_bytes(&request))
        .to_bytes()
        .to_vec();
    expect_panic("E_BAD_SIGNATURE", || c.authorize(bytes.clone(), b64(bare)));
}

#[test]
fn a_key_that_was_never_attested_gets_nothing() {
    let mut c = contract();
    let request = ready(&mut c);
    // A valid signature by a key that never registered.
    let stranger = SigningKey::from_bytes(&[0x55; 32]);
    let outsider = KeyRequest {
        room_key: stranger.verifying_key().to_bytes(),
        ..request
    };
    call_as("relayer.testnet", TICKET_FEE);
    let sig = b64(stranger
        .sign(&key_request_signing_bytes(&outsider))
        .to_bytes()
        .to_vec());
    expect_panic("E_ATTESTATION_EXPIRED", || {
        c.authorize(b64(to_bytes(&outsider)), sig)
    });
}

#[test]
fn an_attestation_stops_working_when_it_expires() {
    let mut c = contract();
    let request = ready(&mut c);
    let (bytes, sig) = signed(&request);
    // The last second it is good for.
    call_at("relayer.testnet", TICKET_FEE, HEIGHT, NOW + 86_399);
    c.authorize(bytes.clone(), sig.clone());
    // From its expiry on, it is not.
    call_at("relayer.testnet", TICKET_FEE, HEIGHT, NOW + 86_400);
    expect_panic("E_ATTESTATION_EXPIRED", || {
        c.authorize(bytes.clone(), sig.clone())
    });
    call_at("relayer.testnet", TICKET_FEE, HEIGHT, NOW + 10 * 86_400);
    expect_panic("E_ATTESTATION_EXPIRED", || c.authorize(bytes, sig));
}

#[test]
fn a_path_must_be_the_canonical_listing_path() {
    let mut c = contract();
    let request = ready(&mut c);
    let id = to_hex(&marginal_core::keyrelease::listing_key_id(
        &seller().to_string(),
        3,
    ));
    for path in [
        String::new(),
        "listing".into(),
        format!("listing/{id}/v01"),
        format!("listing/{}/v1", id.to_uppercase()),
        format!("context/{id}"),
        format!("listing/{id}/v1/extra"),
    ] {
        refused(
            "E_PATH",
            &KeyRequest {
                path,
                ..request.clone()
            },
            &mut c,
        );
    }
}

#[test]
fn a_listing_with_no_pins_gets_no_key() {
    let mut c = contract();
    registered_room(&mut c);
    let request = request_with(&listing_path(&seller(), 3, 1));
    refused("E_NOT_PINNED", &request, &mut c);
}

#[test]
fn pins_are_per_seller_and_per_version() {
    let mut c = contract();
    let request = ready(&mut c);
    // Pins set by someone else for the same listing number are for a different path.
    set_pins(&mut c, "attacker.testnet", 3, 1, None);
    let victim = request_with(&listing_path(&"victim.testnet".into(), 3, 1));
    refused("E_NOT_PINNED", &victim, &mut c);
    // The seller pinned version 1 only.
    refused(
        "E_NOT_PINNED",
        &request_with(&listing_path(&seller(), 3, 2)),
        &mut c,
    );
    refused(
        "E_NOT_PINNED",
        &request_with(&listing_path(&seller(), 4, 1)),
        &mut c,
    );
    authorize(&mut c, &request);
}

// ---------------------------------------------------------------------------------------------
// on_authorized

#[test]
fn a_ticket_is_issued_once_registry_and_clearing_agree() {
    let mut c = contract();
    let request = ready(&mut c);
    let id = issue_ticket(&mut c, &request);
    assert_eq!(id, 1);
    assert_eq!(
        ticket(1),
        Some(Ticket {
            room_key: room_key(),
            path: request.path.clone(),
            app_key: AppKey {
                pk1: [5; 48],
                pk2: [6; 96]
            },
            job_id: 11,
            job_commitment: request.job_commitment,
            expires_height: HEIGHT + TICKET_TTL_BLOCKS,
            used: false,
        })
    );
    let logged = events();
    assert_eq!(logged[0]["event"], "ticket_issued");
    assert_eq!(logged[0]["data"][0]["ticket"], 1);
    assert_eq!(
        logged[0]["data"][0]["path_hash"],
        to_hex(&path_hash(&request.path))
    );
    assert_eq!(logged[0]["data"][0]["value_class"], "M");
    assert_eq!(
        issue_ticket(&mut c, &request),
        2,
        "tickets are numbered in order"
    );
    assert_eq!(TICKET_TTL_BLOCKS, 50);
}

#[test]
fn no_ticket_unless_everyone_agrees() {
    let mut c = contract();
    let request = ready(&mut c);
    let cases: Vec<(&str, Vec<PromiseResult>)> = vec![
        ("E_ROOM_REVOKED", vec![room_check(false), ok(vec![])]),
        (
            "E_REGISTRY_UNAVAILABLE",
            vec![PromiseResult::Failed, ok(vec![])],
        ),
        (
            "E_REGISTRY_UNAVAILABLE",
            vec![ok(vec![0; 5_000]), ok(vec![])],
        ),
        (
            "E_REGISTRY_UNAVAILABLE",
            vec![ok(b"not json".to_vec()), ok(vec![])],
        ),
        (
            "E_REGISTRY_UNAVAILABLE",
            vec![ok_json(json!({"deny_reasons": []})), ok(vec![])],
        ),
        (
            "E_RELEASE_DENIED",
            vec![room_check(true), PromiseResult::Failed],
        ),
    ];
    for (code, results) in cases {
        callback_with(results);
        expect_panic(code, || {
            c.on_authorized(b64(to_bytes(&request)));
        });
        assert!(ticket(1).is_none(), "{code}: no ticket");
    }
    assert_eq!(c.next_ticket, 1);
}

#[test]
fn the_ticket_fee_covers_the_biggest_ticket() {
    let _c = contract();
    call_as("relayer.testnet", TICKET_FEE);
    let longest = listing_path(&"a".repeat(64), u64::MAX, u32::MAX);
    assert!(longest.len() <= marginal_core::keyrelease::MAX_PATH_LEN);
    let biggest = Ticket {
        room_key: [0xff; 32],
        path: longest,
        app_key: AppKey {
            pk1: [0xff; 48],
            pk2: [0xff; 96],
        },
        job_id: u64::MAX,
        job_commitment: [0xff; 32],
        expires_height: u64::MAX,
        used: true,
    };
    let before = env::storage_usage();
    store::put(Table::Ticket, &u64::MAX.to_le_bytes(), &biggest);
    let used = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
    assert!(
        used <= TICKET_FEE.as_yoctonear(),
        "{used} yocto stored for a fee of {}",
        TICKET_FEE.as_yoctonear()
    );
}

// ---------------------------------------------------------------------------------------------
// derive and on_derived

#[test]
fn derive_asks_the_mpc_network_for_exactly_the_authorised_key() {
    let mut c = contract();
    let request = ready(&mut c);
    issue_ticket(&mut c, &request);
    call_at("anyone.testnet", no_deposit(), HEIGHT + 10, NOW);
    c.derive(U64(1));

    let calls = sent();
    assert_eq!(calls.len(), 2);
    assert_eq!(
        (calls[0].to.as_str(), calls[0].method.as_str()),
        (MPC, "request_app_private_key")
    );
    assert_eq!(
        (calls[0].deposit, calls[0].gas, calls[0].weight),
        (1, Gas::from_tgas(30).as_gas(), 1)
    );
    let args = calls[0].json();
    assert_eq!(args["request"]["derivation_path"], request.path.as_str());
    assert_eq!(args["request"]["domain_id"], 2);
    let pv = &args["request"]["app_public_key"]["AppPublicKeyPV"];
    let key = |curve: &str, field: &str| {
        near_sdk::bs58::decode(pv[field].as_str().unwrap().strip_prefix(curve).unwrap())
            .into_vec()
            .unwrap()
    };
    assert_eq!(key("bls12381g1:", "pk1"), vec![5; 48]);
    assert_eq!(key("bls12381g2:", "pk2"), vec![6; 96]);
    assert_eq!(args["request"].as_object().unwrap().len(), 3);

    assert_eq!(
        (calls[1].to.as_str(), calls[1].method.as_str()),
        (KEYPOLICY, "on_derived")
    );
    assert_eq!(calls[1].json(), json!({"ticket_id": "1"}));
    assert_eq!(
        (calls[1].deposit, calls[1].gas, calls[1].weight),
        (0, Gas::from_tgas(15).as_gas(), 0)
    );
}

#[test]
fn a_ticket_that_is_missing_used_or_expired_cannot_be_spent() {
    let mut c = contract();
    let request = ready(&mut c);
    call_as("anyone.testnet", no_deposit());
    expect_panic("E_TICKET", || c.derive(U64(1)));
    issue_ticket(&mut c, &request);

    // The last block it is good for.
    call_at(
        "anyone.testnet",
        no_deposit(),
        HEIGHT + TICKET_TTL_BLOCKS,
        NOW,
    );
    c.derive(U64(1));
    // One block later it is not.
    call_at(
        "anyone.testnet",
        no_deposit(),
        HEIGHT + TICKET_TTL_BLOCKS + 1,
        NOW,
    );
    expect_panic("E_TICKET", || c.derive(U64(1)));

    // A spent ticket.
    call_at("anyone.testnet", no_deposit(), HEIGHT + 1, NOW);
    callback_with(vec![ckd_reply()]);
    c.on_derived(U64(1));
    call_at("anyone.testnet", no_deposit(), HEIGHT + 2, NOW);
    expect_panic("E_TICKET", || c.derive(U64(1)));
}

#[test]
fn the_ticket_is_spent_only_when_the_key_comes_back() {
    let mut c = contract();
    let request = ready(&mut c);
    issue_ticket(&mut c, &request);

    // A failed or malformed MPC answer leaves the ticket for a retry.
    for failure in [
        PromiseResult::Failed,
        ok(vec![0; 5_000]),
        ok(b"nonsense".to_vec()),
        ok_json(json!({"big_y": "only one"})),
    ] {
        callback_with(vec![failure]);
        expect_panic("E_DERIVE_FAILED", || {
            c.on_derived(U64(1));
        });
        assert!(!ticket(1).unwrap().used);
    }
    call_at("anyone.testnet", no_deposit(), HEIGHT + 5, NOW);
    c.derive(U64(1));

    callback_with(vec![ckd_reply()]);
    let response = c.on_derived(U64(1));
    assert_eq!(
        (response.big_y.as_str(), response.big_c.as_str()),
        ("bls12381g1:Y", "bls12381g1:C")
    );
    assert!(ticket(1).unwrap().used);
    let logged = events();
    assert_eq!(logged[0]["event"], "key_derived");
    assert_eq!(logged[0]["data"][0]["big_c"], "bls12381g1:C");

    // The same answer arriving twice (two derives raced) spends once and logs once.
    callback_with(vec![ckd_reply()]);
    assert_eq!(c.on_derived(U64(1)).big_y, "bls12381g1:Y");
    assert!(events().is_empty());
}

// ---------------------------------------------------------------------------------------------
// The whole path

/// Nonce, registration, pins, authorize, ticket, derive: and the events of all of it chain.
#[test]
fn the_whole_path_and_its_event_chain() {
    let mut c = contract();
    let mut log: Vec<Value> = vec![];
    registered_room(&mut c);
    log.extend(events());
    let room = room_measurement_hash(&c);
    set_pins(&mut c, &seller().to_string(), 3, 1, Some(vec![room]));
    log.extend(events());
    let request = request_with(&listing_path(&seller(), 3, 1));
    authorize(&mut c, &request);
    issue_ticket(&mut c, &request);
    log.extend(events());
    call_as("anyone.testnet", no_deposit());
    c.derive(U64(1));
    callback_with(vec![ckd_reply()]);
    c.on_derived(U64(1));
    log.extend(events());

    let kinds: Vec<&str> = log.iter().map(|e| e["event"].as_str().unwrap()).collect();
    assert_eq!(
        kinds,
        [
            "room_registered",
            "pins_set",
            "ticket_issued",
            "key_derived"
        ]
    );
    let mut head = AUDIT_GENESIS;
    for (i, event) in log.iter().enumerate() {
        assert_eq!(event["seq"], i as u64 + 1, "no gaps");
        let kind = [
            AuditKind::RoomRegistered,
            AuditKind::PinsSet,
            AuditKind::TicketIssued,
            AuditKind::KeyDerived,
        ][i];
        let subject = match kind {
            AuditKind::RoomRegistered => u64::from_le_bytes(room_key()[..8].try_into().unwrap()),
            AuditKind::PinsSet => 3,
            _ => 1,
        };
        let entry = AuditEntry {
            seq: i as u64 + 1,
            height: HEIGHT,
            kind,
            subject_id: subject,
            payload_hash: marginal_core::codec::sha256(&[event["data"][0].to_string().as_bytes()]),
        };
        head = audit_step(&head, &entry);
        assert_eq!(
            event["head"],
            to_hex(&head),
            "event {} extends the chain",
            i + 1
        );
    }
    assert_eq!(c.audit_head(), json!({"seq": 4, "head": to_hex(&head)}));
    let _ = ValueClass::M;
}
