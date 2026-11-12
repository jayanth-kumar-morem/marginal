# Competitor re-verification for SPEC.md (Marginal), November 2026

Prepared 2026-11-11. Research only: nothing was built, posted, contacted or signed up for. This file updates `moonshot-notes/competitors.md` and MOONSHOT §9.

**Conventions**
- Source labels: **(P)** PRIMARY (the company's own site, docs, GitHub, press release); **(S)** SECONDARY (press, aggregators, analysts); **(U)** UNVERIFIED (a single low-authority source, a forum post, or a claim seen only in a search snippet without a confirmable page).
- "Observed" is 2026-11-11 for every row unless a row says otherwise. The *status date* is the date of the latest evidence (last commit, announcement, or post).
- Flag column order is **BR / S2 / UR / FC / XC / MW**:
  - BR = buyer-relative pricing
  - S2 = two-sided sealing
  - UR = use-rights, not copies
  - FC = forget certificate
  - XC = cross-chain settlement
  - MW = model weights as a good
- Flag values: Y = has it; P = partial or claimed; N = lacks it. For FC, P means wipe or deletion *without* a signed certificate.
- Method: 45 WebSearch calls, 10 WebFetch calls (one failed), plus about 52 GitHub REST API and curl HTTP checks (§5).

---

## 0. What this changes for SPEC.md (read first)

1. **The forget-certificate novelty claim must be narrowed.** The now-offline **Lethe protocol** published a working proof of protocol (archived 2026-04-09):
   - flow: "Submit → Audit → Erase → Prove → Settle";
   - a "Proof of Erasure — NIST 800-88 + ECDSA signature";
   - "zkPoE v2 — O(1) on-chain verification via Groth16";
   - "LetheEscrow — Base Sepolia — Live on Testnet";
   - but "Real TEE Hardware (SGX/SEV)" was only "Planned".

   That is a signed erasure proof, verified on-chain, inside a settlement flow. A whitepaper also describes TEE-generated, anchored "Verifiable Key Erasure Attestations" (§2.3). What remains defensible: **a no-deal certificate bound to a real TEE attestation (enclave measurement and input hashes), issued by a two-sided appraisal room, and portable across chains.**
2. **Buyer-relative pay-for-lift already exists as a commercial term.** Surge AI's own site says: "Train first. Pay if it works." / "Train on the full dataset first, and pay only if it improves your metrics." (§4).
   - This is the best primary evidence of demand.
   - It also means BR alone is not novel.
   - Surge solves the inspection paradox with **trust plus a full copy**: only Trusted Program labs qualify, and they receive the whole dataset before paying.
   - Marginal's defensible claim is BR **without handing over the copy**, measured neutrally in a sealed room and priced by a mechanism rather than a binary pay/no-pay.
3. **A frontier lab has shown two-sided sealing of model × private eval.** Google DeepMind's double-blind evaluation pilot (2026-08-27, Google Cloud Confidential Space) states: "The evaluator cannot see the Gemini model weights, and Google cannot see the evaluator's test prompts." It has no pricing and no market. This validates Marginal's appraisal-room technique and shows that big labs can build it in-house.
4. **Status changes:**
   - Opaque is winding down and its team is joining Anthropic.
   - Nillion's "Encrypted Markets" turned out to be sealed *trade instructions*, not information goods.
   - Turnkey TVC is still in private beta and still has no pricing step.
   - Super Protocol still has no pricing or appraisal.
   - iExec's Bellecour chain is retired; Nox is on testnet.
   - No evidence that Ocean Market was sunset.
   - Vana has pivoted toward personal data servers.
   - VAST DataEnclave GA is still a Q1 2027 plan.
5. **All five open implementations are testnet-only.** Four have had no commits since March to June 2026. DealProof is still moving on side branches, pivoting into vertical "attested credential" products.
6. **"Leakage budget":** no product or paper using the term was found. The NDAI paper discusses unavoidable partial leakage and budget caps for agent *errors*, not a priced leakage budget (§2.3). The claim survives this check.
7. **Name:** "Marginal" collides with a DeFi leverage protocol (marginal.network). It looks dormant, but it is in the same field. A formal clearance search is needed. "Lethe" is crowded (§3).
8. **NEAR:**
   - No NEAR team shipped a marketplace with buyer-side evaluation in 2026.
   - The closest overlap is the revamped **Agent Market** (planned early Q3 2026; launch not confirmed).
   - **NEAR AI disclosed a breach on 2026-11-09/10** (an SGLang remote-code-execution flaw). The threat model must address it (§2.2).

---

## 1. Updated competitor table

### 1a. Commercial and protocol players

| Product | What it does (1–2 lines) | Status as of observed date | BR/S2/UR/FC/XC/MW | Change vs competitors.md | URL | Source type |
|---|---|---|---|---|---|---|
| **Turnkey Verifiable Cloud: data-brokerage pattern** | Seller corpus is encrypted to a quorum key that reconstructs only inside an attested AWS Nitro enclave. The pipeline dedupes, scrubs and scores, and the page says it will "Run the buyer's evaluation against the corpus without exposing either side to the other". The buyer verifies an App Proof, then pays. | Page live, no date on it. The call to action is contact-us / "free system design consultation". **No pricing, auction or price-setting step**: scores are metrics "the buyer relies on to price the dataset". TVC itself is "Private Beta" (waitlist); the beta was announced 2025-11-12; no GA found. Early beta customer: Anchorage Digital. | P / Y / N / N / N / N | Same substance. Confirmed not GA and no pricing. BR is downgraded from Y to P because Turnkey evaluates against the buyer's eval but does not price on it. | (P) https://docs.turnkey.com/solutions/verifiable-cloud/data-brokerage ; (P) https://docs.turnkey.com/features/verifiable-cloud/overview ; (P) https://www.turnkey.com/blog/introducing-turnkey-verifiable-cloud-private-beta ; (S) https://aws.amazon.com/blogs/architecture/how-anchorage-digital-and-turnkey-verify-code-with-aws-nitro-enclaves/ | PRIMARY |
| **Super Protocol** | Confidential AI cloud (Intel TDX plus NVIDIA CC). Its Marketplace offers "One-click confidential apps, models and datasets", and a Confidential Router API serves models. Owners never expose their assets. | Live. **Self-reported cumulative totals:** 50+ organisations, 2,000+ confidential deployments, 250,000 GPU-hours in confidential mode, 1M+ patients' records. Pricing bundles confidentiality into GPU-hour and token rates. Provider programme: 5.5% revenue share, 0% for the first 90 days. Its "free evaluation" is a 1–2-day workload test with up to $1,000 credit, i.e. a pilot, not an appraisal of goods. **No valuation, appraisal or auction.** Latest dated blog post: 2026-11-10. | N / P / Y / N / N / Y | Numbers are consistent with competitors.md. New: 50+ orgs, 1M+ patient records, 5.5% revenue share, Confidential Router. Messaging has tilted toward regulated (healthcare) data. The "Super Protocol adds pricing" threat has **not** materialised. | (P) https://superprotocol.com/ | PRIMARY (self-reported) |
| **Ocean Protocol** (C2D, Ocean Market, Ocean Nodes) | Data NFTs and datatokens. Compute-to-Data runs the algorithm where the data sits; C2D is now delivered through Ocean Nodes. | Withdrew from the ASI Alliance on **2025-10-09** (S). **No evidence that Ocean Market was sunset:** market.oceanprotocol.com returns HTTP 200 and the HTML contains no sunset or deprecation text; the `oceanprotocol/market` repo is not archived (last push 2026-04-04). `ocean-node` and `ocean.js` were pushed 2026-11-10. | N / N / Y / N / P / N | ASI exit confirmed and dated. No source supports a "sunset"; development activity has moved to Ocean Nodes. The Ocean blog was not checked. | (S) https://www.theblock.co/post/373977 ; (P) https://github.com/oceanprotocol/market ; (P) https://github.com/oceanprotocol/ocean-node ; (P) https://market.oceanprotocol.com | PRIMARY (GitHub, site) + SECONDARY (exit) |
| **iExec** | TEE off-chain compute marketplace (apps, datasets, workers). Pivoting to **Nox**, a confidential-DeFi layer: ERC-7984 confidential tokens wrapping ERC-20s, running in measured TEEs on dstack. | Bellecour sidechain sunset (iExec post). Ethereum bridge closed 2026-07-02 (S). Nox docs are marked "under development"; Nox was on Ethereum and Arbitrum **testnets** as of Sep 2026, with mainnet planned (S). iExec's 2026 posts centre on confidential DeFi and RWA, not data markets. | N / P / Y / N / P / N | Pivot confirmed by a primary source, with dates added. A cautionary precedent for confidential data markets. | (P) https://www.iex.ec/academy/closing-a-chapter-opening-a-new-era ; (P) https://docs.iex.ec/nox-protocol/getting-started/welcome ; (S) https://www.securities.io/ko/investing-in-iexec-rlc-rlc-everything-you-need-to-know/ ; (S) https://phala.com/posts/iexec-dstack-nox-chain-of-trust | PRIMARY + SECONDARY |
| **Vana** | DataDAOs / DLPs. Proof-of-Contribution runs on Satya TEE validators (TDX). Each DLP defines its own PoC; the docs suggest a model influence function. Consumers buy and burn DLP tokens with VANA to get access. DataDAO rewards require VRC-15 and the Data Access Architecture. | Live. In 2026 the product emphasis moved to **personal data portability** (DataConnect Feb 2026; Personal Server and memory upgrades Jul 2026, per a Vana blog listing seen only in a search snippet (U)). The `vana-com` GitHub org is very active: `vana-cli`, `personal-server-ts` and `vana-sdk` were pushed 2026-11-11. | P / P / P / N / N / N | PoC is unchanged. Emphasis has shifted from pooled DataDAOs to personal servers. Value is still measured against the pool or model, not the buyer. | (P) https://docs.vana.org/docs/proof-of-contribution ; (P) https://docs.vana.org/docs/migration-guide-updating-your-datadao-for-rewards ; (P) https://github.com/vana-com | PRIMARY |
| **OpenLedger** (Proof of Attribution) | Records dataset and model lineage on-chain and routes rewards to contributors when their data is used. Community datasets are called Datanets. | OPEN mainnet launched 2025-11-18 (S). Claimed 2026 updates (an attribution-engine update in Jan, x402 open-sourced in Feb, LayerZero plans) appear only in Binance Square posts and blogs (U). The public GitHub org was last pushed 2026-06-13. | P / N / Y / N / N / P | No verified change. | (S) https://www.theblock.co/post/379216/polychain-openledger-open-mainnet ; (P) https://github.com/OpenLedger-xyz ; (U) https://www.cryptonewsnavigator.com/academy/article/openledger-built-a-platform-most-crypto-users-never-heard-of | SECONDARY (2026 claims UNVERIFIED) |
| **Nillion** ("Encrypted Markets") | A user "seals an instruction to a condition" and posts it on-chain; it stays unreadable, even to the network, until the condition is met. The primitive is called Covenants. Seven-phase roadmap from Aug 2026 to Feb 2028. | Roadmap post dated **2026-08-12** (P). Phase 1, "Dusk", Sep 2026: **sources conflict.** Cryptonomist says Ethereum mainnet on 28 Sep; Crypto Ninjas says Sepolia testnet. "Darkfall" (Nov 2026 to Feb 2027) extends to EVM chains (S). GitHub active (`nilvm` pushed 2026-11-09). | N / N / N / N / P / N | The "Encrypted Markets" claim is now verified, but it means **sealed conditional trade instructions**, not information goods, and there is no appraisal. Downgrade from "possible future competitor" to "adjacent primitive". | (P) https://nillion.com/news/the-road-to-encrypted-markets/ ; (S) https://en.cryptonomist.ch/2026/08/12/encrypted-markets-roadmap-privacy/ ; (S) https://www.cryptoninjas.net/news/nillions-dusk-launches-encrypted-markets-hiding-50k-eth-trades-until-triggered/ ; (S) https://coinmarketcap.com/cmc-ai/nillion/latest-updates/ | PRIMARY + SECONDARY |
| **Phala Cloud / dstack** | Confidential VMs and GPU TEEs (H100, H200 and B300; B200 also listed). Has "Confidential Training" and "Fine-Tuned Models" solution areas, and offers reserved H200/B300 capacity "for private AI training and inference". | Live. `Phala-Network/phala-cloud` and `Dstack-TEE/dstack` were pushed 2026-11-11. No public description of the training workflow or its pricing was found. | N / P / P / N / P / P | Adds B300 and an explicit private-training offer. Still infrastructure that Marginal can use. | (P) https://phala.com/ ; (P) https://phala.com/posts/gpu-tee-is-launched-on-phala-cloud-for-confidential-ai ; (P) https://github.com/Dstack-TEE/dstack | PRIMARY |
| **VAST Data DataEnclave** | Runs proprietary models on regulated enterprise data inside NVIDIA Confidential Computing (Hopper, Blackwell, Rubin). Infrastructure admins cannot access customer keys or model weights. Attestation uses the CNCF Trustee stack or Fortanix. | Announced **2026-09-22**; in preview; **GA planned Q1 2027**. Named partners include Cohere, CrowdStrike, Deepgram, Cisco and Supermicro. | N / Y / Y / N / N / P | Unchanged. Adds the attestation options. GA is still a plan. No VAST primary page was fetched. | (S) https://www.blocksandfiles.com/ai-ml/2026/09/22/vasts-dataenclave-protects-private-enterprise-data-and-ai-model-builders-weights/5298161 ; (S) https://www.storagereview.com/news/vast-dataenclave-runs-ai-models-on-regulated-data-inside-nvidia-confidential-computing-ships-q1-2027 ; (S) https://thenewstack.io/vast-dataenclave-confidential-computing/ | SECONDARY |
| **Opaque Systems** | Confidential AI platform for enterprise agents (Opaque Studio, Confidential MCP). | **Winding down.** opaque.co is shown "as it appeared on opaque.co in October 2026" and says: "Our team is joining Anthropic to carry our work forward" and "OPAQUE Systems is winding down its operations". The open-source work continues at AgenTrust. GPTS24 dates the agreement to 2026-10-13 (S); Softonic's article is dated 2026-10-19 (S). Reported: the CEO and CTO join Anthropic (S). | N / P / P / N / N / N | **Source conflict resolved as far as public sources allow.** The primary page supports "team joins Anthropic; company winds down". It does **not** say "acquisition". Constellation Research frames the deal as a licence plus acqui-hire; SecurityWeek and most outlets say "acquires". Terms are undisclosed and no Anthropic statement was found this session. Spec wording: *"Opaque wound down in Oct 2026; its team joined Anthropic (reported as a licence-and-acqui-hire; terms undisclosed)."* Remove Opaque as an independent competitor. GPTS24's link to an Anthropic IPO is UNVERIFIED. | (P) https://www.opaque.co/ ; (S) https://www.constellationr.com/insights/news/anthropic-acquires-opaque ; (S) https://www.securityweek.com/anthropic-acquires-confidential-ai-startup-opaque-systems/ ; (S) https://www.gpts24.com/en/news/anthropic-acquires-opaque-systems-adding-cryptographic-ai-attestation-ahead-of-ipo ; (S) https://en.softonic.com/articles/anthropic-acquires-opaque-systems-confidential-computing-moves-in-house | PRIMARY + SECONDARY |
| **EQTY Lab** | Verifiable Compute: TEE-attested certificates for AI operations, anchored on Hedera. In 2026 it added "Verifiable Runtime" for agents on the NVIDIA Enterprise AI Factory and OpenShell, using NVIDIA CC and BlueField DPUs. | Live. Verifiable Runtime announced **2026-03-18** (GTC 2026). | N / N / N / P / N / N | New 2026 product. Still no forget certificate, but it is the nearest commercial certificate machinery. | (P) https://www.businesswire.com/news/home/20260318888449/en ; (S) https://hedera.com/blog/eqty-labs-verifiable-compute-brings-trust-to-ai-with-hedera | PRIMARY (press release) |
| **DATA Foundation (ex-Story Protocol) / Poseidon** | Story rebranded on **2026-06-25** to the DATA Foundation: a DATA Network chain, $IP migrating 1:1 to $DATA, and a focus on AI-training-data provenance and licensing. Products: the Trace registry; Poseidon, which "cleans, normalizes and scores raw human data for quality and authenticity before it reaches a buyer"; a Kled integration; Numo. | Rebrand complete. Trace is described as launching, but no launch was confirmed. Andrea Muttoni named CEO (S). | N / N / N / N / N / N | Details added. Poseidon's score is a seller-side quality score, not buyer-relative. No foundation primary page was fetched. | (S) https://www.theblock.co/post/406175/story-becomes-data-foundation-shifts-focus-to-ai-training-data ; (S) https://decrypt.co/372107/story-protocol-rebrands-data-network-ai-training-pivot ; (S) https://cointelegraph.com/news/story-protocol-pivots-to-ai-with-rebrand-to-data-foundation | SECONDARY |
| **Human Native AI → Cloudflare** | UK AI-data marketplace where creators prepare, price and license content. Cloudflare acquired it to help creators "effectively price and monetize" content for AI. | Acquisition press release dated **2026-01-15** (P). One aggregator claims a "Cloudflare Data Hub" for H2 2026 (U). No new marketplace launch confirmed. | N / N / P / N / N / N | Primary source added. Nothing launched since. | (P) https://www.cloudflare.com/press/press-releases/2026/cloudflare-strengthens-content-offering-to-ai-companies-with-acquisition-of-human-native/ ; (P) https://blog.cloudflare.com/human-native-joins-cloudflare/ ; (U) https://rallies.ai/news/cloudflare-acquires-human-native-to-build-pay-per-use-ai-data-marketplace-and-tools | PRIMARY |
| **Snowflake Data Clean Rooms: ML Jobs** | Multi-party model training in clean rooms (XGBoost, LightGBM, PyTorch; GPU compute pools). "The advertiser's model code stays inside the collaboration boundary, invisible to the data providers." | **GA, announced Jul 2026.** Early users: VideoAmp and Kroger Precision Marketing. | P / P / Y / N / N / N | GA confirmed and dated. Both sides are protected, but by policy, not attestation. | (P) https://www.snowflake.com/en/blog/ml-jobs-snowflake-data-clean-rooms/ ; (P) https://docs.snowflake.com/en/user-guide/cleanrooms/ml-jobs | PRIMARY |
| **AWS Clean Rooms ML** | Lookalike and custom models trained on a partner's data without sharing it. Incremental and distributed custom training (Jul 2025); synthetic-dataset generation for custom ML training (Nov 2025). | Live. No 2026 ML update found. | P / P / Y / N / N / N | Dated features added. | (P) https://docs.aws.amazon.com/clean-rooms/latest/userguide/machine-learning.html ; (P) https://aws.amazon.com/about-aws/whats-new/2025/07/aws-clean-rooms-incremental-distributed-training-custom-modeling ; (P) https://aws.amazon.com/about-aws/whats-new/2025/11/aws-clean-rooms-synthetic-dataset-generation-custom-ml | PRIMARY |
| **Databricks Clean Rooms** | Clean rooms in which a data owner and an ML expert train models on sensitive data. In lookalike training, only the model output leaves. | Live. No 2026-specific ML announcement found. | P / P / Y / N / N / N | No change found. | (P) https://databricks.com/blog/privacy-centric-collaboration-ai-databricks-clean-rooms ; (P) https://databrickslabs.github.io/partner-architecture/data-collaboration/clean-rooms/use-cases | PRIMARY |
| **Google Private AI Compute** | Gemini processing in a "hardware-secured sealed cloud environment" on TPUs with Titanium Intelligence Enclaves and remote attestation. Data is "accessible only to you and no one else, not even Google". | Launched **2025-11-11**. Powers Pixel 10 Magic Cue and Recorder. The launch post names only Google's own features; no third-party offer is stated. 2026 status was not re-checked beyond that. | N / N / N / N / N / N | New row. Not a competitor, but evidence that attested sealed clouds are becoming mainstream on the consumer side. | (P) https://blog.google/technology/ai/google-private-ai-compute/ ; (S) https://www.theregister.com/2025/11/12/google_touts_private_ai_compute/ | PRIMARY |
| **Plurality** (on Oasis ROFL) | Portable AI context. Plans a "context marketplace" in which expert knowledge is bundled into packs that load into AI tools and are sold without the intermediary seeing them. Runs its MCP server on ROFL. | **Pre-launch**: the Oasis blog post (undated) says "more details coming soon". Claimed launch dates for a ROFL app marketplace (Q2 2026 or 18 Aug 2026) are unconfirmed (U). | N / P / P / N / N / N | Still pre-launch. | (P) https://oasis.net/blog/plurality-building-portable-ai-context ; (U) https://coinmarketcap.com/de/cmc-ai/oasis-network/latest-updates/ | PRIMARY (ecosystem blog) |
| **NEW: Surge AI, "Train first. Pay if it works."** | An AI data vendor's offer: "Labs in our Trusted Program can train on the full dataset" and "pay only when it moves the metrics that matter". The post-training page says: "Train on the full dataset first, and pay only if it improves your metrics." | Live on surgehq.ai. Sacra cites the off-the-shelf (OTS) page as dated 2026-09-10; the post-training page has entries dated "NOV 2026". Eligibility: Trusted Program labs only. Thresholds and terms are not published. | Y (binary pay/no-pay on the buyer's metric) / N / N / N / N / N | **New.** The buyer-relative pay-for-lift commercial term exists, delivered by trust and a full copy, without sealing. | (P) https://surgehq.ai/ots ; (P) https://surgehq.ai/post-training ; (S) https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/ | PRIMARY |
| **NEW: Google DeepMind double-blind evaluations** | Pilot in which a Gemini Flash Lite model was scored against confidential external benchmarks in Google Cloud **Confidential Space** (GPU enclave): "The evaluator cannot see the Gemini model weights, and Google cannot see the evaluator's test prompts." Partners: Singapore AISI, OpenMined, AVERI, MLCommons. | Pilot; blog dated **2026-08-27**. No pricing or plan to productise is stated. A related paper, arXiv 2611.12604 ("Double Blind Evals"), appeared in Nov 2026. | N / Y / P / N / N / P | **New.** A frontier lab built the core of Marginal's appraisal room (model × private eval, two-sided) as a safety-audit tool. | (P) https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/ ; (P) https://arxiv.org/html/2611.12604 | PRIMARY |
| **NEW (row): OpenMined network and subnets** | A non-profit "public network for non-public information". Owners decide who may use their data, for what purpose, and "under which privacy, attribution, or pricing rules", and the network enforces those rules. An earlier case study hosted both the model and the dataset in one enclave, with certificates proving that only the agreed code ran. | Network and subnet programme live ("selectively partnering"). A 2026 NIST CAISI collaboration on confidential evaluation is reported (S); one source dates it 2026-04-09 (U). | N / P / Y / N / N / P | New row. The closest non-crypto network for rule-governed, priceable access to private data. No buyer-relative pricing. | (P) https://openmined.org ; (P) https://openmined.org/foundation/ ; (P) https://openmined.org/launch-subnet/ ; (P) https://openmined.org/blog/secure-enclaves-for-ai-evaluation/ ; (S) https://www.executivegov.com/?p=282082 ; (U) https://agentscout.pages.dev/policy/ai-regulation/news/20260409-nist-caisi-openmined-crada/ | PRIMARY + SECONDARY |
| **NEW (row): NEAR Agent Market (revamp)** | See §2.2. A directory of independent agents hired per job. A company "connects its data once" and every agent it hires gets permissioned access, with escrow, identity checks, billing and disputes. | Planned for early Q3 2026 in NEAR's Q2 2026 update. **Launch not confirmed.** | N / N / P / N / P / N | New row. The closest NEAR-native overlap, but it has no appraisal or buyer-relative pricing. | (P) https://www.near.org/blog/the-state-of-near-q-2-2026 | PRIMARY |

