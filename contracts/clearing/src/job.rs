//! Appraisal jobs: `request_appraisal` and the key release that starts the work (SDD §3.4).
//!
//! The checks run in the order §3.4 gives, and each failure changes nothing. Funds move from the
//! buyer's balance into the job's buckets in the same call that creates the job, so a job is never
//! half-funded (AC-4).

use marginal_core::audit::AuditKind;
use marginal_core::commit::{job_commitment, JobCore};
use marginal_core::funding::{fund, total};
use marginal_core::json::to_hex;
use marginal_core::leakage::max_debit;
use marginal_core::lifecycle::transition;
use marginal_core::pricing::min_price;
use marginal_core::request::{validate_request, AppraisalRequest};
use marginal_core::{
    CoreError, FormulaParams, Job, JobKind, JobState, Listing, ListingStatus, Snapshot, JOB_V,
};
use near_sdk::borsh::from_slice;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, require, AccountId};

use crate::agent::AgentVerdict;
use crate::store::{self, num, Table};
use crate::{fail, Clearing, ClearingExt};

#[near]
impl Clearing {
    /// Opens an appraisal job (SDD §3.4, AC-6, AC-12, AC-14, AC-50). `request` is Borsh of a core
    /// `AppraisalRequest`.
    ///
    /// The answer says what happened: `Created` with the job id, `Parked` when an agent's budget is
    /// above the human threshold, or `Blocked` with the cap that stopped it. A blocked request is a
    /// successful transaction that creates no job, so the attempt is on the audit chain where the
    /// buyer can see what their agent tried (§3.21).
    pub fn request_appraisal(&mut self, request: Base64VecU8) -> Value {
        let request: AppraisalRequest =
            from_slice(&request.0).unwrap_or_else(|_| fail(CoreError::Decode));
        validate_request(&request).unwrap_or_else(|e| fail(e));
        let buyer = env::predecessor_account_id();

        // 1. The listing is live, current and has copies left.
        let mut listing = self.listing(request.listing_id);
        if listing.status != ListingStatus::Active || listing.version != request.listing_version {
            fail(CoreError::ListingNotActive)
        }
        if listing.copies >= listing.max_copies {
            fail(CoreError::ListingNotActive)
        }
        // The budget has to be able to buy the good, or no deal could ever be struck.
        if request.budget < min_price(&listing.rule).unwrap_or_else(|e| fail(e)) {
            fail(CoreError::RuleParams)
        }

        // 2. A nullifier credential, if the listing is gated (AC-14).
        if listing.eligibility.nullifier_gated {
            let (credential, signature) = request
                .nullifier
                .as_ref()
                .zip(request.nullifier_sig.as_ref())
                .unwrap_or_else(|| fail(CoreError::CredentialInvalid));
            self.spend_nullifier(credential, signature, &buyer, listing.id);
        }

        // 3. The snapshot is the buyer's own and was anchored long enough ago (AC-6).
        let snapshot = request
            .snapshot_id
            .map(|id| self.snapshot_for(id, &buyer, &listing));

        // 4. What the job may leak fits the listing's remaining budget (AC-12).
        let debit_mbits = max_debit(
            &listing.schema,
            &request.mode,
            &listing.rule,
            request.privacy,
            request.n_judges,
        )
        .unwrap_or_else(|e| fail(e));
        self.reserve_leakage(&mut listing, debit_mbits);

        // 5. The buyer's balance covers every bucket the job needs (§3.9.1).
        let compute_fee = self
            .appraiser(&listing.appraiser.id, listing.appraiser.version)
            .unwrap_or_else(|| fail(CoreError::FormulaDisabled))
            .compute_fee;
        let buckets = fund(
            request.budget,
            compute_fee,
            listing.leakage.price_per_bit,
            debit_mbits,
            self.fees.clearing_fee_buyer_bps,
        )
        .unwrap_or_else(|e| fail(e));
        let token: AccountId = listing.token.parse().expect("the listing's token is an id");
        let funded = total(&buckets).unwrap_or_else(|e| fail(e));
        self.debit(Table::Balance, &buyer, &token, funded);

        // 6. The agent firewall, if an agent key signed this call (§3.21).
        let caps = self.caps_for_signer(&buyer);
        let parked = match caps.as_ref().map(|c| self.agent_verdict(c, request.budget)) {
            Some(AgentVerdict::Block(cap)) => {
                // Nothing is created, so give the funds and the reservation back.
                self.credit(Table::Balance, &buyer, &token, funded);
                self.emit(
                    AuditKind::AgentBlocked,
                    "agent_blocked",
                    request.listing_id,
                    json!({
                        "buyer": buyer,
                        "listing_id": request.listing_id,
                        "budget": U128(request.budget),
                        "cap": cap,
                    }),
                );
                return json!({ "status": "Blocked", "cap": cap });
            }
            Some(AgentVerdict::Park) => true,
            Some(AgentVerdict::Allow) => false,
            None => false,
        };
        if caps.is_some() {
            self.record_agent_spend(&buyer, request.budget);
        }

        // 7 and 8. The job, its rooms and its commitment.
        let id = self.next_job_id;
        self.next_job_id += 1;
        let state = if parked {
            JobState::PendingApproval
        } else {
            JobState::Requested
        };
        let core = JobCore {
            chain_id: self.chain_id.clone(),
            clearing: env::current_account_id().to_string(),
            job_id: id,
            kind: JobKind::Appraisal,
            listing_id: listing.id,
            listing_version: listing.version,
            snapshot_id: request.snapshot_id,
            snapshot_content_hash: snapshot.as_ref().map(|s| s.content_hash),
            budget: request.budget,
            rule: listing.rule.clone(),
            formula_params: FormulaParams::default(),
            mode: request.mode.clone(),
            privacy: request.privacy,
            disclosure_policy: listing.disclosure_policy,
            max_debit_mbits: debit_mbits,
            delivery_pk: request.delivery_pk,
            compliance_pk: request.compliance_pk,
            context_auth_pk: request.context_auth_pk,
            assigned_rooms: vec![],
            deadline_height: env::block_height() + listing.delivery_deadline_blocks,
        };
        let job = Job {
            v: JOB_V,
            id,
            kind: JobKind::Appraisal,
            listing_id: listing.id,
            listing_version: listing.version,
            snapshot_id: request.snapshot_id,
            buyer: Some(marginal_core::BuyerRef::Account(buyer.to_string())),
            token: listing.token.clone(),
            buckets,
            mode: request.mode.clone(),
            privacy: request.privacy,
            max_debit_mbits: debit_mbits,
            job_commitment: job_commitment(&core),
            delivery_pk: request.delivery_pk,
            compliance_pk: request.compliance_pk,
            context_auth_pk: request.context_auth_pk,
            refund_to: request.refund_to.clone(),
            assigned: vec![],
            requested_height: env::block_height(),
            deadline_height: core.deadline_height,
            delivery_deadline_height: None,
            fast_yield: None,
            state,
            locked: false,
        };
        store::put(Table::Job, &num(id), &job);
        store::put(Table::Listing, &num(listing.id), &listing);
        if !request.sealed_context_key.is_empty() {
            store::put(Table::ContextKey, &num(id), &request.sealed_context_key);
        }
        self.emit(
            AuditKind::JobRequested,
            "job_requested",
            id,
            json!({
                "job_id": id,
                "listing_id": listing.id,
                "buyer": buyer,
                "budget": U128(request.budget),
                "funded": U128(funded),
                "job_commitment": to_hex(&job.job_commitment),
                "snapshot_id": request.snapshot_id,
                "state": format!("{state:?}"),
            }),
        );
        self.emit(
            AuditKind::LeakageReserved,
            "leakage_reserved",
            id,
            json!({
                "job_id": id,
                "listing_id": listing.id,
                "reserved_mbits": debit_mbits,
                "remaining_mbits": self.remaining_mbits(&listing),
            }),
        );
        if let Some(credential) = request.nullifier.as_ref() {
            self.emit(
                AuditKind::JobRequested,
                "nullifier_spent",
                id,
                json!({
                    "job_id": id,
                    "listing_id": listing.id,
                    "epoch": credential.epoch,
                    "tag": to_hex(&Self::nullifier_tag(&credential.nullifier)),
                }),
            );
        }

        if parked {
            self.emit(
                AuditKind::JobParked,
                "job_parked",
                id,
                json!({ "job_id": id, "buyer": buyer, "budget": U128(request.budget) }),
            );
            return json!({ "status": "Parked", "job_id": U64(id) });
        }
        self.assign_rooms(id);
        json!({ "status": "Created", "job_id": U64(id) })
    }

