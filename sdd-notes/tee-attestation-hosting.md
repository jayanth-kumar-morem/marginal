# TEE attestation and hosting: OI-2, OI-3, OI-4

*Prepared 2026-11-12 for SDD.md §11. Research only. Nothing was built, deployed, signed up for, bought or posted. Every network call was a read-only public endpoint that needs no account: GitHub, public NEAR RPC views, Phala's public instance-type and PPID endpoints, and the Azure Retail Prices API.*

**Builds on** `spec-notes/tee-security.md` (N5, N19, N21, N22, N28) and `spec-notes/near-primitives.md` (A4, A5, A7, B6). It does not repeat what those settle.

**Labels.**
- PRIMARY: official docs, source code at a pinned commit, official pricing pages or APIs, or live chain state.
- SECONDARY: press, third-party blogs or aggregators.
- UNVERIFIED: search snippet only, or not confirmed.
- DERIVED: my arithmetic or inference from PRIMARY facts.

**Source trees read** (shallow clones, read-only, never executed), at `/private/tmp/claude-501/-Users-jay-Desktop-work-near-hackathon-marginal/49238a8f-e25b-410a-8b4c-4a5af5a726df/scratchpad/research/tee/`:

| Repo | Commit | Commit date |
|---|---|---|
| `near/mpc` | `2bccb8844a17e7e7236f84dd76da1ffb4403a36f` | 2026-11-11 |
| `Dstack-TEE/dstack` | `7a83895bb8c48522772fa32b53adf08d04ff7c94` | 2026-11-11 (latest release 0.6.3, 2026-11-01) |
| `Phala-Network/dcap-qvl` | `05c200b752ecb824b73e5b1ae63cc047f1702ab2` | 2026-11-03 (= v0.7.1) |
| `NearDeFi/shade-agent-framework` | `35758f354ad9862fb590daf9843fea4974d52549` | 2026-10-14 |

---

## 0. Status at a glance

| OI | Status | One-line answer |
|---|---|---|
| OI-2 | **Resolved** (a testnet run is still recommended) | DCAP verification costs **~122–124 Tgas** with dcap-qvl ≥ 0.6.5 (175.8 Tgas on mainnet with 0.6.3). NEAR now allows **1,000 Tgas per call**. Args are ~25–40 KB against a 4 MiB limit. **No split and no collateral cache are needed.** NEAR One already runs a **locked, stateless `tee-verifier` contract on testnet and mainnet** that KeyPolicy can call. |
| OI-3 | **Partially resolved** (spike S-4 must still confirm `key_provider: none` and the PPID on a live Phala CVM) | Cheapest real TDX quote with dstack compose-hash measurement: **Phala Cloud**, at tdx.medium $0.116/h or tdx.large $0.232/h (public API, 2026-11-12). Its quotes embed the PCK chain, so the PPID is present, and Phala publishes its PPID list. GCP is $0.2225/h but binds the dstack OS through the vTPM, not the TDX quote. Azure's paravisor breaks the design. AWS has no TDX. Bare metal costs ~$880–950/month. |
| OI-4 | **Resolved** | Yes. Set `kms_enabled: false` with `key_provider: "none"` (also implied by `local_key_provider_enabled: false`): dstack then generates throwaway random app keys and records `{"name":"none","id":""}` in RTMR3. With `allowed_envs: []`, every host-supplied env var is dropped. Exact compose and on-chain checks are in §3.7. |

---

## 1. OI-2: `dcap-qvl` gas on NEAR, collateral size, and whether to split

### 1.1 How `near/mpc` verifies TDX quotes today (PRIMARY, source and PRs)

**Architecture history.**

1. Until mid-2026, `mpc-contract::submit_participant_info` called `dcap_qvl::verify::verify` **synchronously inside the MPC contract**.
2. PR **#3714** (merged 2026-07-22) moved verification into a separate **stateless `tee-verifier` contract**. `submit_participant_info` now makes a cross-contract call with a callback.
3. The stated reason was **WASM size, not gas**:
   > "`dcap-qvl` and its transitive dependencies account for ~310 KB of the compiled `mpc-contract` WASM … close to NEP-509's `max_transaction_size` of 1.5 MiB."

   Measured: 1,513,344 → 1,202,840 bytes, or −310,504 (−20.5%). Sources: `docs/design/attestation-verifier-contract.md` and https://github.com/near/mpc/pull/3714.

**Verifier contract** (`crates/tee-verifier/src/lib.rs`):
- It is stateless, has no admin, and is deployed to a **locked account** (no access keys, so it can never be redeployed).
- It exposes two methods, both taking borsh `(QuoteBytes, Collateral)`:
  - `verify_quote` wraps `dcap_qvl::verify::verify(&quote, &collateral, block_ts_secs)`.
  - `verify_quote_with_collateral_dates` wraps `QuoteVerifier::new_prod().verify_with_policy(.., &QuotePolicy::claims_only(now))` and also returns the collateral validity window.
- A rejection is returned **as a value** (`VerificationResult::Rejected`), not as a failed receipt, so the caller's callback can tell "rejected" from "verifier unreachable".
- Excerpt:

```rust
// near/mpc @2bccb88 crates/tee-verifier/src/lib.rs
#[result_serializer(borsh)]
pub fn verify_quote(&self, #[serializer(borsh)] quote: QuoteBytes,
                    #[serializer(borsh)] collateral: Collateral) -> VerificationResult {
    let now_seconds = now_seconds();               // env::block_timestamp_ms()/1000
    match dcap_qvl::verify::verify(&quote_bytes, &collateral, now_seconds) {
        Ok(report) => VerificationResult::Verified(report.into_interface_type()),
        Err(err)   => VerificationResult::Rejected(VerifierError::DcapVerification(err.to_string())),
    }
}
// wasm32: getrandom::register_custom_getrandom!(randomness_unsupported) — dcap-qvl's
// `contract` feature pulls getrandom but verification must never draw randomness.
```

**Caller side** (`crates/contract/src/api/attestation.rs`):
- `submit_dstack_attestation` makes the call `ext_tee_verifier::ext(verifier).with_static_gas(Gas::from_tgas(config.verifier_tera_gas)).with_unused_gas_weight(0).verify_quote_with_collateral_dates(quote, collateral)`.
- It chains `.then(resolve_verification)`, which runs the post-DCAP checks (§3.6) and stores the result.
- **Collateral is passed in by the node on every submission. It is not cached on-chain.**
- The stored attestation expires at the collateral's `earliest_expiration_date` (issue #1639, PR #4910).

**Gas constants** (`crates/contract/src/config.rs`):

```rust
/// Gas attached to the cross-contract `verify_quote_with_collateral_dates` call on the TEE verifier.
const DEFAULT_VERIFIER_TERA_GAS: u64 = 200;
/// Prepaid gas for the `resolve_verification` callback. Carries the bulk of the
/// post-DCAP work (allowlist match, RTMR3 replay, app-compose validation, store).
const DEFAULT_RESOLVE_VERIFICATION_TERA_GAS: u64 = 60;
```

**Gas guard test.** `crates/contract/tests/sandbox/tee_verifier.rs::assert_verifier_gas_headroom` fails CI if DCAP burns more than 90% of the 200 Tgas budget, i.e. more than 180 Tgas. A companion test with a 10 Tgas budget asserts a clean failure (OOG).

**Measured gas** (all PRIMARY, from near/mpc issues and PRs):

| Date | dcap-qvl | Environment | Receipt / method | Tgas burnt | Source |
|---|---|---|---|---|---|
| 2026-07-22 | 0.6.x | real-TDX e2e | `verify_quote` | **~173**. The old 100 Tgas default hit "Exceeded the prepaid gas". | https://github.com/near/mpc/issues/3897 |
| ~2026-09-23 | 0.6.3 | **mainnet** (`v1.signer` → `tee-verifier-2026-08-04.near`) | `submit_participant_info` | 16.28 | https://github.com/near/mpc/issues/4519 |
| same | 0.6.3 | mainnet | `verify_quote` | **175.81** (limit 200) | same |
| same | 0.6.3 | mainnet | `resolve_verification` | 4.60 (limit 60) | same |
| 2026-09-29 | 0.6.3 → **0.6.5** | sandbox, `release-contract` profile | `verify_quote` | 173.6 → **122.1** | #4519 comment |
| same | 0.6.3 → 0.6.5 | sandbox | `verify_quote_with_collateral_dates` | 179.0 (181.4 in CI) → **124.3** | #4519 comment |
| 2026-10-19 | 0.6.6 → **0.7.0** | sandbox | `verify_quote` / `..._with_collateral_dates` | 122.2 → **121.8** / 123.7 → **123.5** | https://github.com/near/mpc/pull/4841 |

