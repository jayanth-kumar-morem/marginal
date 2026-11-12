# Competitive scan: Sealed Exchange / LETHE-at-scale (and alternatives b-f)

Date: 2026-11-11. Research only. Status labels are from the web this session unless marked [prior knowledge, not re-verified].

Components of the proposed product, used as columns below:
- **BR**: buyer-relative appraisal (the good is scored against the buyer's private corpus, model, or eval, and priced on marginal gain)
- **S2**: sealed two-sided evaluation (neither the good nor the buyer's private assets leave the enclave)
- **AIE**: AI acts as escrow, appraiser, and auditor (an agent decides deal or no deal and price)
- **UR**: usage rights, not copies (compute-to-data, rent the answer)
- **FC**: signed forget certificate when there is no deal
- **XC**: cross-chain settlement (NEAR Intents / Chain Signatures)
- **MW**: trades model weights or fine-tunes as a good
- **GPU**: GPU confidential compute (H100/B200 CC), not only CPU TEE

Y = has it, P = partial or claimed, N = lacks it.

## 1. Competitor table: main idea (Sealed Exchange)

### Closest: TEE "NDAI" negotiation and information-market implementations

| Product | What it does | Link | Status | BR | S2 | AIE | UR | FC | XC | MW | GPU | How it differs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **NDAI Agreements paper** (Stephenson, Miller, Sun et al.) | Theory: a TEE plus AI agents acts as an "ironclad NDA". Disclosure is conditional on a deal, and the session is deleted on no-deal. | arxiv.org/abs/2502.07924 | Paper (Feb 2025) + follow-up 2603.19011 (NDAI-zone security awareness across 10 LLMs) | N (seller values the invention; buyer has no private corpus in the loop) | N | Y | N (deal = disclosure) | P (deletion is a property, not a signed certificate) | N | N | N | This is the intellectual root of the idea. The "AI as escrow plus conditional disclosure" core is **published prior art**. |
| **TBVH "To Be Verifiably Honest"** (deepsp94) | Buyer posts a request plus a USDC budget. Seller and buyer agents (DeepSeek via RedPill) negotiate inside Phala TDX. A DKIM-email proof gives authenticity. TEE-signed EIP-712 settlement goes to escrow on Base Sepolia. | github.com/deepsp94/tbvh | Testnet, 52 commits | P (buyer agent checks fit to the *request text*, not to a private corpus) | P (seller good sealed; buyer side is a text request) | Y | N (on accept the info is revealed = copy) | P (email content deleted at a terminal state; no certificate) | N (Base only) | N | N | It is a near-complete information market MVP. It lacks a buyer-corpus-relative appraisal, usage rights, a forget certificate, cross-chain settlement, and GPU or model goods. |
| **NDAI TrustKit** (discordwell) | Implements the NDAI paper. Two Claude agents use a Nash bargaining engine inside an enclave. Invention keys are Shamir-split. Nitro/TDX attestation. NdaiEscrow on Base/Eth Sepolia. Also does sealed exploit verification and conditional secret release. | github.com/discordwell/ndai-hackathon | Hackathon/research, 165 commits, simulated-TEE default | N | P | Y | N | N (deletion not addressed) | N | N | N | Same core as yours (AI-as-escrow plus sealed exploit verification). It lacks BR, UR, FC, XC, and MW. |
| **DealProof** (kkoci) | "Verifiable AI negotiation for private data access". Buyer and seller Claude agents negotiate inside Phala TDX (dstack). DKIM seller proof. The attestation quote covers the price and terms. Solidity escrow on Sepolia. | github.com/kkoci/Dealproof | Hackathon/WIP (DCAP parser and attested memory are on the roadmap) | N | P | Y | P ("data access" framing) | N | N | N | N | Closest in framing ("private data access"). No buyer-relative eval, no forget cert, single EVM chain. |
| **Sealed Trade Protocol** (ShotaNagafuchi) | Bonded TEE negotiation (bonds of 1%/3%/10% by stage, slashing on walk-away, 0.3% fee). The enclave is destroyed after the deal. | github.com/ShotaNagafuchi/sealed-trade-protocol (+ position paper) | Sepolia contracts only. **The TEE runtime is not built**; agents run client-side. | N | N | Y | N | P (enclave destroyed) | N | N | N | Covers the bond and slashing economics; nothing else. |
| **Mnemo** (Eduardogbg) | Escrow-gated bug disclosure. Researcher and protocol agents meet in a Phala TDX room; the protocol must fund escrow before reveal. A TEE arbiter runs forge tests. The enclave is wiped on no-deal. ERC-8004 reputation. | github.com/Eduardogbg/mnemo | Hackathon (Synthesis, Mar 2026), Base Sepolia, attestation simulated | N | P | Y | N | P (memory wipe; no signed cert) | N | N | N | **Already does the exploit-disclosure vertical** of your product. |
| **Lethe protocol** (lethe-protocol.github.io, Flashbots-adjacent people) | Erasure-based security-audit market. Bugs are verified and patched in a TEE, the result goes encrypted to the requester, then the information is erased. Sealed-bid matching. The roadmap mentions data integrity and AI model security. | lethe-protocol.github.io | Early / research (vision page 404 at fetch; summary via search index) | N | P | P | P | P (erasure is the core thesis) | N | N | N | **Name collision with "LETHE"**, and it already owns the "erase information" narrative for audits. Rename, or cite and differentiate. |
| **Flashbots "Conditional Recall"** (Christoph, sxysun) | Selective forgetting in TEE-hosted LLMs as a mechanism-design primitive for information markets and bargaining. | Mentioned in Flashbots MEV Letter #112 | Research / demo | ? | ? | Y | ? | Y (conceptually: "forget unless condition") | N | N | ? | The "forget" primitive is **already named and demoed** by the Flashbots/Andrew Miller circle. A forget *certificate* as a settlement artifact is still not productized. |
| **Information Bazaar / "Redesigning Information Markets in the Era of LMs"** (Rahaman, Weiss et al., COLM 2024) | Simulated market where buyer agents inspect information, then forget it if they don't buy (the "buyer's inspection paradox"). | arxiv.org/abs/2403.14443 | Paper / simulation | P (buyer agent judges relevance to its own task) | N (no TEE) | Y | N | Y (amnesia, but simulated) | N | N | N | Academic prior art for "inspect then forget". |
| **Agentic Ocean** (ETHGlobal) | Agent-to-agent market for encrypted intel (exploit data, alpha, research) on 0G. A simulated sealed TEE gives a 1-100 quality score. Buyer agent thresholds. x402 pay-to-decrypt. Uniswap any-token. | ethglobal.com/showcase/agentic-ocean-thckh | Hackathon, simulated TEE | N (generic score, not buyer-relative) | N | P | N (decrypt = copy) | N | P (any-token via Uniswap, single chain) | N | N | Shows the "agents buy sealed alpha" framing is already hackathon-common. |
| **Eclipse** (ETHGlobal 2025) | Buyers ask an AI agent in Nillion nilCC (TEE) questions about encrypted content before paying. PYUSD on Sepolia. | ethglobal.com/showcase/eclipse-n93ec | Hackathon | P (Q&A by the buyer) | N | P | N | N | N | N | N | "Ask before you buy" exists. |
| **AgentDeed** (0G hackathon) | Fine-tuned models sold as ERC-7857 iNFTs. The AES key is sealed in a TEE and re-encrypted to the buyer on transfer. | hackquest.io/projects/AgentDeed | Hackathon | N | N | N | N (transfers the weights) | N | N | **Y** | N | Model-weight trading as a sealed asset exists, but as a copy transfer. |

### Commercial / protocol: confidential data and model marketplaces

| Product | What it does | Link | Status | BR | S2 | AIE | UR | FC | XC | MW | GPU | How it differs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Turnkey Verifiable Cloud – data brokerage pattern** | Seller encrypts the corpus to a quorum key that reconstructs only in an attested TEE. The TEE dedupes, scrubs, scores, and **runs the buyer's evaluation against the corpus without exposing either side**. Buyer verifies the App Proof, then pays. | docs.turnkey.com/solutions/verifiable-cloud/data-brokerage | Solution pattern, "contact us" (private beta) | **Y** (buyer eval vs seller corpus) | **Y** | N (no agent negotiation; deterministic pipeline) | N (output = cleaned dataset delivered) | N | N | N | N | **Closest commercial match to "sealed two-sided buyer eval".** It lacks AI negotiation and pricing, usage-rights-only delivery, forget certs, crypto settlement, and model goods. |
| **Super Protocol** | Confidential AI cloud plus on-chain marketplace of models, datasets, and compute offers. Intel TDX + NVIDIA H100/H200 CC. Buyers lease a base model and fine-tune on their own data. Owners never expose the assets; buyers get results or an API. | superprotocol.com, docs.superprotocol.com/marketplace | Live (Marketplace 2.0 since late 2024; self-reports 2,000+ confidential deployments, 250k GPU-hours) | N | P (both sides sealed during a job) | N | **Y** | N | N | **Y** (model leasing) | **Y** | **Strongest incumbent on infrastructure.** It already does usage-rights over sealed models and data on GPU TEEs. It lacks buyer-relative pricing, AI appraisal/negotiation, and forget certs. |
| **Ocean Protocol compute-to-data** | Data NFTs plus datatokens. Algorithms run where the data sits; the buyer gets results. | oceanprotocol.com | Live since 2020, but momentum weak; left the ASI Alliance Oct 2025 | N | N (C2D is not TEE-attested by default) | N | **Y** | N | P (multi-EVM) | N | N | Original "rent the answer". No sealed appraisal, no AI negotiation. |
| **iExec** | TEE (SGX→TDX) off-chain compute marketplace for apps, datasets, and workers; the marketplace contract is escrow. 2026 pivot to "Nox" confidential DeFi; Bellecour sidechain removed. | iex.ec | Live but pivoting away from the data market | N | P | N | **Y** | N | P | N | P | Did "confidential data market" for years; did not get product-market fit. That is a warning sign. |
| **Vana** (DataDAOs, VRC-20, Satya TEE validators on Phala dstack) | Users pool data into DataDAOs. Proof-of-Contribution in a TEE scores uniqueness and quality; the Data Access layer lets models train on pools. | vana.org, docs.vana.org | Live mainnet; weak on-chain activity per third parties | P (PoC scores value to the *pool*, not the buyer) | P | N | P | N | N | N | P | Value is pool-relative, not buyer-relative; it is a supply aggregator, not a two-sided sealed exchange. |
| **NEAR AI Cloud / DCML** (NEAR's own) | TDX + NVIDIA CC inference; Confidential GPU Marketplace (Feb 2026). The DCML paper (arXiv 2410.13752) envisions data and model owners collaborating without exposure, pay-per-use models, and usage restrictions. | near.ai | Live (inference + GPU marketplace) | N | P | N | P | N | P | P (vision) | **Y** | **Your substrate, not your competitor.** But NEAR AI could ship a data and model exchange on top. Position as the app layer they don't build. |
| **Phala Cloud / dstack / RedPill** | dstack CVMs, GPU TEE marketplace (H100/H200/B300), private training with weights sealed to a recipe. | phala.com | Live | N | P | N | P | N | P | P | Y | Infrastructure. TBVH, DealProof, Mnemo, and Vana's validators all run on it. |
| **VAST Data DataEnclave** | Enterprises run frontier models on private data; model builders' weights stay sealed. Two-sided BYO-KMS, verify-before-decrypt, tamper-proof audit log. GPU CC. | blocksandfiles.com (22 Sep 2026) | Preview; GA Q1 2027 (Cohere, CrowdStrike, Deepgram, NVIDIA...) | N | **Y** (mutual: weights and data both sealed) | N | **Y** | N | N | P (renting weights' capability) | Y | **Enterprise incumbent for two-sided sealing of weights × data.** No marketplace, no pricing, no crypto. This is where the "model-weight rental" leg gets commoditized. |
| **Snowflake / Databricks / AWS / Google clean rooms** | Multi-party analytics and (Snowflake ML Jobs, GA 2026) multi-party model training without exposing raw rows. | snowflake.com, databricks.com | Live, large | P (buyer can run its own model on partner data) | P (policy-based; Snowflake/Azure have some TEE options) | N | **Y** | N | N | N | P | Incumbents for enterprise "compute-to-data". No AI appraiser, no marginal-value pricing, no forget cert, no crypto. |
| **Opaque Systems** | Confidential AI platform (Opaque Studio, OPAQUE 3.0, Confidential MCP). Reported Oct 2026 Anthropic acquisition or license (sources conflict). | opaque.co | Live; acquired/licensed | N | P | N | P | N | N | N | Y | Confidential agents for enterprise; not a marketplace. |
| **Duality, TripleBlind, Fortanix, Anjuna, Fr0ntierX, Datavant** | FHE/MPC/TEE secure collaboration (Duality), private ML (TripleBlind; status unclear), confidential computing platforms (Fortanix, Anjuna), Janus confidential AI (Fr0ntierX), health-data tokenization and linkage (Datavant). | various | Live [prior knowledge, not re-verified] | N | P | N | P | N | N | N | P | Enterprise privacy rails; none run a priced marketplace with AI appraisal. |
| **Nillion** (nilDB / nilCC / nilAI) | MPC + TEE "blind computer". Secondary sources say the 2026 messaging is "Covenants and Encrypted Markets". | nillion.com | Live; marketplace claims unverified | N | P | N | P | N | N | N | N | Possible future competitor if "Encrypted Markets" ships. |
| **Oasis ROFL / Sapphire; Plurality** | ROFL TEE off-chain compute (mainnet Jul 2025). Plurality sells "context packs" of expertise without exposure. | oasis.net | ROFL live; marketplace aspirational; Plurality early | N | P | N | P | N | P | N | N | Plurality is the **closest to "sell expert knowledge sealed"**, but it is a context store, not buyer-relative appraisal. |
| **OpenLedger** (Proof of Attribution, Datanets) | Pays data contributors per inference in proportion to measured influence on outputs; x402 inference pricing. | openledger.gitbook.io | Mainnet Nov 2025 | P (attribution = marginal value, but to a *shared* model, not the buyer's) | N | N | Y | N | N | P | N | **The "pay by measured marginal contribution" idea exists here**, but it is post-hoc influence on public models, not pre-purchase sealed eval against the buyer's private model. |
| **Story Protocol → DATA Foundation / Poseidon** | Rebranded June 2026 to AI training data provenance (Trace registry); Poseidon validates and scores datasets; licensing rails. | theblock.co/post/406175 | Live (pivot) | N | N | N | N (licenses copies) | N | N | N | N | Licensing and provenance rails; no sealed appraisal. |
| **Sahara AI** | Data Services Platform plus AI Marketplace for datasets, models, and agents with on-chain ownership. | saharaai.com | DSP live July 2025; marketplace open beta | N | N | N | N | N | P | P | N | Ordinary listings marketplace. |
| **Nevermined** | Agent payments: x402, Visa card delegation, metering, access control; data and API marketplaces. | nevermined.ai | Live | N | N | N | Y (metered access) | N | P | N | N | Payment and metering rail you could use, not a sealed exchange. |
| **Ritual (Infernet), Atoma, Hyperbolic, Secret AI / Morpheus, Lit, Integritee, Automata, Zama/Inco/Fhenix/Arcium** | Confidential or verifiable inference and coprocessing (TEE/FHE/MPC); Ritual pitches model marketplaces with provenance. | various | Live / testnet mix [partly prior knowledge] | N | P | N | P | N | P (Lit, Automata multi-chain) | P (Ritual) | P | Building blocks. None combines buyer-relative appraisal with a forget certificate. |
| **Human Native AI (→ Cloudflare, Jan 2026), Cloudflare Pay-per-crawl / Pay-per-use, TollBit, ProRata/Gist, Created by Humans, Defined.ai, Datarade, Innodata, Kaggle/HF** | Web2 licensing marketplaces (copies or per-crawl access) with free samples for evaluation. | various | Live | N (samples only) | N | N | P (per-crawl/per-use) | N | N | P (HF hosts weights, not sealed) | N | They own the demand side for licensed data today. Their "evaluation" is free samples, which is exactly the inspection paradox the product claims to solve. |
| **Bittensor data subnets, Gensyn, Pond, Masa** | Decentralized data scraping (Masa), training (Gensyn), hidden-benchmark subnets (Bittensor concepts). | various | Mixed; private-eval subnets are mostly ideathon concepts | N | N | N | N | N | N | P | N | Private eval sets exist only as validator secrets, not as tradeable goods. |
| **EQTY Lab Verifiable Compute** | Intel/NVIDIA TEE-attested certificates for every AI operation, anchored on Hedera; governance gate. | eqtylab.io | Live (Accenture pilots) | N | N | N | N | P (certificate machinery; could sign "deleted") | N | N | Y | Productized attested AI certificates. The **certificate format for "forget" is a straightforward extension of their stack.** |
| **Proof of Unlearning (Weng et al.)** | SGX-based proof that data was deleted or unlearned from an MLaaS model. | arxiv.org/abs/2210.11334 | Paper + PoC | — | — | — | — | **Y** (academic) | — | — | N | Prior art on deletion proofs. |
| **PrivaDE** (arXiv 2510.18109 / IACR 2026/559) | Cryptographic (non-TEE) protocol in which model owner and data owner jointly compute a dataset's utility score for *the buyer's model* before purchase, for blockchain data marketplaces. | arxiv.org/abs/2510.18109 | Paper | **Y** | **Y** (crypto, not TEE) | N | N | N | N | N | N | **Academic prior art for buyer-relative, model-specific, pre-purchase sealed valuation.** |

### NEAR hackathon entries (from the 511 submissions)

Closest 10, ranked by overlap with the Sealed Exchange.

| # | Entry | One-line claim (from submission text) | Overlap |
|---|---|---|---|
| 1 | **BlindBench** [privacy] | "Private evals that pay their authors. Secret test sets, scored inside NEAR AI Cloud enclaves, certified on NEAR." | **Private eval sets as a sold good**, scored in a TEE. Directly overlaps the "private eval sets" goods class and the buyer-relative eval on the buyer side. |
| 2 | **DeadDrop** [privacy,realworld] | "Sell encrypted files on NEAR: pay into escrow → key sealed to your public key → seller paid only on delivery. No key = refund." | Sealed information-good sale with escrow (copy delivery, no appraisal). |
| 3 | **Sealed Exploit** [privacy,security,agents] | "A keyless NEAR account runs the exploit in an OutLayer TEE and pays the first real break. Fakes refused on chain." | Exploit verification in a TEE plus payout, which is your exploit vertical. |
| 4 | **Redline** [privacy,security,realworld] | "Sealed vulnerability disclosure, private bounty negotiation and escrow that pays out when the fix merges." | Sealed exploit disclosure plus negotiation. |
| 5 | **SealedBounty** [privacy,security] | "AI bug-bounty judges ... in a near_ai TEE and made a NEAR contract verify its signature before releasing escrow." | AI-as-escrow/judge with TEE signature for exploits. |
| 6 | **Skarbnik** [privacy,security,agents] | "Private repair bounties ... secret test input while AI agents submit patches without ever seeing that input. Patch evaluated in RISC zkVM, Groth16." | Sealed private eval (a hidden test) used to pay, which is the buyer-relative eval pattern. |
| 7 | **KeyLease** [swarms,security,agents] | "Lend the call, never the key. Seal an API key once. Share leases (N calls, endpoints, expiry) via a pinned TEE proxy; revoke." | **Usage rights, not copies**, for a secret asset. |
| 8 | **Provable Alpha** [defi,thesis,agents] | "AI agents sell trading signals they can't fake: commit hash → sealed delivery → forced reveal → on-chain hit/miss record." | Information-good (alpha) market with sealed delivery and track record. |
| 9 | **Tune Up Research Desk** / **Nexa research** / **nearbi** [thesis,agents] | "Research reports you can verify... SHA-256 receipt on NEAR"; "autonomous AI research firm ... sells reports, payment from any chain." | Selling expert research as information goods with cross-chain pay (no sealing or appraisal). |
| 10 | **AgentEscrow** / **PayPerCall** / **ClearSend Intents** | "3 AI judges inside TEE score the work, and the contract pays"; "verified answer: provider paid. No answer: refunded." | AI-as-escrow pattern is very common (~10+ entries). |

Also relevant to the alternatives: **Black box** (verifiable flight recorder for an agent's money, relevant to b), **TEE Receipts** (attested AI answers anchored on NEAR, relevant to b and f), **SealedSwarm / SwarmCompute / Hivebuy** (sealed-bid GPU auctions and group-buy compute for agents, relevant to c), **Tontine** and **Charter** (AI firms anyone can own, with on-chain guardrails, relevant to d), **Priced In**, **Forseti**, and **PredicTEE** (TEE AI judges for prediction markets, relevant to e), **Sentinel on NEAR** (AI audits NEAR tokens and publishes verdicts on-chain, relevant to f), and **NEAR Books** (OutLayer TDX logs mainnet data and the browser re-runs checks, relevant to f). In total, 26 of the 511 entries are AI spend-guard or escrow variants; the "TEE judge + escrow" primitive is saturated.

No entry combines buyer-relative marginal-value appraisal, model weights as a good, forget certificates, and cross-chain settlement.

## 2. Alternatives (lighter check)

| Idea | Closest existing | Status | What already exists | Gap left |
|---|---|---|---|---|
| **(b) AI-agent liability clearinghouse** (bonds + parametric claims adjudicated from TEE-signed transcripts and guardrail telemetry) | **AIUC** (AIUC-1 standard Jul 2025; first AIUC-1-backed policy for ElevenLabs Feb 2026; Lloyd's/Beazley-backed), **Armilla** (Lloyd's coverholder, about $25M limits), **Munich Re aiSure** (parametric performance-trigger cover since 2018), Lloyd's AI cover; **"Insured Agents"** paper (Hu & Chen, arXiv 2512.08737, Oxford: hierarchical insurer agents with TEE-protected staking/audit); EQTY Lab attested logs; Nexus Mutual (smart-contract cover only; no agent product found); NEAR hackathon "Black box" and 26 spend-guards | Traditional insurance live; on-chain version is paper/hackathon | Underwriting by audit score and parametric triggers exist off-chain; the TEE-bonded insurer design is published | **On-chain parametric claims auto-adjudicated from attested transcripts**: no live product found. Moderately open, but the incumbents (AIUC, Munich Re) will add attestation inputs. Regulatory (insurance licensing) is the moat and the barrier. |
| **(c) Physically-delivered verifiable inference forwards / compute exchange** | **CME + Silicon Data** H100 index futures (Oct 2026 launch planned, pending CFTC), **ICE + Ornn** Compute Price Index futures (cash-settled), **Nodal + Compute Desk**, **Kalshi** GPU forward curves (live Jul 2026), **Architect AX** perpetual compute futures (offshore, live), **SF Compute** (physically delivered GPU-hour blocks, live) [prior knowledge], Compute Exchange auctions, Akash; "AI Token Futures" paper (arXiv 2603.21690, cash-settled Standard Inference Token); Anera Labs "Inference needs a forwards market"; NEAR hackathon SealedSwarm / SwarmCompute / Hivebuy | GPU-hour futures: crowded in 2026. Inference-token forwards: papers only | Cash-settled GPU futures (four exchanges), physical GPU-hour delivery (SF Compute) | **Physically delivered *inference* (attested model + tokens + latency SLA) forwards**: no live venue found. Narrow but real gap; it competes for attention with CME/ICE. |
| **(d) Autonomous AI corporations OS on-chain with attested governance** | Delaware "AI company" entity proposal (Jul 2026, Norm Ai), Argentina non-human corporation bill, **ClawBank/Manfred** (an AI filed an LLC and got an EIN, May 2026), **Novi Corpus** (ETHGlobal 2026: ERC-8004 identity + human guardian attestation), Olas/Virtuals agent economies, NEAR hackathon **Tontine** and **Charter** (AI firms with shares and on-chain mandates) | Legal wrappers emerging; many hackathon entries | Legal shells, agent tokens, guardrails | Crowded narrative and fast-moving legal ground. **Not blue ocean.** |
| **(e) Private insider-signal aggregation market** (TEE aggregates private signals, pays by proper scoring rules) | **Numerai / Signals** (stake-weighted crowdsourced signals; data not sealed), **Allora** (mainnet Nov 2025; forecaster-weighted aggregation, no private data), Polymarket + AI judges, NEAR hackathon **Priced In / Forseti / PredicTEE**; academic "private prediction markets" (differential privacy, not TEE) | Aggregation live; TEE-private-signal version only academic | Scoring-rule payments and model aggregation are well established | **TEE-sealed private signals with scoring-rule payouts**: no live product found. A genuine gap, but heavy legal risk (insider info / MNPI) is exactly why it is empty. |
| **(f) AI-rated, block-pinned replayable audits and ratings for on-chain assets** | **Credora** (by RedStone; PSL-based DeFi ratings, daily, distributed via oracle), Chaos Labs, Exponential.fi, LH Ratings RWA framework, arXiv 2605.29689 explainable RWA risk scoring; EQTY-style attested AI; NEAR hackathon **Sentinel on NEAR**, **NEAR Books** (TDX-logged, browser-replayable checks), **TEE Receipts** | Ratings live (Credora integrated in Morpho/Aave-family) | On-chain ratings and replayable on-chain-data dashboards exist | **Replayability pinned to block height plus attested model hash** is a feature, not a market. Credora/RedStone could add it. Low blue-ocean. |

## 3. Verdict: what is genuinely new and what already exists

**Already exists (do not claim novelty):**
1. *AI agents negotiating inside a TEE, with disclosure only on deal.* NDAI paper (2025), plus at least five open implementations: TBVH, TrustKit, DealProof, Mnemo, Sealed Trade. Most run on Phala TDX with EVM escrow.
2. *Inspect then forget.* Information Bazaar (COLM 2024), Flashbots "Conditional Recall", Lethe protocol (erasure-based audit market, **name collision**), Proof of Unlearning (SGX).
3. *Compute-to-data, rent the answer.* Ocean (2020), iExec, Super Protocol (GPU TEE, model leasing), Snowflake/Databricks clean rooms, VAST DataEnclave (two-sided weights × data sealing, GA 2027).
4. *Buyer's evaluation runs against seller data in a TEE before paying.* Turnkey Verifiable Cloud data-brokerage pattern (private beta), PrivaDE (crypto protocol paper).
5. *Pay by measured marginal contribution.* OpenLedger Proof of Attribution (post-hoc, shared models), Vana Proof-of-Contribution (pool-relative).
6. *Sealed exploit sale or verification.* Mnemo, TrustKit, plus four NEAR hackathon entries (Sealed Exploit, Redline, SealedBounty, Skarbnik).
7. *Private eval sets as a good.* BlindBench (NEAR hackathon).
8. *Sealed model-weight transfer.* AgentDeed (0G iNFT); weight rental via Super Protocol and VAST.

**Genuinely new (no live or open implementation found):**
- **The combination, where the buyer's private corpus, model, or eval is itself sealed in the same enclave, the price is a function of the measured *buyer-specific* marginal gain (Δeval, novelty vs notes), and that metric drives an AI-negotiated settlement.** Turnkey and PrivaDE do sealed buyer-eval but without agent pricing or settlement; TBVH, DealProof, and TrustKit do agent pricing but appraise against a text request, not the buyer's assets.
- **A signed, attested "forget certificate" as a settlement artifact** (a verifiable no-deal receipt binding the enclave measurement, input hashes, and a wipe attestation). Many systems wipe; none issue a portable certificate. Small but real.
- **Cross-chain settlement of information goods via NEAR Intents / Chain Signatures.** Every comparable implementation settles on one EVM testnet (Base/Sepolia).
- **One venue spanning datasets, weights and fine-tunes, private evals, knowledge, and exploits, with GPU-CC appraisal.** Each vertical exists alone.

**Honest blue-ocean verdict:**
- **Main idea: "near-blue", not blue.** The primitives (TEE negotiation, conditional disclosure, forget, compute-to-data, sealed weights) are red-water prior art with 5+ open repos and a well-cited paper. The defensible novelty is narrow and specific: **buyer-relative marginal-value pricing measured inside a two-sided sealed enclave on GPU CC, plus forget certificates and Intents settlement.** Lead with "pay per measured eval gain on *your* model, without either side seeing the other". Do not lead with "AI escrow in a TEE"; judges have seen that 20+ times in this hackathon alone. Rename away from LETHE (lethe-protocol collision). Main risks: Super Protocol or NEAR AI shipping a buyer-eval feature; VAST/Turnkey owning the enterprise side; iExec and Ocean's history shows weak demand for confidential data markets.
- **(b) Liability clearinghouse:** partially open. Off-chain is crowded (AIUC, Armilla, Munich Re); on-chain attested-transcript parametric claims exist only as a paper. Licensing barrier.
- **(c) Inference forwards:** GPU futures are red ocean in 2026 (CME, ICE, Nodal, Kalshi, Architect, SF Compute). *Physically delivered attested inference* forwards are an open niche, but there is only paper prior art.
- **(d) AI corporations OS:** not blue. Crowded narrative, active legal developments, many hackathon clones.
- **(e) Private signal aggregation:** the most technically open (no TEE plus scoring-rule product found), but legally hazardous (insider trading / MNPI). That is why it is empty.
- **(f) Block-pinned AI ratings:** not blue. Credora/RedStone and Chaos Labs dominate; replayability is a feature.

## 4. Queries run (43 web searches + 11 fetch attempts)

Searches:
1. NDAI agreements TEE conditional recall information disclosure paper
2. deepsp94 tbvh github TEE
3. "NDAI" TrustKit hackathon discordwell
4. DealProof kkoci TEE negotiation github
5. Ocean Protocol compute-to-data 2026 status ASI alliance
6. Vana data DAO TEE proof of contribution data access marketplace 2026
7. Nevermined AI agent payments data marketplace 2026
8. Sahara AI data marketplace launch
9. iExec confidential computing data marketplace TDX AI 2026
10. Super Protocol confidential AI marketplace models datasets TEE GPU
11. Phala dstack confidential AI model weights marketplace GPU TEE 2026
12. Oasis ROFL confidential AI data marketplace 2026
13. Human Native AI data licensing marketplace Cloudflare acquisition
14. dataset valuation marginal contribution buyer model evaluation before purchase marketplace "data valuation" startup
15. "try before you buy" dataset evaluation confidential compute buyer model data marketplace TEE
16. Story Protocol data licensing AI training Poseidon 2026
17. NEAR AI "decentralized confidential machine learning" data owners model owners TEE
18. Nillion data marketplace blind compute nilAI 2026
19. EQTY Lab verifiable compute AI governance certificate attestation
20. model weights marketplace confidential computing rent fine-tune without exposing weights startup 2026
21. Opaque Systems confidential AI agents 2026 OR Duality Technologies secure data collaboration
22. Databricks Clean Rooms vs Snowflake clean rooms ML model training third party data 2026
23. Bittensor subnet data marketplace OR "private eval" marketplace benchmark sell test sets
24. TEE "proof of deletion" OR "deletion certificate" enclave data unlearning attestation marketplace
25. "pay per eval" OR "pay for performance" dataset pricing marginal model improvement data licensing
26. Flashbots TEE "conditional recall" OR "sealed" information market Andromeda SUAVE 2026
27. Mnemo TEE knowledge marketplace agents OR "expert knowledge" sealed marketplace AI agents enclave
28. "conditional recall" sxysun TEE LLM selective forgetting information markets
29. TollBit ProRata Gist pay per crawl AI licensing 2026 marketplace
30. Ritual Infernet OR Hyperbolic OR Atoma confidential model marketplace TEE model owners monetize
31. AIUC-1 AI agent insurance 2026 Armilla Munich Re aiSure agent liability
32. "Insured Agents" paper TEE agent insurance OR Nexus Mutual AI agent cover crypto parametric
33. GPU compute futures exchange 2026 Ornn Compute Exchange CME compute futures SF Compute
34. inference token futures OR "verifiable inference" forward contract physically delivered tokens exchange
35. autonomous AI company on-chain legal wrapper agent-run corporation attested governance 2026
36. TEE aggregate private signals forecast proper scoring rule insider information market OR Allora Numerai
37. AI risk rating on-chain assets reproducible block number Credora Chaos Labs Exponential.fi RWA 2026
38. TEE exploit disclosure marketplace sealed vulnerability sale enclave verify exploit before payment
39. Numerai Signals 2026 OR Allora network mainnet forecasts private data contributors
40. Masa OR Defined.ai OR Datarade AI training data marketplace sample evaluation before buy 2026
41. OpenLedger proof of attribution datanets pay data contributors per inference 2026
42. "Lethe" TEE data marketplace OR "sealed exchange" information goods AI agents
43. "buyer's inspection paradox" information markets language agents forget

Fetches: github.com/deepsp94/tbvh, github.com/discordwell/ndai-hackathon, dev.to Sealed Trade Protocol post, docs.turnkey.com data-brokerage, ethglobal Eclipse, blocksandfiles VAST DataEnclave, github.com/Eduardogbg/mnemo, ethglobal Agentic Ocean. Two fetches failed: the near.ai DCML blog (404) and the oasis Plurality post (403); lethe-protocol vision returned 404.

Local: grep over existing-submissions-511.txt and existing-submissions-demo-texts.txt (keywords: data, market, sealed, knowledge, weights, model, appraise, forget, insurance, liability, compute, inference, signal, alpha, dataset, license, TEE, escrow).

Not individually verified this session (prior knowledge only): Zama, Inco, Fhenix, Arcium, Secret AI, Lit, Integritee, Automata, Fortanix, Anjuna, TripleBlind, Datavant, Fr0ntierX, Gensyn, Pond, Masa, Created by Humans, datarade, Akash, SF Compute specifics, Compute Exchange, Harmonic (ambiguous name; skipped).
