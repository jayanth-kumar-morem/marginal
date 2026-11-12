//! The verdict a room signs (SDD §3.17). Clearing checks the signature and the bindings, recomputes
//! the price from the components (Open mode) or verifies a proof (Sealed mode), and settles.

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::domain_bytes;
use crate::json::{dec, hex, hex_opt};
use crate::types::{AccountId, AppraiserRef, Outcome, VerdictPrivacy};

/// Domain the room's ed25519 signature is made over: `"marginal/verdict/v1" ‖ borsh(verdict)`.
pub const VERDICT_SIGNING_DOMAIN: &[u8] = b"marginal/verdict/v1";

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum VerdictStatus {
    Ok,
    Restricted,
    InputRejected,
    SchemaFailure,
    InputError,
}

/// A field the buyer asked to see: its id in the schema, and the alphabet index of its value.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ShownField {
    pub id: u8,
    pub index: u16,
}

/// How a judge's model identity is established.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ModelProof {
    /// Self-hosted: the weights hash is part of the room's measurement.
    WeightsInMeasurement {
        #[serde(with = "hex")]
        model_hash: [u8; 32],
    },
    /// A signed receipt from NEAR AI Cloud's private TEE (SDD §3.16).
    NearAiReceipt {
        text: String,
        #[serde(with = "hex")]
        sig65: [u8; 65],
        response_body: String,
    },
    /// Local, sandbox, or a deployment without an API key. Flagged on-chain.
    Simulated { signer: String },
}

/// One judge's answer. `factor_bps` is 0 when the answer did not parse, which resolves to the floor.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct JudgeFactor {
    pub model_id: String,
    pub factor_bps: u32,
    pub proof: ModelProof,
}

/// Published in Open mode: everything the price is computed from.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct OpenBody {
    pub components: Vec<u32>,
    pub factors: Vec<JudgeFactor>,
    pub shown: Vec<ShownField>,
}

/// Published in Sealed mode: a commitment to the scores, and a proof that the price follows from them.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SealedBody {
    #[serde(with = "hex")]
    pub commitment: [u8; 32],
    pub shown: Vec<ShownField>,
    pub outcome: Outcome,
    #[serde(with = "dec")]
    pub price: u128,
    #[serde(with = "hex")]
    pub proof: Vec<u8>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct VerdictV1 {
    /// Always [`VerdictV1::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    pub job_id: u64,
    #[serde(with = "hex")]
    pub job_commitment: [u8; 32],
    pub listing_id: u64,
    pub listing_version: u32,
    pub appraiser: AppraiserRef,
    pub status: VerdictStatus,
    pub privacy: VerdictPrivacy,
    pub open: Option<OpenBody>,
    pub sealed: Option<SealedBody>,
    #[serde(with = "hex_opt")]
    pub delivery_commitment: Option<[u8; 32]>,
    #[serde(with = "hex")]
    pub cert_hash: [u8; 32],
    #[serde(with = "hex")]
    pub room_key: [u8; 32],
    #[serde(with = "hex")]
    pub nonce: [u8; 16],
    /// Block heights.
    pub t_start: u64,
    pub t_end: u64,
}

impl VerdictV1 {
    pub const DOMAIN: [u8; 16] = *b"marginal/verdict";
}

/// The bytes the room signs and clearing verifies.
pub fn verdict_signing_bytes(verdict: &VerdictV1) -> Vec<u8> {
    domain_bytes(VERDICT_SIGNING_DOMAIN, verdict)
}
