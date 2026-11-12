# OI-6 (NEAR Intents mechanics) and OI-12 (settlement stablecoins and issuer risk)

*Prepared 2026-11-12 for SDD.md §11 (OI-6, OI-12), §3.9, §2.6 and §3.25. This was research only. Nothing was built, deployed, signed, signed up for or paid for. The only chain calls were read-only NEAR JSON-RPC view calls, made without an account. Prior notes (`spec-notes/near-primitives.md` A2, A8, B2 and `spec-notes/regulatory.md` §8) are taken as settled and are not repeated here, except where this file corrects or extends them.*

**Source labels.**
- **PRIMARY**: source code at a pinned commit, an on-chain view call, the official docs, the OpenAPI spec, an issuer page, or a regulator's text.
- **SECONDARY**: press, law-firm notes, or aggregators.
- **UNVERIFIED**: the claim came only from a search snippet, or could not be checked.
- **DERIVED**: my own inference from PRIMARY facts.

**Pinned code.**
- `near/intents` was cloned at `main` = `fce0936b1699e0591204ce152a78afc1c1338b35` (2026-11-10).
- The **deployed** `intents.near` reports `version 0.4.5` and source `16d04f6ec4401263f8914638710260da50bb46b0` (2026-10-07, "fix(verifier): remove notifications on deposits (#374)"). This comes from the RPC call `contract_source_metadata` at block 224108439.
- `git diff 16d04f6..main -- contracts/defuse` touches only 6 files: `cached.rs`, `lock.rs`, `public_key.rs`, two account-entry files, and `versioned/mod.rs`. None of the files quoted below changed, so **the excerpts match the deployed code.**
- `defuse-protocol/sdk-monorepo` was cloned at `5bbdc78ad3d1b98938b6acff71eee8cf8443af2c` (2026-11-10).

---

## 0. Answers at a glance

| # | Question | Answer | Status |
|---|---|---|---|
| 6.1 | `FtWithdraw` with `msg` → `ft_transfer_call`? | **Yes.** With `msg: Some(_)` the verifier calls `token.ft_transfer_call(receiver_id, amount, memo, msg)`. Our `ft_on_transfer` sees **`sender_id = "intents.near"`**, not the signer. If our method returns an unused amount or panics, the unused part goes back to the **signer's verifier balance** (memo `"refund"`). If the `ft_transfer_call` promise itself fails, for example because our contract has no storage registration on the token, the user gets **no refund**. | Resolved (code) |
| 6.2 | Deposit for another account | `token.ft_transfer_call("intents.near", amount, memo, msg)` where `msg` is either a bare account ID (`"0xabc…"`) or JSON `{"receiver_id": "...", "execute_intents": [...], "refund_if_fails": bool}`. The verifier's `ft_on_transfer` is `#[pause]`, so while it is paused the deposit bounces back to us. | Resolved (code) |
| 6.3 | `AuthCall` | `{contract_id, msg, attached_deposit (wNEAR, not refunded on failure), min_gas (default 10 TGas)}` leads to `contract_id.on_auth(signer_id, msg) -> PromiseOrValue<()>`, with predecessor `intents.near`. The callee "MUST whitelist allowed callers". | Resolved (code) |
| 6.4 | Signing standards | 7: `nep413`, `erc191`, `tip191`, `raw_ed25519`, `webauthn` (ed25519 or P-256), `ton_connect`, `sep53`. EVM wallets get the implicit account `0x` + lowercase hex(keccak256(pk)[12..]), with no registration. | Resolved (code) |
| 6.5 | Cross-chain withdrawals | It depends on the bridge. POA uses `ft_withdraw{receiver_id = token, memo "WITHDRAW_TO:<addr>[:<xrp memo>]"}`. Omni uses `ft_withdraw{receiver_id "omni.bridge.near", msg JSON{recipient "<chain>:<addr>", fee, native_token_fee, external_id}}` plus a `storage_deposit` intent. HOT uses `mt_withdraw` built by the HOT SDK. **Solana USDC (`sol-5ce3…omft.near`) has moved from POA to Omni.** Clearing escrows *native NEAR* USDC, so any cross-chain payout is a **swap** (1Click), not a withdrawal. | Partially resolved |
| 6.6 | 1Click | Endpoints, enums and fees confirmed from the OpenAPI spec v0.1.10. The partner key is a JWT sent as `X-API-Key`. Unauthenticated calls pay +25 bps. Authenticated calls pay 20 bps, or 1 bp on stablecoin pairs. `insured` adds +2 bps. No numeric rate limits are published. The ToS (2026-10-07) has clauses that bear on our design: 4.1(e), (f), (g), (h). | Partially resolved |
| 6.7 | Admin, pause, incident | DAO `intents.sputnik-dao.near` (3-of-5 council, no timelock) can upgrade, force-withdraw any balance, and make arbitrary calls (`admin_call`). Six implicit accounts plus `pm.bridge.near` can pause. Two accounts can lock any account. The 2026-10-01 bug was in the verifier's deposit-notification path. It was fixed in v0.4.3–0.4.5, and the funds were returned (SECONDARY). Confidential Intents has been B2B-live since 2026-07-13, and all 1Click swaps have settled confidentially since 2026-10-27. | Resolved / Secondary |
| 12.1 | Stablecoins on NEAR | **USDC** (Circle native) `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`: 6 dp, supply 78,831,552.502947. **USDt** `usdt.tether-token.near`: 6 dp, 525,944,120.793709 issued, of which 489,044,182.148 is Tether's "reserve balance" (about 36.9M net, DERIVED). No native PYUSD, RLUSD, USDe or USD1 found. Both contracts have freeze and pause powers and can be upgraded. Circle's account also has a raw full-access key. | Resolved |
| 12.2 | CCTP on NEAR | **No.** NEAR is not among Circle's CCTP domains. Circle Mint does support NEAR USDC (chain code `NEAR`). | Resolved |
| 12.3 | Regulation | USDC: MiCA EMT via Circle Internet Financial Europe SAS (ACPR, 2024-07-01). USDT: not MiCA-authorised. **ESMA Opinion of 2026-10-08** says CASPs should provide *no* services in non-compliant EMTs, custody and transfer included, with legacy positions remediated within 3 months. GENIUS Act takes effect **2027-01-18** (the OCC final rule of 2026-10-21 has the same date). The DASP offer/sale restriction starts **2028-07-18**. | Partially resolved (counsel) |
| 12.4 | Issuer-risk precedents | USDC fell to about $0.88 in the 2023-03 SVB episode. Circle blocklisted Tornado Cash addresses (2022), and on **2026-05-30** blocklisted a pooled contract (Zama cUSDC, 12.6M USDC locked by court order). This is a direct analogue of a pooled escrow. | Resolved (SECONDARY) |

---

## 1. OI-6: NEAR Intents verifier (`intents.near`, "defuse")

### 1.1 The `Intent` enum (deployed v0.4.5)

`contracts/defuse/core/src/intents/mod.rs`:

```rust
#[serde(tag = "intent", rename_all = "snake_case")]
pub enum Intent {
    AddPublicKey(AddPublicKey),
    RemovePublicKey(RemovePublicKey),
    Transfer(Transfer),
    FtWithdraw(FtWithdraw),
    NftWithdraw(NftWithdraw),
    MtWithdraw(MtWithdraw),
    NativeWithdraw(NativeWithdraw),
    StorageDeposit(StorageDeposit),
    TokenDiff(TokenDiff),
    SetAuthByPredecessorId(SetAuthByPredecessorId),
    AuthCall(AuthCall),
    #[cfg(feature = "imt")] ImtMint(ImtMint),
    #[cfg(feature = "imt")] ImtBurn(ImtBurn),
}
```

