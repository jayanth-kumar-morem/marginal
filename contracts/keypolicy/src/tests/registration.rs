//! Nonces, `register_room` and the verifier callback.

use super::*;
use crate::store::{self, Attestation, Table};
use marginal_core::attest::{AdmitRoom, Rtmr3Event};
use marginal_core::audit::{audit_step, AuditEntry, AuditKind, AUDIT_GENESIS};
use marginal_core::verifier::VerificationResult;

fn nonce_expiry(nonce: &[u8; 32]) -> Option<u64> {
    store::get::<crate::store::NonceRecord>(Table::Nonce, nonce).map(|r| r.expiry)
}

fn nonce_issuer(nonce: &[u8; 32]) -> Option<String> {
    store::get::<crate::store::NonceRecord>(Table::Nonce, nonce).map(|r| r.issuer.to_string())
}

fn stored(sign_pk: &[u8; 32]) -> Option<Attestation> {
    store::get(Table::Attestation, sign_pk)
}

fn with_ppid(result: VerificationResult, ppid: Vec<u8>) -> VerificationResult {
    match result {
        VerificationResult::Verified {
            mut report,
            collateral_dates,
        } => {
            report.ppid = ppid;
            VerificationResult::Verified {
                report,
                collateral_dates,
            }
        }
        rejected => rejected,
    }
}

/// The sample room's log, for a different compose hash (so a different measurement).
fn log_with_compose(compose: [u8; 32]) -> Vec<Rtmr3Event> {
    valid_log()
        .into_iter()
        .map(|mut e| {
            match e.name.as_str() {
                "compose-hash" => e.payload = compose.to_vec(),
                "app-id" => e.payload = compose[..20].to_vec(),
                _ => {}
            }
            e
        })
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Nonces

#[test]
fn a_nonce_is_unique_stored_with_an_expiry_and_paid_for() {
    let mut c = contract();
    let (a, b) = (issue_nonce(&mut c), issue_nonce(&mut c));
    assert_ne!(a, b, "even in the same block, for the same caller");
    assert_eq!(nonce_expiry(&a), Some(HEIGHT + NONCE_TTL_BLOCKS));
    assert_eq!(nonce_issuer(&a).as_deref(), Some("operator.testnet"));
    assert_eq!(nonce_expiry(&b), Some(HEIGHT + NONCE_TTL_BLOCKS));
    // Another caller in the same block gets another nonce.
    call_as("someone.else.testnet", NONCE_FEE);
    let other: [u8; 32] = hex::decode(c.issue_nonce()).unwrap().try_into().unwrap();
    assert!(other != a && other != b);
    // A later block gives another.
    call_at("operator.testnet", NONCE_FEE, HEIGHT + 1, NOW);
    let later: [u8; 32] = hex::decode(c.issue_nonce()).unwrap().try_into().unwrap();
    assert!(![a, b, other].contains(&later));
}

#[test]
fn a_nonce_costs_its_storage() {
    let mut c = contract();
    call_as(
        "operator.testnet",
        NearToken::from_yoctonear(NONCE_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || {
        c.issue_nonce();
    });
    // The longest account id there is: the record stores who asked.
    let longest = "a".repeat(64);
    call_as(&longest, NONCE_FEE);
    let before = env::storage_usage();
    c.issue_nonce();
    let used = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
    assert!(
        used <= NONCE_FEE.as_yoctonear(),
        "a nonce stores {used} yocto of data but costs {}",
        NONCE_FEE.as_yoctonear()
    );
}

// ---------------------------------------------------------------------------------------------
// register_room

#[test]
fn register_room_sends_the_quote_to_the_locked_verifier_and_a_callback_to_itself() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request)));

    let calls = sent();
    assert_eq!(calls.len(), 2);
    assert_eq!(
        (calls[0].to.as_str(), calls[0].method.as_str()),
        (VERIFIER, "verify_quote_with_collateral_dates")
    );
    assert_eq!(
        calls[0].args,
        verify_args(&request.quote, &request.collateral),
        "the verifier's own argument layout"
    );
    assert_eq!(
        (calls[0].deposit, calls[0].gas, calls[0].weight),
        (0, Gas::from_tgas(200).as_gas(), 0)
    );
    assert_eq!(
        (calls[1].to.as_str(), calls[1].method.as_str()),
        (KEYPOLICY, "on_quote_verified")
    );
    assert_eq!(
        (calls[1].deposit, calls[1].gas, calls[1].weight),
        (0, Gas::from_tgas(60).as_gas(), 1)
    );
    assert_eq!(
        nonce_expiry(&nonce),
        None,
        "the nonce is spent the moment the call is made"
    );
}

