//! Delivery receipts, the challenge window, timeouts and claims (SDD §3.4, §3.9.4, D11).
//!
//! Every outgoing transfer is a pull: settlement credits a claimable balance and the owner calls
//! `claim`, whose callback puts the amount back if the token refuses it. Nothing a token does can
//! stop a job from ending.

use marginal_core::audit::AuditKind;
use marginal_core::codec::hash_of;
use marginal_core::credential::{payout_approval_signing_bytes, PayoutApproval};
use marginal_core::funding::fee_bps;
use marginal_core::json::{parse_hex, to_hex};
use marginal_core::lifecycle::{is_terminal, transition};
use marginal_core::settle::reverse_for_delivery_failure;
use marginal_core::{
    CoreError, Job, JobState, Outcome, PayoutStatus, SettlementRecord, SETTLEMENT_V,
};
use near_sdk::borsh::from_slice;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise, PromiseError};

use crate::store::{self, num, Table};
use crate::{fail, now_secs, Clearing, ClearingExt};

const FT_TRANSFER_GAS: Gas = Gas::from_tgas(15);
const ON_CLAIM_GAS: Gas = Gas::from_tgas(10);

#[near]
impl Clearing {
    /// The room says the good was delivered, and what it delivered (SDD §3.4, AC-30). The hash must
    /// be the one the verdict committed to, so the buyer can check what it got against the same
    /// commitment.
    pub fn submit_delivery_receipt(&mut self, job_id: U64, delivery_hash: String) {
        let job: Job =
            store::get(Table::Job, &num(job_id.0)).unwrap_or_else(|| fail(CoreError::Ticket));
        let mut record = self.settlement(job_id.0);
        if job.state != JobState::Deal {
            fail(CoreError::JobStateInvalid)
        }
        let hash: [u8; 32] = parse_hex(&delivery_hash).unwrap_or_else(|| fail(CoreError::Decode));
        if record.delivery_commitment != Some(hash) {
            fail(CoreError::CommitmentMismatch)
        }
        if record.delivery_receipt.is_some() {
            fail(CoreError::ReceiptReplay)
        }
        record.delivery_receipt = Some(hash);
        store::put(Table::Settlement, &num(job_id.0), &record);
        self.emit(
            AuditKind::DeliveryReceipt,
            "delivery_receipt",
            job.id,
            json!({ "job_id": job.id, "delivery_hash": delivery_hash }),
        );
    }

    /// Pays the seller once the good was delivered and the challenge window has passed
    /// (SDD §3.4, §3.9.4, AC-30, AC-47). Anyone may call it; the money only ever goes to the
    /// seller's claimable balance.
    ///
    /// `approval` is Borsh of a core `PayoutApproval` signed by the compliance key: the route is
    /// screened again at release, and a sanctions match leaves the payout `Blocked` with its
    /// screening reference rather than paying or silently dropping it.
    pub fn release_held(&mut self, job_id: U64, approval: Base64VecU8, sig: Base64VecU8) -> Value {
        let job: Job =
            store::get(Table::Job, &num(job_id.0)).unwrap_or_else(|| fail(CoreError::Ticket));
        let mut record = self.settlement(job_id.0);
        if job.state != JobState::Deal {
            fail(CoreError::JobStateInvalid)
        }
        if record.delivery_receipt.is_none() {
            fail(CoreError::DeliveryMissing)
        }
        match record.held_until {
            Some(until) if now_secs() >= until => {}
            _ => fail(CoreError::JobStateInvalid),
        }
        let listing = self.listing(job.listing_id);
        let seller = crate::account_id(&listing.seller);
        let token = crate::account_id(&job.token);
        let approval: PayoutApproval =
            from_slice(&approval.0).unwrap_or_else(|_| fail(CoreError::Decode));
        self.check_approval(&approval, &sig, &seller, &listing.payout);

        let mut job = job;
        if approval.blocked {
            record.payout = PayoutStatus::Blocked {
                screening_ref: approval.screening_id,
            };
            store::put(Table::Settlement, &num(job.id), &record);
            self.emit(
                AuditKind::PayoutFailed,
                "payout_blocked",
                job.id,
                json!({
                    "job_id": job.id,
                    "seller": seller,
                    "screening_id": to_hex(&approval.screening_id),
                    "list_version": to_hex(&approval.list_version),
                }),
            );
            return json!({ "status": "Blocked", "screening_id": to_hex(&approval.screening_id) });
        }

        // The seller's share of the clearing fee comes off the proceeds (§3.9.1).
        // The rate is at most one whole (governance validates the table), so a fee of a held
        // amount cannot overflow.
        let fee = fee_bps(record.held, self.fees.clearing_fee_seller_bps)
            .expect("a fee of at most 100% of a held amount")
            .min(record.held);
        let split = marginal_core::settle::split(fee, self.shares()).expect("shares add up to one");
        let proceeds = record.held - fee;
        self.credit(Table::Claimable, &seller, &token, proceeds);
        if fee > 0 {
            self.credit(Table::Claimable, &self.gov.clone(), &token, fee);
        }
        record.fees = marginal_core::FeeSplit {
            compute: record.fees.compute,
            treasury: record.fees.treasury + split.treasury,
            operator_pool: record.fees.operator_pool + split.operator_pool,
            assurance_pool: record.fees.assurance_pool + split.assurance_pool,
        };
        record.held = 0;
        record.payout = PayoutStatus::Claimable;
        store::put(Table::Settlement, &num(job.id), &record);
        job.buckets.held = 0;
        job.state = transition(job.state, JobState::Final).expect("a deal may be finalised");
        store::put(Table::Job, &num(job.id), &job);
        self.emit(
            AuditKind::HeldReleased,
            "held_released",
            job.id,
            json!({
                "job_id": job.id,
                "seller": seller,
                "proceeds": U128(proceeds),
                "fee": U128(fee),
                "route": format!("{:?}", listing.payout),
            }),
        );
        json!({ "status": "Released", "proceeds": U128(proceeds) })
    }

