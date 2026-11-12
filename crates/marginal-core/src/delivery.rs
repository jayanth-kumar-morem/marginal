//! What a buyer receives after a deal (SDD §3.19): the key to the good, sealed to each recipient.
//! The sealing itself (X25519, XChaCha20-Poly1305) is the room's and the SDK's job; this is the
//! shape of the result and its hash `h_D`, which the verdict commits to.

use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::codec::hash_of;
use crate::json::hex;

/// The key, sealed to one recipient (the buyer, or the compliance copy).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct DeliveryEntry {
    #[serde(with = "hex")]
    pub recipient: [u8; 32],
    #[serde(with = "hex")]
    pub ciphertext: Vec<u8>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct DeliveryV1 {
    /// The ephemeral public key the entries were sealed from.
    #[serde(with = "hex")]
    pub eph_pk: [u8; 32],
    pub entries: Vec<DeliveryEntry>,
}

/// `h_D = SHA-256(borsh(delivery))`.
pub fn delivery_hash(delivery: &DeliveryV1) -> [u8; 32] {
    hash_of(delivery)
}