- **Why the drop:** "In 0.6.3, `verify_with_policy` parses the collateral twice … 0.6.4 fixes this (dcap-qvl#231) and also verifies the shared signing chain and the root CA CRL only once (#232, #233)" (https://github.com/near/mpc/issues/4595).
- **Security note:** dcap-qvl < 0.6.5 pulled `dcap-qvl-webpki 0.103.4`, which is affected by **RUSTSEC-2026-0104**: a crafted CRL panics during parsing, before its signature is checked. CRLs arrive in caller-supplied collateral. cargo-deny does not flag the fork. **Pin dcap-qvl ≥ 0.6.5. 0.7.1 is current** (same issue).
- **Backends:** near/mpc uses the `ring` backend. "Switching from `ring` to `rustcrypto` … Upstream measured it as more expensive than `ring` at our `opt-level = "z"`" (#4595).
- **WASM size:** the `tee-verifier` WASM is **420 KB** (#4841).

**Deployed verifiers** (live RPC, 2026-11-12, PRIMARY):

| Network | MPC contract | Its `tee_verifier_account_id()` | Code hash | `storage_usage` | Access keys |
|---|---|---|---|---|---|
| mainnet | `v1.signer` | `tee-verifier-2026-11-11.near` | `8SrqVCh3RtHz6mG2eiMwBGZDPkmccA5JiVvqrDYT3VL3` | 422,427 B | **0 (locked)** |
| testnet | `v1.signer-prod.testnet` | `tee-verifier-2026-11-02.testnet` | `8SrqVCh3RtHz6mG2eiMwBGZDPkmccA5JiVvqrDYT3VL3` | 422,427 B | **0 (locked)** |

- The runbook (`docs/development/deploy-tee-verifier.md`) covers the full procedure: reproducible build (`cargo near build reproducible-wasm`, pinned `sourcescan/cargo-near:0.22.0-rust-1.97.1` image), deploy, audit the code hash, then delete keys.
- It also shows that `verify_quote` **can be called as a read-only view** with the committed fixture (`near contract call-function as-read-only … verify_quote file-args …verify_quote_args.borsh`). That makes it useful for off-chain pre-checks.
- **Any NEAR contract can call these locked verifiers cross-contract.**

### 1.2 Shade Agent `register_agent` (deprecated framework, PRIMARY)

- `shade-attestation/Cargo.toml` pins `dcap-qvl = "=0.5.2"` (`default-features = false`, `["contract","borsh","std","ring","default-x509"]`) and verifies **inside** the agent contract.
- `shade-contract-template/src/lib.rs::register_agent(attestation)` calls `self.verify_attestation(attestation)`, which returns `(measurements, ppid, advisory_ids)`.
- The JS client attaches **300 Tgas** (`shade-agent-js/src/api.ts`: `gas: BigInt("300000000000000"), // 300 TGas`).
- No measured gas figure is published. The docs warn only that long approved-measurement lists can push registration "past the gas limit" (`docs/concepts/security.md:55`).
- DERIVED: on 0.5.2 it was probably in the 0.6.3 range (~175 Tgas), which is why 300 Tgas was attached.

### 1.3 The `dcap-qvl` crate (PRIMARY, source at v0.7.1)

**Version and target support.**
- Releases: **v0.7.1 (2026-11-03)**, v0.7.0 (2026-10-12), v0.6.6 (2026-10-08), v0.6.5 (2026-09-29), v0.6.4 (2026-09-29), v0.6.3 (2026-08-31).
- The README says it "Runs everywhere. The pure-Rust core works on servers, mobile, WebAssembly, and on-chain (`no_std`)."
- Features: `contract` (getrandom), `ring` or `rustcrypto`, `default-x509` ("Disabling this drops ~37 KiB on `wasm32-unknown-unknown`"), `json-core` (serde-json-core for size-constrained targets) and `borsh`.
- near/mpc builds with `["contract","borsh","std","ring","default-x509","json-core"]`.

**What collateral it needs.** The `Collateral` struct, mirrored in near/mpc `tee-verifier-interface`:

```rust
pub struct Collateral {
    pub pck_crl_issuer_chain: String,  pub root_ca_crl: Vec<u8>,  pub pck_crl: Vec<u8>,
    pub tcb_info_issuer_chain: String, pub tcb_info: String,      pub tcb_info_signature: Vec<u8>,
    pub qe_identity_issuer_chain: String, pub qe_identity: String, pub qe_identity_signature: Vec<u8>,
    pub pck_certificate_chain: Option<String>,
}
```

- That is: TCB info with signature and issuer chain, QE identity with signature and issuer chain, the PCK CRL with issuer chain, the root CA CRL, and optionally the PCK certificate chain.
- The PCK chain is needed only when the quote does not embed it. For cert type 2/3 (encrypted PPID), `CollateralClient` fetches it from PCS using `encrypted_ppid`.
- The default PCCS is `https://pccs.phala.network`.

**Sizes** (PRIMARY, measured from the committed fixtures):

| Item | Bytes | Notes |
|---|---|---|
| TDX quote v4 (TD 1.0), dcap-qvl `sample/tdx_quote`, the MPC fixture and `quote-from-tappd` | **5,006** | Signature section 4,300 B. cert type 6 (QE report) wraps inner cert type **5 (PCK chain PEM, 3,678 B)**, so the **PPID is in the quote**. |
| TDX quote v5 (TD 1.5 `TD15Ex` body), `sample/tdx_quote_td15ex` | **5,247** | Inner cert type 5, 3,682 B |
| Collateral, `sample/tdx_quote_collateral.json` | ~15 KB | TCB info JSON 2,934; PCK CRL 5,326 hex chars; three issuer chains ~1.9 KB each |
| Collateral, MPC fixture `collateral.json` | **~19.1 KB** raw | TCB info 5,524; PCK CRL 3,355 B; PCK chain 3,677 |
| **Borsh `(quote, collateral)`**, `tee-verifier/tests/fixtures/verify_quote_args.borsh` | **24,178** | The actual on-chain argument size |
| RTMR3 event log (MPC fixture, full CCEL incl. RTMR0–2) | 7,144 JSON B, 29 events | Only the 9–13 RTMR3 events are needed on-chain (~1–2 KB, DERIVED) |
| App-compose JSON (MPC fixture) | 1,643 | Needed only if the compose is linted on-chain |

**Verification time (native).**
- The Go-FFI benchmark in `benchmarks/go-ffi/compare_before_after.md` (2026-02-25, git 16a3c8a; hardware unstated) ran 1,000 verifies in 920–971 ms, so **~0.92–0.97 ms per quote**.
- On NEAR, the dominant cost is the ~10 ECDSA-P256 verifications and X.509 chain walks in WASM. The near/mpc design doc says: "dominated by ECDSA verifications and X.509-chain walking".

**Policy defaults.**
- `allow_debug: false`. Debug TDs are rejected; zkSecurity #06 found the debug check incomplete, and it was fixed.
- CRLs are checked (zkSecurity #0b, fixed).
- 0.7.0 rejects migratable and profiling TDs (dcap-qvl#219, per near/mpc #4841).

**PPID extraction.** `src/intel.rs::parse_pck_extension_with` reads OID **1.2.840.113741.1.13.1.1** (`oids::PPID`) from the **PCK leaf certificate**. It also exposes `fmspc`, `pce_id`, `cpu_svn` and `platform_instance_id`. `VerifiedReport.ppid` is filled from it. The MPC fixture yields `ppid = d208dfb1002346ae1bb4ef2a3c055292` (16 bytes).

### 1.4 NEAR protocol limits (live, PRIMARY)

`EXPERIMENTAL_protocol_config` on mainnet (FastNEAR public RPC) and testnet, 2026-11-12. Both run **protocol 88**: mainnet node 2.14.0, testnet 2.14.0-rc.5.

| Limit | Value | Note |
|---|---|---|
| `max_total_prepaid_gas` / `max_gas_burnt` | **1,000,000,000,000,000 = 1 PGas = 1,000 Tgas** | nearcore CHANGELOG 2.11.0: "Contract gas limit is increased from 300 TGas to 1 PGas." (2.11.0 released 2026-04-01) |
| `max_transaction_size` | 1,572,864 B (1.5 MiB) | Also caps contract deploy size |
| `max_arguments_length` | 4,194,304 B (4 MiB) | |
| `max_receipt_size` | 4,194,304 B | |
| `max_contract_size` | 4,194,304 B | |
| `yield_timeout_length_in_blocks` | 200 | |
| `storage_amount_per_byte` | 10^19 yN | That is 100 KB per NEAR |
| `gas_price` | 100,000,000 yN/gas on both networks | So 1 Tgas = 0.0001 NEAR (DERIVED) |
| `p256_verify_host_fn` | **true**; `p256_verify_base` 1.3 Tgas, `p256_verify_byte` 13 Mgas | NEP-635, merged 2026-04-07. See §1.6, option D. |
| `alt_bn128_pairing_check_base` / `_element` | 9.686 / 5.102 Tgas | Relevant to ZK routes, §1.7 |

### 1.5 Byte and gas budget for `register_room` (DERIVED from §1.1–1.4)

**Arguments:**

| Part | Size |
|---|---|
| Quote | ~5 KB |
| Collateral | ~19 KB |
| RTMR3 events | ~1–2 KB |
| Optional app-compose | ~2 KB |
| Keys and nonce | <0.2 KB |
| **Total** | **≈ 27–30 KB** |

That is **~0.7% of the 4 MiB argument limit** and ~2% of the 1.5 MiB transaction limit.

**Gas:**

| Step | Tgas |
|---|---|
| DCAP (dcap-qvl 0.7.x) | ~122–124 |
| Post-DCAP (RTMR3 replay ≈ 13 × SHA-384 host calls, a compose JSON parse, LookupMap writes, `registry.admit_room` promise) | ~5–20 |
| Entry call | ~16 (mainnet measured for MPC, including argument deserialization) |
| **Total** | **≈ 150–170 Tgas** |

- **Cost:** ≈ 0.015–0.017 NEAR per registration.
- **Storage:** an `Attestation` record of ~300–500 B stakes ~0.003–0.005 NEAR.
- **Conclusion:** this fits even the old 300 Tgas cap, and fits the current 1,000 Tgas cap with more than 5× headroom.

### 1.6 Conclusion and design options

**Split?** **No.**
- One transaction verifies everything. near/mpc split *contracts* to save WASM size, not to split *gas*.
- A per-collateral-hash cache (the SDD §3.13 fallback) is unnecessary. dcap-qvl's public API verifies quote and collateral together anyway, so a cache would mean forking dcap-qvl internals.

**Design options for KeyPolicy:**

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Call NEAR One's locked verifier** (HDP) | `ext(tee-verifier-2026-11-02.testnet).with_static_gas(200 Tgas).verify_quote_with_collateral_dates(quote, collateral).then(on_quote_verified, 60 Tgas)`. Attach ~300 Tgas. | No dcap-qvl in KeyPolicy (≈ −310–420 KB WASM, ≈ −3–4 NEAR storage). Exactly the code path NEAR's mainnet MPC uses. Returns `ppid`, TCB statuses, advisory IDs, the TD report and collateral dates. Immutable because locked. | Asynchronous: two receipts, and the callback must handle `Rejected` vs `PromiseError` (copy near/mpc's pattern). The KeyPolicy account pins a verifier account that NEAR One deployed; check the code hash off-chain in CI. The testnet verifier could be superseded (it stays callable, since locked accounts persist). |
| **B. Own locked copy** (v1) | Reproducibly build `crates/tee-verifier` from a near/mpc tag. Deploy it to `dcap-verifier.marginal.near` and delete its keys. KeyPolicy pins it at init. | Same as A, but Marginal controls the timing and the dcap-qvl version. The code hash should equal NEAR One's if built from the same tag. | ~4.3 NEAR for storage on mainnet. |
| **C. Embed dcap-qvl 0.7.1** in KeyPolicy (the current SDD text) | `dcap_qvl::verify::verify` in `register_room` | Synchronous single receipt, simplest state machine. | +~310–420 KB WASM; Docker reproducible build needed (Shade says agent contracts "cannot be built on Mac machines"); every dcap-qvl bump means a new KeyPolicy version (true in A and B as well). |
| **D. Later optimisation** | A custom dcap-qvl `Config` (the `_with::<C>` entry points) that routes P-256 checks to NEAR's `env::p256_verify` host function | DERIVED/UNVERIFIED: ~10 P-256 checks × 1.3 Tgas ≈ 13 Tgas plus parsing, so maybe 30–50 Tgas total instead of ~122. | Not done by anyone yet. Needs its own audit. p256 0.13 → 0.14 behaviour changes at PV 89 (nearcore PR #16680). Unnecessary at the 1 PGas cap. |

**Freshness.**
- Collateral validity is about **30 days**. In the MPC fixture, `earliest_expiration_date − latest_issue_date` = 1,789,171,031 − 1,786,617,938 s = 2,553,093 s ≈ 29.5 days (DERIVED from PRIMARY test values).
- A relayer can therefore submit collateral up to ~30 days old that predates a new Intel revocation (tee-security.md N5).
- `max_collateral_age_secs` cannot be computed cleanly from `CollateralDates`: `earliest_issue_date` is the 2018 root certificate.
- **Recommendation:**
  - Set attestation expiry to `min(verified_at + 24 h, collateral_dates.earliest_expiration_date)`.
  - Require `now − collateral_dates.latest_issue_date ≤ max_collateral_age_secs` (e.g. 7 days) as a deny-only staleness check.
  - Have a watcher compare the on-chain PPIDs against Intel's PCK CRL and call the deny-only `revoke_platform` / `freeze_tcb`.

### 1.7 Alternatives if on-chain were too heavy (it is not)

- **Automata DCAP (EVM).**
  - Full on-chain verification is "~4–5M gas" (~4M with the RIP-7212 precompile).
  - ZK routes: RISC Zero Groth16 522k, SP1 Groth16 493k, SP1 Plonk 569k.
  - Quote versions V3, V4 and V5. Collateral comes from the on-chain PCCS via a PCCS Router.
  - Chains: EVM, plus Solana programs ("localnet testing only", unaudited). No NEAR.
  - Audits: Trail of Bits (Feb 2025, v1.0) and OpenZeppelin (Oct 2025; a PCCS Router timestamp issue, fixed in v1.1).
  - Source: https://github.com/automata-network/automata-dcap-attestation (PRIMARY, fetched 2026-11-12; already in tee-security N19).
- **ZK on NEAR.**
  - NEAR has `alt_bn128` pairing host functions (live) and a generic `near_groth16_verifier` crate (lib.rs, v1.0.1, Dec 2022; snarkjs-style; SECONDARY).
  - **No RISC Zero or SP1 Groth16 receipt verifier for NEAR was found** (UNVERIFIED negative).
  - Porting one is feasible in principle (BN254 Groth16 is about 4 pairings, which is ~30 Tgas by the pairing cost table, DERIVED). It would add a prover service (RISC Zero / SP1 DCAP guest), a trusted setup dependency and a new audit, all for no benefit at 1 PGas.
- **Off-chain fallback.** The SDD's AttesterQuorum fallback remains valid, but S-2 should now pass.

### 1.8 Recommended SDD changes (OI-2)

1. **§3.13 "Gas" paragraph.** Replace it with:

   > "DCAP verification costs ~122–124 Tgas (dcap-qvl 0.7.x, near/mpc measurements, Oct 2026); with post-checks a registration needs ≈150–170 Tgas of the 1,000 Tgas per-call limit (protocol 88). Verification runs in one transaction with no split and no collateral cache. Arguments are ≈30 KB."

2. **KeyPolicy init.** Add `dcap_verifier: AccountId` (HDP: `tee-verifier-2026-11-02.testnet`; v1: Marginal's own locked copy) and `dcap_verifier_code_hash: [u8;32]` (informational; CI asserts it against `view_account` and checks the account has 0 keys).
   - `register_room` → `verify_quote_with_collateral_dates` (static 200 Tgas, `unused_gas_weight 0`) → `on_quote_verified` (static 60 Tgas) → `registry.admit_room`. Treat `Ok(Rejected)` as a definitive deny and `Err(PromiseError)` as a retry.
   - Option C (embedding) stays acceptable if the team prefers synchronous code. If so, pin `dcap-qvl = "0.7.1"` with `default-features=false, features=["contract","borsh","std","ring","default-x509","json-core"]`, plus the custom `getrandom` stub.
3. **`Attestation` record.** Add `collateral_expiry: u64` (from `CollateralDates.earliest_expiration_date`) and set `expires_at = min(+24h, collateral_expiry)`.
   - Replace `max_collateral_age_secs` semantics with `now − latest_issue_date`.
   - Reject `ppid.len() != 16`, including empty values (see §2.2).
4. **§5.5 S-2.** Pass when a recorded Phala TDX quote verifies on testnet through the chosen option and **burns ≤ 180 Tgas in DCAP**. AttesterQuorum stays the fallback.
5. **Dependency floor.** dcap-qvl ≥ 0.6.5 (RUSTSEC-2026-0104 via `dcap-qvl-webpki`).

---

## 2. OI-3: HDP CVM provider, price and PPID

### 2.1 Comparison table

Prices are on-demand, USD, Linux, excluding tax and egress.

| Provider / offer | Smallest usable size | $/hour | ≈ $/month (730 h) | Price source and date | Real TDX quote to the app with custom 64-B `report_data`? | dstack compose-hash in RTMR3? | PPID usable? | Quote chains to Intel root? |
|---|---|---|---|---|---|---|---|---|
| **Phala Cloud** `tdx.small` | 1 vCPU / 2 GB / 20 GB | **0.058** | 42.3 | Public API `GET https://cloud-api.phala.com/api/v1/instance-types/cpu` (PRIMARY, 2026-11-12) | Yes: dstack guest agent `/var/run/dstack.sock` (`GetQuote` / `/v1/Attest`) | Yes (native dstack) | Yes. The quote embeds the PCK chain (cert type 6→5). Phala publishes its PPID list (29 entries, 2026-11-12). | Yes, PCK → Intel SGX Root CA |
| **Phala Cloud** `tdx.medium` | 2 vCPU / 4 GB | **0.116** | 84.7 | same | same | same | same | same |
| **Phala Cloud** `tdx.large` | 4 vCPU / 8 GB | **0.232** | 169.4 | same; also cloud.phala.com/about/pricing ("$0.232 per hour", last updated 2026-10-06) | same | same | same | same |
| Phala storage | per GB | 0.000139 /GB/h | 20 GB ≈ 2.03; 40 GB ≈ 4.06 | cloud.phala.com/about/pricing (PRIMARY, 2026-10-06). Billed while stopped too; per-minute compute billing. | | | | |
| Phala free credit | | | | "welcome credit" when a card is added, amount not stated (PRIMARY, same page) | | | | |
| **Google Cloud** `c3-standard-4` + Intel TDX | 4 vCPU / 16 GiB (TDX is listed only for `c3-standard-*`, `c3-standard-*-lssd`, `c4-standard-*` and `a3-highgpu-1g`) | 0.201608 + TDX 0.0208808 = **0.2224888** | 162.4 | cloud.google.com/products/compute/pricing/general-purpose, us-central1 default; TDX surcharge "$0.0033982 / vCPU-hour, $0.0004555 / GiB-hour", "additional costs on top of Compute Engine pricing" (PRIMARY, fetched 2026-11-12); sum DERIVED | Yes, via configfs-tsm (`/sys/kernel/config/tsm/report`), go-tdx-guest | **Partly.** dstack runs as `gcp-tdx` (dstack-cloud), but the OS image is bound through the **vTPM PCR2 UKI hash**, not MRTD/RTMR0–2. RTMR3 replay still works. | Present in the quote per arXiv 2510.12469 ("every TD has access to it"). Google does not publish PPIDs, and hosts vary per boot. | Yes (Intel TDQE). Google runs its own firmware in MRTD. |
| **Azure** `DC2es_v5` (TDX) | 2 vCPU / 8 GiB | **0.096** (spot 0.017741) | 70.1 | Azure Retail Prices API, eastus2, effective 2025-09-01 (PRIMARY, queried 2026-11-12) | **No direct custom report_data.** A paravisor (HCL) puts a hash of the vTPM AK and runtime data in TD `report_data`, and app data goes via vTPM NV index 0x01400002. | **No.** The TD measures Microsoft's paravisor, not the guest. dstack has no Azure platform kind. | PPID present in the quote (arXiv 2510.12469) | Yes, Intel root (collateral often via Azure THIM, UNVERIFIED) |
| **AWS** | — | — | — | No customer-facing TDX found. AWS offers SEV-SNP (M6a/C6a/R6a), Nitro Enclaves and NitroTPM. dstack supports `aws-nitro-tpm` and `nitro-enclave` only. | n/a | n/a | n/a | n/a |
| **Alibaba Cloud** `ecs.g8i.xlarge` (5th-gen Xeon, all g8i support TDX) | 4 vCPU / 16 GiB | not found | — | Docs: Beijing Zone I, Hong Kong Zones B/C/D, Singapore Zone B (PRIMARY via search snippet; price UNVERIFIED) | Yes (standard TDX guest) | Not supported by dstack (no platform kind) | Likely present (standard DCAP; UNVERIFIED) | Yes |
| **Bare metal, self-hosted dstack**: OVHcloud HGR-HCI-i2, phoenixNAP BMC, OpenMetal, GCP `c3-highcpu-192-metal` | whole server | — | OVH $945; phoenixNAP $951.59; OpenMetal $881.28; GCP metal $6,329.21 | near/mpc `docs/guide/cloud-providers-tdx.md`, "surveyed in August 2025 and have not been re-verified" (PRIMARY doc, stale prices) | Yes | Yes (native) | Yes. The operator knows the PPID, so it fits a platform allow-list best. | Yes |
| Hetzner | — | — | — | No TDX offering found. DX154/DX294 use Xeon 6 6741P/6787P but advertise SGX EPC, not TDX (SECONDARY/UNVERIFIED negative). | | | | |
| Equinix Metal | — | — | — | **Discontinued 2026-06-30** (Equinix EOL docs via search; SECONDARY press confirms) | | | | |
| NEAR AI Cloud / Confidential GPU Marketplace | — | — | — | Per-token inference pricing only. Marketplace supplier pricing "confidential, protected by NDA" (search snippet, UNVERIFIED). No CPU CVM product found. | n/a | n/a | n/a | n/a |

### 2.2 PPID: where it lives and what clouds expose

**Location.** The PPID is an extension (OID 1.2.840.113741.1.13.1.1) of the **PCK leaf certificate**.
- In TDX quote v4/v5 the PCK chain sits inside the QE certification data (outer cert type 6, inner type 5), so the verifier gets it straight from the quote (dcap-qvl `intel.rs`; sample quotes in §1.3).
- If a quote carries only an *encrypted* PPID (cert type 2/3), dcap-qvl fetches the PCK cert from PCS, and that cert again contains the plaintext PPID.
- **Conclusion: the PPID is always available to an on-chain verifier.** It is returned in `VerifiedReport.ppid` (PRIMARY, code).

**What PPID identifies.**
- It is per physical platform, not per VM.
- Shade docs: "on Phala Cloud, two different deployments can have the same PPID if they are running on the same server" (PRIMARY, `docs/concepts/terminology.md:84`).
- arXiv 2510.12469 (Proof of Cloud): "Even when using the paravisor approach, the quote contains the Protected Platform Identifier (PPID) … PPID is unique to the CPU and every TD has access to it." Cloud providers do not publish PPID lists ("The main challenge … convincing cloud providers to publish") (PRIMARY, paper).

**Phala publishes PPIDs.** `GET https://cloud-api.phala.network/api/v1/attestations/ppids` (also served on `cloud-api.phala.com`) returned **29 entries** on 2026-11-12. **One of them is the empty string `""`**, and the rest are 16-byte hex values (e.g. `25d230545a3e572bb25a69240d2319d2`) (PRIMARY, live).
- Shade docs: "Phala has published a list of their PPIDs at https://cloud-api.phala.network/api/v1/attestations/ppids … By default, the CLI approves all PPIDs for Phala Cloud."
- **Implication:** KeyPolicy must reject an empty or short PPID. The empty entry suggests some node or quote path without a PPID (UNVERIFIED why).

**Node pinning.** On Phala, `phala deploy --node <name>` pins a physical node, and `phala nodes` lists them (PRIMARY, CLI doc). Pin one node so the HDP room's `ppid_hash` is stable and can be registered in the registry `Platform`.

### 2.3 Provider notes

- **Phala Cloud** (recommended).
  - Native dstack: MRTD/RTMR0–2 are the dstack OS image measurements, reproducible with `dstack-mr`, and RTMR0 depends on the vCPU/RAM size.
  - The compose-hash is in RTMR3. Real Intel DCAP quotes. Published PPIDs. Per-minute billing.
  - CLI knobs (PRIMARY, docs.phala.com CLI reference):
    - `--kms phala|ethereum|base` (default `phala`)
    - `--key-provider-mode kms|local`
    - `--experimental-key-provider-type kms|local|tpm` ("local/tpm require manual key_provider_id")
    - `--gateway/--no-gateway` (default `true`)
    - `--no-pre-launch-script` ("also skips the automatic local SSH key, unless you pass `--dev-os` or `--ssh-pubkey`")
    - `--public-logs` / `--public-sysinfo` (default true)
    - `-e KEY=VALUE`
    - `-t tdx.small|...`
    - `--node`
  - **The CLI offers no `none` key provider and has no flag that disables KMS**, so spike S-4 must check whether a raw compose with `kms_enabled:false` / `key_provider:"none"` is accepted (via the API or `--experimental-key-provider-type`). The fallback is `local` (§3.2).
  - **Phala adds a default pre-launch script** unless `--no-pre-launch-script` is passed.
- **Google Cloud.**
  - $0.2225/h for c3-standard-4 in us-central1. TDX is available in us-central1-a/b/c, us-east1-c/d, us-east4-a/b/c, europe-west4-a/b/c and others (PRIMARY, supported-configurations page).
  - dstack runs as a GCP CVM. Phala's dstack-cloud guide lists `key_provider` `kms`, or `tpm`/`none` for "No external KMS mode".
  - The OS identity check in dstack's GCP flow is: "compares the UKI Authenticode hash inside that CBOR file with the GCP TPM PCR2 UKI event" (`docs/attestation-gcp.md`). A TDX-only on-chain verifier would have to trust Google's MRTD and work out which RTMR1/2 values Google's firmware produces. That is unproven, so GCP is a fallback only.
- **Azure.** Cheapest raw TDX ($0.096/h), but the paravisor model breaks "app measurement in RTMR3 + custom report_data". dstack does not support it. Rejected.
- **Bare metal.** Gives the best PPID control and audited-facility options for v1, but costs ~$880–950/month (Aug-2025 survey). Not for the HDP.

### 2.4 Recommendation and cost (DERIVED)

- **HDP provider: Phala Cloud, `tdx.large` (4 vCPU / 8 GB, $0.232/h) on one pinned `--node`, dstack OS 0.6.x.** Use `tdx.medium` ($0.116/h) if the CPU NLI and embedding models fit in 4 GB (earlier prototype measurements decide).
- **Budget:**

  | Scenario | Cost |
  |---|---|
  | `tdx.large` + 40 GB disk, 24×7 | ≈ $0.2376/h ≈ **$5.70/day ≈ $173/month** |
  | `tdx.large`, 2-week hackathon window | ≈ **$80** |
  | `tdx.medium`, 2-week hackathon window | ≈ **$40** |
  | GCP c3-standard-4, same 2 weeks | ≈ $75 + disk |

- **GCP** is the second choice only if Phala blocks `key_provider: none` *and* `local`. It needs the extra RTMR1/2 work above.

### 2.5 Spike S-4 checklist (replaces the SDD pass line)

S-4 passes on a live `tdx.medium` (≈ $0.12/h, about 1 hour) when **all** of the following hold:

1. **Deploy** with `--no-gateway --no-pre-launch-script`, no `-e`, and the compose in §3.7.
2. **Get the quote.** Inside the CVM, `GET /GetQuote?report_data=<64B hex>` (or `POST /v1/Attest`) on `/var/run/dstack.sock` returns a v4 quote and event log.
3. **Check the quote.** It has cert type 6→5. dcap-qvl yields a 16-byte PPID that is on Phala's list. TCB status is `UpToDate`; if it is not, record the status so `TcbPolicy.allowed_statuses` can be set.
4. **Check RTMR3.** Replay equals `rt_mr3`, and the event list matches §3.3 with `key-provider` = `{"name":"none","id":""}`.
5. **Check the record.** The recorded quote, collateral and events go through S-2 on testnet.

---

## 3. OI-4: dstack app-compose, KMS opt-out, and RTMR3

### 3.1 `app-compose.json` schema

Source: `dstack/dstack-types/src/lib.rs` `struct AppCompose` (PRIMARY) and `docs/security/cvm-boundaries.md` (PRIMARY).

| Field | Since | Default | Meaning | **Marginal value** |
|---|---|---|---|---|
| `manifest_version` | 0.3.1 | — | 2 (integer). The string `"3"` is required for `requirements` or multiple `init_script`s, so older guests fail closed. | `2` |
| `name` | 0.3.1 | — | Instance name (part of the hashed bytes) | `"marginal-room-k-cpu"` |
| `runner` | 0.3.1 | — | `docker-compose` (or `bash`, `nerdctl-compose`) | `"docker-compose"` |
| `docker_compose_file` | 0.3.1 | — | YAML string. Measured as part of the compose bytes. | Images pinned `@sha256:`; no `env_file`; no `${VAR}`; mount `/var/run/dstack.sock` |
| `kms_enabled` | 0.3.1 | false | Legacy KMS switch | `false` |
| `gateway_enabled` (alias `tproxy_enabled`) | 0.3.1 | false | dstack-gateway WireGuard ingress | `false` (and never set `tproxy_enabled`) |
| `local_key_provider_enabled` | 0.3.1 | false | Host SGX "local-sgx" key provider | `false` |
| `key_provider` | 0.5.6 | unset → derived | `none` \| `kms` \| `local` \| `tpm` | `"none"` |
| `key_provider_id` | 0.5.1 | `""` | Pin. "For `tpm` and `none` it must be an empty string." | `""` |
| `public_logs` | 0.3.3 | false | Container logs over the guest-agent HTTP API | `false` (room handles plaintext; zkSecurity #08) |
| `public_sysinfo` | 0.3.3 | false | Dashboard and `/metrics` | `false` |
| `public_tcbinfo` | 0.5.1 | true | Exposes app-compose and event log externally | `true` (the compose holds no secrets) |
| `allowed_envs` | 0.4.2 | `[]` | Env names the CVM accepts from the host-supplied encrypted env | `[]` |
| `no_instance_id` | 0.4.2 | false | Empty `instance-id` event | `true` |
| `secure_time` | 0.5.0 | true (0.6 types) | Waits for NTS time sync before requesting keys. Issue #745: it can fail to sync. | `false` (the room never trusts local time; it uses NEAR block heights) |
| `pre_launch_script` | 0.4.0 | none | Runs **after** dockerd; "Do not build security gates on it" | omit |
| `init_script` | 0.5.5 / 0.6.0 | `[]` | Up to 5 scripts before dockerd; measured as `init-script-hash` events | omit |
| `storage_fs` | 0.5.5 | zfs | Data-disk filesystem | leave default |
| `storage_discard` | 0.6.0 | true | TRIM leaks allocation patterns | default (the disk is fresh every boot with `none`) |
| `swap_size` | 0.5.5 | 0 | — | `0` |
| `event_log_version` | — | v1 | v1 or v2 digest format | leave unset (v1; §3.3) |
| `requirements` (`ephemeral_data_disk`, `launch_token_hash`, `gpu_policy`) | 0.6.2 | — | Needs manifest `"3"` | omit for HDP |
| `verity_volumes` | 0.6.x | `[]` | Measured read-only volumes | omit |

### 3.2 Can KMS-derived keys be disabled? Yes (PRIMARY, code)

**How the provider is chosen** (`dstack-types/src/lib.rs`):

```rust
pub fn key_provider(&self) -> KeyProviderKind {
    match self.key_provider {
        Some(p) => p,
        None => if self.kms_enabled { KeyProviderKind::Kms }
                else if self.local_key_provider_enabled { KeyProviderKind::Local }
                else { KeyProviderKind::None } } }
```

**What each provider does** (`dstack-util/src/system_setup.rs::request_app_keys`):

```rust
KeyProviderKind::Kms   => self.request_app_keys_from_kms().await,       // + emits "os-image-hash"
KeyProviderKind::Local => self.get_keys_from_local_key_provider().await, // host SGX enclave
KeyProviderKind::None  => { info!("No key provider is enabled, generating temporary app keys");
                            let seed: [u8; 32] = rand::thread_rng().gen();
                            gen_app_keys_from_seed(&seed, KeyProviderKind::None, None) }
KeyProviderKind::Tpm   => self.generate_tpm_app_keys(),
```

**With `none`:**
- The app keys come from a random seed: the disk key, the env-decryption key and the guest-agent `GetKey` root.
- `disk_reusable = !key_provider.is_none()`, so the data disk and `instance_id_seed` are regenerated every boot. Nothing persists across restarts, which matches SDD §3.12.1: "A restart always means new keys."
- Marginal never calls `GetKey`; all room keys are generated in TEE memory.

**`local` (fallback if Phala refuses `none`).**
- The host runs dstack's SGX `local-key-provider`, which:
  > "derives a 32-byte key as `SHA-256(SGX sealing key || MRTD || RTMR0..3)` … encrypts the key using the libsodium sealed-box format and the X25519 public key in the TDX report data" (`dstack/local-key-provider/README.md`).
- The event payload is `{"name":"local-sgx","id":"<provider MR hex>"}`.
- The disk persists across restarts on the same CPU. The room must keep secrets in tmpfs only (`read_only: true` root, `tmpfs`). SDD §1 needs a note on persistent disk.
- near/mpc uses `local` (its test compose has `"local_key_provider_enabled": true`, id `6b5ed02e…8d01`).

**`kms`.** Phala's KMS derives every key, and the Phala host can approve composes (near-primitives A5). Rejected.

### 3.3 RTMR3 events and how to replay them (PRIMARY, code; replay validated)

**Event type and digest** (`cc-eventlog/src/runtime_events.rs`):
- Event type `DSTACK_RUNTIME_EVENT_TYPE = 0x08000001` (134217729).
- **v1 digest** = `SHA-384(le32(0x08000001) ‖ ":" ‖ name ‖ ":" ‖ payload)`.
- **v2 digest** = `SHA-384(JCS({"name","payload":hex,"type"}))`.
- **Replay:** `mr = 0^48; for e in rtmr3_events: mr = SHA-384(mr ‖ e.digest)`. The result must equal the quote's `rt_mr3`.

**Event order, dstack 0.6.3 CPU-only** (from `system_setup.rs`, `measure_app_info`, `measure_gpu`, `setup_fs` and `verify_app`):

| # | Event | Payload | With Marginal compose (`none`, `no_instance_id`) |
|---|---|---|---|
| 1 | `system-preparing` | empty | empty |
| 2 | `app-id` | 20 B. The deploy-time `.instance-info.app_id`, which defaults to `compose_hash[0..20]`. **The host can pin another value, but it is measured.** | require `== compose_hash[0..20]` |
| 3 | `compose-hash` | 32 B, `SHA-256(app-compose.json bytes)` (raw bytes, not canonicalised; dstack #550) | pinned |
| 4… | `init-script-hash` | one per `init_script` | must be **absent** |
| 5 | `gpu-policy-hash` | 32 B, `SHA-256(JCS(requirements.gpu_policy))`, `{}` if omitted. **Always emitted in 0.6.x.** | pin value |
| 6 | `instance-id` | 20 B, or **empty** if `no_instance_id` | empty |
| 7 | `boot-mr-done` | empty | — |
| (8) | `os-image-hash` | **only on the KMS path** (`request_app_keys_from_kms`) | must be **absent** (proves no KMS) |
| (9) | `gpu-attestation` | only with GPUs | absent for `K-cpu` |
| 10 | `key-provider` | JSON `KeyProviderInfo{name,id}`: `none` → `{"name":"none","id":""}`; `local` → `{"name":"local-sgx","id":"<hex MR>"}`; `kms` → `{"name":"kms","id":"<hex CA pubkey>"}`; `tpm` → `{"name":"tpm","id":""}` | `{"name":"none","id":""}` |
| 11 | `storage-fs` | `zfs` / `ext4` | — |
| 12 | `storage-encrypted` | `1` / `0` | require `1` |
| 13 | `system-ready` | empty | must be present |

**Apps can no longer add events.**
- In 0.6.0+, `EmitEvent` is **removed**: "runtime RTMR3 events are system-owned and cannot be extended by apps" (`guest-agent/src/rpc_service.rs:818`).
- In 0.5.x, apps could append events; the MPC fixture has an app event `mpc-image-digest` after `system-ready`.
- Pin the OS version through MRTD/RTMR0–2 so the expected event set is fixed.

**Replay validated against the near/mpc fixture** (`crates/test-utils/assets/tcb_info.json`, dstack 0.5.x):
- All 9 RTMR3 event digests recomputed with the v1 formula match.
- The replay equals the recorded `rtmr3`.
- Events: system-preparing, app-id, compose-hash, instance-id(empty), boot-mr-done, key-provider(local-sgx), storage-fs, system-ready, mpc-image-digest.
- The fixture's `mr_config_id = 01‖compose_hash`, i.e. dstack `MrConfig::V1`.

**Expected key-provider digest for `none`** (DERIVED with the validated formula; confirm in S-4):

| Format | SHA-384 of `{"name":"none","id":""}` |
|---|---|
| v1 | `7f788209b6106d43ad4b0cef85797120c234f175a10b7cb609a73ec1f4285adfe7abca2e1e3d3bd2ba058c2b78d1771d` |
| v2 | `73e1d8ce8cb6c89f8379018b7d46a3e9674c99eef022dc39813534ddd094b59f9fc10ce13888ffd8475a92432d2820f1` |

The SHA-384 digest is **48 bytes**, which is what near/mpc pins (`ExpectedMeasurements.key_provider_event_digest: [u8;48]`).

**Optional launch binding.** The host may set TD `MR_CONFIG_ID`:
- V1 = `0x01‖compose_hash`
- V2 = `0x02‖keccak256(compose_hash‖app_id‖kp_kind_byte‖kp_id)`, where the `none` kind byte is 0
- V3 = document hash

The guest verifies it at boot, and an all-zero value skips the check (dstack #559, "not a production vulnerability"). KeyPolicy may accept `{0, V1(compose_hash), V2(...)}` as defence in depth (`dstack-types/src/mr_config.rs`).

### 3.4 Guest-agent quote API (PRIMARY, docs/guest-api-v0.md, v1.md and the JS SDK)

**Sockets and listeners.**
- The internal socket is **`/var/run/dstack.sock`**, "reachable only by the application itself". It must be mounted into the room container.
- The external listener is on port 8090. In 0.6.3 every route is scope-gated by signed JWTs, and "No scopes are anonymous by default".
- The legacy Tappd socket is `/var/run/tappd.sock`.

**v0 `GetQuote`** (`/GetQuote`, `/v0/GetQuote`, `/prpc/Tappd.…` on Tappd):
- "Returns a raw Intel TDX quote over caller-supplied report data, with the event log, the padded report data and the VM config."
- "`report_data` is up to 64 bytes and is zero-padded on the right to 64. More than 64 bytes is an error, never a truncation."
- "As of 0.6.0 this method is Intel TDX only."

**v1 `Attest`** (`/v1/Attest`):
- Takes up to 64 B of `report_data` and returns a MessagePack `VersionedAttestation`.
- For `tdx` and `gcp-tdx`, `platform.data` carries `quote` (raw TDX quote bytes) and `event_log`.
- V2 events include the hex preimage of their digest.

**SDK.** `@phala/dstack-sdk` 0.6.0:
- `DstackClientV0.getQuote(report_data)` / `.attest(report_data)` / `.info()`
- `DstackClientV1.attest(...)` / `.attestGpu(nonce)` / `.info()`
- `getComposeHash()` and `replayRtmrs()` helpers (Phala chain-of-trust doc)

**Report data.** Marginal's `report_data = SHA-512(...)` is exactly 64 bytes, which fits.

### 3.5 What the host can still influence (PRIMARY, `docs/security/cvm-boundaries.md`, code)

| Host input | Measured? | Effect under the Marginal compose |
|---|---|---|
| `app-compose.json` | Yes (`compose-hash`) | Pinned |
| `.instance-info` (`app_id`, `instance_id_seed`) | `app-id`, `instance-id` events | Require `app-id == compose_hash[0..20]`; instance-id empty |
| `.encrypted-env` / sealed env | **No.** "This file is not measured to RTMRs … the host can withhold the file or replay any earlier ciphertext" | `allowed_envs: []`. `parse_env` skips any key not allowed (`warn!("Skipping unauthorized environment variable")`). With `none`, `env_crypt_key` is random, so a non-empty `.encrypted-env` fails to decrypt and the boot fails closed (DoS only). |
| `.user-config` | No (unless `requirements.launch_token_hash`) | The room must not read `/dstack/.host-shared/.user-config` |
| `.sys-config.json` (`kms_urls`, `gateway_urls`, `pccs_url`, `docker_registry`, `vm_config`) | No. "each field has its own security mechanism". | KMS and gateway are unused. The registry mirror is safe because images are digest-pinned (zkSecurity #07). `vm_config` CPU/RAM shows up in RTMR0 (pinned). |
| Kernel cmdline `storage_encrypted` | Emitted as `storage-encrypted` because "The cmdline is not measured on every platform (e.g. GCP TDX)" | Require `1` |
| docker compose `environment:` literals | Yes (inside the compose) | Put all security config here, as literals |

### 3.6 Audit findings and near/mpc's policy (PRIMARY)

**zkSecurity audit of dstack.**
- Engagement: 2025-05-26 to 06-13. Scope: dstack `be9d0476…` (ra-tls, ra-rpc, guest-agent, dstack-util) and meta-dstack `5b63aec3…`. **dcap-qvl was out of scope.** Remediation checked at meta-dstack v0.5.3.
- Findings:
  - #00 (High) VMM trusted in the OVMF build: fixed.
  - #01 terminal binaries in the prod image: fixed.
  - #02 host symlinks into the shared folder: fixed.
  - **#03 env injection via unauthenticated shared files:** acknowledged (docs, launch token).
  - **#04 pre-launch code can leak secrets on the default KMS:** acknowledged.
  - #05 qemu-guest-agent present: fixed.
  - **#06 incomplete TD-debug check in dcap-qvl:** fixed.
  - **#07 unchecked image digests:** acknowledged; digest pinning required.
  - #08 container logs exposed: acknowledged.
  - **#09 incomplete measurement of config files:** justified in docs.
  - #0a root-of-trust provenance: addressed.
  - **#0b no CRL checks in dcap-qvl:** fixed.
  - #0c, #0d documentation: addressed.
- Source: https://reports.zksecurity.xyz/reports/phala-dstack/; PDF at `docs/security/dstack-audit.pdf` in the repo.

**dstack public reports** (`docs/security/public-security-reports.md`, snapshot 2026-06-30):
- #549: `no_instance_id=true` shares disk keys across instances (documented). Irrelevant with `none`, since disk keys are random per boot.
- #550: compose hash over raw bytes (documented).
- #557: event log writable by any VM process (fixed, #602).
- #559: zero `mr_config_id` (not a vuln).
- #563: `simulate_quote` path in the prod agent (fixed, #582).
- #606: app keys world-readable (open hardening).
- #615: unmeasured `sys_config` (not a vuln).
- #617: guest agent gives raw keys to all local processes; "dstack treats a CVM as one application trust domain".

**near/mpc's post-DCAP policy** (`crates/attestation/src/attestation.rs`, PRIMARY) is the closest template for KeyPolicy:

```rust
fn validate_app_compose_config(app_compose: &AppCompose) -> bool {
    app_compose.manifest_version == 2 && app_compose.runner == "docker-compose"
      && !app_compose.kms_enabled
      && app_compose.gateway_enabled == Some(false) && app_compose.tproxy_enabled != Some(true)
      && app_compose.public_logs && app_compose.public_sysinfo
      && app_compose.local_key_provider_enabled && app_compose.allowed_envs.is_empty()
      && app_compose.no_instance_id
      && app_compose.pre_launch_script.is_none() && app_compose.init_script.is_none()
      && app_compose.bash_script.is_none()
}
```

- It also requires `report.status == "UpToDate"`, an exact `report_data` match, an RTMR3 replay (`event_type == 134217729` for every RTMR3 event and recomputed digests), and exactly one `compose-hash` event.
- It checks `sha256(app_compose) == compose-hash payload == tcb_info.compose_hash`, and requires exactly one `key-provider` event whose 48-byte digest matches the allowed measurement set together with MRTD/RTMR0–2.
- **Marginal differs on purpose** in two places: `key_provider: none` instead of `local`, and `public_logs/public_sysinfo: false` instead of `true`.

### 3.7 Recommended compose and KeyPolicy checks

**App compose** (HDP K-cpu room):

```json
{
  "manifest_version": 2,
  "name": "marginal-room-k-cpu",
  "runner": "docker-compose",
  "docker_compose_file": "services:\n  room:\n    image: ghcr.io/<org>/marginal-room@sha256:<digest>\n    read_only: true\n    tmpfs: [/tmp]\n    security_opt: [no-new-privileges:true]\n    environment:\n      - MARGINAL_CHAIN_ID=testnet\n      - MARGINAL_KEYPOLICY=keypolicy-v1.<acct>.testnet\n    volumes:\n      - /var/run/dstack.sock:/var/run/dstack.sock\n",
  "kms_enabled": false,
  "key_provider": "none",
  "local_key_provider_enabled": false,
  "key_provider_id": "",
  "gateway_enabled": false,
  "public_logs": false,
  "public_sysinfo": false,
  "public_tcbinfo": true,
  "allowed_envs": [],
  "no_instance_id": true,
  "secure_time": false
}
```

**Compose rules:**
- No `pre_launch_script`, `init_script` or `bash_script`.
- No `env_file:` and no `${VAR}` interpolation.
- Every image pinned by digest. All security configuration as literals inside the measured compose.
- Deploy on Phala with `--no-gateway --no-pre-launch-script` and no `-e`.
- If Phala rejects `none`, use `"key_provider": "local"` with `key_provider_id` set to the provider MR; tmpfs-only secrets.

**KeyPolicy post-DCAP checks** (in `on_quote_verified`, or inline under option C):

1. **Status:** `report.status ∈ TcbPolicy.allowed_statuses` (HDP: `UpToDate` unless S-4 shows otherwise). The report is TD10 or TD15. dcap-qvl already rejects debug TDs.
2. **Report data:** `report_data == SHA-512("marginal-room-v1" ‖ …)`, and the nonce is unused and unexpired.
3. **Static measurements:** `(MRTD, RTMR0, RTMR1, RTMR2)` belongs to an approved `MeasurementSet` member.
4. **RTMR3 replay:** replay the supplied RTMR3 events (v1 formula, every `event_type == 0x08000001`, every digest recomputed from name and payload). The result must equal `rt_mr3`.
5. **Named events.** Exactly one each of:
   - `compose-hash`, with payload equal to the pinned `compose_hash`
   - `key-provider`, with digest equal to the pinned 48-byte digest (`7f7882…771d` for `none` under v1)
   - `app-id` == `compose_hash[0..20]`
   - `instance-id` with an empty payload
   - `storage-encrypted` == `"1"`
   - `system-ready`
6. **Forbidden events:** zero `os-image-hash`, zero `init-script-hash`, and zero `gpu-attestation` for K-cpu.
7. **PPID:** `ppid.len() == 16`; store `sha256(ppid)`. The registry checks that `ppid_hash` is on the admitted `Platform` list (HDP: the pinned Phala node).
8. **Expiry:** `expires_at = min(now + 24h, collateral_dates.earliest_expiration_date)`.
9. **Optional:** an on-chain lint of the supplied app-compose JSON (gas is small; near/mpc's whole `resolve_verification` burnt 4.6 Tgas). Otherwise lint at measurement-approval time: CI rejects any compose whose fields differ from §3.7, and `measurement_approved` publishes the compose bytes.

### 3.8 Recommended SDD changes (OI-4)

1. **§3.11 `Measurement`.** Replace `key_provider_hash: [u8; 32]` with `key_provider_digest: [u8; 48]` (the SHA-384 RTMR3 event digest, as near/mpc pins it). Add `gpu_policy_hash: [u8; 32]` and `app_id: [u8; 20]`, or derive `app_id` from `compose_hash`. Add `event_log_version: u8` (= 1).
2. **§3.13 "dstack KMS" paragraph.** Replace it with:

   > "The compose sets `kms_enabled:false`, `key_provider:"none"`, `local_key_provider_enabled:false`, `gateway_enabled:false`, `allowed_envs:[]`, `no_instance_id:true`, no scripts. dstack then generates throwaway random app keys each boot. KeyPolicy requires the `key-provider` event `{"name":"none","id":""}` and the absence of `os-image-hash`, so a KMS-provisioned CVM can never register."

   Close OI-4.
3. **§3.13 step 5.** Name the API: "`/var/run/dstack.sock` `GetQuote` (v0) or `/v1/Attest`, `@phala/dstack-sdk`".
4. **§3.13 step 7.** Add the event-list checks from §3.7, and add "dcap-qvl rejects debug TDs; KeyPolicy additionally requires `storage-encrypted = 1`."
5. **§1.5 row 1.** Change "Phala Cloud hosted, or self-hosted" to "**Phala Cloud `tdx.large` on a pinned node, `key_provider: none`** (fallback `local` with tmpfs-only secrets)", and add the cost (≈ $5.70/day).
6. **§8 threats.** Add these entries:
   - The host controls unmeasured inputs (`.encrypted-env`, `.user-config`, `.sys-config.json`); mitigated by `allowed_envs:[]` and by never reading them.
   - The host can pin `app_id` (measured; checked).
   - `public_logs:false`, because container logs are a leakage path (zkSecurity #08).

---

## 4. Sources

### PRIMARY: source code at pinned commits

- near/mpc `2bccb88…`:
  - `crates/tee-verifier/src/lib.rs`
  - `crates/tee-verifier/tests/verify_quote.rs`
  - `crates/tee-verifier/tests/fixtures/verify_quote_args.borsh` (24,178 B)
  - `crates/tee-verifier-interface/src/lib.rs`
  - `crates/contract/src/api/attestation.rs`
  - `crates/contract/src/config.rs` (lines 38–42)
  - `crates/contract/tests/sandbox/tee_verifier.rs` (lines 245–254, 339–392)
  - `crates/attestation/src/attestation.rs` (lines 25–35, 141–430)
  - `crates/test-utils/assets/{quote.json, collateral.json, tcb_info.json, app_compose.json}`
  - `docs/design/attestation-verifier-contract.md`
  - `docs/development/deploy-tee-verifier.md`
  - `docs/guide/cloud-providers-tdx.md` (updated 2026-09-14; prices from Aug 2025)
  - `Cargo.toml` (`dcap-qvl = 0.7.1`)
- Dstack-TEE/dstack `7a83895…`:
  - `dstack/dstack-types/src/lib.rs` (AppCompose 205–283, `key_provider()` 817–829, `KeyProvider` 2436–2500)
  - `dstack/dstack-types/src/mr_config.rs`
  - `dstack/dstack-util/src/system_setup.rs` (1126–1131, 2237–2275, 2496–2501, 2545–2585, 2641–2658, 3110–3305, 3318–3425)
  - `dstack/dstack-util/src/system_setup/config_id_verifier.rs`
  - `dstack/dstack-util/src/parse_env_file.rs`
  - `dstack/cc-eventlog/src/runtime_events.rs`
  - `dstack/guest-agent/src/rpc_service.rs:816–818`
  - `dstack/local-key-provider/README.md`
  - `docs/{attestation-tdx.md, attestation-gcp.md, guest-api-v0.md, guest-api-v1.md, hardware-enablement.md, design-and-hardening-decisions.md, encrypted-env-spec.md}`
  - `docs/security/{cvm-boundaries.md, security-best-practices.md, security-model.md, public-security-reports.md, dstack-audit.pdf}`
  - `CHANGELOG.md` (0.6.3, 2026-11-01)
  - `sdk/js/src/client-v0.ts`, `client-v1.ts`
- Phala-Network/dcap-qvl `05c200b…` (v0.7.1):
  - `Cargo.toml` (features)
  - `README.md`
  - `src/intel.rs`, `src/oids.rs`, `src/quote.rs` (`encrypted_ppid_params`), `src/verify.rs` (`allow_debug`)
  - `sample/*`
  - `benchmarks/go-ffi/compare_before_after.md`
- NearDeFi/shade-agent-framework `35758f3…`:
  - `shade-attestation/Cargo.toml`
  - `shade-contract-template/src/lib.rs`
  - `shade-agent-js/src/api.ts`
  - `docs/concepts/{security.md, terminology.md, reproducability.md}`
  - `docs/blog/2026-02-23.md`
- nearcore (GitHub API, main, 2026-11-12):
  - `core/parameters/res/runtime_configs/{parameters.yaml, parameters.snap, 87.yaml, 88.yaml}`
  - `CHANGELOG.md` (2.11.0: 1 PGas)
  - `runtime/near-vm-runner/src/imports.rs`
  - `protocol-model/spec/contract-vm.md`
  - releases (2.11.0 2026-04-01 … 2.14.0 2026-10-26)

### PRIMARY: GitHub issues and PRs (accessed 2026-11-12)

- near/mpc #3714 (merged 2026-07-22), #3897, #4519 and its comment (2026-09-29), #4595, #4596, #4720, #4841 (merged 2026-10-19), #1639, #4910: https://github.com/near/mpc/issues/NNNN
- near/NEPs #635 (P256 host function, merged 2026-04-07); nearcore #14927, #16680

### PRIMARY: live endpoints (2026-11-12, no account)

- NEAR RPC views:
  - `v1.signer.tee_verifier_account_id()` → `tee-verifier-2026-11-11.near`
  - `v1.signer-prod.testnet.tee_verifier_account_id()` → `tee-verifier-2026-11-02.testnet`
  - `view_account` and `view_access_key_list` for both verifiers
  - `status`
  - `EXPERIMENTAL_protocol_config` (rpc.mainnet.near.org was rate-limited and deprecated, so `rpc.mainnet.fastnear.com` was used)
  - `gas_price`
- Phala: `https://cloud-api.phala.com/api/v1/instance-types/cpu`; `https://cloud-api.phala.network/api/v1/attestations/ppids`
- Azure Retail Prices API: `https://prices.azure.com/api/retail/prices?...armSkuName eq 'Standard_DC2es_v5' and armRegionName eq 'eastus2'` (also EC2es_v5, DC2eds_v5)

### PRIMARY: web pages

- https://cloud.phala.com/about/pricing (last updated 2026-10-06)
- https://phala.com/pricing (tdx.small $0.06/h, rounded; superseded by the API's $0.058)
- https://docs.phala.com/phala-cloud/phala-cloud-cli/deploy.md
- https://docs.phala.com/phala-cloud/references/phala-cloud-cli/phala/deploy
- https://docs.phala.com/phala-cloud/attestation/chain-of-trust
- https://docs.phala.com/dstack-cloud/kms-and-key-delivery
- https://docs.phala.com/dstack-cloud/run-on-gcp
- https://cloud.google.com/confidential-computing/confidential-vm/pricing (TDX surcharge)
- https://cloud.google.com/products/compute/pricing/general-purpose (`c3-standard-4` $0.201608/h)
- https://docs.cloud.google.com/confidential-computing/confidential-vm/docs/supported-configurations
- https://reports.zksecurity.xyz/reports/phala-dstack/
- https://github.com/automata-network/automata-dcap-attestation
- https://arxiv.org/html/2510.12469v1 (Proof of Cloud: PPID in quotes, including with a paravisor)

### SECONDARY or UNVERIFIED

- Azure guest attestation design (learn.microsoft.com, via search)
- az-tdx-vtpm docs (via search)
- Alibaba g8i TDX regions (alibabacloud.com help, via search; no price)
- OVHcloud Scale-i and HGR TDX mentions (via search)
- Hetzner DX154/DX294 (datacentrenews, via search)
- Equinix Metal EOL 2026-06-30 (docs.equinix.com and press, via search)
- AWS: no TDX (absence across AWS what's-new results; nested virtualization only)
- `near_groth16_verifier` (lib.rs)
- NEAR AI marketplace NDA pricing (search snippet)

---

## 5. Query and fetch log

**Git clones** (read-only, `--depth 1`): `near/mpc`, `Dstack-TEE/dstack`, `Phala-Network/dcap-qvl`, `NearDeFi/shade-agent-framework`.

**`gh api` (read-only):**
1. Five issue searches on `repo:near/mpc`: "dcap gas", "verify_quote gas", "\"Exceeded the prepaid gas\"", "submit_participant_info gas", "tee-verifier Tgas".
2. Issues and PRs 4519, 4595, 3897 and 3714.
3. Comments on 4519, 4595, 4596, 4841 and 4720; PR 4841.
4. nearcore `runtime_configs/*` (7 files), `CHANGELOG.md` and releases.
5. Code search `p256_verify repo:near/nearcore`; issue searches in nearcore and NEPs for p256.
6. NEPs PR 635; nearcore PRs 14927 and 16680; `imports.rs`; `contract-vm.md`; `primitives-core/src/version.rs`.
7. dcap-qvl releases; issue search `repo:near/mpc audit attestation dcap`.

**curl and JSON-RPC (public, no account):**
1. NEAR `tee_verifier_account_id` on mainnet and testnet.
2. `view_account` and `view_access_key_list` for both verifier accounts.
3. `status` on mainnet and testnet.
4. `EXPERIMENTAL_protocol_config` on mainnet and testnet. One mainnet retry hit HTTP 429 (deprecated endpoint), so FastNEAR was used.
5. `gas_price` on mainnet and testnet.
6. Phala `instance-types` (twice) and `attestations/ppids` (both hosts).
7. Azure Retail Prices for four SKUs.
8. GCP pricing pages: confidential-vm/pricing, vm-instance-pricing (no C3 table), products/compute/pricing/general-purpose (C3 table) and compute/all-pricing.
9. arXiv 2510.12469v1 HTML.

**WebSearch (12; standard mode):**
1. Phala Cloud docs deploy CVM without KMS kms_enabled false key_provider app-compose.json
2. RISC Zero Groth16 receipt verifier NEAR smart contract alt_bn128 rust
3. Azure DCesv5 TDX paravisor TD report report_data vTPM HCL report
4. AWS EC2 Intel TDX support 2026
5. Alibaba Cloud ECS g8i Intel TDX ecs.g8i.xlarge price
6. OVHcloud dedicated server Intel TDX Xeon 5th gen / Xeon 6 price
7. docs.phala.com key-provider local SGX sealing key provider
8. NEAR AI Cloud confidential CPU VM / Confidential GPU Marketplace pricing
9. Phala Cloud instance types tdx.small tdx.medium tdx.large
10. Google Cloud TDX configfs-tsm quote PCK collateral
11. Equinix Metal end of life June 2026
12. Hetzner dedicated server Intel TDX

**WebFetch (14):**
1. reports.zksecurity.xyz/reports/phala-dstack/
2. phala.com/pricing
3. docs.phala.com chain-of-trust
4. docs.phala.com api-reference provision-dstack-app.md (**404**)
5. docs.phala.com phala-cloud-cli/deploy.md
6. github.com/automata-network/automata-dcap-attestation
7. cloud.google.com confidential-vm pricing (truncated by the fetch tool; re-read with curl)
8. cloud.google.com supported-configurations (301 redirect)
9. docs.cloud.google.com supported-configurations
10. docs.phala.com/phala-cloud/pricing (307 redirect)
11. cloud.phala.com/about/pricing
12. docs.phala.com CLI reference `phala deploy`
13. docs.phala.com dstack-cloud/kms-and-key-delivery
14. docs.phala.com dstack-cloud/run-on-gcp

**Local analysis scripts** (run with `python3 -I` on downloaded data):
- Parsed the sample quotes for version, size and cert type.
- Measured collateral field sizes.
- Replayed the MPC fixture's RTMR3 events (all digests matched; replay equals `rtmr3`).
- Computed the `none` key-provider digests.
- Extracted text from the GCP pricing HTML.

### Gaps and limits

- **dstack audit PDF:** not read locally (no PDF tool). The zkSecurity HTML report was used instead.
- **GCP TDX quotes:** the cert-data type and the PPID on GCP were not checked directly. The paper says the PPID is present.
- **Alibaba g8i price:** not found.
- **Phala `key_provider: none`:** not confirmed. The CLI exposes kms, local and tpm only, so this goes to spike S-4.
- **Empty PPID in Phala's list:** the reason is unknown.
- **Phala node TCB status** (`UpToDate` or not): unknown; to be checked in S-4.
- **Option D gas estimate:** DERIVED and untested.
