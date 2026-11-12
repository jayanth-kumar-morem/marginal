# MPC CKD and Chain Signatures: findings for OI-1 and OI-16

*Prepared 2026-11-12 (live calls made 2026-11-11 18:30–19:30 UTC). Research only: nothing was built, deployed, signed, posted or paid for. The only network calls were public read-only JSON-RPC `query`/`tx` calls and the public NearBlocks read API (no key). Builds on `spec-notes/near-primitives.md` (A1, A3, B3, B5) and does not repeat what that file settles.*

**Source labels.** PRIMARY = `near/mpc` source, live contract state, on-chain transactions, official docs or blogs. SECONDARY = third-party docs, aggregators, independent analysis, hackathon repos. UNVERIFIED = search snippet only, or my inference. "Derived" marks my own reasoning from PRIMARY facts.

**Code versions read.**
- `near/mpc` `main` at `2bccb8844a17e7e7236f84dd76da1ffb4403a36f` (2026-11-11), cloned read-only to the scratchpad.
- Cross-checked against release tag `3.18.0` (commit `e691bdb98d68dcf74653da58d043453a6318765f`). The CKD entry point, the 1-yocto minimum and the `app_id` prefix are identical.
- The live contracts report `version() = "3.18.0"`, and both accounts run code hash `CpGX8ywXJwvWPgZFDDCTCuPJBHF7BATT51gSfc3APERJ`.

---

## 0. Status at a glance

