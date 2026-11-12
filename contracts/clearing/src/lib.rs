//! Clearing: listings, jobs, escrow, pricing, leakage. This is the E1 skeleton: it holds
//! the deployment profile so that `config()` shows which toggles produced a record
//! (SDD §6.3 rule 2). Epics E4 to E6 add the rest.
use near_sdk::{near, AccountId, PanicOnDefault};

pub const CLEARING_VERSION: u8 = 1;

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum AssetClass {
    Knowledge,
    Dataset,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Rule {
    R1,
}

/// Profile values from `deploy/profiles/<profile>.toml` that change contract behaviour.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct ProfileConfig {
    pub profile: String,
    /// `gov.profile = demo` in HDP: `gov` is a dev account, not a DAO.
    pub gov_profile: String,
    pub cooling_blocks: u64,
    /// Challenge window W, in seconds.
    pub challenge_window_secs: u64,
    pub rules_enabled: Vec<Rule>,
    pub asset_classes_enabled: Vec<AssetClass>,
}

#[near(serializers = [json])]
pub struct ClearingConfig {
    pub version: u8,
    pub gov: AccountId,
    pub tokens: Vec<AccountId>,
    pub profile: ProfileConfig,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Clearing {
    gov: AccountId,
    tokens: Vec<AccountId>,
    profile: ProfileConfig,
}

#[near]
impl Clearing {
    #[init]
    pub fn new(gov: AccountId, tokens: Vec<AccountId>, profile: ProfileConfig) -> Self {
        assert!(!profile.rules_enabled.is_empty(), "no rule enabled");
        assert!(!profile.asset_classes_enabled.is_empty(), "no asset class enabled");
        Self { gov, tokens, profile }
    }

    pub fn config(&self) -> ClearingConfig {
        ClearingConfig {
            version: CLEARING_VERSION,
            gov: self.gov.clone(),
            tokens: self.tokens.clone(),
            profile: self.profile.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> ProfileConfig {
        ProfileConfig {
            profile: "sandbox".into(),
            gov_profile: "demo".into(),
            cooling_blocks: 0,
            challenge_window_secs: 600,
            rules_enabled: vec![Rule::R1],
            asset_classes_enabled: vec![AssetClass::Knowledge, AssetClass::Dataset],
        }
    }

    #[test]
    fn config_reflects_profile() {
        let gov: AccountId = "gov.test".parse().unwrap();
        let c = Clearing::new(gov.clone(), vec![], profile());
        let cfg = c.config();
        assert_eq!(cfg.gov, gov);
        assert_eq!(cfg.profile.challenge_window_secs, 600);
        assert_eq!(cfg.profile.rules_enabled, vec![Rule::R1]);
    }

    #[test]
    #[should_panic(expected = "no rule enabled")]
    fn rejects_empty_rules() {
        let mut p = profile();
        p.rules_enabled.clear();
        Clearing::new("gov.test".parse().unwrap(), vec![], p);
    }
}
