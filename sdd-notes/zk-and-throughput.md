# OI-5 and OI-17: Groth16 on NEAR, trusted setup, Clearing throughput

Research notes for SDD §11 OI-5 (Groth16 verification gas; ceremony plan) and OI-17 (Clearing per-shard throughput; sharding plan). Research date: 2026-11-11/12 (UTC). Nothing was built, deployed or signed up for. The only network calls were public, account-free JSON-RPC reads (`status`, `EXPERIMENTAL_protocol_config`, `block`, `chunk`, `EXPERIMENTAL_tx_status`) against `rpc.mainnet.near.org`, `free.rpc.fastnear.com`, `archival-rpc.mainnet.fastnear.com` and `test.rpc.fastnear.com`.

Labels:
- **PRIMARY**: nearcore / near-sdk / snarkjs / circomlib source, NEPs, official docs or blogs, or live chain data.
- **SECONDARY**: third-party write-ups or repos.
- **UNVERIFIED**: search snippets, self-reported claims, or anything I could not check.
- **ESTIMATE**: my own arithmetic. The inputs are shown each time.

---

## 0. Summary

| Item | Status | One-line answer |
|---|---|---|
| OI-5.1 host functions and gas | **Resolved** (testnet confirmation still in S-3) | `env::alt_bn128_g1_multiexp`, `env::alt_bn128_g1_sum` and `env::alt_bn128_pairing_check` in near-sdk 5.30.1. A BN254 Groth16 verify costs **≈34.3 / 35.9 / 37.5 Tgas for N = 10 / 15 / 20 public inputs** (ESTIMATE from nearcore params). A third-party sandbox measured 35.02 Tgas (12 inputs) and 36.30 Tgas (16 inputs). Per-call limit is **1,000 Tgas** (1 PGas) since protocol 83. |
| OI-5.2 existing verifiers | **Resolved** | ZeroPool (2020–24), hideyour-cash `near_groth16_verifier` 1.0.1 (2022, near-sdk 4) and Nymira `nymira-verifier` (2026-11, measured gas). Aurora's EVM bn256 precompiles call the same host functions. BLS12-381 host functions (NEP-488) are live: **≈20.9 / 25.6 / 30.2 Tgas** for N = 10 / 15 / 20, but there is no circomlib Poseidon or public snarkjs ptau for that curve. |
| OI-5.3 ceremony | **Resolved as a plan** | Phase 1: PSE PPoT `ppot_0080_13.ptau` (2¹³ = 8,192 points, 9.1 MB) or Hermez `powersOfTau28_hez_final_13.ptau` (54 contributions + beacon, 9.5 MB). Phase 2: `snarkjs zkey contribute/beacon/verify`, one zkey per (formula, rule) circuit. p0tion is archived (LTS), but ceremony.pse.dev is still up. PLONK/fflonk use 2 pairings instead of 4 (host-only floor ≈ 26.8 / 22.2 Tgas), but their Fr arithmetic in wasm is unmeasured. |
| OI-5.4 Poseidon | **Resolved** | circomlib `Poseidon(n)` supports n = 1…16. By the source formula, 6 / 8 / 10 inputs cost **354 / 402 / 459** constraints (ESTIMATE). The contract never computes Poseidon. |
| OI-17 throughput | **Partially resolved** (needs load test of real Clearing gas) | Mainnet has **10 shards**, **1,000 Tgas per chunk**, and **587.8 ms per block height** (measured). A hot contract tops out at about **170 / 57 / 17 calls/s** for 10 / 30 / 100 Tgas calls (ESTIMATE). At ~100 Tgas burnt per Sealed job, one shard is about **17 jobs/s ≈ 1.47M jobs/day at 100% of the shard**, or ≈ 4 jobs/s (≈ 367k/day) at a 25% share. Mainnet shards currently average 0.1–2% of chunk gas. |

---

## 1. OI-5.1 NEAR alt_bn128 host functions and gas

### 1.1 Function names (near-sdk 5.x), PRIMARY

Source: `near/near-sdk-rs`, tag `near-sdk-v5.30.1` (released 2026-11-05), `near-sdk/src/environment/env.rs` lines 976–1163.

```rust
pub fn alt_bn128_g1_multiexp(value: impl AsRef<[u8]>) -> Vec<u8>   // returns 64-byte G1
pub fn alt_bn128_g1_sum(value: impl AsRef<[u8]>) -> Vec<u8>        // returns 64-byte G1
pub fn alt_bn128_pairing_check(value: impl AsRef<[u8]>) -> bool
// BLS12-381 (NEP-488):
pub fn bls12381_p1_sum / bls12381_p2_sum / bls12381_g1_multiexp / bls12381_g2_multiexp
       bls12381_map_fp_to_g1 / bls12381_map_fp2_to_g2 / bls12381_p1_decompress / bls12381_p2_decompress
       (value) -> Option<Vec<u8>>
pub fn bls12381_pairing_check(value) -> Option<bool>
```

- The functions are not feature-gated: the `[features]` list in near-sdk's `Cargo.toml` has no flag for them.
- In near-sdk 5.0.0 the signature took `&[u8]`; it is now `impl AsRef<[u8]>`.
- Raw imports are `near_sdk::sys::{alt_bn128_g1_multiexp, alt_bn128_g1_sum, alt_bn128_pairing_check}`.

### 1.2 Input encodings, PRIMARY

Source: nearcore `master` @ `aa2cdc5128502311000040fc5b23f7be13490153` (2026-11-11). Files are `runtime/near-vm-runner/src/logic/host.rs` (fns at ~L1042–1192) and `runtime/near-vm-runner/src/logic/alt_bn128.rs`.

| Function | Element layout | Bytes per element | Notes |
|---|---|---|---|
| `alt_bn128_g1_multiexp` | `[((x: u256, y: u256), scalar: u256)]` | 96 | Packed **little-endian**. The scalar must be < r ("invalid fr"). Uses Pippenger. |
| `alt_bn128_g1_sum` | `[(sign: u8, (x, y))]` | 65 | `0` = add, `1` = subtract, so use sign = 1 to negate A. |
| `alt_bn128_pairing_check` | `[((x, y), ((x_re, x_im), (y_re, y_im)))]` | 192 | Returns 1 if ∏ e(Pᵢ, Qᵢ) = 1. Fq2 is ordered **(re, im)**. |

Where NEAR's encoding differs from Ethereum's EIP-196/197:
- NEAR is **little-endian**; EIP-196/197 are big-endian.
- NEAR orders Fq2 as **(re, im)**; EIP-197 uses (im, re).
- snarkjs `verification_key.json` and `proof.json` store G2 coordinates as `[c0, c1]`, which is (re, im). The snarkjs Solidity template swaps them to `[c1, c0]` for EIP-197 (`templates/verifier_groth16.sol.ejs` L32–35). For NEAR, keep the JSON order and convert each decimal to 32-byte LE. Both hideyour-cash (`pairing.rs`) and Nymira do this.

