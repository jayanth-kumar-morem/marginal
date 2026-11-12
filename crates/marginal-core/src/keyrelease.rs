//! Key release (SDD §3.12): the request a room signs to get a key, the canonical key paths, and the
//! pins a seller sets. KeyPolicy verifies these on chain; the room builds the same bytes through
//! `@marginal/core-wasm`, and the vectors keep the two in step.

use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::{domain_bytes, sha256};
use crate::error::CoreError;
use crate::json::{hex, hex_vec, to_hex};
use crate::types::{AccountId, ValueClass};

/// Domain the room's ed25519 signature on a [`KeyRequest`] is made over.
pub const KEY_REQUEST_DOMAIN: &[u8] = b"marginal/keyreq/v1";
/// Domain of [`listing_key_id`].
pub const LISTING_KEY_DOMAIN: &[u8] = b"marginal/listing-key/v1";
/// Domain of [`path_hash`].
pub const PATH_DOMAIN: &[u8] = b"marginal/path/v1";
/// Most measurements a seller can pin: it bounds the storage and gas of a pin set.
pub const MAX_PINS: usize = 16;
/// Longest key path KeyPolicy accepts: `listing/` + 64 hex + `/v` + up to 10 digits = 84.
pub const MAX_PATH_LEN: usize = 96;

/// The app key `A = (a·G1, a·G2)` a room makes for one job: compressed BLS12-381 points. The MPC
/// network encrypts the derived key to it, so only the room can read the answer.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AppKey {
    #[serde(with = "hex")]
    pub pk1: [u8; 48],
    #[serde(with = "hex")]
    pub pk2: [u8; 96],
}

/// What a room signs to ask KeyPolicy for a key (SDD §3.12.3 step 2). It names the chain and the
/// KeyPolicy it is for, so a signature cannot be replayed against another deployment.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct KeyRequest {
    pub chain_id: String,
    pub keypolicy: AccountId,
    #[serde(with = "hex")]
    pub room_key: [u8; 32],
    pub job_id: u64,
    pub path: String,
    pub app_key: AppKey,
    #[serde(with = "hex")]
    pub job_commitment: [u8; 32],
    pub value_class: ValueClass,
}

/// The bytes the room signs with its ed25519 `sign_sk`: `"marginal/keyreq/v1" ‖ borsh(request)`.
pub fn key_request_signing_bytes(request: &KeyRequest) -> Vec<u8> {
    domain_bytes(KEY_REQUEST_DOMAIN, request)
}

/// `SHA-256` of the seller and the listing: the part of a key path only that seller can write pins for.
pub fn listing_key_id(seller: &AccountId, listing_id: u64) -> [u8; 32] {
    sha256(&[&domain_bytes(LISTING_KEY_DOMAIN, &(seller, listing_id))])
}

/// The one canonical path of a listing's key: `listing/{lowercase hex of the key id}/v{version}`.
pub fn listing_path(seller: &AccountId, listing_id: u64, version: u32) -> String {
    format!(
        "listing/{}/v{}",
        to_hex(&listing_key_id(seller, listing_id)),
        version
    )
}

/// Splits a canonical listing path into its key id and version. Anything else is
/// [`CoreError::Path`]: a path with two spellings would be two different keys, so the path must
/// equal what [`listing_path`] would write for what it parses to.
pub fn parse_listing_path(path: &str) -> Result<([u8; 32], u32), CoreError> {
    let (id, version) = path
        .strip_prefix("listing/")
        .and_then(|rest| rest.split_once("/v"))
        .ok_or(CoreError::Path)?;
    let key_id: [u8; 32] = ::hex::decode(id)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or(CoreError::Path)?;
    let version: u32 = version.parse().map_err(|_| CoreError::Path)?;
    if format!("listing/{}/v{}", to_hex(&key_id), version) != path {
        return Err(CoreError::Path);
    }
    Ok((key_id, version))
}

/// `SHA-256("marginal/path/v1" ‖ path)`: how clearing names a path.
pub fn path_hash(path: &str) -> [u8; 32] {
    sha256(&[PATH_DOMAIN, path.as_bytes()])
}

/// Which rooms may get a listing's key: the seller's choice (SDD §3.12.2).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum PinMode {
    /// Only rooms whose measurement hash is in the list.
    Explicit(#[serde(with = "hex_vec")] Vec<[u8; 32]>),
    /// Whatever governance has approved: the registry decides.
    FollowGovernance,
}

impl PinMode {
    /// At least one and at most [`MAX_PINS`] pins, with no duplicates.
    pub fn validate(&self) -> Result<(), CoreError> {
        if let PinMode::Explicit(pins) = self {
            let unique = pins.iter().enumerate().all(|(i, p)| !pins[..i].contains(p));
            if pins.is_empty() || pins.len() > MAX_PINS || !unique {
                return Err(CoreError::NotPinned);
            }
        }
        Ok(())
    }

    /// Whether a room with this measurement hash is allowed by the pins themselves.
    pub fn allows(&self, measurement_hash: &[u8; 32]) -> bool {
        match self {
            PinMode::Explicit(pins) => pins.contains(measurement_hash),
            PinMode::FollowGovernance => true,
        }
    }
}
