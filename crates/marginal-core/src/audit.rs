//! The audit hash chain (SDD §3.10). Every state-changing call appends an entry, and each head
//! commits to every entry before it, so a change to any past entry breaks every later head.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::{sha256, to_bytes};
use crate::json::hex;

/// The head before the first entry.
pub const AUDIT_GENESIS: [u8; 32] = [0; 32];

/// The event catalogue, in the order of SDD §3.10: clearing's, then KeyPolicy's. Each contract keeps
/// its own chain; the registry's kinds are added when it is built.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum AuditKind {
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
    // KeyPolicy's own chain (SDD §3.10: same standard, own sequence).
    RoomRegistered,
    PinsSet,
    TicketIssued,
    KeyDerived,
    // Appended by E14.4. A room starting work on its own word is not the same event as KeyPolicy
    // authorising a key release, and a replay has to be able to tell them apart (§3.5, §3.12.7).
    RoomAck,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AuditEntry {
    /// 1 for the first entry.
    pub seq: u64,
    pub height: u64,
    pub kind: AuditKind,
    /// The listing, job, snapshot or change the event is about.
    pub subject_id: u64,
    /// Hash of the event's payload.
    #[serde(with = "hex")]
    pub payload_hash: [u8; 32],
}

/// `head[n+1] = SHA-256(head[n] ‖ borsh(entry))`. The caller supplies `entry.seq = n + 1`.
pub fn audit_step(prev_head: &[u8; 32], entry: &AuditEntry) -> [u8; 32] {
    sha256(&[prev_head, &to_bytes(entry)])
}
