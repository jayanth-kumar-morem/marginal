//! Clearing: listings, jobs, escrow, pricing, leakage, and the room-policy registry (SDD §3.4,
//! §3.10, §3.11). E4 builds the parts a listing needs: governance policy, the audit chain, the
//! registry, listings from `create_listing` to `Active`, and snapshots. E5 and E6 add jobs, funding
//! and settlement.
//!
//! **Interface shape.** Arguments that carry `marginal-core`'s types travel as Borsh bytes
//! (`Base64VecU8`) and views return JSON built here, because `cargo near`'s ABI step needs a JSON
//! and Borsh schema for every type in the interface and core's types have none (SDD §3.3). The one
//! encoding of a record is therefore core's, and every client builds it through `@marginal/core-wasm`.
use marginal_core::audit::AUDIT_GENESIS;
use marginal_core::CoreError;
use near_sdk::{env, near, require, AccountId, PanicOnDefault};

mod agent;
mod escrow;
mod events;
mod fees;
mod gov;
mod identity;
mod job;
mod leakage;
mod listing;
pub mod registry;
mod snapshot;
mod store;
mod views;

#[cfg(test)]
mod tests;

pub use fees::{LISTING_FEE, PLATFORM_FEE, PUBLISH_FEE, ROOM_FEE, SET_FEE, SNAPSHOT_FEE};
pub use gov::{AppraiserEntry, FeeTable};
pub use registry::MeasurementSet;

pub const CLEARING_VERSION: u8 = 1;

/// Refuses the call with a stable error code (SDD §4.1). Returns `!`, so it reads as the end of a
/// branch and the compiler keeps the arms honest.
pub(crate) fn fail(error: CoreError) -> ! {
    env::panic_str(error.code())
}

/// Block time in whole seconds.
pub(crate) fn now_secs() -> u64 {
    env::block_timestamp_ms() / 1_000
}

/// Profile values from `deploy/profiles/<profile>.toml` that change contract behaviour.
///
/// `rules_enabled` and `asset_classes_enabled` are plain strings here (`"R1"`, `"Knowledge"`): they
/// are the deploy profile's own names, checked against core's enums when a listing is created.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct ProfileConfig {
    pub profile: String,
    /// `gov.profile = demo` in HDP: `gov` is a dev account, not a DAO.
    pub gov_profile: String,
    pub cooling_blocks: u64,
    /// Challenge window W, in seconds.
    pub challenge_window_secs: u64,
    pub rules_enabled: Vec<String>,
    pub asset_classes_enabled: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Clearing {
    pub(crate) gov: AccountId,
    /// The only account `admit_room` accepts (SDD §3.11). KeyPolicy is immutable, so this is fixed.
    pub(crate) keypolicy: AccountId,
    pub(crate) chain_id: String,
    pub(crate) tokens: Vec<AccountId>,
    pub(crate) profile: ProfileConfig,
    pub(crate) fees: FeeTable,
    /// Issuer of identity credentials (E5 checks them).
    pub(crate) issuer_key: Option<[u8; 32]>,
    /// The compliance reviewer's key (E4.5 `resolve_held` is E16; stored for E5 and E6).
    pub(crate) compliance_key: Option<[u8; 32]>,
    /// Bumped by every governance change, and copied into each listing so a record says which policy
    /// produced it (SDD §3.4: changes apply to new listings and jobs only).
    pub(crate) policy_version: u64,
    pub(crate) next_listing_id: u64,
    pub(crate) next_job_id: u64,
    pub(crate) next_snapshot_id: u64,
    pub(crate) audit_seq: u64,
    pub(crate) audit_head: [u8; 32],
}

#[near]
impl Clearing {
    /// Every argument is fixed at deploy time except the governance policy, which `gov` sets after.
    #[init]
    pub fn new(
        gov: AccountId,
        keypolicy: AccountId,
        chain_id: String,
        tokens: Vec<AccountId>,
        profile: ProfileConfig,
    ) -> Self {
        require!(!tokens.is_empty(), "no settlement token");
        require!(!chain_id.is_empty(), "no chain id");
        require!(!profile.rules_enabled.is_empty(), "no rule enabled");
        require!(
            !profile.asset_classes_enabled.is_empty(),
            "no asset class enabled"
        );
        require!(
            profile.challenge_window_secs > 0,
            "challenge window must be positive"
        );
        Self {
            gov,
            keypolicy,
            chain_id,
            tokens,
            profile,
            fees: FeeTable::default(),
            issuer_key: None,
            compliance_key: None,
            policy_version: 0,
            next_listing_id: 1,
            next_job_id: 1,
            next_snapshot_id: 1,
            audit_seq: 0,
            audit_head: AUDIT_GENESIS,
        }
    }
}