    /// A human approves a job their agent parked (§3.21). The call must come from a key that is not
    /// an agent key, which is what makes the approval a human one.
    pub fn approve_parked(&mut self, job_id: U64) -> U64 {
        let buyer = env::predecessor_account_id();
        // Before anything else: an agent key cannot approve its own work, whatever it asks about.
        self.require_not_agent(&buyer);
        let mut job: Job =
            store::get(Table::Job, &num(job_id.0)).unwrap_or_else(|| fail(CoreError::Ticket));
        require!(
            job.buyer == Some(marginal_core::BuyerRef::Account(buyer.to_string())),
            "only the buyer"
        );
        job.state = transition(job.state, JobState::Requested).unwrap_or_else(|e| fail(e));
        store::put(Table::Job, &num(job.id), &job);
        self.assign_rooms(job.id);
        job_id
    }

    /// KeyPolicy has verified the room and the ticket; clearing says whether this job may have its
    /// key (SDD §3.4, §3.12.3).
    ///
    /// Only KeyPolicy may call it, and that is the whole authorisation: the call arrives as a
    /// receipt from the KeyPolicy *contract*, which no access key can forge, so there is no yocto
    /// to demand. KeyPolicy attaches no deposit (its `Call::json` sends none), and this method is
    /// not payable, so a stray deposit is refused rather than kept.
    pub fn authorize_release(
        &mut self,
        // A plain number, not a string: KeyPolicy's wasm is immutable and this is what it sends
        // (`keypolicy/src/release.rs`). Job ids stay below 2^53, so JSON carries them exactly.
        job_id: u64,
        room_key: String,
        path_hash: String,
        job_commitment: String,
        value_class: Value,
    ) {
        require!(
            env::predecessor_account_id() == self.keypolicy,
            "only keypolicy"
        );
        let mut job: Job =
            store::get(Table::Job, &num(job_id)).unwrap_or_else(|| fail(CoreError::Ticket));
        let room: [u8; 32] =
            marginal_core::json::parse_hex(&room_key).unwrap_or_else(|| fail(CoreError::Decode));
        if !job.assigned.contains(&room) {
            fail(CoreError::RoomNotAssigned)
        }
        let commitment: [u8; 32] = marginal_core::json::parse_hex(&job_commitment)
            .unwrap_or_else(|| fail(CoreError::Decode));
        if commitment != job.job_commitment {
            fail(CoreError::CommitmentMismatch)
        }
        let listing = self.listing(job.listing_id);
        let path: [u8; 32] =
            marginal_core::json::parse_hex(&path_hash).unwrap_or_else(|| fail(CoreError::Decode));
        if path != listing.key_path_hash {
            fail(CoreError::Path)
        }
        // The class is the listing's own, not whatever the request claimed.
        if value_class != json!(listing.value_class) {
            fail(CoreError::Binding)
        }
        job.state = transition(job.state, JobState::Computing).unwrap_or_else(|e| fail(e));
        store::put(Table::Job, &num(job.id), &job);
        self.emit(
            AuditKind::KeyReleaseAuthorized,
            "key_release_authorized",
            job.id,
            json!({
                "job_id": job.id,
                "listing_id": job.listing_id,
                "room_key": room_key,
                "path_hash": path_hash,
                "value_class": listing.value_class,
                "platform_hash": to_hex(&self.room(&room_key).map(|r| r.ppid_hash).unwrap_or([0; 32])),
            }),
        );
    }