Point checks performed by the host:
- **Invalid points abort the call.** An off-curve point, a G2 point outside the subgroup, or a coordinate ≥ p makes the host return `HostError::AltBn128InvalidInput`. This is a contract panic, not `false`. Nymira confirmed this on nearcore 2.13.4 and 2.14.0-rc.5 (SECONDARY).
  - Consequence: a malformed proof makes `submit_verdict` fail as a whole transaction. No state changes and no `verdict_rejected` event is emitted.
  - This is consistent with SDD §3.17 ("job stays open"), but the reason code cannot be written on that path.
- **The point at infinity is accepted** (encoded as (0, 0)). Reject it for A, B and C in the contract, as Nymira does.

### 1.3 Gas parameters, PRIMARY

Source: nearcore `core/parameters/res/runtime_configs/parameters.yaml` L285–304, L317, L328, L378–391 and `parameters.snap` L199–227 at `aa2cdc51…`. The live mainnet values are identical; they were read with `EXPERIMENTAL_protocol_config` on 2026-11-11 at protocol_version 88, nearcore 2.14.0. Testnet is also PV 88 with the same values.

| Parameter | Gas | Tgas |
|---|---:|---:|
| `wasm_alt_bn128_g1_multiexp_base` | 713,000,000,000 | 0.713 |
| `wasm_alt_bn128_g1_multiexp_element` | 320,000,000,000 | 0.320 |
| `wasm_alt_bn128_pairing_check_base` | 9,686,000,000,000 | 9.686 |
| `wasm_alt_bn128_pairing_check_element` | 5,102,000,000,000 | 5.102 |
| `wasm_alt_bn128_g1_sum_base` | 3,000,000,000 | 0.003 |
| `wasm_alt_bn128_g1_sum_element` | 5,000,000,000 | 0.005 |
| `wasm_bls12381_pairing_base` / `_element` | 2,130,000,000,000 each | 2.13 each |
| `wasm_bls12381_g1_multiexp_base` / `_element` | 16,500,000,000 / 930,000,000,000 | 0.0165 / 0.93 |
| `wasm_bls12381_p1_sum_base` / `_element` | 16,500,000,000 / 6,000,000,000 | 0.0165 / 0.006 |
| `wasm_bls12381_g2_multiexp_base` / `_element` | 18,600,000,000 / 1,995,000,000,000 | 0.0186 / 1.995 |
| `max_gas_burnt` (per function call) | 1,000,000,000,000,000 | **1,000** |
| `max_total_prepaid_gas` (per tx / receipt) | 1,000,000,000,000,000 | **1,000** |
| chunk `gas_limit` (mainnet protocol config) | 1,000,000,000,000,000 | **1,000** |

How the cost formula works (host.rs doc comments and code):
- The charge is `base + element × number_of_elements`, plus the generic `base` / `read_memory` / `write_register` costs.
- It is linear: `pay_per(element, elements.len())`.
- No `compute:` override exists for the curve parameters, so compute = gas.

