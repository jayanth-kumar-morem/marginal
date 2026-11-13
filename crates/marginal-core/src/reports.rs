//! What a room signs about a listing: the provisioning key it derived, and the screening result
//! (SDD §3.4, the `submit_provisioning` and `submit_screening` rows).
//!
//! A relayer account sends these calls, so the room's ed25519 signature is the only authority
//! (SDD §3.4). The signature therefore has to cover everything clearing acts on — the key it stores
//! and the result it applies — not just the certificate that accompanies it. The SDD gives these
//! two calls a `sig` without saying what it signs; these are those bytes (`tasks.md` SDD issue 24).

use alloc::string::String;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::domain_bytes;
use crate::json::hex;
use crate::types::{AccountId, RoomKey};
use alloc::vec::Vec;

/// Domain of [`provisioning_signing_bytes`].
pub const PROVISIONING_SIGNING_DOMAIN: &[u8] = b"marginal/provisioning/v1";
/// Domain of [`screening_signing_bytes`].
pub const SCREENING_SIGNING_DOMAIN: &[u8] = b"marginal/screening/v1";

/// The only screening rule M1 runs: material non-public information (SDD §3.15, D8).
pub const FLAG_MNPI: u16 = 1;

/// What a provisioning room reports: the listing public key it derived from `K_L` (SDD §3.12.1).
///
/// `chain_id` and `clearing` bind the report to one chain and one contract, so a signature made on
/// testnet cannot be replayed on mainnet. `job_id` binds it to the one provisioning job that asked
/// for it, and `cert_hash` to the forget certificate covering `K_L` in room memory (§3.18).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProvisioningV1 {
    /// Always [`ProvisioningV1::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    pub job_id: u64,
    pub listing_id: u64,
    pub listing_version: u32,
    #[serde(with = "hex")]
    pub room_key: RoomKey,
    /// The listing key: `DEK_g` is sealed to this (SDD §3.12.1).
    #[serde(with = "hex")]
    pub pk_l: [u8; 32],
    #[serde(with = "hex")]
    pub cert_hash: [u8; 32],
}

impl ProvisioningV1 {
    pub const DOMAIN: [u8; 16] = *b"marginal/provis\0";
}

/// `"marginal/provisioning/v1" ‖ borsh(report)`.
pub fn provisioning_signing_bytes(report: &ProvisioningV1) -> Vec<u8> {
    domain_bytes(PROVISIONING_SIGNING_DOMAIN, report)
}

/// The outcome of a screening job (SDD §3.4). `Flag` carries the rule that fired; M1 has one
/// ([`FLAG_MNPI`]), and the listing goes to `Held` for a consented review either way.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum ScreeningResult {
    Pass,
    Flag { reason: u16 },
}

/// What a screening room reports about a listing's plaintext, bound like [`ProvisioningV1`].
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScreeningV1 {
    /// Always [`ScreeningV1::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    pub job_id: u64,
    pub listing_id: u64,
    pub listing_version: u32,
    #[serde(with = "hex")]
    pub room_key: RoomKey,
    pub result: ScreeningResult,
    #[serde(with = "hex")]
    pub cert_hash: [u8; 32],
}

impl ScreeningV1 {
    pub const DOMAIN: [u8; 16] = *b"marginal/screen\0";
}

/// `"marginal/screening/v1" ‖ borsh(report)`.
pub fn screening_signing_bytes(report: &ScreeningV1) -> Vec<u8> {
    domain_bytes(SCREENING_SIGNING_DOMAIN, report)
}
