//! Balances and the buckets a job is funded from (SDD §3.9.1, §3.9.3).
//!
//! Escrow lives in clearing's own NEP-141 balances, never in a third contract, so a refund never
//! depends on anything else being live (SPEC §4.9.1). M1 builds the two paths E5.2 names: a
//! prefunded balance through `ft_transfer_call` with `Deposit`, and `withdraw_balance` back out.
//! The Intents path (`on_auth`, §3.9.3 path 3) and `Appraise` inside the transfer message are cut
//! from M1 (`tasks.md`, "What M1 cuts").

use marginal_core::audit::AuditKind;
use marginal_core::CoreError;
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{from_str, json};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise, PromiseError};

use crate::store::{self, holding, Table};
use crate::{fail, Clearing, ClearingExt};

/// Gas for the token's `ft_transfer` and for the callback that restores a failed withdrawal.
const FT_TRANSFER_GAS: Gas = Gas::from_tgas(15);
const ON_WITHDRAW_GAS: Gas = Gas::from_tgas(10);

/// The message a transfer carries. Only `Deposit` is accepted in M1; anything else is refused by
/// returning the whole amount, which NEP-141 gives back to the sender.
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
enum TransferMsg {
    Deposit { account: AccountId },
}

#[near]
impl Clearing {
    /// NEP-141 receiver. The predecessor is the token, and it must be allow-listed: an unknown
    /// token's units are worthless here, so they are sent straight back.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> near_sdk::json_types::U128 {
        let token = env::predecessor_account_id();
        if !self.tokens.contains(&token) {
            return amount;
        }
        let Ok(TransferMsg::Deposit { account }) = from_str::<TransferMsg>(&msg) else {
            return amount;
        };
        self.credit(Table::Balance, &account, &token, amount.0);
        self.emit(
            AuditKind::Claim,
            "deposit",
            0,
            json!({
                "account": account,
                "token": token,
                "amount": amount,
                "from": sender_id,
                "balance": U128(self.balance_of(&account, &token)),
            }),
        );
        U128(0)
    }

    /// Sends part of a balance back to its owner. Agent keys cannot call it (§3.21): a function-call
    /// key must not be able to move tokens out, whatever its method list says.
    #[payable]
    pub fn withdraw_balance(&mut self, token: AccountId, amount: U128) -> Promise {
        near_sdk::assert_one_yocto();
        let account = env::predecessor_account_id();
        self.require_not_agent(&account);
        self.debit(Table::Balance, &account, &token, amount.0);
        Promise::new(token.clone())
            .function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::to_vec(&json!({
                    "receiver_id": account,
                    "amount": amount,
                }))
                .expect("json"),
                NearToken::from_yoctonear(1),
                FT_TRANSFER_GAS,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(ON_WITHDRAW_GAS)
                    .on_withdraw(account, token, amount),
            )
    }

    /// The token call failed, so the balance goes back: a withdrawal never destroys value.
    #[private]
    pub fn on_withdraw(
        &mut self,
        account: AccountId,
        token: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let sent = result.is_ok();
        if !sent {
            self.credit(Table::Balance, &account, &token, amount.0);
        }
        self.emit(
            AuditKind::Claim,
            if sent {
                "withdrawal"
            } else {
                "withdrawal_failed"
            },
            0,
            json!({ "account": account, "token": token, "amount": amount, "sent": sent }),
        );
        sent
    }

    pub fn get_balance(&self, account: AccountId, token: AccountId) -> U128 {
        U128(self.balance_of(&account, &token))
    }

    /// What settlement owes this account and `claim` (E6.5) will pay out.
    pub fn get_claimable(&self, account: AccountId, token: AccountId) -> U128 {
        U128(store::get(Table::Claimable, &holding(&account, &token)).unwrap_or(0))
    }
}

impl Clearing {
    pub(crate) fn balance_of(&self, account: &AccountId, token: &AccountId) -> u128 {
        store::get(Table::Balance, &holding(account, token)).unwrap_or(0)
    }

    pub(crate) fn credit(
        &mut self,
        table: Table,
        account: &AccountId,
        token: &AccountId,
        amount: u128,
    ) {
        let id = holding(account, token);
        let held: u128 = store::get(table, &id).unwrap_or(0);
        let total = held
            .checked_add(amount)
            .unwrap_or_else(|| fail(CoreError::Arithmetic));
        store::put(table, &id, &total);
    }

    /// Takes `amount` from a holding, or refuses: value is never created by going negative.
    pub(crate) fn debit(
        &mut self,
        table: Table,
        account: &AccountId,
        token: &AccountId,
        amount: u128,
    ) {
        require!(amount > 0, "nothing to move");
        let id = holding(account, token);
        let held: u128 = store::get(table, &id).unwrap_or(0);
        let left = held
            .checked_sub(amount)
            .unwrap_or_else(|| fail(CoreError::BalanceLow));
        store::put(table, &id, &left);
    }
}
