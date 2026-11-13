//! On-chain data model (SDD §3.3). Everything here is Borsh-serialised.
//!
//! **Wire format rules**
//! - Enum variants are encoded by position. *Never reorder or remove a variant*; append only.
//!   `tests/roundtrip.rs` pins every discriminant.
//! - Amounts are `u128` in the settlement token's smallest unit. Scores are `u32` basis points.
//!   Heights are `u64` block heights. Hashes and keys are `[u8; 32]`.
//! - **Version byte.** Each record that is *stored* ([`Listing`], [`Snapshot`], [`Job`],
//!   [`SettlementRecord`]) begins with `v: u8`, checked by [`Record::decode`]. The types nested inside
//!   a record change only together with its version. Messages that are *signed or hashed* carry their
//!   version in their name and signing domain instead (`VerdictV1`, `"marginal/verdict/v1"`).
//! - Features that are not built yet (rules R2–R5, asset classes other than knowledge and dataset,
//!   and so on) exist as enum variants only, so adding them later is not a format change. The code
//!   that would act on them returns a `*Disabled` error.
//! - JSON: only the types that cross into TypeScript (through `marginal-core-wasm`) derive serde; see
//!   [`crate::json`]. Records such as [`Listing`] are Borsh only. `cargo near` generates a contract's
//!   ABI and needs JSON and Borsh *schemas* for every type in its interface, which these types do not
//!   have, so contract views define their own types (E4).
//! - AccountIds travel as plain strings. The encoding is identical to `near_sdk::AccountId`, and the
//!   contract validates ids at its boundary.

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::{from_bytes, to_bytes};
use crate::error::CoreError;
use crate::json::dec;

/// A NEAR account id. Same Borsh encoding as `near_sdk::AccountId`.
pub type AccountId = String;
/// A room's ed25519 public key.
pub type RoomKey = [u8; 32];

/// Stored or signed on its own: starts with a version byte (the first byte of its encoding).
pub trait Record: BorshSerialize + BorshDeserialize + Sized {
    /// The format version this build reads and writes.
    const VERSION: u8;

    fn encode(&self) -> Vec<u8> {
        to_bytes(self)
    }

    /// Strict: wrong version, truncated or trailing bytes are all errors.
    fn decode(bytes: &[u8]) -> Result<Self, CoreError> {
        match bytes.first() {
            None => Err(CoreError::Decode),
            Some(v) if *v != Self::VERSION => Err(CoreError::Version),
            Some(_) => from_bytes(bytes),
        }
    }
}

pub const LISTING_V: u8 = 1;
pub const SNAPSHOT_V: u8 = 1;
pub const JOB_V: u8 = 1;
pub const SETTLEMENT_V: u8 = 1;

// ---------------------------------------------------------------------------------------------
// Classifications

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssetClass {
    Knowledge,
    Dataset,
    EvalSet,
    Model,
    Exploit,
    Signal,
}

/// Thresholds are set by governance; k-of-n verdicts at `H` and above are v2.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum ValueClass {
    L,
    M,
    H,
    X,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyReleaseMode {
    Ckd,
    /// Fallback only: used when MPC CKD is unavailable.
    RoomSealed,
}

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum AttestationMode {
    OnChainDcap,
    AttesterQuorum,
    Simulated,
}

/// Whether the verdict's components are published (§3.17).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum VerdictPrivacy {
    Open,
    Sealed,
}

/// What the buyer sees. `Fields` carries field ids from the listing's [`OutputSchema`] (M2).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum DisplayMode {
    Blind,
    Fields(Vec<u8>),
}

/// Who may see Sealed-mode openings, and when (§3.17). Bound into the job commitment.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum DisclosurePolicy {
    /// Default: the dispute panel only.
    DisputeOnly,
    AuditorEscrow,
    DelayedAggregate,
    PublishWithBuyerConsent,
}

/// Identity tiers (SPEC §4.13.1). `Id0` is anonymous and cannot appraise.
#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier {
    Id0,
    Id1,
    Id2,
    Id3,
}

/// A category from the governance table (category-to-tier requirements live in clearing).
#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct CategoryId(pub u16);

// ---------------------------------------------------------------------------------------------
// Pricing and schema

/// What a room is for (SDD §3.11). Only `K` (knowledge, on CPU TEEs) exists in the demo.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum RoomClass {
    K,
    Kcpu,
    S,
    G,
    D,
}

/// Pricing rule. Only R1 (`Posted`) is built; the rest are format-only (§3.7).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum PricingRule {
    /// R1.
    Posted {
        #[serde(with = "dec")]
        ask: u128,
    },
    /// R2.
    ValueIndexed {
        #[serde(with = "dec")]
        p_min: u128,
        #[serde(with = "dec")]
        p_full: u128,
        price_quantum_bps: u32,
    },
    /// R3, legacy.
    SurplusSplitLegacy {
        #[serde(with = "dec")]
        ask: u128,
    },
    /// R4 (v2).
    SealedRound {
        k: u16,
        #[serde(with = "dec")]
        reserve: u128,
        close_height: u64,
    },
    /// R5 (v2).
    Tender { tender_id: u64 },
}

