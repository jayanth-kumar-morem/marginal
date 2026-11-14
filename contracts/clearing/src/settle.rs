//! Settlement, the challenge window and what happens when a job ends badly (SDD §3.9.2, §3.9.4).
//!
//! `settle_job` applies core's outcome table and stores the `SettlementRecord` that every later
//! step reads: the receipt, the release, the refund and the claim. The record carries the audit
//! chain's position at the moment it was written, so a settlement can be placed in the chain.

use marginal_core::audit::AuditKind;
use marginal_core::json::to_hex;
use marginal_core::leakage::OUTCOME_MBITS;
use marginal_core::settle::{settle, FeeShares, Settled};
use marginal_core::{
    CoreError, FeeSplit, Job, Listing, ListingStatus, Outcome, PayoutStatus, SettlementRecord,
    SETTLEMENT_V,
};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId};

use crate::store::{self, num, Table};
use crate::verdict::Checked;
use crate::{fail, now_secs, Clearing};

impl Clearing {
    /// Ends a job: moves its buckets, pays everyone, and stores the record (SDD §3.9.2).
    pub(crate) fn settle_job(
        &mut self,
        mut job: Job,
        mut listing: Listing,
        verdict: &marginal_core::verdict::VerdictV1,
        checked: Checked,
    ) -> Value {
        let settled = settle(
            checked.outcome,
            &job.buckets,
            checked.price,
            listing.leakage.price_per_bit,
            job.max_debit_mbits,
            self.fees.clearing_fee_buyer_bps,
            self.shares(),
        )
        .unwrap_or_else(|e| fail(e));

        self.debit_leakage(
            &mut listing,
            job.max_debit_mbits,
            settled.leakage_debit_mbits,
        );
        if checked.outcome == Outcome::Deal {
            listing.copies += 1;
            if listing.copies >= listing.max_copies && listing.status == ListingStatus::Active {
                listing.status = ListingStatus::SoldOut;
            }
        }
        store::put(Table::Listing, &num(listing.id), &listing);

        let token = crate::account_id(&job.token);
        let seller = crate::account_id(&listing.seller);
        self.pay_out(&settled, &job, &token, &seller);

        job.buckets = settled.buckets.clone();
        // `Computing -> Verdicted -> ends_in` is the move the lifecycle allows for every outcome
        // settlement can produce; core's `each_outcome_has_its_end_state` pins that, and the job
        // was checked to be `Computing` before the verdict was read.
        job.state = checked.ends_in;
        if checked.outcome == Outcome::Deal {
            job.delivery_deadline_height =
                Some(env::block_height() + listing.delivery_deadline_blocks);
        }
        store::put(Table::Job, &num(job.id), &job);
        for room in &job.assigned {
            store::close_job(room, job.id);
        }

        let record = SettlementRecord {
            v: SETTLEMENT_V,
            job_id: job.id,
            outcome: checked.outcome,
            privacy: job.privacy,
            value: Some(checked.price),
            components_commitment: checked.components_commitment,
            price: checked.price,
            fees: settled.fees.clone(),
            refund: settled.refund,
            leakage_debit_mbits: settled.leakage_debit_mbits,
            leakage_comp: settled.seller_comp,
            held: settled.held,
            held_until: (settled.held > 0).then(|| now_secs() + self.profile.challenge_window_secs),
            delivery_commitment: verdict.delivery_commitment,
            delivery_receipt: None,
            cert_hashes: vec![verdict.cert_hash],
            simulated_flags: checked.simulated_flags,
            audit_seq: self.audit_seq + 1,
            audit_head: [0; 32],
            payout: if settled.held > 0 {
                PayoutStatus::Held
            } else {
                PayoutStatus::Released
            },
        };
        store::put(Table::Settlement, &num(job.id), &record);
        self.emit(
            AuditKind::JobSettled,
            "job_settled",
            job.id,
            json!({
                "job_id": job.id,
                "listing_id": listing.id,
                "outcome": format!("{:?}", checked.outcome),
                "price": U128(checked.price),
                "refund": U128(settled.refund),
                "held": U128(settled.held),
                "held_until": record.held_until,
                "fees": fees_json(&settled.fees),
                "simulated_flags": checked.simulated_flags,
            }),
        );
        self.emit(
            AuditKind::LeakageDebited,
            "leakage_debited",
            job.id,
            json!({
                "job_id": job.id,
                "listing_id": listing.id,
                "debited_mbits": settled.leakage_debit_mbits,
                "compensation": U128(settled.seller_comp),
                "remaining_mbits": self.remaining_mbits(&listing),
            }),
        );
        json!({
            "status": "Settled",
            "outcome": format!("{:?}", checked.outcome),
            "price": U128(checked.price),
            "job_id": U64(job.id),
        })
    }