### 1b. Open implementations (GitHub REST API, 2026-11-11)

| Product | What it does (1–2 lines) | Status as of observed date | BR/S2/UR/FC/XC/MW | Change vs competitors.md | URL | Source type |
|---|---|---|---|---|---|---|
| **TBVH** (deepsp94) | The buyer posts a request with a USDC budget. Buyer and seller agents (DeepSeek via RedPill) negotiate in Phala TDX. A DKIM email proof gives authenticity, and a TEE-signed EIP-712 message settles to escrow. | Created 2026-03-18; **last commit 2026-04-09** ("Docs overhaul"). **Testnet**: Base Sepolia (chain 84532) with a mock USDC. The README notes that "in this testnet version" the contract owner can replace the TEE signer at any time. 0 stars. Demo: tbvh-puce.vercel.app. | P / P / N / P / N / N | Dormant for 7 months; testnet only. | (P) https://github.com/deepsp94/tbvh | PRIMARY |
| **NDAI TrustKit** (discordwell) | Implements the NDAI paper: Nash bargaining between agents, Shamir-split keys, sealed exploit verification. Supports Nitro and dstack TEEs. | Created 2026-03-16; **last commit 2026-06-19** ("fix: two correctness/security bugs found in a subsystem audit"). `TEE_MODE=simulated` is the default. Escrow on Base and Ethereum **Sepolia**. 2 stars. | N / P / N / N / N / N | Quiet since June; testnet only. | (P) https://github.com/discordwell/ndai-hackathon | PRIMARY |
| **DealProof** (kkoci) | "Two Claude agents negotiate private data access inside a Confidential VM (dstack/Intel TDX), with smart contract payment release on cryptographic agreement." | Created 2026-03-14. Default branch last commit 2026-07-10. **12 branches; newest push 2026-10-05** (`vertical/hr-offer-check`). Others include `product/deal-room`, `product/dev-credential` (2026-07-12), `vertical/procurement-ai` (2026-07-15), `product/fundraising-credential`, `product/continuous-soc2`, and `dataset_enhancement` (2026-06-16, commit: "DataQualityAgent — TEE-attested dataset quality credential injected into agent prompts and TDX quote"). Escrow `DealProof.sol` on **Sepolia**. 5 stars. | N / P / P / N / N / N | The only repo still moving. It is pivoting to vertical "attested credential" products and has added a *seller-side* dataset-quality credential, which is not buyer-relative. | (P) https://github.com/kkoci/Dealproof | PRIMARY |
| **Mnemo** (Eduardogbg) | Escrow-gated bug disclosure in a Phala TDX room, with a TEE arbiter and ERC-8004 reputation. | Created and **last committed 2026-03-23**. README: "Live on Base Sepolia" (MnemoEscrow 0x22Fd1c1cbF21c17627239dB5f59bfb5FE371F6da); attestation is "simulated in demo, real in CVM deployment". 2 stars. | N / P / N / P / N / N | Dormant since its hackathon. | (P) https://github.com/Eduardogbg/mnemo | PRIMARY |
| **Sealed Trade Protocol** (ShotaNagafuchi) | Bonded negotiation with slashing on walk-away and a fee vault. | Created 2026-05-11; **last commit 2026-06-01**. **Sepolia** testnet demo with an open-mint MockUSDC. Per competitors.md, the TEE runtime has not been built. | N / N / N / P / N / N | Dormant since June. | (P) https://github.com/ShotaNagafuchi/sealed-trade-protocol | PRIMARY |

