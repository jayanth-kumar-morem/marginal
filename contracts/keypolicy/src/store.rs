//! KeyPolicy's records, kept under their own key prefixes in raw storage, and nothing else: a
//! small, auditable layer with no collection types, so no hidden state and no ABI surprises.

use marginal_core::certificate::Measurement;
use marginal_core::keyrelease::AppKey;
use marginal_core::{AttestationMode, RoomClass};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::env;

/// What a room's attestation stored on chain says. Only `verified_height`, `expires_at` and the
/// hashes of a renewal may change; the rest is fixed for a room key (see `record_room`).
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub(crate) struct Attestation {
    pub measurement: Measurement,
    pub ppid_hash: [u8; 32],
    pub box_pk: [u8; 32],
    pub class: RoomClass,
    pub tcb_status: String,
    pub tee_tcb_svn: [u8; 16],
    pub collateral_hash: [u8; 32],
    pub quote_hash: [u8; 32],
    pub mode: AttestationMode,
    pub verified_height: u64,
    /// Unix seconds.
    pub expires_at: u64,
}

/// A nonce, good until `expiry` (a block height), only for the account that asked for it: a nonce
/// anyone could use would let a bystander who sees it on chain burn the operator's registration.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub(crate) struct NonceRecord {
    pub expiry: u64,
    pub issuer: near_sdk::AccountId,
}

/// A right to ask the MPC network for one key, granted by `authorize` and spent by `derive`.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub(crate) struct Ticket {
    pub room_key: [u8; 32],
    pub path: String,
    pub app_key: AppKey,
    pub job_id: u64,
    pub job_commitment: [u8; 32],
    pub expires_height: u64,
    pub used: bool,
}

#[derive(Clone, Copy)]
pub(crate) enum Table {
    /// nonce -> [`NonceRecord`]
    Nonce = b'n' as isize,
    /// room key -> [`Attestation`]
    Attestation = b'a' as isize,
    /// key id and version -> `PinMode`
    Pins = b'p' as isize,
    /// ticket id -> [`Ticket`]
    Ticket = b't' as isize,
}

fn key(table: Table, id: &[u8]) -> Vec<u8> {
    [&[table as u8], id].concat()
}

pub(crate) fn get<T: BorshDeserialize>(table: Table, id: &[u8]) -> Option<T> {
    env::storage_read(&key(table, id))
        .map(|bytes| T::try_from_slice(&bytes).expect("stored records decode"))
}

pub(crate) fn put<T: BorshSerialize>(table: Table, id: &[u8], value: &T) {
    env::storage_write(
        &key(table, id),
        &borsh::to_vec(value).expect("records encode"),
    );
}

/// Reads and deletes in one step.
pub(crate) fn take<T: BorshDeserialize>(table: Table, id: &[u8]) -> Option<T> {
    let value = get(table, id)?;
    env::storage_remove(&key(table, id));
    Some(value)
}

/// The storage id of a listing version's pins.
pub(crate) fn pin_id(key_id: &[u8; 32], version: u32) -> Vec<u8> {
    [key_id.as_slice(), &version.to_le_bytes()].concat()
}
