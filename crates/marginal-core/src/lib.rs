#![no_std]
//! `marginal-core`: one implementation of the data model, errors, pricing, leakage arithmetic and
//! commitments, shared by the contracts, the room (as wasm) and `replay-ts`. Everything that decides
//! money or leakage, or makes bytes other parties must reproduce, lives here, so every party computes
//! the same thing.
//!
//! - [`types`]: the on-chain data model (SDD §3.3), Borsh.
//! - [`error`]: [`CoreError`], one enum with stable string codes (SDD §4.1).
//! - [`math`]: `mul_div` with a 256-bit intermediate.
//! - [`pricing`]: judgement factor, ceiling, measured index, valuation, rules (SDD §3.7).
//! - [`leakage`]: the millibit table and `max_debit` (SDD §3.8).
//! - [`commit`]: the job commitment and the salted good commitment (SDD §3.12.3).
//! - [`listing`]: what a listing must satisfy; [`reports`]: what a room signs about one (SDD §3.4).
//! - [`lifecycle`]: the job state machine (SDD §3.5). [`funding`]: what a job costs (SDD §3.9.1).
//! - [`credential`]: the nullifier credential compliance signs (SDD §3.20).
//! - [`request`]: what a buyer sends to `request_appraisal` (SDD §3.4).
//! - [`judge`]: the receipt checks that need no host functions (SDD §3.16).
//! - [`settle`]: where a job's money goes when it ends (SDD §3.9.2).
//! - [`verdict`], [`certificate`], [`delivery`]: the signed and hashed messages (SDD §3.17-§3.19),
//!   with their signing bytes and hashes.
//! - [`audit`]: the audit hash chain step (SDD §3.10).
//! - [`keyrelease`]: the key request a room signs, key paths and pins (SDD §3.12).
//! - [`attest`], [`verifier`]: room attestation checks and the locked verifier's types (SDD §3.13).
//! - [`conservation`]: the AC-4 invariant (SDD §3.9.1).
//! - [`codec`]: Borsh and SHA-256, shared by the above. [`json`]: the JSON model for non-Rust consumers.

extern crate alloc;

pub mod attest;
pub mod audit;
pub mod certificate;
pub mod codec;
pub mod commit;
pub mod conservation;
pub mod credential;
pub mod delivery;
pub mod error;
pub mod funding;
pub mod groth16;
pub mod json;
pub mod judge;
pub mod keyrelease;
pub mod leakage;
mod leakage_lut;
pub mod lifecycle;
pub mod listing;
pub mod math;
pub mod pricing;
pub mod reports;
pub mod request;
pub mod settle;
pub mod types;
pub mod verdict;
pub mod verifier;

pub use error::CoreError;
pub use types::*;

/// Crate format version, bumped when any Borsh layout changes.
pub const CORE_VERSION: u8 = 1;
