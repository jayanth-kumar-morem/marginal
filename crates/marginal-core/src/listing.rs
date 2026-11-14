//! What a listing must satisfy before clearing will store it (SDD §3.4, the `create_listing` row).
//!
//! These are the checks that depend only on the listing itself, so the contract, the SDK and the
//! seller's tooling all make the same ones. Whether the appraiser is registered, the category
//! allowed or the caller the seller is contract state, and stays in the contract.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::json::{hex, hex_opt};
use crate::leakage::MAX_ALPHABET;
use crate::types::{
    AccountId, AppraiserRef, AssetClass, BlobRef, CategoryId, DisclosurePolicy, Eligibility,
    KeyReleaseMode, LeakageAccount, OutputSchema, PayoutRoute, PricingRule, ValueClass,
    VerdictPrivacy,
};

/// Every output field and component must draw from a finite alphabet (SDD §3.4, AC-11): that is what
/// bounds the leakage of a verdict (§3.8). An alphabet of zero levels is a free-text field, which is
/// unbounded and refused on its own code; anything above [`MAX_ALPHABET`] has no millibit entry.
///
/// Field ids must be distinct, because a verdict names a shown field by id (`ShownField`), and names
/// must be non-empty so a buyer can tell the fields apart.
pub fn validate_schema(schema: &OutputSchema) -> Result<(), CoreError> {
    if schema.component_alphabets.is_empty() {
        return Err(CoreError::SchemaInvalid);
    }
    for alphabet in &schema.component_alphabets {
        validate_alphabet(*alphabet)?;
    }
    validate_alphabet(schema.judge_scale)?;
    for (i, field) in schema.fields.iter().enumerate() {
        validate_alphabet(field.alphabet)?;
        if field.name.is_empty() {
            return Err(CoreError::SchemaInvalid);
        }
        if schema.fields[..i].iter().any(|seen| seen.id == field.id) {
            return Err(CoreError::SchemaInvalid);
        }
    }
    Ok(())
}

/// Levels of one finite alphabet: `1..=MAX_ALPHABET`.
fn validate_alphabet(levels: u16) -> Result<(), CoreError> {
    if levels == 0 {
        return Err(CoreError::FreeTextField);
    }
    if levels > MAX_ALPHABET {
        return Err(CoreError::SchemaInvalid);
    }
    Ok(())
}

/// The pricing rule's parameters, before a listing is stored. R1 is the only rule built: its ask must
/// be positive, or no deal could ever be struck. Every other rule is format-only (SDD §3.7).
pub fn validate_rule(rule: &PricingRule) -> Result<(), CoreError> {
    match rule {
        PricingRule::Posted { ask } if *ask == 0 => Err(CoreError::RuleParams),
        PricingRule::Posted { .. } => Ok(()),
        _ => Err(CoreError::RuleDisabled),
    }
}

/// What a seller sends to `create_listing`: every field of a [`Listing`] that is theirs to choose.
///
/// Clearing fills in the rest — the id, the seller, the version, the status, the key path, and the
/// commitment, ciphertext and payout route that arrive later with `publish_listing`. It travels as
/// Borsh bytes, like every other argument that carries core's types (SDD §3.3: these types have no
/// JSON schema, which `cargo near`'s ABI step needs).
///
/// [`Listing`]: crate::types::Listing
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ListingSpec {
    pub asset_class: AssetClass,
    pub category: CategoryId,
    pub licence_class: u16,
    pub key_mode: KeyReleaseMode,
    pub appraiser: AppraiserRef,
    pub schema: OutputSchema,
    pub rule: PricingRule,
    pub token: AccountId,
    pub max_copies: u16,
    pub l_floor_bps: u32,
    pub external_judges_allowed: bool,
    pub privacy_default: VerdictPrivacy,
    pub disclosure_policy: DisclosurePolicy,
    pub leakage: LeakageAccount,
    pub value_class: ValueClass,
    pub eligibility: Eligibility,
    pub challenge_window_blocks: u64,
    pub delivery_deadline_blocks: u64,
    #[serde(with = "hex_opt")]
    pub dossier_hash: Option<[u8; 32]>,
}

/// Every `create_listing` check that depends only on the spec (SDD §3.4).
///
/// The counters of a fresh leakage account must be zero: a seller who could set `spent_mbits` could
/// claim leakage compensation for jobs that never ran. `l_floor_bps` is a fraction, so it cannot
/// exceed [`BPS`](crate::pricing::BPS), and both deadlines must be positive or a job could never be
/// late and `refund_expired` could never fire.
pub fn validate_spec(spec: &ListingSpec) -> Result<(), CoreError> {
    validate_schema(&spec.schema)?;
    validate_rule(&spec.rule)?;
    if spec.max_copies == 0 {
        return Err(CoreError::RuleParams);
    }
    if spec.l_floor_bps > crate::pricing::BPS {
        return Err(CoreError::RuleParams);
    }
    if spec.challenge_window_blocks == 0 || spec.delivery_deadline_blocks == 0 {
        return Err(CoreError::RuleParams);
    }
    if spec.leakage.reserved_mbits != 0 || spec.leakage.spent_mbits != 0 {
        return Err(CoreError::RuleParams);
    }
    if spec.leakage.budget_mbits == 0 {
        return Err(CoreError::BudgetExhausted);
    }
    Ok(())
}

/// What `publish_listing` adds to a provisioned listing (SDD §3.4): the commitment the buyer will
/// check a delivered good against, where the ciphertext lives, and where the proceeds go.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PublishSpec {
    #[serde(with = "hex")]
    pub good_commitment: [u8; 32],
    pub ciphertext: BlobRef,
    pub payout: PayoutRoute,
}
