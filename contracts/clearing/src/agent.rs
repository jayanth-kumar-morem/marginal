//! The agent access and spend firewall (SDD §3.21, D5, AC-50). A buyer gives an agent a
//! function-call key on their own account and registers it here with caps. The contract enforces
//! the caps whatever the key's method list says, and a function-call key cannot attach a deposit,
//! so an agent can only ever spend the balance its owner prefunded.

use marginal_core::audit::AuditKind;
use marginal_core::json::parse_hex;
use marginal_core::CoreError;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

use crate::store::{self, agent_id, Table};
use crate::{fail, now_secs, Clearing, ClearingExt};

/// What an agent key may spend (SDD §3.21).
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentCaps {
    /// The most one job's budget may be.
    pub per_job_budget_max: U128,
    /// The most the key may spend in a window, and how long a window lasts.
    pub window_max: U128,
    pub window_secs: u64,
    pub max_jobs_per_window: u16,
    /// A job whose budget is above this is parked for a human (`PendingApproval`).
    pub human_above: U128,
}

/// What one key has spent in the window it is in.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Default, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub(crate) struct WindowSpend {
    pub window_start_secs: u64,
    pub spent: u128,
    pub jobs: u16,
}

/// What the firewall decided about a request.
pub(crate) enum AgentVerdict {
    /// Not an agent key, or inside every cap.
    Allow,
    /// Above `human_above`: the job is parked until a human approves it.
    Park,
    /// Over a cap: no job is created, and the attempt is recorded.
    Block(&'static str),
}

#[near]
impl Clearing {
    /// Registers an agent key on the caller's own account. Only a key that is not itself an agent
    /// key may do this, so an agent cannot widen its own caps or mint a second key.
    pub fn register_agent_key(&mut self, public_key: String, caps: AgentCaps) {
        let owner = env::predecessor_account_id();
        self.require_not_agent(&owner);
        require!(caps.window_secs > 0, "window must be positive");
        require!(
            caps.per_job_budget_max.0 > 0 && caps.window_max.0 > 0,
            "caps must be positive"
        );
        let key = parse_agent_key(&public_key);
        store::put(Table::Agent, &agent_id(&owner, &key), &caps);
        store::put(
            Table::AgentSpend,
            &agent_id(&owner, &key),
            &WindowSpend {
                window_start_secs: now_secs(),
                spent: 0,
                jobs: 0,
            },
        );
        self.emit(
            AuditKind::PolicyExecuted,
            "agent_key_registered",
            0,
            json!({ "owner": owner, "public_key": public_key, "caps": caps }),
        );
    }

    /// Takes an agent key out of service. Also only from a non-agent key.
    pub fn revoke_agent_key(&mut self, public_key: String) {
        let owner = env::predecessor_account_id();
        self.require_not_agent(&owner);
        let key = parse_agent_key(&public_key);
        store::remove(Table::Agent, &agent_id(&owner, &key));
        store::remove(Table::AgentSpend, &agent_id(&owner, &key));
        self.emit(
            AuditKind::PolicyExecuted,
            "agent_key_revoked",
            0,
            json!({ "owner": owner, "public_key": public_key }),
        );
    }

    /// The caps on one of the caller's keys, for the SDK's pre-check.
    pub fn get_agent_caps(&self, account: AccountId, public_key: String) -> Option<AgentCaps> {
        store::get(
            Table::Agent,
            &agent_id(&account, &parse_agent_key(&public_key)),
        )
    }

    /// What one agent key has spent in its current window.
    pub fn get_agent_spend(&self, account: AccountId, public_key: String) -> Option<U128> {
        let spend: WindowSpend = store::get(
            Table::AgentSpend,
            &agent_id(&account, &parse_agent_key(&public_key)),
        )?;
        Some(U128(self.window_of(&spend).spent))
    }
}

impl Clearing {
    /// Refuses a call signed by a key this account registered as an agent key. Admin methods use it
    /// so a misconfigured method list cannot let an agent register keys, approve its own parked
    /// jobs or move tokens out (§3.21).
    pub(crate) fn require_not_agent(&self, account: &AccountId) {
        if self.caps_for_signer(account).is_some() {
            fail(CoreError::AgentCap)
        }
    }

    /// The caps on the key that signed this call, if its owner registered it.
    pub(crate) fn caps_for_signer(&self, account: &AccountId) -> Option<AgentCaps> {
        let key = env::signer_account_pk();
        store::get(Table::Agent, &agent_id(account, &key.as_bytes()[1..]))
    }

    /// Applies the caps to a request, without recording anything: the caller decides what to do.
    pub(crate) fn agent_verdict(&self, caps: &AgentCaps, budget: u128) -> AgentVerdict {
        if budget > caps.per_job_budget_max.0 {
            return AgentVerdict::Block("per_job_budget_max");
        }
        let spend = self.signer_window();
        if spend.jobs >= caps.max_jobs_per_window {
            return AgentVerdict::Block("max_jobs_per_window");
        }
        if spend.spent.saturating_add(budget) > caps.window_max.0 {
            return AgentVerdict::Block("window_max");
        }
        if budget > caps.human_above.0 {
            return AgentVerdict::Park;
        }
        AgentVerdict::Allow
    }

    /// Records a job against the signing key's window.
    pub(crate) fn record_agent_spend(&mut self, account: &AccountId, budget: u128) {
        let key = env::signer_account_pk();
        let id = agent_id(account, &key.as_bytes()[1..]);
        let mut spend = self.window_of(&store::get(Table::AgentSpend, &id).unwrap_or_default());
        spend.spent = spend.spent.saturating_add(budget);
        spend.jobs = spend.jobs.saturating_add(1);
        store::put(Table::AgentSpend, &id, &spend);
    }

    /// The window the signing key is in now.
    fn signer_window(&self) -> WindowSpend {
        let key = env::signer_account_pk();
        let id = agent_id(&env::predecessor_account_id(), &key.as_bytes()[1..]);
        self.window_of(&store::get(Table::AgentSpend, &id).unwrap_or_default())
    }

    /// A window that has run out starts again, empty.
    fn window_of(&self, spend: &WindowSpend) -> WindowSpend {
        let caps = self.caps_for_signer(&env::predecessor_account_id());
        let window_secs = caps.map(|c| c.window_secs).unwrap_or(0);
        if window_secs > 0 && now_secs() >= spend.window_start_secs.saturating_add(window_secs) {
            WindowSpend {
                window_start_secs: now_secs(),
                spent: 0,
                jobs: 0,
            }
        } else {
            spend.clone()
        }
    }
}

/// An ed25519 public key in hex (32 bytes), the way `get_agent_caps` and the SDK name one.
fn parse_agent_key(public_key: &str) -> [u8; 32] {
    parse_hex(public_key).unwrap_or_else(|| fail(CoreError::Decode))
}