    /// Credits everyone settlement owes. Nothing is pushed here: a claim is pulled (§3.9.4), so a
    /// token that refuses a transfer cannot stop a job from ending.
    fn pay_out(&mut self, settled: &Settled, job: &Job, token: &AccountId, seller: &AccountId) {
        if settled.seller_comp > 0 {
            self.credit(Table::Claimable, seller, token, settled.seller_comp);
        }
        if settled.operator_compute > 0 {
            let operator = self.operator_for(job);
            self.credit(Table::Claimable, &operator, token, settled.operator_compute);
        }
        let fee_total =
            settled.fees.treasury + settled.fees.operator_pool + settled.fees.assurance_pool;
        if fee_total > 0 {
            self.credit(Table::Claimable, &self.gov.clone(), token, fee_total);
        }
        if settled.refund > 0 {
            // Only `request_appraisal` creates a job that settles, and it always names a buyer.
            let buyer = job
                .buyer
                .as_ref()
                .and_then(marginal_core::BuyerRef::account)
                .expect("an appraisal job has an account buyer");
            self.credit(
                Table::Balance,
                &crate::account_id(buyer),
                token,
                settled.refund,
            );
        }
    }

    /// Who is paid for running a job: the operator of the platform its room sits on.
    ///
    /// The room that reported was checked `current` first, which means both its registry record and
    /// its platform's are there; a job only settles on a verdict from such a room.
    pub(crate) fn operator_for(&self, job: &Job) -> AccountId {
        job.assigned
            .first()
            .and_then(|room| self.room(&to_hex(room)))
            .and_then(|room| {
                store::get::<crate::registry::Platform>(Table::Platform, &room.ppid_hash)
            })
            .map(|platform| platform.operator)
            .expect("the room that reported is current, so its platform is admitted")
    }

    pub(crate) fn shares(&self) -> FeeShares {
        FeeShares {
            treasury_bps: self.fees.treasury_bps,
            operator_pool_bps: self.fees.operator_pool_bps,
            assurance_pool_bps: self.fees.assurance_pool_bps,
        }
    }

    /// Spends part of a reservation and gives the rest back (SDD §3.8, the rules E5.3 states).
    ///
    /// The debit equals the reservation, except that `Restricted` debits only the outcome bit and
    /// `InputRejected` and `Timeout` debit nothing. A listing whose budget can no longer pay for
    /// the cheapest possible job becomes `Exhausted`.
    pub(crate) fn debit_leakage(
        &mut self,
        listing: &mut Listing,
        reserved_mbits: u64,
        debit_mbits: u64,
    ) {
        if debit_mbits > reserved_mbits {
            fail(CoreError::Arithmetic)
        }
        listing.leakage.reserved_mbits = listing
            .leakage
            .reserved_mbits
            .checked_sub(reserved_mbits)
            .unwrap_or_else(|| fail(CoreError::Arithmetic));
        listing.leakage.spent_mbits = listing
            .leakage
            .spent_mbits
            .checked_add(debit_mbits)
            .unwrap_or_else(|| fail(CoreError::Arithmetic));
        if listing.status == ListingStatus::Active && self.remaining_mbits(listing) < OUTCOME_MBITS
        {
            listing.status = ListingStatus::Exhausted;
            self.emit(
                AuditKind::ListingStatus,
                "listing_status",
                listing.id,
                json!({
                    "listing_id": listing.id,
                    "status": "Exhausted",
                    "spent_mbits": listing.leakage.spent_mbits,
                    "budget_mbits": listing.leakage.budget_mbits,
                }),
            );
        }
    }
}

pub(crate) fn fees_json(fees: &FeeSplit) -> Value {
    json!({
        "treasury": U128(fees.treasury),
        "operator_pool": U128(fees.operator_pool),
        "assurance_pool": U128(fees.assurance_pool),
    })
}