    /// The context key the buyer sealed to the room (§3.12.4), for the room to fetch.
    pub fn get_context_key(&self, job_id: U64) -> Option<Base64VecU8> {
        store::get::<Vec<u8>>(Table::ContextKey, &num(job_id.0)).map(Base64VecU8)
    }
}

impl Clearing {
    /// The snapshot a request names: the buyer's own, anchored at least `cooling_blocks` ago.
    fn snapshot_for(&self, id: u64, buyer: &AccountId, listing: &Listing) -> Snapshot {
        let snapshot: Snapshot =
            store::get(Table::Snapshot, &num(id)).unwrap_or_else(|| fail(CoreError::SnapshotOwner));
        if snapshot.owner != buyer.as_str() {
            fail(CoreError::SnapshotOwner)
        }
        let cooling = listing
            .eligibility
            .cooling_blocks
            .max(self.profile.cooling_blocks);
        if snapshot.anchor_height + cooling > env::block_height() {
            fail(CoreError::SnapshotTooNew)
        }
        snapshot
    }

    /// Assigns the job's rooms and moves it to `Assigned` (SDD §3.4, check 7).
    fn assign_rooms(&mut self, job_id: u64) {
        let mut job: Job = store::get(Table::Job, &num(job_id)).expect("the job was just stored");
        let room = self.pick_room();
        job.assigned = vec![room];
        // The caller has just put the job in `Requested` (at creation, or through `approve_parked`,
        // where the move out of `PendingApproval` is the one that is checked).
        job.state = JobState::Assigned;
        store::put(Table::Job, &num(job_id), &job);
        store::add_open_job(&room, job_id);
        self.emit(
            AuditKind::JobAssigned,
            "job_assigned",
            job_id,
            json!({
                "job_id": job_id,
                "kind": "Appraisal",
                "listing_id": job.listing_id,
                "room_key": to_hex(&room),
                "deadline_height": job.deadline_height,
            }),
        );
    }
}
