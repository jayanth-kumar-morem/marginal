//! Buyer context snapshots (SDD §3.4, AC-6). A snapshot is anchored *before* it is used, so the
//! context a job was priced against cannot be swapped afterwards: `request_appraisal` (E5) requires
//! an anchor at least `cooling_blocks` old, and under R2 one older than the listing's publish.

use marginal_core::audit::AuditKind;
use marginal_core::json::to_hex;
use marginal_core::{BlobRef, ContextKind, CoreError, Snapshot, SNAPSHOT_V};
use near_sdk::borsh::from_slice;
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::{from_value, json, Value};
use near_sdk::{env, near};

use crate::fees::{charge, SNAPSHOT_FEE};
use crate::store::{self, num, Table};
use crate::{fail, Clearing, ClearingExt};

#[near]
impl Clearing {
    /// Anchors a buyer's context. `kind` is a core `ContextKind` name and `blob` is Borsh of a core
    /// `BlobRef`. Storage is paid by the buyer, who owns the record.
    #[payable]
    pub fn anchor_snapshot(
        &mut self,
        kind: String,
        content_hash: String,
        blob: Base64VecU8,
        standing: bool,
    ) -> U64 {
        charge(SNAPSHOT_FEE);
        let kind: ContextKind =
            from_value(Value::String(kind)).unwrap_or_else(|_| fail(CoreError::Decode));
        let content_hash: [u8; 32] = marginal_core::json::parse_hex(&content_hash)
            .unwrap_or_else(|| fail(CoreError::Decode));
        let blob: BlobRef = from_slice(&blob.0).unwrap_or_else(|_| fail(CoreError::Decode));

        let owner = env::predecessor_account_id();
        let id = self.next_snapshot_id;
        self.next_snapshot_id += 1;
        let snapshot = Snapshot {
            v: SNAPSHOT_V,
            id,
            owner: owner.to_string(),
            kind,
            content_hash,
            blob,
            anchor_height: env::block_height(),
            standing,
        };
        store::put(Table::Snapshot, &num(id), &snapshot);
        self.emit(
            AuditKind::SnapshotAnchored,
            "snapshot_anchored",
            id,
            json!({
                "snapshot_id": id,
                "owner": owner,
                "kind": format!("{kind:?}"),
                "content_hash": to_hex(&content_hash),
                "anchor_height": snapshot.anchor_height,
                "standing": standing,
            }),
        );
        U64(id)
    }
}
