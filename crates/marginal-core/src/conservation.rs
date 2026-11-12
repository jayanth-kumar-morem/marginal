//! AC-4: no unit of a job's escrow appears or disappears. The invariant of SDD §3.9.1:
//!
//! ```text
//! deposit == Σ buckets + moved_out
//! ```
//!
//! where `moved_out` is value that has left the job's buckets: credited to a claimable balance or
//! transferred. Clearing checks it after every transition in debug and test builds.

use crate::error::CoreError;
use crate::types::Buckets;

impl Buckets {
    /// Everything the job still holds, in every bucket.
    pub fn total(&self) -> Result<u128, CoreError> {
        [
            self.budget,
            self.compute,
            self.comp_reserved,
            self.fee_reserved,
            self.storage,
            self.held,
            self.refund,
        ]
        .into_iter()
        .try_fold(0u128, |sum, bucket| sum.checked_add(bucket))
        .ok_or(CoreError::Arithmetic)
    }
}

/// `Err(Conservation)` unless `deposit == buckets.total() + moved_out`, exactly.
/// `Err(Arithmetic)` if the sum does not fit in a `u128`.
pub fn check_conservation(
    deposit: u128,
    buckets: &Buckets,
    moved_out: u128,
) -> Result<(), CoreError> {
    let accounted = buckets
        .total()?
        .checked_add(moved_out)
        .ok_or(CoreError::Arithmetic)?;
    if accounted == deposit {
        Ok(())
    } else {
        Err(CoreError::Conservation)
    }
}
