//! `musdc`: a testnet stand-in for USDC. NEP-141 with 6 decimals and NEP-145 storage
//! management. Only the faucet account can mint. Never deployed outside `sandbox`
//! and `testnet-demo` (SDD §1.5).
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::store::LazyOption;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

pub const DECIMALS: u8 = 6;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
    Metadata,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Musdc {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    faucet: AccountId,
}

#[near]
impl Musdc {
    #[init]
    pub fn new(faucet: AccountId) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Marginal test USDC".into(),
            symbol: "musdc".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        };
        Self {
            token: FungibleToken::new(StorageKey::Token),
            metadata: LazyOption::new(StorageKey::Metadata, Some(metadata)),
            faucet,
        }
    }

    /// Faucet only. Registers the receiver's storage if needed, paid from the contract's own
    /// balance, and emits a NEP-297 `ft_mint` event so wallets and explorers see the supply.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        let is_faucet = env::predecessor_account_id() == self.faucet;
        require!(is_faucet, "only the faucet can mint");
        require!(amount.0 > 0, "amount must be positive");
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("faucet"),
        }
        .emit();
    }

    pub fn faucet(&self) -> AccountId {
        self.faucet.clone()
    }
}

#[near]
impl FungibleTokenCore for Musdc {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Musdc {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.token
            .ft_resolve_transfer(sender_id, receiver_id, amount)
            .0
            .into()
    }
}

#[near]
impl StorageManagement for Musdc {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        match self.token.internal_storage_unregister(force) {
            Some((account_id, balance)) => {
                // A forced unregister burns the remaining balance: say so (NEP-297).
                if balance > 0 {
                    FtBurn {
                        owner_id: &account_id,
                        amount: U128(balance),
                        memo: Some("storage_unregister"),
                    }
                    .emit();
                }
                true
            }
            None => false,
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Musdc {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().clone().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, get_logs, VMContextBuilder};
    use near_sdk::{test_vm_config, testing_env, Gas, PromiseResult, RuntimeFeesConfig};

    const ONE_USDC: u128 = 1_000_000;
    const YOCTO: NearToken = NearToken::from_yoctonear(1);

    fn faucet() -> AccountId {
        accounts(1)
    }
    fn alice() -> AccountId {
        accounts(2)
    }
    fn bob() -> AccountId {
        accounts(3)
    }

    /// Run the next call as `caller`, attaching `deposit`.
    fn call_as(caller: AccountId, deposit: NearToken) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .predecessor_account_id(caller)
            .prepaid_gas(Gas::from_tgas(300))
            .attached_deposit(deposit);
        testing_env!(b.build());
    }

    fn token() -> Musdc {
        call_as(faucet(), NearToken::from_yoctonear(0));
        Musdc::new(faucet())
    }

    fn mint(t: &mut Musdc, to: &AccountId, amount: u128) {
        call_as(faucet(), NearToken::from_yoctonear(0));
        t.mint(to.clone(), U128(amount));
    }

    #[test]
    fn metadata_and_faucet() {
        let t = token();
        let m = t.ft_metadata();
        assert_eq!((m.decimals, m.symbol.as_str()), (DECIMALS, "musdc"));
        assert_eq!(m.spec, FT_METADATA_SPEC);
        assert_eq!(t.faucet(), faucet());
    }

    #[test]
    fn mint_registers_credits_and_emits_ft_mint() {
        let mut t = token();
        mint(&mut t, &alice(), 5 * ONE_USDC);
        assert_eq!(t.ft_balance_of(alice()), U128(5 * ONE_USDC));
        assert_eq!(t.ft_total_supply(), U128(5 * ONE_USDC));
        assert!(
            t.storage_balance_of(alice()).is_some(),
            "mint registers a new receiver"
        );
        let log = &get_logs()[0];
        assert!(log.starts_with("EVENT_JSON:"), "{log}");
        for part in ["\"nep141\"", "\"ft_mint\"", "\"5000000\"", "\"faucet\""] {
            assert!(log.contains(part), "{part} missing from {log}");
        }
    }

    #[test]
    fn a_second_mint_adds_to_the_balance() {
        let mut t = token();
        mint(&mut t, &alice(), ONE_USDC);
        mint(&mut t, &alice(), 2 * ONE_USDC);
        assert_eq!(t.ft_balance_of(alice()), U128(3 * ONE_USDC));
    }