None of the five is on mainnet.

### 1c. The Flashbots / Andrew Miller circle, and the Lethe protocol

| Product | What it does (1–2 lines) | Status as of observed date | BR/S2/UR/FC/XC/MW | Change vs competitors.md | URL | Source type |
|---|---|---|---|---|---|---|
| **"Conditional Recall"** (Christoph Schlegel, Xinyuan Sun) | Game theory of agents that can *commit to forget*. LLMs implement it through context segmentation, and TEEs make the commitment credible. | A paper, listed in Flashbots' mev-research publications as **2025-10-24**. **No 2026 Flashbots demo or product found.** | n/a (concept; FC conceptual) | Re-dated to the Oct 2025 paper. The "demo" was not found in 2026 sources. | (P) https://arxiv.org/html/2510.21904 ; (P) https://github.com/flashbots/mev-research/blob/main/publications.md | PRIMARY |
| **Andrew Miller, 2026 GitHub work** | Three relevant repos: <br>• `tee-negotiator`: "An encumbered LLM agent: arena session token held inside a TEE, every action gated by a policy constant in the attested source" <br>• `awesome-private-inference`: "Public automated registry of TEE-verified inference providers — L2Beat for private AI" <br>• `abalone`: a TEE private-inference "privacy shell" <br>He also has `oem-anoint`, `stoffel-tee-runner` and several `dstack-*` repos. | Pushes: `tee-negotiator` created and pushed 2026-08-05; `awesome-private-inference` 2026-11-10; `abalone` 2026-10-30. **All research repos; none is a data or knowledge market.** | tee-negotiator: N / P / N / N / N / N | New 2026 items, but no market product. `awesome-private-inference` could become a neutral registry that Marginal's rooms list in. | (P) https://github.com/amiller/tee-negotiator ; (P) https://github.com/amiller/awesome-private-inference ; (P) https://github.com/amiller/abalone | PRIMARY |
| **Lethe protocol** (lethe-protocol.github.io) | Erasure-based security-audit market. "Information erasure as the ultimate primitive of trust." Flow: "Submit → Audit → Erase → Prove → Settle. Inside the TEE. Nothing leaves." It offers "Proof of Erasure — NIST 800-88 + ECDSA signature" and "zkPoE v2 — O(1) on-chain verification via Groth16". Only encrypted results reach the requester. | The archived site (2026-04-09) lists: PoE "Live on Testnet"; zkPoE v2 Groth16 circuit "Live on Testnet"; "LetheEscrow — Base Sepolia — Live on Testnet"; Multi-Agent Competition Market, 3-tier dispute escalation and "Real TEE Hardware (SGX/SEV)" all "Planned". It calls itself "a working proof of protocol". **Now offline:** root and /vision return HTTP 404 (2026-11-11). The GitHub login `Lethe-Protocol` is now a *user* account created 2026-10-04 with 0 public repos, so the original repos (including `lethe-market`) no longer resolve. **Who is behind it:** no names, affiliations or handles appear on the archived page. The "Flashbots-adjacent" label in competitors.md is **UNVERIFIED** (no supporting source found). | N / P / P / **Y (testnet; TEE simulated)** / N / N | **Upgraded from "name collision" to "prior art for the forget certificate":** a signed, zk-verified erasure proof inside an escrow settlement flow. The site has since gone offline. | (P, archived) http://web.archive.org/web/20260409212333/https://lethe-protocol.github.io/ ; (P) https://github.com/Lethe-Protocol | PRIMARY (archived copy) |