#[test]
fn register_room_refuses_what_it_cannot_use() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);

    call_as(
        "operator.testnet",
        NearToken::from_yoctonear(ATTESTATION_FEE.as_yoctonear() - 1),
    );
    expect_panic("E_DEPOSIT", || c.register_room(b64(to_bytes(&request))));
    call_as("operator.testnet", ATTESTATION_FEE);
    expect_panic("E_DECODE", || c.register_room(b64(vec![1, 2, 3])));
    let mut trailing = to_bytes(&request);
    trailing.push(0);
    expect_panic("E_DECODE", || c.register_room(b64(trailing)));

    // An unknown nonce, an expired one, and one already used.
    let stranger = request_for(&room_signing_key(), [2; 32], [0xee; 32]);
    expect_panic("E_NONCE", || c.register_room(b64(to_bytes(&stranger))));
    call_at(
        "operator.testnet",
        ATTESTATION_FEE,
        HEIGHT + NONCE_TTL_BLOCKS + 1,
        NOW,
    );
    expect_panic("E_NONCE", || c.register_room(b64(to_bytes(&request))));
    assert_eq!(nonce_expiry(&nonce), None, "an expired nonce is gone");
    let again = issue_nonce(&mut c);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request_for(
        &room_signing_key(),
        [2; 32],
        again,
    ))));
    expect_panic("E_NONCE", || {
        c.register_room(b64(to_bytes(&request_for(
            &room_signing_key(),
            [2; 32],
            again,
        ))))
    });
}

/// The last block a nonce works in is its expiry.
#[test]
fn a_nonce_works_in_its_last_block() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    call_at(
        "operator.testnet",
        ATTESTATION_FEE,
        HEIGHT + NONCE_TTL_BLOCKS,
        NOW,
    );
    c.register_room(b64(to_bytes(&request_for(
        &room_signing_key(),
        [2; 32],
        nonce,
    ))));
}

// ---------------------------------------------------------------------------------------------
// on_quote_verified

#[test]
fn a_verified_room_is_stored_logged_and_sent_to_the_registry() {
    let mut c = contract();
    let request = registered_room(&mut c);

    let record = stored(&room_key()).expect("the attestation is stored");
    assert_eq!(record.box_pk, [2; 32]);
    assert_eq!(record.class, RoomClass::K);
    assert_eq!(record.mode, marginal_core::AttestationMode::OnChainDcap);
    assert_eq!(record.tcb_status, "UpToDate");
    assert_eq!(record.verified_height, HEIGHT);
    assert_eq!(record.expires_at, NOW + 86_400);
    assert_eq!(
        record.quote_hash,
        marginal_core::codec::sha256(&[&request.quote])
    );
    assert_eq!(
        record.collateral_hash,
        marginal_core::codec::hash_of(&request.collateral)
    );
    assert_eq!(record.measurement.compose_hash, common::COMPOSE);

    // The registry is asked to admit it, with exactly what the registry will need to decide.
    let calls = sent();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        (calls[0].to.as_str(), calls[0].method.as_str()),
        (REGISTRY, "admit_room")
    );
    assert_eq!(
        (calls[0].deposit, calls[0].gas, calls[0].weight),
        (0, Gas::from_tgas(15).as_gas(), 1)
    );
    let args = calls[0].json();
    let admit: AdmitRoom = serde_json::from_value(args["room"].clone()).unwrap();
    assert_eq!(admit.room_key, room_key());
    assert_eq!(admit.box_pk, [2; 32]);
    assert_eq!(admit.class, RoomClass::K);
    assert_eq!(admit.registered_height, HEIGHT);
    assert_eq!(admit.expires_at, NOW + 86_400);
    assert_eq!(admit.tcb_status, "UpToDate");
    assert_eq!(
        admit.ppid_hash,
        marginal_core::attest::ppid_hash(&[0xab; 16])
    );
    assert_eq!(admit.quote_hash, record.quote_hash);
    assert_eq!(
        admit.attestation_mode,
        marginal_core::AttestationMode::OnChainDcap
    );
    assert_eq!(admit.measurement, record.measurement);
    assert_eq!(args.as_object().unwrap().len(), 1, "one argument, `room`");

    let logged = events();
    assert_eq!(logged.len(), 1);
    assert_eq!(logged[0]["standard"], "marginal");
    assert_eq!(logged[0]["event"], "room_registered");
    assert_eq!(logged[0]["seq"], 1);
    assert_eq!(logged[0]["data"][0]["room_key"], to_hex(&room_key()));
    assert_eq!(
        logged[0]["data"][0]["measurement_hash"],
        to_hex(&measurement_hash(&record.measurement))
    );
    assert_eq!(logged[0]["data"][0]["mode"], "OnChainDcap");
}

