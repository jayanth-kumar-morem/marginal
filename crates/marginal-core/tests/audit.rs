//! E2.3: the audit hash chain step (SDD §3.10).

use marginal_core::audit::{audit_step, AuditEntry, AuditKind, AUDIT_GENESIS};
use marginal_core::codec::to_bytes;
use sha2::{Digest, Sha256};

mod common;
use common::{assert_every_edit_changes_the_digest, audit_entry, h, Edit};

fn expected_step(prev: &[u8; 32], entry: &AuditEntry) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(prev);
    hasher.update(to_bytes(entry));
    hasher.finalize().into()
}

fn chain(entries: &[AuditEntry]) -> Vec<[u8; 32]> {
    let mut heads = vec![];
    let mut head = AUDIT_GENESIS;
    for e in entries {
        head = audit_step(&head, e);
        heads.push(head);
    }
    heads
}

#[test]
fn the_chain_starts_at_zero_and_each_head_hashes_the_previous_one() {
    assert_eq!(AUDIT_GENESIS, [0; 32]);
    let entries: Vec<_> = (1..=5).map(audit_entry).collect();
    let heads = chain(&entries);
    let mut prev = AUDIT_GENESIS;
    for (entry, head) in entries.iter().zip(&heads) {
        assert_eq!(*head, expected_step(&prev, entry));
        prev = *head;
    }
}

/// A change to any past entry breaks every later head, and only those.
#[test]
fn tampering_with_an_entry_breaks_every_later_head() {
    let entries: Vec<_> = (1..=5).map(audit_entry).collect();
    let honest = chain(&entries);
    let mut forged = entries.clone();
    forged[2].payload_hash = h(99);
    let after = chain(&forged);
    assert_eq!(honest[..2], after[..2], "earlier heads are untouched");
    for i in 2..5 {
        assert_ne!(honest[i], after[i], "head {i} must change");
    }
}

#[test]
fn every_field_of_an_entry_is_committed() {
    let edits: Vec<Edit<AuditEntry>> = vec![
        ("seq", |e| e.seq += 1),
        ("height", |e| e.height += 1),
        ("kind", |e| e.kind = AuditKind::JobSettled),
        ("subject_id", |e| e.subject_id += 1),
        ("payload_hash", |e| e.payload_hash[0] ^= 1),
    ];
    assert_every_edit_changes_the_digest(&audit_entry(1), &edits, |e| {
        audit_step(&AUDIT_GENESIS, e)
    });
    assert_ne!(
        audit_step(&h(1), &audit_entry(1)),
        audit_step(&AUDIT_GENESIS, &audit_entry(1)),
        "the previous head"
    );
}

#[test]
fn entry_golden_layout() {
    let e = AuditEntry {
        seq: 3,
        height: 4,
        kind: AuditKind::JobRequested,
        subject_id: 5,
        payload_hash: h(6),
    };
    let mut want = 3u64.to_le_bytes().to_vec();
    want.extend(4u64.to_le_bytes());
    want.push(6); // JobRequested is the 7th kind
    want.extend(5u64.to_le_bytes());
    want.extend(h(6));
    assert_eq!(to_bytes(&e), want);
}