---

## 2. New entrants found

### 2.1 Since mid-2026 (or newly relevant)

| Entrant | Date | What | Why it matters for Marginal | URL | Source |
|---|---|---|---|---|---|
| **Surge AI "Train first. Pay if it works."** (Trusted Program) | OTS page cited by Sacra as 2026-09-10 | Labs train on the full dataset and pay only if their metrics improve | The strongest primary evidence of pay-for-lift demand, and an incumbent already offering BR terms (§4) | https://surgehq.ai/ots ; https://surgehq.ai/post-training | PRIMARY |
| **Google DeepMind double-blind evaluations** | 2026-08-27 | Model × private benchmark scored in a Confidential Space GPU enclave; neither party sees the other's asset | Demonstrates S2 for evals at a frontier lab. Labs can build the room in-house; Google Cloud Confidential Space is a credible rail | https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/ | PRIMARY |
| **"Double Blind Evals: Resolving the Dual Confidentiality Dilemma in AI Safety Auditing"** | Nov 2026 (arXiv 2611.12604) | Paper formalising dual-confidentiality evaluation | Cite in the spec as academic grounding for S2 | https://arxiv.org/html/2611.12604 | PRIMARY (paper) |
| **NEAR Agent Market revamp** | Planned early Q3 2026 | Agents hired per job; the company "connects its data once" and every hired agent gets permissioned access; escrow, identity, billing, disputes | NEAR-native overlap on "agents + private data + escrow", with no valuation layer. Launch not confirmed | https://www.near.org/blog/the-state-of-near-q-2-2026 | PRIMARY |
| **Nillion Encrypted Markets / "Dusk"** | 2026-08-12 roadmap; Dusk Sep 2026 | Sealed conditional on-chain instructions ("Covenants") | Adjacent primitive (conditional unlock); not an information-goods market | https://nillion.com/news/the-road-to-encrypted-markets/ | PRIMARY |
| **Andrew Miller `tee-negotiator`; `awesome-private-inference`** | 2026-08-05; active 2026-11-10 | Encumbered LLM agent in a TEE; an automated registry of TEE-verified inference providers | The research circle is building encumbered-agent and verification primitives, not markets | https://github.com/amiller/tee-negotiator ; https://github.com/amiller/awesome-private-inference | PRIMARY |
| **Proximal** (coding training data and RL infrastructure) | Out of stealth Sep 2026 | $15M seed led by General Catalyst at a $300M valuation; the CEO claims more than $200M annualised revenue and profitability | A new large demand-side vendor. Contract terms are undisclosed; no pay-for-lift evidence | https://dealroom.co/news/157682-proximal-exits-stealth-with-15m-seed-as-revenue-tops-200m/ ; https://sacra.com/c/proximal/ | SECONDARY |
| **DealProof vertical branches** | Jun to Oct 2026 | A TEE-attested dataset-quality credential, plus HR-offer, procurement, fundraising and SOC2 credential products | Open-source agents-in-TEE work drifting toward attested credentials, not markets | https://github.com/kkoci/Dealproof | PRIMARY |
| **Snowflake ML Jobs in Data Clean Rooms** | GA Jul 2026 | Multi-party training; model code invisible to data providers | The enterprise default for "train my model on your data" | https://www.snowflake.com/en/blog/ml-jobs-snowflake-data-clean-rooms/ | PRIMARY |
| **AlphaSense AI-led expert calls; 300k+ transcript library** | Sep 2026 product update | AI-led calls; Generative Search over expert transcripts. Transcripts enter the library after a 14-day (public companies) or 90-day (private) delay, which buyers can pay to shorten | Substitute for knowledge goods; time-based price discrimination already exists (§4.3) | https://help.alpha-sense.com/hc/en-us/articles/55980474097555-AlphaSense-Product-Updates-September-2026 ; https://help.alpha-sense.com/hc/en-us/articles/49288197594515-AI-Led-Expert-Calls | PRIMARY (seen via search snippets) |
| **Private-benchmark vendors: Vals.ai, Ambiguity Labs** | Undated; may predate mid-2026 | Private, expert-built evaluation suites, kept held out and refreshed | Possible *sellers* of eval sets on Marginal, or substitutes for it | https://www.vals.ai/home ; https://ambiguitylabs.in/ | PRIMARY |
| (Adjacent, H1 2026) **Interloom** | 2026-03-23 | $16.5M to capture enterprises' tacit knowledge for agents | Knowledge-capture substitute, not a market | https://fortune.com/2026/03/23/interloom-ai-agents-raises-16-million-venture-funding/ | SECONDARY |
| (Adjacent, H1 2026) **Pyth Data Marketplace; impact.com Geodesix** | Apr 2026; 2026-01-28 | Licensed data marketplaces (copies, no sealing) | More licensing venues; still built on the "free sample" inspection model | https://www.tradeweb.com/newsroom/media-center/in-the-news/pyth-network-announces-seven-new-institutional-data-publishers-as-it-launches-pyth-data-marketplace-enabling-finacial-data-distribution-across-blockchains/ ; https://www.businesswire.com/news/home/20260128556786/en/impact.com-Launches-Geodesix-a-New-Data-Marketplace-Connecting-Premium-Publishers-With-AI-Systems | SECONDARY / PRIMARY |

