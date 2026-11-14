//! Compliance credentials (SDD §3.20). A credential is ed25519-signed by an issuer key that
//! governance registered in clearing; the contract checks the signature and the bindings and never
//! learns who the subject is.
//!
//! M1 builds the nullifier credential only, which is what D4 needs: one verified identity gets one
//! appraisal per listing per epoch, across every account it controls (AC-14). Identity tiers,
//! anonymity sets and payout approvals are E16 and E18 (`tasks.md`, "What M1 cuts").

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::domain_bytes;
use crate::json::hex;
use crate::types::AccountId;

/// Domain of [`nullifier_signing_bytes`].
pub const NULLIFIER_SIGNING_DOMAIN: &[u8] = b"marginal/nullifier/v1";

/// One appraisal per identity per listing per epoch. The nullifier is
/// `HMAC(k_nf, identity_id ‖ listing_id ‖ epoch)`, computed by the compliance service: the identity
/// itself never reaches the chain, and only that service can map a nullifier back to it.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NullifierCredential {
    /// Always [`NullifierCredential::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    /// The account this credential was issued to: another account cannot present it.
    pub subject: AccountId,
    pub listing_id: u64,
    pub epoch: u32,
    #[serde(with = "hex")]
    pub nullifier: [u8; 32],
    /// Block height after which clearing refuses it.
    pub expiry_height: u64,
}

impl NullifierCredential {
    pub const DOMAIN: [u8; 16] = *b"marginal/nullif\0";
}

/// `"marginal/nullifier/v1" ‖ borsh(credential)`.
pub fn nullifier_signing_bytes(credential: &NullifierCredential) -> Vec<u8> {
    domain_bytes(NULLIFIER_SIGNING_DOMAIN, credential)
}

/// Domain of [`payout_approval_signing_bytes`].
pub const PAYOUT_APPROVAL_SIGNING_DOMAIN: &[u8] = b"marginal/payout-approval/v1";

/// The compliance service's answer about one payout route (SDD §3.9.4, §3.20, AC-47).
///
/// The route is screened when it is set and again at release, so the approval is bound to a route
/// hash and expires. `blocked` carries a sanctions match: the payout then goes to `Blocked` with
/// this `screening_id` as its reference, rather than being paid or silently dropped.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PayoutApproval {
    /// Always [`PayoutApproval::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    /// Who is being paid.
    pub subject: AccountId,
    /// `SHA-256(borsh(PayoutRoute))` of the route it screened.
    #[serde(with = "hex")]
    pub route_hash: [u8; 32],
    /// The sanctions list the decision was made against, and the screening it came from.
    #[serde(with = "hex")]
    pub list_version: [u8; 32],
    #[serde(with = "hex")]
    pub screening_id: [u8; 32],
    pub blocked: bool,
    pub expiry_height: u64,
}

impl PayoutApproval {
    pub const DOMAIN: [u8; 16] = *b"marginal/payout\0";
}

/// `"marginal/payout-approval/v1" ‖ borsh(approval)`.
pub fn payout_approval_signing_bytes(approval: &PayoutApproval) -> Vec<u8> {
    domain_bytes(PAYOUT_APPROVAL_SIGNING_DOMAIN, approval)
}
