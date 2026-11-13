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
