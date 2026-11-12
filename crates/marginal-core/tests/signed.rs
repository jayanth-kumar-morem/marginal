//! E2.3: verdict, forget certificate and delivery: signing bytes, hashes and wire format.

use marginal_core::audit::AuditKind;
use marginal_core::certificate::{
    certificate_hash, forget_signing_bytes, ForgetCertificateV1, Scope, FORGET_SIGNING_DOMAIN,
};
use marginal_core::codec::{from_bytes, to_bytes};
use marginal_core::delivery::{delivery_hash, DeliveryV1};
use marginal_core::verdict::{
    verdict_signing_bytes, ModelProof, VerdictStatus, VerdictV1, VERDICT_SIGNING_DOMAIN,
};
use marginal_core::*;
use sha2::{Digest, Sha256};

mod common;
use common::{certificate, delivery, h, pin, rt, verdict};

fn sha(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().into()
}

#[test]
fn enum_discriminants_are_pinned() {
    use VerdictStatus::*;
    pin(vec![
        Ok,
        Restricted,
        InputRejected,
        SchemaFailure,
        InputError,
    ]);
    pin(vec![
        Scope::BuyerContext,
        Scope::GoodPlaintext,
        Scope::Session,
    ]);
    pin(vec![
        ModelProof::WeightsInMeasurement { model_hash: h(1) },
        ModelProof::NearAiReceipt {
            text: "t".into(),
            sig65: [2; 65],
            response_body: "b".into(),
        },
        ModelProof::Simulated { signer: "s".into() },
    ]);
    use AuditKind::*;
    pin(vec![
        ListingCreated,
        ListingProvisioned,
        ListingPublished,
        ScreeningResult,
        ListingStatus,
        SnapshotAnchored,
        JobRequested,
        JobParked,
        JobAssigned,
        LeakageReserved,
        KeyReleaseAuthorized,
        VerdictAccepted,
        VerdictRejected,
        JobSettled,
        LeakageDebited,
        DeliveryReceipt,
        HeldReleased,
        Refund,
        Claim,
        PayoutInitiated,
        PayoutCompleted,
        PayoutFailed,
        AgentBlocked,
        CapRefused,
        PolicyQueued,
        PolicyExecuted,
        Pause,
        Unpause,
        RoomRegistered,
        PinsSet,
        TicketIssued,
        KeyDerived,
    ]);
}

/// Strict decoding: the exact bytes, nothing missing and nothing extra.
fn check_strict<
    T: borsh::BorshSerialize + borsh::BorshDeserialize + PartialEq + core::fmt::Debug,
>(
    value: &T,
) {
    let bytes = rt(value);
    assert_eq!(from_bytes::<T>(&bytes).as_ref(), Ok(value));
    let mut trailing = bytes.clone();
    trailing.push(0);
    assert_eq!(
        from_bytes::<T>(&trailing),
        Err(CoreError::Decode),
        "trailing byte"
    );
    for cut in 0..bytes.len() {
        assert_eq!(
            from_bytes::<T>(&bytes[..cut]),
            Err(CoreError::Decode),
            "cut at {cut}"
        );
    }
}

#[test]
fn messages_round_trip_strictly() {
    for full in [false, true] {
        check_strict(&verdict(full));
        check_strict(&certificate(full));
    }
    for entries in [0, 1, 2] {
        check_strict(&delivery(entries));
    }
}

#[test]
fn signing_bytes_are_the_domain_then_the_borsh_bytes() {
    for full in [false, true] {
        let v = verdict(full);
        assert_eq!(
            [VERDICT_SIGNING_DOMAIN, &to_bytes(&v)].concat(),
            verdict_signing_bytes(&v)
        );
        let c = certificate(full);
        assert_eq!(
            [FORGET_SIGNING_DOMAIN, &to_bytes(&c)].concat(),
            forget_signing_bytes(&c)
        );
    }
    assert_eq!(VERDICT_SIGNING_DOMAIN, b"marginal/verdict/v1");
    assert_eq!(FORGET_SIGNING_DOMAIN, b"marginal/forget/v1");
}

#[test]
fn a_signature_for_one_message_kind_is_not_valid_for_another() {
    let (v, c) = (
        verdict_signing_bytes(&verdict(false)),
        forget_signing_bytes(&certificate(false)),
    );
    let prefix = |bytes: &[u8], len: usize| bytes[..len].to_vec();
    assert_ne!(prefix(&v, 18), prefix(&c, 18), "distinct domains");
    assert!(v.starts_with(b"marginal/verdict/v1") && c.starts_with(b"marginal/forget/v1"));
    // The type's own 16-byte domain field comes right after the signing domain.
    assert_eq!(&v[19..35], b"marginal/verdict");
    assert_eq!(&c[18..34], b"marginal/forget\0");
    assert_eq!(VerdictV1::DOMAIN, *b"marginal/verdict");
    assert_eq!(ForgetCertificateV1::DOMAIN, *b"marginal/forget\0");
}

#[test]
fn signing_bytes_change_with_any_field() {
    let base = verdict(false);
    let mut other = base.clone();
    other.nonce[0] ^= 1;
    assert_ne!(verdict_signing_bytes(&base), verdict_signing_bytes(&other));
    let base = certificate(false);
    let mut other = base.clone();
    other.egress_summary.pop();
    assert_ne!(forget_signing_bytes(&base), forget_signing_bytes(&other));
}

#[test]
fn certificate_and_delivery_hashes_are_sha256_of_the_borsh_bytes() {
    let c = certificate(true);
    assert_eq!(certificate_hash(&c), sha(&[&to_bytes(&c)]));
    // Not the signing bytes: the anchored hash carries no domain prefix.
    assert_ne!(certificate_hash(&c), sha(&[&forget_signing_bytes(&c)]));
    let d = delivery(2);
    assert_eq!(delivery_hash(&d), sha(&[&to_bytes(&d)]));
    let mut tampered = d.clone();
    tampered.entries[1].ciphertext[0] ^= 1;
    assert_ne!(delivery_hash(&d), delivery_hash(&tampered));
}

/// The layout of a delivery, byte by byte (SDD §3.19: `borsh(DeliveryV1 { eph_pk, entries })`).
#[test]
fn delivery_golden_layout() {
    let d = DeliveryV1 {
        eph_pk: h(1),
        entries: vec![
            marginal_core::delivery::DeliveryEntry {
                recipient: h(2),
                ciphertext: vec![9, 9, 9],
            },
            marginal_core::delivery::DeliveryEntry {
                recipient: h(3),
                ciphertext: vec![],
            },
        ],
    };
    let mut want = h(1).to_vec();
    want.extend(2u32.to_le_bytes());
    want.extend(h(2));
    want.extend(3u32.to_le_bytes());
    want.extend([9, 9, 9]);
    want.extend(h(3));
    want.extend(0u32.to_le_bytes());
    assert_eq!(to_bytes(&d), want);
}
