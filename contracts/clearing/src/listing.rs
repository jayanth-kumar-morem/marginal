//! Listings, from `create_listing` to `Active` (SDD §3.4, §3.5: the listing lifecycle).
//!
//! `Draft → Provisioning → Draft → Screening → Active | Held`. The two room-facing steps
//! (`submit_provisioning`, `submit_screening`) are sent by a relayer account, so the room's ed25519
//! signature over its report is the only authority (SDD §3.4); the signature covers the key stored
//! and the result applied, not just the certificate (`marginal_core::reports`).

use marginal_core::audit::AuditKind;
use marginal_core::commit::{job_commitment, JobCore};
use marginal_core::json::to_hex;
use marginal_core::keyrelease::{listing_path, path_hash};
use marginal_core::listing::{validate_spec, ListingSpec, PublishSpec};
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningResult,
    ScreeningV1,
};
use marginal_core::{
    Buckets, CoreError, DisplayMode, FormulaParams, Job, JobKind, JobState, KeyReleaseMode,
    Listing, ListingStatus, RoomClass, JOB_V, LISTING_V,
};
use near_sdk::borsh::from_slice;
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::json;
use near_sdk::{env, near, require};

use crate::fees::{charge, LISTING_FEE, PUBLISH_FEE};
use crate::store::{self, num, Table, MAX_OPEN_JOBS};
use crate::{fail, Clearing, ClearingExt};

/// The classes of room that may run a listing's jobs. M1 has knowledge and dataset listings, both
/// served by a knowledge room: `K` is the GPU-backed one, `Kcpu` the CPU-only room the demo runs
/// (SDD §1.5). A room of either class can do the work.
const KNOWLEDGE_ROOMS: [RoomClass; 2] = [RoomClass::K, RoomClass::Kcpu];

#[near]
impl Clearing {
    /// Creates a listing in `Draft` (SDD §3.4, AC-11, AC-45). `spec` is Borsh of a core
    /// `ListingSpec`.
    ///
    /// The checks that depend only on the spec are core's, so the seller's tooling makes exactly the
    /// same ones. The rest are state: the appraiser version must be registered and enabled, the
    /// token allow-listed, and the asset class and rule enabled by the deployment profile.
    #[payable]
    pub fn create_listing(&mut self, spec: Base64VecU8) -> U64 {
        charge(LISTING_FEE);
        let spec: ListingSpec = from_slice(&spec.0).unwrap_or_else(|_| fail(CoreError::Decode));
        validate_spec(&spec).unwrap_or_else(|e| fail(e));
        self.require_enabled(&spec);

        let seller = env::predecessor_account_id();
        let id = self.next_listing_id;
        self.next_listing_id += 1;
        let path = listing_path(&seller.to_string(), id, 1);
        let listing = Listing {
            v: LISTING_V,
            id,
            seller: seller.to_string(),
            version: 1,
            status: ListingStatus::Draft,
            asset_class: spec.asset_class,
            category: spec.category,
            licence_class: spec.licence_class,
            good_commitment: [0; 32],
            ciphertext: marginal_core::BlobRef {
                uri_hash: [0; 32],
                sha256: [0; 32],
                size_class: 0,
            },
            key_mode: spec.key_mode,
            key_path_hash: path_hash(&path),
            pk_l: None,
            appraiser: spec.appraiser.clone(),
            schema: spec.schema.clone(),
            schema_hash: marginal_core::codec::hash_of(&spec.schema),
            rule: spec.rule.clone(),
            token: spec.token.clone(),
            max_copies: spec.max_copies,
            copies: 0,
            l_floor_bps: spec.l_floor_bps,
            external_judges_allowed: spec.external_judges_allowed,
            privacy_default: spec.privacy_default,
            disclosure_policy: spec.disclosure_policy,
            leakage: spec.leakage.clone(),
            value_class: spec.value_class,
            eligibility: spec.eligibility.clone(),
            challenge_window_blocks: spec.challenge_window_blocks,
            delivery_deadline_blocks: spec.delivery_deadline_blocks,
            publish_height: None,
            payout: marginal_core::PayoutRoute::NearAccount(seller.to_string()),
            dossier_hash: spec.dossier_hash,
        };
        store::put(Table::Listing, &num(id), &listing);
        self.emit(
            AuditKind::ListingCreated,
            "listing_created",
            id,
            json!({
                "listing_id": id,
                "seller": seller,
                "version": 1,
                "asset_class": format!("{:?}", spec.asset_class),
                "appraiser": format!("{}@{}", spec.appraiser.id, spec.appraiser.version),
                "key_path_hash": to_hex(&listing.key_path_hash),
                "schema_hash": to_hex(&listing.schema_hash),
                "policy_version": self.policy_version,
            }),
        );
        U64(id)
    }

