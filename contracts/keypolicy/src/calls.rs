//! Cross-contract calls with only the function-call action.
//!
//! KeyPolicy must not be able to deploy code, add or delete a key, delete itself, stake or move
//! funds. `near_sdk::Promise` links every one of those actions into any module that uses it, so this
//! contract does not use it: it calls the host through `env` directly and the built wasm imports
//! only the function-call host functions. The sandbox tests check the module's imports, so the
//! immutability claim rests on what the code *cannot* do, not on what it does not.

use near_sdk::json_types::Base64VecU8;
use near_sdk::serde::Serialize;
use near_sdk::serde_json::to_vec;
use near_sdk::{env, AccountId, Gas, GasWeight, NearToken, PromiseIndex};

/// One function call: the method, its JSON arguments, and the gas it gets. `weight` shares out the
/// gas left over at the end of the transaction (0 gets none).
pub(crate) struct Call<'a> {
    pub method: &'a str,
    pub args: Vec<u8>,
    pub deposit: NearToken,
    pub gas: Gas,
    pub weight: u64,
}

impl<'a> Call<'a> {
    /// JSON arguments from any serialisable value.
    pub(crate) fn json(method: &'a str, args: &impl Serialize, gas: Gas, weight: u64) -> Self {
        Self {
            method,
            args: to_vec(args).expect("json encodes"),
            deposit: NearToken::from_yoctonear(0),
            gas,
            weight,
        }
    }

    /// A callback to this contract carrying one opaque argument.
    pub(crate) fn callback(method: &'a str, name: &str, bytes: Vec<u8>, gas: Gas) -> Self {
        Self::json(
            method,
            &near_sdk::serde_json::json!({ name: Base64VecU8(bytes) }),
            gas,
            0,
        )
    }

    fn add_to(&self, promise: PromiseIndex) -> PromiseIndex {
        env::promise_batch_action_function_call_weight(
            promise,
            self.method,
            &self.args,
            self.deposit,
            self.gas,
            GasWeight(self.weight),
        );
        promise
    }
}

/// Starts a call to `account`.
pub(crate) fn start(account: &AccountId, call: &Call) -> PromiseIndex {
    call.add_to(env::promise_batch_create(account))
}

/// Runs `call` on `account` once `after` has finished.
pub(crate) fn then(after: PromiseIndex, account: &AccountId, call: &Call) -> PromiseIndex {
    call.add_to(env::promise_batch_then(after, account))
}

/// Joins two calls so that a callback waits for both.
pub(crate) fn both(a: PromiseIndex, b: PromiseIndex) -> PromiseIndex {
    env::promise_and(&[a, b])
}

/// Makes the promise's result this call's result.
pub(crate) fn return_value(promise: PromiseIndex) {
    env::promise_return(promise)
}