**Searched for and NOT found:**
- **No startup that lets a buyer test a dataset or model against the buyer's own eval inside a TEE before paying**, beyond Turnkey's consult-led pattern. Surge offers the same commercial outcome without a TEE.
- No new TEE information market for agents launched in Sep–Nov 2026.
- No marketplace for renting model weights with sealed fine-tuning beyond Super Protocol and VAST.
- No buyer-specific dataset-valuation startup; only academic work, e.g. arXiv 2411.00745 and 2605.16704 (Convex Dataset Valuation for Post-Training).

### 2.2 NEAR ecosystem overlap (2026)

- **NEAR AI Cloud** (launched Dec 2025): TDX and NVIDIA CC inference. This is Marginal's substrate. (P) https://www.businesswire.com/news/home/20251203353584/en/NEAR-AI-Launches-NEAR-AI-Cloud-and-Private-Chat
- **IronClaw and the Confidential GPU Marketplace** (early 2026; MOONSHOT says Feb, one secondary source says Mar). A compute marketplace, not a data marketplace. (P) https://near.ai/blog/near-ai-launches-ironclaw-confidential-gpu-marketplace
- **NEAR AI Red and the cybersecurity models** (2026-10-29): abliterated DeepSeek V4.1 Flash and Qwen 3.8 offered to security teams with TEE inference. This is adjacent to Marginal's exploit vertical; the buyer side (security teams) is being courted by NEAR AI directly. (P) https://near.ai/blog/cybersecurity-models-and-near-ai-red-launch
- **Agent Market revamp:** see §1a. Planned early Q3 2026 with permissioned data access and escrow; launch not confirmed. (P) https://www.near.org/blog/the-state-of-near-q-2-2026
- **Security incident, disclosed 2026-11-09/10 (S).** This is threat-model input, not a competitor.
  - What happened: an SGLang remote-code-execution flaw gave an attacker code execution on one inference server. From there the attacker reached an internal system behind the deprecated Private Chat feature.
  - Data exposed: account details of about 100 users; 18 legacy agents that were **not** running in a TEE; two customers' Cloud API keys (now revoked).
  - Response: Private Chat suspended; Cloud access paused, then restored.
  - Some coverage says confidential-mode requests on the compromised server "could have been visible". **Verify this against NEAR AI's own incident report**, which was not fetched.
  - Sources: (S) https://www.theblock.co/news/defi/2026-11-10-near-ai-security-breach-437002 ; (S) https://www.cryptotimes.io/2026/11/10/near-ai-confirms-breach-exposed-user-data-and-access-to-18-ai-agents/