- `DefuseIntents` has this doc comment: "WARNING: Promises created by different intents are executed concurrently and does not rely on the order of the intents in this structure."
- The mainnet build command in `contract_source_metadata` is `cargo near build … --features=contract`, so **`imt` is off on mainnet**. `ImtMint` and `ImtBurn` exist only on FAR, where `far = ["imt"]` in `contracts/defuse/Cargo.toml` (PRIMARY).
- `Transfer` now has an optional notification (`msg`, `min_gas`). That calls `receiver.mt_on_transfer(sender_id = signer, previous_owner_ids, token_ids, amounts, msg)` (CHANGELOG 0.3.1; `nep245/core.rs::notify_on_transfer`).
- **Protocol fee.** In code, fees are taken only in `TokenDiff` ("take fees only from negative deltas"). The live fee is `fee() = 1` pip, which is 0.0001%. No fee code exists in `Transfer`, `FtWithdraw` or the other token intents. The docs page "Fees" says the fee "applies to every transfer, swap, or transaction". **The code contradicts this** (PRIMARY code beats docs).

### 1.2 `FtWithdraw`: fields and `msg` semantics

`contracts/defuse/core/src/intents/tokens.rs` (identical at the deployed commit, checked with `git show 16d04f6:…`):

```rust
pub struct FtWithdraw {
    pub token: AccountId,
    pub receiver_id: AccountId,
    #[serde_as(as = "DisplayFromStr")] pub amount: u128,
    pub memo: Option<String>,
    /// Message to pass to `ft_transfer_call`. Otherwise, `ft_transfer` will be used.
    /// NOTE: No refund will be made in case of insufficient `storage_deposit`
    /// on `token` for `receiver_id`
    pub msg: Option<String>,
    /// Optionally make `storage_deposit` for `receiver_id` on `token`.
    /// The amount will be subtracted from user's NEP-141 `wNEAR` balance.
    /// NOTE: the `wNEAR` will not be refunded in case of fail
    pub storage_deposit: Option<NearToken>,
    /// * `ft_transfer`:      minimum: 15TGas, default: 15TGas
    /// * `ft_transfer_call`: minimum: 30TGas, default: 50TGas
    pub min_gas: Option<Gas>,
}
```

- In JSON the token is **unprefixed** (`"token": "17208628…"`). The `nep141:` prefix is used only in `transfer` and `token_diff` (docs, withdrawals page).
- `is_call()` returns `self.msg.is_some()`. An empty string `""` therefore still means `ft_transfer_call`.

**Execution path.** From `contracts/defuse/src/contract/tokens/nep141/withdraw.rs`:

```rust
// internal_ft_withdraw: burn the signer's internal balance, then
let p = ext_ft_core::ext_on(p)
    .with_attached_deposit(NearToken::from_yoctonear(1))
    .with_static_gas(min_gas)
    .with_unused_gas_weight(1);
if let Some(msg) = withdraw.msg {
    p.ft_transfer_call(withdraw.receiver_id, withdraw.amount.into(), withdraw.memo, msg)
} else {
    p.ft_transfer(withdraw.receiver_id, withdraw.amount.into(), withdraw.memo)
}
// .then(ft_resolve_withdraw(token, owner_id, amount, is_call)) with 15 TGas
```

```rust
fn ft_resolve_withdraw(&mut self, token, sender_id, amount, is_call) -> U128 {
    let used = if is_call {
        // `ft_transfer_call` returns successfully transferred amount
        match promise_result_checked_json::<U128>(0) {
            Ok(Ok(used)) => used.0.min(amount.0),
            Ok(Err(_deserialize_err)) => 0,
            // do not refund on failed `ft_transfer_call` due to
            // NEP-141 vulnerability: `ft_resolve_transfer` fails to
            // read result of `ft_on_transfer` due to insufficient gas
            Err(_) => amount.0,
        }
    } else {
        if promise_result_checked_void(0).is_ok() { amount.0 } else { 0 }
    };
    let refund = amount.0.saturating_sub(used);
    if refund > 0 {
        self.deposit(sender_id, [(Nep141TokenId::new(token).into(), refund)], Some(REFUND_MEMO))…
    }
    U128(used)
}
```

**What reaches Marginal and where unused tokens go.** This is DERIVED from the code above plus standard NEP-141 `ft_transfer_call` and `ft_resolve_transfer` behaviour.
1. The token moves `amount` from `intents.near` to `clearing`. It then calls `clearing.ft_on_transfer(sender_id = "intents.near", amount, msg)`. **The signer's identity is not passed.** The `memo` is whatever the signer wrote.
2. If `ft_on_transfer` returns `U128(x)`, or **panics** (the standard treats a failed receiver call as "all unused"), the token's `ft_resolve_transfer` moves `x` back to `intents.near`. It then returns `used = amount − x`.
3. The verifier's `ft_resolve_withdraw` credits `refund = amount − used` to the **signer's own verifier balance**, emitting an `mt_mint` event with memo `"refund"`.
4. **No-refund cases** (the outer `ft_transfer_call` promise fails):
   - `clearing` is not storage-registered on the token;
   - the token is paused, or `clearing` / `intents.near` is blocklisted;
   - the token runs out of gas in `ft_resolve_transfer`.

   In each case the verifier has already burned the user's internal balance and **does not refund**. The tokens stay in `intents.near`'s token balance without being credited to anyone. The docs say the same thing in general terms: "Any string value (including `""`) → `ft_transfer_call` → Refund on Failure? ❌" (withdrawals page, PRIMARY).
5. **Consequences for the design.**
   - Clearing must be `storage_deposit`-registered on every allow-listed token **before** it advertises the Intents path.
   - The client must run `simulate_intents` first.
   - Business-logic rejections in our `ft_on_transfer` should **return the full amount** rather than panic. Both are refunded, but returning is cheaper and explicit.
   - USDC on NEAR is a Circle "FiatToken" built on `near-sdk-contract-tools 1.1.0` (from the wasm strings), not `near-contract-standards`. Its exact gas split for `ft_transfer_call` is **unknown** and needs a mainnet spike.

**Auth by predecessor.** `ft_withdraw` called *directly* (not as an intent) is `#[pause] #[payable]`, does `assert_one_yocto()`, and takes the owner from `ensure_auth_predecessor_id()`. So clearing could own and withdraw its own Intents balance (this was in prior notes; re-confirmed).

### 1.3 Depositing into the verifier for another account (refunds and `IntentsAccount` payouts)

`contracts/defuse/src/contract/tokens/nep141/deposit.rs` and `src/tokens/mod.rs`:

```rust
#[pause]
fn ft_on_transfer(&mut self, sender_id, amount, msg) -> PromiseOrValue<U128> {
    require!(amount.0 > 0, "zero amount");
    let DepositMessage { receiver_id, action } = if msg.is_empty() {
        DepositMessage::new(sender_id)
    } else {
        msg.parse().unwrap_or_else(|e| panic!("{e}"))
    };
    self.deposit(receiver_id, [(token_id, amount.0)], Some("deposit"))…;
    match action { None => 0, Some(DepositAction::Execute(execute)) => {
        if execute.refund_if_fails { self.execute_intents(...) } else { ext_intents::…detach() }
        0 } }
}
pub struct DepositMessage { pub receiver_id: AccountId, #[serde(flatten)] pub action: Option<DepositAction> }
// FromStr: if s.starts_with('{') => JSON, else => AccountId
pub enum DepositAction { Execute(ExecuteIntents) /*, Notify(NotifyOnTransfer) — commented out in #374 */ }
pub struct ExecuteIntents { pub execute_intents: Vec<MultiPayload>, #[serde(default)] pub refund_if_fails: bool }
```

- **Call:** `token.ft_transfer_call(receiver_id = "intents.near", amount, memo = "marginal:<settlement_id>", msg = "<recipient intents account>")`, with 1 yoctoNEAR attached. The docs suggest 100 TGas for a simple deposit.
- The recipient does **not** need to exist beforehand. `deposit()` calls `accounts.get_or_create(owner_id)` ("deposits are allowed for locked accounts").
- If the verifier is paused (`#[pause]`), `msg` cannot be parsed, or the amount is 0, the receiver panics. The token then refunds the full amount to clearing, and `ft_transfer_call` returns `used = 0`. Clearing's callback must check that **`used == amount`**, and otherwise move the remainder to claimable.
- Deposit `Notify` was **removed** in #374 (2026-10-07), which is the incident fix (§1.7). Do not rely on it.

