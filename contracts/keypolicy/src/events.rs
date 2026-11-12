//! NEP-297 events with their own hash chain (SDD §3.10: KeyPolicy keeps its own sequence). Each
//! event carries `seq` and `head`, so a missing or reordered event is detectable from the log alone.

use marginal_core::audit::{audit_step, AuditEntry, AuditKind};
use marginal_core::codec::sha256;
use marginal_core::json::to_hex;
use near_sdk::env;
use near_sdk::serde_json::{json, Value};

use crate::KeyPolicy;

impl KeyPolicy {
    /// Appends an entry to the chain and logs the event. `subject_id` is the listing, job, ticket or
    /// (for rooms) the first 8 bytes of the room key the event is about; the full detail is in `data`.
    pub(crate) fn emit(&mut self, kind: AuditKind, event: &str, subject_id: u64, data: Value) {
        self.audit_seq += 1;
        let entry = AuditEntry {
            seq: self.audit_seq,
            height: env::block_height(),
            kind,
            subject_id,
            payload_hash: sha256(&[data.to_string().as_bytes()]),
        };
        self.audit_head = audit_step(&self.audit_head, &entry);
        let envelope = json!({
            "standard": "marginal",
            "version": "1.0.0",
            "event": event,
            "data": [data],
            "seq": self.audit_seq,
            "head": to_hex(&self.audit_head),
        });
        env::log_str(&format!("EVENT_JSON:{envelope}"));
    }
}