/// A formula compiled into this crate. The contract evaluates nothing else (§3.7).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum FormulaId {
    KnowledgeV1,
    DatasetLiteV0,
    /// The full dataset appraiser (v2).
    DatasetV1,
}

/// Parameters a formula reads besides the components.
#[derive(
    BorshSerialize,
    BorshDeserialize,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Default,
)]
pub struct FormulaParams {
    /// `DatasetLiteV0`: the accuracy gain, in bps, that earns the full ceiling.
    pub delta_star_bps: u32,
}

/// A finite-alphabet output field. No free text.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct FieldSpec {
    pub id: u8,
    pub name: String,
    pub alphabet: u16,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct OutputSchema {
    pub fields: Vec<FieldSpec>,
    /// Quantisation levels, one per component.
    pub component_alphabets: Vec<u16>,
    /// Levels of one judge's discrete answer (for example 11 for 0..=10).
    pub judge_scale: u16,
}

/// `{ id, version, formula_id }` of a registered appraiser.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AppraiserRef {
    pub id: String,
    pub version: u32,
    pub formula_id: FormulaId,
}

/// Leakage budget and its counters, all in millibits (§3.8).
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct LeakageAccount {
    pub budget_mbits: u64,
    pub reserved_mbits: u64,
    pub spent_mbits: u64,
    /// π: paid to the seller per bit debited.
    pub price_per_bit: u128,
    /// 0 means none.
    pub sub_budget_mbits_per_identity: u64,
    /// Share of the budget usable only by tier `Id2` and above.
    pub verified_reserve_bps: u32,
}

// ---------------------------------------------------------------------------------------------
// Listings and snapshots

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListingStatus {
    Draft,
    Provisioning,
    Screening,
    Held,
    Active,
    Paused,
    Exhausted,
    SoldOut,
    Closed,
    Archived,
}

/// A blob in the blob store, by content.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct BlobRef {
    pub uri_hash: [u8; 32],
    pub sha256: [u8; 32],
    /// Padded size bucket the object was uploaded in.
    pub size_class: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Eligibility {
    pub min_tier: Tier,
    pub min_anonymity_set: u32,
    pub nullifier_gated: bool,
    pub cooling_blocks: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum PayoutRoute {
    /// `token.ft_transfer`.
    NearAccount(AccountId),
    /// `token.ft_transfer_call("intents.near", ...)`.
    IntentsAccount(AccountId),
    /// Settlement stablecoin only; transaction built inside clearing (canary).
    ChainSig { chain: String, address: String },
    /// Demo: NEAR-side payout plus a live 1Click dry quote that is not stored.
    DryQuote {
        chain: String,
        asset: String,
        address: String,
    },
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum PayoutStatus {
    Held,
    Released,
    Pending,
    Completed,
    Claimable,
    /// A sanctions match; `screening_ref` names the screening that blocked it.
    Blocked {
        screening_ref: [u8; 32],
    },
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Listing {
    /// Format version of this record ([`LISTING_V`]).
    pub v: u8,
    pub id: u64,
    pub seller: AccountId,
    /// The listing's own version, bumped when the seller republishes. Not the format version.
    pub version: u32,
    pub status: ListingStatus,
    pub asset_class: AssetClass,
    pub category: CategoryId,
    pub licence_class: u16,
    /// SHA-256(salt || canonical_good).
    pub good_commitment: [u8; 32],
    pub ciphertext: BlobRef,
    pub key_mode: KeyReleaseMode,
    pub key_path_hash: [u8; 32],
    pub pk_l: Option<[u8; 32]>,
    pub appraiser: AppraiserRef,
    pub schema: OutputSchema,
    pub schema_hash: [u8; 32],
    pub rule: PricingRule,
    pub token: AccountId,
    pub max_copies: u16,
    pub copies: u16,
    pub l_floor_bps: u32,
    pub external_judges_allowed: bool,
    pub privacy_default: VerdictPrivacy,
    pub disclosure_policy: DisclosurePolicy,
    pub leakage: LeakageAccount,
    pub value_class: ValueClass,
    pub eligibility: Eligibility,
    pub challenge_window_blocks: u64,
    pub delivery_deadline_blocks: u64,
    pub publish_height: Option<u64>,
    pub payout: PayoutRoute,
    pub dossier_hash: Option<[u8; 32]>,
}

impl Record for Listing {
    const VERSION: u8 = LISTING_V;
}

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum ContextKind {
    Notes,
    DataIndex,
    EvalSet,
    Model,
    RestrictedList,
}

/// Buyer context, anchored before use.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Snapshot {
    /// Format version of this record ([`SNAPSHOT_V`]).
    pub v: u8,
    pub id: u64,
    pub owner: AccountId,
    pub kind: ContextKind,
    pub content_hash: [u8; 32],
    pub blob: BlobRef,
    pub anchor_height: u64,
    pub standing: bool,
}

impl Record for Snapshot {
    const VERSION: u8 = SNAPSHOT_V;
}

// ---------------------------------------------------------------------------------------------
// Jobs and settlement

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum JobKind {
    Appraisal,
    Screening,
    Provisioning,
    Redelivery,
    Dispute,
    /// Use-rights session (v2).
    Session,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum BuyerRef {
    Account(AccountId),
    Nullifier([u8; 32]),
}

/// A job's funds, in named buckets (§3.9.1). Moving value between buckets is the only way funds
/// move inside clearing.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default,
)]
pub struct Buckets {
    #[serde(with = "dec")]
    pub budget: u128,
    #[serde(with = "dec")]
    pub compute: u128,
    #[serde(with = "dec")]
    pub comp_reserved: u128,
    #[serde(with = "dec")]
    pub fee_reserved: u128,
    #[serde(with = "dec")]
    pub storage: u128,
    #[serde(with = "dec")]
    pub held: u128,
    #[serde(with = "dec")]
    pub refund: u128,
}

/// Where a refund goes.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum RefundRoute {
    /// Credit the buyer's balance inside clearing.
    Balance,
    NearAccount(AccountId),
    IntentsAccount(AccountId),
}

