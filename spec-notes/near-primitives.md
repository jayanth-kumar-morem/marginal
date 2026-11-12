# NEAR primitives: fact-check for SPEC.md

*Prepared 2026-11-11. Research only: nothing was built, deployed, posted, signed up for or paid for. This file covers MOONSHOT.md §2 (items 1, 3, 4), §3.3, §4.2, §4.5, §12 (CKD and Shade rows) and §16 "NEAR primitives", plus the NEAR claims in `moonshot-notes/`.*

**Source labels.** PRIMARY means official docs, source code, the paper itself, or the company's own blog or press release. SECONDARY means press, aggregators, reposts, or independent analysis. UNVERIFIED means the claim appeared only in a search-result snippet, or the page could not be fetched. Undated docs pages are marked "undated (accessed 2026-11-11)".

**Pages that failed.**
- The Mintlify quickstart returned HTTP 410 Gone.
- `docs.near.org/blog/2026-02-23-shade-agent-framework-2.0` returned 404. A copy exists in the Shade GitHub repo.
- `docs.near.org/blog/2025-12-11-blockchain-finality-benchmark(.md)` returned 404.
- `mpc-operators.nearone.org/overview.html` returned 404.
- `defillama.com/protocol/near-intents` returned 403, so I used the DefiLlama public API instead.
- The NEAR AI DCML blog returned 404.
- `docs.near.org/tutorials/intents/withdraw` returned 404.
- `mpc.nearone.org` loaded, but its data is rendered by JavaScript and did not come through.

---

## 1. Verdict table