### 1.4 `AuthCall`

`contracts/defuse/core/src/intents/auth.rs`, `src/contract/intents/auth_call.rs`, `crates/near/auth-call/src/lib.rs`:

```rust
/// Call `contract_id::on_auth(signer_id, msg)` with `signer_id` of intent.
pub struct AuthCall {
    pub contract_id: AccountId,
    pub msg: String,
    /// Optionally, attach deposit to `on_auth()` call. The amount will be subtracted from
    /// user's NEP-141 `wNEAR` balance. NOTE: the `wNEAR` will not be refunded in case of fail.
    #[serde(default, skip_serializing_if = "NearToken::is_zero")] pub attached_deposit: NearToken,
    pub min_gas: Option<Gas>,   // MIN_GAS_DEFAULT = 10 TGas
}
#[ext_contract(ext_auth_callee)]
pub trait AuthCallee {
    /// Verification of `signer_id` is done by the predecessor_id,
    /// so the implementation MUST whitelist allowed callers.
    /// NOTE: implementations are recommended to be `#[payable]`
    fn on_auth(&mut self, signer_id: AccountId, msg: String) -> PromiseOrValue<()>;
}
```

- With zero deposit, the verifier calls `do_auth_call` straight away as a promise from `intents.near`.
- With a deposit, it first unwraps wNEAR (`near_withdraw`) and then calls.
- **`on_auth` is the only verifier primitive that gives clearing an authenticated `signer_id`** together with a payload.
- The SDD's stance ("never relies on an attached deposit") is right, because the deposit is in NEAR, not in the stablecoin.

### 1.5 Signing standards and accounts for EVM or Solana users

`contracts/defuse/core/src/payload/multi.rs`:

```rust
#[serde(tag = "standard", rename_all = "snake_case")]
pub enum MultiPayload {
    Nep413(..), Erc191(..), Tip191(..), RawEd25519(..),
    #[serde(rename = "webauthn")] WebAuthn(..),   // ed25519 or P-256
    TonConnect(..), Sep53(..),
}
```

The 1Click docs list the same seven: `nep413`, `erc191`, `raw_ed25519`, `webauthn`, `ton_connect`, `sep53`, `tip191`. **EIP-712 is not supported.**

**Signed message envelope** (`payload/mod.rs`): `DefusePayload { signer_id, verifying_contract, deadline, nonce (base64), ...intents }`. Since v0.3.0, nonces are versioned, salted and expirable ("Expirable nonces … Salted nonces", CHANGELOG). **Build them with the Intents SDK.**

**Implicit accounts** (`public_key.rs::to_implicit_account_id`):

| Key | Intents account ID | Typical wallets |
|---|---|---|
| Ed25519 | `hex(pk)`, 64 lowercase hex (**not** the base58 Solana address) | Solana (Phantom `raw_ed25519`), TON, Stellar, NEAR implicit |
| secp256k1 | `"0x" + hex(keccak256(pk)[12..32])`, **lowercase** | EVM (`erc191`), Tron (`tip191`), Cosmos |
| P-256 (passkey) | `"0x" + hex(keccak256("p256" ‖ pk)[12..32])` | WebAuthn |

- Implicit accounts need **no registration**. The docs say "Implicit accounts skip this step".
- Named accounts must call `intents.near.add_public_key`.
- The docs example shows a checksummed mixed-case EVM address. NEAR account IDs must be lowercase, so **the UI must lowercase it**.
- The docs warn: "It's not feasible to differentiate these addresses by chain".

### 1.6 Cross-chain withdrawals, token IDs and fees

**Bridge-specific withdrawal shapes** (PRIMARY: `sdk-monorepo/packages/intents-sdk/src/bridges/*` and `near/intents/contracts/poa/token/src/contract.rs`):

| Bridge | Intent(s) | Refundable? | Source |
|---|---|---|---|
| **POA** (`*.omft.near`) | `ft_withdraw{token: T, receiver_id: T (the token itself), amount, memo: "WITHDRAW_TO:<addr>[:<xrp memo>]", min_gas: "17050000000000"}`. The POA token's `ft_transfer` treats `receiver_id == self && memo.starts_with("WITHDRAW_TO:")` as a **burn**, emitting an `FtBurn` event that the bridge watches. A `bitcoincash:` prefix is stripped. | Yes (no `msg`) | `poa-bridge-utils.ts`; `poa/token/src/contract.rs` L95–107; `WITHDRAW_MEMO_PREFIX = "WITHDRAW_TO:"` |
| **Omni** (`omni.bridge.near`; `*.omdep.near`, and some legacy `omft` tokens) | Optional `storage_deposit{contract_id: "omni.bridge.near", deposit_for_account_id: <derived>, amount: nativeFee}`, then `ft_withdraw{token: T, receiver_id: "omni.bridge.near", amount, storage_deposit?, msg: JSON{"recipient":"<chain>:<addr>","fee":"0","native_token_fee":"<n>","external_id":"<uuid>", "msg"?}, min_gas}`. UTXO chains add `{"MaxGasFee": …}`. | **No** (`msg` → `ft_transfer_call`) | `omni-bridge-utils.ts`, `omni-withdraw-params.ts` |
| **HOT** (`nep245:v2_1.omni.hot.tg:*`) | `mt_withdraw` produced by `hotSdk.buildGaslessWithdrawIntent({feeToken: "native", …})` | — | `hot-bridge.ts` L240–265 |
| **Direct** (NEAR) | `ft_withdraw{receiver_id: <near account>, msg?}` or `native_withdraw` | Only without `msg` | `direct-bridge-utils.ts` |

- **Solana USDC changed bridge.** `POA_TOKENS_MIGRATED_TO_OMNI_BRIDGE` contains `"sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near": ChainKind.Sol, // USDC` and the Solana USDT `sol-c800…`. The SDK therefore withdraws Solana USDC through **Omni** (`omni.bridge.near` + JSON `msg`), **not** `WITHDRAW_TO:`. The `defuse-frontend` example that uses `WITHDRAW_TO:` for `sol-c800…` predates the migration.
- **Bridge assignments changed again on 2026-11-09.** BNB, Polygon and Avalanche tokens moved from HOT `nep245` IDs to Omni `nep141:*.omdep.near` IDs (docs changelog). **Do not hard-code bridge assignments.** Resolve them at run time with the SDK or 1Click.

**Stablecoin asset IDs** (PRIMARY: `GET https://1click.chaindefuser.com/v0/tokens`, fetched 2026-11-12, 229 tokens):

| Chain | Symbol | Intents asset ID | dp | Native contract |
|---|---|---|---|---|
| NEAR | USDC | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 | (native) |
| NEAR | USDT | `nep141:usdt.tether-token.near` | 6 | (native) |
| Solana | USDC | `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near` | 6 | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Solana | USDT | `nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near` | 6 | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| Ethereum | USDC | `nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near` | 6 | `0xa0b8…eb48` |
| Ethereum | USDT | `nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near` | 6 | `0xdac1…1ec7` |
| Base | USDC | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` | 6 | `0x8335…2913` |
| Arbitrum | USDC | `nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near` | 6 | `0xaf88…5831` |
| Polygon | USDC | `nep141:pol-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359.omdep.near` | 6 | |
| Avalanche | USDC | `nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omdep.near` | 6 | |
| BNB | USDC | `nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omdep.near` | **18** | |
| Optimism | USDC | `nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ` | 6 | |
| Stellar | USDC | `nep245:v2_1.omni.hot.tg:1100_111bzQBB65GxAPAVoxqmMcgYo5oS3txhqs1Uh1cgahKQUeTUq1TJu` | **7** | |
| Tron | USDT | `nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near` | 6 | `TR7NHq…jLj6t` |

**Fees** (PRIMARY: docs "Fees" and the OpenAPI spec):
- Verifier: 1 pip, on `token_diff` only (§1.1).
- Bridges:
  - POA: a relayer fee from the POA estimate API, added to the amount.
  - Omni: `native_token_fee`, paid as a wNEAR storage deposit, plus `storage_deposit`.
  - A 0.1% withdrawal fee applies to NEAR, ZEC and STRK withdrawn to Solana.
- 1Click: see §1.8.

**Completion reporting.** Nothing is reported back on-chain to NEAR. The POA, Omni and HOT relayers each have their own status APIs. 1Click `GET /v0/status` returns `status ∈ {KNOWN_DEPOSIT_TX, PENDING_DEPOSIT, INCOMPLETE_DEPOSIT, PROCESSING, SUCCESS, REFUNDED, FAILED}` and `swapDetails.{originChainTxHashes, destinationChainTxHashes, nearTxHashes, refundedAmount, refundReason}`. Since 2026-10-27 `nearTxHashes` has the shield and unshield hashes, not the swap hash (changelog).

**DERIVED key point.** Clearing escrows *native NEAR USDC*, and Circle has no CCTP domain for NEAR (§2.2). Paying a seller USDC on Solana is therefore a **swap** from `nep141:17208628…` to `nep141:sol-5ce3…omft.near` followed by an Omni withdrawal. That needs a solver, which means 1Click. **There is no withdrawal memo for native NEAR USDC to another chain.** `PayoutRoute::IntentsWithdraw` as specified in the SDD cannot be done by clearing alone.

### 1.7 Verifier admin powers, upgradeability, pause, and the 2026-10-01 incident

**Roles** (`contracts/defuse/src/contract/mod.rs`): `DAO, FeesManager, RelayerKeysManager, UnrestrictedWithdrawer, PauseManager, Upgrader, UnpauseManager, UnrestrictedAccountLocker, UnrestrictedAccountUnlocker, SaltManager, GarbageCollector, UnrestrictedAccountManager`. The contract is `#[pausable(pause_roles(DAO, PauseManager), unpause_roles(DAO, UnpauseManager))]`.

**On-chain grants** (RPC `acl_get_super_admins` / `acl_get_grantees`, 2026-11-12, about block 224107264):

| Role | Grantees |
|---|---|
| super admins | `intents.sputnik-dao.near`, `intents.near` |
| DAO | `intents.sputnik-dao.near` |
| Upgrader | `ctl-intents.near`. This is an `aurora-controller-factory` v0.3.3 contract with no access keys; its super admins are itself and `intents.sputnik-dao.near` |
| PauseManager | 6 implicit accounts plus `pm.bridge.near` |
| UnpauseManager | none (so only the DAO can unpause) |
| UnrestrictedAccountLocker | 2 implicit accounts |
| UnrestrictedWithdrawer, UnrestrictedAccountManager | none |

- **`intents.sputnik-dao.near` policy** (`get_policy`): the `council` has 5 members, `threshold 3` for `call`, `transfer` and `upgrade_self`, and `proposal_period` is 7 days. That is a voting window, not a timelock.
- **`intents.near` access keys:** 9 function-call keys limited to `execute_intents`, which are relayers. There are no full-access keys.

**Powers in code:**
- `upgrade(code)` (DAO or Upgrader) deploys new code.
- `ft_force_withdraw(owner_id, token, receiver_id, amount, memo, msg)` (DAO or UnrestrictedWithdrawer) **moves any user's balance**.
- `admin_call(promises)` (DAO) makes arbitrary function calls and transfers from `intents.near`.
- `force_lock_account` / `force_unlock_account`: a locked account cannot withdraw but still receives deposits.
- `force_disable_auth_by_predecessor_ids`.
- Pausable methods include `execute_intents` (`#[pause(name="intents")]`), `ft_on_transfer` (deposits), `ft_withdraw`, and others.
- `pa_all_paused()` returned `null` (nothing paused) at block 224108441.
- `execute_intents` has no access control. Anyone can submit signed intents, and `simulate_intents` is a view.

**Incident of 2026-10-01** (SECONDARY unless marked):
- The Block (2026-10-01) reported about $3.8M lost. The early attribution was "a bug in how its Omni deposit and withdrawal infrastructure interacted with the NEAR Intents smart contract".
- The post-mortem was posted by Alex Shevchenko on X on **2026-10-16**. I did not fetch it (X), so I relied on summaries: thecoding.substack.com, cryptotimes.io (2026-10-17) and shattered.io. They say the root cause was **in the verifier**. `ft_on_transfer` credited the deposit and then fired a `Notify` call to an attacker-chosen contract. When that call failed, the token was refunded but the ledger credit stayed. The attacker withdrew through Omni.
- Fixes in git history (PRIMARY):
  - `b9e1a6a` "disable state init" (#361)
  - `0c1a530` "reproduce bug" (#362)
  - `23462a1` (#363)
  - `b8bcf7d` "limit number of batch tokens" (#364)
  - **v0.4.3** `cbe714b` (2026-10-01)
  - `a202824` (#367)
  - **v0.4.4** `a2dd140` (2026-10-02)
  - **v0.4.5** `16d04f6` "remove notifications on deposits" (#374, 2026-10-07; PR body: "Notification-based deposit handling has been removed … Increased gas allocations for … withdrawal resolution")
- Secondary reports say there is now a solvency monitor that compares internal balances with token balances and auto-pauses. I found **no on-chain invariant in the verifier code**, so this is presumably an off-chain monitor that uses the PauseManager keys (DERIVED). Funds were reported returned on about 2026-10-02 (SECONDARY). The bug bounty is reported on HackenProof, up to $300k (SECONDARY).

**Confidential Intents / FAR** (PRIMARY docs):
- B2B launch on **2026-07-13**.
- FAR is "a permissioned instance of the NEAR protocol operated by a small validator set with no public networking". Funds are shielded and unshielded through the Private PoA Bridge against a Treasury account on NEAR. Assets are `imt:<treasury>:nep141:<token>`.
- Solver access on the private relay is **allowlisted** ("Contact the Defuse team").
- The 1Click quote takes `confidentiality: public|basic|advanced` and `depositType`/`recipientType`/`refundType = CONFIDENTIAL_INTENTS`. Reading balances needs a User-Session token from `/v0/auth/authenticate`.
- **From 2026-10-27 every 1Click swap settles confidentially** on the NEAR Private Shard, with no API change.
- So partner access for integrators is a **1Click partner key** (Partner Dashboard), not a bespoke partnership. Market makers still need allowlisting.
- I still found nothing saying a public NEAR contract can hold FAR/IMT balances, and the mainnet verifier is built without `imt`.

### 1.8 1Click API (OpenAPI v0.1.10, `https://1click.chaindefuser.com`)

**Endpoints:**
- `POST /v0/auth/authenticate`, `POST /v0/auth/refresh` (User-Session)
- `GET /v0/account/balances`, `GET /v0/account/history`
- `GET /v0/tokens`
- `POST /v0/quote`
- `GET /v0/status?depositAddress=&depositMemo=`
- `GET /v0/any-input/withdrawals`
- `POST /v0/deposit/submit`
- `POST /v0/generate-intent`, `POST /v0/submit-intent`
- `POST|GET /v0/orders`, `GET /v0/orders/{id}`, `POST /v0/orders/{id}/cancel`

**`QuoteRequest`** has 12 required fields: `dry, swapType, slippageTolerance (bps), originAsset, depositType, destinationAsset, amount (base units string), refundTo, refundType, recipient, recipientType, deadline (ISO)`. Enums:
- `swapType`: `EXACT_INPUT | EXACT_OUTPUT | FLEX_INPUT | ANY_INPUT` (ANY_INPUT is for authorised partners only)
- `depositType`: `ORIGIN_CHAIN | INTENTS | CONFIDENTIAL_INTENTS`
- `refundType`: `ORIGIN_CHAIN | INTENTS | CONFIDENTIAL_INTENTS`
- `recipientType`: `DESTINATION_CHAIN | INTENTS | CONFIDENTIAL_INTENTS`
- `depositMode`: `SIMPLE | MEMO`
- `confidentiality`: `public | basic | advanced`

Optional fields: `appFees[{recipient, fee}]`, `referral`, `rebates`, `quoteWaitingTimeMs`, `virtualChainRecipient`, `sessionId`, `connectedWallets`, and:
- **`insured`**: "an additional 0.02% (2 basis points) insurance fee is charged on top of any other fees."
- **`customRecipientMsg`**: "**HIGHLY EXPERIMENTAL** Message to pass to `ft_transfer_call` when withdrawing assets to NEAR … **WARNING**: Funds will be lost if used with non NEP-141 tokens, in case of insufficient `storage_deposit` or if the recipient does not implement `ft_on_transfer`." In principle this lets a quote deliver straight into `clearing.ft_on_transfer`. However, any amount our contract bounces would go back to 1Click's internal deposit account, and what happens to it then is undocumented. **Do not use it in v1.**

**Dry quotes:** `dry: true` omits `depositAddress`, `timeWhenInactive` and `deadline`.

**Quote signatures.** These are "Base58-encoded SHA-256 hash of a deterministic JSON object" (`stringify({...quoteRequest, ...quoteResponse, timestamp})`). Verify them with `verifyQuoteSignature()` from `@defuse-protocol/one-click-sdk-typescript` ≥ 0.1.24. The docs do not state the key or algorithm.

**Auth and fees** (docs "API Keys" and "Fees"):
- The partner key is a **JWT** from `partners.near-intents.org`, sent as `X-API-Key`. `Authorization: Bearer` is also accepted; the docs call JWT-auth "legacy".
- Without a key there is **+25 bps** on every non-`ANY_INPUT` quote.
- With a key and no `appFees`: **20 bps**, or **1 bp for stablecoin pairs (USDC, USDT, DAI) and same-asset multichain routes**.
- With `appFees`, the fee is split 50/50, and 1Click keeps at least 20 bps (or 1 bp).
- A quote-improvement fee splits 50/50 any execution better than the quote, while the quote is fresh (about 30 minutes).
- `generate-intent` and `submit-intent` need the partner key.

**Swap limits:** `ORIGIN_CHAIN`→`DESTINATION_CHAIN` minimums are $1,000 on BNB and $100 on Tron. They do not apply to deposits into Intents or withdrawals out of it.

**Rate limits:** no numbers are published. The OpenAPI lists `429 rate-limit-exceeded` on the orders endpoints, and ToS §2.8 reserves the right to set and enforce limits.

**ToS** ("1ClickSwap API Terms of Use", **Last Updated 2026-10-07**). The counterparty is **Intents Technology Limited (BVI)**. Accepting happens "by clicking to accept, generating an API key, registering … or accessing or otherwise using the API". Clauses that matter to Marginal:
- **4.1(a)**: no exposing the API to third parties "as a standalone API service, proxy, wrapper, or gateway".
- **4.1(e)**: "not cache, store, or archive API data for more than twenty-four (24) hours, except for static transaction records strictly required for displaying transaction history to End-Users". This **conflicts with HDP's "recorded 1Click dry quote"** in the settlement record. Store a hash and summary, or get counsel's view.
- **4.1(f)–(g)**: the developer carries out KYC/KYB/AML and sanctions screening of end users.
- **4.1(h)**: "ensures every Transaction contains the verifiable, unmasked public wallet address of the originating End-User, and shall not direct traffic through a proxy, mixer, tumbler, or intermediary wallet address that obfuscates the ultimate originator". This bears on (i) **clearing-originated payouts through 1Click**, where clearing is an intermediary, and (ii) **v2 fresh per-job funding accounts**.
- **4.2**: end-user flow-down terms.
- **9**: restricted persons and jurisdictions.
- **10.5**: transactions or assets may be blocked or restricted for compliance.
- **18**: arbitration.

---

## 2. OI-12: settlement stablecoin(s) and issuer risk

### 2.1 Stablecoins on NEAR (on-chain, RPC view calls, block about 224108442, 2026-11-12)

| Token | Account | Issuer listing | dp | `ft_total_supply` | Held by `intents.near` | Powers (exported methods / state) |
|---|---|---|---|---|---|---|
| **USDC** (Circle native) | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | Circle "USDC contract addresses" table: `NEAR` row (PRIMARY). Testnet: `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` | 6 | **78,831,552.502947** | 2,968,768.18 | `blocklist`, `unblocklist`, `is_blocklisted`, `blocklister` (one account `afed4c0a…0908`); `pausers` (4) with Pause/Unpause actions through `create/approve/execute_multisig_request` (next request ID 218); `upgrade` + `ApproveForUpgrade` + `migrate`; `owners` (4), `admins` (4), `master_minters` (4); `mint`, `burn`. The wasm strings include "FiatToken: paused" and "FiatToken:  is blocklisted". **The account is an implicit account and still holds its own full-access key** (the key decodes to the account ID). Whoever holds that key can deploy code outside the multisig. `is_blocklisted("intents.near") = false`. Storage bound 0.00125 NEAR. |
| **USDt** | `usdt.tether-token.near` | Tether "Supported protocols": "To integrate Tether's USD₮ Token on the Near Blockchain use the contract address: usdt.tether-token.near"; not deprecated (PRIMARY) | 6 | **525,944,120.793709** | 930,438.35 | `add_to_blacklist`, `remove_from_blacklist`, `get_blacklist_status` (`Allowable`/`Banned`), **`destroy_black_funds`**, `pause`/`resume`, `contract_status` (= `"Working"`), `upgrade`, `migrate`, `owner` = **`tether.multisafe.near`** (2-of-3 confirmations, 3 implicit members), `guardians` = `[]`, `version` = `tether_token:0.1.1`. No access keys. Storage bound 0.00125 NEAR. |
| USDC.e (Rainbow-bridged) | `a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near` | Circle: "not issued by Circle … not supported by Circle Mint" (circle.com/multi-chain-usdc/near, search snippet) | 6 | 14,557,495.67 | — | Bridge risk |
| USDT.e (Rainbow-bridged) | `dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near` | — | 6 | 3,857,884.96 | — | Bridge risk |
| FRAX (bridged) | `853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near` | — | 18 | 209,826.34 | — | Bridge risk |

- **Tether transparency** (`https://app.tether.to/transparency.json`, fetched 2026-11-12, PRIMARY):
  - `totaltokens_near = 525944120.793709` (this matches the on-chain supply)
  - `reserve_balance_near = 489044182.14815`
  - `quarantined_near = 0.0`

  The `reserve_balance` field appears to be Tether's "authorized but not issued" figure. If so, **about 36.9M USDt circulates** on NEAR (DERIVED; label semantics not confirmed). Circle's transparency page (as of 2026-11-09) gives no per-chain split in the fetched text.
- **No native PYUSD, RLUSD, USDe or USD1 on NEAR.** I found no issuer announcement, and `/v0/tokens` lists no such `near` asset. USD1 appears only as ETH and SOL bridged IDs (UNVERIFIED absence; search-based).

### 2.2 CCTP and bridging

- **CCTP: not supported on NEAR** (PRIMARY). Circle's CCTP domain table lists 31 domains (0 Ethereum … 37 X Layer, including Solana 5, Base 6, Sui 8, Aptos 9, Stellar 27) and does not list NEAR.
- **Circle Mint supports NEAR USDC** (PRIMARY: developers.circle.com Circle Mint "Supported chains and currencies", row `NEAR | NEAR | USD`). EURC is not on NEAR.
- So the ways to move USDC in and out of NEAR are:
  - institutional mint and redeem through Circle Mint;
  - **NEAR Intents solvers / 1Click**, which swap native NEAR USDC for POA/Omni-bridged USDC on other chains;
  - legacy Rainbow USDC.e, which is not fungible with native USDC.

### 2.3 Regulatory status (EU and US)

**USDC / EU (MiCA).**
- Circle press release of **2024-07-01** (PRIMARY): Circle obtained an "Electronic Money Institution (EMI) license" from the "Autorité de Contrôle Prudentiel et de Résolution (ACPR)", and "both USDC and EURC are now being issued in the EU in compliance with MiCA's regulatory obligations". The issuer entity is **Circle Internet Financial Europe SAS**.
- Open point on **multi-issuance**. USDC on NEAR is fungible with USDC issued outside the EU.
  - ECB non-paper of 2026-04-10: against third-country multi-issuance.
  - EBA response of 2026-09-24: asks for regulatory changes, and reports 39 EMTs issued under MiCA as of 2026-09-01.
  - A law-firm note says the Commission's consultation acknowledges that multi-issuance is permitted.

  All three are SECONDARY or snippet-level, and this is a **counsel item**.

**USDT / EU.**
- Tether is not MiCA-authorised (SECONDARY, widely reported).
- ESMA statement of **2025-01-17** (PRIMARY page): CASPs were to comply by the end of Q1 2025.
- **ESMA Opinion ESMA75-113276571-1742, dated 8 October 2026** (PRIMARY text, read from a mirrored PDF at finreg360.com):
  - ¶12: "CASPs should not provide crypto-asset services in relation to ARTs or EMTs that are not compliant with the applicable requirements under MiCA".
  - ¶21: the scope covers "all CASP services i.e.: a CASP operates a trading platform, provides exchange services, executes orders, receives and transmits orders, places crypto-assets, provides advice, transfer services, custody, and portfolio management".
  - ¶19: warnings and disclosures "would not sufficiently address the concerns".
  - ¶27: legacy exposures should be remediated "no later than three (3) months following the date of publication", which is about **2027-01-08** (DERIVED). Residual services are limited "to sell-only, conversion, transfer or withdrawal".
- Exchange delistings: Coinbase, Kraken and Crypto.com delisted USDT for EEA retail users. Kraken's EEA delisting was dated 2026-04-13 (SECONDARY).
- **Implication.** If Marginal, or a CASP partner, provides custody or transfer for EU clients, USDT escrow is out of bounds for them.

**US (GENIUS Act, enacted 2025-07-18).**
- **Effective date 2027-01-18.** OCC Bulletin 2026-50, dated 2026-10-21 (PRIMARY): "The final rule will be effective on January 18, 2027 … The GENIUS Act's effective date is January 18, 2027". The OCC rule excludes BSA/AML/OFAC, which are left to a separate Treasury rulemaking.
- From then, only permitted payment stablecoin issuers (PPSIs) may issue payment stablecoins in the US (Morrison & Foerster, SECONDARY).
- The DASP restriction on foreign-issuer stablecoins also starts on 2027-01-18. The general DASP offer/sale restriction (PPSI or qualifying FPSI only) starts **2028-07-18**. Treasury's proposed rule was published 2026-08-18 (Freshfields, 2026-08-25, SECONDARY).
- Issuers must be technically able to comply with lawful orders to "seize, freeze, burn, or prevent the transfer" (SECONDARY summaries of §4(a)(6)). **Freeze capability is therefore a legal requirement for US-compliant stablecoins, not an accident of design.**
- Circle received **final OCC approval for First National Digital Currency Bank, N.A.** on **2026-07-10** (Business Wire, The Block, CoinDesk; SECONDARY). Reports say USDC issuance is to sit in a New York limited-purpose trust company.
- Tether's US product (USAT) could not be confirmed (UNVERIFIED). It is not on NEAR in any case.

### 2.4 Issuer-risk precedents

| Event | Date | Fact | Label | Relevance |
|---|---|---|---|---|
| USDC/SVB | 2023-03-10…13 | $3.3B of reserves (about 8%) stuck at SVB. USDC traded at about $0.8774 to $0.88 and recovered after the 2023-03-13 statement ("$3.3 billion of USDC reserve risk removed") | PRIMARY (Circle pressroom), SECONDARY (prices) | Depeg risk during an escrow's lifetime |
| Tornado Cash | 2022-08 | Circle blocklisted the OFAC-listed addresses (about 75k USDC). Tether at first declined to freeze without an authority's request | SECONDARY | Address-level freezes follow sanctions |
| **Zama cUSDC** | **2026-05-30** | Circle blocklisted the **pooled** cUSDC wrapper contract after a federal court order in a suit tied to Overnight Finance, locking 12,606,386 USDC for every holder | SECONDARY (The Block, Blockonomi, BeInCrypto) | **The closest analogue to Marginal's pooled escrow: one disputed depositor can freeze everyone** |
| Circle terms | 2023-10-27 (page date) | "Circle reserves the right to 'block' certain USDC addresses"; may freeze "if it receives a legal order from a valid government authority" | PRIMARY (circle.com/legal/usdc-risk-factors) | |
| Tether NEAR contract | now | `destroy_black_funds` exists: Tether can burn a blacklisted account's balance | PRIMARY (wasm exports) | Stronger than a freeze |

---

## 3. Recommendations for the SDD (do not edit SDD.md here; these are the proposed texts)

### 3.1 §3.9.3 path 3: Intents funding (replace the "to be confirmed" text)

**Problem.** `ft_on_transfer` receives `sender_id = "intents.near"` (§1.2), so clearing cannot tell which Intents account paid. That matters for KYC tiers, eligibility and the delivery key. Identity therefore needs **`AuthCall` in the same signed batch.**

**The buyer signs one `MultiPayload`** (any of the 7 standards). Message:
```json
{
  "signer_id": "<buyer intents account, e.g. 0x… lowercase>",
  "verifying_contract": "intents.near",
  "deadline": "<now + 5 min, ISO-8601>",
  "nonce": "<versioned salted nonce from intents-sdk>",
  "intents": [
    { "intent": "auth_call", "contract_id": "<clearing>",
      "msg": "{\"v\":1,\"op\":\"fund\",\"fund_id\":\"<32B hex>\",\"token\":\"17208628…36133a1\",\"amount\":\"<deposit>\",\"args_hash\":\"<sha256(RequestArgs)>\"}",
      "min_gas": "20000000000000" },
    { "intent": "ft_withdraw", "token": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
      "receiver_id": "<clearing>", "amount": "<deposit>",
      "msg": "{\"v\":1,\"op\":\"appraise\",\"fund_id\":\"<same>\",\"signer_id\":\"<buyer>\",\"args\":{…RequestArgs…}}",
      "min_gas": "100000000000000" }
  ]
}
```
Notes on the message:
- Use a per-token amount in base units.
- `min_gas` of 100 TGas for `ft_withdraw` is a starting point (the default is 50); the spike sets the final value.
- Leave out `storage_deposit`, because clearing pre-registers.

**Submission.** The gateway relayer calls `intents.near.simulate_intents({signed:[p]})` (a view), then `intents.near.execute_intents({signed:[p]})` with 300 TGas and 0 deposit. This call is permissionless.

**Clearing behaviour:**
- `on_auth(signer_id, msg)`:
  - `require!(predecessor == cfg.intents_verifier)`;
  - store `PendingFund{fund_id → signer_id, token, amount, args_hash, expires_at}` (about 100 blocks; GC'd);
  - return `Value(())`.
- `ft_on_transfer(sender_id, amount, msg)` when `sender_id == cfg.intents_verifier`:
  - Accept only if a matching `PendingFund` exists (same `signer_id`, `token == predecessor`, `amount`, `sha256(args) == args_hash`). Then create the job with `buyer = signer_id` and `refund_to = IntentsAccount(signer_id)`, and return `U128(0)`.
  - **Otherwise return `U128(amount)`.** This includes the case where `on_auth` has not arrived yet. The verifier then refunds the signer's Intents balance automatically (`"refund"`). Every failure mode is "funds back to the true signer", and nothing is ever stuck in clearing.
- **Preconditions:**
  - clearing is `storage_deposit`-registered on every allow-listed token;
  - `ft_on_transfer` never makes cross-contract calls on this path;
  - it never panics after accepting.

**Alternative (not recommended).** Use the `Transfer{receiver_id: clearing, tokens, msg}` notification. Clearing's `mt_on_transfer` gets an authenticated `sender_id`. However, the funds land in clearing's *verifier* balance and need a second `intents.near.ft_withdraw` to pull them into clearing's NEP-141 balance. That breaks "escrow never in the verifier" and depends on the verifier being live.

### 3.2 §3.9.3 path 4: 1Click from any chain

```json
POST /v0/quote  (X-API-Key: <partner JWT>)
{ "dry": false, "swapType": "EXACT_OUTPUT", "slippageTolerance": 50,
  "originAsset": "<e.g. nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near>",
  "depositType": "ORIGIN_CHAIN",
  "destinationAsset": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "amount": "<deposit, 6dp base units>",
  "recipient": "<buyer intents account>", "recipientType": "INTENTS",
  "refundTo": "<buyer origin-chain address>", "refundType": "ORIGIN_CHAIN",
  "deadline": "<now + 30 min>" }
```
- Verify the quote signature.
- The buyer sends `amountIn` to `depositAddress`.
- Poll `/v0/status` until `SUCCESS`, then run path 3.
- **Do not use `customRecipientMsg`** (experimental; stated risk of losing funds).
- Fee: 1 bp authenticated on a stablecoin route, 25 bps extra without a key.

### 3.3 §3.9.4 payout and refund calls (exact)

| Route | Call from clearing | Success test in `on_transfer_result` | Notes |
|---|---|---|---|
| `NearAccount(a)` | if `token.storage_balance_of(a)` is null: `token.storage_deposit({account_id:a, registration_only:true})` with **0.00125 NEAR** (the bound for USDC and USDT); then `token.ft_transfer({receiver_id:a, amount, memo:"mgl:<settlement_id>"})` with 1 yocto and 15–20 TGas | promise success | — |
| `IntentsAccount(acct)` | `token.ft_transfer_call({receiver_id:"intents.near", amount, memo:"mgl:<settlement_id>", msg: acct})` with 1 yocto and about 60 TGas | **returned `U128 used == amount`**. Otherwise the remainder (it bounced: verifier paused or bad `msg`) becomes claimable | `acct` is validated against the formats in §1.5 when the route is registered |
| Refund for an Intents-funded job | the same as `IntentsAccount(signer_id)` | same | Claimable fallback. An EVM-only buyer can claim later through an `auth_call` (`on_auth(signer,"claim")`), with clearing paying to `IntentsAccount(signer)` |
| `IntentsWithdraw{…}` | **Remove from v1, or redefine.** Clearing holds native NEAR USDC, so a cross-chain payout is a swap. v1: pay `IntentsAccount(seller)`; the seller's wallet then signs a 1Click quote with `depositType: INTENTS`, `recipientType: DESTINATION_CHAIN`, `refundType: INTENTS` (`/v0/generate-intent` → sign → `/v0/submit-intent`). The UI automates this. | — | Keeps the foreign leg seller-originated (ToS 4.1(h)), and nothing in clearing has to trust a bridge memo |
| (optional v1-canary) `OneClickDeposit{quote_hash, deposit_address, deadline}` | `token.ft_transfer({receiver_id: deposit_address, amount: amountIn})` for a quote with `originAsset: nep141:17208628…`, `depositType: ORIGIN_CHAIN`, `refundType: INTENTS` (`refundTo` = the seller's Intents account) | promise success; completion attested from `/v0/status` | `PayoutApproval.route_hash` must cover the `deposit_address`, the quote signature and the deadline, so a relayer cannot swap them. Counsel on ToS 4.1(h) first |

- **§3.9.5:** add "Verifier `ft_on_transfer` paused → `IntentsAccount` push bounces (`used = 0`) → claimable".
- **T26:** list the DAO's `ft_force_withdraw`, `admin_call` and account lock as risks for funds that are *inside* the verifier. This is a further reason to keep escrow outside it.

**Bridge memo table for the SDD appendix** (only for an asset that clearing holds in bridged form): POA `memo: "WITHDRAW_TO:<addr>"` with `receiver_id = token`; Omni `receiver_id: "omni.bridge.near"` with the `msg` JSON; HOT `mt_withdraw` via the HOT SDK. Resolve the bridge per asset with `@defuse-protocol/intents-sdk` at run time, because Solana USDC moved to Omni and BNB/Polygon/Avalanche moved on 2026-11-09.

### 3.4 §3.24 configuration / OI-12: the settlement-asset policy

```toml
[[settlement_assets]]                 # default
token = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"   # Circle USDC (NEAR), 6 dp
status = "Active"                     # Active | DepositsPaused | Frozen
cap_per_job = "<set>"                 # base units
cap_total_escrow = "<set>"            # caps the blast radius of a blocklist on clearing
eu_clients = true
us_clients = true

[[settlement_assets]]                 # optional, off by default
token = "usdt.tether-token.near"      # USDt (NEAR), 6 dp
status = "DepositsPaused"
eu_clients = false                    # ESMA Opinion 2026-10-08 (custody/transfer in scope)
us_clients = false                    # revisit before 2027-01-18 / 2028-07-18 (GENIUS)
```

**Rules:**
- A job is denominated in exactly one asset, with no cross-asset netting.
- Never allow bridged assets (USDC.e, USDT.e, `*.omft.near`, `*.omdep.near`, `nep245:*`) as escrow.
- Status changes go through governance with a time-lock. `DepositsPaused` can be set fast by the security council.
- On an issuer pause or blocklist, payouts become claimable (already in the design). Clearing does not try to convert to another asset.
- Run a monitor on `is_blocklisted(clearing)` / `get_blacklist_status(clearing)`, `contract_status`, the asset price (depeg > 100 bps leads to `DepositsPaused`), and code-hash changes on the token accounts.

**Mitigations to record in §8:**
1. Per-asset escrow caps.
2. Optional per-cohort vault sub-accounts, so that one court order against a vault (the Zama precedent) does not freeze every job. This is a v2 consideration.
3. Short escrow lifetimes (budgets refund on Timeout or Revoked).
4. Disclose issuer freeze, upgrade and pause powers in the ToS.
5. Record that USDC's NEAR account keeps a raw full-access key, and that USDT has `destroy_black_funds`.

### 3.5 §3.25 private mode (v2)

Replace "Confidential Intents (FAR, partnership needed)" with: "Confidential swaps via 1Click (`confidentiality` or `CONFIDENTIAL_INTENTS` types; partner API key). A public contract cannot hold FAR/IMT balances. Per-job funding accounts are funded by a confidential→`INTENTS` swap, then path 3. Needs a spike, plus counsel on 1Click ToS 4.1(h) 'intermediary wallet'."

### 3.6 Spikes and counsel items

- **S-Intents-1** (mainnet, under $5):
  1. Register clearing's storage on USDC.
  2. Run path 3 with an EVM key (ERC-191) and with a Solana key (raw_ed25519).
  3. Measure the gas available inside `ft_on_transfer` under Circle's FiatToken `ft_transfer_call` at `min_gas` 50 and 100 TGas.
  4. Test bounce, panic and the late-`on_auth` race, and confirm that every one refunds to the signer.
  5. Pay out to `IntentsAccount` while the verifier is live, and check the bounce path by setting an invalid `msg`.
- **S-Intents-2:** a seller-signed 1Click payout (`INTENTS` → Solana USDC). Record the `destinationChainTxHashes` latency.
- **Counsel:**
  - USDC multi-issuance under MiCA;
  - whether Marginal's escrow is custody or transfer for EU clients (this decides whether the USDT ban applies, and whether a CASP partner is needed);
  - 1Click ToS 4.1(e) (storing quotes) and 4.1(h) (clearing as intermediary; v2 fresh accounts);
  - GENIUS timeline for USDT for US users.

---

## 4. Sources

**Code (PRIMARY):**
- https://github.com/near/intents. Files: `contracts/defuse/core/src/intents/{mod,tokens,auth}.rs`, `contracts/defuse/src/contract/tokens/nep141/{withdraw,deposit}.rs`, `contracts/defuse/src/tokens/mod.rs`, `contracts/defuse/src/contract/tokens/mod.rs`, `contracts/defuse/src/contract/{mod,upgrade,admin_call}.rs`, `contracts/defuse/src/contract/accounts/force.rs`, `contracts/defuse/src/contract/intents/{mod,auth_call,state}.rs`, `contracts/defuse/src/contract/tokens/nep245/core.rs`, `contracts/defuse/core/src/payload/{mod,multi}.rs`, `contracts/defuse/core/src/public_key.rs`, `crates/near/auth-call/src/lib.rs`, `contracts/poa/token/src/{lib,contract}.rs`, `contracts/defuse/CHANGELOG.md`, `contracts/defuse/Cargo.toml`. Commits: main `fce0936`, deployed `16d04f6`.
- PRs (GitHub API): #374 (merged 2026-10-07), #326 (merged 2026-10-12). Commit list 2026-09-25 to 2026-10-08.
- https://github.com/defuse-protocol/sdk-monorepo @ `5bbdc78`: `packages/intents-sdk/src/bridges/{poa-bridge,omni-bridge,hot-bridge,direct-bridge}/*`, `src/constants/poa-tokens-migrated-to-omni-bridge.ts`.

**On-chain (PRIMARY):** read-only RPC (`rpc.mainnet.near.org`, which was rate-limited and deprecated, then `free.rpc.fastnear.com`), 2026-11-12, blocks about 224106997 to 224108447.
- `intents.near`: `contract_source_metadata`, `pa_all_paused`, `fee`, `fee_collector`, `acl_get_super_admins`, `acl_get_grantees` (7 roles), `view_access_key_list`
- `ctl-intents.near`: `contract_source_metadata`, ACL
- `intents.sputnik-dao.near`: `get_policy`
- USDC `17208628…`: `ft_metadata`, `ft_total_supply`, `ft_balance_of(intents.near)`, `owners`, `admins`, `pausers`, `blocklister`, `master_minters`, `get_next_multisig_request_id`, `is_blocklisted`, `storage_balance_bounds`, `view_access_key_list`, `view_code` (export list and strings)
- `usdt.tether-token.near`: `ft_metadata`, `ft_total_supply`, `ft_balance_of`, `contract_status`, `owner`, `guardians`, `version`, `get_blacklist_status`, `storage_balance_bounds`, `view_code`
- `tether.multisafe.near`: `get_num_confirmations`, `get_members`
- Rainbow `*.factory.bridge.near` (USDC.e, USDT.e, FRAX): `ft_total_supply`, `ft_metadata`

**Docs (PRIMARY, undated pages accessed 2026-11-12):**
- docs.near-intents.org: `llms.txt`; `verifier-contract/{introduction,account-abstraction,intent-types-and-execution,signing-intents}`; `deposits-and-withdrawals/{deposits,withdrawals}`; `bridging/overview`; `resources/{fees,swap-limits,faqs,asset-support}`; `1click-api/{about,authentication,swap-types,fee-config,verify-quote-signature,quickstart/{going-live,signed-intent-execution,confidential-swaps}}`; `api-reference/oneclick/{request-a-swap-quote,check-swap-execution-status}`; `security-compliance/{terms-of-service (Last Updated 2026-10-07),withdrawals-to-exchanges,risk-and-compliance,treasury-addresses,proactive-intents-security,shield-incident-api,security}`; `changelog/overview`; `changelog/entries/2026-10-27-1click-confidential`; `market-makers/{confidential-intents,hot-to-omni}`; `learn/omni-bridge/{overview,how-it-works}`.
- 1Click OpenAPI: https://1click.chaindefuser.com/docs/v0/openapi.yaml (v0.1.10). Tokens: https://1click.chaindefuser.com/v0/tokens

**Issuers (PRIMARY):**
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://developers.circle.com/cctp/concepts/supported-chains-and-domains
- https://developers.circle.com/circle-mint/references/supported-chains-and-currencies
- https://www.circle.com/transparency (as of 2026-11-09)
- https://www.circle.com/legal/usdc-risk-factors (2023-10-27)
- https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law (2024-07-01)
- https://www.circle.com/pressroom/3-3-billion-of-usdc-reserve-risk-removed-dollar-de-peg-closes (2023-03-13)
- https://tether.to/en/supported-protocols/
- https://app.tether.to/transparency.json

**Regulators (PRIMARY):**
- https://www.occ.gov/news-issuances/bulletins/2026/bulletin-2026-50.html (2026-10-21)
- https://www.esma.europa.eu/press-news/esma-news/esma-and-european-commission-publish-guidance-non-mica-compliant-arts-and-emts (2025-01-17)
- ESMA Opinion ESMA75-113276571-1742 (2026-10-08), read from the mirror https://finreg360.com/wp-content/uploads/2026/10/ESMA_Opinion_non-MiCA-compliant_ART-EMT.pdf

**SECONDARY:**
- The Block 2026-10-01 (incident)
- thecoding.substack.com "near-intents-ghost-fund-postmortem"
- cryptotimes.io 2026-10-17
- shattered.io
- Freshfields 2026-08-25 (Treasury GENIUS proposal)
- Mayer Brown, MoFo, Davis Polk (OCC rule)
- Business Wire, The Block, CoinDesk 2026-07-10 (Circle trust bank)
- The Block, Blockonomi, BeInCrypto (Zama freeze 2026-05-30)
- The Block, Cointelegraph (Tornado 2022)
- vaasblock, dexly, guardarian (USDT EU delistings)
- EBA response 2026-09-24 and the ECB non-paper (via search snippets)
- crowdfundinsider, ledgerinsights (multi-issuance)

**Not fetched or failed:**
- The X post-mortem (`x.com/AlexAuroraDev/status/2111124226962870770`) was not fetched.
- Circle transparency had no per-chain NEAR figure.
- The USAT search returned nothing relevant.

---

## 5. Query log

**WebSearch (20):**
1. Circle USDC contract addresses NEAR 17208628… (std)
2. Circle CCTP supported blockchains NEAR 2026 (ext)
3. Tether USDt NEAR supported protocols usdt.tether-token.near transparency (std)
4. Circle MiCA EMI ACPR USDC EURC ESMA register (std)
5. USDT MiCA non-compliant delisted EU CASPs ESMA 2026 (ext)
6. GENIUS Act effective date final rules OCC Treasury 2026 (ext)
7. Circle national trust bank OCC approval 2026; Tether USAT (ext)
8. ESMA statement MiCA non-compliant ARTs EMTs CASPs Q1 2025 (std)
9. ESMA opinion 2026 non-MiCA-compliant ART EMT custody transfer (ext)
10. NEAR Intents Oct 2026 exploit post-mortem (ext)
11. Confidential Intents NEAR partner access FAR Nov 2026 (std)
12. PYUSD/RLUSD/USDe/USD1 native NEAR 2026 (std)
13. Circle blocklist precedent Tornado Cash; Tether freeze (std)
14. Circle SVB $3.3B depeg (std)
15. Circle USDC terms blocklist policy (std)
16. Circle Zama cUSDC freeze (ext)
17. GENIUS Act seize/freeze/burn lawful order (std)
18. Tether USAT Anchorage 2026 (std; irrelevant results)
19. MiCA multi-issuance USDC Commission/EBA 2026 (std)
20. Circle Mint supported chains NEAR (std)

**WebFetch (14):**
1. docs.near-intents.org/llms.txt
2. Circle USDC addresses
3. Circle CCTP domains
4. Tether supported protocols
5. OCC Bulletin 2026-50
6. Freshfields GENIUS
7. ESMA 2025-01-17 page
8. ESMA Opinion PDF (mirror; text extracted locally with a small zlib/Tj parser)
9. thecoding.substack post-mortem summary
10. circle.com/transparency
11. Circle USDC risk factors
12. Circle MiCA press release
13. The Block incident article
14. 1Click verify-quote-signature (curl)

**curl docs (read-only):**
- 32 docs.near-intents.org `.md` pages
- the OpenAPI YAML
- the 2026-10-27 changelog entry
- the Circle Mint chains `.md`
- `app.tether.to/transparency.json`
- `1click.chaindefuser.com/v0/tokens` (public, no key)

**GitHub (read-only):**
- `git clone --depth 1 near/intents`, plus fetches of `main` (depth 50) and the deployed rev `16d04f6`
- `git clone --depth 1 defuse-protocol/sdk-monorepo`
- `gh api` PRs #374 and #326; commits 2026-09-25 to 2026-10-08; `gh search code WITHDRAW_TO --owner defuse-protocol`; repository search

**RPC:** about 60 view calls (listed in §4). Nothing was signed or sent.
