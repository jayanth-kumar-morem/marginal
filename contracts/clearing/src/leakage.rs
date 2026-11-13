//! The leakage ledger (SDD §3.8, §3.9.1). A listing's budget is the only thing that bounds how much
//! a verdict can reveal about its good, so every job reserves what it could possibly leak before it
//! runs, and the reservation is what is debited when it ends.
//!
//! E5 reserves. Spending a reservation and giving it back are settlement's job, so they are written
//! where they are used (E6.3), with the rules E5.3 states: the debit equals the reservation, except
//! that `Restricted` debits only the outcome bit and `InputRejected` and `Timeout` release it, and
//! a listing whose budget can no longer pay for the cheapest job becomes `Exhausted`.

use marginal_core::{CoreError, Listing};

use crate::{fail, Clearing};

impl Clearing {
    /// Reserves what a job may leak. The listing's budget must cover everything already reserved or
    /// spent, or the job cannot run (`E_BUDGET_EXHAUSTED`, AC-12).
    pub(crate) fn reserve_leakage(&mut self, listing: &mut Listing, mbits: u64) {
        let used = listing
            .leakage
            .reserved_mbits
            .checked_add(listing.leakage.spent_mbits)
            .and_then(|used| used.checked_add(mbits))
            .unwrap_or_else(|| fail(CoreError::Arithmetic));
        if used > listing.leakage.budget_mbits {
            fail(CoreError::BudgetExhausted)
        }
        listing.leakage.reserved_mbits += mbits;
    }

    /// What is left of the budget once reservations and spending are counted.
    pub(crate) fn remaining_mbits(&self, listing: &Listing) -> u64 {
        listing
            .leakage
            .budget_mbits
            .saturating_sub(listing.leakage.reserved_mbits)
            .saturating_sub(listing.leakage.spent_mbits)
    }
}
