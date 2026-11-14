//! Views (SDD §3.4). Everything a client, a verifier or the room needs to read, as JSON built here:
//! core's records are Borsh and have no JSON schema, and amounts are decimal strings so JavaScript
//! does not round them.

use marginal_core::audit::AuditEntry;
use marginal_core::json::to_hex;
use marginal_core::{Job, Listing, Snapshot};
use near_sdk::json_types::U64;
use near_sdk::near;
use near_sdk::serde_json::{json, Value};

use crate::store::{self, num, Table};
use crate::{Clearing, ClearingExt, CLEARING_VERSION};

/// The most entries one `get_audit` call returns.
const MAX_AUDIT_PAGE: u64 = 100;

#[near]
impl Clearing {
    /// The deployment's fixed values and everything governance has set since (SDD §6.2 toggles).
    pub fn config(&self) -> Value {
        json!({
            "version": CLEARING_VERSION,
            "gov": self.gov,
            "keypolicy": self.keypolicy,
            "chain_id": self.chain_id,
            "tokens": self.tokens,
            "profile": self.profile,
            "fees": self.fees,
            "issuer_key": self.issuer_key.map(|k| to_hex(&k)),
            "compliance_key": self.compliance_key.map(|k| to_hex(&k)),
            "policy_version": self.policy_version,
            "next_listing_id": self.next_listing_id,
            "next_job_id": self.next_job_id,
            "next_snapshot_id": self.next_snapshot_id,
            "fee_schedule": {
                "listing": crate::LISTING_FEE,
                "publish": crate::PUBLISH_FEE,
                "snapshot": crate::SNAPSHOT_FEE,
                "measurement_set": crate::SET_FEE,
                "platform": crate::PLATFORM_FEE,
            },
        })
    }

    pub fn get_listing(&self, listing_id: U64) -> Option<Value> {
        let listing: Listing = store::get(Table::Listing, &num(listing_id.0))?;
        Some(json!({
            "id": listing.id,
            "seller": listing.seller,
            "version": listing.version,
            "status": format!("{:?}", listing.status),
            "asset_class": format!("{:?}", listing.asset_class),
            "category": listing.category.0,
            "licence_class": listing.licence_class,
            "good_commitment": to_hex(&listing.good_commitment),
            "ciphertext": {
                "uri_hash": to_hex(&listing.ciphertext.uri_hash),
                "sha256": to_hex(&listing.ciphertext.sha256),
                "size_class": listing.ciphertext.size_class,
            },
            "key_mode": format!("{:?}", listing.key_mode),
            "key_path_hash": to_hex(&listing.key_path_hash),
            "pk_l": listing.pk_l.map(|k| to_hex(&k)),
            "appraiser": format!("{}@{}", listing.appraiser.id, listing.appraiser.version),
            "schema_hash": to_hex(&listing.schema_hash),
            "rule": listing.rule,
            // The room recomputes `job_commitment` itself and will not trust a job parameter that
            // does not hash into it (SDD §3.12.3 step 4), so the view has to carry every field the
            // commitment covers.
            "disclosure_policy": listing.disclosure_policy,
            "token": listing.token,
            "max_copies": listing.max_copies,
            "copies": listing.copies,
            "value_class": listing.value_class,
            "leakage": self.leakage_json(&listing),
            "challenge_window_blocks": listing.challenge_window_blocks,
            "delivery_deadline_blocks": listing.delivery_deadline_blocks,
            "publish_height": listing.publish_height,
        }))
    }

    /// The listing's leakage budget and what is left of it (SDD §3.8).
    pub fn get_leakage(&self, listing_id: U64) -> Option<Value> {
        let listing: Listing = store::get(Table::Listing, &num(listing_id.0))?;
        Some(self.leakage_json(&listing))
    }