    /// Asks a room to derive the listing key (SDD §3.4). Ckd listings only: under the RoomSealed
    /// fallback the good is sealed to the room's own key and there is nothing to provision.
    pub fn begin_provisioning(&mut self, listing_id: U64) -> U64 {
        let mut listing = self.listing(listing_id.0);
        self.require_seller(&listing);
        if listing.key_mode != KeyReleaseMode::Ckd {
            fail(CoreError::RuleDisabled)
        }
        if listing.status != ListingStatus::Draft {
            fail(CoreError::ListingNotActive)
        }
        let (job_id, room) = self.open_job(&listing, JobKind::Provisioning);
        listing.status = ListingStatus::Provisioning;
        store::put(Table::Listing, &num(listing.id), &listing);
        self.emit(
            AuditKind::JobAssigned,
            "job_assigned",
            job_id,
            json!({
                "job_id": job_id,
                "kind": "Provisioning",
                "listing_id": listing.id,
                "room_key": to_hex(&room),
            }),
        );
        U64(job_id)
    }

    /// The room reports the listing key it derived. `report` is Borsh of a core `ProvisioningV1`
    /// and `sig` the room's ed25519 signature over its signing bytes.
    pub fn submit_provisioning(&mut self, report: Base64VecU8, sig: Base64VecU8) {
        let report: ProvisioningV1 =
            from_slice(&report.0).unwrap_or_else(|_| fail(CoreError::Decode));
        let job = self.check_report_binding(
            &report.chain_id,
            &report.clearing,
            report.job_id,
            report.listing_id,
            report.listing_version,
        );
        self.verify_room_signature(
            &provisioning_signing_bytes(&report),
            &sig,
            &report.room_key,
            &job,
            JobKind::Provisioning,
        );

        // The job is `Assigned` only while its listing is `Provisioning` (`begin_provisioning`
        // sets both, `finish_job` clears both), so the job-state check above is the status check.
        let mut listing = self.listing(report.listing_id);
        listing.pk_l = Some(report.pk_l);
        listing.status = ListingStatus::Draft;
        store::put(Table::Listing, &num(listing.id), &listing);
        self.finish_job(report.job_id, &report.room_key);
        self.emit(
            AuditKind::ListingProvisioned,
            "listing_provisioned",
            listing.id,
            json!({
                "listing_id": listing.id,
                "job_id": report.job_id,
                "room_key": to_hex(&report.room_key),
                "pk_l": to_hex(&report.pk_l),
                "cert_hash": to_hex(&report.cert_hash),
            }),
        );
    }

    /// Publishes a provisioned listing and opens its screening job (SDD §3.4, AC-46). `publish` is
    /// Borsh of a core `PublishSpec`.
    ///
    /// There is no cross-contract pin check: KeyPolicy denies every release for a listing with no
    /// pins, and the SDK writes pins before publishing (`tasks.md` E4.5).
    #[payable]
    pub fn publish_listing(&mut self, listing_id: U64, publish: Base64VecU8) -> U64 {
        charge(PUBLISH_FEE);
        let publish: PublishSpec =
            from_slice(&publish.0).unwrap_or_else(|_| fail(CoreError::Decode));
        let mut listing = self.listing(listing_id.0);
        self.require_seller(&listing);
        if listing.status != ListingStatus::Draft {
            fail(CoreError::ListingNotActive)
        }
        if listing.key_mode == KeyReleaseMode::Ckd && listing.pk_l.is_none() {
            fail(CoreError::NotPinned)
        }
        listing.good_commitment = publish.good_commitment;
        listing.ciphertext = publish.ciphertext.clone();
        listing.payout = publish.payout.clone();
        listing.status = ListingStatus::Screening;
        let (job_id, room) = self.open_job(&listing, JobKind::Screening);
        store::put(Table::Listing, &num(listing.id), &listing);
        self.emit(
            AuditKind::ListingPublished,
            "listing_published",
            listing.id,
            json!({
                "listing_id": listing.id,
                "job_id": job_id,
                "good_commitment": to_hex(&publish.good_commitment),
                "ciphertext_sha256": to_hex(&publish.ciphertext.sha256),
                "room_key": to_hex(&room),
            }),
        );
        U64(job_id)
    }

