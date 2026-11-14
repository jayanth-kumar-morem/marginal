//! `room_ack`: the `Assigned → Computing` move for a listing whose key release clearing never sees
//! (SDD §3.5's `room ack (RoomSealed)`, §3.12.7; E14.4).
//!
//! Under `Ckd` the transition is `authorize_release`, and KeyPolicy calling it *is* the
//! authorisation. A `RoomSealed` listing has no release to observe, so the room signs for itself.
//! That makes the signature the only thing standing between an untrusted operator and a job that
//! claims to be working, so every way of getting it wrong is tested here.

use marginal_core::attest::MAX_ATTESTATION_SECS;
use marginal_core::lifecycle::{room_ack_signing_bytes, RoomAckV1};

use super::*;

/// A `RoomSealed` listing, published straight from `Draft` (there is nothing to provision), and an
/// appraisal job sitting in `Assigned` waiting for the room to say it has started.
fn assigned_room_sealed(c: &mut Clearing) -> (u64, u64) {
    with_room(c);
    let sealed = ListingSpec {
        key_mode: KeyReleaseMode::RoomSealed,
        ..spec()
    };
    call_as(SELLER, LISTING_FEE);
    let listing_id = c.create_listing(b64(&sealed)).0;
    call_as(SELLER, PUBLISH_FEE);
    let screening_job = c.publish_listing(U64(listing_id), b64(&publish_spec())).0;
    let report = screening_report(listing_id, screening_job, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&report), sign(&screening_signing_bytes(&report)));

    fund_buyer(c, 10_000_000_000);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    assert_eq!(
        c.get_job(U64(job_id)).unwrap()["state"],
        "Assigned",
        "a RoomSealed job starts assigned, with no key release to wait for",
    );
    (listing_id, job_id)
}

/// The ack this room would sign for this job.
fn ack_for(c: &Clearing, job_id: u64) -> RoomAckV1 {
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    RoomAckV1 {
        domain: RoomAckV1::DOMAIN,
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        room_key: room_key(),
        job_commitment: marginal_core::json::parse_hex(&commitment).unwrap(),
    }
}

fn ack(c: &mut Clearing, a: &RoomAckV1) {
    call_as(OPERATOR, no_deposit());
    c.room_ack(b64(a), sign(&room_ack_signing_bytes(a)));
}

/// The whole point: a RoomSealed job acks, computes and settles. Before `room_ack` existed the
/// room could open the good and seal a delivery and then `submit_verdict` failed
/// `E_JOB_STATE_INVALID`, so the local demo could never reach a settlement.
#[test]
fn a_room_sealed_job_acks_and_then_settles() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    register_judge(&mut c);

    let a = ack_for(&c, job_id);
    ack(&mut c, &a);
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Computing");

    let verdict = verdict_for(&c, job_id, VerdictStatus::Ok, vec![judged(10), judged(9)]);
    call_as(OPERATOR, no_deposit());
    c.submit_verdict(b64(&verdict), sign_verdict(&verdict));
    let settlement = c.get_settlement(U64(job_id)).unwrap();
    assert_eq!(settlement["outcome"], "Deal", "{settlement}");
}

/// The audit chain records the ack as **its own kind**, so a replay can tell a job that KeyPolicy
/// authorised from one a room started on its own word. Reusing `KeyReleaseAuthorized` would have
/// made the two indistinguishable to `verifiers/replay-ts`, which reads this view and not the logs.
#[test]
fn the_ack_is_recorded_as_its_own_kind_of_event() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let a = ack_for(&c, job_id);
    ack(&mut c, &a);
    let entries = c.get_audit(U64(0), 200);
    let acks: Vec<_> = entries.iter().filter(|e| e["kind"] == "RoomAck").collect();
    assert_eq!(acks.len(), 1, "exactly one ack: {entries:?}");
    assert_eq!(acks[0]["subject_id"], job_id, "the subject is the job");
    assert!(
        entries.iter().all(|e| e["kind"] != "KeyReleaseAuthorized"),
        "a RoomSealed job has no key release to authorise",
    );
}

/// A Ckd job must go through KeyPolicy. If a room could ack one, it could start work on a job it
/// was never given a key for, and the key release would no longer be what gates the work.
#[test]
fn a_ckd_job_cannot_be_acked() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    let a = ack_for(&c, job_id);
    let signature = sign(&room_ack_signing_bytes(&a));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_RULE_DISABLED", || c.room_ack(b64(&a), signature));
}

