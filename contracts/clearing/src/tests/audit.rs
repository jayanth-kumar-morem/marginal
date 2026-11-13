//! E4.2: the audit hash chain and its events (SDD §3.10).

use super::*;
use marginal_core::audit::{audit_step, AuditEntry, AuditKind, AUDIT_GENESIS};
use marginal_core::codec::sha256;

/// The Done line: recomputing the chain from `get_audit` reproduces `audit_head`.
#[test]
fn the_chain_recomputed_from_get_audit_matches_the_head() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = active(&mut c);
    call_as(BUYER, SNAPSHOT_FEE);
    c.anchor_snapshot(
        "Notes".into(),
        to_hex(&[0x11; 32]),
        b64(&BlobRef {
            uri_hash: [1; 32],
            sha256: [2; 32],
            size_class: 1,
        }),
        false,
    );

    let head = c.audit_head();
    let entries = c.get_audit(U64(1), 100);
    assert_eq!(entries.len() as u64, head["seq"].as_u64().unwrap());

    let mut replayed = AUDIT_GENESIS;
    for entry in &entries {
        replayed = audit_step(
            &replayed,
            &AuditEntry {
                seq: entry["seq"].as_u64().unwrap(),
                height: entry["height"].as_u64().unwrap(),
                kind: near_sdk::serde_json::from_value(entry["kind"].clone()).unwrap(),
                subject_id: entry["subject_id"].as_u64().unwrap(),
                payload_hash: marginal_core::json::parse_hex(
                    entry["payload_hash"].as_str().unwrap(),
                )
                .unwrap(),
            },
        );
    }
    assert_eq!(to_hex(&replayed), head["head"].as_str().unwrap());
    assert!(listing_id > 0);
}

/// Every event carries the `seq` and `head` of the entry it made, so an indexer can rebuild the
/// chain from the log alone (AC-37).
#[test]
fn every_event_carries_its_place_in_the_chain() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = draft(&mut c);

    let logged = events();
    assert_eq!(logged.len(), 1);
    let event = &logged[0];
    assert_eq!(event["standard"], "marginal");
    assert_eq!(event["version"], "1.0.0");
    assert_eq!(event["event"], "listing_created");
    assert_eq!(event["data"][0]["listing_id"], listing_id);
    assert_eq!(event["seq"], c.audit_head()["seq"]);
    assert_eq!(event["head"], c.audit_head()["head"]);

    // The entry stored for that event commits to the payload that was logged.
    let entry = &c.get_audit(U64(event["seq"].as_u64().unwrap()), 1)[0];
    assert_eq!(
        entry["payload_hash"],
        to_hex(&sha256(&[event["data"][0].to_string().as_bytes()]))
    );
    assert_eq!(entry["kind"], "ListingCreated");
}

/// Changing any past entry breaks every later head (SDD §3.10).
#[test]
fn a_changed_entry_breaks_every_later_head() {
    let mut c = contract();
    with_room(&mut c);
    active(&mut c);
    let entries = c.get_audit(U64(1), 100);
    assert!(entries.len() >= 5);

    let rebuild = |tampered_at: Option<usize>| {
        let mut head = AUDIT_GENESIS;
        for (i, entry) in entries.iter().enumerate() {
            let mut e = AuditEntry {
                seq: entry["seq"].as_u64().unwrap(),
                height: entry["height"].as_u64().unwrap(),
                kind: near_sdk::serde_json::from_value(entry["kind"].clone()).unwrap(),
                subject_id: entry["subject_id"].as_u64().unwrap(),
                payload_hash: marginal_core::json::parse_hex(
                    entry["payload_hash"].as_str().unwrap(),
                )
                .unwrap(),
            };
            if tampered_at == Some(i) {
                e.payload_hash[0] ^= 1;
            }
            head = audit_step(&head, &e);
        }
        head
    };
    assert_eq!(
        to_hex(&rebuild(None)),
        c.audit_head()["head"].as_str().unwrap()
    );
    for i in 0..entries.len() {
        assert_ne!(
            to_hex(&rebuild(Some(i))),
            c.audit_head()["head"].as_str().unwrap(),
            "entry {i}"
        );
    }
}

/// `get_audit` is a page: it starts at 1 whatever is asked for, never runs past the head, and is
/// capped so one call cannot run out of gas.
#[test]
fn get_audit_pages_from_one_and_stops_at_the_head() {
    let mut c = contract();
    with_room(&mut c);
    draft(&mut c);
    let seq = c.audit_head()["seq"].as_u64().unwrap();

    assert_eq!(
        c.get_audit(U64(0), 1)[0]["seq"],
        1,
        "0 means the first entry"
    );
    assert_eq!(c.get_audit(U64(1), 1).len(), 1);
    assert_eq!(
        c.get_audit(U64(seq + 1), 10),
        Vec::<Value>::new(),
        "past the head"
    );
    assert_eq!(
        c.get_audit(U64(1), 1_000).len() as u64,
        seq,
        "a page is capped"
    );
    assert_eq!(c.get_audit(U64(1), 0), Vec::<Value>::new());
}

#[test]
fn the_kinds_each_step_appends_are_the_catalogue_ones() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = active(&mut c);
    call_as(BUYER, SNAPSHOT_FEE);
    c.anchor_snapshot(
        "Notes".into(),
        to_hex(&[0x11; 32]),
        b64(&BlobRef {
            uri_hash: [1; 32],
            sha256: [2; 32],
            size_class: 1,
        }),
        true,
    );

    let kinds: Vec<AuditKind> = c
        .get_audit(U64(1), 100)
        .iter()
        .map(|e| near_sdk::serde_json::from_value(e["kind"].clone()).unwrap())
        .collect();
    assert_eq!(
        kinds,
        vec![
            AuditKind::PolicyExecuted, // the appraiser
            AuditKind::PolicyExecuted, // the measurement set
            AuditKind::PolicyExecuted, // the platform
            AuditKind::PolicyExecuted, // the room
            AuditKind::ListingCreated,
            AuditKind::JobAssigned, // provisioning
            AuditKind::ListingProvisioned,
            AuditKind::ListingPublished, // and its screening job
            AuditKind::ScreeningResult,
            AuditKind::SnapshotAnchored,
        ]
    );
    assert!(listing_id > 0);
}
