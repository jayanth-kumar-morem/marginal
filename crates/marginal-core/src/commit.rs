//! Commitments (SDD §3.12.3, §3.9): the job commitment that binds a key release to one job, and
//! the salted commitment that lets a buyer check a delivered good.

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::{domain_bytes, sha256};
use crate::json::{dec, hex, hex_opt, hex_vec};
use crate::types::{
    AccountId, DisclosurePolicy, DisplayMode, FormulaParams, JobKind, PricingRule, RoomKey,
    VerdictPrivacy,
};

/// Domain of [`job_commitment`].
pub const JOB_DOMAIN: &[u8] = b"marginal/job/v1";
/// Length of the salt in [`good_commitment`].
pub const SALT_LEN: usize = 32;

/// Everything about a job that a room must be able to trust, as clearing saw it at request time.
/// Its hash is what KeyPolicy and clearing agree on before a key is released (SDD §3.12.3).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct JobCore {
    pub chain_id: String,
    pub clearing: AccountId,
    pub job_id: u64,
    pub kind: JobKind,
    pub listing_id: u64,
    pub listing_version: u32,
    pub snapshot_id: Option<u64>,
    #[serde(with = "hex_opt")]
    pub snapshot_content_hash: Option<[u8; 32]>,
    #[serde(with = "dec")]
    pub budget: u128,
    pub rule: PricingRule,
    pub formula_params: FormulaParams,
    pub mode: DisplayMode,
    pub privacy: VerdictPrivacy,
    pub disclosure_policy: DisclosurePolicy,
    pub max_debit_mbits: u64,
    #[serde(with = "hex")]
    pub delivery_pk: [u8; 32],
    #[serde(with = "hex_opt")]
    pub compliance_pk: Option<[u8; 32]>,
    #[serde(with = "hex")]
    pub context_auth_pk: [u8; 32],
    #[serde(with = "hex_vec")]
    pub assigned_rooms: Vec<RoomKey>,
    pub deadline_height: u64,
}

/// `SHA-256("marginal/job/v1" ‖ borsh(core))`.
pub fn job_commitment(core: &JobCore) -> [u8; 32] {
    sha256(&[&domain_bytes(JOB_DOMAIN, core)])
}

/// `SHA-256(salt ‖ canonical_good)`. The salt is secret and random, so the commitment reveals
/// nothing about the good, and the buyer can check what it received against it. The same function
/// commits each input a forget certificate covers.
pub fn good_commitment(salt: &[u8; SALT_LEN], canonical_good: &[u8]) -> [u8; 32] {
    sha256(&[salt, canonical_good])
}