    /// Ends a job nobody finished (SDD §3.4, D11, AC-9, AC-34). Anyone may call it.
    ///
    /// Before a verdict and past the deadline, the buyer is made whole and the leakage reservation
    /// is released. After a deal, past the delivery deadline with no receipt, the held price and
    /// the fee go back to the buyer and the job ends in `DeliveryFailure`.
    pub fn refund_expired(&mut self, job_id: U64) -> Value {
        let mut job: Job =
            store::get(Table::Job, &num(job_id.0)).unwrap_or_else(|| fail(CoreError::Ticket));
        if is_terminal(job.state) {
            fail(CoreError::JobStateInvalid)
        }
        let token = crate::account_id(&job.token);
        // The internal provisioning and screening jobs have no buyer and no money: there is
        // nobody to refund, so they are not refundable.
        let buyer = match job
            .buyer
            .as_ref()
            .and_then(marginal_core::BuyerRef::account)
        {
            Some(id) => crate::account_id(id),
            None => fail(CoreError::JobStateInvalid),
        };

        if job.state == JobState::Deal {
            let mut record = self.settlement(job.id);
            match job.delivery_deadline_height {
                Some(deadline) if env::block_height() > deadline => {}
                _ => fail(CoreError::JobStateInvalid),
            }
            if record.delivery_receipt.is_some() {
                fail(CoreError::JobStateInvalid)
            }
            // The parts being added back came out of this job's own buckets.
            let buckets =
                reverse_for_delivery_failure(&job.buckets, &record.fees).expect("its own money");
            let returned = buckets.refund - job.buckets.refund;
            // The fee that was taken on the price is reversed with it.
            let fee_total =
                record.fees.treasury + record.fees.operator_pool + record.fees.assurance_pool;
            if fee_total > 0 {
                self.debit(Table::Claimable, &self.gov.clone(), &token, fee_total);
            }
            record.fees = marginal_core::FeeSplit {
                compute: record.fees.compute,
                treasury: 0,
                operator_pool: 0,
                assurance_pool: 0,
            };
            record.outcome = Outcome::DeliveryFailure;
            record.held = 0;
            record.refund += returned;
            record.payout = PayoutStatus::Released;
            store::put(Table::Settlement, &num(job.id), &record);
            self.credit(Table::Balance, &buyer, &token, returned);
            job.buckets = buckets;
            job.state = transition(job.state, JobState::DeliveryFailure)
                .expect("a deal may fail to deliver");
            store::put(Table::Job, &num(job.id), &job);
            self.emit(
                AuditKind::Refund,
                "refund",
                job.id,
                json!({
                    "job_id": job.id,
                    "outcome": "DeliveryFailure",
                    "buyer": buyer,
                    "refund": U128(returned),
                }),
            );
            return json!({ "status": "DeliveryFailure", "refund": U128(returned) });
        }

        if env::block_height() <= job.deadline_height {
            fail(CoreError::JobStateInvalid)
        }
        // Nothing ran, so nothing is owed: every bucket goes back and the reservation is released.
        let mut listing = self.listing(job.listing_id);
        self.debit_leakage(&mut listing, job.max_debit_mbits, 0);
        store::put(Table::Listing, &num(listing.id), &listing);
        // The buckets were funded from one amount, so they still add up to one.
        let refund = marginal_core::funding::total(&job.buckets).expect("what was funded");
        self.credit(Table::Balance, &buyer, &token, refund);
        job.buckets = marginal_core::Buckets {
            budget: 0,
            compute: 0,
            comp_reserved: 0,
            fee_reserved: 0,
            storage: 0,
            held: 0,
            refund,
        };
        // Parked, requested, assigned or computing: every live state before a verdict may time
        // out (§3.5), and the terminal ones were refused above.
        job.state = transition(job.state, JobState::Timeout).expect("a live job may time out");
        store::put(Table::Job, &num(job.id), &job);
        for room in &job.assigned {
            store::close_job(room, job.id);
        }
        let record = SettlementRecord {
            v: SETTLEMENT_V,
            job_id: job.id,
            outcome: Outcome::Timeout,
            privacy: job.privacy,
            value: None,
            components_commitment: None,
            price: 0,
            fees: marginal_core::FeeSplit {
                compute: 0,
                treasury: 0,
                operator_pool: 0,
                assurance_pool: 0,
            },
            refund,
            leakage_debit_mbits: 0,
            leakage_comp: 0,
            held: 0,
            held_until: None,
            delivery_commitment: None,
            delivery_receipt: None,
            cert_hashes: vec![],
            simulated_flags: 0,
            audit_seq: self.audit_seq + 1,
            audit_head: [0; 32],
            payout: PayoutStatus::Released,
        };
        store::put(Table::Settlement, &num(job.id), &record);
        self.emit(
            AuditKind::Refund,
            "refund",
            job.id,
            json!({
                "job_id": job.id,
                "outcome": "Timeout",
                "buyer": buyer,
                "refund": U128(refund),
                "released_mbits": job.max_debit_mbits,
            }),
        );
        json!({ "status": "Timeout", "refund": U128(refund) })
    }

