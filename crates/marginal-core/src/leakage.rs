//! Leakage arithmetic (SDD §3.8). All amounts are millibits (1/1000 of a bit), rounded up, so the
//! ledger never under-counts what a buyer learned.
//!
//! In this release a job's debit is the outcome bit, plus (Open mode only) every published
//! component and every judge factor. Shown fields and R2 price levels add terms later; until then
//! they return `*Disabled` rather than being silently undercounted.

use crate::error::CoreError;
use crate::leakage_lut::LUT;
use crate::types::{DisplayMode, OutputSchema, PricingRule, VerdictPrivacy};

/// One bit: whether the appraisal cleared.
pub const OUTCOME_MBITS: u64 = 1_000;

/// Largest alphabet the table covers.
pub const MAX_ALPHABET: u16 = 4096;

/// `ceil(1000 * log2 n)`: the smallest `k` with `2^k >= n^1000`, for `n` in `1..=4096`.
///
/// An alphabet of 0 or more than [`MAX_ALPHABET`] is a malformed schema. The table is checked
/// against exact big-integer arithmetic for every entry in `tests/leakage.rs`.
pub fn mbits(n: u16) -> Result<u64, CoreError> {
    n.checked_sub(1)
        .and_then(|i| LUT.get(usize::from(i)))
        .map(|k| u64::from(*k))
        .ok_or(CoreError::SchemaInvalid)
}

/// The most a job can debit, which is also what is reserved before it runs and what is debited
/// when it completes (so the debit never depends on the good's content).
///
/// - **Sealed:** `OUTCOME_MBITS` (1,000), whatever the schema.
/// - **Open:** also every component's alphabet and `n_judges` judge factors.
///
/// The sum saturates instead of overflowing. It cannot overflow for any schema that fits in memory
/// (each term is at most 12,000), and a saturated debit exceeds every budget, so it would be refused.
pub fn max_debit(
    schema: &OutputSchema,
    mode: &DisplayMode,
    rule: &PricingRule,
    privacy: VerdictPrivacy,
    n_judges: u8,
) -> Result<u64, CoreError> {
    if !matches!(mode, DisplayMode::Blind) {
        return Err(CoreError::DisplayDisabled);
    }
    if !matches!(rule, PricingRule::Posted { .. }) {
        return Err(CoreError::RuleDisabled);
    }
    let mut debit = OUTCOME_MBITS;
    if privacy == VerdictPrivacy::Open {
        for alphabet in &schema.component_alphabets {
            debit = debit.saturating_add(mbits(*alphabet)?);
        }
        if n_judges > 0 {
            debit = debit.saturating_add(u64::from(n_judges) * mbits(schema.judge_scale)?);
        }
    }
    Ok(debit)
}
