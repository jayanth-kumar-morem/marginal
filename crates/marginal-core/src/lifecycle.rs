//! The job state machine (SDD §3.5). One table, shared by the contract and by anything that
//! replays a job's history, so nobody has to re-read the diagram to know what may follow what.
//!
//! Only the states M1 builds are here. `Revoked`, `Fault` and `Session` are format-only (v2), and
//! reaching one is refused like any other invalid move.

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::domain_bytes;
use crate::error::CoreError;
use crate::json::hex;
use crate::types::{AccountId, JobState, RoomKey};

/// Whether a job may move from `from` to `to`, and the new state if it may.
///
/// Every terminal state — `Final`, `NoDeal`, `Restricted`, `InputRejected`, `DeliveryFailure`,
/// `Timeout` — has no outgoing move, which is what makes double settlement impossible: the second
/// attempt cannot leave the state the first one arrived at.
pub fn transition(from: JobState, to: JobState) -> Result<JobState, CoreError> {
    use JobState::*;
    let allowed = matches!(
        (from, to),
        // An agent's job is parked until a human approves it (§3.21).
        (PendingApproval, Requested)
            // Rooms are assigned in the same call that creates the job, but the state is its own
            // step so a job that finds no room is never stored half-made.
            | (Requested, Assigned)
            // The key release is what starts the work (§3.12.3).
            | (Assigned, Computing)
            | (Computing, Verdicted)
            // What the verdict decided (§3.9.2).
            | (Verdicted, Deal)
            | (Verdicted, NoDeal)
            | (Verdicted, Restricted)
            | (Verdicted, InputRejected)
            // A deal ends when the good is delivered and the window passes, or it never arrives.
            | (Deal, Final)
            | (Deal, DeliveryFailure)
            // Nothing arrived in time (§3.4 `refund_expired`). A parked job is included: if no
            // human ever approves it, its funds must still find their way back to the buyer.
            | (PendingApproval, Timeout)
            | (Requested, Timeout)
            | (Assigned, Timeout)
            | (Computing, Timeout)
    );
    if allowed {
        Ok(to)
    } else {
        Err(CoreError::JobStateInvalid)
    }
}

/// Whether a job has finished: no further move is possible, and its funds have been settled or
/// refunded.
pub fn is_terminal(state: JobState) -> bool {
    use JobState::*;
    matches!(
        state,
        Final | NoDeal | Restricted | InputRejected | DeliveryFailure | Timeout
    )
}

/// Domain of [`room_ack_signing_bytes`].
pub const ROOM_ACK_SIGNING_DOMAIN: &[u8] = b"marginal/room-ack/v1";

/// A room saying it has the key and has started work (SDD §3.5's `Assigned --> Computing`).
///
/// Under `Ckd` the key release itself is the signal: KeyPolicy calls `authorize_release`, and that
/// call is what moves the job. A `RoomSealed` listing has no key release to observe — the room
/// opens the seller's wrap with its own `box_sk` (§3.12.7) — so the room says so itself, and this
/// is the message it signs. Without it a RoomSealed job could never leave `Assigned`, and its
/// verdict would be refused with `E_JOB_STATE_INVALID`.
///
/// It binds the chain, the contract, the job and the job's commitment, so an ack cannot be replayed
/// onto another job, another deployment or another contract.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct RoomAckV1 {
    /// Always [`RoomAckV1::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    pub job_id: u64,
    #[serde(with = "hex")]
    pub room_key: RoomKey,
    #[serde(with = "hex")]
    pub job_commitment: [u8; 32],
}

impl RoomAckV1 {
    pub const DOMAIN: [u8; 16] = *b"marginal/ack\0\0\0\0";
}

/// `"marginal/room-ack/v1" ‖ borsh(ack)`.
pub fn room_ack_signing_bytes(ack: &RoomAckV1) -> Vec<u8> {
    domain_bytes(ROOM_ACK_SIGNING_DOMAIN, ack)
}
