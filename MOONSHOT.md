# MOONSHOT: **Marginal**, the clearinghouse for information that can't be copied

*Working name. The v0 is the hackathon build **LETHE**. The company needs a new name because "Lethe protocol" is already used by a Flashbots-adjacent erasure-audit project (§9).*

*Prepared 2026-11-11 for Jayanth Kumar Morem ("Jay"). Research and writing only. Nothing was built, deployed, posted, or paid for.*
*Status: v1 complete (2026-11-11). Research volume: about 200 web searches and page fetches across five streams (judges and theses 53, papers 43 plus arXiv API verification of 49 IDs, market 49, competitors 54, plus my own NEAR-primitive and prior-art checks). Raw notes are in* `./moonshot-notes/`*.*

---

## 1. One-line hook

**"Pay only for what your model, or your notes, don't already have. Neither side ever sees the other's secrets, and the AI that read them forgets."**

Longer version: **Marginal turns information (data, research, model weights, eval sets, exploits) into a good that can be inspected, priced and sold without ever being copied, with AI as escrow and auditor and NEAR as the clearinghouse.**

Short form for a slide: **"An exchange for things that can't be shown."**

---

## 2. The impossible-sounding thesis

**Why people think it can't exist.** In 1962 Kenneth Arrow pointed out that information is a broken commodity. To know what it is worth, the buyer has to see it, and once they have seen it they no longer need to buy it. Every institution that trades information today exists to work around that paradox, and each workaround leaks value:

- **Expert networks** (GLG, AlphaSights) sell an hour of a person's time. The buyer pays before knowing whether the call will tell them anything new.
- **Data marketplaces** (Snowflake Marketplace, AWS Data Exchange, Datarade) sell samples and schemas. The buyer pays for the whole dataset to learn whether it improves *their* model.
- **AI training-data licensing** is closed bilateral deals (Reddit–Google, News Corp–OpenAI) priced on lawyers' guesses, or it is lawsuits. Bartz v. Anthropic settled for $1.5B, roughly $3,000 per work ([Bloomberg Law, 2026-07-20 final approval](https://news.bloomberglaw.com/ip-law/anthropic-authors-1-5-billion-deal-receives-final-approval)). That is the price of "scrape first, license never".
- **Model weights** can't be sold except to someone who then holds them forever. Labs therefore hide weights behind APIs, and buyers can't test whether a fine-tune is really better on *their* private evals without handing those evals over.
- **Vulnerabilities** are sold through trust-me intermediaries (Immunefi, brokers), because a researcher who shows the exploit has given it away.

Each of these is a multi-billion-dollar market that is *structurally under-traded*. Valuable information sits idle because there is no way to show it without giving it away. Everybody "knows" this is permanent: information is non-rival and copyable, so it can't have a clean spot market.

**Why it now can.** Five things became true in 2025–2026, and together they break the paradox:

1. **Confidential GPUs made "a mind that can read but can't leak" practical.** H100/Blackwell confidential computing runs frontier-size models inside attested enclaves at single-digit-percent overhead ([Phala H100 benchmark, arXiv 2409.03992](https://arxiv.org/abs/2409.03992)). NEAR AI Cloud has served signed, attested inference since Dec 2025, and since Aug 2026 Intel Trust Authority co-verifies it ([NEAR AI blog](https://near.ai/blog/near-ai-cloud-integrates-intel-trust-authority)). Brave Leo runs on it. The **inspector** can now be a 100B+ parameter model that reads a buyer's entire private corpus, inside hardware nobody can open.
2. **Economists formalised the fix.** *NDAI Agreements* ([arXiv 2502.07924](https://arxiv.org/abs/2502.07924)) show that a TEE plus an AI agent acts as an "ironclad NDA" that resolves the hold-up problem. *Conditional Recall* ([arXiv 2510.21904](https://arxiv.org/abs/2510.21904)) proves that mechanisms where the buyer's agent *can be made to forget* strictly dominate perfect-recall mechanisms in information markets. *Recursive inspection* ([arXiv 2604.08606](https://arxiv.org/abs/2604.08606)) shows inspection is only fair when it is done **against what the buyer already knows**. That last property is the core of Marginal's pricing.
3. **Keys can now be released to code, not to people.** NEAR's MPC network (11-of-17 threshold, running in TEEs on mainnet) supports **Confidential Key Derivation (CKD)**: a key that only an attested TEE app, approved by a NEAR contract, can obtain, and that it can re-derive after a crash on different hardware ([NEAR One research, 2026-02-23](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)). A seller's good can therefore be sealed to *a policy* ("only the Marginal appraiser at codehash X, only for this auction") rather than to a server.
4. **Settlement and privacy of the trade itself are solved on one chain.** NEAR Intents routes value across 35+ chains, and **Confidential Intents** (launched 2026-02-25 on a private shard, [PR Newswire](https://tools.prnewswire.com/en-us/live/20813/release/20260225EN95768)) hides *who bought what*. That matters because in information markets the fact that Fund A bought a memo about Company X is itself alpha.
5. **Demand appeared with a legal deadline.** The EU AI Act's GPAI obligations (Art. 53(1)(c)–(d), in force 2025-08-02) require every general-purpose model provider to publish a training-data summary on a mandatory template and to keep a copyright policy that respects TDM opt-outs ([WilmerHale](https://wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/european-commission-releases-mandatory-template-for-public-disclosure-of-ai-training-data)). Models placed on the market before that date have until 2027-08-02. **Licensed data with a cryptographic provenance trail stops being a nice-to-have and becomes a compliance input.**

**The thesis in one sentence.** *Information becomes a tradable asset class when three conditions hold together: the good never leaves a vault, the buyer's appraisal is computed against the buyer's own sealed context, and the money rules are enforced by a contract rather than by the AI. All three can now be built, and NEAR is the only stack that ships each primitive natively.*

**What is genuinely hard (said up front).**

- TEEs are *not* cryptography. TEE.fail (Oct 2025) extracted TDX/SEV-SNP attestation keys with a sub-$1k DDR5 interposer and could impersonate NVIDIA CC GPUs ([The Hacker News](https://thehackernews.com/2025/10/new-teefail-side-channel-attack.html)). Marginal's design treats TEE trust as *provisional* and bounds value per enclave (see §4.4).
- "Forgetting" is attested, not proven. A forget certificate says "an approved program, on attested hardware, zeroised this state". It is not a mathematical deletion proof.
- Appraisal leaks information by design. Every number shown before payment leaks bits. Marginal makes the **leakage budget** an explicit, priced, contract-enforced parameter rather than pretending it is zero.

## 3. Why now: research breakthroughs

All arXiv IDs below were checked against the arXiv export API on 2026-11-11 (papers stream; full table in `moonshot-notes/papers.md`). Numbers marked † come from search snippets rather than the full text.

### 3.1 The six breakthroughs that make it buildable

| # | Breakthrough | Evidence | What it unlocks for Marginal |
|---|---|---|---|
| 1 | **Confidential GPUs at near-zero tax, including multi-GPU** | B200 + TDX inference overhead **~1–3% when tuned**, but 30–40% on stock stacks ([2608.26575](https://arxiv.org/abs/2608.26575), 2026-08-27). H100 CC costs 4–8% throughput, but has **no NVLink/HBM protection** ([2509.18886](https://arxiv.org/abs/2509.18886), ETH Zürich, 2025-09) | Appraisal by frontier-size models and multi-GPU lift tests on Blackwell. Perf tuning is a real line item |
| 2 | **Information economics: TEEs + agents solve hold-up** | NDAI Agreements ([2502.07924](https://arxiv.org/abs/2502.07924)); Conditional Recall ([2510.21904](https://arxiv.org/abs/2510.21904)); recursive inspection ([2604.08606](https://arxiv.org/abs/2604.08606)) | The "inspect, then forget" mechanism is now theory-backed, not hand-waving |
| 3 | **Buyer-relative data value is computable and priceable** | *Instrumental value*: value = marginal contribution beyond the buyer's existing data, and an SVD selling mechanism extracts near-full welfare ([2412.18140](https://arxiv.org/abs/2412.18140)). *TIP*: HE + influence functions score seller data against **the buyer's specific model**; data value is **heavy-tailed** ([2512.06033](https://arxiv.org/abs/2512.06033), 2025-12). *In-Run Data Shapley*: item values from one training run ([2406.11011](https://arxiv.org/abs/2406.11011), ICLR'25). *STRIDE*: LLM attribution 13× faster ([2606.05165](https://arxiv.org/abs/2606.05165), 2026-06) | Per-item, per-buyer pricing of datasets inside a room, without retraining loops |
| 4 | **Mechanism design for data prices got sharp** | Shapley/LOO are **not truthful** prices, and **Myerson payment is the minimal truthful, buyer-optimal rule** ([2504.05563](https://arxiv.org/abs/2504.05563), EPFL/CISPA). First-price auctions among LLM agents reach **1−1/e²** welfare when sellers are substitutable ([2610.20587](https://arxiv.org/abs/2610.20587), Google, 2026-10-14) | Valuation drives *allocation*; a fixed mechanism drives *payment*. The contract can encode both |
| 5 | **Confidential evaluation of models and evals is proven practical** | *Attestable Audits*: model + audit code + secret dataset in TDX/SEV-SNP/Nitro, result attested ([2506.23706](https://arxiv.org/abs/2506.23706), Cambridge, ICML'25 workshop). TRUCE private benchmarking ([2403.00393](https://arxiv.org/abs/2403.00393), MSR). TikTok's open-source **ManaTEE** signs eval results with model and script hashes ([TikTok for Developers](https://developers.tiktok.com/blog/ManaTEE-Enabling-Verifiable-AI-Transparency)) | Model weights and eval sets become tradeable: you learn the *score*, never the weights or the test items |
| 6 | **Cheap verifiability and key release around TEEs** | **TOPLOC** commits to activations with 258 bytes per 32 tokens and verifies up to 100× faster than generation ([2501.16007](https://arxiv.org/abs/2501.16007), ICML'25). **Jolt Atlas** makes ZK proofs practical for embeddings/classifiers/small LMs ([2602.17452](https://arxiv.org/abs/2602.17452)). **VFT / VeriLoRA**: ZK proofs that a LoRA was trained only on a committed dataset ([2510.16830](https://arxiv.org/abs/2510.16830), [2508.21393](https://arxiv.org/abs/2508.21393), NDSS'26). NEAR **CKD** releases keys only to attested apps ([NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)) | Defence in depth: TEE for speed, TOPLOC/ZK spot-checks for the deterministic parts, ZK licence-compliance proofs after the deal, keys bound to code |

### 3.2 Seven hard facts that constrain the design (and how Marginal responds)

1. **FHE and MPC are too slow to be the main path.** The best CKKS Llama-3-8B runs at **18 s per generated token on 8 GPUs** ([2601.18511](https://arxiv.org/abs/2601.18511), 2026-01). zkML costs about 10 min per 8B inference (zkFinGPT, [2601.15716](https://arxiv.org/abs/2601.15716)). → **The TEE is the execution substrate. ZK and MPC are used only for small, high-value sub-proofs.**
2. **Physical TEE attacks cost $50–$1,000.** Battering RAM (<$50, DDR4), WireTap, TEE.fail (<$1k, DDR5, forges NVIDIA attestation). Vendors call them out of scope. → **Per-key value caps, multi-operator k-of-n rooms, challenge windows, insurance.**
3. **Unlearning is not deletion.** 4-bit quantisation restores **83%** of "unlearned" knowledge ([2410.16454](https://arxiv.org/abs/2410.16454), ICLR'25), and minimal fine-tuning reverses unlearning ([2505.16831](https://arxiv.org/abs/2505.16831)). → **A forget certificate attests that the data never left volatile enclave memory and that the session key was destroyed. It never claims weight-level unlearning.** Black-box dataset inference ([2507.03619](https://arxiv.org/abs/2507.03619)) gives sellers a *post-hoc deterrent* if a no-deal buyer trains on their data anyway.
4. **Training on data leaks data.** Post-trained models regurgitate SFT/RL data, and embedding-matching finds ≥10× more memorisation than string matching ([2510.18554](https://arxiv.org/abs/2510.18554)). → **Train-in-vault defaults to weights-in-vault (the buyer runs the result inside a room) or to a DP option, and is priced accordingly.**
5. **LLM agents are bad negotiators.** Magentic Marketplace shows a **10–30× first-proposal bias** and welfare collapse at scale ([2510.25779](https://arxiv.org/abs/2510.25779), Microsoft). → **No free-text haggling. Agents submit structured bids into sealed, batched rounds.**
6. **Agent-payment protocols are not atomic.** Five practical attacks on x402 ([2605.11781](https://arxiv.org/abs/2605.11781)); AP2 has 48 threats, and a valid mandate signature doesn't prove intent ([2608.23858](https://arxiv.org/abs/2608.23858)); 40 new findings across x402/MPP/ACP/AP2 in Tamarin ([2609.00060](https://arxiv.org/abs/2609.00060)). → **Atomic delivery-versus-payment: key release and Intents settlement are bound to one appraisal hash, in one yield/resume flow.**
7. **Multi-tenant serving leaks.** Shared KV/prefix caches enable ~95–99%† prompt reconstruction ([2508.08438](https://arxiv.org/abs/2508.08438)), and split CPU-TEE/GPU obfuscation is broken in ~6 min ([2602.11088](https://arxiv.org/abs/2602.11088)). GPU-CC leaks metadata through bounce buffers ([2507.02770](https://arxiv.org/abs/2507.02770), IBM). → **Per-deal isolation, no shared caches, full GPU CC only, padded and batched job shapes.**

### 3.3 Why now, beyond the papers

- **Demand-side shocks:** the $1.5B Bartz v. Anthropic settlement (final approval 2026-07-20, [Bloomberg Law](https://news.bloomberglaw.com/ip-law/anthropic-authors-1-5-billion-deal-receives-final-approval)). The mandatory EU GPAI training-data summary (in force 2025-08-02, [WilmerHale](https://wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/european-commission-releases-mandatory-template-for-public-disclosure-of-ai-training-data)). Open web data is closing (robots.txt and ToS restrictions rose sharply in 2023–24, per the Data Provenance Initiative's *Consent in Crisis*).
- **Labs already pay for expert knowledge at scale.** Mercor reached a **>$2B annualised gross run-rate by June 2026** ([Dealroom citing The Information](https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/)). Surge reportedly offers labs a "pay only if the metric improves" programme (secondary: [Sacra](https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/)). **Buyers already want pay-for-lift. They just have to trust the vendor's own measurement.**
- **NEAR shipped the primitives in 2026.** NEAR AI Cloud (Dec 2025) plus Intel Trust Authority (Aug 2026). IronClaw and the Confidential GPU Marketplace (2026-02-23). Confidential Intents (2026-02-25). Chain Signatures MPC running inside TEEs at 11-of-17. Intents passed **~$34.9B cumulative volume** by 2026-10-23 ([DefiLlama](https://defillama.com/protocol/near-intents)).

---

## 4. Product architecture

### 4.1 The product in one paragraph

Marginal is a **clearinghouse for information goods**. Sellers seal a good (a research memo, an expert answer, a dataset, a fine-tuned model, a private eval set, an exploit, a forecast) into a **Vault**. The decryption key is derived by NEAR's MPC network and can only be obtained by an attested **Appraisal Room** program whose codehash a NEAR contract has approved. Buyers seal *their own* context into the same room: their notes, their data, their model, their eval set. Inside the room, AI appraisers measure the good's **marginal value to that specific buyer**: novelty against the buyer's notes, lift on the buyer's evals, overlap with the buyer's data, and win-rate against the buyer's current model. The NEAR **Clearing contract** then runs the auction or bilateral price rule, enforces budgets and the **leakage budget**, and settles in any asset on any chain through Intents. On a deal the buyer gets either a copy or, more often, **use-rights**: the good stays in the vault and the buyer queries it, trains on it, or runs it. On no deal, every party's sealed context is destroyed and a **forget certificate** is anchored on-chain. Every step leaves a hash-sealed audit trail and a provenance dossier the buyer can hand to a regulator.

### 4.2 Layers and NEAR primitives

| Layer | What it does | NEAR primitive(s) | Off-NEAR dependency | Built today by Jay (v0 seed) |
|---|---|---|---|---|
| **L0 Clearing** | Listings, escrow, auctions (sealed-bid, Vickrey, Nash split), price rules, budget caps, leakage-budget ledger, challenge windows, seller bonds, fee split | NEAR contract (Rust, near-sdk); **yield/resume** so a buyer's `appraise()` waits for the room in one logical flow; **function-call access keys** scoped to agents; sub-accounts per desk | — | Marginal contract (yield/resume, Nash split, refunds, timeouts) |
| **L1 Vault & key release** | Goods encrypted at rest (any blob store). Keys released *to code, not people*: only an approved Appraisal Room codehash, for an authorised job, can derive the key | **MPC Confidential Key Derivation (CKD)**: threshold BLS + ElGamal, key encrypted to the TEE app's ephemeral key, re-derivable after crash ([NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)); MPC is 11-of-17 and runs in TEEs | Arweave/Filecoin/S3 for ciphertext | Marginal sealed boxes (X25519) + on-chain hash; to be upgraded to CKD |
| **L2 Appraisal Rooms** | Fixed-program TEEs that load good + buyer context, run the asset-class appraiser, emit a signed, quantised verdict | **Shade Agents** (codehash approved in the agent contract, dstack/TDX); **NEAR AI Cloud** private inference (Intel TDX + NVIDIA GPU TEEs, per-response signed receipts, Intel Trust Authority co-verification); **Confidential GPU Marketplace** for heavy jobs (fine-tune lift tests, weight evals) | Multi-vendor TEE (TDX, SEV-SNP, Nitro) for diversity | Marginal enclave (novelty, relevance, ed25519 verdict, receipt ecrecover on-chain) |
| **L3 Delivery** | Copy (sealed to buyer key) · **Use-rights** (query/train/run inside the vault, metered by TEE receipts) · **Weights-in-vault** (run a bought model without ever holding it) | NEAR AI Cloud receipts as metering; **IronClaw** runtime for buyer agents ("secrets never reach the model") | — | Marginal delivery sealed to buyer |
| **L4 Assurance** | Forget certificates; hash-chained audit ledger; provenance dossier (EU AI Act Art. 53 training-data summary, license chain); optimistic challenge window with cross-vendor re-execution; insurance pool; payout guard | NEAR contract storage for cert hashes; **Chain Signatures** + a guard contract so no payout leaves without policy + attester corroboration | Rippner audit ledger & Annex IV dossier generator; Bluprynt block-pinned replay for on-chain claims | ChainProof Guard (attester corroboration, hash-chained audit, caps, kill-switch); Rippner ledger |
| **L5 Settlement & privacy of the trade** | Buyers fund from any chain/asset; sellers paid in their chosen asset/chain; *who bought what* hidden | **NEAR Intents** (1Click, solvers, 35+ chains); **Confidential Intents** (private shard, launched 2026-02-25); **Chain Signatures** for native BTC/SOL/ETH payouts | — | Marginal Intents dry-quote + Chain-Sig Solana payout address |
| **L6 Agent access** | Buyer and seller agents trade programmatically; x402-style per-appraisal payment for agent buyers | NEAR AI Agent Market; function-call keys; IronClaw | x402/AP2 adapters | ChainProof Guard as the spend firewall for buyer agents |

### 4.3 Appraisers by asset class (the "mind" of the exchange)

The general rule for every appraiser: **deterministic measurement wherever possible, LLM judgment only where unavoidable, and the LLM can only *lower* a price, never raise it**. The contract recomputes price from signed components.

| Asset class | Buyer seals… | Appraisal (inside room) | Signal shown before payment | Delivery modes | Hard part |
|---|---|---|---|---|---|
| **Knowledge** (memos, expert answers, research, due-diligence) | Their notes / research corpus + stated question | Claim extraction → per-claim novelty vs buyer corpus (embeddings, deterministic) → relevance (LLM, schema-clamped) → verifiability (cross-check against public sources; for on-chain claims, **block-pinned replay** of chain state, Bluprynt-style) | `novelty`, `relevance`, `verifiable_share`, quantised to 0.1 | Copy; Q&A-only use-rights | Paraphrase gaming of novelty; claim truth |
| **Datasets** | Their training data index + sealed eval set | Dedupe/overlap vs buyer data (in-enclave PSI) → PII/licence scrub → cheap valuation proxy (influence/data-value embedding) → optional **lift test**: LoRA fine-tune on a sample, delta on buyer's sealed eval, on Confidential GPU Marketplace | `overlap`, `lift@k`, `licence_class` | Copy; **train-in-vault** (buyer gets a weight delta, optional DP) | Lift-test cost; memorisation leaks data via weight delta ([arXiv 2510.18554](https://arxiv.org/abs/2510.18554)) |
| **Model weights / fine-tunes** | Their sealed eval set + their current model | **Two-sided sealed eval**: seller's weights × buyer's private eval; fingerprint check of base model and licence | `win_rate vs buyer's model`, `score`, `base_model_fingerprint` | **Weights-in-vault inference** (contract-gated model); licence to deploy in buyer's own TEE | GPU capacity; weight exfiltration if a room is broken |
| **Eval sets / benchmarks** | (Seller is the eval owner; buyer is a model owner) | Run buyer's model on the sealed eval; never reveal items | `score`, `contamination_check` | Per-run evaluation rights | Item leakage through repeated runs → leakage budget |
| **Exploits / vulns** | Protocol registers invariants + bounty | Deterministic fork replay at a pinned block; LLM writes redacted severity | `invariant_broken`, `loss_estimate` | Disclosure sealed to protocol key on payout | Not blue ocean alone (see §9); included as a vertical |
| **Signals / forecasts** | (Buyer = desk) | Signal sealed with timestamp; pay part now, rest **truth-contingent** on resolution via proper scoring rule | `relevance`, `horizon` | Copy at T0, escrow tail settles at resolution | Oracle for resolution |

### 4.4 Mechanism layer (what the contract enforces, never the AI)

1. **Buyer-relative valuation.** `V_b = budget_b × f(signed components)`, with `f` fixed per asset class and recomputed on-chain in integer basis points (as in LETHE v0 today).
2. **Price discovery: valuation decides allocation, a truthful mechanism decides payment.** Shapley or LOO values are not truthful prices, and Myerson payment is the minimal truthful rule ([2504.05563](https://arxiv.org/abs/2504.05563)). Agents never haggle in free text, because LLM negotiators show 10–30× first-proposal bias ([2510.25779](https://arxiv.org/abs/2510.25779)). They submit structured, sealed bids into **batched rounds**.
   - *Bilateral:* ask plus a Nash split of surplus (v0).
   - *Many substitutable sellers (commodity data):* first-price sealed tenders are near-efficient (1−1/e² welfare, [2610.20587](https://arxiv.org/abs/2610.20587)).
   - *Many buyers, one good:* a sealed-bid auction over buyer-relative valuations. **Exclusivity is itself an option the seller can price**: sell exclusive, sell k copies, or sell use-rights at a metered rate. Because the room sees each buyer's valuation, it can run Myerson-style optimal reserve pricing *without any party seeing the other bids*.
3. **Leakage budget (new).** Every appraisal output leaks bits about the good, for example "novelty 0.8" or "lift +2.1". Each listing carries a **seller-set leakage budget in bits**. Each verdict debits `log2(#possible output values)` per field shown, and the contract refuses appraisals once the budget is spent. Buyers pay an appraisal fee that compensates the seller for leakage. This turns Arrow's "inspection leaks" from a vague fear into a **priced, metered, enforced quantity**. I found no prior implementation of this (see §9). It is a research contribution, not a solved problem.
4. **Conditional recall (forget certificate).** On no-deal, the room zeroises buyer context and good plaintext, then signs `forget{job, codehash, attestation_quote_hash, t}`. The contract stores the hash. Conditional-recall theory ([arXiv 2510.21904](https://arxiv.org/abs/2510.21904)) says this commitment strictly improves market outcomes. The certificate is *attested, not proven*. It certifies **non-persistence**: the plaintext never left volatile enclave memory and the session key was destroyed. It does **not** claim weight-level unlearning, which fails ([2410.16454](https://arxiv.org/abs/2410.16454)). Black-box dataset inference ([2507.03619](https://arxiv.org/abs/2507.03619)) gives sellers a post-hoc deterrent against a no-deal buyer who trained on the data anyway.
5. **Atomic delivery-versus-payment.** The key release to the buyer and the Intents settlement are bound to one appraisal hash and run in one yield/resume flow. Agent-payment protocols (x402, AP2) are not atomic ([2605.11781](https://arxiv.org/abs/2605.11781), [2608.23858](https://arxiv.org/abs/2608.23858)).
6. **Truth-contingent tails.** For claims that resolve later (forecasts, "this wallet is a mule", "this dataset is licensed"), a share of payment sits in escrow and settles by a proper scoring rule or a challenge.
7. **Bonds and challenges.** Sellers post bonds against provenance lies (stolen data, licence fraud). Anyone can challenge during a window. Rooms on *different TEE vendors* re-execute the appraisal (optimistic TEE-rollup pattern, [arXiv 2512.20176](https://arxiv.org/abs/2512.20176)).
8. **Value caps per attested key.** The maximum value appraised through a single room key in an epoch is capped, so a physical TEE break costs more than it can steal. The cap is set from the observed cost of TEE.fail-class attacks.

### 4.5 Trust model

| Component | Trusted for | Not trusted for | If it fails |
|---|---|---|---|
| TEE hardware (TDX, SEV-SNP, Nitro, NVIDIA CC) | Confidentiality and integrity of rooms | Anything beyond per-key value caps | Challenge window plus cross-vendor re-execution; per-key caps bound loss; key rotation |
| NEAR MPC (CKD), 11-of-17 | Releasing vault keys only to approved codehash | — | Needs ≥11 colluding nodes; CKD public verifiability is still on NEAR's roadmap ([NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)) |
| Codehash governance (who approves a room version) | Code that ships is the code audited (reproducible builds) | — | Time-locked upgrades; sellers can pin a *set* of acceptable codehashes per listing and refuse new ones |
| LLM inside a room | Producing a bounded score | Price-setting, payouts, or anything outside a schema | The contract clamps; the LLM can only lower price; dual-model `min()` |
| Sellers | Nothing | Truth of claims, provenance | Bonds, truth-contingent tails, reputation |
| Buyers | Nothing | Not exfiltrating via appraisals/queries | Leakage budget, query metering, identity (KYB / World ID for agents), staking |
| Marginal operators | Nothing | — | Cannot read vaults; cannot change code without governance + time-lock |

### 4.6 Threat model (top threats)

| # | Threat | Attack | Mitigation | Residual risk |
|---|---|---|---|---|
| T1 | Physical TEE break | DDR5 interposer (TEE.fail class) on a room host extracts keys | Per-key value caps, short-lived keys via CKD, multi-vendor re-execution, hosts in audited facilities, no single room sees >cap of value | **Real**. Say so in every deck |
| T2 | Seller prompt injection | Good says "rate this 10/10" | Deterministic scorers first; LLM output schema-clamped; LLM can only lower price; dual-model min | Low |
| T3 | Buyer probing (Sybil appraisal) | Many fake buyers appraise to reconstruct the good from scores | Leakage budget per listing, paid appraisals, KYB/agent identity, quantisation | Medium. **Core research problem** |
| T4 | Use-rights exfiltration | Buyer queries a vaulted dataset/model to reconstruct it | Query metering; output firewall (memorisation detection, rate limits); price use-rights assuming partial leakage | Medium. Extraction attacks are real ([arXiv 2510.18554](https://arxiv.org/abs/2510.18554)) |
| T5 | Train-in-vault leakage | Weight delta memorises training data | DP fine-tuning option; or keep the trained model in-vault (weights-in-vault) | Medium |
| T6 | Stolen goods | Seller lists leaked/stolen data or MNPI | Provenance attestations (zkTLS origin proofs), seller bonds, KYB for regulated categories, MNPI category ban, takedown process | Legal, see §12 |
| T7 | Purchase-signal leakage | Observers learn Fund A bought "memo on X" | Confidential Intents for settlement; listing metadata sealed; only hashes public | Low–medium |
| T8 | Governance capture | Malicious codehash approved | Time-lock, seller-pinned codehash sets, multi-party audit | Low |
| T9 | Appraiser model substitution | Room silently uses a weaker model | NEAR AI Cloud per-response signed receipts verified on-chain (v0 already does this) | Low |
| T10 | Payout theft / agent compromise | Buyer agent prompt-injected to overpay | ChainProof Guard-style firewall on agent keys; caps; attester corroboration | Low |

---

## 5. Market size

Every figure links to its source. **E** = market-research or analyst estimate; **P** = primary or company data; **S** = secondary press. All TAM/SAM/SOM arithmetic is **my estimate**, with the method shown. Full table: `moonshot-notes/market.md`.

### 5.1 Sourced inputs

| Segment | Figure | Source | Type |
|---|---|---|---|
| Financial market data & analytics spend | **$49.2B** (2025, +6.5%) | Burton-Taylor via [FOW](https://www.fow.com/insights/market-data-spend-hits-usd49-2bn-as-ai-volatility-and-algos-drive-growth) | E |
| Alternative data spend by investment managers | **~$2.8B** (2025, +17%) | [Neudata, Feb 2026](https://www.neudata.co/press-release/ai-adoption-is-rising-but-alt-data-vendor-spend-hasn-t-neudata-report-finds) | E |
| Expert networks (global) | **>$2.5B** (2024), ~$3B (2025) | [Inex One](https://newswire.ca/news-releases/inex-one-the-expert-network-industry-exceeds-2-5-billion-830623199.html) | E |
| Global insights / market research | **$153B** (2024), of which MR services $56B | [ESOMAR via ResearchWorld](https://researchworld.com/articles/inside-the-153bn-insights-industry) | E |
| Mercor (expert knowledge sold to AI labs) | **>$2B gross annualised run-rate** (Jun 2026); $614M gross H1-2026 | [Dealroom / The Information](https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/) | S |
| Scale AI revenue | ~$1B (2025, company-stated) | [newsio / Forbes](https://newsio.com/2025/11/04/scale-ais-life-after-meta-deal-has-been-rocky-but-cfo-insists-its-not-a-zombie-company/) | S |
| Surge AI revenue | >$1B (2024) | [Reuters via TradingView](https://www.tradingview.com/news/reuters.com%2C2025%3Anewsml_L6N3SX0O9%3A0-scale-ai-s-bigger-rival-surge-ai-seeks-up-to-1-billion-capital-raise-sources-say/) | S |
| AI training dataset market | ~$3.2B (2025) → $16.3B (2033) | [Grand View Research](https://grandviewresearch.com/press-release/global-ai-training-dataset-market) | E |
| Reddit data licensing ("other revenue") | **$140.0M** (FY2025), up from $15.2M (2023) | [Reddit 10-K via edgar.tools](https://app.edgar.tools/companies/RDDT/disclosures/revenue) | P |
| News Corp–OpenAI | >$250M over 5 years | [Storyboard18 citing WSJ](https://www.storyboard18.com/brand-marketing/news-corp-eyes-multi-llm-licensing-strategy-after-250-million-openai-deal-83831.htm) | S |
| Bartz v. Anthropic | $1.5B, ~$3,000 per work | [Bloomberg Law](https://news.bloomberglaw.com/ip-law/anthropic-authors-1-5-billion-deal-receives-final-approval) | P (court) |
| Enterprise GenAI spend | **$37B** (2025); foundation-model APIs $12.5B | [Menlo Ventures](https://menlovc.com/perspective/2025-the-state-of-generative-AI-in-the-enterprise/) | E |
| Global M&A value | $4.6T (LSEG) / $4.81T (Dealogic), 2025 | [Axios](https://www.axios.com/2025/12/29/dealmaking-4-trillion) | P |
| Virtual data rooms | $3.1–3.4B (2025) | [IMARC](https://www.imarcgroup.com/report/en/virtual-data-room-market) | E |
| Crypto stolen in hacks | >$3.4B (2025) | [Chainalysis](https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/) | P |
| HackerOne bounties paid | $81M (report Oct 2025) | [HackerOne](https://www.hackerone.com/press-release/hackerone-report-finds-210-spike-ai-vulnerability-reports-amid-rise-ai-autonomy) | P |
| Zero-day broker prices | up to $7M (iOS, Crowdfense); $20M programmes | [ForkLog](https://forklog.com/en/the-zero-day-market-discover-sell-and-keep-quiet/) | S |
| US trade-secret theft cost | $180–540B/yr (contested method) | [IP Commission](https://www.nbr.org/wp-content/uploads/pdfs/publications/IP_Commission_Report.pdf) | E |
| NEAR Intents | ~$34.9B cumulative volume; ~$53.4M annualised fees (2026-10-23) | [DefiLlama](https://defillama.com/protocol/near-intents) | P |
| Marketplace take-rate benchmark | AWS Data Exchange public listings **3%**; private offers 1.5–3% | [AWS docs](https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html) | P |

Not found (said plainly): GMV for Snowflake Marketplace or AWS Data Exchange; any market figure for model-weight or eval-set trading; individual revenue for GLG, AlphaSights, etc. after 2019.

### 5.2 TAM / SAM / SOM (estimates; method shown)

**TAM ≈ $118B/yr.** Annual B2B spend on information goods where "inspect before you buy" or confidentiality matters: financial data $49.2B + alt data $2.8B + expert networks ~$3.0B + MR services $56B + AI expert/human data (~$2B Mercor gross + ~$1B Surge + ~$1B Scale ≈ $4B) + AI dataset licensing ~$3.2B + bug bounties ~$0.08B = **$118.3B**. *Excluded on purpose:* data brokers (~$290B, a poorly defined commodity), IP licensing (no credible figure), trade-secret theft (a cost, not spend). *Overlap risk:* the AI-data lines probably double-count.

**SAM ≈ $13B/yr.** Segments where a TEE-appraised, escrowed trade fixes an acute inspection or leakage problem *and* buyers are digital-native: alt data $2.8B + expert networks ~$3.0B + AI expert data ~$4B + AI dataset licensing ~$3.2B + bounties/disclosure ~$0.15B = **$13.15B**.

**SOM (year 5) ≈ $7M–$59M revenue.** *Assumptions, not data:* capture 1–3% of SAM GMV ($130M–$395M) at a 5–15% blended take rate.

**Upside not counted (no sourced base):**

1. **Model weights and fine-tunes as traded goods.** "Rent a fine-tune without receiving it" has no market today because it couldn't exist.
2. **Eval sets.** Contamination-free private evals sold per run.
3. **Latent supply.** Information that is never sold *today* because of Arrow's paradox. This is the real bet. Exchanges historically *create* volume once trading is safe. The IP Commission's $180–540B/yr theft estimate is a crude proxy for how much proprietary information is valuable enough to steal and therefore, in principle, to sell.

*Skeptic's note (Haseeb will raise it):* the SOM is small for a venture fund. **The venture case rests on (a) AI labs' data budgets moving from bilateral deals to exchanges, and (b) latent supply, not on taking share of expert networks.** Mercor going from ~$1B to >$2B gross run-rate in about four months is the strongest sourced evidence for (a).

---

## 6. Business model

### 6.1 Who pays

| Payer | What they buy | Why they pay us rather than go bilateral |
|---|---|---|
| **AI labs & enterprise model teams** | Datasets, expert knowledge, eval runs, fine-tunes, priced by measured lift on *their* sealed evals | Pay-for-lift without handing evals to the vendor; provenance dossier for EU AI Act Art. 53; no lawsuit tail |
| **Funds & research desks** (hedge funds, VCs, crypto funds, research DAOs) | Memos, expert answers, alt-data trials, on-chain intelligence | Pay only for what's new to their book; the purchase itself stays private (Confidential Intents); MNPI controls are enforced in-room |
| **Protocols & enterprises** | Exploit disclosures, security research | Fair exchange: pay on verified invariant break |
| **Sellers** (experts, data owners, small labs, researchers) | Listing, vault, appraisal-leakage compensation | Sell without giving away; get paid in any asset on any chain |
| **Agent builders** | API access to appraise and buy programmatically | One integration covers many sellers, with ChainProof Guard-style spend firewalls |

### 6.2 Revenue lines (take rates are estimates, benchmarked)

| Line | Mechanism | Rate (estimate) | Benchmark |
|---|---|---|---|
| **Clearing fee** | % of cleared value, split buyer/seller | 5–10% (knowledge, datasets), 2–3% (large private deals) | AWS Data Exchange 3% public, 1.5–3% private ([AWS](https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html)); OpenRouter ~5.5% ([Galaxy](https://www.galaxy.com/insights/perspectives/inference-market-and-micro-structure)); Mercor keeps ~30–40% of gross ([Dealroom](https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/)) |
| **Appraisal fee** | Per appraisal: confidential GPU cost pass-through + margin, plus leakage compensation paid to the seller | Cost + 20–30% | Confidential GPU pricing from NEAR AI / partners |
| **Use-rights metering** | Per query / per training-hour / per inference-token in vault | 10–20% of metered value | Inference routers |
| **Assurance** | Optional insurance on TEE-break / provenance fraud; funded pool | 1–2% of covered value | AI-liability market ([Deloitte, ~$4.7B premiums by 2032](https://www.deloitte.com/us/en/insights/industry/financial-services/risk-insurance-for-ai.html)) |
| **Private rooms (SaaS)** | Dedicated appraisal rooms for a lab or fund, with audit ledger and compliance dossiers (Rippner stack) | $100k–$1M/yr per enterprise | Rippner's existing B2B contracts (Jay's own data) |

### 6.3 Unit economics (illustrative estimates, not data)

*Example: a mid-size dataset sale to an AI lab.*

- **Deal:** $200k cleared. Clearing fee at 6% = **$12k**.
- **Appraisal:** a LoRA lift test on a sample takes ~8 GPU-hours on confidential B200 (assumption). At an assumed $6/GPU-hour confidential rate that is ~$48 of compute, charged at cost +25% ≈ $60. Cheap appraisals (embeddings, novelty) cost cents. **Appraisal is not the margin driver; clearing is.**
- **Leakage compensation:** e.g. $500 per appraisal to the seller (seller-set). This is pass-through, and it *deters Sybil probing*.
- **Assurance:** 1.5% = $3k into the pool.
- **Contribution margin per deal:** ≈ $12k − (room infra and ops ≈ $1–2k) ≈ **$10k**.

*Example: a $2k research memo sold to a fund.* Fee at 8% = $160. Appraisal cost < $1. Margin is high, but volume must be high. This segment is the **wedge**, not the business.

**The business is clearing large AI-data deals. The wedge is knowledge goods, where v0 already works.**

---

## 7. Moat

1. **Two-sided sealed liquidity.** Each buyer's sealed context (notes, evals, models) makes appraisals better for that buyer *and* makes the venue more valuable to sellers. That gives a classic exchange network effect, plus one Web2 exchanges can't copy: buyers' private context never leaves, so they can't take it to a competitor's appraisal without re-sealing it there.
2. **The appraisal corpus.** Every cleared trade is a (good, buyer-context-class, measured value, realised price, later truth outcome) tuple. Over time Marginal trains the best **information-pricing models** in the world. Only aggregates leave rooms, under DP.
3. **Leakage-budget accounting and appraisal mechanisms** are new mechanism-design IP (papers plus implementation). The first venue with a credible "inspection costs you X bits and the seller was paid for them" will become the standard.
4. **Regulatory artefacts as lock-in.** Provenance dossiers that satisfy EU AI Act Art. 53 and that insurers and auditors accept. Rippner already ships Annex IV dossiers to paying B2B customers. Once a lab's compliance team relies on Marginal certificates, switching costs are high.
5. **Trust track record.** Exchanges are trust businesses. A public, replayable history of every settlement (Bluprynt-style block-pinned replay, `make verify` in v0) compounds.
6. **Stack lock-in on NEAR, deliberately.** CKD + Shade Agents + NEAR AI Cloud + Intents + Confidential Intents is one integrated stack today. Porting to another chain means re-assembling five vendors.

*Honest weakness:* the TEE layer is commoditising (Phala, Oasis, Turnkey, NEAR AI). The moat is **not** "we have enclaves". It is the mechanism, the appraisal data, and liquidity.

---

## 8. Why each judge would care

Quotes are verbatim unless marked *paraphrase*. **SECONDARY** = aggregator, reprint or translation; check the original before putting it on a slide. Full notes: `moonshot-notes/judges-theses.md`.

### 8.1 Illia Polosukhin (NEAR)

- *"Everyone should own their AI."* / *"Privacy and verifiability are required to maximize available AI context for users and businesses."* ([NEAR AI blog, 2025-12-03](https://near.ai/blog/introducing-near-ai-cloud-private-chat)). The same post's roadmap names **"private portable memory"** and *"a decentralized confidential compute layer coordinated on-chain."*
- *"We are converging blockchain and AI into a unified commerce layer where agents can transact."* ([Confidential Intents launch, 2026-02-25](https://tools.prnewswire.com/en-us/live/20813/release/20260225EN95768))
- *"agent is a front-end and markets is a back-end"* ([The Block, 2026-10-07](https://www.theblock.co/news/ecosystems/2026-10-07-nears-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912))
- **Why he cares:** Marginal is the *revenue form* of his argument that privacy unlocks more context. Information becomes a new asset class inside the "unified commerce layer". It consumes **every** NEAR AI product (Cloud, IronClaw, Confidential GPU Marketplace, CKD, Shade Agents, Intents, Confidential Intents) as load-bearing parts. It also creates demand for confidential GPUs that isn't chat.
- **What he'll probe:** why not just build this as an Agent Market vertical? Answer: the clearing mechanism, leakage budget and appraisal rooms are a protocol that Agent Market *uses*.

### 8.2 Eddy Lazzarin (a16z crypto)

- I found no direct 2026 Lazzarin quote on information markets. The firm thesis is the hook: *"we need secrets-as-a-service: New technologies that can provide programmable, native data access rules"* (Adeniyi Abiodun), and *"Privacy will be the most important moat in crypto"* (Ali Yahya), both in [a16z Big Ideas 2026, 2025-12-11](https://a16zfrontier.com/posts/article/big-ideas-things-excited-about-crypto-2026). Also: *"The bottleneck for the agent economy is shifting from intelligence to identity"* (Sean Neville, same).
- Attributed to Lazzarin, **SECONDARY** (translated reprint, original not found): *"The software itself is no longer the moat; the network is."* ([KuCoin flash, 2026-11-04](https://www.kucoin.com/news/flash/a16z-cto-network-effects-not-code-will-be-ai-era-s-ultimate-moat))
- *Paraphrase* (a16z clip with Dan Boneh, ~Oct 2026): cryptography earns trust by surviving attacks over time.
- **Why he cares:** Marginal is literally "secrets-as-a-service" plus a mechanism-design contribution: Myerson payments over buyer-relative valuations, a leakage budget, conditional recall. Its moat is a network (appraisal corpus, liquidity), not code.
- **What he'll probe:** TEE trust assumptions. Lead with the threat model (§4.5–4.6), the k-of-n multi-vendor rooms, and the honest "forgetting is attested, not proven".

### 8.3 Mert Mumtaz (Helius; NEAR Foundation Council since 2026-10-15)

- *"Crypto without privacy is not crypto."* / *"Just as HTTPS made the HTTP internet safe and scalable for global commerce, privacy will do the same for blockchains."* ([The Block, 2026-06-10](https://www.theblock.co/post/403982/solana-infrastructure-firm-helius-acquires-light-protocol-expand-onchain-privacy))
- NEAR quotes him calling Intents *"the market of markets"* ([The Block, 2026-10-15](https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656)).
- **Why he cares:** information is the next market in his "market of markets". Privacy here is the *product*, not a feature. Sellers can be paid natively on Solana through Chain Signatures and Intents.
- **What he'll probe:** I found no public Mert statement on TEEs, and his stack is ZK-based (Light, Rings). Pitch TEEs as *today's* execution substrate, with ZK where it's already practical (Jolt Atlas sub-proofs, VFT licence-compliance proofs) and on the roadmap.

### 8.4 Avichal Garg (Electric Capital)

- Electric's **#8 Data networks and marketplaces**: *"AI needs data infrastructure that compensates contributors and gives them control over usage."* **#1 Private AI agents**: *"People need to run AI on sensitive data in a secure way"* (names TEEs). **#24**: *"Institutions often need to collaborate on data without revealing it to each other."* ([Electric Capital, 2026-01-20](https://data.electriccapital.com/posts/investing-in-user-owned-technology-26-opportunities-in-2026))
- NEARCON 2026, **SECONDARY**: *"How does liability work in that case? I actually don't know."* / *"You can't punish an AI."* ([cryptonews.net / CoinDesk syndication, 2026-02-24](https://cryptonews.net/news/defi/32477937/))
- **Why he cares:** Marginal maps onto #8, #1, #24 and #2 at once. Its answer to "who is liable" is code: the AI can't move money, the contract can; bonds and challenge windows give a punishable party.

### 8.5 Kain Warwick (Synthetix / Infinex)

- *"AI advancements will lead to an increase in hacks initially, but this trend will stabilize over time."* ([Crypto Briefing on Unchained, 2026-04-10](https://cryptobriefing.com/kain-warwick-ai-will-initially-increase-hacks-in-defi-uniswaps-security-is-overestimated-and-the-trade-offs-of-blockchain-immutability-unchained/))
- *Paraphrase* (site summary): "DeFi hasn't seriously started to solve" AI-agent security ([Unchained, 2026-05-08](https://unchainedcrypto.com/how-morse-code-broke-an-ai-crypto-agent/)). UX maximalism with Infinex ([The Defiant, Jan 2026](https://thedefiant.io/podcasts-and-videos/podcast/kain-warwick-on-infinex-synthetix-and-the-future-of-defi-ux-and-stability)).
- **Why he cares:** the exploit-disclosure vertical is fair exchange for the AI-driven hack wave he predicts. The truth-contingent "signals" vertical is a derivatives-shaped product. The UX promise is "upload, see your price, get paid", with no chain visible.
- **What he'll probe:** prompt-injecting the appraiser into a payout. Answer: the LLM can only lower prices; the contract pays.
- *Honesty:* his public record on AI is thin. This is the weakest judge fit.

### 8.6 Haseeb Qureshi (Dragonfly)

- *"I think the most critical piece is privacy."* / *"crypto isn't meant to be used by your AI agent; it's meant to be used by you."* (**SECONDARY**, translated interview, [TechFlow, 2026-10-13](https://www.techflowpost.com/en-US/article/34518))
- *"AI agents will still not be 'paying each other' or spending any meaningful money in 2026."* / *"AI becomes used for both attack & defense in cybersecurity."* ([haseebq.com, 2025-12-29](https://haseebq.com/2026-predictions/))
- **Why he cares:** Marginal isn't "agents paying agents". Humans and institutions (labs, funds) pay for information, and their agents only *inspect*. Crypto earns its place through privacy and credible escrow, exactly the shift he made from Dec 2025 ("privacy is a laggard", [Bitcoinist, SECONDARY](https://bitcoinist.com/dragonfly-qureshi-crypto-predictions-for-2026/amp/)) to Oct 2026 ("privacy is the real killer app").
- **What he'll probe:** volume. Show Mercor's run-rate and pay-for-lift demand, and treat the SOM honestly.

### 8.7 Stepan Gershuni (cyber•Fund)

- *"We are watching closely many other areas & ideas around memory: memory marketplaces, mixing memories, digital personalities"* / *"We loosely define onchain AI model as one that needs a smart contract approval to run."* / section headings *"The Rails: TEEs & Crypto"*, *"AI-aware market mechanisms"*, *"The Endgame: Commoditized Cognition"* ([cyber•Fund AI×crypto thesis, 2025-03-24](https://threadreaderapp.com/thread/1904249264861237261.html))
- **Why he cares:** Marginal is a memory and knowledge marketplace. Weights-in-vault is *exactly* his "onchain AI model": inference runs only when a NEAR contract approves and pays. The rails are TEEs and crypto, and the core is an AI-aware market mechanism.
- *Honesty:* I found no 2026-specific Gershuni text.

### 8.8 Adjacent thesis worth quoting

- Variant, "Agents in a Bazaar": *"the juiciest data usually has legal regimes that require it to be kept under lock and key"* / *"crypto allows us to make payments atomic with proof of service."* ([Variant, 2025-05-13](https://variant.fund/articles/agents-in-a-bazaar/))

---

## 9. Competitive scan: is it blue ocean? (honest answer: *near-blue*)

**Method.** 43 searches and 11 fetches went into the competitor stream (query list in `moonshot-notes/competitors.md` §4), plus about 15 of my own, plus a keyword grep over all 511 NEAR hackathon entries and their 487 readable demo posts. Component key: **BR** buyer-relative appraisal · **S2** two-sided sealed evaluation · **AIE** AI as escrow/appraiser · **UR** use-rights, not copies · **FC** signed forget certificate · **XC** cross-chain settlement · **MW** model weights as a good.

### 9.1 Closest adjacent work

| Product / paper | Status | What it already does | What it lacks vs Marginal |
|---|---|---|---|
| **NDAI Agreements** ([2502.07924](https://arxiv.org/abs/2502.07924)) | Paper | The theory: TEE + agents = "ironclad NDA" | BR, UR, FC, XC, MW; no product |
| **TBVH** ([github.com/deepsp94/tbvh](https://github.com/deepsp94/tbvh)) | Testnet (Base Sepolia, Phala TDX) | Buyer/seller agents negotiate in TEE; DKIM authenticity; TEE-signed escrow | Appraises against a *text request*, not the buyer's assets; delivers copies; no FC; single chain |
| **NDAI TrustKit** ([github.com/discordwell/ndai-hackathon](https://github.com/discordwell/ndai-hackathon)) | Hackathon (simulated TEE default) | NDAI implementation, Nash bargaining, Shamir keys, sealed exploit verification | BR, UR, FC, XC, MW |
| **DealProof** ([github.com/kkoci/Dealproof](https://github.com/kkoci/Dealproof)) | Hackathon/WIP | "Private data access" negotiation in Phala TDX | BR, FC, XC |
| **Mnemo** ([github.com/Eduardogbg/mnemo](https://github.com/Eduardogbg/mnemo)) · **Sealed Trade Protocol** | Hackathon / contracts only | Exploit-disclosure escrow; bonded TEE negotiation | Single vertical; no BR/XC |
| **Lethe protocol** (lethe-protocol.github.io, Flashbots-adjacent) | Early research | Erasure-based audit market | **Name collision** → this moonshot is renamed *Marginal* (§1) |
| **Turnkey Verifiable Cloud: data brokerage** ([docs](https://docs.turnkey.com/solutions/verifiable-cloud/data-brokerage)) | Solution pattern, consult-led | **Runs the buyer's evaluation against the seller's corpus inside a TEE before payment.** Closest commercial match to S2+BR | No pricing mechanism, no AI appraisal, delivers copies, no FC, no crypto settlement, no weights |
| **Super Protocol** (superprotocol.com) | Live (self-reports 2,000+ confidential deployments) | **Use-rights over sealed models and datasets on GPU TEEs** (UR + MW) | No buyer-relative pricing, no appraisal, no FC |
| **VAST DataEnclave** (blocksandfiles.com, 2026-09-22) | Preview, GA Q1 2027 | Two-sided sealing of model weights × enterprise data | No marketplace, no pricing. Will commoditise enterprise weight-rental |
| **Ocean compute-to-data**, **iExec** | Live but stalled/pivoting | "Rent the answer" since 2020; TEE compute market | **Weak demand history is a warning** (see §12) |
| **OpenLedger PoA**, **Vana PoC** | Mainnet | Pay by measured marginal contribution | Value relative to a *shared* model or pool, post-hoc. Not the buyer's private model, pre-purchase |
| **PrivaDE** ([2510.18109](https://arxiv.org/abs/2510.18109), AsiaCCS'26) · **TIP** ([2512.06033](https://arxiv.org/abs/2512.06033)) | Papers | **Buyer-model-specific pre-purchase valuation** via cryptography/HE | Not TEE (slow, small models), no market, no settlement |
| **Attestable Audits** ([2506.23706](https://arxiv.org/abs/2506.23706)), **TRUCE**, **ManaTEE** | Paper / OSS | Confidential evaluation of model × secret benchmark | Not a market |
| **Golden Grain** ([2011.06458](https://arxiv.org/abs/2011.06458)) | Paper (2020) | TEE-benchmarked model marketplace, price set by performance | Not buyer-relative; no settlement beyond one chain; old |
| **Surge "pay if metric improves"** | Reported (SECONDARY, [Sacra](https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/)) | Pay-for-lift *demand* exists | The vendor measures its own lift; no sealing; no neutral venue |
| **AWS/Snowflake/Databricks clean rooms**, Human Native (→ Cloudflare), TollBit, Datarade | Live, large | Enterprise compute-to-data; Web2 licensing | "Evaluation" = free samples, which is exactly the inspection paradox |

### 9.2 Inside the 511 hackathon entries

- **BlindBench** ("private evals that pay their authors, scored inside NEAR AI Cloud enclaves") overlaps the eval-set vertical.
- **DeadDrop** (sealed file sale with escrow) and **KeyLease** ("lend the call, never the key", use-rights for API keys) overlap delivery modes.
- **Sealed Exploit**, **Redline**, **SealedBounty**, **Skarbnik** overlap the exploit vertical.
- **Provable Alpha** overlaps signals.
- About 26 entries are AI spend-guard or escrow variants. **"TEE AI judge + escrow" is saturated.**
- **No entry combines buyer-relative marginal-value appraisal, model weights as a good, forget certificates and cross-chain settlement.** LETHE (Jay's) is the only entry with buyer-relative novelty pricing and a forget certificate.

### 9.3 Verdict

**Already exists, so don't claim it:** AI agents negotiating inside a TEE · inspect-then-forget · compute-to-data · buyer eval in a TEE (Turnkey) · marginal-contribution payouts (OpenLedger, Vana) · sealed exploit sale · private eval sets as a good · sealed model rental.

**Genuinely new (no live or open implementation found):**

1. **The buyer's own corpus, model or eval sealed in the same room as the good, with the price set by measured *buyer-specific* marginal value and cleared by a truthful mechanism (Myerson/auction) enforced in a contract.**
2. **A leakage budget:** appraisal leakage measured in bits, compensated, and enforced by the contract. I found nothing like it in products or in the papers stream.
3. **A forget certificate as a portable settlement artefact.**
4. **One venue across knowledge, data, evals, weights and exploits, settled cross-chain via Intents with private purchase records.**

**Positioning consequence:** lead with *"pay only for what your model or your notes don't already have, and neither side sees the other"*. **Never** lead with "AI escrow in a TEE".

**Biggest competitive threats:**

- **NEAR AI itself** (DCML, GPU marketplace) adds a buyer-eval feature → partner, and be the app layer.
- **Super Protocol** adds pricing.
- **Turnkey/VAST** own the enterprise channel → Marginal is the *neutral market*, and they are rails it can use.

---

## 10. Roadmap: hackathon prototype → v1 → full product

| Phase | Window (estimate) | Scope | Milestones / kill criteria | Must be researched or invented |
|---|---|---|---|---|
| **P0: LETHE v0 (hackathon)** | Now → 2026-11-14 | Knowledge goods only. Buyer-relative novelty, Nash split, yield/resume, on-chain ed25519 + `ecrecover` of AI receipts, forget certificate, Chain-Sig-derived Solana payout address, Intents `dry:true` quote | Already built on testnet (`lethe-380029.testnet`). Honest real-vs-simulated table. **Enclave attestation is simulated** | — |
| **P1: Real rooms** | Months 0–6 | Shade Agent on dstack/TDX with codehash approved in the agent contract. **CKD** key release. Real NEAR AI Cloud receipts. Mainnet settlement with per-listing caps. **Leakage budget v1** (quantised outputs, per-listing bit budget). ChainProof Guard as the buyer-agent spend firewall. Rippner hash-sealed audit ledger | 3–5 design partners (crypto funds, research DAOs, a security firm). **First $100k cleared.** External audit of contract and room. *Kill if:* <2 partners clear a paid trade by month 6 | Leakage-budget accounting for adaptive Sybil probing; paraphrase-robust novelty |
| **P2: Data & evals (v1)** | Months 6–18 | GPU rooms on NEAR's Confidential GPU Marketplace (B200; tuned stack). **Lift-test appraiser** (LoRA on a sample → Δ on the buyer's sealed eval) and cheap proxies (in-run Shapley, STRIDE). **Sealed eval runs**. Myerson/sealed-bid rounds. Provenance dossier (EU AI Act Art. 53 summary, licence chain), built on Rippner's Annex IV generator. **k-of-n multi-vendor rooms** + challenge windows + TOPLOC spot-checks. Seller bonds. Confidential Intents settlement | 2 AI-lab or enterprise-model buyers; $5–10M GMV; first peer-reviewed paper (leakage budget + buyer-relative Myerson). *Kill if:* labs refuse TEE-measured lift as a contract basis | Cost-bounded lift tests; determinism of LLM appraisal across vendors for re-execution; the provenance-attestation format |
| **P3: Weights, use-rights, exploits** | Months 18–36 | **Weights-in-vault** (contract-gated inference, cyber•Fund's "onchain model"). Use-rights metering via TEE receipts. Train-in-vault with DP option. Exploit vertical (fork replay). Truth-contingent signal tails. Insurance pool. Agent API (x402/AP2 adapters behind the guard) | $100M+ GMV run-rate; insurance capacity partner; first weights-licence deal | Output firewalls against extraction (2511.02620-style verification); ZK licence-compliance proofs (VFT/VeriLoRA) |
| **P4: Supply side for everyone** | Year 3+ | Consumer "context wallet": individuals rent their notes, health or spending data to buyers' rooms (Illia's "private portable memory"; Electric #8). Appraisal-corpus pricing models as a product | — | Personhood (PHCs) for Sybil-resistant consumer supply; consent UX |

---

## 11. How LETHE and ChainProof Guard become v0

| Moonshot layer | Existing component (built) | What carries over directly | Gap to close |
|---|---|---|---|
| L0 Clearing | **LETHE contract**: listings, escrow, `inspect` → yield, `on_verdict` resume, integer-bps price recomputation, Nash split, refunds, ~200-block timeout | The whole state machine and the principle "the contract sets the price, the LLM can only lower it" | Auctions, leakage ledger, bonds, challenge windows |
| L1 Vault | LETHE X25519 sealed boxes; plaintext hash on-chain | Seal-to-enclave pattern | Swap the owner-set enclave key for **CKD**-derived keys bound to an approved codehash |
| L2 Appraisal | LETHE enclave: per-claim MiniLM novelty vs buyer notes (weighted by stated need, padding-resistant); relevance score; ed25519 verdict | **Buyer-relative appraisal is already real**: the core novelty exists in code | Real attestation (Shade Agent/dstack); GPU appraisers for data and weights |
| L2 Receipts | LETHE on-chain `ecrecover` of NEAR AI receipts, body-hash binding, score parsed from the signed body, replay protection | Model-substitution defence (threat T9) | Use real `NEARAI_API_KEY` receipts (today a labelled stand-in) |
| L4 Forget certs | LETHE forget certificate hash stored on-chain; `make verify` re-checks each settlement from RPC | First implementation of FC as a settlement artefact | Bind it to an attestation quote hash |
| L4 Payout guard | **ChainProof Guard**: function-call-key-scoped agent, caps, rolling windows, blocklist, **k-of-n fresh block-pinned attester corroboration** before any Chain Signature, hash-chained audit log, kill switch | (a) The buyer-agent spend firewall (L6). (b) The "k-of-n corroboration before release" pattern becomes **k-of-n multi-vendor room agreement before payout** | Generalise attesters to TEE rooms |
| L5 Settlement | LETHE: seller Solana address derived via Chain Signatures; Intents 1Click `dry:true` quote | Cross-chain payout path | Execute real Intents settlement; Confidential Intents |
| Audit & compliance | **Rippner**: tamper-evident hash-sealed audit ledger, faithfulness gate, EU AI Act Annex IV dossiers, paying B2B customers | Provenance dossier and audit ledger. Rippner customers are a warm channel for "private appraisal rooms" | Map Annex IV tooling to Art. 53 training-data summaries |
| Verifiability | **Bluprynt**: block-pinned, replayable ground truth from chain state | Verifying on-chain claims inside knowledge goods (e.g. "these wallets are linked") by replay | — |
| Crypto toolbox | Jay's Groth16/Circom, indexed Merkle trees, **nullifiers** (meridian-link), ERC-3643 | **Nullifiers enforce "one appraisal per verified buyer per listing" without revealing who** (Sybil control for the leakage budget). ERC-3643-style permissioned listings for regulated categories (KYB-gated) | — |

**Founder fit, said plainly:** Jay has already shipped the core novelty (buyer-relative novelty pricing + forget certificate + on-chain receipt verification) and the security perimeter (ChainProof Guard), and he runs a compliance business (Rippner) that sells to the exact enterprise buyers P2 needs. What's missing is **a GTM co-founder from the expert-network, alt-data or AI-data side**, and **a TEE/systems engineer** for GPU rooms.

---

## 12. Risks and mitigations

| Type | Risk | Severity | Mitigation |
|---|---|---|---|
| Technical | **Physical TEE breaks** (TEE.fail, Battering RAM, WireTap at $50–$1k) | High | Per-key value caps; k-of-n multi-vendor/multi-operator rooms; challenge windows; insurance pool; short-lived CKD keys; host in audited facilities. **State it in every deck** |
| Technical | **Appraisal leakage / Sybil probing** reconstructs goods from scores | High | Leakage budget, paid appraisals, quantisation, nullifier-based one-appraisal-per-identity, KYB. **An open research problem; P1–P2 deliverable** |
| Technical | Use-rights exfiltration via queries; memorisation in train-in-vault ([2510.18554](https://arxiv.org/abs/2510.18554)) | Medium | Output firewalls, rate limits, weights-in-vault default, DP option, price use-rights assuming partial leakage |
| Technical | Lift tests are costly or noisy | Medium | Cheap proxies first (influence, in-run Shapley); full lift test only above a deal-size threshold, paid by the buyer |
| Technical | CKD maturity (public verifiability still "next step"; recovery keys not post-quantum) ([NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)) | Medium | Phase in CKD; fall back to dstack KMS; track NEAR MPC roadmap |
| Technical | Shade Agent framework is flagged experimental with known critical vulnerabilities, testnet-only in docs ([Mintlify quickstart](https://www.mintlify.com/near/docs/ai/shade-agents/quickstart)) | Medium | Value caps; audits; co-develop with NEAR AI |
| Regulatory | **MNPI / insider trading** when knowledge is sold to funds | High | Category bans; in-room MNPI classifier plus human compliance review; KYB of sellers; expert-network-style compliance playbook; audit ledger available to regulators via selective disclosure |
| Regulatory | Stolen data / copyright / GDPR (personal data in datasets) | High | Seller bonds, zkTLS origin proofs, provenance attestations, PII scrub in-room, takedown process, jurisdictional gating |
| Regulatory | Export controls on model weights; securities status of truth-contingent tails | Medium | Weights-in-vault (no transfer) by default; legal review; launch tails only where permitted |
| Market | **Demand history is poor**: Ocean and iExec did not find PMF for confidential data markets | High | Different wedge: they sold *access*; Marginal sells *measured marginal value*, which is what labs already ask for (Surge pay-for-lift, SECONDARY). Start with buyers who already pay (funds, labs), not with supply aggregation |
| Market | Incumbents add buyer-eval (Super Protocol, Turnkey, VAST, NEAR AI) | Medium | Be the neutral venue plus mechanism plus appraisal corpus; partner with rails; publish the leakage-budget standard first |
| Adoption | Buyers don't trust TEE-measured numbers as a contract basis | High | Multi-vendor agreement, open-source rooms, reproducible builds, third-party audit, Intel Trust Authority co-verification, insurance; start where stakes per deal are capped |
| Adoption | Two-sided cold start | High | Seed supply via design-partner buyers' RFPs ("we pay for X"), so sellers come to buyers; Rippner and Jay's network for the first enterprise rooms |
| Execution | Solo founder, very broad scope | High | Ship the knowledge vertical first; hire GTM + TEE engineer; resist adding verticals before P2 metrics |

---

## 13. Candidate comparison

Scores are 1–10 (my judgement, informed by the research streams). **Amb** ambition · **Tech** technical grounding · **Mkt** market size (sourced where possible) · **Blue** blue-ocean-ness after the competitor scan · **Judge** fit with the seven judges · **Jay** founder fit · **v0** path from existing builds.

| # | Candidate | One-line | Amb | Tech | Mkt | Blue | Judge | Jay | v0 | **Σ/70** |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** | **Marginal** (LETHE at scale) | Confidential clearinghouse for information goods; buyer-relative marginal-value pricing in sealed rooms; forget certs; Intents settlement | 10 | 8 | 8 | 6 | 9 | 9 | 9 | **59** |
| B | **Bonded Agents**: AI-agent liability clearinghouse | Bonds + parametric claims auto-adjudicated from TEE-signed transcripts and attested guardrail telemetry (CPG + Rippner) | 7 | 8 | 7 | 5 | 8 | 9 | 8 | 52 |
| G | **Context Wallet**: user-owned personal context exchange | Individuals rent their notes, health or spending data to buyers' rooms without revealing it | 9 | 6 | 7 | 5 | 7 | 6 | 6 | 46 |
| E | **Sealed Signal Oracle** | TEE aggregates private insider signals into public forecasts; contributors paid by proper scoring rules | 8 | 7 | 6 | 7 | 6 | 6 | 6 | 46 |
| D | **Sovereign Firm OS** | Autonomous AI corporations with attested governance and Chain-Sig treasuries | 9 | 5 | 7 | 2 | 7 | 6 | 5 | 41 |
| F | **Replayable Ratings** | AI ratings agency for on-chain assets/RWAs, every rating block-pinned and replayable (Bluprynt) | 5 | 9 | 5 | 2 | 4 | 9 | 7 | 41 |
| C | **Compute Oil**: physically delivered attested-inference forwards | Lock today's price for next quarter's verified tokens | 7 | 7 | 6 | 4 | 5 | 5 | 5 | 39 |

**Why A wins.**

1. It is the only candidate where *every* NEAR primitive is load-bearing: CKD, Shade Agents, NEAR AI Cloud, the GPU marketplace, yield/resume, Intents, Confidential Intents, Chain Signatures. That makes it Illia's and Mert's product.
2. It is the only one with a *mechanism-design* core that Eddy, Avichal and Haseeb will respect (Arrow's paradox, Myerson, conditional recall, leakage budget).
3. It sits on a **sourced, already-spending** demand base: AI-lab data spend (Mercor >$2B gross run-rate), alt data, and expert networks.
4. Its novelty is already partly *implemented* by Jay: buyer-relative novelty and forget certificates are in LETHE v0.
5. It scored lower on blue-ocean (6), and that is honest. The category is crowded and the mechanism isn't.

**Runners-up in one line each:**

- **B, Bonded Agents:** the best *business* fit for Jay (CPG + Rippner) and answers Avichal's liability question, but off-chain insurers (AIUC, Armilla, Munich Re) own the market and insurance licensing is the gate. **Best as Marginal's assurance layer and as a Rippner product line.**
- **G, Context Wallet:** the most "user-owned AI" of all, but consumer two-sided cold start; **becomes Marginal's P4 supply side.**
- **E, Sealed Signal Oracle:** technically the emptiest space, empty mostly because of insider-trading law.
- **D, Sovereign Firm OS:** a grand narrative, crowded and legally unsettled (Delaware AI-entity proposals; Tontine and Charter in this hackathon).
- **F, Replayable Ratings:** strongest technical fit with Bluprynt, but Credora/RedStone and Chaos Labs dominate and replayability is a feature.
- **C, Compute Oil:** GPU futures went red in 2026 (CME, ICE, Kalshi, Architect, SF Compute). The inference-forwards niche is real but early.

---

## 14. Ten-slide investor pitch outline

| # | Title | Key message | Content |
|---|---|---|---|
| 1 | **Marginal** | An exchange for things that can't be shown | Hook line; "pay only for what your model doesn't already have"; built on NEAR; Jay's photo + LETHE v0 demo QR |
| 2 | **The 60-year-old bug** | Arrow (1962): information can't be sold without being given away | Expert networks bill hours; data markets sell samples; labs sign blind bilateral deals or get sued (**$1.5B Bartz v. Anthropic**); weights can't be sold without being kept forever |
| 3 | **Why now** | Confidential GPUs + mechanism theory + keys released to code | B200 CC 1–3% overhead (2608.26575); NDAI + Conditional Recall; NEAR CKD; Confidential Intents; EU AI Act Art. 53 deadlines |
| 4 | **How it works** | Seal → appraise *against your own context* → clear → use, or forget | 4-step diagram: Vault (CKD) · Appraisal Room (Shade/NEAR AI GPU TEE) · Clearing contract (Myerson, leakage budget) · Intents settlement / forget certificate |
| 5 | **Demo** | Two funds, one memo: one pays, one gets a refund and a forget certificate | LETHE v0 testnet run; `make verify` re-checking every settlement from RPC; next: a dataset lift test on a lab's sealed eval |
| 6 | **The mechanism is the moat** | The AI measures; the contract prices; leakage is metered | Buyer-relative valuation · truthful payment · leakage budget (new) · atomic DvP · k-of-n multi-vendor rooms; trust and threat model on one slide, TEE.fail named |
| 7 | **Market** | $118B TAM / $13B SAM (estimates, sourced inputs) | Financial data $49.2B, alt data $2.8B, expert networks ~$3B, AI expert data (Mercor >$2B gross run-rate), AI dataset licensing ~$3.2B; latent supply as upside |
| 8 | **Business model** | Clearing fees on large AI-data deals; knowledge goods as the wedge | 5–10% clearing, appraisal at cost+, use-rights metering, assurance, private rooms SaaS; unit-economics example ($200k dataset → ~$10k contribution) |
| 9 | **Competition** | Category crowded, mechanism empty | 2×2: *buyer-relative pricing* vs *sealed two-sided*. TBVH/TrustKit/DealProof (AI escrow, no BR); Turnkey (sealed eval, no market); Super Protocol (rental, no pricing); Ocean/iExec (history lesson) |
| 10 | **Team, roadmap, ask** | Jay already shipped the core; P1 = real rooms + design partners | Jay: Rippner (paying B2B, audit ledger), Bluprynt, ZK, bridges, LETHE + CPG. Roadmap P0→P3. Hires: GTM (AI-data/alt-data) + TEE engineer. Ask: pre-seed for 18 months to P2 milestones |

---

## 15. Revised hackathon pitch and README framing (LETHE as v0 of Marginal)

> **Constraint:** the LETHE submission already exists (payload in `./lethe/`), and this research task may not change repos or post anything. Below is *text for Jay* to use if he chooses. The submission name stays **LETHE**. Don't rename it mid-hackathon; mention Marginal as the vision.

### 15.1 60-second video script

| t | Screen | Voice-over |
|---|---|---|
| 0–7 s | Title: "LETHE: pay only for what you don't already know" | "In 1962 Kenneth Arrow showed that information can't be sold. To value it you have to see it, and once you've seen it, you won't pay." |
| 7–17 s | Seller CLI: memo sealed; chain shows only a hash and an ask; Solana payout address derived via Chain Signatures | "A researcher seals a memo to an enclave. NEAR stores only its hash. The seller will be paid on Solana, from a NEAR account." |
| 17–32 s | Fund A: `inspect` → yield spinner → enclave log: novelty 100%, relevance → contract recomputes price → **Deal**, memo decrypts | "A fund seals its own notes into the same enclave. The memo is scored *against what this fund already knows*. The contract, not the AI, recomputes the price from signed inputs and pays the seller." |
| 32–45 s | Fund B: novelty ~31% → **No deal** → refund ✔ → forget certificate hash on-chain | "Fund B already knew most of it. No deal, full refund, and the enclave signs a certificate that it destroyed both sides' secrets." |
| 45–53 s | `make verify` output scrolling: receipt signer ✔, valuation ✔, paid+refunded = budget ✔ | "Anyone can re-check every settlement from chain data. And the README says plainly what's real and what's simulated." |
| 53–60 s | Card: "v0 of **Marginal**: the same mechanism for datasets, eval sets and model weights" | "Today: memos. Next: datasets priced by the lift on *your* evals, and models you can rent without ever holding them. Built on NEAR." |

### 15.2 README framing (top of README, suggested text)

> **LETHE** is a working v0 of a larger idea: an exchange where information is priced by its *marginal value to each buyer*, measured inside a sealed enclave against the buyer's own private context. Nothing is revealed unless the deal clears, and a no-deal ends in a refund plus a signed forget certificate.
>
> **What this build proves (real, on testnet):** buyer-relative novelty pricing; contract-recomputed prices (the AI can only lower a price); on-chain verification of the enclave's ed25519 verdict and of NEAR AI receipts via `ecrecover`; yield/resume settlement with refunds and timeouts; forget-certificate hashes on-chain; Chain-Signature-derived Solana payout address; a real mainnet Intents quote with `dry: true`.
>
> **What is simulated (and labelled on-chain):** enclave attestation (local mode, not yet a Shade Agent on dstack); the AI relevance signer when no `NEARAI_API_KEY` is set (`ai_simulated` flag). No mainnet funds move.
>
> **Where it goes (vision, not built):** datasets priced by lift on the buyer's sealed eval; sealed eval sets; model weights rented without transfer; keys released via NEAR MPC Confidential Key Derivation; multi-vendor rooms; settlement via (Confidential) Intents. See `docs/VISION.md` *(only if Jay chooses to add it)*.
>
> **Prior art we build on and differ from:** NDAI Agreements (2502.07924), Conditional Recall (2510.21904), Information Bazaar (2403.14443), TBVH, NDAI TrustKit, DealProof, Mnemo, Turnkey data-brokerage. **Our claim is narrow:** pricing by buyer-relative marginal value plus a forget certificate plus NEAR-native settlement. AI escrow in a TEE is not new.

### 15.3 Tracks and framing tweaks

- Keep `privacy, swarms, agents, open`. **Don't** add `security`, which is ChainProof Guard's lane and is saturated (about 75 guard-like entries).
- In the X post, lead with the *buyer-relative* moment ("B knew it, so B paid nothing"), not "TEE escrow".

---

## 16. Sources

**Raw notes with full source lists and query logs:** `moonshot-notes/judges-theses.md` (53 queries/fetches), `moonshot-notes/papers.md` (43 searches + arXiv API verification of 49 IDs), `moonshot-notes/market.md` (43 searches + 6 fetches), `moonshot-notes/competitors.md` (43 searches + 11 fetches). Prior research: `near-blue-ocean.md` (~75 searches).

**NEAR primitives**

- NEAR One, MPC Confidential Key Derivation (2026-02-23): https://blog.nearone.org/research/2026/02/23/mpc-ckd.html
- Confidential Intents launch (2026-02-25): https://tools.prnewswire.com/en-us/live/20813/release/20260225EN95768
- IronClaw, Confidential GPU Marketplace, multimodal confidential inference (2026-02-23): https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace-and-multimodal-confidential-inference
- NEAR AI Cloud + Intel Trust Authority: https://near.ai/blog/near-ai-cloud-integrates-intel-trust-authority · NEAR AI Cloud private chat (2025-12-03): https://near.ai/blog/introducing-near-ai-cloud-private-chat
- Shade Agents docs: https://docs.near.org/ai/shade-agents/reference/agent-contract.md · quickstart warning: https://www.mintlify.com/near/docs/ai/shade-agents/quickstart
- Yield/resume: https://docs.near.org/smart-contracts/anatomy/yield-resume · NEAR Intents on DefiLlama: https://defillama.com/protocol/near-intents
- OutLayer vaults (CKD usage): https://outlayer.fastnear.com/docs/vaults

**Jay's builds**

- LETHE: https://github.com/jayanth-kumar-morem/lethe · ChainProof Guard: https://github.com/jayanth-kumar-morem/chainproof-guard

**Papers (all arXiv IDs verified via the arXiv API on 2026-11-11 unless noted)**

- Information economics: 2502.07924 (NDAI) · 2510.21904 (Conditional Recall) · 2603.19011 · 2403.14443 · 2604.08606 · 2412.18140 (instrumental value) · 2504.05563 (data valuations ≠ prices; Myerson) · 2502.00198 (Fairshare) · 2512.06033 (TIP) · 2510.18109 (PrivaDE) · 2406.11011 (In-Run Data Shapley) · 2606.05165 (STRIDE) · 2510.24990 (economics of AI training data) · 2509.25565 (information design with LLMs)
- TEEs: 2608.26575 (Blackwell CC) · 2509.18886 (CPU vs GPU TEE LLM inference) · 2505.16501 · 2507.02770 (GPU CC security) · 2606.11145 (OpenPCC) · 2602.11088 (partial TEE shielding broken) · 2508.08438 (KV-cache side channels) · 2605.03213 (survey) · 2409.03992 (H100 CC) · 2512.20176 (optimistic TEE rollups) · TEE.fail: https://thehackernews.com/2025/10/new-teefail-side-channel-attack.html
- Verifiability: 2501.16007 (TOPLOC) · 2602.17452 (Jolt Atlas) · 2601.15716 (zkFinGPT) · 2404.16109 (zkLLM) · 2510.16830 (VFT) · 2508.21393 (VeriLoRA) · 2511.02620 (weight-exfiltration detection) · 2508.19843, 2509.26598 (fingerprinting) · 2504.04715 (model substitution)
- FHE/MPC/PIR: 2601.18511 · 2505.07239 · 2501.06807 · 2509.21325 · 2609.03376 (Spruce)
- Forgetting: 2410.16454 · 2505.16831 · 2505.23270 · 2507.03619 · 2510.18554 (alignment-data extraction)
- Agents & payments: 2510.25779 (Magentic Marketplace) · 2602.06008 (AgenticPay) · 2610.20587 (FPA in agentic markets) · 2609.00060 · 2605.11781 · 2608.23858 · 2512.15892 (VET) · 2603.05786 (proof-of-guardrail) · 2509.10147 · 2512.08737 (Insured Agents)
- Evaluation & provenance: 2506.23706 (Attestable Audits) · 2403.00393 (TRUCE, not re-verified) · 2011.06458 (Golden Grain) · 2412.17847 (DPI) · 2604.24890 (C2PA) · 2408.07892 (personhood credentials)

**Judges & theses**

- https://a16zfrontier.com/posts/article/big-ideas-things-excited-about-crypto-2026 · https://data.electriccapital.com/posts/investing-in-user-owned-technology-26-opportunities-in-2026 · https://haseebq.com/2026-predictions/ · https://www.techflowpost.com/en-US/article/34518 (SECONDARY) · https://threadreaderapp.com/thread/1904249264861237261.html · https://www.theblock.co/post/403982/solana-infrastructure-firm-helius-acquires-light-protocol-expand-onchain-privacy · https://theblock.co/news/business/2026-10-15-helius-ceo-mert-mumtaz-joins-near-foundation-council-418656 · https://www.theblock.co/news/ecosystems/2026-10-07-nears-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912 · https://cryptonews.net/news/defi/32477937/ (SECONDARY) · https://cryptobriefing.com/kain-warwick-ai-will-initially-increase-hacks-in-defi-uniswaps-security-is-overestimated-and-the-trade-offs-of-blockchain-immutability-unchained/ · https://unchainedcrypto.com/how-morse-code-broke-an-ai-crypto-agent/ · https://www.kucoin.com/news/flash/a16z-cto-network-effects-not-code-will-be-ai-era-s-ultimate-moat (SECONDARY) · https://variant.fund/articles/agents-in-a-bazaar/

**Market** (see §5.1 for per-figure links)

- Burton-Taylor/FOW, Neudata, Inex One, ESOMAR/ResearchWorld, Dealroom/The Information (Mercor), Reddit 10-K via edgar.tools, Menlo Ventures, Gartner, Chainalysis, HackerOne, DefiLlama, AWS Marketplace fee docs, Deloitte AI insurance, Bloomberg Law (Bartz), WilmerHale (EU AI Act template), IP Commission.

**Competitors** (see §9.1)

- github.com/deepsp94/tbvh · github.com/discordwell/ndai-hackathon · github.com/kkoci/Dealproof · github.com/Eduardogbg/mnemo · docs.turnkey.com/solutions/verifiable-cloud/data-brokerage · superprotocol.com · oceanprotocol.com · iex.ec · vana.org · openledger.gitbook.io · lethe-protocol.github.io · VAST DataEnclave (blocksandfiles.com, 2026-09-22) · Sacra on Surge (SECONDARY) · TikTok ManaTEE: https://developers.tiktok.com/blog/ManaTEE-Enabling-Verifiable-AI-Transparency

**Method and honesty notes**

- Several judge quotes come from translations or aggregators and are marked SECONDARY. Check them against the originals before putting them on slides.
- Market TAM/SAM/SOM are my estimates from sourced inputs. Segments overlap.
- About 20 lower-priority competitor names (Zama, Inco, Arcium, Fortanix, etc.) were checked from prior knowledge only.
- A single-source report of a "$6.3B Binance hack (Oct 2026)" was deliberately **excluded** as unverified.
