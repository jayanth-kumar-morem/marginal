//! The forget certificate a room signs at the end of every job (SDD §3.18). It says what the room
//! held, under which attested identity, and what it destroyed. It does not claim unlearning (AC-29).

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::{domain_bytes, hash_of, sha256};
use crate::json::{hex, hex_opt, hex_vec};
use crate::types::{AccountId, AttestationMode, JobKind, Outcome};

/// Domain the room's ed25519 signature is made over: `"marginal/forget/v1" ‖ borsh(certificate)`.
pub const FORGET_SIGNING_DOMAIN: &[u8] = b"marginal/forget/v1";

/// `non_persistence_basis` bits (SDD §3.14.2): why the room's memory of the job is gone.
pub const NP_PROCESS_EXIT: u8 = 1 << 0;
pub const NP_NO_PERSISTENT_STORAGE: u8 = 1 << 1;
pub const NP_NO_SWAP: u8 = 1 << 2;
pub const NP_TEE_MEMORY: u8 = 1 << 3;

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq,
)]
pub enum Scope {
    BuyerContext,
    GoodPlaintext,
    /// Use-rights session (v2).
    Session,
}

/// A room's identity: the measurements its attestation quote must show (SDD §3.11).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Measurement {
    #[serde(with = "hex")]
    pub mrtd: [u8; 48],
    #[serde(with = "hex")]
    pub rtmr0: [u8; 48],
    #[serde(with = "hex")]
    pub rtmr1: [u8; 48],
    #[serde(with = "hex")]
    pub rtmr2: [u8; 48],
    /// dstack app compose hash: all image digests, replayed from the RTMR3 event log.
    #[serde(with = "hex")]
    pub compose_hash: [u8; 32],
    #[serde(with = "hex")]
    pub key_provider_digest: [u8; 48],
    /// GPU rooms only (v2).
    #[serde(with = "hex_opt")]
    pub gpu_policy_hash: Option<[u8; 32]>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ForgetCertificateV1 {
    /// Always [`ForgetCertificateV1::DOMAIN`].
    #[serde(with = "hex")]
    pub domain: [u8; 16],
    pub chain_id: String,
    pub clearing: AccountId,
    pub keypolicy: AccountId,
    pub job_id: u64,
    #[serde(with = "hex")]
    pub job_commitment: [u8; 32],
    pub listing_id: u64,
    pub listing_version: u32,
    pub kind: JobKind,
    pub scope: Vec<Scope>,
    /// Salted commitments of each input the certificate covers.
    #[serde(with = "hex_vec")]
    pub input_commitments: Vec<[u8; 32]>,
    #[serde(with = "hex")]
    pub room_key: [u8; 32],
    pub measurement: Measurement,
    #[serde(with = "hex")]
    pub ppid_hash: [u8; 32],
    /// Quote hash ‖ collateral hash, from the KeyPolicy attestation record.
    #[serde(with = "hex")]
    pub attestation_ref: [u8; 32],
    pub attestation_mode: AttestationMode,
    pub policy_version: u64,
    /// Hashes of the public parts, or ids, of the keys destroyed.
    #[serde(with = "hex_vec")]
    pub key_ids_destroyed: Vec<[u8; 32]>,
    /// Hashes of every object the room emitted: verdict, delivery, certificate, job log.
    #[serde(with = "hex_vec")]
    pub egress_summary: Vec<[u8; 32]>,
    pub t_start: u64,
    pub t_end: u64,
    pub outcome: Outcome,
    /// `NP_*` bits.
    pub non_persistence_basis: u8,
}

impl ForgetCertificateV1 {
    pub const DOMAIN: [u8; 16] = *b"marginal/forget\0";
}

/// The bytes the room signs and verifiers check.
pub fn forget_signing_bytes(certificate: &ForgetCertificateV1) -> Vec<u8> {
    domain_bytes(FORGET_SIGNING_DOMAIN, certificate)
}

/// Domain of [`measurement_hash`].
pub const MEASUREMENT_DOMAIN: &[u8] = b"marginal/measurement/v1";

/// The hash a seller pins: `SHA-256("marginal/measurement/v1" ‖ borsh(measurement))`.
pub fn measurement_hash(measurement: &Measurement) -> [u8; 32] {
    sha256(&[&domain_bytes(MEASUREMENT_DOMAIN, measurement)])
}

/// `SHA-256(borsh(certificate))`: the blob key (`certs/{hash}`), and the hash anchored on chain.
pub fn certificate_hash(certificate: &ForgetCertificateV1) -> [u8; 32] {
    hash_of(certificate)
}