/// Job lifecycle states (§3.5). Every legal move is in `clearing::job::transition`.
#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum JobState {
    PendingApproval,
    Requested,
    Assigned,
    Computing,
    Verdicted,
    NoDeal,
    Restricted,
    InputRejected,
    Deal,
    Final,
    DeliveryFailure,
    Timeout,
    Revoked,
    /// k-of-n mismatch or an upheld challenge (v2).
    Fault,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Job {
    /// Format version of this record ([`JOB_V`]).
    pub v: u8,
    pub id: u64,
    pub kind: JobKind,
    pub listing_id: u64,
    pub listing_version: u32,
    pub snapshot_id: Option<u64>,
    pub buyer: Option<BuyerRef>,
    pub token: AccountId,
    pub buckets: Buckets,
    pub mode: DisplayMode,
    pub privacy: VerdictPrivacy,
    pub max_debit_mbits: u64,
    pub job_commitment: [u8; 32],
    pub delivery_pk: [u8; 32],
    pub compliance_pk: Option<[u8; 32]>,
    pub context_auth_pk: [u8; 32],
    pub refund_to: RefundRoute,
    pub assigned: Vec<RoomKey>,
    pub requested_height: u64,
    pub deadline_height: u64,
    pub delivery_deadline_height: Option<u64>,
    pub fast_yield: Option<[u8; 32]>,
    pub state: JobState,
    /// Set while an outgoing transfer promise is pending, so the job cannot settle twice.
    pub locked: bool,
}

impl Record for Job {
    const VERSION: u8 = JOB_V;
}

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum Outcome {
    Deal,
    NoDeal,
    Restricted,
    InputRejected,
    Timeout,
    Fault,
    Revoked,
    DeliveryFailure,
}

/// Fees assessed at settlement, by recipient.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Default)]
pub struct FeeSplit {
    /// Compute pass-through to the operator that ran the room.
    pub compute: u128,
    pub treasury: u128,
    pub operator_pool: u128,
    pub assurance_pool: u128,
}

/// `simulated_flags` bits: which parts of a record came from a simulated element (DRC-12).
pub const SIM_ATTESTATION: u8 = 1 << 0;
pub const SIM_JUDGE: u8 = 1 << 1;
pub const SIM_SETTLEMENT: u8 = 1 << 2;

/// What remains of a job after compaction.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct SettlementRecord {
    /// Format version of this record ([`SETTLEMENT_V`]).
    pub v: u8,
    pub job_id: u64,
    pub outcome: Outcome,
    pub privacy: VerdictPrivacy,
    /// Open mode only.
    pub value: Option<u128>,
    /// Sealed mode only.
    pub components_commitment: Option<[u8; 32]>,
    pub price: u128,
    pub fees: FeeSplit,
    pub refund: u128,
    pub leakage_debit_mbits: u64,
    pub leakage_comp: u128,
    pub held: u128,
    pub held_until: Option<u64>,
    pub delivery_commitment: Option<[u8; 32]>,
    pub delivery_receipt: Option<[u8; 32]>,
    pub cert_hashes: Vec<[u8; 32]>,
    /// `SIM_*` bits.
    pub simulated_flags: u8,
    pub audit_seq: u64,
    pub audit_head: [u8; 32],
    pub payout: PayoutStatus,
}

impl Record for SettlementRecord {
    const VERSION: u8 = SETTLEMENT_V;
}
