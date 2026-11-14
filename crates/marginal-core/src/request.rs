//! What a buyer sends to `request_appraisal` (SDD §3.4). Like a listing's spec, it travels as Borsh
//! and carries only what the buyer chooses; clearing fills in the job id, the rooms, the buckets and
//! the commitment.

use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::credential::NullifierCredential;
use crate::error::CoreError;
use crate::json::{dec, hex, hex_opt};
use crate::types::{DisplayMode, RefundRoute, VerdictPrivacy};

/// The most judges a request may ask for. Each one adds its own alphabet to the leakage a verdict
/// can carry (§3.8), and the bound keeps `max_debit` finite.
pub const MAX_JUDGES: u8 = 8;

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AppraisalRequest {
    pub listing_id: u64,
    pub listing_version: u32,
    /// The buyer's context, anchored beforehand (AC-6). `None` is an appraisal with no context.
    pub snapshot_id: Option<u64>,
    /// B: the most the good can be priced at.
    #[serde(with = "dec")]
    pub budget: u128,
    pub mode: DisplayMode,
    pub privacy: VerdictPrivacy,
    pub n_judges: u8,
    /// Where the delivery is sealed to.
    #[serde(with = "hex")]
    pub delivery_pk: [u8; 32],
    #[serde(with = "hex_opt")]
    pub compliance_pk: Option<[u8; 32]>,
    /// The key the room checks an ad-hoc context envelope against (§3.12.4).
    #[serde(with = "hex")]
    pub context_auth_pk: [u8; 32],
    /// HDP: `DEK_c` sealed to the room's attested `box_pk`, carried in the request because there is
    /// one room and the buyer knows it in advance (§3.12.4). Empty for a job with no context.
    #[serde(with = "hex")]
    pub sealed_context_key: Vec<u8>,
    pub refund_to: RefundRoute,
    /// Required when the listing is nullifier-gated (AC-14), with the issuer's signature.
    pub nullifier: Option<NullifierCredential>,
    #[serde(with = "hex_opt")]
    pub nullifier_sig: Option<[u8; 64]>,
}

/// Every check that depends only on the request itself.
pub fn validate_request(request: &AppraisalRequest) -> Result<(), CoreError> {
    if request.n_judges > MAX_JUDGES {
        return Err(CoreError::RuleParams);
    }
    if request.budget == 0 {
        return Err(CoreError::RuleParams);
    }
    if !matches!(request.mode, DisplayMode::Blind) {
        return Err(CoreError::DisplayDisabled);
    }
    if request.nullifier.is_some() != request.nullifier_sig.is_some() {
        return Err(CoreError::CredentialInvalid);
    }
    Ok(())
}
