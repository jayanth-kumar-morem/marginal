//! Settlement by outcome (SDD §3.9.2): where a job's money goes when it ends.
//!
//! Value only moves between a job's buckets and out to named parties, and the total never changes:
//! every function here is checked against AC-4's conservation invariant
//! ([`crate::conservation::check_conservation`]).

use crate::conservation::check_conservation;
use crate::error::CoreError;
use crate::funding::{compensation, fee_bps};
use crate::leakage::OUTCOME_MBITS;
use crate::types::{Buckets, FeeSplit, Outcome};

/// How a fee is split between the treasury, the operator pool and the assurance pool, in basis
/// points of the fee. The three must add up to one whole; clearing's governance setter enforces it.
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeShares {
    pub treasury_bps: u32,
    pub operator_pool_bps: u32,
    pub assurance_pool_bps: u32,
}

/// What settlement decided: the job's buckets afterwards, and what each party is owed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settled {
    pub buckets: Buckets,
    /// Leakage compensation, to the seller's claimable balance.
    pub seller_comp: u128,
    /// The appraiser's fee class, to the operator's claimable balance.
    pub operator_compute: u128,
    /// The clearing fee taken on the price, split three ways.
    pub fees: FeeSplit,
    /// What the buyer gets back, to their balance.
    pub refund: u128,
    /// The price, held until the challenge window passes (§3.9.4).
    pub held: u128,
    pub leakage_debit_mbits: u64,
}

/// Applies the outcome table (SDD §3.9.2) to a funded job.
///
/// - `Deal`: the price is held for the seller, the room is paid for what it leaked and for its
///   compute, the fee is taken on the actual price, and the rest goes back to the buyer.
/// - `NoDeal`: no price, but the room still ran and still leaked, so compensation and compute are
///   paid and the whole fee goes back.
/// - `Restricted`: only the outcome bit was revealed, so compensation is for one bit.
/// - `InputRejected`: nothing was revealed, so the reservation is released; the room is still paid
///   for its compute, because it did the work.
/// - `Timeout`: nothing was done, so everything goes back to the buyer.
///
/// `price` is ignored unless the outcome is `Deal`. The caller has already checked that the price
/// is what the rule produced (§3.7).
pub fn settle(
    outcome: Outcome,
    buckets: &Buckets,
    price: u128,
    price_per_bit: u128,
    reserved_mbits: u64,
    clearing_fee_buyer_bps: u32,
    shares: FeeShares,
) -> Result<Settled, CoreError> {
    let deposit = crate::funding::total(buckets)?;
    let (held, debit_mbits, pay_compute, fee_on) = match outcome {
        Outcome::Deal => (price, reserved_mbits, true, price),
        Outcome::NoDeal => (0, reserved_mbits, true, 0),
        Outcome::Restricted => (0, OUTCOME_MBITS.min(reserved_mbits), true, 0),
        Outcome::InputRejected => (0, 0, true, 0),
        Outcome::Timeout => (0, 0, false, 0),
        // `DeliveryFailure` and `Revoked` reverse a settlement that already happened, and `Fault`
        // is v2: none of them is a first settlement.
        _ => return Err(CoreError::JobStateInvalid),
    };
    if held > buckets.budget {
        return Err(CoreError::Arithmetic);
    }
    let seller_comp = compensation(price_per_bit, debit_mbits)?.min(buckets.comp_reserved);
    let operator_compute = if pay_compute { buckets.compute } else { 0 };
    let fee_due = fee_bps(fee_on, clearing_fee_buyer_bps)?.min(buckets.fee_reserved);
    let fees = split(fee_due, shares)?;

    // Whatever was reserved and not used goes back with the unspent budget. Every part is at most
    // the bucket it came from, and `deposit` above is the sum of those buckets, so this total is at
    // most `deposit` and cannot pass the end of the counter.
    let refund = [
        buckets.budget - held,
        buckets.comp_reserved - seller_comp,
        buckets.fee_reserved - fee_due,
        buckets.compute - operator_compute,
        buckets.refund,
    ]
    .into_iter()
    .try_fold(0u128, |sum, part| sum.checked_add(part))
    .expect("parts of a deposit that already added up");

    let after = Buckets {
        budget: 0,
        compute: 0,
        comp_reserved: 0,
        fee_reserved: 0,
        storage: buckets.storage,
        held,
        refund,
    };
    // Each of these is at most its own bucket, so the same bound applies.
    let moved_out = seller_comp
        .checked_add(operator_compute)
        .and_then(|sum| sum.checked_add(fee_due))
        .expect("parts of a deposit that already added up");
    // AC-4, checked on every settlement rather than only in test builds: if this ever fails, the
    // arithmetic above is wrong, so there is no sensible way to carry on.
    check_conservation(deposit, &after, moved_out)
        .expect("settlement conserves the deposit (AC-4)");
    Ok(Settled {
        buckets: after,
        seller_comp,
        operator_compute,
        fees,
        refund,
        held,
        leakage_debit_mbits: debit_mbits,
    })
}

/// The state a job ends in for each outcome (SDD §3.5, §3.9.2). The outcomes that are not a first
/// settlement have no end state here: `DeliveryFailure` and `Revoked` reverse one that already
/// happened, and `Fault` is v2.
pub fn state_for(outcome: Outcome) -> Result<crate::types::JobState, CoreError> {
    use crate::types::JobState;
    match outcome {
        Outcome::Deal => Ok(JobState::Deal),
        Outcome::NoDeal => Ok(JobState::NoDeal),
        Outcome::Restricted => Ok(JobState::Restricted),
        Outcome::InputRejected => Ok(JobState::InputRejected),
        Outcome::Timeout => Ok(JobState::Timeout),
        _ => Err(CoreError::JobStateInvalid),
    }
}

/// Splits a fee three ways, giving the remainder of the division to the treasury so that the parts
/// always add up to the whole.
pub fn split(fee: u128, shares: FeeShares) -> Result<FeeSplit, CoreError> {
    let operator_pool = fee_bps(fee, shares.operator_pool_bps)?;
    let assurance_pool = fee_bps(fee, shares.assurance_pool_bps)?;
    let treasury = fee
        .checked_sub(operator_pool)
        .and_then(|rest| rest.checked_sub(assurance_pool))
        .ok_or(CoreError::Arithmetic)?;
    Ok(FeeSplit {
        compute: 0,
        treasury,
        operator_pool,
        assurance_pool,
    })
}

/// A deal that was never delivered (SDD §3.9.2, `DeliveryFailure`): the held price and the fee go
/// back to the buyer. What was already paid for the appraisal — compensation and compute — stays
/// paid, because the appraisal did happen.
pub fn reverse_for_delivery_failure(
    buckets: &Buckets,
    fees: &FeeSplit,
) -> Result<Buckets, CoreError> {
    let reversed = fees
        .treasury
        .checked_add(fees.operator_pool)
        .and_then(|sum| sum.checked_add(fees.assurance_pool))
        .ok_or(CoreError::Arithmetic)?;
    let refund = buckets
        .refund
        .checked_add(buckets.held)
        .and_then(|sum| sum.checked_add(reversed))
        .ok_or(CoreError::Arithmetic)?;
    Ok(Buckets {
        held: 0,
        refund,
        ..buckets.clone()
    })
}