- **Verdict:** nothing that NEAR AI or NEAR ecosystem teams shipped in 2026 resembles a data, model or knowledge marketplace with buyer-side evaluation. The hackathon entries in competitors.md (BlindBench etc.) remain the closest NEAR-native overlap. Searches were limited (two queries), so this is a scoped "not found", not proof of absence.

### 2.3 Forget-certificate and leakage-budget checks

- **Forget-certificate prior art found:**
  - **Lethe protocol PoE / zkPoE** (above): testnet, TEE simulated.
  - **Chain of Awareness whitepaper**: "Verifiable Key Erasure Attestations, timestamped and anchored", with the TEE generating the proof and publishing a key-burn record; a phase-1 proof of concept only. (U) https://medium.com/a-chain-of-awareness-around-the-worl/chain-of-awareness-the-whitepaper-for-verifiable-decentralized-ai-memory-e13d9bbc3a01
  - **Signed-erasure GitHub projects**, no TEE or chain: (U) https://github.com/StephenSook/erasure-proof ; (U) https://github.com/dsk-dev-ai/erasureproof
  - **GDPR erasure-attestation product category**: (U) https://sectum.ai/erasure-attestation/
  - **Conclusion:** "signed erasure proof" is not new. "Attestation-bound no-deal certificate from a two-sided appraisal room, portable cross-chain" was not found.
- **Leakage budget:** no product or paper uses the term.
  - The NDAI paper notes that when leakage is unavoidable, partial disclosure still improves welfare; its "budget caps" bound agent *errors*: (P) https://arxiv.org/html/2502.07924v1
  - The NDAI follow-up studies agents' response to TEE evidence: (P) https://arxiv.org/html/2603.19011
  - **Conclusion:** the claim survives this check (a single query, so low confidence).
- **Threat-model note:** a 2026 survey lists **TEE.fail** (a DDR5 memory-bus interposition attack). (P, paper) https://arxiv.org/pdf/2606.13892

---

## 3. Name-collision findings

Public web only. No logged-in trademark databases were searched.

### 3a. "Marginal"

| Name | What | Status (observed 2026-11-11) | Risk | URL | Source |
|---|---|---|---|---|---|
| **Marginal** (marginal.network) | "A permissionless DeFi hyperstructure. Trade anything with leverage. Fully onchain." A leveraged spot and perpetuals DEX: a peer-to-pool AMM using Uniswap V3 oracles. CB Insights: pre-seed; HQ Grand Cayman; investors include Acme, Tenzor Capital, Cogitent Ventures and NxGen. Ran a Cantina bounty. | The site is up, but **app.marginal.network returned HTTP 402**. The GitHub org `MarginalProtocol` was last pushed **2025-03-26** (`v1-core` 2025-03-21). It looks dormant (an inference). Its blog has a "Marginal ft. Kodiak" post. | **High.** Same word, same field (on-chain financial markets), same audience. Even a dormant project may hold common-law rights or a filing. | (P) https://marginal.network/ ; (P) https://marginal.gitbook.io/docs ; (P) https://github.com/MarginalProtocol ; (P) https://marginal.network/blog/future-of-amms-in-defi ; (S) https://messari.io/project/marginal/profile ; (S) https://www.cbinsights.com/company/marginal ; (S) https://cantina.xyz/bounties/faedfdc2-d858-4c58-8881-3fa6bd40e2b6 | PRIMARY + SECONDARY |
| **MARGINAL SOFTWARE** (US word mark, serial 78065984; owner Dane Kosaka) | Software for financial calculations, analysis and planning | Justia does not show its status. The 78-series serial suggests an early-2000s filing (an inference). | Low to medium; check the status. | (S) https://trademark.justia.com/owners/kosaka-dane-1752676 | SECONDARY |
| **Margin** (a16z speedrun) | "The world's first AI powered credit card"; New York; founded 2025 | Active startup | Medium-low (fintech/AI, similar word) | (S) https://speedrun.a16z.com/companies/margin | SECONDARY |
| **Marginalen Bank / Marginalen Financial Services** | Organisations seen in GitHub search; "Bankaktiebolag" indicates a Swedish bank | Exists | Low to medium in financial services in the EU | (P) https://github.com/Marginalen-Bank-Bankaktiebolag | PRIMARY (GitHub) |
| Others: MarginArc (AI consultancy), Marginalia Search, Marginal Revolution blog / MRU | Similar names | — | Low (brand noise). The Marginal Revolution entry is prior knowledge, not re-verified. | (S) GitHub search API result for "marginal" orgs | — |
| **"Marginal Labs", "Marginal AI", marginal.ai** | — | **Not found** | — | — | — |

**Recommendation:**
- Commission a formal clearance search before using "Marginal" publicly:
  - registers: USPTO (TESS/TSDR), EUIPO, UKIPO and the WIPO Global Brand Database;
  - Nice classes 9, 35, 36 and 42;
  - a common-law and domain check covering the marginal.network team.