History:
- **300 Tgas → 1 PGas.** `83.yaml` (read at nearcore commit `ab0dc49772`) contains "Increase gas limit to 1 PetaGas": `max_gas_burnt`, `max_gas_burnt_view` and `max_total_prepaid_gas` go from 300 Tgas to 1 PGas. A search snippet of a docs PR ties PV 83 to nearcore 2.11.0 (UNVERIFIED for the release number).
- **docs.near.org** (PRIMARY): "A single transaction can attach at most **1 PGas (1,000 TGas)** in total across all its function-call actions" (https://docs.near.org/protocol/transactions/gas).
- **BLS12-381 costs** were set in `70.yaml`, moving from the 300-Tgas placeholder to the values above.
- The **`bls12381_not_in_group_fix`** flag is `false` on mainnet PV 88 and becomes `true` at PV 89 (`89.yaml`). Until then, the points (0, ±2) are mishandled by `p1_sum`.
- The **alt_bn128 functions** were stabilized in nearcore 1.28.0 (SECONDARY: newreleases.io summary of the 1.28.0 release notes, PR #6813).

### 1.4 Groth16 verification arithmetic (ESTIMATE, from the parameters above)

Groth16 check: `e(−A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1`, where `vk_x = IC₀ + Σ xᵢ·ICᵢ`.

Best shape:
- one `g1_multiexp` over **N+1** elements, with IC₀ given scalar 1 (as ZeroPool and Nymira do);
- one `g1_sum` with sign = 1 to get −A;
- one `pairing_check` with **4** pairs.

Calculator: `/private/tmp/claude-501/-Users-jay-Desktop-work-near-hackathon-marginal/49238a8f-e25b-410a-8b4c-4a5af5a726df/scratchpad/calc/gas.py`.

```
pairing(4) = 9.686 + 4×5.102 = 30.094 Tgas
MSM(N+1)   = 0.713 + (N+1)×0.320
neg A      = 0.003 + 0.005 = 0.008
```

| Public inputs N | MSM | Pairing | Host total (BN254) | Naive port (one multiexp per input + pairwise g1_sum, hideyour-cash style) |
|---:|---:|---:|---:|---:|
| 10 | 4.233 | 30.094 | **34.34 Tgas** | 40.58 |
| 12 | 4.873 | 30.094 | 34.98 | 42.67 |
| 15 | 5.833 | 30.094 | **35.94 Tgas** | 45.81 |
| 16 | 6.153 | 30.094 | 36.26 | 46.85 |
| 20 | 7.433 | 30.094 | **37.54 Tgas** | 51.04 |

**Cross-check against a measurement (SECONDARY).** Nymira (`github.com/nymiralabs/nymira`, `crates/nymira-verifier/README.md`, issue #14 closed 2026-11-03) measured total gas burnt on the near-workspaces 0.23.0 sandbox:
- **35.02 Tgas** for a 12-input proof, against 34.98 by my arithmetic;
- **36.30 Tgas** for a 16-input proof, against 36.26 by my arithmetic.

So the host functions are about 99.9% of the measured cost. Their notes add two points:
- Decoding the verifying key from canonical bytes with arkworks (curve and subgroup checks) cost **~40 Tgas** (39.9 and 41.8). They do it once, in `new()`.
- Lesson: **store the VK pre-encoded in host-ready LE bytes**, and never parse or validate it per call.

**Budget for Marginal's `submit_verdict` (Sealed)** (ESTIMATE):

| Component | Tgas |
|---|---:|
| Groth16 verify with ~14 inputs | ≈ 35.6 |
| ed25519 verdict signature (`ed25519_verify_base` 0.21 T + ~9 Mgas/byte) | ≈ 0.3 |
| borsh decode, state reads and writes, events, a settlement promise | ≈ 5–15 (to be measured in S-3) |
| **Total** | **≈ 41–51** |

- Recommendation: attach **≈ 60–80 Tgas**, not 300 (see §5.4 on why over-attaching hurts).
- Against the per-call limit of 1,000 Tgas this is ≈ 4–5%. Even the old 300 Tgas limit would leave ample headroom.

**BLS12-381 alternative** (ESTIMATE):

```
pairing(4) = 2.13 + 4×2.13 = 10.65
MSM(N+1)   = 0.0165 + (N+1)×0.93
neg A      = 0.0225
```

| N | BLS12-381 total | Saving vs BN254 |
|---:|---:|---:|
| 10 | **20.92 Tgas** | −13.4 T |
| 15 | **25.57 Tgas** | −10.4 T |
| 20 | **30.22 Tgas** | −7.3 T |

The pairings are about 3× cheaper, but each MSM element costs about 2.9× more. Using BLS12-381 also means:
1. circomlib's Poseidon constants are generated for the BN254 field only, so a new Poseidon instance would be needed (more audit surface).
2. The Hermez/PPoT ptau files are BN254-only. snarkjs can run a `bls12-381` ceremony, but I found no public prepared BLS12-381 `.ptau` (UNVERIFIED that none exists).
3. The subgroup fix is not live on mainnet until PV 89.

**Recommendation:** stay on BN254.

**Groth16 batch verification** (v2/v3 lever, ESTIMATE). k proofs under the same VK verify with **k+3 pairings** instead of 4k (Zecale, arXiv 2008.05958, SECONDARY), using random scalars rᵢ derived after the proofs are fixed (for example, hash all proofs together with `env::random_seed()`).

| k proofs | Batch total | Per proof |
|---:|---:|---:|
| 1 | 38.0 Tgas | 38.0 |
| 5 | 61.0 | **12.2** |
| 10 | 89.7 | **9.0** |
| 20 | 147.1 | **7.4** |

Only useful if one submitter batches several verdicts. An NCC audit of Filecoin's aggregation found a bug where the first random scalar was fixed to 1, so sample all of them properly.

### 1.5 Wording fix for SDD §3.17

The SDD says `marginal-groth16 uses env::alt_bn128_g1_multiexp and env::alt_bn128_pairing_check`. Add `env::alt_bn128_g1_sum` (to negate A), require a single multiexp over N+1 elements, and specify LE / (re, im) encoding.

---

## 2. OI-5.2 Existing Groth16 / ZK verifiers on NEAR

| Project | What | Gas data | Status | Label |
|---|---|---|---|---|
| **ZeroPool** `zeropoolnetwork/zeropool-near`, `src/verifiers/groth16/mod.rs` | Privacy pool. `alt_bn128_groth16verify` uses **one multiexp over IC with IC₀·1**, negates A, and pairs 4. Also has PLONK params. ZeroPool also has `zeropoolnetwork/near-groth16-verifier` (2020). | None published | Last push 2024-02-06 | PRIMARY (source) |
| **hideyour-cash / Opact** `near_groth16_verifier` 1.0.1 (crates.io 2022-12-01, repo now `opact-protocol/tickets`) and `near_plonk_verifier` 1.0.0 (2023-06-07) | Takes snarkjs `verification_key.json` fields as JSON. Groth16 does **one `alt_bn128_g1_multiexp` call per input plus a `g1_sum` per add** (≈ +10 Tgas at N = 15). | Tests attach 300 Tgas; no measurement | near-sdk 4.0; last push 2024-06 | PRIMARY (source) |
| **Nymira** `nymiralabs/nymira` (`nymira-verifier`, `contracts/verifier-probe`) | Groth16 for zkapi proofs. Single multiexp and g1_sum negation. Rejects infinity and inputs ≥ r. | **35.02 Tgas (12 inputs), 36.30 Tgas (16 inputs)**; VK decode 39.9–41.8 Tgas once | Active, 2026-11; Apache-2.0 | SECONDARY (self-reported, sandbox) |
| `ShadowCorp-Dev/near-groth16-sdk` (2026-01) | Docs claim "~60–75 TGas base", "g1_sum ~5 TGas", "10 inputs 100–150 TGas" | Inconsistent with nearcore params by about 2–4×; looks unmeasured | — | UNVERIFIED (do not use) |
| `xand6r/near_groth16_implementation` (2024-07) | RISC Zero Groth16 receipt verifier on NEAR (`src/risczero.rs`) | None | Inactive | SECONDARY |
| **Aurora** `aurora-is-near/aurora-engine`, `engine-sdk/src/bn128.rs` | The EVM precompiles 0x06/0x07/0x08 call NEAR's `alt_bn128_*` host functions when built as a contract, so a snarkjs Solidity verifier would run on Aurora. | Not measured; adds EVM interpreter overhead | Active | PRIMARY (source) |
| snarkjs → NEAR generator | None found. No official NEAR template exists; snarkjs only exports Solidity. | — | — | — |

I found no Semaphore deployment on NEAR, and no official NEAR "zk example" repo. Searches for both returned nothing.

**BLS12-381 on NEAR (NEP-488).**
- NEP-488 "Host Functions for BLS12-381 Curve Operations" has Status: **Final** (https://github.com/near/NEPs/blob/master/neps/nep-0488.md). PRIMARY.
- Ten functions are listed in §1.1, with costs in §1.3.
- `p1_sum`, `p2_sum` and the decompress functions do **not** check subgroup membership. `g1_multiexp`, `g2_multiexp` and `pairing_check` do (near-sdk 5.30.1 docs).
- These are the host functions NEAR's MPC CKD (BLS12-381) relies on (see spec-notes/near-primitives.md).

---

## 3. OI-5.3 Trusted setup

### 3.1 Phase 1 (Powers of Tau)

**Hermez / iden3 prepared files** (PRIMARY: snarkjs README @ `22003fbcde`, 2026-10-01).
- "Prepared (phase2) Ptau files for bn128 with **54 contributions and a beacon**".
- They are hosted at `https://circom.info/powersOfTau28_hez_final_NN.ptau`. Sizes come from HTTP HEAD on 2026-11-11:

| Power | Max constraints | Size |
|---:|---:|---:|
| 12 | 4k | 4,801,688 B |
| 13 | 8k | 9,520,280 B |
| 14 | 16k | 18,957,464 B |
| 15 | 32k | 37,831,832 B |

- The README lists a blake2b hash for each file.

**PSE Perpetual Powers of Tau** (PRIMARY: `privacy-ethereum/perpetualpowersoftau` README; the repo was **archived** after its last push on 2024-12-04).
- Prepared files come "from **contribution 0080** … converted to snarkjs `.ptau` format, had a beacon applied". The beacon is the randao_reveal of beacon-chain slot 7,325,000 with 31 iterations.
- Files: `https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_NN.ptau`. HEAD on 2026-11-11 returned 200:

| File | Size | Last-Modified |
|---|---:|---|
| `ppot_0080_12` | 4,811,922 B | 2024-04-09 |
| `ppot_0080_13` | 9,530,514 B | 2024-04-09 |
| `ppot_0080_14` | 18,967,698 B | 2024-04-09 |

- PSE's retrospective (2025-01-15) says PPoT has run "since 2019, with **85 contributors** to date" (https://pse.dev/blog/retrospective-trusted-setups-and-p0tion-project). PRIMARY.

**Which power is needed.** From snarkjs `src/zkey_new.js` L59, Groth16 needs `cirPower = ceil(log2(nConstraints + nPubInputs + nOutputs + 1))`.
- For "a few thousand" constraints plus ~15 public inputs: **2¹² = 4,096 covers up to ~4,080 constraints; 2¹³ = 8,192 covers up to ~8,175**.
- **Recommendation: use 2¹³ (9.1–9.5 MB), or 2¹⁴ (18 MB) for headroom.** Prefer `ppot_0080_13` (80 contributions) over Hermez (54).
- Run `snarkjs powersoftau verify` once and commit the hash to `circuits/ceremony/`.

### 3.2 Phase 2 (per circuit)

**Tooling.**
- snarkjs (latest release v0.7.6, 2026-01-26) provides `zkey new`, `zkey contribute`, `zkey export bellman`/`import bellman` (for offline contributors), `zkey beacon`, `zkey verify` and `zkey export verificationkey`.
- **p0tion** (PSE's Groth16 phase-2 automation, used for MACI, Semaphore V4 and zkEmail):
  - The GitHub repo `privacy-ethereum/p0tion` is **archived**, last push 2026-03-29. Its README says "This project is not actively developed anymore. Unless there are critical bugs…". PRIMARY.
  - The PSE project page lists it as sunset with long-term support.
  - `https://ceremony.pse.dev` still answered HTTP 200 on 2026-11-11.
  - The retrospective says p0tion ran "over 15 internal and external ceremonies".
- **Brebaje** is a self-described p0tion-based CLI used for a Cardano PPoT. UNVERIFIED; its site's TLS certificate failed.
- **DefinitelySetup** (PSE) is the repo where projects request ceremonies on ceremony.pse.dev. It held ZK-Email requests in 2023-11 and 2024-11 (SECONDARY, search).

**How other projects ran theirs.**

| Project | Phase 1 | Phase 2 | Contributors | Source |
|---|---|---|---|---|
| Tornado Cash (2020) | PPoT, 30th contribution | Custom web ceremony | **1,114** contributions (≈ 450 identified + 664 anonymous), completed 2020-05-10 | The Block 2020-05-13 (SECONDARY) |
| Semaphore V4 (2024) | PPoT | p0tion on ceremony.pse.dev; 32 circuits (MAX_DEPTH 1–32) | "**over 400 participants**", completed **13 July 2024** | `semaphore-protocol/semaphore` `apps/docs/versioned_docs/version-V4/what-is-semaphore.md` (PRIMARY) |
| MACI v2.0 / v3.0 | — | p0tion | Counts not published on the docs page. v2.0 and v3.0 small-batch ceremonies are complete and "can be used in production"; large-batch ceremonies had not started. | https://maci.pse.dev/docs/security/trusted-setup (PRIMARY) |
| ZK-Email | — | p0tion (ceremony.pse.dev). DefinitelySetup requests: Email Wallet (6 circuits, 2023-11) and ether-email-auth (3 circuits, 2024-11) | Not found | PSE retrospective (PRIMARY); search (SECONDARY) |
| Zcash Sapling (2018) | — | — | 87 participants | The Block (SECONDARY) |

**Security model.** One honest contributor out of N is enough. Make the final beacon a pre-announced future NEAR block hash or drand round.

**Proposed plan for Marginal.**
1. **HDP / hackathon.**
   - Use `ppot_0080_13.ptau` with team-only phase 2 (2–3 contributions) and a beacon.
   - Label the result "development setup, not production" in the UI and in `circuits/ceremony/README`.
2. **v1 canary.** For each (formula, rule) circuit, run a public sequential ceremony coordinated through GitHub:
   - each contributor downloads the latest zkey, runs `snarkjs zkey contribute`, uploads it, and posts their attestation hash in a signed commit or issue;
   - set a minimum of **≥ 10 contributions, including ≥ 3 independent external parties** (auditor, NEAR ecosystem devs, a seller-side partner);
   - finish with a beacon (the NEAR block hash at a pre-announced height) and publish `zkey verify` transcripts in `circuits/ceremony/`;
   - register VKs through the existing time-lock;
   - at a few MB per zkey (2¹³), contributions can be done in a browser or CLI. No p0tion infrastructure is needed.
3. **Optionally**, request a slot on ceremony.pse.dev through DefinitelySetup. This is best-effort, since p0tion is in LTS.
4. **Every circuit change or new formula template means a new phase 2.** If templates churn, PLONK becomes attractive (§3.3).

### 3.3 Universal-setup alternatives

snarkjs supports **Groth16, PLONK and FFLONK** (the README calls fflonk "Beta"). "PLONK and FFLONK do not require [a circuit-specific ceremony], it's enough with the powers of tau ceremony which is universal" (README L344–346, PRIMARY).

**ptau size needed** (PRIMARY: `src/plonk_setup.js` L74–80, `src/fflonk_setup.js` L112–116):
- **PLONK** needs `2^ceil(log2(plonkConstraints))`. snarkjs's PLONK constraint count includes linear-combination additions, so it is typically larger than the R1CS count.
- **fflonk** needs the ptau's G1 section to hold `domainSize·9 + 18` points, which in practice is **power + 4**. A 2¹⁴-domain circuit would need the 2¹⁸ ptau (288 MB).

**On-chain cost on NEAR** (ESTIMATE, host functions only; Fr arithmetic in wasm is extra):

| Scheme | Pairings | Scalar multiplications (counted in snarkjs Solidity templates) | Host-only Tgas | Unknown wasm cost |
|---|---:|---|---:|---|
| Groth16 | 4 | N+1 (one MSM) | 35.9 (N = 15) | small (measured: ≈ 0.05 T over host) |
| PLONK | **2** (one check, 384 B) | ≈ 17 ecMul + several ecAdd (`verifier_plonk.sol.ejs` `calculateD/F/E`, `checkPairing`) | 26.8 (batched into 2 MSM calls) or 37.5 (17 separate calls) | Batch inversion, Lagrange basis for N inputs, Keccak transcript (host `keccak256` is cheap), and ~100s of 256-bit mulmods in wasm (`regular_op_cost` 822,756 gas/op). **Unmeasured.** |
| fflonk | **2** | ≈ 5 ecMul (`computeFEJ`) | 22.2 | Heavier: roots and Lagrange over 3 evaluation sets plus inversions. **Unmeasured.** |

Conclusion:
- On NEAR, pairings dominate Groth16 (30.1 of 35.9 T), so PLONK and fflonk *could* come out comparable or cheaper.
- But the wasm big-integer field arithmetic is unknown. Nymira's arkworks VK decode costing ~40 Tgas shows that wasm curve and field work is expensive.
- Keep Groth16 for v1. If templates churn, spike PLONK with `near_plonk_verifier` (2023, near-sdk 4, unaudited) or a fresh Rust port.

---

## 4. OI-5.4 Poseidon in circom

Source: `iden3/circomlib` `circuits/poseidon.circom` (master @ `35e54ea21d`, 2025-04-03). PRIMARY.

- `N_ROUNDS_P[16] = [56, 57, 56, 60, 60, 63, 64, 63, 60, 66, 60, 65, 70, 60, 64, 68]`, with `t = nInputs + 1` and `nRoundsF = 8`.
- `poseidon_constants.circom` defines constants for t = 2…17, so **`Poseidon(nInputs)` supports 1…16 inputs**.
- `PoseidonEx(nInputs, nOuts)` adds an `initialState` input for chaining.
- The S-box `Sigma` is x⁵ built from 3 multiplications, so **3 constraints**. Linear layers (Ark, Mix) are free in R1CS after circom simplification.
- Constraint count (ESTIMATE): `3·(8t + R_P) − 3`. The −3 is because the capacity lane's first S-box input is constant and gets simplified away. This gives 240 for Poseidon(2), which matches the commonly cited figure (UNVERIFIED).

| Inputs | t | R_P | ≈ constraints |
|---:|---:|---:|---:|
| 2 | 3 | 57 | 240 |
| 4 | 5 | 60 | 297 |
| 6 | 7 | 63 | **354** |
| 8 | 9 | 63 | **402** |
| 10 | 11 | 66 | **459** |
| 12 | 13 | 65 | 504 |
| 16 | 17 | 68 | 609 |

Notes for SDD §3.17, where `C = Poseidon(jc_hi, jc_lo, c₁…c_k, ℓ₁…ℓ_j, salt)`:
- The input count is 3 + k + j. If it can exceed 16, either:
  - (a) chain with `PoseidonEx` or a 2-level hash; or
  - (b) **pack the 14-bit scores**. Each value is ≤ 10⁴ < 2¹⁴, so up to 18 values fit in one 252-bit field element. You need `Num2Bits(14)` range checks anyway (≈ 15 constraints per value), so packing is almost free.
- Whole-circuit budget (ESTIMATE): Poseidon ≈ 0.35–0.46k + range checks ≈ 15 × (#values) + rule and formula arithmetic. That is a few thousand constraints, consistent with 2¹³.
- **The Clearing contract never needs Poseidon.** C is an opaque public input. If an on-chain dispute ever has to recompute C from an opening, a wasm Poseidon (e.g. the `light-poseidon` crate) would be needed, and its gas is unmeasured. Keep disputes room-checked (SDD already does).
- Public-input trimming: VKs are stored per (formula, rule), so `formula_id` and `rule_kind` are redundant public inputs and can be baked into the circuit. This saves 0.64 Tgas, which is minor. Hashing all inputs into one (Poseidon) would require on-chain Poseidon, so don't.

---

## 5. OI-17 Clearing contract throughput and sharding

### 5.1 NEAR protocol facts, late 2026

| Fact | Value | Source / label |
|---|---|---|
| Mainnet protocol / client | PV **88**, nearcore **2.14.0** (2.14.1 released 2026-11-11). Master has STABLE = 89, NIGHTLY = 158, SPICE = 200, MIN_SUPPORTED = 85. | RPC `status` 2026-11-11T19:17Z (block 224,106,941); `core/primitives-core/src/version.rs` L168–213. PRIMARY |
| Shards | **10** (ShardLayout V3, ids `[10,11,1,8,9,6,7,4,12,13]`). Boundaries: `650, aurora, aurora-0, earn.kaiching, game.hot.tg, game.hot.tg-0, kkuuue2akv_1630967379.near, tge-lockup.sweat, wallet.ka`. Testnet also has 10. | `EXPERIMENTAL_protocol_config`. PRIMARY |
| Block time | **587.8 ms per height**, averaged over 100,000 heights (224,006,993 → 224,106,993; 58,779 s). Docs and blog say "600ms" blocks and "1.2s finality". | Measured, PRIMARY; https://www.near.org/blog/separation-of-consensus-and-execution (2026-06-22), PRIMARY |
| 200 ms blocks | **SPICE** (separation of consensus and execution): "When SPICE launches, NEAR block times will become 3x faster, enabling 200 millisecond blocks"; "Currently in development". Gated behind `protocol_feature_spice` at PV 200. A Q3-2026 report says it is still in development. No mainnet date. | NEAR blog 2026-06-22 (PRIMARY); version.rs (PRIMARY); search (SECONDARY) |
| Gas per chunk (per shard per block) | **1,000 Tgas** (`gas_limit` = 10¹⁵). Docs: "Each chunk can burn at most `1000Tgas`, i.e. about `1000ms` of compute". Enforced as a compute limit checked before each receipt (`runtime/runtime/src/lib.rs` L2546, L2827), so the receipt that crosses the limit still finishes. | RPC; docs.near.org gas page; source. PRIMARY |
| Max gas per function call / tx | **1,000 Tgas** (since PV 83) | §1.3. PRIMARY |
| Tx admission per chunk | `max_tx_gas` 500 Tgas, falling to `min_tx_gas` 20 Tgas as the *local* shard's incoming congestion rises. This counts the **conversion gas** of included txs (`result.gas_burnt`, ≈ 0.31 Tgas per function-call tx measured), **not attached gas** (`chain/chain/src/runtime/mod.rs` L1252, L1269, L1440). About 1,600 txs per chunk per signer shard, so it does not bind. | PRIMARY + ESTIMATE |
| Congestion control (NEP-539, Final) | Current values:<br>• `max_congestion_incoming_gas` **400 PGas** (raised from 20 PGas in `73.yaml`)<br>• `max_congestion_outgoing_gas` 10 PGas<br>• memory 1 GB<br>• missed chunks 125 (raised from 5 in `79.yaml`)<br>• `max_outgoing_gas` 300 PGas → `min_outgoing_gas` 1 PGas<br>• `allowed_shard_outgoing_gas` 1 PGas<br>• `reject_tx_congestion_threshold` **0.8** (raised from 0.5 in `73.yaml`)<br>Congestion level = max(incoming, outgoing, memory, missed-chunks). New txs whose receiver is on a shard above 0.8 are rejected. Senders throttle forwarding as the receiver's level rises. **No per-receiver or per-account limits.** **Congestion gas counts *attached* gas** (`core/primitives/src/fees.rs` L792–811: `gas_attached_to_fns + prepaid exec/send fees`). | https://github.com/near/NEPs/blob/master/neps/nep-0539.md; parameters.yaml L378–391; source. PRIMARY |
| Bandwidth scheduler | `max_shard_bandwidth` 4.5 MB, `max_single_grant` 4 MiB, `max_base_bandwidth` 100 KB (receipt bytes between shard pairs). Not binding for small receipts. | parameters.snap. PRIMARY |
| Stateless validation | Live. `main_storage_proof_size_soft_limit` 4,000,000 B per chunk; `per_receipt_storage_proof_size_limit` 4.0 MB (4.5 MB at PV 89); `combined_transactions_size_limit` 4 MiB. A second per-chunk limit for storage-heavy calls. | RPC `witness_config`; parameters.snap. PRIMARY |
| Dynamic resharding | **Stabilized in nearcore 2.13.0**: "shards are now split automatically at epoch boundaries based on runtime **state size**". The mainnet epoch config (`core/primitives/res/epoch_configs/mainnet/85.json`) sets `memory_usage_threshold` 40 GB, `min_child_memory_usage` 10 GB, **`max_number_of_shards` 10**, and `min_epochs_between_resharding` 2. Mainnet already has 10 shards: the `wallet.ka` boundary is not in the static 81.json layout, which implies one dynamic split has happened. **So no further automatic splits are expected, and splits are triggered by state size, not gas load.** (RPC `dynamic_resharding: false` appears to be a separate legacy field.) | GitHub release 2.13.0 notes; epoch configs. PRIMARY (the "one split happened" inference is mine) |
| Shard history (hot-account isolation) | PV 48: 4 shards (`aurora` isolated) → PV 64: 5 (`tge-lockup.sweat`) → PV 65: 6 (`game.hot.tg`) → PV 75: 7 (`game.hot.tg-0`, so HOT's contract is alone) → PV 76: 8 (`earn.kaiching`, KAIKAI) → PV 78: 9 (`650`) → now 10 (`wallet.ka`). | `core/primitives/res/epoch_configs/mainnet/*.json`. PRIMARY |
| Storage staking | `storage_amount_per_byte` = **10¹⁹ yoctoNEAR/byte** (= 0.01 NEAR/KB). This is still current on mainnet PV 88. Global contracts cost `0.0001 N`/byte (10²⁰). | RPC; parameters.yaml L51, L414. PRIMARY |
| Load today | 40 blocks sampled, one every 2,500 heights (~16 h). Mean chunk gas per shard is **0.7–18.4 Tgas** (0.07–1.8% of 1,000), max 177.5. Shard 7 (which holds `intents.near`): mean 6.3 Tgas, max 24.9. | Measured via FastNEAR RPC. PRIMARY |
| Typical call gas | **Plain NEAR transfer** 0.45 Tgas (docs).<br>**NEP-141 `ft_transfer`** receipt: **2.34 Tgas** (`token.sweat`), **2.03 Tgas** (`*.omft.near`).<br>**`intents.near` `execute_intents`**: **5.27–5.82 Tgas** burnt on the verifier receipt (300 Tgas attached); whole tx 5.8–11.6 Tgas.<br>Tx conversion: 0.31 Tgas. | docs.near.org gas page; `EXPERIMENTAL_tx_status` on 4 mainnet txs (e.g. `rq5nAi3jhNnxAmbXzkp1kUYuPdthwv2u8vAkR6bihEo`). PRIMARY |
| Benchmarks | NEAR One "Scaling near to 1M TPS" (2025-12-11): **70 shards**, **native transfers only**. "Benchmarking fungible token transfers and optimizing the contract runtime remains as future work". Compute-cost and witness caps were "disabled/adjusted" for the run. | https://blog.nearone.org/announcement/2025/12/11/scaling-near-to-1m-tps.html. PRIMARY |

### 5.2 Max calls per second for one hot contract (ESTIMATE)

A NEAR account lives on exactly one shard. The ceiling is that shard's chunk compute: **1,000 Tgas per chunk**, at **0.5878 s per height**. That gives `calls/s = (1000 / g) / 0.5878`, and it assumes the contract gets the *whole* shard and no chunks are missed.

| Burnt gas per call g | Per chunk | Per second | Per day |
|---:|---:|---:|---:|
| 5.5 Tgas (≈ an `execute_intents` receipt) | 182 | 309 | 26.7 M |
| **10 Tgas** | 100 | **170** | 14.7 M |
| **30 Tgas** | 33.3 | **56.7** | 4.9 M |
| 45 Tgas (Sealed `submit_verdict`) | 22.2 | 37.8 | 3.3 M |
| **100 Tgas** | 10 | **17.0** | 1.47 M |

Caveats:
1. The shard is shared with every other account whose ID falls in its range. Plan for a 25–50% share, not 100%.
2. For 10-Tgas calls, the 4 MB per-chunk storage-proof soft limit may bind first: about 40 KB of recorded trie data per call would cap it at ~100 calls per chunk. **Measure recorded storage-proof size per call in the load test.**
3. Compute costs for trie access are higher than their gas (`touching_trie_node` 2.28 G gas vs 4.0 G compute), so storage-heavy calls fill a chunk faster than their burnt gas suggests.
4. Under SPICE (200 ms blocks), per-shard throughput depends on the per-chunk limit SPICE ships with. That is not published, so don't assume 3×.

**What overload looks like** (from NEP-539 and the parameters):
- Receipts beyond 1,000 Tgas per chunk queue as delayed receipts. Latency grows first.
- New txs targeting the shard are rejected only when the delayed queue's **attached** gas reaches 0.8 × 400 PGas = **320 PGas**. That is 3,200 queued receipts at 100 Tgas attached, or 1,067 at 300 Tgas attached.
- Draining 3,200 calls of 100 Tgas at 10 per chunk takes ≈ 320 blocks ≈ **188 s**. The **200-block yield window is ≈ 118 s**, so **yield/resume fast-path timeouts (SDD §3.6) would fire well before tx rejection**.
- Over-attaching gas does not consume chunk capacity, but it inflates the congestion metrics and so brings rejection closer.

**How high-volume apps cope today:**
- NEAR has repeatedly **resharded to give hot accounts their own shard**: `aurora`, `game.hot.tg` (HOT), `tge-lockup.sweat` (Sweat), `earn.kaiching` (KAIKAI).
- Each is still capped at one shard's throughput.
- `intents.near` shares shard 7 and uses only a few percent of it: `execute_intents` costs ≈ 5.5 Tgas, about 300/s in theory.
- I found no published per-contract TPS figures for Intents, HOT, Sweat, KAIKAI or Ref, nor post-mortems naming a per-contract ceiling. Search returned generic congestion items only, so treat this as UNVERIFIED-absent.
- With `max_number_of_shards = 10` reached and splits driven by state size, **a new hot app cannot count on automatic isolation**.

### 5.3 Marginal's per-job gas and capacity (ESTIMATE; replace with load-test numbers)

Per Sealed job, the Clearing-side calls are listed below. The estimates are anchored on measured references: an `ft_transfer` receipt ≈ 2–2.4 T, `execute_intents` ≈ 5.5 T, and Groth16 ≈ 36 T.

| Call | ≈ Tgas |
|---|---:|
| `ft_on_transfer` / deposit | 5 |
| `request_appraisal` (credential sig, random seed, storage) | 10–20 |
| `authorize_release` (cross-contract from KeyPolicy) | 5–10 |
| `submit_verdict` (Groth16 + settlement) | 41–51 |
| `submit_delivery_receipt` | 3–5 |
| `release_held` + `ft_transfer` callback | 8–12 |
| **Total** | **≈ 70–120 (call it ~100)** |

Open-mode verdicts skip about 36 T.

| Per-job gas | 100% of shard | 50% | 25% |
|---:|---:|---:|---:|
| 70 Tgas | 24.3 jobs/s (2.10 M/day) | 12.2/s (1.05 M/day) | 6.1/s (525 k/day) |
| **100 Tgas** | **17.0 jobs/s (1.47 M/day)** | 8.5/s (735 k/day) | **4.25/s (367 k/day)** |
| 120 Tgas | 14.2/s (1.22 M/day) | 7.1/s (612 k/day) | 3.5/s (306 k/day) |

The SDD and SPEC give no numeric v2/v3 volume targets. I found none in SDD §9 or SPEC.

- The binding constraint is **bursts**, not daily totals. For example, an auction close or a popular listing with hundreds of buyers appraising in the same minute.
- 1,000 Sealed verdicts in 60 s is about 16.7 per second × 45 T ≈ 750 Tgas/s, which is ≈ 44% of one shard.

### 5.4 Recommendations: when and how to shard

**Do first (v1, cheap; these keep a single instance viable through v2):**
1. **Attach tight gas**: about 1.3× measured burnt (for example 60–80 Tgas for Sealed `submit_verdict`), never 300 Tgas. Congestion accounting counts attached gas.
2. **Verifier offload.** Put Groth16 verification in a separate stateless `groth16-verifier` account on a *different* shard and call it cross-contract, with the result coming back through a callback.
   - This takes ≈ 36 T per verdict off the Clearing shard. The cost is about +2 blocks of latency and a callback; the job is already `locked` while promises are pending.
   - Several verifier instances can serve in parallel.
3. **Groth16 batch verification** (v2/v3): when one room submits k verdicts, verify with k+3 pairings. At k = 10 that is ≈ 9 Tgas per proof.
4. **Store VKs pre-encoded** (LE bytes), use a single multiexp, and keep JSON big-number parsing out of the hot path.
5. **Make sharding cheap later**:
   - deploy Clearing as a **global contract** (NEP-591; global-contract host functions are enabled on mainnet) so every instance runs the same code hash;
   - give every `listing_id`/`job_id` an instance prefix;
   - make RoomRegistry and KeyPolicy accept an allow-list of Clearing instances.
6. **Monitor** Clearing burnt gas per chunk, the shard's `congestion_info` (delayed-receipt gas), and yield timeouts.

**Shard the Clearing contract when any of these holds, sustained for more than an hour or forecast for v2/v3** (ESTIMATE thresholds):
- Clearing's burnt gas exceeds **~25% of its shard's chunk gas** (≈ 250 Tgas per chunk; ≈ 4 Sealed jobs/s at 100 T/job);
- the delayed-receipt queue on its shard is non-zero for more than 10 consecutive blocks, or yield timeouts appear;
- the forecast exceeds **~100 k Sealed jobs/day** or peaks above **~5 jobs/s for minutes**.

**How to shard:**
- **By asset class first**: knowledge / dataset / model / disclosure, matching SDD §9.2. Classes have different gas profiles, rooms and buyers, and the leakage ledger and caps are per listing, so they stay local to their instance.
- **Then by listing range** inside a hot class, using a deterministic `listing_id → instance` map held in RoomRegistry.
- **Account placement**: shard membership is decided by the full account-ID string against the boundary list, not by the parent account. Pick instance names that fall in different, lightly loaded ranges and re-check them after any resharding. For example, with today's boundaries `clearing.marginal.near` and `data.clearing.marginal.near` map to shard 8, while `knowledge.clearing.marginal.near` and `models.clearing.marginal.near` map to shard 4 (ESTIMATE; boundaries can change).
- **Cross-instance state is the hard part**: per-identity leakage sub-budgets (AC-12), agent spend caps (§3.21) and per-platform caps (§3.12/§3.13) span listings. Either:
  - (a) give each buyer identity and agent key a **home instance** that owns its caps, with other instances asking it through a cross-contract reservation (+2 blocks); or
  - (b) **split cap allowances statically per instance** (conservative and simple). Platform caps already live with KeyPolicy and the registry (shared). They stay single-instance, but they are low-rate (one call per key release).
- RoomRegistry and KeyPolicy stay single, shared instances (low rate). Re-check their own load once KeyPolicy does on-chain DCAP (OI-2).

---

## 6. Recommended SDD changes (summary)

- **§3.2 ZK row**: "on-chain verification via `env::alt_bn128_g1_multiexp` (one call, N+1 elements), `env::alt_bn128_g1_sum` (−A) and `env::alt_bn128_pairing_check` (4 pairs); ≈ 36 Tgas at 15 public inputs (nearcore params; a third-party measurement agrees within 0.05 T)." Note the LE / (re, im) encoding.
- **§3.17 Contract verification**:
  - add the encoding rules;
  - store VKs pre-encoded;
  - reject the infinity point and inputs ≥ r before host calls;
  - an invalid point aborts the tx, which yields no `verdict_rejected` event;
  - attach about 60–80 Tgas.
- **§3.17 Circuits**:
  - drop `formula_id` and `rule_kind` as public inputs (fixed by the VK);
  - note the Poseidon ≤ 16 input limit with the packing / chaining fallback;
  - give the constraint estimates.
- **§3.17 Trusted setup**: phase 1 = `ppot_0080_13.ptau` (PPoT, 80 contributions + beacon), with the hash pinned. Phase 2 = a public sequential snarkjs ceremony per circuit, ≥ 10 contributions including ≥ 3 external, ending with a NEAR-block-hash beacon. HDP uses a labelled dev setup. Note that p0tion is archived (LTS).
- **§3.2 Alternative kept open**: "PLONK/fflonk (2 pairings; host-only ≈ 27/22 Tgas, but wasm Fr arithmetic unmeasured; spike before adopting)". Also "BLS12-381 (≈ 26 Tgas at N = 15) rejected for v1: no circomlib Poseidon or public ptau".
- **§5.5 S-3 pass criterion**: "proof verifies on testnet; verify step ≤ 40 Tgas burnt; `submit_verdict` total ≤ 80 Tgas; record storage-proof bytes per call."
- **§9.2 Contract throughput**:
  - replace with the numbers in §5.2–5.4: 10 shards, 1,000 Tgas per chunk, ~0.59 s blocks, about 17 jobs/s at 100 T/job for a whole shard;
  - add the shard triggers and verifier offload;
  - Clearing as a global contract;
  - add a **yield-timeout vs congestion** risk to §3.6 and §7.
- **§11 OI-5**: mark gas as resolved by analysis, with S-3 confirming. Close the ceremony plan.
- **§11 OI-17**: partially resolved. Keep a load test that measures per-call burnt gas and storage-proof size.

---

## 7. Sources

### Primary
- nearcore master `aa2cdc5128502311000040fc5b23f7be13490153` (2026-11-11):
  - `core/parameters/res/runtime_configs/parameters.yaml`, `parameters.snap`, `87.yaml`, `88.yaml`, `89.yaml`, `150.yaml`, `157.yaml`;
  - `core/parameters/src/snapshots/*`;
  - `runtime/near-vm-runner/src/logic/host.rs`, `alt_bn128.rs`;
  - `core/primitives-core/src/version.rs`;
  - `chain/chain/src/runtime/mod.rs`;
  - `runtime/runtime/src/lib.rs`;
  - `core/primitives/src/fees.rs`, `congestion_info.rs`, `epoch_manager.rs`;
  - `core/primitives/res/epoch_configs/mainnet/*.json`.
  - https://github.com/near/nearcore
- nearcore at `ab0dc49772`: `core/parameters/res/runtime_configs/83.yaml` (1 PGas), `70.yaml` (BLS costs), `73.yaml` and `79.yaml` (congestion changes).
- nearcore release notes 2.13.0 and 2.14.0: https://github.com/near/nearcore/releases
- near-sdk-rs `near-sdk-v5.30.1`, `near-sdk/src/environment/env.rs`, `near-sdk/Cargo.toml`: https://github.com/near/near-sdk-rs
- NEP-488: https://github.com/near/NEPs/blob/master/neps/nep-0488.md
- NEP-539: https://github.com/near/NEPs/blob/master/neps/nep-0539.md
- NEAR docs, Gas: https://docs.near.org/protocol/transactions/gas
- NEAR blog, SPICE (2026-06-22): https://www.near.org/blog/separation-of-consensus-and-execution
- NEAR One, "Scaling near to 1M TPS" (2025-12-11): https://blog.nearone.org/announcement/2025/12/11/scaling-near-to-1m-tps.html
- Mainnet and testnet JSON-RPC (status, EXPERIMENTAL_protocol_config, block, chunk, EXPERIMENTAL_tx_status), 2026-11-11.
- snarkjs README and `templates/verifier_{groth16,plonk,fflonk}.sol.ejs`, `src/{zkey_new,plonk_setup,fflonk_setup}.js` (master `22003fbcde`, 2026-10-01): https://github.com/iden3/snarkjs
- circomlib `circuits/poseidon.circom`, `poseidon_constants.circom` (`35e54ea21d`): https://github.com/iden3/circomlib
- PPoT README (archived): https://github.com/privacy-ethereum/perpetualpowersoftau
- p0tion README (archived): https://github.com/privacy-ethereum/p0tion
- PSE retrospective (2025-01-15): https://pse.dev/blog/retrospective-trusted-setups-and-p0tion-project (source: `privacy-ethereum/pse.dev` `content/articles/retrospective-trusted-setups-and-p0tion-project.md`)
- Semaphore V4 docs: `semaphore-protocol/semaphore` `apps/docs/versioned_docs/version-V4/what-is-semaphore.md`
- MACI trusted setup: https://maci.pse.dev/docs/security/trusted-setup
- Verifier sources:
  - ZeroPool: https://github.com/zeropoolnetwork/zeropool-near
  - hideyour-cash / Opact: https://github.com/opact-protocol/tickets
  - Aurora: https://github.com/aurora-is-near/aurora-engine (`engine-sdk/src/bn128.rs`)
- crates.io API: `near_groth16_verifier`, `near_plonk_verifier`.

### Secondary
- Nymira verifier README and issues #1 and #14 (2026-11-01 → 11-03): https://github.com/nymiralabs/nymira
- The Block, Tornado Cash ceremony (2020-05-13): https://www.theblock.co/linked/65115/ethereum-tornado-cash-trusted-setup-ceremony
- Zecale, arXiv 2008.05958: https://arxiv.org/pdf/2008.05958
- NCC Group Filecoin Groth16 audit, 2021: https://pentestreports.com/files/reports/nccgroup/NCC_Group_ProtocolLabs_FilecoinGroth16_Report_2021-06-02.pdf
- Nansen NEAR Q2/Q3 2026 reports on SPICE status (search snippets).
- newreleases.io, nearcore 1.28.0 (alt_bn128 stabilized).

### Unverified
- ShadowCorp `near-groth16-sdk` gas tables.
- Brebaje (TLS failure).
- The nearcore 2.11.0 ↔ PV 83 mapping, which comes from a docs-PR snippet.
- The commonly cited figure of 240 constraints for Poseidon(2).

---

## 8. Query log

**WebSearch (18)**
1. NEAR protocol increase function call gas limit 300 Tgas to 1 PGas max_total_prepaid_gas (extended)
2. Groth16 verifier NEAR smart contract alt_bn128_pairing_check gas Tgas
3. github near-groth16-verifier rust snarkjs verification_key near-sdk
4. zeropool near contract alt_bn128 groth16 verification gas cost TGas
5. nearcore alt_bn128 host functions enabled protocol version gas costs estimation pairing_check_element
6. NEAR protocol zk proof verifier contract "TGas" groth16 OR plonk measured verification cost (extended) → led to Nymira
7. PSE perpetual powers of tau ceremony ppot contributions final ptau files download 2024 2025
8. "p0tion" retrospective trusted setups PSE ceremonies contributors Semaphore MACI zkEmail sunset
9. Semaphore v4 trusted setup ceremony contributions completed number of contributors
10. Tornado Cash trusted setup ceremony 2020 number of contributions 1114 phase 2 snarkjs
11. zk-email trusted setup ceremony p0tion contributors circuits 2024 MACI v2 ceremony contributors
12. NEAR SPICE separate consensus execution 200ms blocks mainnet launch date 2026 (extended)
13. NEAR 1 million TPS benchmark shards per-shard TPS native token transfers results
14. HOT game.hot.tg congestion NEAR shard 2024 resharding dedicated shard delayed receipts
15. intents.near verifier contract transactions per day throughput congestion NEAR Intents 2026 shard
16. snarkjs bls12-381 ptau powers of tau file public ceremony circom --prime bls12381 poseidon constants
17. brebaje trusted setup ceremony tool p0tion successor github
18. Groth16 batch verification same verifying key "n + 3" pairings random linear combination bellman batch verifier

**WebFetch (9)**
- lib.rs `near_groth16_verifier` (403)
- pse.dev retrospective (body missing, so the repo source was used instead)
- docs.semaphore.pse.dev/trusted-setup (404)
- docs.near.org gas
- NEP-539 (GitHub)
- near.org SPICE blog
- nearone 1M TPS blog
- brebaje (TLS error)
- maci.pse.dev trusted setup

**Source reads via `gh api` / git sparse clone / curl (≈ 45)**
- nearcore:
  - commits for master and the parameters.yaml history;
  - runtime_configs (current and @`ab0dc49772`, 28 historical yaml files);
  - snapshots, version.rs, host.rs, alt_bn128.rs, chain runtime mod.rs, runtime lib.rs, fees.rs, congestion_info.rs, epoch_manager.rs;
  - mainnet epoch configs;
  - release notes 2.13.0 and 2.14.0.
- near-sdk-rs: releases; env.rs @ master, @5.30.1 and @5.0.0; Cargo.toml.
- crates.io API ×2.
- hideyour-cash / opact: tree, README, lib.rs, pairing.rs, tests, plonk lib.
- ZeroPool ×2 repos.
- ShadowCorp GAS.md.
- xand6r README.
- Aurora bn128.rs.
- Nymira: issues #1 and #14 with comments, verifier README, lib.rs, sandbox.rs.
- snarkjs: README, 3 templates, 3 setup sources, releases.
- circomlib: poseidon.circom and constants.
- PPoT README and HEAD on ppot_0080_{12,13,14}.
- Hermez ptau HEAD for powers 12–15.
- p0tion README.
- PSE retrospective source.
- Semaphore docs ×3.
- Mainnet RPC: status, protocol_config, a 100k-height block-time measurement, 40-block per-shard gas sample, 12 chunk reads, 4 tx statuses.
- Testnet RPC: status and protocol_config.