fn refused_at_the_callback(reply: PromiseResult, code: &str) {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request)));
    let pending = pending_of_last_call();
    callback_with(vec![reply]);
    expect_panic(code, || c.on_quote_verified(pending));
    assert!(
        stored(&room_key()).is_none(),
        "nothing is stored for a refused room"
    );
    assert!(events().is_empty());
}

#[test]
fn every_way_the_verifier_can_refuse_is_a_stable_error() {
    refused_at_the_callback(
        ok(to_bytes(&VerificationResult::Rejected(
            marginal_core::verifier::VerifierError::DcapVerification("TCBInfo expired".into()),
        ))),
        "E_QUOTE_SIG",
    );
    refused_at_the_callback(PromiseResult::Failed, "E_VERIFIER_UNAVAILABLE");
    refused_at_the_callback(ok(vec![0; 20_000]), "E_VERIFIER_UNAVAILABLE");
    refused_at_the_callback(ok(vec![9, 9]), "E_DECODE");
    // A verified quote that is bound to something else.
    refused_at_the_callback(
        ok(to_bytes(&verified_for(&valid_log(), [0; 64]))),
        "E_REPORT_DATA",
    );
}

#[test]
fn a_nonce_is_spent_even_when_the_verifier_refuses() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request)));
    let pending = pending_of_last_call();
    callback_with(vec![PromiseResult::Failed]);
    expect_panic("E_VERIFIER_UNAVAILABLE", || c.on_quote_verified(pending));
    // Retrying needs a new nonce, and so a new quote.
    call_as("operator.testnet", ATTESTATION_FEE);
    expect_panic("E_NONCE", || c.register_room(b64(to_bytes(&request))));
}

/// The report data binds the nonce, the keys, the chain and this KeyPolicy: a quote made for one
/// registration cannot be used for another.
#[test]
fn a_quote_cannot_be_used_for_another_registration() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request)));
    let pending = pending_of_last_call();

    for (name, other) in [
        (
            "another box key",
            RoomBinding {
                box_pk: [3; 32],
                ..binding_for(&request)
            },
        ),
        (
            "another nonce",
            RoomBinding {
                nonce: [0x44; 32],
                ..binding_for(&request)
            },
        ),
        (
            "another chain",
            RoomBinding {
                chain_id: "mainnet".into(),
                ..binding_for(&request)
            },
        ),
        (
            "another KeyPolicy",
            RoomBinding {
                keypolicy: "keypolicy2.marginal-demo.testnet".into(),
                ..binding_for(&request)
            },
        ),
    ] {
        callback_with(vec![ok(to_bytes(&verified_for(
            &request.events,
            room_report_data(&other),
        )))]);
        expect_panic("E_REPORT_DATA", || c.on_quote_verified(pending.clone()));
        assert!(stored(&room_key()).is_none(), "{name}");
    }
}

// ---------------------------------------------------------------------------------------------
// A room key keeps its identity

#[test]
fn a_room_can_renew_with_a_fresh_quote() {
    let mut c = contract();
    registered_room(&mut c);
    let first = stored(&room_key()).unwrap();

    let nonce = issue_nonce(&mut c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request)));
    let pending = pending_of_last_call();
    callback_at(HEIGHT + 500, NOW + 3_600, vec![ok(verifier_says(&request))]);
    c.on_quote_verified(pending);

    let renewed = stored(&room_key()).unwrap();
    assert_eq!(renewed.measurement, first.measurement);
    assert_eq!(renewed.verified_height, HEIGHT + 500);
    assert_eq!(
        renewed.expires_at,
        NOW + 3_600 + 86_400,
        "a day from the new quote"
    );
    assert_eq!(events().len(), 1, "and a new event");
}