    /// The screening room reports what it found (SDD §3.4, AC-46, AC-49): `Pass` makes the listing
    /// `Active` and records `publish_height`; `Flag` holds it for a consented review.
    pub fn submit_screening(&mut self, report: Base64VecU8, sig: Base64VecU8) {
        let report: ScreeningV1 = from_slice(&report.0).unwrap_or_else(|_| fail(CoreError::Decode));
        let job = self.check_report_binding(
            &report.chain_id,
            &report.clearing,
            report.job_id,
            report.listing_id,
            report.listing_version,
        );
        self.verify_room_signature(
            &screening_signing_bytes(&report),
            &sig,
            &report.room_key,
            &job,
            JobKind::Screening,
        );

        // As in `submit_provisioning`, the job state is the status check: a screening job is
        // `Assigned` only while its listing is `Screening`.
        let mut listing = self.listing(report.listing_id);
        let passed = report.result == ScreeningResult::Pass;
        if passed {
            listing.status = ListingStatus::Active;
            listing.publish_height = Some(env::block_height());
        } else {
            listing.status = ListingStatus::Held;
        }
        store::put(Table::Listing, &num(listing.id), &listing);
        self.finish_job(report.job_id, &report.room_key);
        self.emit(
            AuditKind::ScreeningResult,
            "screening_result",
            listing.id,
            json!({
                "listing_id": listing.id,
                "job_id": report.job_id,
                "room_key": to_hex(&report.room_key),
                "result": report.result,
                "status": format!("{:?}", listing.status),
                "publish_height": listing.publish_height,
                "cert_hash": to_hex(&report.cert_hash),
            }),
        );
    }
}

impl Clearing {
    pub(crate) fn listing(&self, id: u64) -> Listing {
        store::get(Table::Listing, &num(id)).unwrap_or_else(|| fail(CoreError::ListingNotActive))
    }

    fn require_seller(&self, listing: &Listing) {
        require!(
            env::predecessor_account_id().as_str() == listing.seller,
            "only the seller"
        );
    }

    /// The deployment profile decides which rules and asset classes exist (SDD §6.2), and the token
    /// must be one clearing can settle in.
    fn require_enabled(&self, spec: &ListingSpec) {
        let asset_class = format!("{:?}", spec.asset_class);
        if !self.profile.asset_classes_enabled.contains(&asset_class) {
            fail(CoreError::RuleDisabled)
        }
        // Only R1 is built, and `validate_spec` has already refused every other rule.
        if !self.profile.rules_enabled.iter().any(|r| r == "R1") {
            fail(CoreError::RuleDisabled)
        }
        if !self.tokens.iter().any(|t| t.as_str() == spec.token) {
            fail(CoreError::RuleParams)
        }
        if self
            .appraiser(&spec.appraiser.id, spec.appraiser.version)
            .is_none_or(|entry| entry.formula != spec.appraiser.formula_id)
        {
            fail(CoreError::FormulaDisabled)
        }
    }

    /// A report must name this chain, this contract and the job's own listing version, so a
    /// signature made elsewhere cannot be replayed here.
    fn check_report_binding(
        &self,
        chain_id: &str,
        clearing: &str,
        job_id: u64,
        listing_id: u64,
        listing_version: u32,
    ) -> Job {
        if chain_id != self.chain_id || clearing != env::current_account_id().as_str() {
            fail(CoreError::Binding)
        }
        let job: Job =
            store::get(Table::Job, &num(job_id)).unwrap_or_else(|| fail(CoreError::Ticket));
        if job.listing_id != listing_id || job.listing_version != listing_version {
            fail(CoreError::Binding)
        }
        job
    }

