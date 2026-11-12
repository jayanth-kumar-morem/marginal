//! Encoding and hashing shared by every module that makes bytes other parties must reproduce.

use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use sha2::{Digest, Sha256};

use crate::error::CoreError;

/// The Borsh bytes of `value`.
pub fn to_bytes<T: BorshSerialize>(value: &T) -> Vec<u8> {
    borsh::to_vec(value).expect("borsh into a Vec cannot fail for these types")
}

/// Strict: truncated or trailing bytes are errors.
pub fn from_bytes<T: BorshDeserialize>(bytes: &[u8]) -> Result<T, CoreError> {
    borsh::from_slice(bytes).map_err(|_| CoreError::Decode)
}

/// SHA-256 of the concatenation of `parts`.
pub fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().into()
}

/// SHA-256 of the Borsh bytes of `value`.
pub fn hash_of<T: BorshSerialize>(value: &T) -> [u8; 32] {
    sha256(&[&to_bytes(value)])
}

/// `domain ‖ borsh(value)`: what gets signed or hashed. The domain prefix keeps a signature or hash
/// made for one kind of message from being valid for another.
pub fn domain_bytes<T: BorshSerialize>(domain: &[u8], value: &T) -> Vec<u8> {
    let mut bytes = domain.to_vec();
    bytes.extend(to_bytes(value));
    bytes
}
