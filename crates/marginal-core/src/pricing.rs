//! Pricing engine (SDD §3.7). The contract evaluates only formulas compiled in here, and it
//! recomputes every price itself: it never trusts the room's deal or no-deal branch.
//!
//! Only formulas `KnowledgeV1` and `DatasetLiteV0` and rule R1 (posted price) are built. The other
//! variants exist so the data format does not change when they arrive; they return `*Disabled`.
//!
//! Properties, tested in `tests/pricing.rs`:
//! - **AC-2** the outcome and the price are non-decreasing in every judge factor;
//! - **AC-3** `ask <= price <= budget` on every deal;
//! - **AC-5** under R1 the price does not depend on the budget;
//! - **AC-41** a judge can only discount: a factor of 0 (a parse failure) gives the floor, and the
//!   index never exceeds the deterministic ceiling.

use serde::Serialize;

use crate::error::CoreError;
use crate::json::dec;
use crate::math::{mul_div, mul_div_u32};
use crate::types::{FormulaId, FormulaParams, PricingRule};

/// 100% in basis points.
pub const BPS: u32 = 10_000;

/// `L = max(l_floor, min(l_i))`, each factor clamped to [`BPS`]. No factors gives [`BPS`].
///
/// The room encodes a judge schema or parse failure as `l_i = 0`, which resolves to the floor.
pub fn judgement_factor(l_floor: u32, factors: &[u32]) -> u32 {
    let lowest = factors.iter().map(|f| (*f).min(BPS)).min().unwrap_or(BPS);
    lowest.max(l_floor.min(BPS))
}

/// Exactly two components, each at most [`BPS`]. Both built formulas take two.
fn two_components(c: &[u32]) -> Result<(u32, u32), CoreError> {
    match *c {
        [a, b] if a <= BPS && b <= BPS => Ok((a, b)),
        _ => Err(CoreError::Schema),
    }
}

/// The deterministic ceiling `D`, in bps, from integer components.
///
/// - `KnowledgeV1`: `c = [N_b, N_pub]`, `D = N_b * N_pub / 10^4` (`N_pub = BPS` if not opted in).
/// - `DatasetLiteV0`: `c = [delta_lower, overlap]`,
///   `D = min(1, delta_lower / delta_star) * (1 - overlap)`.
pub fn ceiling(f: FormulaId, c: &[u32], p: &FormulaParams) -> Result<u32, CoreError> {
    match f {
        FormulaId::KnowledgeV1 => {
            let (n_b, n_pub) = two_components(c)?;
            mul_div_u32(n_b, n_pub, BPS)
        }
        FormulaId::DatasetLiteV0 => {
            let (delta_lower, overlap) = two_components(c)?;
            let star = u64::from(p.delta_star_bps.max(1));
            let gain = (u64::from(delta_lower) * u64::from(BPS) / star).min(u64::from(BPS));
            mul_div_u32(gain as u32, BPS - overlap, BPS) // gain <= BPS: the cast is exact
        }
        FormulaId::DatasetV1 => Err(CoreError::FormulaDisabled),
    }
}

/// The measured-value index `m = floor(D * L / 10^4)`, in bps. Never above `D`.
pub fn measured_index(
    f: FormulaId,
    c: &[u32],
    p: &FormulaParams,
    l_floor: u32,
    l: &[u32],
) -> Result<u32, CoreError> {
    mul_div_u32(ceiling(f, c, p)?, judgement_factor(l_floor, l), BPS)
}

/// The buyer's valuation `V = floor(budget * m / 10^4)`. Never above `budget`.
pub fn valuation(budget: u128, m: u32) -> Result<u128, CoreError> {
    if m > BPS {
        return Err(CoreError::Schema);
    }
    mul_div(budget, u128::from(m), u128::from(BPS))
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuleOutcome {
    Deal {
        #[serde(with = "dec")]
        price: u128,
    },
    NoDeal,
}

/// Applies the listing's pricing rule to the budget `B` and the index `m`.
///
/// R1 (`Posted`): a deal at exactly the ask if `V >= ask`, otherwise no deal. The ask must be
/// positive. Every other rule returns [`CoreError::RuleDisabled`].
pub fn apply_rule(rule: &PricingRule, budget: u128, m: u32) -> Result<RuleOutcome, CoreError> {
    match *rule {
        PricingRule::Posted { ask } => {
            if ask == 0 {
                return Err(CoreError::RuleParams);
            }
            Ok(if valuation(budget, m)? >= ask {
                RuleOutcome::Deal { price: ask }
            } else {
                RuleOutcome::NoDeal
            })
        }
        _ => Err(CoreError::RuleDisabled),
    }
}
