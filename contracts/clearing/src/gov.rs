//! Governance policy (SDD §3.4, §6.2). In M1 `gov` is a dev account (`gov.profile = demo`) and
//! sets these directly: there is no time-lock queue and no pause, because no demo surface shows
//! governance (`tasks.md`, "What M1 cuts"; E19 adds them).
//!
//! Every setter bumps `policy_version` and emits `policy_executed`, so a reader can tell which
//! policy produced a record (SDD §3.4: changes apply to new listings and jobs only).

use marginal_core::audit::AuditKind;
use marginal_core::json::{parse_hex, to_hex};
use marginal_core::{CoreError, FormulaId};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{from_value, json, Value};
use near_sdk::{near, require, AccountId};

use crate::store::{self, appraiser_id, Table};
use crate::{fail, now_secs, Clearing, ClearingExt};

/// What the clearing fee is, and how it is split (SDD §3.9.1). Rates are basis points; the three
/// shares are shares *of the fee* and must add up to one whole.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FeeTable {
    pub clearing_fee_buyer_bps: u32,
    pub clearing_fee_seller_bps: u32,
    pub treasury_bps: u32,
    pub operator_pool_bps: u32,
    pub assurance_pool_bps: u32,
}

impl Default for FeeTable {
    /// No fee until governance sets one: a deployment that forgets to charges nothing, rather than
    /// quietly taking a share.
    fn default() -> Self {
        Self {
            clearing_fee_buyer_bps: 0,
            clearing_fee_seller_bps: 0,
            treasury_bps: 10_000,
            operator_pool_bps: 0,
            assurance_pool_bps: 0,
        }
    }
}

impl FeeTable {
    fn validate(&self) {
        let bps = marginal_core::pricing::BPS;
        require!(
            self.clearing_fee_buyer_bps <= bps && self.clearing_fee_seller_bps <= bps,
            "fee over 100%"
        );
        let shares = self.treasury_bps + self.operator_pool_bps + self.assurance_pool_bps;
        require!(shares == bps, "fee shares must add up to 100%");
    }
}

/// A registered appraiser version (SDD §3.4: `id@version` must be registered and enabled).
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub struct AppraiserEntry {
    pub formula: FormulaId,
    /// The appraiser's fee class: what an appraisal job's `compute` bucket is funded with (§3.9.1).
    pub compute_fee: u128,
    pub enabled: bool,
}

#[near]
impl Clearing {
    /// Registers or updates an appraiser version. `formula` is a core `FormulaId` name, so a
    /// listing can only point at a formula this build actually has.
    pub fn set_appraiser(
        &mut self,
        id: String,
        version: u32,
        formula: String,
        compute_fee: U128,
        enabled: bool,
    ) {
        self.only_gov();
        require!(!id.is_empty(), "appraiser id");
        let formula: FormulaId =
            from_value(Value::String(formula)).unwrap_or_else(|_| fail(CoreError::Decode));
        store::put(
            Table::Appraiser,
            &appraiser_id(&id, version),
            &AppraiserEntry {
                formula,
                compute_fee: compute_fee.0,
                enabled,
            },
        );
        self.policy_changed(
            "appraiser_set",
            json!({ "id": id, "version": version, "formula": formula, "compute_fee": compute_fee, "enabled": enabled }),
        );
    }

    /// Replaces the settlement token allow-list. It is never empty: a clearing with no token could
    /// not settle anything.
    pub fn set_tokens(&mut self, tokens: Vec<AccountId>) {
        self.only_gov();
        require!(!tokens.is_empty(), "no settlement token");
        self.tokens = tokens.clone();
        self.policy_changed("tokens_set", json!({ "tokens": tokens }));
    }

    /// The key that signs identity credentials (SDD §3.4, AC-56). E5 checks them.
    pub fn set_issuer_key(&mut self, key: String) {
        self.only_gov();
        let parsed = parse_key(&key);
        self.issuer_key = Some(parsed);
        self.policy_changed("issuer_key_set", json!({ "key": to_hex(&parsed) }));
    }

    /// The compliance reviewer's key (SDD §3.4: payout approvals and consented review).
    pub fn set_compliance_key(&mut self, key: String) {
        self.only_gov();
        let parsed = parse_key(&key);
        self.compliance_key = Some(parsed);
        self.policy_changed("compliance_key_set", json!({ "key": to_hex(&parsed) }));
    }

    /// Adds a NEAR AI signer with an expiry, or removes it when `expires_at` is in the past
    /// (SDD §3.16: the signer list is governance-set and every entry expires).
    pub fn set_ai_signer(&mut self, key: String, expires_at: u64) {
        self.only_gov();
        let parsed = parse_key(&key);
        if expires_at > now_secs() {
            store::put(Table::Signer, &parsed, &expires_at);
        } else {
            store::remove(Table::Signer, &parsed);
        }
        self.policy_changed(
            "ai_signer_set",
            json!({ "key": to_hex(&parsed), "expires_at": expires_at }),
        );
    }

    pub fn set_fees(&mut self, fees: FeeTable) {
        self.only_gov();
        fees.validate();
        self.fees = fees.clone();
        self.policy_changed("fees_set", json!({ "fees": fees }));
    }
}

/// A 32-byte key in hex.
fn parse_key(key: &str) -> [u8; 32] {
    parse_hex(key).unwrap_or_else(|| fail(CoreError::Decode))
}

impl Clearing {
    fn policy_changed(&mut self, event: &str, mut data: Value) {
        self.policy_version += 1;
        data["policy_version"] = json!(self.policy_version);
        self.emit(AuditKind::PolicyExecuted, event, self.policy_version, data);
    }

    /// The appraiser a listing names, if it is registered and enabled.
    pub(crate) fn appraiser(&self, id: &str, version: u32) -> Option<AppraiserEntry> {
        store::get::<AppraiserEntry>(Table::Appraiser, &appraiser_id(id, version))
            .filter(|entry| entry.enabled)
    }
}