| # | Claim (as worded in MOONSHOT or the notes) | Verdict | What the source actually says | URL | Source type | Source date |
|---|---|---|---|---|---|---|
| 1 | §2.3: CKD is "a key that only an attested TEE app, approved by a NEAR contract, can obtain" | **OVERSTATED** | The TEE app sends its public key and attestation to a *Developer contract* that "verifies that the app is running inside a secure environment through remote attestation". The MPC contract then sets `app_id` to the caller's account id. The MPC network checks no attestation itself, so the guarantee is only as strong as the developer contract's checks and its upgrade keys. | https://blog.nearone.org/research/2026/02/23/mpc-ckd.html | PRIMARY | 2026-02-23 |
| 2 | §2.3 / §4.2: CKD key "can re-derive after a crash on different hardware" | **CONFIRMED** | "The app can derive the exact same key as many times as it desires even when running on a different TEE." The key is "unique to the app and not specific to the TEE." | same | PRIMARY | 2026-02-23 |
| 3 | §4.2 L1: "threshold BLS + ElGamal, key encrypted to the TEE app's ephemeral key" | **CONFIRMED** | CKD "at its core uses threshold BLS signatures" (BLS12-381). The key is `msk·H(pk, app_id)`, and the app recovers it from ElGamal-style shares `C_i = S_i + y_i·A` sent to its fresh key `A`. | same | PRIMARY | 2026-02-23 |
| 4 | §2.3: a good "can be sealed to a policy ('only the Marginal appraiser at codehash X, only for this auction')" | **OVERSTATED** | The key is bound to `app_id` (the developer contract's account) plus an optional "arbitrary key derivation string". Codehash and per-auction scoping are not CKD features, so Marginal's own contract must enforce them. | same | PRIMARY | 2026-02-23 |
| 5 | §4.5 / §12: "CKD public verifiability is still on NEAR's roadmap / still 'next step'" | **CONFIRMED** (as of Feb 2026) | Only private verifiability exists today: the app checks `e(key,G2)=e(H(pk,app_id),pk)`. Public verifiability is "planned as a next step". I found no later announcement, so its Nov-2026 status is unverified. | same | PRIMARY | 2026-02-23 |
| 6 | §12: "recovery keys not post-quantum" (cited to the NEAR One CKD post) | **CORRECTED** (wrong source) | The CKD post does not mention post-quantum at all. The statement comes from NEAR's X article: "CKD is also based on threshold signing and uses recovery keys that are not post-quantum secure." | https://youmind.com/landing/x-viral-articles/near-chain-signatures-tee-verification (repost of an @NEARProtocol X article by Anton Astafiev and Mally Anderson) | SECONDARY (repost of PRIMARY) | 2026-10-22 |
| 7 | §4.2 L1: "to be upgraded to CKD" (implies CKD is usable) | **UNVERIFIED** (but likely live on mainnet) | I found no official CKD mainnet launch post. The `near/mpc` README lists "Confidential key derivation on BLS12-381". OutLayer's mainnet keystore "calls `request_app_private_key` through the vault's proxy method", and an independent review notes "the CKD domain's re-sharing kept failing, so it was cancelled". | https://github.com/near/mpc ; https://app.outlayer.ai/docs/vaults ; https://alinush.github.io/near | PRIMARY ; PRIMARY (OutLayer) ; SECONDARY | undated ; undated ; 2026-05-01 (updated to 2026-10-23) |
| 8 | §2.3 / §3.3 / §4.2 / §4.5: MPC is "11-of-17" | **CONFIRMED by NEAR, but an independent source conflicts** | NEAR: "The Chain Signatures MPC now runs on mainnet with a required signing threshold of 11 out of 17 nodes". An independent review says "11 out of 16 secret-sharing on mainnet, as of October 23rd, 2026" and "5 out of 8 as of May 1st, 2026". The live value can be read from the `v1.signer` `state` view method (docs.near.org). | youmind repost (row 6) ; https://alinush.github.io/near ; https://docs.near.org/chain-abstraction/chain-signatures | SECONDARY (repost of PRIMARY) ; SECONDARY ; PRIMARY | 2026-10-22 ; 2026-10-23 ; undated |
| 9 | §2.3 / §3.3: MPC is "running in TEEs on mainnet" | **CONFIRMED, but only since about Oct 2026** | "All MPC nodes on mainnet are TEE-backed (as of October 23rd, 2026)". On 2026-05-01 the nodes were not TEE-backed. NEAR says the hardware is "in NEAR's case Intel TDX". | https://alinush.github.io/near ; youmind repost | SECONDARY ; SECONDARY (repost of PRIMARY) | 2026-10-23 ; 2026-10-22 |
| 10 | §4.2 L2: "Shade Agents (codehash approved in the agent contract, dstack/TDX)" | **STALE** | docs.near.org says: "Do not use the Shade Agent Framework. It has not been maintained since April 19, 2026." Also, v2.0 (2026-02-23) replaced single-codehash approval: "the contract now requires you to approve a set of measurements". | https://docs.near.org/ai/shade-agents ; https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/blog/2026-02-23.md | PRIMARY ; PRIMARY | deprecated 2026-04-19 ; 2026-02-23 |
| 11 | §12: "Shade Agent framework is flagged experimental with known critical vulnerabilities, testnet-only in docs (Mintlify quickstart)" | **STALE** | The Mintlify URL now returns HTTP 410 Gone. The current docs deprecate the framework outright ("Do not use it for new projects, and do not recommend it to builders"). The 2.0 post says "The previous version … has known critical vulnerabilities", and the README says "This technology has not yet undergone a formal audit." The code lists `v1.signer` "for mainnet", but I found no statement that the framework is supported on mainnet. | https://www.mintlify.com/near/docs/ai/shade-agents/quickstart ; https://docs.near.org/ai/shade-agents ; https://github.com/NearDeFi/shade-agent-framework | — (410) ; PRIMARY ; PRIMARY | fetched 2026-11-11 ; undated ; undated |
| 12 | §2.1: "NEAR AI Cloud has served signed, attested inference since Dec 2025" | **CONFIRMED** | The launch post (2025-12-03) says each inference generates a cryptographic attestation. `/v1/attestation/report?model=…` returns signed Intel TDX and NVIDIA TEE proofs. | https://near.ai/blog/introducing-near-ai-cloud-private-chat | PRIMARY | 2025-12-03 |
| 13 | §2.1 / §3.3: "since Aug 2026 Intel Trust Authority co-verifies it" | **CONFIRMED** | Published 2026-08-12. Intel Trust Authority checks the TDX quote's signatures, appraises the TCB against Intel's reference values, and returns "an attestation token: a signed JWT carrying its verdict". The post does not say GPU evidence is covered. | https://near.ai/blog/near-ai-cloud-integrates-intel-trust-authority | PRIMARY | 2026-08-12 |
| 14 | §2.1: "Brave Leo runs on it" | **CONFIRMED** | The Intel Trust Authority post says Brave Leo runs private inference on NEAR AI Cloud. It also names Venice AI, Abound, the Government of Bermuda, OpenMind and Corbits. | same | PRIMARY | 2026-08-12 |
| 15 | §4.2 L2: "per-response signed receipts" | **CONFIRMED** (with a caveat) | The signed text is `<MODEL_ID>:<request_hash>:<response_hash>` (SHA-256 of the exact body bytes), signed with `ecdsa` (EIP-191 address) or `ed25519`. However, "Instances of the same model share one signing key, so a matching `provider_tee` signer does not establish that the verified report and the completion came from the same serving instance." | https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md | PRIMARY | undated |
| 16 | market.md F2: "64 models, 12 private TEE models; customers include Brave, Venice, Govt of Bermuda" | **CORRECTED** | The models page shows "Showing 63 of 63 models": 13 Private TEE (NEAR-hosted), 4 Private 3P TEE and 46 Incognito ("No hardware privacy guarantee"). The near.ai homepage says "63 available, 11 private in TEEs", which conflicts with the 13. The customers are confirmed (row 14). | https://near.ai/models ; https://near.ai/?p=11080 (homepage) | PRIMARY | accessed 2026-11-11 |
| 17 | §3.3: "IronClaw and the Confidential GPU Marketplace (2026-02-23)" | **CONFIRMED** | The post is dated 2026-02-23 (NEARCON). It says IronClaw "ensures secrets never reach the model" and that the marketplace locks out "The host OS, the GPU operator, and even NEAR AI". | https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace-and-multimodal-confidential-inference | PRIMARY | 2026-02-23 |
| 18 | judges-theses: GPU Marketplace "each job gets hardware-signed attestation in under 30 seconds" | **CONFIRMED** (vendor claim, slightly reworded) | The wording is "Every request returns hardware-signed attestation in under 30 seconds." Nobody has verified this independently. | same | PRIMARY | 2026-02-23 |
| 19 | §4.2 L2: "Confidential GPU Marketplace for heavy jobs (fine-tune lift tests, weight evals)" | **UNVERIFIED** | No GPU models, prices or job API are published. docs.near.ai's `llms.txt` has no GPU-marketplace page. The only per-hour GPU TEE prices I found are Phala's (H200 from $3.50/GPU/hr), not NEAR AI's. | same ; https://docs.near.ai/llms.txt ; Phala price: https://phala.network/pricing | PRIMARY ; PRIMARY ; UNVERIFIED (search snippet; not fetched) | 2026-02-23 ; accessed 2026-11-11 ; undated |
| 20 | §2.4 / §4.2 L5: "Confidential Intents (launched 2026-02-25 on a private shard) hides *who bought what*" | **CORRECTED** | The press release calls it a "restricted-visibility environment for cross-chain transactions" but names no mechanism; the "live private shard" belongs to Nightshade 3.0, a separate item in the same release. The docs say Confidential Intents run on FAR, "a permissioned instance of the NEAR protocol operated by a small validator set with no public networking". "Balances and swap details on FAR are not visible to the public", so the data is hidden from the public but not from FAR's operators, and access is partner-gated (Partner JWT). | https://tools.prnewswire.com/en-us/live/20813/release/20260225EN95768 ; https://docs.near-intents.org/integration/market-makers/confidential-intents.md | PRIMARY ; PRIMARY | 2026-02-25 ; undated |
| 21 | judges-theses: "most of the NEAR Intents infrastructure now runs on a confidential shard, and users can selectively disclose individual transactions" | **CONFIRMED as Polosukhin's claim; selective disclosure UNVERIFIED** | The Block reports Polosukhin saying "most of the NEAR Intents infrastructure has moved to a confidential shard", and that "users can reveal individual transactions when needed". The same article lists selective disclosure among areas NEAR "has been working on", and none of the Intents docs pages I read describe it, so whether it has shipped is unclear. | https://www.theblock.co/news/ecosystems/2026-10-07-nears-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912 | SECONDARY | 2026-10-07 (upd. 10-19) |
| 22 | judges-theses: "confidential TVL above $160M and more than $33B in all-time Intents volume" | **CONFIRMED** (as a NEAR Foundation figure) | "According to the foundation, NEAR Intents has processed more than $33 billion in all-time volume, with confidential TVL now above $160 million." Not independently verified. | https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656 | SECONDARY | 2026-10-15 |
| 23 | §3.3: Intents "~$34.9B cumulative volume by 2026-10-23" | **STALE** | DefiLlama API `totalAllTime` volume is **$37,324,522,122**, with the latest data point on 2026-11-10. Trailing-1y volume is $32.91B and 30-day volume is $3.76B. | https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume (page: https://defillama.com/protocol/near-intents, 403) | SECONDARY (aggregator) | data to 2026-11-10 |
| 24 | market.md F1: "fees about $53.4M annualized" | **CONFIRMED** | Trailing-1y fees are **$53,523,861**, all-time fees $59,752,140 and 30-day fees $5,458,382. Methodology: "Gross fees charged on NEAR Intents swaps". | https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees | SECONDARY (aggregator) | data to 2026-11-10 |
| 25 | §2.4 / §4.2 L5: Intents routes value across "35+ chains" | **OVERSTATED** (sources conflict) | The Intents docs list **32** chains (15 EVM, 6 BTC-family, 11 L1). The press release says near.com "connects more than 35 blockchains", and NEAR's X article says Intents "already supports more than 35 networks". | https://docs.near-intents.org/resources/chain-support.md ; PR (row 20) ; youmind repost | PRIMARY ; PRIMARY ; SECONDARY | undated ; 2026-02-25 ; 2026-10-22 |
| 26 | §4.2 L5: "1Click … dry-quote" | **CONFIRMED** | "If `true`, the response will **NOT** contain" `depositAddress`, `timeWhenInactive` or `deadline`. Auth is `X-API-Key` (JWT is legacy), and `insured` adds "0.02% (2 basis points)". | https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote.md | PRIMARY | undated |
| 27 | §4.2 L0 / §4.4.5: `appraise()` "waits for the room in one logical flow"; key release and Intents settlement "run in one yield/resume flow" | **OVERSTATED** (design constraint) | "The contract can wait for 200 blocks before timing out." At about 600 ms per block that is roughly 2 minutes (derived), far too short for GPU lift tests. On timeout the callback receives `Err(PromiseError::Failed)`. | https://docs.near.org/smart-contracts/anatomy/yield-resume | PRIMARY | undated (near-sdk 5.29.1) |
| 28 | judges-theses: Agent Market "launched around 2026-02-05" | **CORRECTED** (date) | The post is dated **2026-02-04**. Requesters set a budget, "funds go to escrow", the agent "submits the deliverable with a verification hash", disputes go to an "agentic dispute system", and payment is in NEAR. It lives at market.near.ai and gives no usage figures. | https://near.ai/blog/introducing-near-ai-agent-market | PRIMARY | 2026-02-04 |
| 29 | judges-theses: Marginal "adds escrow and audit for information goods, which Agent Market does not cover today" | **OVERSTATED** | Agent Market already has escrow and a dispute agent for task work. What it lacks is appraisal of sealed information goods. | same | PRIMARY | 2026-02-04 |
| 30 | §16: "OutLayer vaults (CKD usage)" | **CONFIRMED** | OutLayer describes itself as "Verifiable compute and custody for AI agents". Its keystore TEE ("Intel TDX enclave, attested by DAO") calls `request_app_private_key` via a vault contract and re-requests the master key from MPC on every restart. The URL has moved (301) to app.outlayer.ai. | https://app.outlayer.ai/docs/vaults | PRIMARY (OutLayer docs) | undated |
| 31 | competitors.md: "The DCML paper (arXiv 2410.13752) envisions data and model owners collaborating without exposure…" | **CORRECTED** | arXiv 2410.13752 is "Privacy-Preserving Decentralized AI with Confidential Computing" by Dayeol Lee, Jorge António and Hisham Khan, about **Atoma Network**. It does not mention NEAR. NEAR's DCML is a NEAR AI blog post and preprint, "Decentralized Confidential Machine Learning: A Business Model for User-Owned AI"; the post returned 404 when fetched. | https://arxiv.org/abs/2410.13752 ; https://near.ai/blog/decentralized-confidential-machine-learning-a-business-model-for-user-owned-ai | PRIMARY ; UNVERIFIED (404; seen in search only) | 2024-10-17 ; unknown |
| 32 | judges-theses: NEAR AI Cloud roadmap includes "private portable memory" | **CONFIRMED** (roadmap only) | The post says it will expand beyond inference to broader user-data use cases, "including exploring private portable memory". I found no launch. | https://near.ai/blog/introducing-near-ai-cloud-private-chat | PRIMARY | 2025-12-03 |
| 33 | §2.4: "Settlement and privacy of the trade itself are solved on one chain" | **OVERSTATED** | Confidential settlement runs on FAR, a separate permissioned chain bridged by a "Private PoA Bridge" (row 20). Cross-chain legs go through Omni, POA or HOT bridges, each with "its own trust model". Intents also halted after a ~$3.8M exploit on 2026-10-01 (§2, F9). | https://docs.near-intents.org/integration/bridging/overview.md ; https://www.theblock.co/news/ecosystems/2026-10-01-near-intents-halts-services-after-3-8-million-exploit-417404 | PRIMARY ; SECONDARY | undated ; 2026-10-01 |
| 34 | §4.5: "Codehash governance … sellers can pin a *set* of acceptable codehashes per listing" | **OVERSTATED** (mechanism differs) | In the Shade 2.0 reference contract the owner approves *measurements* (MRTD, RTMR0–2, compose-hash and key-provider digests) and *PPIDs*, not a codehash. "The owner should usually be a multisig." Long approved lists can push registration "past the gas limit". | https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/reference/agent-contract.md ; …/docs/concepts/security.md | PRIMARY | undated |

---

## 2. New findings that matter for design and risk

### A. Design constraints

**A1. The yield/resume window is about 2 minutes, so appraisal cannot sit inside one yield.**
- **What the docs say.** A yielded promise times out after 200 blocks, and the callback then gets `Err(PromiseError::Failed)` via `#[callback_result]`.
- **Gas.** Callback gas is fixed when the yield is created; the example uses `Gas::from_tgas(5)`.
- **Resume is public.** "Since the function used to signal the resume is public", it must check the caller. Do not panic in the callback, because the promise "can no longer be resumed" and earlier state changes are already committed. `YieldId::resume` "returns an error if the yielded promise is no longer available."
- **Block time.** NEAR has claimed 600 ms blocks and 1.2 s finality since May 2025 (NEAR blog via search: https://pages.near.org/?p=21734, UNVERIFIED since I did not fetch it). NEAR's own Dec-2025 benchmark reportedly measured 2.35 s ± 0.31 optimistic and 3.50 s ± 0.24 hard finality (search snippet only; the page returned 404; UNVERIFIED).
- **Wall-clock window (derived).** 200 × 0.6 s ≈ 120 s.
- **SPICE.** The 200 ms-block upgrade was previewed on 2026-06-22, and I found no confirmation that it is live (SECONDARY: https://www.hokanews.com/2026/06/near-unveils-spice-targets-visa-level.html ; https://nansen.ai/post/nansen-near-quarterly-report-q2-2026). If it ships and the block-count constant stays at 200, the window shrinks to about 40 s (derived).
- **Design implication.**
  - Make appraisal two-phase: escrow plus a job record with a block-height deadline in contract state, then a separate `submit_verdict` transaction signed by the room.
  - Use yield only for steps that finish within seconds, such as a CKD request or the final payout.
  - The MPC `sign` call itself "will yield execution waiting while the MPC signing service signs", so it inherits the same 200-block limit.
- Source: https://docs.near.org/smart-contracts/anatomy/yield-resume (PRIMARY, undated) · https://docs.near.org/chain-abstraction/chain-signatures (PRIMARY, undated).

**A2. A NEAR contract can own Intents balances and settle them with a callback, but only the NEAR leg is atomic.** These points come from the `near/intents` source code (PRIMARY, main branch, accessed 2026-11-11, https://github.com/near/intents).
- **`ft_withdraw` on `intents.near`.** It is `#[payable]`, calls `assert_one_yocto()`, and takes the owner from `self.ensure_auth_predecessor_id()`, which is `env::predecessor_account_id()` unless that account has disabled auth-by-predecessor. It returns `PromiseOrValue<U128>`.
  - So a Marginal contract can hold `intents.near` balances and call `ft_withdraw` or `mt_transfer` with 1 yocto.
  - It can read the result in its own `.then()` callback.
  - Source: `contracts/defuse/src/contract/tokens/nep141/withdraw.rs`, `contracts/defuse/src/contract/accounts/mod.rs`. NEP-245 `core.rs` uses the same predecessor auth.
- **Pausable.** Withdraw methods carry `#[pause]`, so the verifier can be paused (it was halted after the 2026-10-01 exploit). Marginal needs refund and timeout paths for when it is.
- **Deposits.** You deposit with `ft_transfer_call` to `intents.near`. An empty `msg` "assign[s] ownership to the transaction sender", and a `DepositMessage` can also carry `execute_intents` (`refund_if_fails` defaults to false). Source: https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits.md (PRIMARY).
- **Refund trap.** "refunds can only be processed when `ft_transfer` is used". Any `msg` string, even `""`, switches to `ft_transfer_call` and loses the refund. Source: https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals.md (PRIMARY).
- **`auth_call` intent.** It will "Call `contract_id::on_auth(signer_id, msg)` with `signer_id` of intent". Any deposit attached from wNEAR "will not be refunded in case of fail". This lets a buyer's signed intent notify the Marginal contract inside an intents batch (`contracts/defuse/core/src/intents/auth.rs`).
- **`escrow-swap` reference contract.** It is deterministic and immutable, "locks the maker's `src_token`" (e.g. `nep245:intents.near:nep141:usdt…`), has a deadline and a permissionless close, and deletes itself. This is the closest NEAR-native template for Marginal's escrow (`contracts/escrow-swap/README.md`).
- **Ordering.** "there is no guarantee that cross-contract calls originating from the Verifier will finish in order." Source: https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution.md (PRIMARY).
- **No testnet.** "There is no testnet deployment" of the verifier, so LETHE on testnet cannot integrate it. Testing means mainnet with small amounts. Source: https://docs.near-intents.org/integration/verifier-contract/introduction.md (PRIMARY).
- **Cross-chain finality.** Withdrawals to other chains go through Omni, POA or HOT bridges, each with "its own trust model" (POA is "Proof of Authority"). The docs do not say destination-chain delivery is confirmed back on NEAR; 1Click reports only `timeEstimate` and an off-chain status. So DvP is atomic only up to the NEAR-side withdraw or burn; the BTC/SOL/ETH leg is asynchronous and trusts the bridge (derived). Source: https://docs.near-intents.org/integration/bridging/overview.md (PRIMARY).

**A3. What CKD actually guarantees.**
- **Binding.** The key is `msk·H(pk, app_id)`, where `app_id` is the account of the contract that called the MPC contract. The MPC network never sees the plaintext key, and the protocol tolerates up to t−1 malicious nodes.
- **Who holds the policy.** Attestation checking and codehash or measurement policy live entirely in Marginal's developer contract. Whoever can upgrade that contract can redirect keys (derived from the flow).
- **Scope of a key.** It is the same for every approved instance of that app ("not specific to the TEE"). Per-listing or per-auction isolation needs distinct derivation strings, which the "full system" supports.
- **Verifiability.** Verification is private only, and public verifiability is "planned".
- Source: https://blog.nearone.org/research/2026/02/23/mpc-ckd.html (PRIMARY, 2026-02-23).
- **OutLayer as a working pattern.**
  - The vault contract's only access key is a TEE function-call key "scoped to a single proxy method".
  - Its DAO "enforces hardware-attestation verification before MPC releases the bytes".
  - Costs: 1 NEAR to deploy, and each derive prepays about 0.3 NEAR of gas for a net burn of about 0.001 NEAR. The cached master is cleared on every keystore restart.
  - Source: https://app.outlayer.ai/docs/vaults (PRIMARY, undated).
- **Contract method (third-party only).** `request_app_private_key` takes `derivation_path`, `domain_id` (a BLS12-381 domain) and `app_public_key`, with a 300 TGas minimum and a 1 yocto deposit. This comes only from a DeepWiki page on a fork (https://deepwiki.com/Quantus-Network/near-mpc/5-api-reference), so it is UNVERIFIED; check against `near/mpc` before the spec relies on it.

**A4. What Shade-style agent contracts verify on-chain, and what they do not.**
- **Flow.** `register_agent` calls `verify_attestation(expected report data, now, approved measurements, approved PPIDs)`.
- **On-chain checks** (shade-attestation crate, "A fork of NEAR One's attestation crate" from `near/mpc`):
  - The quote is verified with dcap-qvl at the given timestamp.
  - TCB status must be "UpToDate", with no outstanding advisories.
  - MRTD and RTMR0–2 must match.
  - The RTMR3 event log is replayed, and its compose-hash and key-provider digests must match.
  - `report_data` must equal the agent's implicit account id.
  - The PPID must be on the allowlist.
  - Registration expires after `attestation_expiration_time_ms`.
- **Not checked on-chain:**
  - NVIDIA GPU evidence (never mentioned).
  - The contents of the compose file (hash only).
  - Collateral, which the caller supplies.
- **Local-mode risk.** In "local mode" "No real attestation is verified", so a mainnet contract must hard-code `requires_tee = true`.
- **Build constraint.** Agent contracts "cannot be built on Mac machines".
- Sources: https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/reference/agent-contract.md ; https://github.com/NearDeFi/shade-agent-framework/tree/main/shade-attestation (PRIMARY, undated).
- **Why it matters.** The framework is deprecated (row 10), so Marginal must fork and own this code and its audit. The mechanism itself (dcap-qvl verified inside a NEAR contract) still works and is what the MPC nodes use.

**A5. Two security notes from the Shade docs bear directly on forget certificates and the dstack-KMS fallback in §12.**
- "disk state carries over across image upgrades, so a new image can read data earlier versions wrote without any new measurement approval" (paraphrased by the fetch tool). A room that writes anything to disk under a stable app ID breaks the "never persisted" claim.
- The Phala host can approve any app compose for an app ID and fetch that app's encryption key (also a fetch-tool paraphrase). A dstack-KMS fallback on Phala Cloud therefore trusts Phala.
- Also: approved PPIDs are made public.
- Source: https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/concepts/security.md (PRIMARY, undated).

**A6. Verifying NEAR AI Cloud receipts end to end.**
- **Quote layout.** TDX quote `report_data` bytes 0–31 hold the signing identity: the ECDSA address or Ed25519 key, zero-padded, or a hash combined with the TLS SPKI. Bytes 32–63 hold the client's 32-byte nonce.
- **GPU evidence.** It is bound to the same nonce, sent unchanged to NVIDIA NRAS, and the verifier requires `x-nvidia-overall-att-result == true`.
- **Retries.** A `404` on `/v1/signature/<id>` may be retried for a short, bounded time, after which there is "not a successfully verified response".
- **Implication for Marginal.** Receipts can be checked on-chain cheaply (ecrecover or ed25519 over `<MODEL_ID>:<req_hash>:<resp_hash>`). The binding to hardware is an off-chain check of the TDX quote, the NRAS JWT and optionally the Intel Trust Authority JWT, unless the contract also runs dcap-qvl (A4).
- **Restrict models.** Allow only the "Private TEE" tier. The Incognito tier (46 of 63 models, including OpenAI, Anthropic and Gemini) has "No hardware privacy guarantee", and third-party TEE models (e.g. Chutes) are verified per model only in the JS SDK.
- Sources: https://docs.near.ai/cloud/verification/reference/quote-nonce-signer.md ; https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md ; https://docs.near.ai/cloud/models.md ; https://near.ai/models (PRIMARY, undated / accessed 2026-11-11).

**A7. Function-call keys and storage costs.**
- **Function-call keys** can call only one `receiver_id` and optionally a method list, and they "do **not allow** to **attach NEAR tokens**". `allowance` covers gas only, is unlimited if omitted, and cannot be changed later.
  - So an agent's function-call key cannot call `intents.near::ft_withdraw` directly, because that needs 1 yocto (derived). It must call the Marginal contract, which attaches the yocto itself.
  - Source: https://docs.near.org/protocol/access-keys (PRIMARY, undated).
- **Storage staking** costs "1E19 yoctoNEAR per byte, or 100kb per NEAR". Each key-value record adds a fixed 40-byte overhead, and removing data unstakes the deposit.
  - **Costing (derived).** A forget-certificate record with a 32-byte job key and a 32-byte hash is about 104 bytes, or about 0.00104 NEAR locked and refundable on deletion, plus serialization overhead.
  - **Comparison.** Shade's `register_agent` storage deposit is 0.00486 NEAR (agent-contract.md).
  - Source: https://docs.near.org/protocol/storage/storage-staking (PRIMARY, undated; "at the time of writing" caveat).

**A8. Confidential Intents and contract-enforced settlement pull against each other.**
- **How funds move.** Confidential balances are IMT tokens on FAR, backed 1:1 by a Treasury account on public NEAR and moved by a "request-driven" Private PoA Bridge.
- **Access.** Balances are read through the 1Click API with a User-Session token, and the private relay needs Partner JWT auth ("contact the Defuse team").
- **Gap.** None of the Intents docs pages I read say a public NEAR contract can hold or move FAR balances.
- **Design implication.** Either Marginal's public escrow contract settles in public and only the final payout is "shielded", or Marginal becomes a FAR partner and trusts FAR's validator set (derived).
- Source: https://docs.near-intents.org/integration/market-makers/confidential-intents.md (PRIMARY, undated) · https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote.md (PRIMARY).

### B. Risk-section items

**B1. NEAR AI security incident, 2026-11-08/09 (published 2026-11-09).**
- **What happened.** An SGLang remote-code-execution flaw gave an attacker code execution on one inference server and access to "requests in processing on that server, including confidential ones".
- **What was exposed.** Account details of about 100 users, data from 18 legacy agents (not in TEEs), and API keys of 2 Cloud customers. Private Chat, already deprecated, was taken offline.
- **NEAR AI's own conclusion.** "Confidential computing protects data from the operator and the host. It does not protect against a vulnerability in the software running inside the environment."
- **Why it matters.** This is a live counter-example to "a mind that can read but can't leak" (§2.1). The in-room software stack (inference engine, loaders) is the attack surface, so the spec should require minimal room images, per-deal rooms with no shared inference servers, and pinned, audited inference engines.
- Source: https://near.ai/blog/security-incident-report-sglang-vulnerability (PRIMARY, 2026-11-09) · https://www.theblock.co/news/defi/2026-11-10-near-ai-security-breach-437002 (SECONDARY, 2026-11-10).

**B2. NEAR Intents exploit, 2026-10-01.**
- About $3.8M was lost to "a bug in the Omni deposit and withdrawal infrastructure interaction with NEAR Intents smart contract". Services were halted, and the funds were reportedly returned in full within days.
- **Why it matters.** Settlement-layer and bridge risk is real, and the verifier can pause. Marginal needs refunds that do not depend on Intents being live.
- Source: https://www.theblock.co/news/ecosystems/2026-10-01-near-intents-halts-services-after-3-8-million-exploit-417404 (SECONDARY, 2026-10-01) · https://cointelegraph.com/news/near-intents-recovers-entire-stolen-38m-after-ultimatum-to-exploiter (SECONDARY; not fetched, seen in search).

**B3. Weaknesses in the MPC network.** These come from an independent cryptographer's review.
- There is "No proactive refresh"; re-sharing happens only when membership changes.
- There is no robustness or identifiable abort, so "1 participant can DoS".
- The Cait-Sith ECDSA library was not audited, and NEAR's multiplicative rerandomization has no proof the author could find.
- Some Trail of Bits items remain unaddressed.
- The CKD domain's re-sharing "kept failing" and was cancelled.
- **Why it matters.** Key-release *liveness* (not only collusion) is a risk to Marginal. A single node can stall CKD and sign requests, and these can time out inside the 200-block yield window (A1).
- Source: https://alinush.github.io/near (SECONDARY, 2026-05-01, updated to 2026-10-23).

**B4. The Shade Agent Framework is deprecated (since 2026-04-19).** There is no named successor, and "Teams that still run it are responsible for its maintenance, updates and fixes".
- **Why it matters.** The §4.2 L2 dependency must be restated as "Marginal's own attestation-verifying contract, forked from shade-attestation / `near/mpc` attestation". The §12 mitigation "co-develop with NEAR AI" is weaker now.
- Source: https://docs.near.org/ai/shade-agents (PRIMARY).

**B5. MPC operators and signature schemes, for spec accuracy.**
- **Operators.** They include SVRN, Bitwise, Nansen, Greenfield, Everstake, Near One and Luganodes (NEAR X article via youmind, SECONDARY repost, 2026-10-22).
- **Signing domains.** docs.near.org: "only the two signing domains are currently supported: `0` for `Secp256k1` or `1` for `Ed25519`". The `near/mpc` README adds BLS12-381 CKD and "foreign chain transaction verification" (Read RPC). The independent review lists FROST as added by October 2026.
- **Latency and fees.** None are published in any source I checked, so they are UNVERIFIED.
- Sources: https://docs.near.org/chain-abstraction/chain-signatures ; https://github.com/near/mpc (PRIMARY).

**B6. On-chain attestation verification.** TDX/dstack quotes can be verified inside NEAR contracts with dcap-qvl (A4), and MPC nodes "attest what they run on chain" (`near/mpc` README).
- **Why it matters.** I found no NEAR primitive or announcement for on-chain verification of NVIDIA GPU attestation, so the spec should keep GPU evidence checks off-chain (NRAS / Intel Trust Authority JWTs) or route them through a TDX-attested relayer.
- Sources: as A4 and A6.

**B7. Post-quantum.** The NEAR access-keys docs mention post-quantum keys stored as hashes (https://docs.near.org/protocol/access-keys, PRIMARY), and press reports ML-DSA-65 signing on mainnet in July 2026 (https://www.finanznachrichten.de/nachrichten-2026-07/69072435-near-protocol-brings-quantum-safe-signing-to-mainnet-008.htm, UNVERIFIED, search snippet only).
- **Why it matters.** Accounts can be post-quantum while CKD recovery keys are not (row 6). The spec's crypto-agility note should separate the two.

**B8. NEAR AI products named in MOONSHOT that changed status.**
- Private Chat is "previously deprecated" and now offline (B1).
- Agent Market (2026-02-04) already offers escrow plus an "agentic dispute system" (row 28), which partly overlaps the "AI as escrow" pitch.
- I found no NEAR data, model or knowledge marketplace announcement in 2026. NEAR describes the GPU marketplace as "built on NEAR DCML" (@NEARProtocol X post, seen in search only, UNVERIFIED: https://x.com/NEARProtocol/status/2026064161890087020).
- **Why it matters.** The data-and-model-exchange layer still looks open, but NEAR AI is circling it through DCML.

---

## 3. Queries and fetches run (in order)

About 80 web searches and fetches plus 6 read-only GitHub API calls. This is over the 30–50 budget because items 3 and 7 needed source-level checks.

1. FETCH https://blog.nearone.org/research/2026/02/23/mpc-ckd.html
2. FETCH https://docs.near.org/smart-contracts/anatomy/yield-resume
3. FETCH https://docs.near.org/ai/shade-agents/reference/agent-contract
4. FETCH https://www.mintlify.com/near/docs/ai/shade-agents/quickstart (HTTP 410 Gone)
5. FETCH https://docs.near.org/ai/shade-agents/reference/agent-contract (verbatim re-read)
6. FETCH https://docs.near.org/ai/shade-agents/getting-started/introduction
7. SEARCH "Shade Agent Framework" not maintained April 2026
8. SEARCH NEAR blockchain block time 600ms finality 1.2 seconds protocol upgrade 2025
9. FETCH https://docs.near.org/ai/shade-agents
10. FETCH https://docs.near.org/blog/2026-02-23-shade-agent-framework-2.0 (404)
11. FETCH https://github.com/NearDeFi/shade-agent-framework/tree/main/docs
12. FETCH https://docs.near.org/blog/2025-12-11-blockchain-finality-benchmark (404)
13. FETCH https://github.com/NearDeFi/shade-agent-framework/tree/main/docs/reference
14. FETCH https://github.com/NearDeFi/shade-agent-framework/tree/main/docs/blog
15. FETCH https://github.com/NearDeFi/shade-agent-framework
16. FETCH https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/reference/agent-contract.md
17. FETCH https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/blog/2026-02-23.md
18. FETCH https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/NOTICE.txt
19. FETCH https://github.com/NearDeFi/shade-agent-framework/tree/main/shade-attestation
20. FETCH https://github.com/NearDeFi/shade-agent-framework/tree/main/docs/concepts
21. FETCH https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/concepts/security.md
22. FETCH https://outlayer.fastnear.com/docs/vaults (301 to app.outlayer.ai)
23. FETCH https://app.outlayer.ai/docs/vaults
24. SEARCH NEAR MPC confidential key derivation CKD mainnet launch v1.signer request_app_private_key
25. SEARCH NEAR chain signatures MPC network nodes threshold TEE 2026
26. FETCH https://mpc-operators.nearone.org/overview.html (404)
27. FETCH https://alinush.github.io/near
28. SEARCH Near One chain signatures MPC network "11 of 17" TEE operators announcement
29. FETCH https://youmind.com/landing/x-viral-articles/near-chain-signatures-tee-verification
30. FETCH https://docs.near.org/chain-abstraction/chain-signatures
31. FETCH https://mpc.nearone.org (rendered by JavaScript; no data)
32. FETCH https://github.com/near/mpc
33. SEARCH near mpc "request_app_private_key" CKD contract method BLS12-381 domain mainnet
34. FETCH https://near.ai/blog/near-ai-cloud-integrates-intel-trust-authority
35. FETCH https://near.ai/blog/introducing-near-ai-cloud-private-chat
36. FETCH https://docs.near.ai
37. FETCH https://docs.near.ai/cloud/verification
38. FETCH https://docs.near.ai/cloud/models.md
39. FETCH https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace-and-multimodal-confidential-inference
40. SEARCH (extended) NEAR AI security incident report SGLang vulnerability November 2026
41. FETCH https://docs.near.ai/llms.txt
42. FETCH https://near.ai/blog/security-incident-report-sglang-vulnerability
43. FETCH https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md
44. FETCH https://docs.near.ai/cloud/verification/reference/quote-nonce-signer.md
45. FETCH https://tools.prnewswire.com/en-us/live/20813/release/20260225EN95768
46. FETCH https://www.theblock.co/news/ecosystems/2026-10-07-nears-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912
47. FETCH https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656
48. FETCH https://defillama.com/protocol/near-intents (403)
49. FETCH https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees
50. FETCH https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume
51. SEARCH NEAR Intents exploit $3.8 million halted October 2026
52. SEARCH docs.near-intents.org verifier contract intents.near deposits withdrawals ft_withdraw mt_transfer smart contract account
53. FETCH https://docs.near-intents.org/llms.txt
54. FETCH https://docs.near-intents.org/integration/market-makers/confidential-intents.md
55. FETCH https://docs.near-intents.org/integration/verifier-contract/account-abstraction.md
56. FETCH https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals.md
57. FETCH https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution.md
58. FETCH https://docs.near-intents.org/resources/chain-support.md
59. FETCH https://docs.near-intents.org/integration/bridging/overview.md
60. FETCH https://github.com/near/intents
61. FETCH https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote.md
62. SEARCH near intents verifier "auth_call" OR "mt_transfer_call" smart contract account balance intents.near defuse contract integration
63. FETCH https://docs.near.org/tutorials/intents/withdraw (404)
64. FETCH https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/balances.md
65. FETCH https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits.md
66. FETCH https://github.com/near/intents/tree/main/defuse/src (404, wrong path)
67. GH API (read-only) `repos/near/intents/contents` (top level)
68. GH API `repos/near/intents/git/trees/main?recursive=1` (searched for withdraw, auth and token files)
69. GH API contents: `contracts/defuse/core/src/intents/auth.rs`, `contracts/defuse/src/contract/tokens/nep141/withdraw.rs`
70. GH API contents: `withdraw.rs` (lines 20–60)
71. GH API: `contracts/escrow-swap` listing; code search for `ensure_auth_predecessor_id`
72. GH API contents: `contracts/escrow-swap/README.md`, `contracts/defuse/src/contract/accounts/mod.rs`, `contracts/defuse/README.md`
73. FETCH https://docs.near.org/protocol/access-keys
74. FETCH https://docs.near.org/protocol/storage/storage-staking
75. FETCH https://near.ai/blog/introducing-near-ai-agent-market
76. SEARCH NEAR SPICE 200ms block time mainnet launch 2026 nearcore release
77. FETCH https://docs.near.org/blog/2025-12-11-blockchain-finality-benchmark.md (404)
78. FETCH https://arxiv.org/abs/2410.13752
79. SEARCH (extended) NEAR AI 2026 announcement data marketplace OR "model marketplace" OR "private memory" OR "portable memory" confidential
80. SEARCH NEAR AI "DCML" "Decentralized Confidential Machine Learning" whitepaper OR paper OR blog
81. SEARCH NEAR AI Confidential GPU Marketplace H200 B200 price per hour attestation status 2026
82. FETCH https://near.ai/models
83. FETCH https://near.ai/blog/decentralized-confidential-machine-learning-a-business-model-for-user-owned-ai (404)
84. FETCH https://near.ai/?p=11080 (resolved to the NEAR AI Cloud homepage, not the GPU marketplace)
85. FETCH https://docs.near-intents.org/integration/verifier-contract/introduction.md

**Open items for whoever picks this up next.**
- Read the live `v1.signer` `state` view to settle the 11-of-17 vs 11-of-16 conflict, and to list the CKD domain ID.
- Confirm `request_app_private_key` arguments, gas and deposit in the `near/mpc` contract source.
- Find a NEAR AI GPU-marketplace page or price list.
- Confirm whether SPICE has shipped, and whether the 200-block yield constant changes with it.
