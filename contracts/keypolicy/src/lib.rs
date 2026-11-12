//! KeyPolicy: immutable after deployment. No setter and no upgrade method.
//! Init-only configuration is fixed by `new` (SDD §3.12.2). Epic E3 adds the rest.
use near_sdk::{near, AccountId, PanicOnDefault};

pub const KEYPOLICY_VERSION: u8 = 1;

#[near(serializers = [json])]
pub struct KeyPolicyConfig {
    pub version: u8,
    pub chain_id: String,
    pub registry: AccountId,
    pub clearing: AccountId,
    pub mpc: AccountId,
    pub ckd_domain_id: u32,
    pub dcap_verifier: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct KeyPolicy {
    chain_id: String,
    /// In M1 the registry is a module inside clearing, so this equals `clearing`.
    registry: AccountId,
    clearing: AccountId,
    mpc: AccountId,
    ckd_domain_id: u32,
    dcap_verifier: AccountId,
}

#[near]
impl KeyPolicy {
    #[init]
    pub fn new(
        chain_id: String,
        registry: AccountId,
        clearing: AccountId,
        mpc: AccountId,
        ckd_domain_id: u32,
        dcap_verifier: AccountId,
    ) -> Self {
        Self { chain_id, registry, clearing, mpc, ckd_domain_id, dcap_verifier }
    }

    pub fn config(&self) -> KeyPolicyConfig {
        KeyPolicyConfig {
            version: KEYPOLICY_VERSION,
            chain_id: self.chain_id.clone(),
            registry: self.registry.clone(),
            clearing: self.clearing.clone(),
            mpc: self.mpc.clone(),
            ckd_domain_id: self.ckd_domain_id,
            dcap_verifier: self.dcap_verifier.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_roundtrip() {
        let a = |s: &str| s.parse::<AccountId>().unwrap();
        let kp = KeyPolicy::new("testnet".into(), a("c.test"), a("c.test"), a("mpc.test"), 2, a("v.test"));
        let c = kp.config();
        assert_eq!(c.ckd_domain_id, 2);
        assert_eq!(c.registry, c.clearing);
    }
}