/// An ack is bound to one deployment, one contract and one message type, so it cannot be lifted
/// from a test chain, another contract or another message and replayed here.
#[test]
fn an_ack_is_bound_to_this_chain_this_contract_and_this_domain() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let good = ack_for(&c, job_id);

    for broken in [
        RoomAckV1 {
            domain: *b"marginal/screen\0",
            ..good.clone()
        },
        RoomAckV1 {
            chain_id: "testnet".into(),
            ..good.clone()
        },
        RoomAckV1 {
            clearing: "other.testnet".into(),
            ..good.clone()
        },
    ] {
        let signature = sign(&room_ack_signing_bytes(&broken));
        call_as(OPERATOR, no_deposit());
        expect_panic("E_BINDING", || c.room_ack(b64(&broken), signature));
    }
}

/// Everything else the call refuses, each leaving the job exactly where it was.
#[test]
fn the_ack_must_name_a_real_job_its_own_commitment_and_an_assigned_room() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let good = ack_for(&c, job_id);

    let missing = RoomAckV1 {
        job_id: job_id + 404,
        ..good.clone()
    };
    let signature = sign(&room_ack_signing_bytes(&missing));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_TICKET", || c.room_ack(b64(&missing), signature));

    let wrong_commitment = RoomAckV1 {
        job_commitment: [0x11; 32],
        ..good.clone()
    };
    let signature = sign(&room_ack_signing_bytes(&wrong_commitment));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_COMMITMENT_MISMATCH", || {
        c.room_ack(b64(&wrong_commitment), signature)
    });

    // A room that exists but was not given this job.
    let other_room = RoomAckV1 {
        room_key: [0x7a; 32],
        ..good.clone()
    };
    let signature = sign(&room_ack_signing_bytes(&other_room));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_ROOM_NOT_ASSIGNED", || {
        c.room_ack(b64(&other_room), signature)
    });

    assert_eq!(
        c.get_job(U64(job_id)).unwrap()["state"],
        "Assigned",
        "nothing that was refused moved the job",
    );
}

/// Bytes that are not an ack at all.
#[test]
fn an_ack_that_is_not_borsh_is_refused() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let _ = job_id;
    call_as(OPERATOR, no_deposit());
    expect_panic("E_DECODE", || {
        c.room_ack(Base64VecU8(vec![0x01, 0x02]), Base64VecU8(vec![0; 64]))
    });
}

/// The signature is the authorisation, so a wrong length, a wrong signer and a signature over
/// different bytes all have to fail. The operator relays the ack and could try any of the three.
#[test]
fn only_the_assigned_room_s_own_signature_will_do() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let a = ack_for(&c, job_id);

    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || {
        c.room_ack(b64(&a), Base64VecU8(vec![0; 63]))
    });

    // Sixty-four bytes, but not this room's signature over these bytes.
    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || {
        c.room_ack(b64(&a), Base64VecU8(vec![0xab; 64]))
    });

    // The room's own key, over a different ack: the signature does not cover this job.
    let elsewhere = RoomAckV1 {
        job_id: job_id + 1,
        ..a.clone()
    };
    let signature = sign(&room_ack_signing_bytes(&elsewhere));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_BAD_SIGNATURE", || c.room_ack(b64(&a), signature));

    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Assigned");
}

/// A room whose attestation has expired is no longer current, and cannot start work.
#[test]
fn a_room_that_is_no_longer_current_cannot_ack() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let a = ack_for(&c, job_id);
    let signature = sign(&room_ack_signing_bytes(&a));
    call_at(
        OPERATOR,
        no_deposit(),
        HEIGHT,
        NOW + MAX_ATTESTATION_SECS + 1,
    );
    expect_panic("E_ROOM_REVOKED", || c.room_ack(b64(&a), signature));
}

/// An ack cannot be replayed: the second one finds the job already `Computing`, and the state
/// machine has no move from there to itself. This is what stops a replayed ack from resetting a
/// job that is already being worked on.
#[test]
fn an_ack_cannot_be_replayed() {
    let mut c = contract();
    let (_, job_id) = assigned_room_sealed(&mut c);
    let a = ack_for(&c, job_id);
    ack(&mut c, &a);
    let signature = sign(&room_ack_signing_bytes(&a));
    call_as(OPERATOR, no_deposit());
    expect_panic("E_JOB_STATE", || c.room_ack(b64(&a), signature));
}