    /// Pays out a claimable balance (SDD §3.9.4). The callback puts it back if the token refuses.
    #[payable]
    pub fn claim(&mut self, token: AccountId) -> Promise {
        near_sdk::assert_one_yocto();
        let account = env::predecessor_account_id();
        self.require_not_agent(&account);
        let amount = self.get_claimable(account.clone(), token.clone());
        require!(amount.0 > 0, "nothing to claim");
        self.debit(Table::Claimable, &account, &token, amount.0);
        Promise::new(token.clone())
            .function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::to_vec(&json!({
                    "receiver_id": account,
                    "amount": amount,
                }))
                .expect("json"),
                NearToken::from_yoctonear(1),
                FT_TRANSFER_GAS,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(ON_CLAIM_GAS)
                    .on_claim(account, token, amount),
            )
    }

    #[private]
    pub fn on_claim(
        &mut self,
        account: AccountId,
        token: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let paid = result.is_ok();
        if !paid {
            self.credit(Table::Claimable, &account, &token, amount.0);
        }
        self.emit(
            if paid {
                AuditKind::PayoutCompleted
            } else {
                AuditKind::PayoutFailed
            },
            if paid { "claim" } else { "claim_failed" },
            0,
            json!({ "account": account, "token": token, "amount": amount, "paid": paid }),
        );
        paid
    }

    /// A job's settlement record (SDD §3.3), once it has one.
    pub fn get_settlement(&self, job_id: U64) -> Option<Value> {
        let record: SettlementRecord = store::get(Table::Settlement, &num(job_id.0))?;
        Some(json!({
            "job_id": record.job_id,
            "outcome": format!("{:?}", record.outcome),
            "price": U128(record.price),
            "refund": U128(record.refund),
            "held": U128(record.held),
            "held_until": record.held_until,
            "fees": crate::settle::fees_json(&record.fees),
            "leakage_debit_mbits": record.leakage_debit_mbits,
            "leakage_comp": U128(record.leakage_comp),
            // Sealed mode only: what a later opening of the scores is replayed against (§3.17).
            "components_commitment": record.components_commitment.map(|h| to_hex(&h)),
            "delivery_commitment": record.delivery_commitment.map(|h| to_hex(&h)),
            "delivery_receipt": record.delivery_receipt.map(|h| to_hex(&h)),
            "cert_hashes": record.cert_hashes.iter().map(|h| to_hex(h)).collect::<Vec<_>>(),
            "simulated_flags": record.simulated_flags,
            "audit_seq": record.audit_seq,
            "payout": format!("{:?}", record.payout),
        }))
    }
}

impl Clearing {
    pub(crate) fn settlement(&self, job_id: u64) -> SettlementRecord {
        store::get(Table::Settlement, &num(job_id))
            .unwrap_or_else(|| fail(CoreError::JobStateInvalid))
    }

    /// The compliance service's approval of this payout route (AC-47).
    fn check_approval(
        &self,
        approval: &PayoutApproval,
        sig: &Base64VecU8,
        seller: &AccountId,
        route: &marginal_core::PayoutRoute,
    ) {
        let key = self
            .compliance_key
            .unwrap_or_else(|| fail(CoreError::CredentialInvalid));
        if approval.domain != PayoutApproval::DOMAIN
            || approval.chain_id != self.chain_id
            || approval.clearing != env::current_account_id().as_str()
            || approval.subject != seller.as_str()
            || approval.route_hash != hash_of(route)
        {
            fail(CoreError::Binding)
        }
        if approval.expiry_height < env::block_height() {
            fail(CoreError::CredentialInvalid)
        }
        let signature: [u8; 64] = sig
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| fail(CoreError::CredentialInvalid));
        if !env::ed25519_verify(
            &signature,
            &payout_approval_signing_bytes(approval)[..],
            &key,
        ) {
            fail(CoreError::CredentialInvalid)
        }
    }
}