    #[test]
    #[should_panic(expected = "only the faucet can mint")]
    fn only_the_faucet_can_mint() {
        let mut t = token();
        call_as(alice(), NearToken::from_yoctonear(0));
        t.mint(alice(), U128(ONE_USDC));
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn zero_mint_is_refused() {
        let mut t = token();
        mint(&mut t, &alice(), 0);
    }

    #[test]
    fn transfers_move_balances() {
        let mut t = token();
        mint(&mut t, &alice(), 10 * ONE_USDC);
        mint(&mut t, &bob(), ONE_USDC);
        call_as(alice(), YOCTO);
        t.ft_transfer(bob(), U128(4 * ONE_USDC), None);
        assert_eq!(t.ft_balance_of(alice()), U128(6 * ONE_USDC));
        assert_eq!(t.ft_balance_of(bob()), U128(5 * ONE_USDC));
        assert_eq!(t.ft_total_supply(), U128(11 * ONE_USDC));
    }

    #[test]
    fn transfer_call_starts_a_promise_and_resolves_the_unused_amount() {
        let mut t = token();
        mint(&mut t, &alice(), 10 * ONE_USDC);
        mint(&mut t, &bob(), ONE_USDC);
        call_as(alice(), YOCTO);
        let _promise = t.ft_transfer_call(bob(), U128(4 * ONE_USDC), None, "{}".into());
        // The tokens move first; the receiver's answer decides how much comes back.
        assert_eq!(t.ft_balance_of(alice()), U128(6 * ONE_USDC));
        assert_eq!(t.ft_balance_of(bob()), U128(5 * ONE_USDC));

        // The receiver kept 3 of the 4 and returned 1: the sender is refunded that 1.
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .predecessor_account_id(accounts(0));
        testing_env!(
            b.build(),
            test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Successful(b"\"1000000\"".to_vec())]
        );
        let used = t.ft_resolve_transfer(alice(), bob(), U128(4 * ONE_USDC));
        assert_eq!(used, U128(3 * ONE_USDC));
        assert_eq!(t.ft_balance_of(alice()), U128(7 * ONE_USDC));
        assert_eq!(t.ft_balance_of(bob()), U128(4 * ONE_USDC));
    }

    #[test]
    fn storage_deposit_registers_and_reports_bounds() {
        let mut t = token();
        let min = t.storage_balance_bounds().min;
        call_as(alice(), min);
        let sb = t.storage_deposit(None, Some(true));
        assert_eq!(sb.total, min);
        assert_eq!(t.storage_balance_of(alice()).unwrap().total, min);
        assert!(t.storage_balance_of(bob()).is_none());
    }

    #[test]
    fn storage_withdraw_returns_the_balance() {
        let mut t = token();
        let min = t.storage_balance_bounds().min;
        call_as(alice(), min);
        t.storage_deposit(None, Some(true));
        call_as(alice(), YOCTO);
        assert_eq!(t.storage_withdraw(None).total, min);
    }

    #[test]
    fn unregistering_an_unknown_account_is_a_no_op() {
        let mut t = token();
        call_as(alice(), YOCTO);
        assert!(!t.storage_unregister(None));
        assert!(get_logs().iter().all(|l| !l.contains("ft_burn")));
    }

    #[test]
    fn unregistering_an_empty_account_burns_nothing() {
        let mut t = token();
        let min = t.storage_balance_bounds().min;
        call_as(alice(), min);
        t.storage_deposit(None, Some(true));
        call_as(alice(), YOCTO);
        assert!(t.storage_unregister(None));
        assert!(t.storage_balance_of(alice()).is_none());
        assert!(
            get_logs().is_empty(),
            "nothing was burned, so nothing is logged"
        );
    }

    #[test]
    fn a_forced_unregister_burns_the_balance_and_says_so() {
        let mut t = token();
        mint(&mut t, &alice(), 7 * ONE_USDC);
        call_as(alice(), YOCTO);
        assert!(t.storage_unregister(Some(true)));
        assert_eq!(
            t.ft_total_supply(),
            U128(0),
            "the burned balance leaves the supply"
        );
        let burn = get_logs()
            .into_iter()
            .find(|l| l.contains("ft_burn"))
            .expect("an ft_burn event");
        assert!(
            burn.contains("\"7000000\"") && burn.contains("storage_unregister"),
            "{burn}"
        );
    }

    #[test]
    #[should_panic(expected = "positive balance")]
    fn an_unforced_unregister_with_a_balance_is_refused() {
        let mut t = token();
        mint(&mut t, &alice(), ONE_USDC);
        call_as(alice(), YOCTO);
        t.storage_unregister(None);
    }
}
