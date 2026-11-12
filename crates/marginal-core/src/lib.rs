#![no_std]
//! `marginal-core`: one implementation of the data model, errors, pricing and leakage arithmetic,
//! shared by the contracts, the room (as wasm) and `replay-ts`. Everything that decides money or
//! leakage lives here, so every party computes the same number.
//!
//! - [`types`]: the on-chain data model (SDD §3.3), Borsh.
//! - [`error`]: [`CoreError`], one enum with stable string codes (SDD §4.1).
//! - [`math`]: `mul_div` with a 256-bit intermediate.
//! - [`pricing`]: judgement factor, ceiling, measured index, valuation, rules (SDD §3.7).
//! - [`leakage`]: the millibit table and `max_debit` (SDD §3.8).
//!
//! Commitments, signing bytes and conservation arrive with E2.3.

extern crate alloc;

pub mod error;
pub mod leakage;
mod leakage_lut;
pub mod math;
pub mod pricing;
pub mod types;

pub use error::CoreError;
pub use types::*;

/// Crate format version, bumped when any Borsh layout changes.
pub const CORE_VERSION: u8 = 1;