    /// The job must be open, of this kind, and assigned to the room that signed.
    fn verify_room_signature(
        &self,
        message: &[u8],
        sig: &Base64VecU8,
        room_key: &[u8; 32],
        job: &Job,
        kind: JobKind,
    ) {
        if job.kind != kind || job.state != JobState::Assigned {
            fail(CoreError::Ticket)
        }
        if !job.assigned.contains(room_key) {
            fail(CoreError::RoomNotAssigned)
        }
        if !self.current(room_key) {
            fail(CoreError::RoomRevoked)
        }
        let signature: [u8; 64] = sig
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| fail(CoreError::BadSignature));
        if !env::ed25519_verify(&signature, message, room_key) {
            fail(CoreError::BadSignature)
        }
    }

    /// Opens a job for a listing and assigns one room at random from the eligible pool
    /// (SDD §3.4, check 7). `n = 1` below value class H in v1.
    fn open_job(&mut self, listing: &Listing, kind: JobKind) -> (u64, [u8; 32]) {
        let room = self.pick_room();
        let id = self.next_job_id;
        self.next_job_id += 1;
        let core = JobCore {
            chain_id: self.chain_id.clone(),
            clearing: env::current_account_id().to_string(),
            job_id: id,
            kind,
            listing_id: listing.id,
            listing_version: listing.version,
            snapshot_id: None,
            snapshot_content_hash: None,
            budget: 0,
            rule: listing.rule.clone(),
            formula_params: FormulaParams::default(),
            mode: DisplayMode::Blind,
            privacy: listing.privacy_default,
            disclosure_policy: listing.disclosure_policy,
            max_debit_mbits: 0,
            delivery_pk: [0; 32],
            compliance_pk: None,
            context_auth_pk: [0; 32],
            assigned_rooms: vec![room],
            deadline_height: env::block_height() + listing.delivery_deadline_blocks,
        };
        let job = Job {
            v: JOB_V,
            id,
            kind,
            listing_id: listing.id,
            listing_version: listing.version,
            snapshot_id: None,
            buyer: None,
            token: listing.token.clone(),
            buckets: Buckets {
                budget: 0,
                compute: 0,
                comp_reserved: 0,
                fee_reserved: 0,
                storage: 0,
                held: 0,
                refund: 0,
            },
            mode: DisplayMode::Blind,
            privacy: listing.privacy_default,
            max_debit_mbits: 0,
            job_commitment: job_commitment(&core),
            delivery_pk: [0; 32],
            compliance_pk: None,
            context_auth_pk: [0; 32],
            refund_to: marginal_core::RefundRoute::Balance,
            assigned: vec![room],
            requested_height: env::block_height(),
            deadline_height: core.deadline_height,
            delivery_deadline_height: None,
            fast_yield: None,
            state: JobState::Assigned,
            locked: false,
        };
        store::put(Table::Job, &num(id), &job);
        store::add_open_job(&room, id);
        (id, room)
    }

    /// One room, uniformly at random from the rooms that can take another job.
    fn pick_room(&self) -> [u8; 32] {
        let free: Vec<[u8; 32]> = KNOWLEDGE_ROOMS
            .iter()
            .flat_map(|class| self.pool(*class))
            .filter(|key| self.current(key) && store::open_jobs(key).len() < MAX_OPEN_JOBS)
            .collect();
        if free.is_empty() {
            fail(CoreError::NoEligibleRoom)
        }
        let seed = env::random_seed_array();
        let pick = u64::from_le_bytes(seed[..8].try_into().expect("8 bytes"));
        free[(pick % free.len() as u64) as usize]
    }

    /// The job is done: it leaves the room's queue and is recorded as verdicted.
    fn finish_job(&mut self, job_id: u64, room_key: &[u8; 32]) {
        let mut job: Job =
            store::get(Table::Job, &num(job_id)).expect("the signature check read this job");
        job.state = JobState::Verdicted;
        store::put(Table::Job, &num(job_id), &job);
        store::close_job(room_key, job_id);
    }
}