fn refused_renewal(
    code: &str,
    request: impl FnOnce(&mut KeyPolicy, [u8; 32]) -> (RegisterRoomRequest, Vec<u8>),
) {
    let mut c = contract();
    registered_room(&mut c);
    let before = stored(&room_key()).unwrap();
    let nonce = issue_nonce(&mut c);
    let (request, reply) = request(&mut c, nonce);
    call_as("operator.testnet", ATTESTATION_FEE);
    expect_panic(code, || {
        c.register_room(b64(to_bytes(&request)));
        let pending = pending_of_last_call();
        callback_with(vec![ok(reply)]);
        c.on_quote_verified(pending);
    });
    assert_eq!(stored(&room_key()), Some(before), "the record is untouched");
}

/// Anyone with a TDX machine can make a valid quote that names a public key it has seen on chain.
/// It must not be able to replace what is recorded for that key.
#[test]
fn nobody_can_take_over_a_registered_room_key() {
    // A different box key (refused before the verifier is even called).
    refused_renewal("E_ROOM_KEY_IN_USE", |_, nonce| {
        let request = request_for(&room_signing_key(), [0x33; 32], nonce);
        (request.clone(), verifier_says(&request))
    });
    // A different class.
    refused_renewal("E_ROOM_KEY_IN_USE", |_, nonce| {
        let request = RegisterRoomRequest {
            class: RoomClass::S,
            ..request_for(&room_signing_key(), [2; 32], nonce)
        };
        (request.clone(), verifier_says(&request))
    });
    // Different software: a valid quote with another measurement.
    refused_renewal("E_ROOM_KEY_IN_USE", |_, nonce| {
        let request = RegisterRoomRequest {
            events: log_with_compose([0xd0; 32]),
            ..request_for(&room_signing_key(), [2; 32], nonce)
        };
        (request.clone(), verifier_says(&request))
    });
    // Different hardware.
    refused_renewal("E_ROOM_KEY_IN_USE", |_, nonce| {
        let request = request_for(&room_signing_key(), [2; 32], nonce);
        let reply = to_bytes(&with_ppid(
            verified_for(&request.events, room_report_data(&binding_for(&request))),
            vec![0xcd; 16],
        ));
        (request, reply)
    });
}

/// A takeover attempt that changes the box key or the class is refused by `register_room` itself,
/// before any promise is made: the attacker's fee is spent, and the verifier's 200 TGas are not.
#[test]
fn a_changed_box_key_or_class_is_refused_before_the_verifier_is_called() {
    for (box_pk, class) in [([0x33; 32], RoomClass::K), ([2; 32], RoomClass::S)] {
        let mut c = contract();
        registered_room(&mut c);
        let nonce = issue_nonce(&mut c);
        let request = RegisterRoomRequest {
            class,
            ..request_for(&room_signing_key(), box_pk, nonce)
        };
        call_as("operator.testnet", ATTESTATION_FEE);
        expect_panic("E_ROOM_KEY_IN_USE", || {
            c.register_room(b64(to_bytes(&request)));
        });
    }
}

#[test]
fn different_rooms_register_independently() {
    let mut c = contract();
    registered_room(&mut c);
    let other_signer = SigningKey::from_bytes(&[8; 32]);
    let other_key = other_signer.verifying_key().to_bytes();
    let nonce = issue_nonce(&mut c);
    let request = request_for(&other_signer, [4; 32], nonce);
    let reply = verifier_says(&request);
    register(&mut c, request, reply);
    assert!(stored(&room_key()).is_some() && stored(&other_key).is_some());
}

// ---------------------------------------------------------------------------------------------
// Storage

