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
//! - [`verdict`], [`certificate`], [`delivery`]: the signed and hashed messages (SDD §3.17-§3.19),
//!   with their signing bytes and hashes.
//! - [`audit`]: the audit hash chain step (SDD §3.10).
//! - [`conservation`]: the AC-4 invariant (SDD §3.9.1).
//! - [`codec`]: Borsh and SHA-256, shared by the above. [`json`]: the JSON model for non-Rust consumers.

extern crate alloc;

pub mod audit;
pub mod certificate;
pub mod codec;
pub mod commit;
pub mod conservation;
pub mod delivery;
pub mod error;
pub mod json;
pub mod leakage;
mod leakage_lut;
pub mod math;
pub mod pricing;
pub mod types;
pub mod verdict;

pub use error::CoreError;
pub use types::*;

/// Crate format version, bumped when any Borsh layout changes.
pub const CORE_VERSION: u8 = 1;