- The DeFi "Marginal" is the material conflict. If that team is still active or holds a filing, use a composite mark or a different name.

### 3b. "Lethe"

| Name | What | Status | URL | Source |
|---|---|---|---|---|
| **Lethe protocol** | Erasure-based audit market with a Proof of Erasure (see §1c) | Site offline since some point after 2026-04-09; GitHub repos gone | http://web.archive.org/web/20260409212333/https://lethe-protocol.github.io/ | PRIMARY (archived) |
| **"Lethe" (ETHGlobal showcase)** | Privacy-first hospital-bill audit on the 0G stack that deletes bill data after processing | Hackathon project; activity unknown | https://ethglobal.com/showcase/lethe-j9ygy | SECONDARY (search snippet) |
| **"Lethe" token** | "River of Forgetfulness" privacy coin with memory-wipe NFTs | One aggregator tag page | https://www.mexc.com/news/tag/lethe | UNVERIFIED |
| **Lethean (LTHN)** | Privacy/VPN crypto project with a similar name | Exists (code forge) | https://forge.lthn.ai/lthn?page=2 | UNVERIFIED |
| **Research: LetheViT; "Lethe: How Hard Is It to Forget?"** | ViT machine-unlearning method; federated-unlearning benchmark in medical imaging | Papers | https://arxiv.org/pdf/2508.01569 ; https://pith.science/paper/2608.01094 | PRIMARY (paper) / SECONDARY (index) |
| Jay's **LETHE** (hackathon v0, `lethe-380029.testnet`) | — | Own project | MOONSHOT §10 | — |

**Recommendation:** the collision is confirmed, and "Lethe" is crowded in exactly the forgetting/erasure niche. Keep LETHE only as the hackathon v0 codename.

---

## 4. Evidence of pay-for-lift / outcome-based pricing demand

### 4.1 Primary