| Item | Status | One-line answer |
|---|---|---|
| OI-1.1 CKD live? domain IDs | **Resolved** | Live on testnet `v1.signer-prod.testnet` (CKD domains **2** and **6**) and mainnet `v1.signer` (CKD domain **2**). Real CKD requests were answered on both networks today. |
| OI-1.2 method, args, gas, deposit, return, `app_id` | **Resolved** | `request_app_private_key({request:{derivation_path, app_public_key, domain_id}})`. Deposit ≥ 1 yocto. Prepaid gas ≥ **15 TGas** (live config). Result returns via yield/resume as `{big_y, big_c}`. `app_id = SHA3-256(prefix‖predecessor‖","‖path)`, so a calling contract gets its own `app_id`. |
| OI-1.3 latency, failures, threshold | **Resolved (empirical)** | CKD took 6–8 blocks (4.1–5.9 s; n = 3). `sign` median 6 blocks (≈3.6 s), p90 8 (≈4.8 s), max 25 (≈14.7 s); n ≈ 600 per network, 0 failures. Timeout is 200 blocks (observed 201 blocks ≈ 117–121 s). Live threshold is **11 of 16** on both networks. |
| OI-1.4 CKD as IBE ("Option B") | **Partially resolved** | Mathematically it is Boneh–Franklin IBE key extraction, and NEAR One's own "time-lock encryption" use case implies it. There is no NEAR spec, API or library for encrypting to an identity, so a crypto review is still needed. |
| OI-1.5 client libraries | **Resolved** | Rust: `near/mpc` `ckd-example-cli`, test vectors, OutLayer `keystore-worker/src/mpc_ckd.rs`. No official TS helper exists. |
| OI-16.1 `sign` args, tx building, testnets | **Resolved** | `sign({request:{path, payload_v2:{Ecdsa\|Eddsa: hex}, domain_id}})`, 1 yocto, ≥ 15 TGas. Libraries: chainsig.js 1.1.16 and omni-transaction 0.5.0 (supports in-contract Solana and EVM builds). Signing is chain-agnostic. |
| OI-16.2 corroboration and pricing sources | **Partially resolved** | No healthy push price oracle on NEAR today (Pyth dropped NEAR; `priceoracle.near` is stale; OutLayer's oracle is sparse). **New:** the MPC network's `verify_foreign_transaction` can attest destination-chain delivery on Base Sepolia and Solana devnet from testnet. |
| OI-16.3 policy-gated signing patterns | **Resolved** | Shade "on-chain guardrails" guidance, Abstract DAO (signer may set only gas), and several hackathon guards. None is an audited production library. |

---

## 1. OI-1: CKD on the MPC signer

### 1.1 Is CKD live, and which domains? (PRIMARY: live state)

**Calls.** `query` / `call_function` on `state`, `config`, `version` and `public_key{domain_id}`, made to:
- `https://rpc.testnet.near.org` and `https://rpc.mainnet.near.org` (state, config, version);
- `https://test.rpc.fastnear.com` and `https://free.rpc.fastnear.com` (the other calls).

Results are in §4.

| Domain | Testnet `v1.signer-prod.testnet` (keyset epoch 27) | Mainnet `v1.signer` (keyset epoch 16) |
|---|---|---|
| 0 | CaitSith (secp256k1 ECDSA), purpose `Sign`, t = 11 | same |
| 1 | Frost (Ed25519), `Sign`, t = 11 | same |
| **2** | **ConfidentialKeyDerivation, `CKD`, t = 11**, key `bls12381g2:xeYho48G…Yrj` (see §4) | **ConfidentialKeyDerivation, `CKD`, t = 11**, key `bls12381g2:24mhN4Rn…mXdR` |
| 3 | CaitSith, purpose `ForeignTx`, t = 11 | same |
| 4 | CaitSith, `Sign` (second secp256k1 key) | not present. A vote to add it is pending (below). |
| 5 | Frost, `Sign` (second Ed25519 key) | pending |
| **6** | **ConfidentialKeyDerivation, `CKD`** (second BLS key, `bls12381g2:mVEM6WaL…UrYf`) | pending |
| 7 | CaitSith, `ForeignTx` | pending |

**Pending mainnet change.**
- `add_domains_votes` on mainnet holds a proposal for domains 4–7 (same shapes as testnet).
- 15 of 16 participants have voted for it (all except participant id 16).
- The contract README says all participants must vote. I found no statement explaining why a second key set is being added.
- **Implication (derived):** when the last vote lands, the contract moves to `Initializing` for key generation. While it is in that state, `domain_registry()` errors (`crates/contract/src/state.rs:37–45`), so **new `sign` and CKD requests are rejected**, and `respond*` requires `is_running_or_resharing()`. Expect a short sign/CKD outage window on mainnet. `key_event_timeout_blocks = 150` per keygen attempt (live config).

**Domain removal.** The 3.18 contract has no method to remove or retire a domain (grep of `crates/contract/src`; method list in `crates/near-mpc-contract-interface/src/method_names.rs`). Domains can only be added. A future contract upgrade could change this.

**Live use observed.**
- **Testnet:** `respond_ckd` txs `DnQSTBMXgCoEGHa8fTqsbD5baUp9obMJHhPfoLs1igPY` (block 277252957) and `7SEBXXwZhjWY7PkuczoJJNX5jLCdy7ZwHWj42mwdoy6J`. Both used domain 2 and the publicly-verifiable variant.
- **Mainnet:** `request_app_private_key` from a third-party contract on domain 2, privately-verifiable variant, path `file/<hash>`, e.g. tx `CR5DXseiRU8tkt56tzbWAaHNbQAdRhUR9VGkDWriyjWJ`.
  - That contract emits `key_requested`, calls CKD, then emits `key_released` in its callback.
  - This is a per-file key-release-on-purchase pattern, the same shape as Marginal's KeyPolicy (PRIMARY, on-chain).

**Docs are stale.** docs.near.org/chain-abstraction/chain-signatures still says "only the two signing domains are currently supported: `0` … `1`" (PRIMARY, undated, fetched 2026-11-12). Live state has 4 (mainnet) and 8 (testnet) domains.

### 1.2 Exact CKD API (PRIMARY: source + live config + on-chain txs)

**Entry point** (`crates/contract/src/api/ckd.rs`, identical at tag 3.18.0):

```rust
/// The derived key is fully determined by the calling account id (taken
/// implicitly from the predecessor), the derivation path and the domain — …
#[handle_result]
#[payable]
pub fn request_app_private_key(&mut self, request: dtos::CKDRequestArgs) {
    let (_, predecessor) = self.check_request_preconditions(
        domain_id, dtos::DomainPurpose::CKD,
        Gas::from_tgas(self.config.ckd_call_gas_attachment_requirement_tera_gas),
        MINIMUM_CKD_REQUEST_DEPOSIT);            // = NearToken::from_yoctonear(1)
    match &request.app_public_key {               // PV keys are checked on-chain
        dtos::CKDAppPublicKey::AppPublicKey(_) => {}
        dtos::CKDAppPublicKey::AppPublicKeyPV(pk) => require!(app_public_key_check(pk), "app public key check failed"),
    }
    let request = dtos::CKDRequest::new(request.app_public_key, domain_id, &predecessor, &request.derivation_path);
    … self.enqueue_yield_request(RETURN_CK_AND_CLEAN_STATE_ON_SUCCESS, callback_args, callback_gas /* 7 TGas */, …);
}
```

**Argument types** (`crates/near-mpc-contract-interface/src/types/ckd.rs`, `crates/near-mpc-crypto-types/src/ckd.rs`, `crypto.rs`):

```rust
pub struct CKDRequestArgs { pub derivation_path: String, pub app_public_key: CKDAppPublicKey, pub domain_id: DomainId }
pub enum CKDAppPublicKey { AppPublicKey(Bls12381G1PublicKey), AppPublicKeyPV(CKDAppPublicKeyPV) }
pub struct CKDAppPublicKeyPV { pub pk1: Bls12381G1PublicKey, pub pk2: Bls12381G2PublicKey }  // (a·G1, a·G2)
pub struct CKDResponse { pub big_y: Bls12381G1PublicKey, pub big_c: Bls12381G1PublicKey }    // (Y, C)
// G1 = 48-byte compressed (ZCash/blstrs), G2 = 96-byte compressed; JSON strings "bls12381g1:<base58>" / "bls12381g2:<base58>"
```

JSON arguments:
- Wrap everything as `{"request": {...}}`.
- `app_public_key` accepts:
  - the legacy plain string `"bls12381g1:…"`;
  - `{"AppPublicKey":"bls12381g1:…"}`;
  - `{"AppPublicKeyPV":{"pk1":"bls12381g1:…","pk2":"bls12381g2:…"}}`.

The live mainnet call seen today used:

```json
{"request":{"domain_id":2,"app_public_key":{"AppPublicKey":"bls12381g1:6CEx…zh"},"derivation_path":"file/41a6…3423"}}
```

**Deposit.**
- At least **1 yoctoNEAR**. Excess is refunded (`require_deposit`, `api/common.rs`).
- The contract README says the deposit forces a full-access key or a contract. Function-call access keys cannot attach a deposit.
- So the room relayer cannot call the MPC directly. KeyPolicy (a contract) attaches the yocto from its own balance (derived).

**Gas.**
- `check_request_preconditions` requires `env::prepaid_gas() >= ckd_call_gas_attachment_requirement_tera_gas`.
- Live `config()` on both networks gives **`ckd_call_gas_attachment_requirement_tera_gas: 15`** and **`sign_call_gas_attachment_requirement_tera_gas: 15`**.
- Live config also has `return_ck_and_clean_state_on_success_call_tera_gas: 7` and `fail_on_timeout_tera_gas: 2`.
- **The README's "requires that at least 10 Tgas are attached" is stale.**

Observed burn (PRIMARY, tx traces in §4):

| Variant | Request receipt | Yield callback receipt | Node `respond_ckd` (paid by the MPC node) |
|---|---|---|---|
| Private (`AppPublicKey`), mainnet | 4.54 TGas | 3.77 TGas | (not traced) |
| Publicly verifiable (`AppPublicKeyPV`), testnet | **12.00 TGas** (on-chain pairing check of the app key) | 4.09 TGas | ≈24.4 TGas |

Derived from the burn figures:
- The 7 TGas yield-callback reservation also comes out of the request receipt's prepaid gas.
- So a PV request plausibly needs about 19 TGas, which is more than the 15 TGas minimum.
- **Attach ≥ 30 TGas static to `request_app_private_key`.** Unused gas is refunded.
- The observed callers attached 85.7 TGas (testnet) and 285.8 TGas (mainnet).

**Who is `app_id`?** (`crates/near-mpc-crypto-types/src/kdf.rs`)

```rust
const APP_ID_DERIVATION_PREFIX: &str = "near-mpc v0.1.0 app_id derivation:";
pub fn derive_app_id(predecessor_id: &AccountId, derivation_path: &str) -> CkdAppId {
    derive_from_path(APP_ID_DERIVATION_PREFIX, predecessor_id, derivation_path)  // SHA3-256(format!("{prefix}{predecessor},{path}"))
}
```

- **`app_id` is the predecessor (the immediate caller), not the transaction signer.** It is hashed together with the path into 32 bytes.
- **Verified on-chain.** Testnet request tx `GGZjFrnkCDJxaAnB1cqnAPWLu2irdDos931DhBWwCPj1` was signed by an EOA. It called a contract, and that contract called `request_app_private_key`.
- The `app_id` in the matching `respond_ckd` equals `SHA3-256("near-mpc v0.1.0 app_id derivation:" + "<contract account>" + "," + "<path>")`. I recomputed it locally and it matches exactly.
- So yes: a contract can call CKD and the key is bound to that contract's account (plus path). The design doc also says "no other contract or account can make a request with the same app_id".
- The path is in plaintext in the call arguments, so it is public once the transaction lands (OutLayer's code comment notes the same).

**How the key reaches the caller (yield/resume).**
1. `request_app_private_key` calls `promise_yield_create("return_ck_and_clean_state_on_success", …, 7 TGas)` and `promise_return`s it.
2. A participant later calls `respond_ckd(request, response)`. For PV requests the contract first runs `ckd_output_check`.
3. That resumes the yield, and the callback returns `PromiseOrValue::Value(CKDResponse)`.
4. The calling contract's `.then()` callback receives `{"big_y":"bls12381g1:…","big_c":"bls12381g1:…"}` as its promise result. The transaction's final `SuccessValue` carries the same JSON when the callback returns it.

Trace of testnet tx `GGZjFrnk…`:

```
EOA → caller-contract.request_key (100 TGas, 0.00032 NEAR)
caller-contract → v1.signer-prod.testnet.request_app_private_key (85.69 TGas, 1 yocto)   burnt 12.00 TGas
v1.signer-prod.testnet → self.return_ck_and_clean_state_on_success (7 TGas)            burnt 4.09 TGas → SuccessValue {"big_y":…,"big_c":…}
caller-contract → self.on_answer (10 TGas)                                              burnt 1.40 TGas → SuccessValue {"big_y":…,"big_c":…}
tx status: SuccessValue = {"big_y":"bls12381g1:5qZe…","big_c":"bls12381g1:6xFz…"}
```

**On timeout.**
- If no `respond_ckd` arrives within the runtime's yield timeout (200 blocks), the callback gets `Err(PromiseError)`.
- It pops the pending entry and schedules `fail_on_timeout()`, which panics with `RequestError::Timeout`.
- The caller's `.then()` therefore sees a failed promise.

**Duplicates.** Identical requests (same caller, domain, path and app key) are queued, up to `MAX_PENDING_REQUEST_FAN_OUT = 128`, and all get the same answer (`pending_requests.rs`, README).

**Decrypt and verify** (`crates/threshold-signatures/docs/confidential_key_derivation/confidential-key-derivation.md`, `crates/contract/src/primitives/ckd.rs`, the `CKDResponse` doc comment, `tests/vectors/ckd_test_vectors.json` `_encoding`):

- Inputs:
  - `pk` = the domain's master public key, in **G2** (from `public_key{domain_id}` or `state`);
  - `msk` = the master secret key, never revealed;
  - the app key pair is `(a, A = a·G1)`. For PV it is also `A2 = a·G2`.
- Hash: `H(pk, app_id) = hash_to_curve_G1( pk_compressed(96 B) ‖ app_id(32 B) )`.
  - This is RFC 9380 `BLS12381G1_XMD:SHA-256_SSWU_RO_` with DST **`"NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_"`**.
  - The empty-augmentation argument is empty.
- Network output: `Y = y·G1` and `C = msk·H(pk, app_id) + y·A`.
- App decryption: `sig = C − a·Y`.
- **App check (private verifiability):** `e(sig, G2) == e(H(pk, app_id), pk)`.
- Key: `s = HKDF-SHA256(ikm = sig_compressed(48 B), salt, info)`.
  - The test vectors use `salt = none, info = ""`.
  - `ckd-example-cli` uses salt `near-mpc-ckd-hkdf-v1` and info `near-mpc-ckd-strong-key-v1`.
  - "applications are encouraged to use non-empty, purpose-tagged values".
- **PV check (on-chain, by the MPC contract before resuming):** `e(C, G2) == e(H(pk, app_id), pk) · e(Y, A2)` (`ckd_output_check`, using the host functions `bls12381_p1_decompress`, `bls12381_p2_decompress` and `bls12381_pairing_check`, with `blstrs` hash-to-curve inside the wasm).
  - A successful PV response is therefore proof on-chain that the ciphertext encrypts the correct key for `(app_id, A)`.
  - Public verifiability shipped in contract 3.8.0 (2026-04-02; PRs #2483, #2495), after the 2026-02-23 blog post that called it "planned".
- **`derived_public_key` on a CKD domain returns the root BLS key unchanged** (`api/keys.rs`; live call in §4). For BLS, the path enters through `app_id`, not through a key tweak.

### 1.3 Latency, failure modes, timeouts, threshold

**Measured latency (PRIMARY, on-chain).** Request receipt block to yield-callback block, from NearBlocks v3 `/accounts/{signer}/receipts`. Testnet: 2,100 receipts over 1.32 h. Mainnet: 2,000 receipts over 0.72 h, ending 2026-11-11 ≈19:28 UTC.

| Request | Network | n | Success | Blocks: median / p90 / max | Seconds: median / p90 / max |
|---|---|---|---|---|---|
| `sign` | testnet | 599 | 599 | 6 / 8 / 22 | 3.7 / 4.9 / 14.5 |
| `sign` | mainnet | 601 | 601 | 6 / 8 / 25 | 3.6 / 4.8 / 14.7 |
| `request_app_private_key` | testnet | 1 | 1 | 7 | 4.3 |
| `request_app_private_key` | mainnet | 2 | 2 | 6, 8 | 4.1, 5.9 |
| `verify_foreign_transaction` | testnet | 22 | 22 callbacks (3 were timeouts) | 7 / 13 / **201** | 4.3 / 8.2 / **121.3** |
| `verify_foreign_transaction` | mainnet | 50 | 50 | 7 / 9 / 25 | 4.0 / 5.2 / 13.7 |

- Testnet had three `fail_on_timeout` receipts in the window, all on `verify_foreign_transaction`, at 201 blocks (116.6–121.3 s).
- This confirms the 200-block yield timeout is about 2 minutes at today's block time (derived block time ≈ 0.6 s).
- The CKD sample is small (n = 3). Treat "≈ 4–6 s" as indicative only.

**Node-side constants** (`crates/node/src/requests/queue.rs`; `deployment/testnet/*.toml`):

| Constant | Value |
|---|---|
| `REQUEST_EXPIRATION_BLOCKS` | `200` ("equal to the yield-resume timeout") |
| `ckd.timeout_sec` (per-attempt protocol timeout) | `60` |
| `MAX_ATTEMPTS_PER_REQUEST_AS_LEADER` | `10` |
| `LEADER_FAILOVER_INTERVAL` | `10 s` |
| `MAX_LEADER_FAILOVER_DEPTH` | `4` |

**Failure modes from the source** (`api/common.rs`, `api/ckd.rs`, `state.rs`):

| When | Failure | Behaviour |
|---|---|---|
| At request | `DomainNotFound` or `WrongDomainPurpose` | Panics immediately |
| At request | `InsufficientGas` (prepaid < 15 TGas) | Panics immediately |
| At request | Deposit < 1 yocto | Panics immediately |
| At request | `TeeValidationFailed` (`accept_requests == false`) | Panics immediately |
| At request | `ProtocolStateNotRunningNorResharing` (contract `Initializing`, e.g. during the pending mainnet domain addition) | Panics immediately |
| At request | `app public key check failed` (PV key not consistent) | Panics immediately |
| At request | `PendingRequestQueueFull` (> 128 identical pending) | Panics immediately |
| After acceptance | No response in 200 blocks (node liveness, a single participant stalling, keygen or resharing interruptions) | Callback `Err`, then `fail_on_timeout` panics with `Timeout` |
| After acceptance | PV only: the response fails `ckd_output_check` | That `respond_ckd` is rejected, so the request eventually times out unless an honest leader responds |

Prior research (B3) adds that there is no identifiable abort, so one node can DoS.

**Threshold and participants (PRIMARY, live `state`).**
- **Both networks: 16 participants, `threshold: 11`, every domain `reconstruction_threshold: 11`.**
- The 11-of-17 versus 11-of-16 conflict is a timing difference. SECONDARY (Tomescu notes, updated to 2026-10-23): epoch 13 (2026-09-17) was **17 / 11**, and epoch 14 (2026-10-22) became **16 / 11** after one node was removed.
- Live mainnet keyset is now epoch 16, still 16 / 11. NEAR's "11 out of 17" X article (2026-10-22 repost) is out of date.
- Mainnet participants (account IDs): multichain-mainnet-aurora, near-mpc-staking4all-01, nodemonster, n1-multichain, everstake-mpc-1, stakin-mpc, mpch-01, svrn-01, greenfield-mpc01, natsai-mpc, hashkeympc, astrostakers-mainnet, klever-nearmpc-01, nansen-ai-mpc, bitwise-mpc01, mpc-lgns (all `.near`).

### 1.4 CKD as identity-based encryption ("Option B")

- **No explicit statement.**
  - The NEAR One post (2026-02-23), the CKD design doc, the contract README, the threshold-signatures README and a grep of the whole `near/mpc` repo for "identity-based", "IBE" and "Boneh-Franklin" turned up **nothing** about encrypting to an `(app_id, path)` identity using only the MPC public key.
  - There is no API, construction or test vector for it (PRIMARY, negative result).
- **Implicit endorsement (PRIMARY, blog).** The post's "Applications" section says:
  - "A smart contract could encrypt data under a key that is only derivable once certain on-chain conditions are met".
  - It cites sealed-bid auctions, delayed reveals and scheduled disclosures.
  - Encrypting to a key that does not yet exist is only possible with an IBE-style construction, so NEAR One is gesturing at Option B without specifying it.
- **Feasibility (derived).**
  - The CKD output is `σ = msk·H(pk‖app_id) ∈ G1`, with `pk = msk·G2` public, and `app_id` is computable by anyone from `(KeyPolicy account, path)`.
  - That is exactly Boneh–Franklin IBE key extraction in the asymmetric setting (identity hashed to G1, master public key in G2).
  - Encrypt: pick `r`, set `U = r·G2` and `K = e(H(pk‖app_id), pk)^r`, and send `(U, AEAD_{KDF(K, U, app_id)}(m))`.
  - Decrypt: `e(σ, U) = K`.
  - The room would obtain `σ` through CKD exactly as in Option A.
  - So a seller could seal `DEK_g` straight to the identity `(keypolicy-v1, listing/{…}/v{n})` with no provisioning job.
- **Precedent (SECONDARY).** drand's **tlock** (ePrint 2023/189) uses threshold-BLS signatures as Boneh–Franklin IBE keys. Its `bls-unchained-g1-rfc9380` scheme ("quicknet") has signatures on **G1** and the public key on **G2**, the same group layout as NEAR CKD. The Rust `tlock` crate supports "public key on G1 and G2". The DST and message format differ from NEAR's, so it cannot be used unchanged.
- **Risks to review before adopting.**
  - Needs a CCA-secure transform (FO/FullIdent as in tlock, or KEM + AEAD with the ciphertext bound into the key derivation).
  - The same `σ` acts both as an IBE decryption key and as HKDF input. Use dedicated paths for IBE identities.
  - The identity is bound for good to domain 2's `pk`. Option A's `pk_L` has the same dependency.
  - Not post-quantum.
- **Verdict.** It is cryptographically sound in principle but unsupported by NEAR. Keep Option B gated behind a crypto review (SPEC OQ5), as SDD §3.12.3 step 5 already says. Cite the blog's time-lock use case as the strongest official signal.

### 1.5 Client libraries and examples

| What | Language | Where | Label |
|---|---|---|---|
| `ckd-example-cli`: generates request args, accepts the response, verifies, applies HKDF. Has a `--publicly-verifiable` flag. | Rust | `near/mpc/crates/ckd-example-cli` (README shows full JSON in and out) | PRIMARY |
| Protocol and math: `ckd()`, `ckd_pv()`, `hash_app_id_with_pk`, `CKDOutput::unmask` | Rust | `near/mpc/crates/threshold-signatures/src/confidential_key_derivation*` | PRIMARY |
| Test vectors for both variants (`a`, `app_id`, `app_pk1/2`, `big_c`, `big_y`, `hash_point`, `msk`, `pk`, `s`, `sig`) with an encoding block | JSON | `near/mpc/crates/threshold-signatures/tests/vectors/ckd_test_vectors.json` | PRIMARY |
| On-chain verification template (`app_public_key_check`, `ckd_output_check`) using NEAR BLS host functions | Rust (near-sdk) | `near/mpc/crates/contract/src/primitives/ckd.rs` | PRIMARY |
| Production client: ephemeral G1 key, request through a proxy contract, local `app_id` recompute, decrypt, pairing check, HKDF | Rust | `fastnear/near-outlayer` (now `out-layer/outlayer`), `keystore-worker/src/mpc_ckd.rs` (1,951 lines; uses `bls12_381`, DST `"NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_"`) | PRIMARY (OutLayer code) |
| TypeScript or near-api-js helper | — | None found (npm and web search). The `near/mpc` changelog's "ts crate" means the *threshold-signatures* crate. | — |

For a TS room worker (derived): implement with any BLS12-381 library that supports RFC 9380 G1 hash-to-curve with a custom DST plus pairings (e.g. `@noble/curves`), then pass the `near/mpc` test vectors in CI.

### 1.6 Recommended SDD changes for OI-1 (derived from the above)

1. **§1.5 / §5.5 S-1 / §6.** CKD is live on testnet, so the HDP default can be `Ckd`. RoomSealed becomes the fallback only. S-1 shrinks to "obtain and verify a key from a test contract", with no availability check needed.
2. **§3.12.2.** Set `mpc = v1.signer-prod.testnet` (testnet) and `v1.signer` (mainnet), and `ckd_domain_id = 2` on both.
   - Note that domain choice is part of key identity: domain 6 on testnet is a *different* key.
   - Fix it at init and never change it in place. Changing it is equivalent to a new `app_id`, so it needs migration.
3. **§3.12.3 step 3.** Replace "to be confirmed" with the following.
   - Call `request_app_private_key` with `{"request":{"derivation_path":path,"app_public_key":{"AppPublicKeyPV":{"pk1":A1,"pk2":A2}},"domain_id":2}}`.
   - Attach `NearToken::from_yoctonear(1)`, static gas ≥ 30 TGas, and `unused_gas_weight(1)`. Because KeyPolicy is immutable, the extra headroom lets relayers attach more gas if MPC governance raises the 15 TGas floor.
   - Chain `.then(on_derived(ticket_id))` with about 10 TGas.
   - `on_derived` takes `#[callback_result] Result<CKDResponse, PromiseError>`. On `Ok` it marks the ticket used, emits `key_released{ticket, app_id, Y, C}`, and returns the response. On `Err` it does **not** burn the ticket: it allows a retry until `expires_height`.
   - Recommended relayer transaction gas is about 100 TGas.
4. **Prefer the PV variant.** It costs about 8 TGas more, but the MPC contract then checks the output on-chain, which gives sellers and watchers a public record that every key release was well-formed. The room must still run its local check, because it reads the response over RPC.
5. **§3.12.3 step 4 must use the exact check:**
   - `app_id = SHA3-256("near-mpc v0.1.0 app_id derivation:" ‖ keypolicy_account ‖ "," ‖ path)`, **computed by the room, never read from the response**;
   - `H = hash_to_G1(pk_compressed ‖ app_id, DST "NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_")`;
   - `σ = C − a·Y`;
   - check `e(σ, G2) = e(H, pk)`;
   - `K_L = HKDF-SHA256(σ_compressed, salt="marginal/ckd/v1", info="listing-x25519")`.

   **Why the DR-5 argument holds (derived).** A response produced for any other caller has a different `app_id` and fails the pairing check. An old response for another app key `A'` decrypts to garbage.
6. **The app key is per job, in G1** (48-byte compressed), plus `A2 = a·G2` for PV.
7. **Timeouts.**
   - `job.deadline_height` must leave room for at least 2 CKD attempts of 200 blocks each, plus the ticket window.
   - Treat `TeeValidationFailed` and `ProtocolStateNotRunningNorResharing` as retryable: the MPC is temporarily unavailable.
   - Expect a mainnet outage window when domains 4–7 are added.
8. **PN-15.** Can be closed. The argument list is now verified against `near/mpc` 3.18.0 and live txs.
9. **§9.2 "CKD request rate limits are unknown".** No per-caller rate limit exists in the contract. The only limits are the 1-yocto deposit and a fan-out cap of 128 per identical request. Throughput was not measured.
10. **Room RPC list (§3.12.7, T27).** `rpc.testnet.near.org` returned `-429 "THIS ENDPOINT IS DEPRECATED … Switch to https://fastnear.com or alternative RPC providers"` for `EXPERIMENTAL_tx_status`. Do not use the near.org endpoints as one of the two cross-check RPCs.

---

## 2. OI-16: Chain Signatures payout guard

### 2.1 `sign` today (PRIMARY: source, README, live config, txs)

```rust
pub struct SignRequestArgs {            // crates/near-mpc-crypto-types/src/sign.rs
    pub path: String,
    #[serde(rename = "payload_v2")] pub payload: Payload,   // {"Ecdsa":"<hex 32 B>"} | {"Eddsa":"<hex 32..1232 B>"}
    pub domain_id: DomainId,            // legacy aliases still accepted: "payload":[u8;32] (ECDSA), "key_version"
}
pub enum SignatureResponse {            // #[serde(tag = "scheme")]
    Secp256k1(K256Signature),           // {"scheme":"Secp256k1","big_r":{"affine_point":"<33 B hex>"},"s":{"scalar":"<32 B hex>"},"recovery_id":u8}
    Ed25519 { signature: Ed25519Signature }, // {"scheme":"Ed25519","signature":[64 bytes]}
}
```

**Call requirements.**
- Call: `sign({"request":{"path":…,"payload_v2":{…},"domain_id":0|1}})`.
- Deposit ≥ **1 yocto**. Prepaid gas ≥ **15 TGas** (live config; the README's 10 TGas is stale). The yield callback is 7 TGas.
- Observed: a testnet `sign` with 20 TGas attached burned 4.63 TGas, and the callback burned 3.83 TGas.
- The returned value of the promise (and the transaction) is the `SignatureResponse` JSON. Real testnet example: `{"scheme":"Ed25519","signature":[245,194,…]}`.
- ECDSA payloads must be a valid secp256k1 scalar (checked at request time).

**Key derivation.**
- The signing key is the domain root plus a tweak: `tweak = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" ‖ predecessor ‖ "," ‖ path)`.
- Read the address with `derived_public_key{path, predecessor, domain_id}`.
- Live testnet example: `predecessor = clearing.example.testnet`, `path = payout/v1` gives `secp256k1:3cH36EGm…` (domain 0) and `ed25519:He458D1H…` (domain 1).
- **The address belongs to the calling contract (clearing).** Only clearing can sign for it. Clearing's code, and its upgrade path, *is* the policy.
- The response is verified on-chain before resume against `derived_public_key(path, predecessor, domain)`. The README warns that ECDSA recovery "returns some key even for forged signatures", so clients must compare the recovered key with the derived key. Reference code: `crates/near-mpc-signature-verifier`.

**Turning a signature into a foreign transaction.**

*EVM*
- Build an EIP-1559 tx (chain_id, nonce, max fees, gas, to, value, data) and sign `keccak256(0x02 ‖ rlp(fields))` with `Ecdsa` on domain 0.
- Assemble `r = big_r[1..33]`, `s`, and `yParity = recovery_id`.
- In-contract: `omni-transaction` 0.5.0 (`near/omni-transaction-rs`, pushed 2026-09-09) has `evm` builders.
- Off-chain: chainsig.js `Evm.prepareTransactionForSigning`, then `finalizeTransactionSigning`, then `broadcastTx`.
- PRIMARY: docs.near.org/chain-abstraction/chain-signatures/implementation.

*Solana*
- Sign the serialized **message bytes** (not a hash) with `Eddsa` on domain 1. The limit is 1,232 bytes (`EDDSA_PAYLOAD_SIZE_UPPER_BOUND_BYTES`).
- Insert the 64-byte signature into the tx.
- `omni-transaction` has `solana` builders (`SolanaTransactionBuilder` needs `payer` and `recent_blockhash`). chainsig.js has `Solana.prepareTransactionForSigning` and `finalizeTransactionSigning`, and its docs example uses `https://api.devnet.solana.com`.

*Library defaults*
- chainsig.js 1.1.16 (`NearDeFi/chainsig.js`, `src/contracts/ChainSignatureContract.ts`) calls `sign` with **300 TGas** and **1 yocto**, `domain_id: keyType==='Eddsa' ? 1 : 0`.
- Contract IDs: `v1.signer-prod.testnet` and `v1.signer`.
- `omni-transaction`'s own `SignRequest` type still uses the legacy `{payload:[u8;32], key_version}` shape, which works for ECDSA only.

**Testnets.**
- Signing is chain-agnostic. The testnet signer's keys can sign for Sepolia, Base Sepolia or Solana devnet; the chain ID or cluster lives inside the transaction.
- Testnet `sign` is live: 599 of 599 succeeded in 1.3 h.
- The official example uses Solana devnet.
- I found **no indexed evidence** of testnet-signed transactions landing on Sepolia or Base Sepolia (NearBlocks' testnet `/v3/multichain/signatures` index is empty), so "works on Sepolia" rests on construction plus docs (UNVERIFIED by observation).
- Pin domain IDs 0 and 1 explicitly. Testnet also has Sign domains 4 and 5, which are different keys and give different addresses.

### 2.2 New primitive: `verify_foreign_transaction` (destination-leg corroboration) (PRIMARY)

`crates/contract/src/api/foreign_chain/requests.rs`, `crates/near-mpc-contract-interface/src/types/foreign_chain*.rs`, archived design doc `docs/archive/design/foreign-chain-transactions.md`:

```rust
pub struct VerifyForeignTransactionRequestArgs {
    pub request: ForeignChainRpcRequest,           // Base(EvmRpcRequest) | Solana(SvmRpcRequest) | Arbitrum | Polygon | Bnb | …
    pub domain_id: DomainId,                       // a ForeignTx domain: 3
    pub payload_version: ForeignTxPayloadVersion,  // 1
    pub expected_payload_hash: Option<Hash256>,    // contract rejects a response whose payload_hash differs
}
pub struct EvmRpcRequest { pub tx_id: EvmTxId, pub extractors: UpperBoundedVec<EvmExtractor, 32>, pub finality: EvmFinality /* Latest|Safe|Finalized */ }
pub enum EvmExtractor { BlockHash, Log { log_index: u64 } }   // Log → EvmLog{address, topics, data, block_number, removed, …}
pub struct SvmRpcRequest { pub tx_id: SvmTxId, pub finality: SvmFinality /* Confirmed|Finalized */, pub extractors: … }
pub enum SvmExtractor { InnerInstruction { instruction_index, inner_instruction_index }, AccountState { pubkey } }
pub struct VerifyForeignTransactionResponse { pub payload_hash: Hash256, pub signature: SignatureResponse }
// payload_hash = SHA-256(borsh(ForeignTxSignPayload::V1 { request, values: Vec<ExtractedValue> })), signed by the domain-3 ROOT key (no tweak)
```

How it works:
- MPC nodes query every configured RPC provider, run the extractors, and sign. Same 1-yocto deposit and 15 TGas floor as `sign`.
- Anyone can call it. The signature is by the root key, so it does not depend on the caller.

**Live availability** (`get_available_foreign_chains`, same on both networks): `["Solana","Base","Bnb","Arbitrum","Abstract","Starknet","Polygon","HyperEvm","Aptos","Sui","Avalanche","Fogo"]`.
- **Ethereum and Bitcoin are not available.**
- Testnet providers (`allowed_foreign_chain_providers`) point at **Solana devnet** and **Base Sepolia**, BSC testnet and Arbitrum Sepolia, via Alchemy, QuickNode and Tatum, with `quorum: 2`.
- Mainnet latency: median 7 blocks (≈4 s). The main user is the Omni bridge prover (`mpc-prover-0_4_18.bridge.near`).

**Use for Marginal (derived).**
1. After a ChainSig payout is broadcast, clearing itself calls `verify_foreign_transaction`:
   - Base: `tx_id` plus `Log{log_index}` for the ERC-20 `Transfer(from = derived addr, to = seller, amount)`, at finality `Finalized`.
   - Solana: an `InnerInstruction` or `AccountState` extractor, at finality `Finalized`.
   - Set `expected_payload_hash` to the hash of the expected values.
2. A resolved promise means the destination leg is final under the MPC network's trust (quorum of RPC providers). Then move `PayoutPending` to `PayoutCompleted`.
3. This replaces the "k-of-n attesters" for **delivery** confirmation on supported chains.
4. It cannot check arbitrary pre-sign state. Every extractor is tx-scoped.

### 2.3 Price and asset sources on NEAR (PRIMARY: live calls + docs)

| Source | IDs | Live result (2026-11-11 UTC) | Verdict |
|---|---|---|---|
| Pyth | `pyth-oracle.near` / `pyth-oracle.testnet` | `get_price` (NEAR/USD feed `c415de…6750`) gives `null` on both. `get_price_unsafe` on mainnet gives `publish_time 1787699235` = **2026-08-25** (77.8 days old); testnet gives `None`. `get_stale_threshold` = 60. Pyth docs: "Pyth Core also no longer supports … NEAR …"; addresses removed. | **Dead on NEAR.** Do not use. |
| NearDefi oracle (Burrow) | `priceoracle.near` / `priceoracle.testnet` | `get_price_data` gives `price: null` for all 17 (mainnet) / 13 (testnet) assets (recency 90 s). Mainnet `get_assets`: latest `wrap.near` report about 232.8 days old (≈2026-03-24); stablecoins about 401 days old. | **Stale.** Do not use. |
| OutLayer TEE price oracle (listed on docs.near.org/primitives/oracles, "Pyth-compatible") | `price-oracle.near` / `price-oracle.testnet` | `get_price_data` gives all `null` (recency 600 s mainnet, 300 s testnet). `get_assets`: latest reports about 107 h old (≈2026-11-07) for eth/nbtc/zec/doge/ltc, and about 137 days for wrap.near and usdt. `get_price_unsafe` (NEAR/USD id) gives `null` on mainnet; the method is missing on testnet. | **Sparse.** Possibly request-driven (not verified). Third-party TEE trust. |
| RedStone | `redstone-near-connector-rs` 0.0.3 crate (`get_oracle_value` verifies a signed payload in-contract) | Not called. No 2026 NEAR announcement found. | Pull model. Maintenance UNVERIFIED. |
| Chainlink | — | No NEAR deployment found. | UNVERIFIED (negative). |
| 1Click quote (`dry: true`) | API | Off-chain only (prior notes). | Needs k-of-n attestation to reach a contract. |

Conclusion (derived):
- There is **no reliable on-chain push price feed on NEAR today**, mainnet or testnet.
- Keep the guard oracle-free:
  - ChainSig payouts only in the **same USD stablecoin** as settlement (USDC on Base or Solana);
  - cap = settlement amount in settlement units (SDD already computes notional from settlement);
  - destination asset fixed by a governance **asset registry** `(chain, asset) → token contract or mint, decimals`, with time-locked loosening.
- If a non-stable payout asset is ever needed, use a signed pull quote (RedStone payload, or a 1Click quote co-signed by k-of-n attesters) with a freshness bound, not Pyth or `priceoracle.near`.

### 2.4 Published policy-gated signing patterns

| Pattern | Policy | Label |
|---|---|---|
| Shade Agent Framework "on-chain guardrails" (`docs/concepts/security.md`, `terminology.md`) | "limiting transactions to specific functions, smart contracts, blockchains, or amounts", "usually implemented using omni-transaction-rs". Advises: allow re-signing after a failed tx "without allowing for more signing for the same action when the transaction is successful", and "Exercise caution with unsent signatures". The framework is deprecated (prior notes), but the guidance stands. | PRIMARY (NEAR docs repo) |
| Abstract DAO (`nearuaguild/abstract-dao`, `abstract-dao.testnet`, 2024) | The DAO approves a payload. The designated signer "cannot change any parameter of the transaction being signed besides setting a gas fee per chain" (`chain_id`, `max_fee_per_gas`, `max_priority_fee_per_gas`). Method `register_signature_request`, then `get_signature(request_id, other_payload)`. | PRIMARY (NEAR docs) |
| OutLayer vaults | Single-method scoped access key, immutable vault, exit window of 1–30 days. No spend caps documented. | PRIMARY (OutLayer docs) |
| Omni bridge (`omni.bridge.near`, the largest `sign` caller at 301 of 601 in the mainnet sample) | Bridge contract logic gates `sign`. Inbound legs use `verify_foreign_transaction`. | PRIMARY (on-chain) |
| Hackathon guards (Nov 2026): ChainProof Guard; `near-threshold-guardian` (2-of-3 FROST guardian above a limit); `baret`; `sana-guard` (Solana per-vault spend limits, 24 h caps, allowlists, expiry, kill switch) | Caps, allowlists, kill switch | SECONDARY (unaudited) |

### 2.5 Recommended payout-guard parameters (derived; monetary values belong to OI-11)

```rust
pub struct ChainSigRoute {            // governance registry; loosening is time-locked, tightening is immediate
    chain: ChainKind,                 // BaseSepolia(84532) | SolanaDevnet (testnet); Base(8453) | Solana (mainnet)
    asset: AssetRef,                  // Erc20{contract, decimals} | SplMint{mint, decimals}; USD stablecoin only in v1 canary
    sign_domain: u32,                 // 0 (secp256k1) for EVM, 1 (ed25519) for Solana — pinned
    verify_domain: u32,               // 3 (ForeignTx) — pinned
    path: String,                     // "payout/v1/{chain}" → clearing-derived treasury address (pre-funded)
    max_per_payout: u128, max_per_window: u128, window_secs: u64,   // settlement units (from SPEC §8.9 calibration)
    max_fee_per_gas_cap: u128, gas_limit_cap: u64,                  // EVM: bounds relayer-supplied fees
    finality: Finality,               // EVM Finalized; Solana Finalized
}
```

Rules:
1. **Build the tx in-contract** with `omni-transaction`. The relayer supplies only nonce or blockhash and fees within caps. The contract computes the hash or message and calls `sign` with 1 yocto and about 50 TGas static. The `to`, `amount` and asset come only from the settlement record and the seller's screened `PayoutRoute` (AC-47).
2. **One signature per payout nonce.**
   - EVM: store the nonce. Re-signing is allowed only for the same nonce (fee bump within cap), so at most one transaction can land.
   - Solana: re-sign only after `verify_foreign_transaction` shows non-inclusion and the previous blockhash has expired (expiry rule UNVERIFIED here), or use a durable-nonce account.
3. **Confirm delivery** with `verify_foreign_transaction` and `expected_payload_hash` before marking `PayoutCompleted`. On a 200-block timeout, retry with backoff. Funds remain accounted as `PayoutPending`.
4. **Keep the derived treasury funded** with the stablecoin and native gas (ETH on Base Sepolia, SOL on devnet) via Intents or Omni withdrawal. Add a per-route float cap so a clearing compromise is bounded by the float, not by total escrow.
5. **Blocklist and allowlist.** Destination address screening stays with the compliance `PayoutApproval`. The asset allowlist is the registry above. Drop "k-of-n attester corroboration of the destination asset" for chains that `get_available_foreign_chains` covers, and keep it only for adding registry entries.

---

## 3. Other findings worth noting

- **Third-party CKD key-release market use on mainnet.** A mainnet contract releases per-file keys on purchase via CKD (`file/<hash>` paths). That is close to Marginal's KeyPolicy pattern, which matters for the competitor notes.
- **Testnet has two CKD keys (domains 2 and 6).** Mainnet is voting to add the same second set. The rationale was not found in the repo, issues or blog.
- **SPICE** (the NEAR One blog, 2026-09-30, "Separating Consensus from Execution") could change block time and therefore the wall-clock length of the 200-block yield. Not investigated further.
- **NearBlocks API v1 was retired on 2026-11-05.** Use `/v3`. It needs no key at low rates, and I hit rate limits after about 25 calls.

## 4. RPC and API calls made (all read-only)

| # | Endpoint | Call | Key result |
|---|---|---|---|
| 1 | rpc.testnet.near.org | `view_account v1.signer-prod.testnet` | code_hash `CpGX8ywX…ERJ`, height 277257047 |
| 2 | rpc.mainnet.near.org | `view_account v1.signer` | code_hash `CpGX8ywX…ERJ`, height 224106778 |
| 3–4 | same | `version` | `"3.18.0"` on both |
| 5–6 | same | `config` | `ckd_call_gas_attachment_requirement_tera_gas: 15`, `sign_call_gas_attachment_requirement_tera_gas: 15`, `return_ck_and_clean_state_on_success_call_tera_gas: 7`, `fail_on_timeout_tera_gas: 2`, `key_event_timeout_blocks: 150` (identical except `launcher_hash_unused_ttl_seconds` 1814400 vs 1209600) |
| 7–8 | same | `state` | `Running`; domains as in §1.1. 16 participants, threshold 11. Mainnet `add_domains_votes` = 15 voters for ids 4–7. |
| 9 | api-testnet.nearblocks.io | `/v1/account/…/txns` | `"API v1 was retired on 2026-11-05. Use /v3"` |
| 10–12 | api(-testnet).nearblocks.io | `/v3/accounts/{signer}/txns` (pages) | Testnet: 1,100 txns over 1.48 h including 2 `respond_ckd`. Mainnet: 100. |
| 13–14 | rpc.testnet.near.org | `EXPERIMENTAL_tx_status` on the two `respond_ckd` txs | args `{"request":{"app_public_key":{"AppPublicKeyPV":…},"app_id":[80,188,…],"domain_id":2},"response":{…}}`; burnt 24.38 / 24.42 TGas |
| 15 | api-testnet.nearblocks.io | `/v3/accounts/v1.signer-prod.testnet/contract/request_app_private_key/action` | last call: gas 85,688,357,872,715, deposit `"1"`, `domain_id 2`, PV key, path `muhra-otp/v1/…` |
| 16–17 | api(-testnet).nearblocks.io | `/v3/accounts/{signer}/receipts` (21 + 20 pages) | latency data in §1.3 |
| 18 | rpc.testnet.near.org | `EXPERIMENTAL_tx_status GGZjFrnk…` | `-429 "THIS ENDPOINT IS DEPRECATED"` |
| 19 | test.rpc.fastnear.com | `EXPERIMENTAL_tx_status GGZjFrnk…` (sender `nzkrelayer-bc5188a2.testnet`) | trace in §1.2 |
| 20 | api.nearblocks.io | `/v3/accounts/v1.signer/contract/request_app_private_key/action` and `…/sign/action` | mainnet CKD (domain 2, private variant, gas 285.8 TGas, 1 yocto); `sign` legacy args `{payload:[…], key_version:0}` |
| 21 | free.rpc.fastnear.com | `EXPERIMENTAL_tx_status CR5DXsei…` | private-variant trace: 4.54 TGas request, 3.77 TGas callback |
| 22–23 | fastnear | `get_available_foreign_chains` | the 12 chains listed in §2.2 (same on both networks) |
| 24–25 | test.rpc.fastnear.com | `get_foreign_chains_configs`, `allowed_foreign_chain_providers` | testnet providers on Solana devnet, Base Sepolia, BSC testnet, Arbitrum Sepolia, …; `quorum: 2` |
| 26–29 | test.rpc.fastnear.com | `derived_public_key{path:"payout/v1", predecessor:"clearing.example.testnet", domain_id:0/1}`; `{…, domain_id:2}`; `public_key{domain_id:2}` | `secp256k1:3cH36EGm…onq`; `ed25519:He458D1H…Ax5`; domain 2 returns the root `bls12381g2:xeYho48G…` for both |
| 30 | test.rpc.fastnear.com | `EXPERIMENTAL_tx_status` on a `tx-bench.testnet` `sign` | Ed25519 response JSON; 20 TGas attached; 4.63 + 3.83 TGas burnt |
| 31–34 | fastnear | `priceoracle.near` / `.testnet` `get_price_data`, `get_assets` | all prices null; latest reports in §2.3 |
| 35–38 | fastnear | `pyth-oracle.near` / `.testnet` `get_price`, `get_price_unsafe`, `get_stale_threshold` | null; publish_time 1787699235; 60 |
| 39–42 | fastnear | `price-oracle.near` / `.testnet` `view_account`, `get_price_unsafe`, `get_price_data`, `get_assets` | all null; reports in §2.3; testnet `MethodNotFound` for `get_price_unsafe` |
| 43–44 | api(-testnet).nearblocks.io | `/v3/multichain/signatures`, `/stats` | testnet empty (0); mainnet 1,086 txns, 7 chains |

Full public keys:
- Testnet domain 2: `bls12381g2:xeYho48G2Sr9oJz4gw9sLGZGspeeKpHZvMDAwWvoNTRnVMFJH96GxX98TT2MRhTtsot1wcGR1Ti2Xh8PCsbYJ2enbLNdJXDvTYSK8aTE3nJ5NZXU7Kt1F6mFtReWs5pR4kj`
- Testnet domain 6: `bls12381g2:mVEM6WaLvzZeaREHTizq9DA44DiWWL61HVjyDzKFmyoiEBw54xCe5MKqwfDVUbNJtYcDtNB2V3A28HJYY7Zb6tLXeq6wWMginGJpNryJgoNDhzLpgM7UtB9wYkmiDWXUrYf`
- Mainnet domain 2: `bls12381g2:24mhN4RnB2CbiUkAfukyh4s1CT6dUNd9Pc8kRnL4LvAP3tcxhUupbphmfbmwHSi66aFCiZkMgiH2KqXWJLD7JUeAFhoLS3WQbzWcpUzhERLqxyocwT9Xrd4WNvEuKavxmXdR`

## 5. Sources

**PRIMARY**
- `near/mpc` @ `2bccb88` / tag `3.18.0`. Files read:
  - `crates/contract/src/api/{ckd,sign,common,keys}.rs`
  - `crates/contract/src/api/foreign_chain/requests.rs`
  - `crates/contract/src/primitives/ckd.rs`
  - `crates/contract/src/state.rs`
  - `crates/contract/README.md`
  - `crates/near-mpc-contract-interface/src/{deposits,method_names}.rs`
  - `crates/near-mpc-contract-interface/src/types/{ckd,foreign_chain}.rs` and `…/foreign_chain/{request,rpc_request}.rs`
  - `crates/near-mpc-crypto-types/src/{ckd,kdf,primitives,crypto,sign}.rs`
  - `crates/threshold-signatures/src/confidential_key_derivation{.rs,/README.md,/ciphersuite.rs}`
  - `crates/threshold-signatures/src/crypto/constants.rs`
  - `crates/threshold-signatures/docs/confidential_key_derivation/confidential-key-derivation.md`
  - `crates/threshold-signatures/tests/vectors/ckd_test_vectors.json`
  - `crates/ckd-example-cli/README.md`
  - `crates/near-mpc-sdk/src/{sign,foreign_chain}.rs`
  - `crates/node/src/requests/queue.rs`
  - `deployment/testnet/*.toml`
  - `docs/archive/design/foreign-chain-transactions.md`
  - `docs/design/attestation-verifier-contract.md`
  - `CHANGELOG.md`
  - https://github.com/near/mpc (accessed 2026-11-12)
- Live contract state and txs listed in §4 (2026-11-11 UTC).
- NEAR One, "Confidential Key Derivation in the MPC Network", https://blog.nearone.org/research/2026/02/23/mpc-ckd.html (2026-02-23)
- NEAR One blog index, https://blog.nearone.org/ (accessed 2026-11-12); "Benchmarking Threshold Signature Schemes" (2026-03-29, no end-to-end latency numbers)
- docs.near.org: /chain-abstraction/chain-signatures; /chain-abstraction/chain-signatures/implementation; /chain-abstraction/chain-signatures/tutorials/multichain-dao/2-signing; /primitives/oracles; /primitives/off-chain-compute/outlayer.md (all undated, accessed 2026-11-12)
- NearDeFi/chainsig.js v1.1.16 (`src/contracts/ChainSignatureContract.ts`, `src/contracts/constants.ts`, `src/constants.ts`), https://github.com/NearDeFi/chainsig.js (pushed 2026-05-11)
- near/omni-transaction-rs v0.5.0, https://github.com/near/omni-transaction-rs (pushed 2026-09-09)
- NearDeFi/shade-agent-framework docs (`docs/concepts/security.md`, `terminology.md`, `docs/blog/2026-02-23.md`), https://github.com/NearDeFi/shade-agent-framework
- nearuaguild/abstract-dao README, https://github.com/nearuaguild/abstract-dao (2024-10-28)
- Pyth contract addresses page, https://docs.pyth.network/price-feeds/core/contract-addresses/near (accessed 2026-11-12)
- OutLayer: `keystore-worker/src/mpc_ckd.rs`, https://github.com/fastnear/near-outlayer (pushed 2026-11-11); https://app.outlayer.ai/docs/vaults (undated)
- NearBlocks API v3 migration guide, https://api-testnet.nearblocks.io/api-docs/migration (accessed 2026-11-12)

**SECONDARY**
- Alin Tomescu, "Notes on NEAR's MPC", https://alinush.github.io/near (2026-05-01, updated to 2026-10-23)
- tlock crate README, https://docs.rs/crate/tlock/0.0.10/source/README.md ; dee CLI (`bls-unchained-g1-rfc9380`), https://crates-io.ganymede-static.progval.net/crates/dee/0.0.14
- redstone-near-connector-rs 0.0.3, https://rust-digger.code-maven.com/src/redstone-near-connector-rs-0.0.3/README.md
- Hackathon guard repos: github.com/jayanth-kumar-morem/chainproof-guard, github.com/exocognosis/near-threshold-guardian, github.com/Aeztrest/baret, github.com/0xjume/sana-guard (all 2026-11)

## 6. Query log (in order)

1. Read SDD §11, §3.12, §3.9, §3.6, §3.21, §5.5, §6 and spec-notes/near-primitives.md.
2. git clone (read-only, depth 50) github.com/near/mpc to scratchpad.
3. RPC view_account on both signers.
4. Read contract `api/ckd.rs`, interface `types/ckd.rs`, `deposits.rs`, `method_names.rs`.
5. Read crypto-types `ckd.rs`, `kdf.rs`, `primitives.rs`, `crypto.rs`.
6. Read threshold-signatures CKD README and design doc; ckd-example-cli README.
7. Read contract README (usage and API).
8. RPC `version`, `config`, `state` on both networks (rpc.*.near.org).
9. Parse state: domains, participants, votes.
10. grep CHANGELOG and docs for domain additions (rationale not found).
11. Read `api/sign.rs`, `api/common.rs`, `pending_requests.rs`.
12. grep yield and timeout; read `node/src/requests/queue.rs`, `config.rs`.
13. NearBlocks v1 call (retired), then v3 txns paging (testnet 12 pages, mainnet 1).
14. RPC `EXPERIMENTAL_tx_status` on 2 `respond_ckd` txs.
15. NearBlocks v3 `contract/request_app_private_key/action` (testnet).
16. NearBlocks v3 receipts paging (testnet); latency script.
17. Local SHA3 recompute of `app_id` (match).
18. NearBlocks `/v3/txns/GGZjFrnk…`; RPC tx status (near.org gave -429, so FastNEAR).
19. NearBlocks v3 mainnet CKD and `sign` actions; mainnet receipts paging (background); latency.
20. Read near-mpc-sdk `sign.rs` and `foreign_chain.rs`; foreign-chain request/response/extractor types.
21. RPC `get_available_foreign_chains` (both), `get_foreign_chains_configs`, `allowed_foreign_chain_providers` (testnet).
22. grep repo for IBE, identity-based, Boneh-Franklin (none); CHANGELOG CKD entries; `gh api` PR #2392.
23. WEBSEARCH (extended): NEAR confidential key derivation CKD identity-based encryption encrypt to app_id MPC public key
24. FETCH docs.near.org/chain-abstraction/chain-signatures
25. FETCH blog.nearone.org/research/2026/02/23/mpc-ckd.html (IBE, status)
26. FETCH alinush.github.io/near (CKD status)
27. FETCH blog.nearone.org/…/mpc-ckd.html (time-lock paragraph)
28. WEBSEARCH: chainsig.js NEAR chain signatures library … prepareTransactionForSigning
29. WEBSEARCH: omni-transaction-rs NEAR build EVM Solana Bitcoin transaction in smart contract
30. Read mainnet latency output.
31. FETCH docs.near.org/chain-abstraction/chain-signatures/implementation
32. `gh api` NearDeFi/chainsig.js: repo, tree, `ChainSignatureContract.ts`, constants, `package.json`, Solana adapter.
33. `gh api` near/omni-transaction-rs: repo, tree, `Cargo.toml`, `signer/types.rs`, Solana builder.
34. Read contract `sign.rs` types (`SignRequestArgs`, `SignatureRequest`, `K256Signature`).
35. RPC `derived_public_key` (domains 0, 1, 2), `public_key{2}`; read `api/keys.rs`.
36. RPC tx status of a testnet `sign` (Ed25519 response).
37. WEBSEARCH: Pyth Network NEAR contract address pyth-oracle.near …
38. WEBSEARCH: priceoracle.near NEAR price oracle contract get_price_data …
39. FETCH docs.pyth.network/price-feeds/core/contract-addresses/near
40. FETCH docs.near.org/primitives/oracles
41. RPC `priceoracle.near` / `.testnet` `get_price_data`, `get_assets`.
42. RPC `pyth-oracle.near` / `.testnet` `get_price`, `get_price_unsafe`, `get_stale_threshold`.
43. RPC `price-oracle.near` / `.testnet` `view_account`, `get_price_unsafe`, `get_price_data`, `get_assets`.
44. WEBSEARCH: OutLayer price oracle price-oracle.near TEE NEAR Pyth-compatible docs
45. FETCH docs.near.org/primitives/off-chain-compute/outlayer.md
46. `gh api` fastnear/near-outlayer tree; fetch `keystore-worker/src/mpc_ckd.rs`.
47. Read near/mpc `ciphersuite.rs` DST, `crypto/constants.rs`, contract `primitives/ckd.rs`.
48. `gh api` search issues near/mpc "vote_add_domains" mainnet; "new domains TEE keygen mainnet".
49. WEBSEARCH (extended): NEAR MPC chain signatures new keys generated inside TEE domains rotation mainnet 2026
50. FETCH alinush.github.io/near (epoch table)
51. WEBSEARCH (extended): NEAR chain signatures smart contract spending limit allowlist policy multisig …
52. WEBSEARCH: Shade Agent framework 2.0 policy chain signatures request_signature …
53. FETCH docs.near.org/…/multichain-dao/2-signing
54. FETCH docs.near.org/ai/shade-agents/concepts/security (page replaced; no guardrail text)
55. `gh api` shade-agent-framework docs tree; grep restrict and guardrail; read `security.md`.
56. `gh api` search repositories (abstract-dao, chain-sig guards); read abstract-dao README.
57. NearBlocks + RPC trace of mainnet CKD tx `CR5DXsei…`.
58. grep near/mpc for domain removal (none); `vote_add_domains`.
59. WEBSEARCH (extended): "request_app_private_key" NEAR docs confidential key derivation tutorial
60. WEBSEARCH: site:blog.nearone.org MPC 2026
61. FETCH blog.nearone.org/ (index)
62. FETCH nearone.org/r&d/2026/03/29/benchmarking-models.html (404); FETCH blog.nearone.org/r&d/2026/03/29/benchmarking-models.html
63. WEBSEARCH: RedStone oracle NEAR Protocol contract native NEAR integration 2026
64. WEBSEARCH: npm NEAR CKD confidential key derivation javascript typescript …
65. Read `ckd_test_vectors.json` `_encoding`.
66. WEBSEARCH: drand tlock bls-unchained-g1-rfc9380 … Boneh-Franklin timelock
67. NearBlocks v3 `/multichain/signatures` and `/stats` (testnet, mainnet).
68. Read `K256AffinePoint` and `K256Scalar` serde.
69. FETCH app.outlayer.ai/docs/vaults (policy)
70. Read `state.rs` `is_running_or_resharing`, `domain_registry`.
71. Read node deployment configs (`ckd.timeout_sec`) and queue constants.
72. `gh api` near/mpc tag 3.18.0 cross-check of `ckd.rs` and `kdf.rs`.

Totals: 14 web searches, 17 web fetches (1 returned 404; the NearBlocks migration-guide fetches are counted here), about 45 RPC and NearBlocks read calls, about 25 read-only GitHub API calls, plus local source reading.