/// Each fee must cover the biggest record its method can store.
#[test]
fn the_attestation_fee_covers_the_biggest_attestation() {
    let _c = contract();
    call_as("operator.testnet", ATTESTATION_FEE);
    let biggest = Attestation {
        measurement: Measurement {
            gpu_policy_hash: Some([0xff; 32]),
            ..common::measurement(true)
        },
        ppid_hash: [0xff; 32],
        box_pk: [0xff; 32],
        class: RoomClass::Kcpu,
        tcb_status: "UpToDate".into(),
        tee_tcb_svn: [0xff; 16],
        collateral_hash: [0xff; 32],
        quote_hash: [0xff; 32],
        mode: marginal_core::AttestationMode::AttesterQuorum,
        verified_height: u64::MAX,
        expires_at: u64::MAX,
    };
    let before = env::storage_usage();
    store::put(Table::Attestation, &[0xff; 32], &biggest);
    let used = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
    assert!(
        used <= ATTESTATION_FEE.as_yoctonear(),
        "{used} yocto stored for a fee of {}",
        ATTESTATION_FEE.as_yoctonear()
    );
}

// ---------------------------------------------------------------------------------------------
// The event chain

/// The `head` in every event is the audit chain over the events before it, which anyone can recompute
/// from the log alone.
#[test]
fn the_events_form_a_hash_chain_anyone_can_recompute() {
    let mut c = contract();
    assert_eq!(c.audit_head(), json!({"seq": 0, "head": "00".repeat(32)}));
    registered_room(&mut c);
    let seq1 = c.audit_head();
    assert_eq!(seq1["seq"], 1);

    let entry = AuditEntry {
        seq: 1,
        height: HEIGHT,
        kind: AuditKind::RoomRegistered,
        subject_id: u64::from_le_bytes(room_key()[..8].try_into().unwrap()),
        payload_hash: marginal_core::codec::sha256(&[logged_data_of_last_event()
            .to_string()
            .as_bytes()]),
    };
    assert_eq!(seq1["head"], to_hex(&audit_step(&AUDIT_GENESIS, &entry)));
}

fn logged_data_of_last_event() -> Value {
    // `registered_room` ends with the callback, so the log is that callback's.
    events().last().unwrap()["data"][0].clone()
}

// ---------------------------------------------------------------------------------------------
// Whose nonce, whose key

#[test]
fn a_nonce_can_only_be_used_by_the_account_that_asked_for_it() {
    let mut c = contract();
    let nonce = issue_nonce(&mut c); // asked for by operator.testnet
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    // A bystander who saw the nonce on chain cannot spend it.
    call_as("bystander.testnet", ATTESTATION_FEE);
    expect_panic("E_NONCE", || c.register_room(b64(to_bytes(&request))));
    // And the account that asked can (on a chain the failed attempt above is rolled back, so the
    // nonce is still there; the sandbox test checks that part).
    let again = issue_nonce(&mut c);
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request_for(
        &room_signing_key(),
        [2; 32],
        again,
    ))));
}

/// A registration must be signed by the key it names. A valid quote from someone's own TDX machine
/// can name any public key, so it proves nothing about who holds the key.
#[test]
fn a_registration_must_prove_it_holds_the_signing_key() {
    let mut c = contract();
    let attacker = SigningKey::from_bytes(&[0x66; 32]);
    let honest = |nonce| request_for(&room_signing_key(), [2; 32], nonce);

    let signed_with = |c: &mut KeyPolicy, edit: &dyn Fn(&mut RegisterRoomRequest)| {
        let nonce = issue_nonce(c);
        let mut request = honest(nonce);
        edit(&mut request);
        call_as("operator.testnet", ATTESTATION_FEE);
        expect_panic("E_BAD_SIGNATURE", || {
            c.register_room(b64(to_bytes(&request)))
        });
    };

    // The attacker names the victim's key, with a box key of their own, signing as themselves.
    signed_with(&mut c, &|r| {
        r.box_pk = [0x99; 32];
        r.sign_sig = attacker
            .sign(&room_pop_signing_bytes(&binding_for(r)))
            .to_bytes();
    });
    // A signature that is the victim's, but for another box key (so it was made for another registration).
    signed_with(&mut c, &|r| r.box_pk = [0x99; 32]);
    // No signature, a garbage one, and a signature over the bare report data (without our domain).
    signed_with(&mut c, &|r| r.sign_sig = [0; 64]);
    signed_with(&mut c, &|r| r.sign_sig = [0xff; 64]);
    signed_with(&mut c, &|r| {
        r.sign_sig = room_signing_key()
            .sign(&room_report_data(&binding_for(r)))
            .to_bytes()
    });
    assert!(stored(&room_key()).is_none());
}