**Surge AI, off-the-shelf frontier data page (https://surgehq.ai/ots, fetched 2026-11-11):**
- Quotes:
  - "Trusted Program partners can train first, and pay if it works."
  - "Train first. Pay if it works."
  - "Labs in our Trusted Program can train on the full dataset … pay only when it moves the metrics that matter."
- Worked examples, each "after training on" a Surge dataset:
  - Nemotron 3.5 Super on AutomationBench: 14.8% → 27.5%
  - Kimi K2.7 on GDPVal: 19.6% → 35.9%
  - Kimi K2.7 on DeepSWE: 31% → 48.7%
- The page publishes no thresholds or how to join; eligibility is "Labs in our Trusted Program".

**Surge AI, post-training page (https://surgehq.ai/post-training, fetched 2026-11-11):**
- Quote: "Train on the full dataset first, and pay only if it improves your metrics."
- It lists "Your evals" under Surgio Custom Models.
- It has entries dated "NOV 2026".

**What Surge's offer implies for the spec:**
- **Demand is real.** A top AI-data vendor sells on "pay only if your metric moves", measured on the buyer's metrics.
- **The inspection paradox is solved by trust, not sealing.** The lab receives the full dataset before paying, so the offer is limited to a vetted Trusted Program and the vendor carries the copy risk.
- **Marginal's wedge:**
  - the same commercial term for counterparties who do *not* trust each other (small or one-off sellers, rivals, regulated data);
  - with no copy before payment;
  - measured by a neutral room rather than a self-interested vendor;
  - priced continuously by a mechanism rather than pay/no-pay.
- **Risk:** Surge (or Scale, Mercor) can extend trust programmes, or add their own TEE evaluation.

### 4.2 Secondary and analyst

- **Sacra summary** (the MOONSHOT citation): "Pay Only For Verified Model Lift"; "partners can train first and pay if the data works"; "only pay when the lift clears an agreed bar". It cites Surge's OTS page (dated 2026-09-10) and a Sacra Proximal page (2026-10-10) "highlighted claim on Surge trusted program". (S) https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/ ; (S) https://sacra.com/c/proximal/
  - Note: "agreed bar" appears in Sacra's text, not on Surge's page.
- **Surge's normal pricing** is per project, with no public price list. (S) https://research.contrary.com/company/surge-ai ; (S) https://aitraining.jobs/expert-data/vendors/surge-ai
- **Bain:** only about 10% of companies adding AI pricing use outcome-based meters. Outcome pricing works when the outcome is observable, attributable and contractible. (S) https://www.bain.com/insights/ai-pricing-a-reality-check-on-effort-usage-and-outcomes/
  - Marginal's sealed, attested Δeval makes lift observable and attributable, which supports the thesis.
- **Critique:** vendors get "rewarded for the metric that triggers billing". This is a Forbes BrandVoice piece by Parloa. (S) https://www.forbes.com/sites/parloa/2026/01/06/outcome-based-pricing-the-most-expensive-myth-in-enterprise-ai/
- **Two-sided sealed evaluation demand:**
  - DeepMind double-blind evals (P, §2.1)
  - OpenMined enclave evaluation case study (P): https://openmined.org/blog/secure-enclaves-for-ai-evaluation/
  - NIST CAISI × OpenMined collaboration on confidential evaluation (S): https://www.executivegov.com/?p=282082

### 4.3 Demand-side substitutes (what a buyer might use instead)

| Player | AI or transcript product, 2026 | Outcome-based pricing? | URL | Source |
|---|---|---|---|---|
| **AlphaSense / Tegus** | 300k+ investor-led transcripts, growing by 10k+ a month; Generative Search; AI-led expert calls. Transcripts enter the library after a 14-day (public) or 90-day (private) delay, which buyers can pay to shorten | No (subscription) | https://help.alpha-sense.com/hc/en-us/articles/55980474097555-AlphaSense-Product-Updates-September-2026 ; https://www.alpha-sense.com/solutions/expert-calls/ | PRIMARY (via search snippets) |
| **Third Bridge** | Forum library of about 90k transcripts; reportedly an MCP server for Claude for Financial Services | No pricing found | https://www.thirdbridge.com/en-us/about-us/media/perspectives/the-7-best-expert-networks-in-2025-how-to-choose-the-right-partner | UNVERIFIED (claims seen in a search summary; exact page not confirmed) |
| **GLG** | Transcript library via myGLG, Bloomberg and FactSet; AI summaries; AI moderation in compliance workflows | No pricing found | https://glginsights.com/library/ | PRIMARY (via search snippet) |
| **AlphaSights** | Transcripts and summaries of past calls | No pricing found | https://nexusexpertresearch.co/blog/top-expert-network-companies/ | SECONDARY |
| **Surge AI** | Off-the-shelf frontier datasets; RL environments | **Yes: "Train first. Pay if it works."** (Trusted Program) | https://surgehq.ai/ots | PRIMARY |
| **Mercor** | Expert data; APEX-Agents benchmark (Jan 2026) | Not found | https://en.wikipedia.org/wiki/Mercor | SECONDARY |
| **Scale AI** | — | Not found (not specifically searched beyond the vendor query) | — | — |
| **Turing, Handshake, micro1, Mercor data programmes** | These programmes *buy* records from companies. Their payment triggers are delivery, written acceptance, or a share of each resale (Turing "Project Lazarus"). | Acceptance-gated, not lift-gated | https://regulr.ai/data-licensing/compare/micro1-vs-mercor-vs-handshake ; https://aidata.broker/guides/handshake-ai-data-partnerships | SECONDARY |
| **Invisible** | Quoted per engagement | Not found | https://aitraining.jobs/expert-data/vendors/invisible-technologies | SECONDARY |
| **Proximal** | Coding data and RL infrastructure; claims more than $200M annualised revenue | Terms undisclosed | https://sacra.com/c/proximal/ | SECONDARY |

---

## 5. Queries and fetches run (2026-11-11)

**WebSearch (45).** Mode is "standard" unless marked (ext).
1. Opaque Systems Anthropic acquisition October 2026 (ext)
2. Super Protocol confidential AI marketplace 2026 announcement
3. Ocean Protocol Ocean Market sunset compute-to-data 2026 ASI Alliance withdrawal
4. iExec Nox confidential DeFi Bellecour sunset 2026
5. "Ocean Market" deprecated OR sunset OR discontinued Ocean Protocol blog Ocean Nodes
6. Vana "Data Access" layer proof of contribution 2026 update
7. Nillion "Encrypted Markets" 2026
8. VAST Data DataEnclave confidential AI general availability
9. OpenLedger Proof of Attribution 2026 mainnet Datanets update
10. Phala Network GPU TEE confidential training private fine-tuning 2026
11. DATA Foundation Story Protocol Poseidon AI training data 2026
12. Google "Private AI Compute" announcement
13. EQTY Lab verifiable compute 2026 announcement
14. "Lethe protocol" TEE erasure audit (ext)
15. Flashbots "conditional recall" TEE LLM demo Andrew Miller 2026 (ext)
16. Cloudflare Human Native AI data marketplace 2026 launch
17. Plurality Network Oasis ROFL context marketplace expertise 2026
18. Snowflake clean rooms ML jobs multi-party training 2026 OR Databricks clean rooms machine learning 2026 OR AWS Clean Rooms ML custom models
19. startup lets AI labs test dataset against their own eval before paying confidential computing 2026 (ext)
20. TEE data marketplace launch 2026 confidential information market AI agents (ext)
21. Surge AI pay only if model metric improves outcome-based pricing data (ext)
22. Surge AI guarantee model improvement pricing [allowed_domains: surgehq.ai]
23. AI training data vendor "pay for performance" OR "outcome-based" OR "pay only if" model improves Mercor OR Turing OR micro1 OR Handshake OR Invisible 2026 (ext)
24. private benchmark marketplace confidential eval-as-a-service sell test sets AI labs 2026 (ext)
25. Proximal AI training data startup 2026 Sacra
26. "Marginal" DeFi protocol leverage perpetuals Uniswap marginal.network
27. "Marginal Labs" OR "Marginal AI" OR "Marginal Inc" startup company
28. "Lethe" crypto OR blockchain OR AI project protocol 2026 -river
29. MARGINAL trademark registration software OR financial services OR "marginal.ai"
30. NEAR AI 2026 marketplace data models private evaluation confidential launch (ext)
31. GLG OR AlphaSights OR "Third Bridge" OR AlphaSense Tegus AI expert transcripts AI labs data licensing 2026 (ext)
32. marketplace rent model weights confidential computing model owners never expose weights buyers fine-tune 2026 launch (ext)
33. sell expert knowledge to AI agents confidential TEE marketplace startup 2026 (ext)
34. data valuation startup measures value of dataset to buyer's model before purchase 2026 (ext)
35. Databricks Clean Rooms machine learning model training 2026
36. Cloudflare acquires Human Native AI data marketplace [allowed_domains: cloudflare.com, blog.cloudflare.com]
37. NEAR Protocol ecosystem 2026 data marketplace OR knowledge marketplace OR "agent market" AI agents buy data TEE (ext)
38. "Lethe" machine unlearning OR forgetting LLM paper OR product
39. expert call transcripts library AI generative search 2026 [allowed_domains: alpha-sense.com, thirdbridge.com, glginsights.com, alphasights.com, guidepoint.com]
40. sealed information market agents TEE launch September OR October OR November 2026 x402 ERC-8004 data (ext)
41. Turnkey Verifiable Cloud 2026 general availability TVC launch
42. NEAR AI security incident November 2026 remote code execution inference user agent data exposed (ext)
43. OpenMined 2026 launch data owners model owners confidential evaluation network attribution-based control
44. "leakage budget" information market OR negotiation OR appraisal TEE OR enclave AI agents
45. "proof of erasure" OR "proof of deletion" OR "deletion certificate" TEE attested on-chain AI data 2026 (ext)

**WebFetch (10).**
1. https://docs.turnkey.com/solutions/verifiable-cloud/data-brokerage
2. https://www.opaque.co/
3. https://superprotocol.com/
4. http://web.archive.org/web/20260409212333/https://lethe-protocol.github.io/ — **failed** (the tool cannot fetch web.archive.org). Retrieved with curl instead; see below.
5. https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/
6. https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/
7. https://surgehq.ai/ots
8. https://surgehq.ai/post-training
9. https://marginal.network/
10. https://blog.google/technology/ai/google-private-ai-compute/

**GitHub REST API and curl HTTP checks (about 52 calls, read-only).**
- Repo metadata and last commit for:
  - deepsp94/tbvh
  - discordwell/ndai-hackathon
  - kkoci/Dealproof (plus its 12 branches, each with its latest commit)
  - Eduardogbg/mnemo
  - ShotaNagafuchi/sealed-trade-protocol
- README text of the five repos above, grepped for mainnet, testnet and "simulated".
- oceanprotocol/market, oceanprotocol/ocean-node, oceanprotocol/ocean.js; and the HTTP status of market.oceanprotocol.com.
- The `lethe-protocol` org (404) and user (created 2026-10-04, 0 repos); HTTP status of lethe-protocol.github.io and /vision (both 404).
- Wayback Machine availability and CDX listing for lethe-protocol.github.io: one capture, 2026-04-09, root only. The raw archived root page was downloaded with `id_` and its text extracted. The archived docs.html was never captured.
- amiller repos sorted by last push; amiller/tee-negotiator.
- GitHub org search for "marginal"; MarginalProtocol repos; HTTP status of app.marginal.network (402).
- vana-com repos sorted by push; latest pushes for OpenLedger-xyz, NillionNetwork, Phala-Network and Dstack-TEE.

---

## 6. Gaps and items not verified this session

- **VAST:** no primary press release fetched (secondary only).
- **DATA Foundation:** no primary announcement fetched.
- **Ocean:** blog not checked for a sunset notice; the market front-end check was HTML-only.
- **Anthropic:** no Anthropic statement on Opaque found. The deal's legal form (acquisition vs licence plus acqui-hire) cannot be confirmed from primary sources.
- **NEAR AI:** the incident report itself was not fetched; the claim about confidential-mode requests needs primary confirmation. The Agent Market launch status is unconfirmed.
- **Lethe protocol:** the operators are unidentified; the "Flashbots-adjacent" attribution is unsupported.
- **Nillion:** whether Dusk is on mainnet or testnet is unresolved (sources conflict).
- **Scale, Mercor, Turing, micro1, Handshake, Invisible:** only aggregator pages checked for lab-facing pricing; no vendor pricing pages fetched.
- **Third Bridge:** the MCP and transcript-count claims are not confirmed on a specific page.
- **Trademarks:** no USPTO, EUIPO or WIPO lookups were run (by instruction).
