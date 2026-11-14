//! Clearing's records in raw storage, one prefix per table. No collection types, so the state is
//! exactly what these functions write and a reader can reconstruct it from the prefixes alone.

use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::env;

#[derive(Clone, Copy)]
pub(crate) enum Table {
    /// listing id (LE) -> `marginal_core::Listing`
    Listing = b'l' as isize,
    /// job id (LE) -> `marginal_core::Job`
    Job = b'j' as isize,
    /// snapshot id (LE) -> `marginal_core::Snapshot`
    Snapshot = b's' as isize,
    /// audit seq (LE) -> `marginal_core::audit::AuditEntry`
    Audit = b'e' as isize,
    /// `id@version` -> [`crate::AppraiserEntry`]
    Appraiser = b'a' as isize,
    /// NEAR AI signer key -> expiry (Unix seconds, LE)
    Signer = b'k' as isize,
    /// measurement set id -> [`MeasurementSet`](crate::registry::MeasurementSet)
    MeasurementSet = b'm' as isize,
    /// measurement hash -> the id of the approved set it belongs to
    Measurement = b'd' as isize,
    /// ppid hash -> [`Platform`](crate::registry::Platform)
    Platform = b'p' as isize,
    /// room key -> [`RoomRecord`](crate::registry::RoomRecord)
    Room = b'r' as isize,
    /// room class -> `Vec<RoomKey>`: the assignment pool (SDD §3.11 `eligible`)
    Pool = b'c' as isize,
    /// room key -> `Vec<u64>`: that room's open jobs (SDD issue 5, `get_jobs_for_room`)
    RoomJobs = b'o' as isize,
    /// account and token -> balance: what a buyer has deposited and not yet spent (§3.9.3)
    Balance = b'b' as isize,
    /// account and token -> claimable: what settlement owes and `claim` pays out (§3.9.4)
    Claimable = b'q' as isize,
    /// listing, epoch and nullifier -> () : one appraisal per identity per epoch (AC-14)
    Nullifier = b'n' as isize,
    /// account and agent key -> [`AgentCaps`](crate::agent::AgentCaps) (§3.21)
    Agent = b'g' as isize,
    /// account and agent key -> [`WindowSpend`](crate::agent::WindowSpend)
    AgentSpend = b'w' as isize,
    /// job id (LE) -> the context key sealed to the room's box key (§3.12.4)
    ContextKey = b'x' as isize,
    /// job id (LE) -> `marginal_core::SettlementRecord` (§3.9.2)
    Settlement = b'z' as isize,
    /// receipt id -> () : a judge receipt is used once (§3.16)
    Receipt = b'y' as isize,
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

/// The storage id of a numbered record.
pub(crate) fn num(id: u64) -> [u8; 8] {
    id.to_le_bytes()
}

/// The storage id of a balance or a claimable amount: one account's holding of one token.
pub(crate) fn holding(account: &near_sdk::AccountId, token: &near_sdk::AccountId) -> Vec<u8> {
    [account.as_bytes(), b"/", token.as_bytes()].concat()
}

/// The storage id of an agent key: one key on one account.
pub(crate) fn agent_id(account: &near_sdk::AccountId, key: &[u8]) -> Vec<u8> {
    [account.as_bytes(), b"/", key].concat()
}

/// The storage id of a spent nullifier: one identity, one listing, one epoch (AC-14).
pub(crate) fn nullifier_id(listing_id: u64, epoch: u32, nullifier: &[u8; 32]) -> Vec<u8> {
    [
        listing_id.to_le_bytes().as_slice(),
        &epoch.to_le_bytes(),
        nullifier,
    ]
    .concat()
}

/// The storage id of an appraiser: `id@version`, so one id can have several versions.
pub(crate) fn appraiser_id(id: &str, version: u32) -> Vec<u8> {
    [id.as_bytes(), b"@", &version.to_le_bytes()].concat()
}

/// A room's open jobs, oldest first.
pub(crate) fn open_jobs(room_key: &[u8; 32]) -> Vec<u64> {
    get(Table::RoomJobs, room_key).unwrap_or_default()
}

/// The most jobs one room may hold at once. It bounds what `assign` and `get_jobs_for_room` read,
/// and a room at its limit is skipped when a job is assigned.
pub(crate) const MAX_OPEN_JOBS: usize = 32;

pub(crate) fn add_open_job(room_key: &[u8; 32], job_id: u64) {
    let mut jobs = open_jobs(room_key);
    jobs.push(job_id);
    put(Table::RoomJobs, room_key, &jobs);
}

/// Called when a job leaves the room's queue, whatever its outcome.
pub(crate) fn close_job(room_key: &[u8; 32], job_id: u64) {
    let mut jobs = open_jobs(room_key);
    jobs.retain(|id| *id != job_id);
    put(Table::RoomJobs, room_key, &jobs);
}

pub(crate) fn remove(table: Table, id: &[u8]) {
    env::storage_remove(&key(table, id));
}
