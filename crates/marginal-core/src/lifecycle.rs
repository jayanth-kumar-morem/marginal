//! The job state machine (SDD §3.5). One table, shared by the contract and by anything that
//! replays a job's history, so nobody has to re-read the diagram to know what may follow what.
//!
//! Only the states M1 builds are here. `Revoked`, `Fault` and `Session` are format-only (v2), and
//! reaching one is refused like any other invalid move.

use crate::error::CoreError;
use crate::types::JobState;

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