    pub fn get_job(&self, job_id: U64) -> Option<Value> {
        let job: Job = store::get(Table::Job, &num(job_id.0))?;
        Some(json!({
            "id": job.id,
            "kind": format!("{:?}", job.kind),
            "listing_id": job.listing_id,
            "listing_version": job.listing_version,
            "state": format!("{:?}", job.state),
            "token": job.token,
            "job_commitment": to_hex(&job.job_commitment),
            // M1 buyers are accounts; a nullifier-only buyer is the v2 private mode (§3.25).
            "buyer": match &job.buyer {
                Some(marginal_core::BuyerRef::Account(id)) => json!(id),
                _ => Value::Null,
            },
            "privacy": format!("{:?}", job.privacy),
            // serde, not `Debug`: `DisplayMode::Fields` has a payload, and the room feeds this
            // straight back into `job_commitment` (SDD issue 11 keeps `Fields` refused in M1).
            "mode": job.mode,
            "snapshot_id": job.snapshot_id,
            "max_debit_mbits": job.max_debit_mbits,
            // The room needs these to seal a delivery and to recompute `job_commitment` itself
            // (SDD §3.14.2 step 1, §3.19): they are public keys, and the commitment already binds
            // them, so publishing them reveals nothing a buyer did not already put on chain.
            "delivery_pk": to_hex(&job.delivery_pk),
            "compliance_pk": job.compliance_pk.map(|k| to_hex(&k)),
            "context_auth_pk": to_hex(&job.context_auth_pk),
            "buckets": {
                "budget": job.buckets.budget.to_string(),
                "compute": job.buckets.compute.to_string(),
                "comp_reserved": job.buckets.comp_reserved.to_string(),
                "fee_reserved": job.buckets.fee_reserved.to_string(),
                "storage": job.buckets.storage.to_string(),
                "held": job.buckets.held.to_string(),
                "refund": job.buckets.refund.to_string(),
            },
            "assigned": job.assigned.iter().map(|k| to_hex(k)).collect::<Vec<_>>(),
            "requested_height": job.requested_height,
            "deadline_height": job.deadline_height,
            // Set when a deal settles: the good must arrive by then (§3.4, `refund_expired`).
            "delivery_deadline_height": job.delivery_deadline_height,
        }))
    }

    /// The jobs a room still has to answer (SDD issue 5: §3.6 uses this view).
    pub fn get_jobs_for_room(&self, room_key: String) -> Vec<Value> {
        let Some(key) = marginal_core::json::parse_hex::<[u8; 32]>(&room_key) else {
            return vec![];
        };
        store::open_jobs(&key)
            .into_iter()
            .filter_map(|id| self.get_job(U64(id)))
            .collect()
    }

    pub fn get_snapshot(&self, snapshot_id: U64) -> Option<Value> {
        let snapshot: Snapshot = store::get(Table::Snapshot, &num(snapshot_id.0))?;
        Some(json!({
            "id": snapshot.id,
            "owner": snapshot.owner,
            "kind": format!("{:?}", snapshot.kind),
            "content_hash": to_hex(&snapshot.content_hash),
            "blob": {
                "uri_hash": to_hex(&snapshot.blob.uri_hash),
                "sha256": to_hex(&snapshot.blob.sha256),
                "size_class": snapshot.blob.size_class,
            },
            "anchor_height": snapshot.anchor_height,
            "standing": snapshot.standing,
        }))
    }

    /// The head of the audit chain, and how many entries it covers (SDD §3.10).
    pub fn audit_head(&self) -> Value {
        json!({ "seq": self.audit_seq, "head": to_hex(&self.audit_head) })
    }

    /// Audit entries from `from` (1 is the first), so a verifier can recompute every head
    /// (AC-37). At most [`MAX_AUDIT_PAGE`] at a time.
    pub fn get_audit(&self, from: U64, limit: u64) -> Vec<Value> {
        let first = from.0.max(1);
        let last = (first + limit.min(MAX_AUDIT_PAGE)).min(self.audit_seq + 1);
        (first..last)
            .filter_map(|seq| store::get::<AuditEntry>(Table::Audit, &num(seq)))
            .map(|entry| {
                json!({
                    "seq": entry.seq,
                    "height": entry.height,
                    "kind": entry.kind,
                    "subject_id": entry.subject_id,
                    "payload_hash": to_hex(&entry.payload_hash),
                })
            })
            .collect()
    }

    /// What the registry knows about a room (SDD §3.11).
    pub fn get_room(&self, room_key: String) -> Option<Value> {
        let room = self.room(&room_key)?;
        Some(json!({
            "room_key": to_hex(&room.room_key),
            "box_pk": to_hex(&room.box_pk),
            "ppid_hash": to_hex(&room.ppid_hash),
            "measurement_set": room.measurement_set,
            "class": room.class,
            "mode": room.mode,
            "registered_height": room.registered_height,
            "expires_at": room.expires_at,
            "current": self.current(&room.room_key),
        }))
    }
}

impl Clearing {
    fn leakage_json(&self, listing: &Listing) -> Value {
        let leakage = &listing.leakage;
        json!({
            "budget_mbits": leakage.budget_mbits,
            "reserved_mbits": leakage.reserved_mbits,
            "spent_mbits": leakage.spent_mbits,
            "remaining_mbits": leakage
                .budget_mbits
                .saturating_sub(leakage.reserved_mbits)
                .saturating_sub(leakage.spent_mbits),
            "price_per_bit": leakage.price_per_bit.to_string(),
        })
    }
}
