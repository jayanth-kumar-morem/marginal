//! What a job costs and where the money sits (SDD §3.9.1). The buckets are funded once, at request
//! time, and value only ever moves between them, so the total is fixed for the life of the job
//! (AC-4, [`crate::conservation`]).

use crate::error::CoreError;
use crate::math::mul_div;
use crate::pricing::BPS;
use crate::types::Buckets;

/// Millibits per bit: leakage is measured in thousandths of a bit (§3.8).
pub const MBITS_PER_BIT: u128 = 1_000;

/// What the seller is owed for `mbits` of leakage at `price_per_bit` (π·d/1000).
pub fn compensation(price_per_bit: u128, mbits: u64) -> Result<u128, CoreError> {
    mul_div(price_per_bit, u128::from(mbits), MBITS_PER_BIT)
}

/// A fee in basis points of `amount`, rounded down.
pub fn fee_bps(amount: u128, bps: u32) -> Result<u128, CoreError> {
    mul_div(amount, u128::from(bps), u128::from(BPS))
}

/// The buckets a job is funded with, and their total (§3.9.1).
///
/// - `budget` is the buyer's B, the most the good can be priced at;
/// - `compute` is the appraiser's fee class, what the operator is paid for running the job;
/// - `comp_reserved` is the leakage compensation the seller gets if the job runs to a verdict;
/// - `fee_reserved` is the buyer's share of the clearing fee on B;
/// - `storage` is 0 in M1: the job record's storage is paid by the deposit attached to the call.
pub fn fund(
    budget: u128,
    compute_fee: u128,
    price_per_bit: u128,
    max_debit_mbits: u64,
    clearing_fee_buyer_bps: u32,
) -> Result<Buckets, CoreError> {
    Ok(Buckets {
        budget,
        compute: compute_fee,
        comp_reserved: compensation(price_per_bit, max_debit_mbits)?,
        fee_reserved: fee_bps(budget, clearing_fee_buyer_bps)?,
        storage: 0,
        held: 0,
        refund: 0,
    })
}

/// What a caller must have to open the job: every bucket it funds.
pub fn total(buckets: &Buckets) -> Result<u128, CoreError> {
    [
        buckets.budget,
        buckets.compute,
        buckets.comp_reserved,
        buckets.fee_reserved,
        buckets.storage,
        buckets.held,
        buckets.refund,
    ]
    .into_iter()
    .try_fold(0u128, |sum, part| {
        sum.checked_add(part).ok_or(CoreError::Arithmetic)
    })
}
