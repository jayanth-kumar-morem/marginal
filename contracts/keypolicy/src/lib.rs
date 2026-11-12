//! KeyPolicy (SDD §3.12, §3.13): the immutable gatekeeper of every listing key. It verifies a
//! room's attestation through NEAR One's locked verifier, stores what the room proved, takes the
//! seller's pins, and turns a room's signed request into a one-use ticket for a key from the NEAR MPC
//! network. The policy is in `marginal-core` (`attest`, `keyrelease`); this crate is state and promises.
//!
//! **Immutable.** There is no setter, no upgrade method and no owner. The account's access keys are
//! deleted at deployment (here: it is created without any), and nothing in this code can deploy a
//! contract, add a key or delete one: the sandbox tests check that the built wasm imports none of those
//! host functions. A fix is a new KeyPolicy at a new account, which derives different keys.
//!
//! **Caller pays.** Every method that stores a record charges a fee that covers it, so the contract
//! cannot be drained by calling it.

#[cfg(all(feature = "sim-attestation", feature = "mainnet"))]
compile_error!("`sim-attestation` and `mainnet` cannot be enabled together: simulated rooms must never reach mainnet");

mod calls;
mod events;
mod fees;
mod pins;
mod registration;
mod release;
#[cfg(feature = "sim-attestation")]
mod sim;
mod store;
mod views;

#[cfg(test)]
mod tests;

pub use fees::{ATTESTATION_FEE, NONCE_FEE, PINS_FEE, TICKET_FEE};
pub use registration::NONCE_TTL_BLOCKS;
pub use release::{CkdResponse, TICKET_TTL_BLOCKS};
pub use views::KeyPolicyConfig;

use marginal_core::audit::AUDIT_GENESIS;
use marginal_core::CoreError;
use near_sdk::{env, near, AccountId, PanicOnDefault};

pub const KEYPOLICY_VERSION: u8 = 1;

/// Refuses with the stable error code of `error`.
pub(crate) fn fail(error: CoreError) -> ! {
    env::panic_str(error.code())
}

/// The block time in Unix seconds.
pub(crate) fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct KeyPolicy {
    // Fixed at `new`; nothing can change them (SDD §3.12.2).
    chain_id: String,
    /// In M1 the registry is a module inside clearing, so this equals `clearing`.
    registry: AccountId,
    clearing: AccountId,
    mpc: AccountId,
    ckd_domain_id: u32,
    dcap_verifier: AccountId,
    // Counters.
    nonce_counter: u64,
    next_ticket: u64,
    audit_seq: u64,
    audit_head: [u8; 32],
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
        Self {
            chain_id,
            registry,
            clearing,
            mpc,
            ckd_domain_id,
            dcap_verifier,
            nonce_counter: 0,
            next_ticket: 1,
            audit_seq: 0,
            audit_head: AUDIT_GENESIS,
        }
    }
}
