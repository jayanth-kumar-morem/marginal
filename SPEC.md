**Spec ID:** **SPEC-001**

**Author:** @jay

**Date created:**   2026-11-11

**Status:** `Authored`

**Linked issues:**  *(added once Status = Feature)*

*Product: **Marginal**, a working name that may change (§9.3). It is a confidential exchange where a buyer pays only for the measured marginal value of an information good it does not already have. The v0 exists as the hackathon build LETHE (§4.15).*

*Conventions:*

- *Source types: **P** primary, **E** analyst or market-research estimate, **S** secondary press.*
- *Every number we computed or assumed is labelled **estimate** or **assumption**, with its inputs shown.*
- *"(target)" marks a design target, not a measured fact.*
- *Per-claim verification notes are in* `spec-notes/` *(this research) and* `moonshot-notes/` *(earlier research).*

## 1. Problem

### 1.1 The economic problem: you cannot price information without revealing it

**Arrow's paradox.** In 1962 Kenneth Arrow described a paradox in the demand for information: "its value for the purchaser is not known until he has the information, but then he has in effect acquired it without cost" (["Economic Welfare and the Allocation of Resources for Invention"](https://www.nber.org/system/files/chapters/c2144/c2144.pdf), in *The Rate and Direction of Inventive Activity*, NBER, pp. 609–626, DOI 10.1515/9781400879762-024). The quotation and its page (p. 615) were checked against secondary citations, because the NBER PDF is an image scan.

Arrow did not show that information cannot be sold. Later theory shows partial and gradual sale is possible, and that a trusted third party helps the seller capture value (Hörner & Skrzypacz, ["Selling Information"](https://doi.org/10.1086/688874), *JPE* 2016). What Arrow identified is a structural tax on every information trade. Three further facts make it worse:

1. **Value is buyer-relative.** The same memo is worth a lot to a fund that does not know its contents and nothing to a fund that does. In Bergemann, Bonatti and Smolin's model, the buyer's "willingness to pay for supplemental data is determined by the quality of his initial private information" (*[AER* 2018, DOI 10.1257/aer.20161079](https://doi.org/10.1257/aer.20161079)). A seller who cannot see the buyer's existing knowledge cannot price to it. A buyer who cannot see the good cannot tell whether it is new.
2. **Value dilutes with the number of holders.** For traders, information is worth less the more others hold it (Admati & Pfleiderer, *[Econometrica* 1990, DOI 10.2307/2938355](https://doi.org/10.2307/2938355)). Exclusivity therefore has to be enforceable to be priced.
3. **Inspection itself leaks.** Each answer about a secret reveals part of it. Enough accurate answers allow reconstruction, as Dinur and Nissim's classic database result shows ([PODS 2003, DOI 10.1145/773153.773173](https://doi.org/10.1145/773153.773173)). Leaderboards have been attacked to recover hidden test labels from reported scores ([arXiv 2105.08266](https://arxiv.org/abs/2105.08266)). "Let me look first" is never free for the seller.

**Fair exchange needs a trusted party.** Exchanging a digital good for payment fairly is impossible without a trusted third party (Pagnia & Gärtner, 1999 technical report, cited via later literature). Smart contracts can play that role for verifiable goods ([FairSwap, CCS 2018](https://doi.org/10.1145/3243734.3243857)). They cannot judge *value* without seeing the good.

### 1.2 How information is traded today, and what each workaround costs

| Market                                        | How buyers cope with the paradox today                                                                                                                          | What it costs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Expert networks**                           | Pay for an hour of a person's time, before knowing whether the call adds anything                                                                               | Clients reportedly pay about $1,000–1,300 per call hour, with as little as about $300 passed to the expert. The buyer pays for time, not for marginal knowledge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Industry size ~$3B (2025) ([Inex One](https://inex.one/blog/expert-network-market-size), estimate). Call economics: [Harvard D3 case](https://d3.harvard.edu/platform-digit/?p=2094), [Spear's](https://spearswms.com/wealth/expert-networks) (secondary).                                                                                                                                                                 |
| **Alternative data for funds**                | Trials, samples, months of evaluation                                                                                                                           | Neudata's 2024 buyer survey found average spend of $1.6M a year across ~20 datasets ([Neudata](https://webflow2.neudata.co/blog/the-future-of-alternative-data-report-2024), estimate). Older industry reports put alternative-data sales cycles at ~7 months (2019) ([A-Team Insight](https://a-teaminsight.com/blog/alternative-data-budgets-rise-in-2019-but-providers-and-buyers-are-not-in-step), secondary, dated) and ~6 months from new source to investable signal ([A-Team Insight](https://a-teaminsight.com/blog/alt-datas-new-competitive-edge-from-discovery-to-synthesis/), secondary). Academic analyses of data marketplaces note that whether a price is worth paying "can only be done after having used the data" (*[Try Before You Buy*, arXiv 2012.08874](https://arxiv.org/abs/2012.08874)).                                 | Spend ~$2.8B (2025, +17%) ([Neudata 2026](https://www.neudata.co/blog/state-of-the-alternative-data-market-2026), estimate)                                                                                                                                                                                                                                                                                                |
| **AI training data and expert data for labs** | Bilateral deals priced by negotiation. Or vendors offering "pay if it improves your metrics", which works only by trusting the lab with the full dataset first. | Surge AI: "Labs in our Trusted Program can train on the full dataset, evaluate the resulting model, and pay only when it moves the metrics that matter" ([surgehq.ai/ots](https://surgehq.ai/ots), vendor page). Demand for pay-for-lift is real, but it is delivered by trust and a full copy, which limits it to vetted labs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Menlo Ventures sizes "training data and services" at **$15.3B** (Nov 2026; estimate; time basis not explicit) ([Menlo](https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/)). Mercor reportedly passed **$2B** gross annualised revenue in June 2026 ([Dealroom citing The Information](https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/), secondary). |
| **Content licensing and litigation**          | Large bilateral licences, or lawsuits                                                                                                                           | Reddit's "other revenue", mostly content licensing, was $140M in FY2025 ([Reddit 8-K](https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm), primary). Bartz v. Anthropic settled for $1.5B, about $3,000 per work, with final approval on 2026-07-20; appeals were filed ([Authors Guild](https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/), secondary). The June 2025 ruling found training on lawfully acquired books fair use; the liability came from pirated copies. In Thomson Reuters v. Ross, the Third Circuit affirmed no fair use for a non-generative AI tool on 2026-09-29 ([IPWatchdog](https://ipwatchdog.com/2026/09/30/third-circuit-affirms-revised-fair-use-ruling-against-ross-ai-legal-research-platform-in-sealed-opinion/), secondary). | Provenance now carries legal value                                                                                                                                                                                                                                                                                                                                                                                         |
| **Model weights and private evals**           | Weights are kept behind APIs. Evals are shared under NDA or not at all.                                                                                         | A buyer cannot test a fine-tune on its private eval without handing the eval over. A seller cannot let a buyer test weights without exposing them. Google DeepMind piloted a two-sided sealed evaluation in Aug 2026 ("The evaluator cannot see the Gemini model weights, and Google cannot see the evaluator's test prompts") as a safety-audit tool, with no market or pricing ([DeepMind](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)).                                                                                                                                                                                                                                                                                                                                                                 | No market figure found for traded weights or evals                                                                                                                                                                                                                                                                                                                                                                         |
| **Vulnerabilities**                           | Bounty platforms and brokers acting as trusted intermediaries                                                                                                   | A researcher who shows the exploit has given it away.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | HackerOne paid $89.1M in bounties, Jul 2025–Jun 2026 ([HackerOne](https://www.hackerone.com/report/hacker-powered-security), primary, read via search snippet).                                                                                                                                                                                                                                                            |

### 1.3 The technical problem

Measuring *marginal* value requires the good and the buyer's private context in the same place at the same time. Neither side will hand theirs to the other, or to an intermediary that could keep a copy.

- **Cryptography alone is too slow for model-scale appraisal.**
  - The best published fully homomorphic encryption result for Llama-3-8B generates at **18 s per token on 8 GPUs** ([arXiv 2601.18511](https://arxiv.org/abs/2601.18511)).
  - Zero-knowledge proofs of an 8B-parameter inference take about 10 minutes per proof: 620 s to prove plus 531 s to commit for Llama3-8B in [arXiv 2601.15716](https://arxiv.org/abs/2601.15716); tokens per proof are not stated.
  - Cryptographic pre-purchase valuation protocols exist, but have been shown only on small models: PrivaDE ran CIFAR/MNIST-scale models in under 15 minutes online ([arXiv 2510.18109](https://arxiv.org/abs/2510.18109)); TIP was shown on BERT/GPT-2 with homomorphic encryption ([arXiv 2512.06033](https://arxiv.org/abs/2512.06033)).
- **Trusted execution environments (TEEs) are fast but not cryptography.**
  - Confidential GPU inference on Blackwell runs at "about 1-3%" overhead when tuned ([arXiv 2608.26575](https://arxiv.org/abs/2608.26575)).
  - Physical attacks cost $10 to $1,000 in hardware:
    - BadRAM, under $10 ([badram.eu](https://badram.eu));
    - Battering RAM, under $50 ([batteringram.eu](https://batteringram.eu));
    - DDRop, $159 in parts, with full Intel TDX VM compromise ([ddropattack.eu](https://ddropattack.eu/));
    - TEE.fail, under $1,000, which extracted Intel's per-CPU attestation key ([tee.fail](https://tee.fail)).
  - Intel and AMD treat physical interposers as out of scope.
  - Software inside a TEE can also be exploited. NEAR AI disclosed on 2026-11-09 that an inference-engine flaw exposed requests on one server, "including confidential ones" ([NEAR AI](https://near.ai/blog/security-incident-report-sglang-vulnerability)).
- **Appraisal outputs leak** (§1.1). Any system that shows scores before payment must account for what those scores reveal.
- **Forgetting cannot be proven.** Machine "unlearning" is reversible:
  - models retain on average 21% of targeted knowledge after utility-constrained unlearning, and 83% after 4-bit quantisation ([arXiv 2410.16454](https://arxiv.org/abs/2410.16454));
  - minimal fine-tuning restores "unlearned" behaviour ([arXiv 2505.16831](https://arxiv.org/abs/2505.16831)).

  A credible "forget" must therefore mean that the data never persisted, not that a model erased it.
- **Agent payment protocols are not safe settlement layers on their own.**
  - Five practical attacks on x402 produce unpaid service or paid-but-denied outcomes ([arXiv 2605.11781](https://arxiv.org/abs/2605.11781)).
  - An analysis of AP2 finds 48 threats and shows valid mandate signatures do not ensure user intent ([arXiv 2608.23858](https://arxiv.org/abs/2608.23858)).

### 1.4 Why existing tools do not solve it

| Approach | Examples (status Nov 2026) | Why it falls short |
|---|---|---|
| Data marketplaces and licensing venues | AWS Data Exchange, Snowflake Marketplace, Datarade; Human Native (acquired by Cloudflare, Jan 2026) | Evaluation is by description or free sample, which is exactly the inspection paradox. |
| Clean rooms | Snowflake ML Jobs in clean rooms (GA Jul 2026), AWS Clean Rooms ML, Databricks Clean Rooms | Protection by policy rather than hardware attestation. No pricing by measured marginal value. Single-cloud. |
| Compute-to-data protocols | Ocean Protocol (left the ASI Alliance 2025-10-09; no evidence Ocean Market was sunset); iExec (pivoted to confidential DeFi) | They sold *access*, not measured value, and did not find strong demand. No dataset-sales or compute-to-data volume figures were found for either (§9, R17). |
| Confidential AI clouds | Super Protocol (self-reports 2,000+ confidential deployments, 50+ organisations); Phala; VAST DataEnclave (GA planned Q1 2027) | Use-rights over sealed models and data exist. No appraisal, no buyer-relative pricing, no market mechanism. |
| TEE buyer-evaluation patterns | Turnkey Verifiable Cloud data-brokerage pattern (private beta) | Runs the buyer's evaluation against the seller's corpus in an enclave, but has no pricing step. Scores are metrics "the buyer relies on to price the dataset". |
| TEE agent-negotiation prototypes | TBVH, NDAI TrustKit, DealProof, Mnemo, Sealed Trade Protocol (all testnet-only; four dormant since mid-2026) | Appraise against a *text request*, not the buyer's own assets. Deliver copies. No leakage accounting. Single EVM testnet. |
| Contribution-based payouts | OpenLedger Proof of Attribution, Vana Proof of Contribution | Value is measured against a *shared* model or pool after the fact, not against the buyer's private context before purchase. |
| Pay-for-lift on trust | Surge AI's "Train first. Pay if it works." | The buyer receives the full dataset first, so it works only for vetted labs, and the vendor carries copy risk. |

**Detailed competitive position:** §4.16.

### 1.5 Who is hurt

- **AI labs and enterprise model teams.**
  - They spend on data and expert knowledge (§1.2) but buy blind, or rely on vendor-measured lift.
  - They cannot share private evals without contaminating them.
  - They face provenance and copyright exposure (Bartz, Ross).
  - They must publish training-data summaries under the EU AI Act. The obligations apply from 2025-08-02, Commission fines are possible from 2026-08-02, and models placed on the market earlier must comply by 2027-08-02 ([Commission Q&A](https://digital-strategy.ec.europa.eu/en/faqs/general-purpose-ai-models-ai-act-questions-answers)). The Act requires disclosure and a copyright policy, not licensing, so "licensed data with provenance helps compliance" is an inference about demand, not a legal mandate.
- **Funds and research desks.**
  - They pay for calls and trials before knowing whether anything is new.
  - Their purchases can signal positions.
  - Their compliance teams must control material non-public information (§4.13).
- **Experts, researchers and data owners.**
  - They cannot show what they know without giving it away.
  - They are paid for time or access, not for marginal value.
  - Small sellers cannot get the "trusted vendor" status that pay-for-lift deals require today.
- **Model developers and eval authors.**
  - Weights cannot be sold without being kept by the buyer forever.
  - Eval sets lose value once shared.
- **Security researchers and protocols.** Disclosure depends on trust in either direction.

### 1.6 Why now

1. **Attested confidential GPUs at low overhead.**
   - Tuned Blackwell confidential inference shows "about 1-3%" throughput overhead, and a 120B-parameter MoE model ran on a single B200 ([arXiv 2608.26575](https://arxiv.org/abs/2608.26575)).
   - NEAR AI Cloud has served attested private inference since Dec 2025, with Intel Trust Authority verification added 2026-08-12 ([NEAR AI](https://near.ai/blog/near-ai-cloud-integrates-intel-trust-authority)).
2. **Keys released to code, not people.** NEAR's MPC network can derive keys that only an approved contract's TEE app obtains, re-derivable on new hardware ([NEAR One CKD, 2026-02-23](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)). The caveats are in §4.4.
3. **Cross-chain settlement and private trade rails.**
   - NEAR Intents had processed $37.3B cumulative volume by 2026-11-10 ([DefiLlama API](https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume), aggregator).
   - Confidential Intents (launched 2026-02-25) hides balances and swaps from the public on a permissioned network (§4.4).
4. **Demand for measured lift is now explicit.** A leading data vendor sells pay-for-lift (Surge, above). Menlo sizes training data and services at $15.3B (estimate). A frontier lab has piloted two-sided sealed evaluation (DeepMind). Sources for all three are in §1.2.
5. **Mechanism theory has caught up.**
   - TEEs plus AI agents can mitigate, and under stated conditions eliminate, the hold-up problem ([NDAI Agreements, arXiv 2502.07924](https://arxiv.org/abs/2502.07924)).
   - Committing an agent to forget can improve outcomes in worked examples ([Conditional Recall, arXiv 2510.21904](https://arxiv.org/abs/2510.21904)). This is shown by examples, not a general theorem.
   - Truthful payment rules for buyer-relative data value exist ([Agarwal, Dahleh & Sarkar, arXiv 1805.08125](https://arxiv.org/abs/1805.08125)).
6. **Legal pressure on provenance.** Copyright rulings and the EU's training-data summary make documented, licensed acquisition more valuable (§1.2, §1.5).

**Still unsolved, and treated as such in this spec:**

- TEE trust against physical insiders (§4.11);
- leakage from appraisal outputs (§4.7.4);
- proving deletion (§4.10);
- the open research questions in §9.4.

### 1.7 Problem statement

> Institutions already spend roughly $21B a year on information goods they cannot inspect safely before buying. That figure is our estimate, summing sourced segment figures (alternative data, expert networks, AI training data and services; method in §4.18). Sellers cannot show what they know without giving it away. Buyers cannot learn whether it is new to *them* without seeing it. No neutral venue today measures an information good's marginal value against the buyer's own private context, prices that value with a contract, meters what the inspection itself leaks, and proves to both sides afterwards that nothing was kept.

## 2. Goal & Non-Goals

### 2.1 Goal

**Build a confidential exchange where a buyer pays for an information good only according to its measured marginal value to that buyer.** The value is measured inside attested hardware against the buyer's own sealed context. A public contract sets the price and settles it. Every inspection's information leakage is metered and paid for. Every no-deal ends in a refund and a forget certificate.

### 2.2 Product goals

Each goal is tied to the acceptance criteria in §6 that test it.

| ID | Goal | What "done" means | Tested by |
|---|---|---|---|
| **G1** | **Buyer-relative valuation** | Each appraisal computes the good's value against the requesting buyer's sealed context (notes, data index, eval set or current model). It uses a declared, versioned appraiser whose code measurement is registered on-chain. | AC-1, AC-38–AC-44 |
| **G2** | **Contract-set prices; AI can only lower** | The Clearing contract computes every price from signed integer components. Model (LLM) judgement enters only as a factor in [floor, 1], so it can lower a price toward a seller-set floor and can never raise it above the deterministic ceiling. | AC-1–AC-6, AC-41 |
| **G3** | **Two-sided confidentiality before settlement** | Neither counterparty, nor the room operator, the host, or Marginal staff can read the good or the buyer's context. Only fields declared in the listing's output schema leave a room. | AC-11, AC-17–AC-23 |
| **G4** | **Metered, priced inspection** | Each listing has a contract-enforced leakage budget. Each appraisal's information release is debited in bits, and the buyer pays the seller for it, deal or no deal. | AC-12–AC-16 |
| **G5** | **Atomic delivery-versus-payment** | Funds reach the seller only together with a committed delivery to the buyer, through one settlement record. Every failure path ends in a refund. | AC-30–AC-34 |
| **G6** | **Refund and forget certificate** | Every job destroys the buyer's context and anchors a forget certificate. A no-deal also refunds the buyer and covers the good's working plaintext. | AC-26–AC-29 |
| **G7** | **Public replayability** | Anyone can re-verify every settlement using only public chain data and public attestation collateral. | AC-35–AC-37 |
| **G8** | **Any asset, any chain, optionally private** | Buyers fund in, and sellers are paid in, assets on chains supported by NEAR Intents. Purchases can settle without publicly linking buyer to listing. | AC-32–AC-34 |
| **G9** | **Bounded hardware trust** | Value at risk per attested platform is capped. High-value jobs need agreement across vendors and operators. Compromised hardware generations can be revoked on-chain. | AC-19–AC-21, AC-24 |
| **G10** | **Compliance by construction** | Category controls cover MNPI, personal data, stolen goods and exploits. Identity tiers, a buyer compliance channel, a hash-chained audit ledger, and provenance dossiers that support EU AI Act Art. 53 documentation are built in. Purchases are private from the public, not from compliance. | AC-45–AC-49, AC-55–AC-63 |
| **G11** | **Agent-native, with spend firewalls** | Buyer and seller agents trade through scoped keys and structured bids, behind on-chain spend limits. | AC-50 |
| **G12** | **Usable without crypto knowledge** | A first-time buyer goes from "upload context" to "deal or refund" without handling chain concepts. | AC-51 |

### 2.3 Success metrics

These are product targets, not measured facts. Stage-specific gates are in §4.17.

- **Integrity.** 100% of settlements replay-verified by two independent verifiers (AC-35, AC-36). 100% of jobs have an anchored forget certificate (AC-26). Zero unrefunded failed jobs.
- **Mechanism health.** Median and p95 leakage (bits) per cleared deal. Share of listings that exhaust their leakage budget without a sale (high values signal probing or mispriced budgets). Dispute and fault rate per 1,000 jobs.
- **Market.** Cleared value (GMV) and fee revenue. Appraisal-to-deal conversion by asset class. **Buyer savings**: budget not spent because the good was not new to the buyer, i.e. Σ(budget − price) on deals plus avoided spend on no-deals. This is the number that proves the product's thesis to buyers. Repeat-buyer rate. Seller realised price relative to ask.
- **Cost and latency.** Appraisal cost per job by class, and p95 time to verdict by class.

### 2.4 Non-goals

| ID | Marginal is **not**… | Why / what instead |
|---|---|---|
| NG1 | **A general-purpose confidential-compute cloud or GPU marketplace** | Marginal rents attested capacity (NEAR AI Cloud, the NEAR AI Confidential GPU Marketplace, other TEE vendors) and runs only fixed, audited appraisal and delivery programs. Customers cannot run arbitrary code in rooms. The TEE layer is commoditising (§4.16), so it is not the product. |
| NG2 | **A generic data marketplace or catalogue** | No free samples and no schema-browsing as the core. Discovery exists only to route buyers into appraisals. Sample-based evaluation is the inspection paradox this product exists to remove. |
| NG3 | **An insurance company first** | Assurance (TEE-break and provenance-fraud cover) comes later, through a funded pool and licensed partners (§4.17 Stage 3). Marginal does not underwrite risk on its own balance sheet. |
| NG4 | **An expert network** | No expert recruiting, call scheduling or live brokering. Marginal clears sealed written or structured goods. Expert networks can be sellers or channel partners. |
| NG5 | **An AI-negotiation product** | Agents never haggle in free text. They submit structured, sealed inputs to fixed mechanisms (§4.7), because LLM negotiators show strong first-proposal bias ([arXiv 2510.25779](https://arxiv.org/abs/2510.25779)). |
| NG6 | **A machine-unlearning or provable-deletion product** | Forget certificates attest *non-persistence under the TEE trust model* (§4.10). They never claim that a model "unlearned" anything, because unlearning is reversible ([arXiv 2410.16454](https://arxiv.org/abs/2410.16454), [arXiv 2505.16831](https://arxiv.org/abs/2505.16831)). |
| NG7 | **An FHE/MPC/ZK-first system** | Cryptographic proofs cover narrow sub-claims where they are already practical (§4.6). TEEs are the execution substrate, because FHE and zkML are orders of magnitude too slow for LLM-scale appraisal (§1.3). |
| NG8 | **A venue for prohibited goods** | No material non-public information, stolen or unlicensed data, personal data without a lawful basis, exploits sold to anyone but the affected party, or export-controlled items without a licence (§4.13). |
| NG9 | **A general inference provider or model host** | Weights-in-vault serves only licensed buyers of a listed model, under contract-gated metering (Stage 3). |
| NG10 | **A token project** | The design needs no native token. Fees and settlement use existing assets via NEAR Intents. |
| NG11 | **Consumer-first** | Individuals as sellers (a "context wallet") come after institutional liquidity exists (Stage 4). |
| NG12 | **An investment adviser or research publisher** | Marginal does not judge investment merit or endorse content. It reports appraiser outputs as defined in the listing's schema. |
| NG13 | **A custodian outside contract escrow** | Buyer and seller funds sit only in contract escrow or the Intents verifier contract, never in company-controlled off-chain balances. Whether this is enough to avoid money-transmission or custody regulation is an open legal question (§9). |

## 3. Users & Scenarios

### 3.1 Users

Stage tags refer to the roadmap in §4.17: **v1** is the production knowledge exchange, **v2** adds data and evals, **v3** adds weights, use-rights, exploits and signals, and **v4** opens supply to individuals.

| User | Side | What they seal into a room | What they may see before paying | What they pay or receive | Stage |
|---|---|---|---|---|---|
| **Fund / research desk** (hedge fund, crypto fund, VC, research DAO, alternative-data team) | Buyer | Research notes, prior memos, a structured question ("stated need") | By default only *deal / no deal*. Optionally quantised novelty and relevance, each priced in leakage bits | Appraisal fee (compute plus leakage compensation) and the clearing price | v1 |
| **Independent expert, research boutique, expert-network consultant** | Seller | A memo, an expert answer, a due-diligence note | Aggregate appraisal and deal counts for their listing. Never buyer identities or buyer contexts | Clearing price minus fee, plus leakage compensation per appraisal | v1 |
| **AI lab / enterprise model team** | Buyer | Private eval set, training-data index (hashes or sketches), current model or a proxy | Quantised overlap, lift on the buyer's eval with a confidence band, licence class | Appraisal fee (GPU cost pass-through), price via value schedule or auction | v2 (data, evals), v3 (models) |
| **Data owner** (publisher, platform, vertical data company) | Seller | Dataset, licence terms, provenance evidence | As above | Price, leakage compensation; optional train-in-vault or use-rights revenue | v2 |
| **Eval-set author** | Seller | Private benchmark items and scoring code | Count of runs and leakage spent | Per-run price | v2 |
| **Model developer / fine-tuner** | Seller | Weights, model card, base-model and licence evidence | Count of evaluations | Price, or metered weights-in-vault revenue | v3 |
| **Protocol / software vendor** | Buyer (of disclosures) | Invariants, a fork configuration, a known-issues list, a bounty schedule | Validity, severity class, loss-estimate band | Bounty from escrow | v3 |
| **Security researcher** | Seller | Exploit and proof of concept | Whether the finding is new to the protocol's sealed known-issues list | Bounty | v3 |
| **Agent builders** (buyer or seller agents) | Either | As above, through the API | As above | As above, behind on-chain spend limits | v1 |
| **Compliance officer** at a fund or lab | Observer | Nothing | Their own desk's hash-chained audit trail and dossiers | Nothing | v1 |
| **Room operator** | Infrastructure | Nothing (sees ciphertext only) | Job metadata | Operator fees; posts a slashable bond | v1 |
| **Challenger / watcher** | Infrastructure | Nothing | Public verdicts and attestations | Challenge reward; posts a bond | v2 |
| **Insurer / assurance partner** | Later | Nothing | Attested aggregate telemetry: caps, TCB status, incidents | Premiums | v3 |
| **Individual with a context wallet** | Later seller | Personal notes, spending or health data, under consent rules | Appraisal outcomes | Price per accepted appraisal | v4 |
| **Regulator / auditor** | Observer | Nothing | Selective disclosures that a participant chooses to make | Nothing | v2 |

### 3.2 Scenarios

Figures inside scenarios are **illustrative**, not data. "Room" means an attested appraisal room (§4.6). "Contract" means the Clearing contract on NEAR (§4.7). Each scenario lists the acceptance criteria (§6) that test it.

**A. Core purchase flows**

**SC-1 Successful purchase, appraised against the buyer's own notes (v1).** As a crypto-fund analyst, when I see a listing "Memo: counterparty exposure of protocol X, about 2,000 words, posted price 400 USDC", I seal my research notes and a one-line stated need into an appraisal with a 1,000 USDC budget. I pay only if the memo is worth at least the price *to me*.

- The room scores each claim of the memo against my notes. Say novelty is 0.82 and the relevance factor is 0.85, so measured value is m = 0.697 and V = 1,000 × 0.697 = 697 USDC.
- The contract recomputes V from the signed integers. Because V ≥ 400, it clears the deal at the posted price of 400, refunds the remaining budget, and records a commitment to the delivery.
- The memo is delivered sealed to my key. My notes are destroyed and a forget certificate covering them is anchored on-chain.
- Tested by AC-1, AC-3, AC-4, AC-5, AC-26, AC-30.

**SC-2 No deal, refund and forget certificate (v1).** As a second fund whose notes already cover most of the memo, when my appraisal returns novelty 0.31, I get no deal, my budget back in full, and a forget certificate. My only cost is the appraisal fee, and the memo is never exposed to me.

- V = 1,000 × 0.31 × 0.85 = 263.5 < 400, so the result is NoDeal.
- The certificate covers both my notes and the memo plaintext in that room.
- In blind mode I learn exactly one bit, the outcome, which is debited from the listing's leakage budget.
- Tested by AC-9, AC-13, AC-26, AC-27, AC-34.

**SC-3 The seller's side of a no-deal (v1).** As the memo's seller, when a buyer walks away, I receive the leakage compensation for the bits that appraisal released and I can verify the forget certificate. Inspection of my memo is therefore never free and never leaves a copy.

- Tested by AC-15, AC-27.

**SC-4 Cross-chain settlement (v1).** As a buyer holding USDC on an EVM chain, when I fund an appraisal I deposit through NEAR Intents and never touch NEAR directly. As a seller who wants SOL on Solana, I name that asset and chain once, and I am paid there.

- The escrow is NEAR-side.
- The payout runs through an Intents withdrawal (or a Chain Signatures transaction) that references the settlement ID.
- Tested by AC-32, AC-34.

**SC-5 Private purchase (v2).** As a fund, when I buy a memo about a specific company, I fund a fresh per-job account through Confidential Intents and prove my verified tier with a zero-knowledge proof. Public chain data then cannot link my fund to that listing, so my purchase does not signal my position.

- Marginal's compliance system still knows who I am. Private mode hides my identity from the public, not from compliance.
- Tested by AC-33, AC-56.

**B. Appraisal against the buyer's private assets**

**SC-6 Dataset priced by lift on the buyer's private eval (v2).** As an AI lab's data lead, when a seller lists a domain dataset, I seal my eval set and an index of my training data into a GPU room. I pay according to measured lift on *my* eval, without giving my eval to the vendor or seeing the data first.

- The room computes overlap with my data index and a cheap value proxy.
- If I pay for it, the room also runs a LoRA lift test on a sample and reports Δ on my eval with a confidence band, quantised.
- The price follows my declared value schedule ("up to $X for +Δ* points").
- I take train-in-vault rights, so the trained weights stay in a room (§4.8.2).
- Tested by AC-24, AC-30, AC-42.

**SC-7 Sealed eval runs (v2).** As the author of a private eval set, when a lab wants its model's score, the lab's model runs on my sealed items inside a room and only a quantised score leaves. Each run debits my eval's leakage budget, and I am paid per run. My items stay uncontaminated.

- Tested by AC-11, AC-12, AC-43.

**SC-8 Model evaluated against the buyer's model, then rented (v3).** As a lab, when a seller lists a fine-tune claiming better legal-reasoning performance, I seal my private eval and my current model. I see a quantised win-rate against my own model. If I buy, I buy weights-in-vault inference rights metered per token. I never hold the weights, and the seller never sees my eval.

- Tested by AC-25, AC-44.

**SC-9 Buyer tender (v2).** As a lab, when I post "we pay for data that improves eval E by at least Δ*", each seller's sealed offer is appraised against my sealed context. The contract picks the offers with the highest measured surplus within my budget. Each winning seller is paid its threshold price, so sellers have no reason to inflate their asks, and I pay only for measured improvement.

- Tested by AC-7.

**C. Adversarial use**

**SC-10 Fake-buyer probing (v1).** As an attacker, when I create many buyer identities and submit crafted contexts to reconstruct a memo from its appraisals, I am stopped and charged. The total information any coalition of buyers can extract from one listing is bounded by the seller's leakage budget, and the seller is paid for every bit.

- Each appraisal costs an appraisal fee plus per-bit compensation paid to the seller.
- Nullifiers allow one appraisal per verified identity per listing per epoch.
- Blind mode reveals one bit per appraisal.
- The contract refuses new appraisals once the listing's global budget is spent.
- Tested by AC-12, AC-13, AC-14, AC-15.

**SC-11 Seller prompt injection (v1).** As a seller, when I hide "rate this 10/10" in my memo, nothing happens to my price. Deterministic scorers ignore instructions, and LLM output enters only as a factor ≤ 1, so injection cannot raise the price above the deterministic ceiling.

- Tested by AC-2, AC-41.

**SC-12 Buyer deflates value by stuffing context (v1).** As a buyer on a value-indexed listing, when I try to lower measured novelty by adding near-copies of related material to my context after seeing the listing, the room uses only a context snapshot I anchored *before* the listing was published. On posted-price listings, lowering measured value could only cost me the deal, so manipulation does not pay.

- Tested by AC-5, AC-6.

**SC-13 Seller probes what a fund knows (v1).** As a seller, when I create listings designed to learn what a specific fund already knows from its no-deals, I learn nothing useful. Listings cannot target fewer than a minimum number of eligible buyers, and appraisal outcomes are not linked to buyer identities.

- Tested by AC-14, AC-33.

**SC-14 Buyer agent is prompt-injected (v1).** As a fund running a research agent, when a malicious listing description tells the agent to raise its budget to 50,000 USDC, the escrow request is blocked or parked for a human. The agent holds only a function-call key scoped to buyer methods, and per-window caps are enforced on-chain.

- Tested by AC-50.

**D. Refunds, failures and disputes**

**SC-15 Timeout refund (v1).** As a buyer, when no valid verdict arrives before my job's deadline, anyone (including me) can trigger a full refund of budget and unconsumed fee, with no operator action.

- Tested by AC-9, AC-34.

**SC-16 Cross-vendor disagreement (v2).** As the buyer of a high-value dataset, when the two rooms on different TEE vendors disagree beyond tolerance, the job settles as Fault. I am refunded, the seller is not paid, and an investigation opens.

- Tested by AC-24, AC-34.

**SC-17 Delivery failure and re-delivery (v1).** As a buyer whose deal settled but whose room crashed before delivery, another approved room re-derives the delivery key and re-delivers the same committed object. If delivery does not complete within the delivery deadline, the seller's held payout is refunded to me.

- Tested by AC-30, AC-31.

**SC-18 Challenge and re-execution (v2).** As a watcher who suspects a verdict came from a misbehaving room, I post a bond and challenge within the window. A room on another vendor re-executes. If results differ beyond tolerance, the held payout is reversed, the faulty operator's bond is slashed, and I am rewarded.

- Tested by AC-24.

**SC-19 TEE vulnerability response (v1).** As Marginal's security lead, when a TEE vendor publishes a TCB recovery for a new attack, governance revokes the affected TCB levels. From the next block the contract stops authorising key releases to affected platforms, and open jobs on them time out to refunds.

- Tested by AC-20, AC-53.

**E. Governance and compliance**

**SC-20 Seller pins acceptable room code (v1).** As a seller, when governance approves a new room build, my listing stays bound to the codehash set I pinned until I opt in. My good is never opened by code I did not accept.

- Tested by AC-21, AC-52.

**SC-21 MNPI screen (v1).** As a seller, when the in-room classifier flags my memo as likely containing material non-public information about a listed issuer, my listing cannot be appraised. I can withdraw it, or consent to a logged review by a designated compliance reviewer under confidentiality.

- Tested by AC-45, AC-46.

**SC-22 Compliance export (v1).** As a fund's compliance officer, when I review my desk's purchases, I can decrypt every good my desk bought with our compliance key. I can also export a hash-chained audit trail: listing category, seller attestations, screening results, settlement record and certificates. I can show controls to a regulator without Marginal ever seeing the content.

- Tested by AC-37, AC-55.

**SC-29 Restricted list (v1).** As a fund's compliance officer, when my restricted and peer lists include issuer X, my desk's appraisals of listings that concern X or its peers return only "restricted", before any appraisal runs. My desk never touches information we are barred from.

- Tested by AC-62.

**SC-23 Training-data documentation (v2).** As the AI Act compliance lead at a lab, when I prepare the public training-data summary for a general-purpose model, I export a provenance dossier for every dataset bought through Marginal: licence class, provenance evidence, PII-scrub report and settlement references.

- Tested by AC-48.

**F. Multi-buyer sale**

**SC-24 Sealed round for an exclusive memo (v2).** As a seller offering at most two copies of a memo, when five funds appraise during a round, the contract allocates to the two highest buyer-relative valuations above my reserve. Each winner pays the third-highest valuation or the reserve, whichever is higher. Nobody sees anyone else's valuation, and losers get refunds and forget certificates.

- Tested by AC-7, AC-8.

**G. Later stages**

**SC-25 Forecast with a truth-contingent tail (v3).** As a forecaster selling a probability that a protocol upgrade ships by a date, I am paid part of the price at delivery and the rest at resolution, according to a proper scoring rule.

- Tested by AC-4.

**SC-26 Exploit disclosure (v3).** As a security researcher, when I seal an exploit for protocol P, the room replays it on a fork at a pinned block against P's registered invariants and checks it against P's sealed known-issues list. If it is new and valid, P's escrowed bounty pays me and the disclosure is sealed to P's key alone.

**SC-27 Individual seller (v4).** As an individual, when a lab's tender asks for de-identified spending data, my context wallet lets the lab's room appraise my data. I am paid only if my data adds measured lift, and my raw data never leaves the room.

**SC-28 Assurance partner (v3).** As an insurer, when I price cover for TEE-break and provenance-fraud losses, I receive attested aggregate telemetry (caps, TCB status, incident history) instead of trusting self-reports.

## 4. Proposed Solution

### 4.1 The product in one paragraph

Marginal is an exchange where a buyer pays for an information good only according to its **measured marginal value to that buyer**.

- **Sealing.** A seller seals a good (a memo, an expert answer, a dataset, a fine-tuned model, a private eval set, an exploit or a forecast) into a vault. The vault's keys are released by NEAR's MPC network only to attested **appraisal rooms** approved by a Marginal contract, for a specific paid job.
- **Appraisal.** The buyer seals *its own* context into the same room: its notes, a data index, an eval set or its current model. Inside, deterministic appraisers measure what the good adds for that buyer:
  - novelty against the buyer's notes;
  - lift on the buyer's eval;
  - overlap with the buyer's data;
  - win rate against the buyer's model.

  Model judgement may only discount that measurement, within a floor the seller accepts.
- **Pricing and settlement.** A NEAR **Clearing contract**:
  - recomputes the valuation from signed integers;
  - applies a fixed, incentive-checked pricing rule;
  - debits the listing's **leakage budget** for every bit the appraisal revealed, and pays the seller for those bits;
  - settles in the buyer's and seller's chosen assets and chains through NEAR Intents.
- **Outcomes.**
  - On a deal, the buyer receives a sealed copy or **use-rights**, meaning it queries, trains on or runs the good inside a room.
  - On no deal, the buyer is refunded, and both parties receive a **forget certificate** bound to the room's hardware attestation, anchored in the settlement record.
- **Verification.** Every settlement can be re-verified by anyone from public chain data.

### 4.2 What is new, and what is not

**Already exists. Marginal does not claim it:**

- AI agents negotiating inside a TEE with disclosure only on deal: the NDAI paper and five open prototypes.
- Inspect-then-forget as an idea: Information Bazaar ([arXiv 2403.14443](https://arxiv.org/abs/2403.14443)) and Conditional Recall.
- Signed erasure proofs in an escrow flow: Lethe protocol, testnet, simulated TEE.
- Compute-to-data and sealed model rental: Ocean, iExec, Super Protocol, VAST.
- Buyer evaluation against seller data in an enclave without pricing: Turnkey.
- Two-sided sealed model × private-eval evaluation without a market: DeepMind's pilot.
- Pay-for-lift on trust: Surge.
- Contribution-based payouts: OpenLedger, Vana.
- Truthful pricing of data by gain on the buyer's task, as a mechanism: Agarwal, Dahleh & Sarkar.
- Bit-counting of output leakage, privacy budgets and leakage compensation as concepts: §4.7.4.

**The narrower claim of novelty.** We found no live or open implementation of any of these:

1. **Two-sided sealed, buyer-relative clearing.** The good and the buyer's own sealed corpus, model or eval sit in the same attested room. The price is a function of measured buyer-specific marginal value, and settlement runs through an on-chain contract with incentive-checked rules: posted price, uniform-price rounds, and threshold-payment tenders.
2. **A contract-enforced, priced leakage budget.** It is per listing and seller-set, counted in bits on appraisal outputs, depleted across all buyers, and paid to the seller per appraisal.
3. **A forget certificate as a settlement artefact.** It is bound to a real hardware attestation and a versioned attestation policy, covers both parties' inputs, and is anchored in a priced exchange's settlement record.
4. **One venue across asset classes**, covering knowledge, datasets, evals, weights and exploits, with cross-chain settlement and optionally private purchases.

Competitors are mapped in §4.16, and research claims are scoped in §4.7. **Positioning follows from this:** lead with *"pay only for what your model or your notes don't already have; neither side sees the other's secrets"*. Never lead with "AI escrow in a TEE", which is crowded (§4.16).

### 4.3 System overview

#### 4.3.1 Components

```
 SELLER client/agent                                           BUYER client/agent
   │ seal good (DEK), upload ciphertext                          │ seal context snapshot, anchor hash
   │ create listing (schema, budget, rule, pins)                 │ request appraisal (budget, mode, snapshot)
   ▼                                                             ▼
┌──────────────────────────── NEAR (public) ─────────────────────────────────┐
│  Clearing contract   listings · jobs · escrow · pricing rules · leakage    │
│                      ledger · settlement records · fees · refunds          │
│  RoomRegistry        approved measurements · PPID allowlist · room keys ·  │
│                      TCB policy · per-platform caps · revocations          │
│  KeyPolicy (CKD app) authorises MPC key derivations per job/listing path   │
│  Assurance           bonds · challenges · k-of-n · assurance pool          │
│  Audit               hash-chained event log (NEP-297 events)               │
└──────┬─────────────────────┬──────────────────────┬────────────────────────┘
       │ CKD request         │ verdicts, certs      │ payouts / refunds
       ▼                     │                      ▼
  NEAR MPC network      ┌────┴──────────────┐   NEAR Intents verifier (intents.near)
  (threshold BLS,       │ APPRAISAL ROOMS   │   · bridges to other chains
   key encrypted to     │ TDX / SEV-SNP CVM │   · Confidential Intents (FAR)
   room's ephemeral     │ + NVIDIA CC GPU   │   Chain Signatures (native payouts)
   key)                 │ appraisers · LLM  │
                        │ judges · sealing  │
                        └────┬──────────────┘
                             │ ciphertext only
                             ▼
                      Blob store (S3 / Arweave / Filecoin): sealed goods, sealed
                      contexts, sealed deliveries, certificate bodies
```

#### 4.3.2 Core objects

On-chain fields are kept to commitments, integers and identifiers. Plaintext and ciphertext never go on-chain. LETHE v0 stores ciphertext on-chain; production moves it off-chain (§4.15).

| Object | Key on-chain fields | Off-chain body | Notes |
|---|---|---|---|
| **Listing** | `listing_id`, `seller`, `asset_class`, `good_commitment` (salted hash), `ciphertext_ref` + hash, `key_path` (CKD derivation path), `appraiser_version`, `output_schema_hash`, `pricing_rule` + parameters (ask, P_min, P_full, reserve, k), `max_copies`, `ℓ_floor`, `leakage_budget_mbits`, `price_per_bit`, `sub_budget_per_identity`, `pinned_measurements[]`, `value_class`, `challenge_window`, `category`, `licence_class`, `dossier_hash`, `eligibility` (identity tiers, minimum anonymity set), `publish_height`, `status` | Sealed good, seller attestations, provenance dossier | The commitment is **salted**. A plain hash of a low-entropy good (a yes/no forecast, an address) can be brute-forced. LETHE v0 stores an unsalted SHA-256 (§4.15). |
| **Context snapshot** | `snapshot_id`, `owner_commitment`, `content_hash`, `anchor_height`, `kind` (notes / data-index / eval / model) | Sealed context | Value-indexed listings accept only snapshots with `anchor_height < publish_height` (AC-6). |
| **Job** | `job_id`, `listing_id`, `buyer_ref` (an account or a nullifier), `snapshot_id`, `budget`, `mode` (blind / scored fields), `max_debit`, `fee_paid`, `deadline_height`, `assigned_rooms[]`, `state` | Sealed per-job inputs | Created by `request_appraisal`. |
| **Verdict** | `job_id`, `listing_id`, `snapshot_id`, `appraiser_version`, `components[]` (integers), `llm_factors[]` + model-identity proofs, `shown_fields[]`, `delivery_commitment` (if a deal is possible), `forget_cert_hash`, `room_key`, `attestation_ref`, `nonce`, signature | Full job log (signed, sealed to the governance audit key) | The contract recomputes the price from `components` and `llm_factors` (AC-1). |
| **Settlement record** | `job_id`, `outcome` (`Deal` / `NoDeal` / `Timeout` / `Fault` / `Revoked` / `DeliveryFailure`), `V`, `price`, `fees[]`, `refund`, `leakage_debit`, `leakage_comp`, `held_until`, `payout_route`, `cert_hashes[]`, `audit_head` | — | Must be replayable from public data (AC-35). |
| **Forget certificate** | `cert_hash` (anchored) | Certificate body (§4.10) | Verifiable offline (AC-27). |
| **Room registration** | `room_key`, `measurement` (MRTD, RTMR0–3 digests), `platform_id` (PPID), `vendor`, `operator`, `tcb_status`, `gpu_evidence_ref`, `expires_at`, `cap_used` | Quote, GPU evidence | §4.6. |
| **Entitlement** (use-rights) | `entitlement_id`, `listing_id`, `holder_ref`, `scope` (queries, tokens, hours), `meter`, `expiry` | — | §4.9.3. |

#### 4.3.3 Listing lifecycle

```
Draft ──(ciphertext + key path + schema + bond)──▶ Screening ──(in-room category screens pass)──▶ Active
  Active ──(governance / cap / TCB event)──▶ Paused ──▶ Active
  Active ──(leakage budget spent)──▶ Exhausted ──(seller top-up)──▶ Active
  Active ──(max_copies reached)──▶ SoldOut
  Active ──(expiry / withdrawal)──▶ Closed ──(seller deletes ciphertext; key path retired)──▶ Archived
  Screening ──(flagged)──▶ Held ──(withdraw | consented review)──▶ Closed | Active
```

During Screening, a room runs the asset-class category screens (MNPI, personal data, licence and prohibited content, §4.13) on the plaintext. It emits only pass or flag, and a forget certificate. Screening debits nothing from the leakage budget because no buyer sees its output.

#### 4.3.4 Appraisal job lifecycle

```
Requested ─(contract assigns room(s); caps & pins checked)─▶ Assigned ─(KeyPolicy authorises CKD; room derives keys)─▶ Computing
Computing ─(signed verdict(s) accepted)─▶ Verdicted
Verdicted ─(rule says no deal)─▶ NoDeal: refund budget · pay leakage comp · anchor forget cert
Verdicted ─(rule says deal)─▶ Deal: price moved to held · delivery committed · buyer-context cert anchored
Deal ─(delivery receipt + challenge window passes)─▶ Final: payout to seller via Intents/Chain Signatures
Deal ─(no delivery by deadline)─▶ DeliveryFailure: refund price
Any pre-Verdicted state ─(deadline passed)─▶ Timeout: full refund (AC-9)
Any pre-Final state ─(k-of-n disagreement | challenge upheld within W)─▶ Fault: refund (incl. held price); operator slashing
Any pre-Final state ─(revocation of the assigned room)─▶ Revoked: refund or re-assign
```

#### 4.3.5 Two execution paths

NEAR's yield/resume lets one transaction wait for an off-chain response. A yielded call times out after **200 blocks** ([NEAR docs](https://docs.near.org/smart-contracts/anatomy/yield-resume)), which is about 2 minutes at NEAR's *reported* ~600 ms block time. That figure is derived, not documented as a duration; the block time comes from NEAR announcements seen in search results. A planned 200 ms-block upgrade would shrink the window to about 40 s if the 200-block constant stays. GPU lift tests take far longer. So:

- **Jobs are always state records with deadlines.** A job never depends on a single transaction staying open.
- **Fast path (knowledge goods).** `request_appraisal` optionally yields so the buyer's call returns the outcome in one round trip. The room's `submit_verdict` resumes it. If the yield times out, the job simply continues on the asynchronous path. This differs from LETHE v0, where a timeout means a refund.
- **Async path (datasets, models, evals, multi-room).**
  1. `request_appraisal` creates the job.
  2. The rooms post `submit_verdict` transactions whenever they finish.
  3. The contract settles on the verdict, or on the k-th matching verdict.
  4. Anyone can call `refund_expired(job_id)` after the deadline.
- **MPC calls inherit the yield limit.** The MPC network's own sign and derive calls also yield, so key derivation retries must fit inside 200 blocks.

### 4.4 Layers and NEAR primitives, with maturity status

The status column reflects what was verifiable on 2026-11-11. Several statements in MOONSHOT §4.2 have been corrected here; the corrections are listed after the table.

| Layer                             | Function                                                                                                 | NEAR primitive and status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Off-NEAR dependency                                                                   | v0 (LETHE) today                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **L0 Clearing**                   | Listings, jobs, escrow, pricing rules, leakage ledger, caps, settlement, fees, refunds                   | NEAR smart contracts (Rust, near-sdk): **GA**. Yield/resume: **GA**, 200-block timeout ([docs](https://docs.near.org/smart-contracts/anatomy/yield-resume)). Function-call access keys: **GA**. They can be restricted to one contract and method list and cannot attach deposits ([docs](https://docs.near.org/protocol/access-keys)). Storage staking: 10¹⁹ yoctoNEAR per byte ([docs](https://docs.near.org/protocol/storage/storage-staking)). A ~104-byte certificate anchor therefore locks about 0.001 NEAR (derived).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                     | Contract on testnet: listings, escrow, yield/resume, integer-bps price recomputation, surplus split, refunds, timeout |
| **L1 Vault & key release**        | Goods encrypted at rest. Keys released only to approved room code, per job                               | **MPC Confidential Key Derivation (CKD)**. Threshold BLS on BLS12-381. The key is bound to `app_id` = the account of the *calling contract*, plus an optional derivation path. It is returned ElGamal-encrypted to the app's fresh key and can be re-derived on different hardware. Verifiability is private only; public verifiability is "planned" ([NEAR One, 2026-02-23](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)). **Status:** no official mainnet launch post found. OutLayer's production keystore uses it ([OutLayer docs](https://app.outlayer.ai/docs/vaults)). **MPC network:** NEAR states an 11-of-17 signing threshold on TEE-backed nodes (NEAR X article, read via repost). An independent review reports 11-of-16, TEE-backed only since about Oct 2026, with no proactive refresh, and notes that "1 participant can DoS" ([alinush.github.io/near](https://alinush.github.io/near), SECONDARY).                                                                                                                                                                                                   | Blob storage for ciphertext (S3, Arweave or Filecoin)                                 | X25519 sealed boxes. Ciphertext and an unsalted plaintext hash on-chain.                                              |
| **L2 Appraisal rooms**            | Fixed-program TEEs that load good and context, run appraisers, and emit signed, quantised verdicts       | **Marginal's own RoomRegistry contract**, verifying Intel TDX quotes on-chain with `dcap-qvl`. It is forked from the `near/mpc` attestation crate as used in `shade-attestation`. That code checks TCB status, MRTD/RTMR measurements, compose-hash, report-data binding and a PPID allowlist ([Shade agent-contract reference](https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/reference/agent-contract.md)). **The Shade Agent Framework itself is deprecated**: "not maintained since April 19, 2026" ([docs.near.org](https://docs.near.org/ai/shade-agents)). NVIDIA GPU evidence: **no on-chain verifier found**, so it is checked off-chain (§4.6). **NEAR AI Cloud** private inference (TDX + NVIDIA TEE; per-response signatures over `model:request_hash:response_hash`): **GA**, but only 13 of 63 listed models are NEAR-hosted "Private TEE" ([near.ai/models](https://near.ai/models); the homepage says 11). The other 46 "Incognito" models carry "No hardware privacy guarantee". **NEAR AI Confidential GPU Marketplace** (2026-02-23): launched; no public GPU list or price list found. | Intel TDX, AMD SEV-SNP and NVIDIA confidential computing; vendor attestation services | Local-mode enclave. **Attestation simulated** (labelled).                                                             |
| **L3 Delivery**                   | Sealed copy, use-rights (query, train or run in a room), weights-in-vault                                | Contract-recorded entitlements. Room-signed usage receipts as metering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                     | Copy sealed to the buyer's key                                                                                        |
| **L4 Assurance**                  | Forget certificates, audit hash chain, bonds, challenges, k-of-n agreement, payout guard, assurance pool | Contract storage for anchors. NEP-297 events. Chain Signatures behind a policy guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 7Block Labs-style audit ledger and dossier generator (founder-reported, §4.15)            | Forget-certificate hash on-chain. ChainProof Guard (testnet).                                                         |
| **L5 Settlement & trade privacy** | Fund from any chain. Pay sellers in any supported asset and chain. Optionally hide who bought what.      | **NEAR Intents** verifier (`intents.near`). A contract can hold balances there, withdraw with 1 yoctoNEAR and check the result in a callback. `auth_call` lets a signed intent batch call a contract ([near/intents](https://github.com/near/intents)). The docs list **32** chains, while NEAR marketing says "35+" ([chain support](https://docs.near-intents.org/resources/chain-support.md)). **No testnet deployment.** The verifier is pausable. Cross-chain legs run through bridges with their own trust models ([bridging docs](https://docs.near-intents.org/integration/bridging/overview.md)). **Confidential Intents** runs on **FAR**, "a permissioned instance of the NEAR protocol operated by a small validator set". Data is hidden from the public, not from FAR's operators, and access is partner-gated ([docs](https://docs.near-intents.org/integration/market-makers/confidential-intents.md)). **Chain Signatures** supports secp256k1 and ed25519 domains ([docs](https://docs.near.org/chain-abstraction/chain-signatures)).                                                                                | Bridges (Omni, POA, HOT)                                                              | Solana payout address derived via Chain Signatures. Mainnet 1Click quote with `dry: true` only.                       |
| **L6 Agent access**               | Programmatic buyers and sellers, with spend firewalls                                                    | Function-call keys. **IronClaw**, NEAR AI's TEE agent runtime, where "secrets never reach the model". **NEAR AI Agent Market** (2026-02-04), which has escrow and a dispute agent for task work ([NEAR AI](https://near.ai/blog/introducing-near-ai-agent-market)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | x402 / AP2 adapters (Stage 3, behind the guard)                                       | ChainProof Guard                                                                                                      |

**Corrections to MOONSHOT.md §2 and §4.2**

1. **CKD.** CKD does not by itself "seal a good to a codehash". It binds keys to the calling contract's account, and that contract (Marginal's KeyPolicy) performs every attestation and policy check. **The upgrade authority over that contract is therefore part of the trust base** (§4.11).
2. **Shade Agents.** They are no longer a dependency. Marginal forks and owns the attestation-verification code and its audit.
3. **Confidential Intents** is not a "private shard" of public NEAR. It is a separate permissioned network (FAR) with a small validator set.
4. **Volume and chain counts.** NEAR Intents volume is **$37.3B cumulative to 2026-11-10**, not $34.9B, and trailing-year fees are $53.5M (DefiLlama API, [volume](https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume), [fees](https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees); aggregator data). The chain count is 32 per the docs.
5. **One yield/resume flow.** "One yield/resume flow" for appraisal plus settlement is not feasible for long jobs (§4.3.5).
6. **DCML paper ID.** arXiv 2410.13752, cited in the competitor notes as NEAR's DCML paper, is in fact an Atoma Network paper ([arXiv](https://arxiv.org/abs/2410.13752)).

**Recent incidents relevant to these layers**

- **NEAR AI SGLang incident (2026-11-08/09).** A vulnerability in the SGLang inference engine gave an attacker code execution on one inference server, with access to "requests in processing on that server, including confidential ones". NEAR AI wrote: "Confidential computing protects data from the operator and the host. It does not protect against a vulnerability in the software running inside the environment" ([NEAR AI incident report](https://near.ai/blog/security-incident-report-sglang-vulnerability)).
- **NEAR Intents exploit (2026-10-01).** About $3.8M was taken through "a bug in the Omni deposit and withdrawal infrastructure interaction with NEAR Intents smart contract". Services were halted, and the funds were reportedly returned ([The Block](https://www.theblock.co/news/ecosystems/2026-10-01-near-intents-halts-services-after-3-8-million-exploit-417404), SECONDARY).

Both incidents shape the design. Rooms run minimal, pinned software and use no shared inference servers for sealed goods (§4.6). Refunds do not depend on Intents being live (§4.9).

### 4.5 Vault, keys and key release

#### 4.5.1 Key hierarchy

| Key | Created by | Protects | Lifetime |
|---|---|---|---|
| **DEK_g** (per good) | Seller client, random 256-bit | The good, encrypted with an AEAD cipher (XChaCha20-Poly1305 or AES-256-GCM) after canonicalisation together with a random salt | Life of the listing version |
| **K_L** (per listing version) | MPC CKD, path `listing/{listing_id}/v{n}`, app = KeyPolicy contract | Wraps DEK_g. An X25519 key pair (sk_L, pk_L) is derived from K_L with HKDF, and DEK_g is sealed to pk_L. | Re-derivable by any approved room while the path is authorised |
| **DEK_c** (per context snapshot) | Buyer client | The buyer's sealed context | Life of the snapshot |
| **K_C** (standing contexts only) | MPC CKD, path `context/{owner_commitment}/{snapshot_id}` | Wraps DEK_c, so that offline buyers can join rounds and tenders | Re-derivable while authorised |
| **Room keys** | Generated inside the TEE at boot | Signing key: verdicts, certificates, delivery receipts. X25519 key: receives CKD output and ad-hoc contexts. | One registration period |
| **Job ephemeral keys** | Room, per job | Per-job transport keys and working buffers | Destroyed at job end; listed in the forget certificate |
| **Buyer delivery key** | Buyer, given in the job request | Receives DEK_g, sealed, on a deal | Buyer-controlled |

#### 4.5.2 How sellers seal to a key nobody holds yet

CKD returns a secret only to an approved app, so a seller cannot encrypt to K_L directly. Two options:

- **Option A (uses only documented features; the v1 default).** When a listing is created, the contract authorises one *provisioning* derivation of `listing/{id}/v{n}` to an approved room.
  1. The room derives K_L, publishes pk_L signed with its registered key, and wipes K_L.
  2. The seller seals DEK_g to pk_L.
  3. Provisioning counts against the platform's value cap like any other release (§4.7.5).
- **Option B (needs confirmation before use).** CKD's output has the algebraic form *msk·H(id)* in G1, with a public key *msk·G2*. That is the shape of a Boneh–Franklin identity-based-encryption private key, which drand's timelock encryption also relies on.
  - If NEAR One confirms this, and a cryptographic review covers domain separation and the extra *pk* term inside *H*, a seller could encrypt DEK_g to the identity (KeyPolicy account, path) using only the MPC public key. No room would touch the listing before its first appraisal.
  - **This is our inference from the published construction ([NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)). It is not a documented NEAR feature.**

#### 4.5.3 Derivation policy (KeyPolicy contract)

KeyPolicy is the CKD "app": the MPC network binds keys to its account and performs no attestation check of its own. A derivation request for path *P* by a room *R* is authorised only if all of the following hold:

1. **R's registration is current.** It is not expired or revoked; its measurement is in the global approved set; and, for listing paths, its measurement is also in the listing's `pinned_measurements` (AC-18, AC-21).
2. **A job authorises the path.** There is a job *J* in state `Assigned` to *R* with *P* ∈ *J*.paths. Standing-context paths additionally need the buyer's signature over *J*.
3. **Caps hold.** Value at risk on *R*'s platform (PPID) this epoch, plus the listing's value class, does not exceed the platform cap. The listing's per-epoch release count is under its limit (AC-19).
4. **Nothing is paused.** No pause or revocation applies to *R*'s TCB level, vendor or operator (AC-20).

Every authorisation emits an event (job, room, platform, path hash, value class), so the verifier can recompute value at risk.

**Upgrade authority is the critical trust point.** Whoever can upgrade KeyPolicy can redirect every key. KeyPolicy is therefore **immutable per version**.

- A new version is a new contract account, so a new `app_id` and new keys.
- Migration is a seller-authorised re-sealing job: a room approved under both versions re-wraps DEK_g.
- Governance cannot silently re-point keys. At worst it can deploy a new version that sellers decline to migrate to.

#### 4.5.4 Blast radius

| Compromise | What leaks | Bound |
|---|---|---|
| One platform physically broken, with its attestation key extracted (TEE.fail class) | K_L for listings released to that platform while it was compromised, and the contexts of jobs on it. The attacker can also forge quotes *as that platform*. | That platform's per-epoch value cap, because caps apply per PPID, not per room key. Duplicate PPID registrations and anomalous release rates trigger alerts and revocation. |
| Room software bug, in the style of the NEAR AI SGLang incident | Data in jobs running on the vulnerable software | Per-job isolation (§4.6). Revocation of the affected measurement. |
| MPC collusion at or above threshold | Every derivable key | Inherent to CKD. NEAR states the threshold is 11-of-17 (§4.4). Residual risk is accepted and disclosed (§4.11). |
| KeyPolicy upgrade key | Nothing, because KeyPolicy is immutable per version (§4.5.3) | A malicious new version needs sellers to migrate. |
| Blob store | Ciphertext only | — |

#### 4.5.5 Rotation, retirement and crypto-agility

- **Rotation.** Listing keys are versioned (`v{n}`). Rotation is a re-sealing job.
- **Retirement.** A retired path is never authorised again. Any party that obtained K_L earlier still holds it, which is exactly why caps apply at release time.
- **Post-quantum.** NEAR states CKD "uses recovery keys that are not post-quantum secure" (NEAR X article, 2026-10-22, read via repost). X25519 is not post-quantum either.
  - For goods whose value outlives a plausible quantum horizon, a harvest-now-decrypt-later attack on blob-store ciphertext is a long-tail risk.
  - Stage 3 adds hybrid ML-KEM sealing (§9).

#### 4.5.6 Fallback if CKD is unavailable

The fallback is a self-operated, attested, threshold key-management service: k-of-n operators running attested key holders. NDAI TrustKit uses Shamir splitting in the same spirit.

The fallback is **not** a hosted dstack KMS. The Shade documentation warns that on Phala Cloud the host can approve app composes for an app ID and so obtain that app's key (paraphrased from the [Shade security notes](https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/concepts/security.md)). Using that service would add Phala to the trust base.

### 4.6 Appraisal rooms

A room is a confidential VM, optionally with confidential-computing GPUs, running one of a small number of fixed, audited programs. It is the only place where a good and a buyer's context exist in plaintext together.

#### 4.6.1 Room classes

| Class | Hardware | Runs | Path | Stage |
|---|---|---|---|---|
| **S-room** (screening) | Intel TDX CVM + 1 CC GPU | Category screens at listing time (MNPI, personal data, licence, prohibited content) | async | v1 |
| **K-room** (knowledge) | Intel TDX CVM + 1 CC GPU (Hopper or Blackwell) | Claim segmentation, embeddings, NLI, novelty; judge models | fast | v1 |
| **G-room** (GPU-heavy) | TDX CVM + multi-GPU **Blackwell** only. NVIDIA documents multi-GPU NVLink as encrypted on Blackwell and unencrypted on Hopper ([NVIDIA CC threat model](https://docs.nvidia.com/confidential-computing/virtual-machines/threat-model)). | Dataset overlap, proxies, lift tests, model-vs-model evals, eval runs | async | v2 |
| **D-room** (delivery / use-rights) | As K or G | Serves entitlements: Q&A over a memo, metered queries, weights-in-vault inference | online | v2–v3 |
| **SEV-SNP variants** | AMD SEV-SNP CVM (SMT off) + CC GPU | Same programs, as a second CPU-TEE vendor for k-of-n | as above | v2 |

**Performance basis.** On Blackwell B200 with TDX, a tuned stack shows "about 1-3%" throughput overhead, while stock stacks incur "30 to 40%" from avoidable configuration. The same work ran a 120B-parameter MoE model on a single B200 ([arXiv 2608.26575](https://arxiv.org/abs/2608.26575)). On H100, the penalty is 4–8% for inference ([arXiv 2509.18886](https://arxiv.org/abs/2509.18886)). With model swapping on one H100, non-CC throughput is 45–70% higher than CC ([arXiv 2505.16501](https://arxiv.org/abs/2505.16501)), so rooms keep models warm, and stack tuning is a budgeted engineering task.

Training overhead under CC may be considerably higher than inference overhead. One third-party benchmark reports 18–32%; that figure is unverified. This matters for lift-test pricing (§4.18).

**Not claimed.** HBM is not encrypted on either GPU generation. NVIDIA says "GPU memory encryption is not the protection mechanism". Blackwell is "TEE-I/O capable", but NVIDIA's CVM documentation still describes bounce buffers, so bounce-buffer metadata leakage ([arXiv 2507.02770](https://arxiv.org/abs/2507.02770)) is assumed to persist.

#### 4.6.2 Image, measurement and build

**Room identity is a set of measurements, not one hash**

- MRTD and RTMR0–2 cover firmware, kernel and boot configuration.
- RTMR3 covers the application compose hash, with all image digests, plus the key-provider identity, following the dstack model ([Phala chain-of-trust docs](https://docs.phala.com/phala-cloud/attestation/chain-of-trust)).
- For SEV-SNP, the launch measurement plus a policy covering minimum firmware and SMT.

**Build**

- The build is reproducible, and two independent builders must reproduce the measurement (AC-52).
- Every approved measurement is published with its source in a public transparency log, as in Apple's Private Cloud Compute ([Apple Security](https://security.apple.com/blog/private-cloud-compute/)).

**Image hardening**

- No SSH or debug interfaces; a read-only root filesystem; no swap; **no persistent volumes**.
- The Shade documentation warns that disk state carries across image upgrades under a stable app ID, which would break non-persistence ([Shade security notes](https://raw.githubusercontent.com/NearDeFi/shade-agent-framework/main/docs/concepts/security.md)).
- **Minimal, pinned software.** The NEAR AI SGLang incident (§4.4) showed that a bug in the inference engine *inside* a TEE exposed confidential requests. Rooms therefore:
  - pin and audit their inference engines;
  - disable features they do not use;
  - never serve more than one job per process.

#### 4.6.3 Registration and attestation

1. **Boot.** At boot the room generates an ed25519 signing key and an X25519 key inside the TEE. It requests a TDX quote whose `report_data` = SHA-256(public keys ‖ registry nonce). It requests NVIDIA GPU evidence bound to the same digest.
2. **On-chain checks.** `RoomRegistry.register(quote, collateral, gpu_evidence_ref)` runs `dcap-qvl` in the contract, which is the same mechanism NEAR's MPC nodes use. It checks:
   - quote signature and collateral freshness;
   - TCB status against the **attestation policy** (§4.6.4);
   - measurement ∈ approved set;
   - PPID ∈ platform allow-list;
   - non-debug;
   - report-data binding.
3. **GPU evidence is checked off-chain.** No on-chain NVIDIA verifier was found. The evidence goes to NVIDIA's Remote Attestation Service or the local verifier. Intel Trust Authority's GPU check also delegates to NRAS ([ITA docs](https://docs.trustauthority.intel.com/main/articles/concept-gpu-attestation.html)). At least *k* independent attesters post signed corroborations on-chain before the registration activates; this is the ChainProof Guard k-of-n pattern (§4.15).
4. **Binding GPU evidence to the CPU TEE.** NVIDIA GPU attestation is not bound to a specific CVM. TEE.fail relayed genuine GPU reports from GPUs the attacker did not own ([tee.fail](https://tee.fail)). Rooms therefore:
   - bind GPU evidence to the TDX report through the shared nonce;
   - treat GPU CC as **dependent on the CPU TEE**, never as an independent vendor (§4.11).
5. **Expiry.** Registrations expire after a short period (target: 24 h) and must re-attest. Vendor revocation reaches rooms through collateral refresh. Intel's remedy for TEE.fail was certificate revocation, so a verifier with stale collateral keeps accepting forged quotes (tee.fail; Intel community advisory, read via search summary).

#### 4.6.4 Attestation policy (a versioned on-chain object)

| Policy item | Basis |
|---|---|
| Minimum TDX module version (TEE_TCB_SVN); live migration and partitioning disabled | Google–Intel review of TDX Module 1.5 found a host-to-TD full-compromise bug, since patched ([arXiv 2602.11434](https://arxiv.org/abs/2602.11434)) |
| SEV-SNP: minimum firmware with the BadRAM fix; SMT off; minimum microcode | BadRAM (<$10, fixed in firmware) ([badram.eu](https://badram.eu)). StackWarp (CVE-2025-29943) per press reports, SECONDARY. |
| Collateral and CRL freshness SLA (target: ≤ 24 h) | Revocation-based remedies only work with fresh collateral ([tee.fail](https://tee.fail)) |
| **Platform allow-list (PPID / chip ID)** tied to vetted operators and facilities | Attestation "provides no evidence of the processor's physical location" ([Flashbots, 2026-04-12](https://writings.flashbots.net/mind-the-gap-tee-poc)). The PPID allow-list is the available hook. |
| Automatic admission freeze on public disclosure of a relevant attack | Secret Network's response to SGX.fail took weeks to months, and past data could not be protected ([sgx.fail](https://sgx.fail)) |
| Value caps per platform (§4.7.5) | Physical attacks cost <$10 to ~$1,000 in hardware (§4.12, T1) |

#### 4.6.5 Job execution

- **Isolation.**
  - Each job runs in a fresh process with its own GPU context.
  - Jobs in value class ≥ H run in a fresh CVM.
  - No KV or prefix cache is shared across jobs. PromptPeek-style attacks on shared caches reconstructed 95–99% of prompts in the cited evaluation, as tabulated in [arXiv 2508.08438](https://arxiv.org/abs/2508.08438).
  - Multi-GPU rooms get whole nodes, never a shared NVLink fabric. NVBleed shows NVLink contention channels across VMs outside CC ([arXiv 2503.17847](https://arxiv.org/abs/2503.17847)).
- **Shape padding.** Inputs are padded to size classes, and verdict submission waits for the end of a declared duration class (AC-16).
- **Egress.** An in-room firewall allows only:
  - NEAR RPC and contract calls;
  - the blob store;
  - attested inference endpoints listed in the manifest.

  Everything else is dropped and logged (AC-22).
- **Job log.** A signed job log records input hashes, model hashes, step timings and policy decisions, never plaintext. It is sealed to the governance audit key and used only in disputes.
- **Teardown.** Buffers are zeroised, ephemeral keys destroyed, and the process (or CVM) is torn down. The forget certificate is then signed (§4.10).
- **Assignment.** Room assignment is randomised among eligible rooms, so an attacker controlling one platform cannot steer a chosen listing to itself. This adapts Apple PCC's non-targetability property.

#### 4.6.6 Judge models

- **Self-hosted by default.** Judges are open-weight models running inside Marginal's own rooms. Their weights hash is part of the measured manifest.
- **Two judges from different model families**, combined by `min` and floored (§4.7.1).
  - Decoding: temperature 0, schema-constrained, with batch-invariant kernels where available.
  - Pairwise or comparative prompts are preferred to absolute scores. Universal adversarial phrases transfer across judges and are more effective against absolute scoring ([arXiv 2402.14016](https://arxiv.org/abs/2402.14016)).
  - Judges are fine-tuned with an injection defence such as SecAlign ([arXiv 2410.05451](https://arxiv.org/abs/2410.05451)) before use.
- **Optional external judge.** NEAR AI Cloud's "Private TEE" tier may be used only if the seller opts in, because the good's text then leaves Marginal's room for NEAR AI's enclave. Two further limits:
  - NEAR AI signs each response over `model:request_hash:response_hash`, but "instances of the same model share one signing key", so a receipt does not identify the serving instance ([NEAR AI docs](https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md)).
  - NEAR AI's SGLang incident shows the residual risk of a shared serving stack.

#### 4.6.7 Verifiability beyond attestation (defence in depth)

| Technique | Use in Marginal | Status of evidence |
|---|---|---|
| Provider receipts (signature over request and response hashes) | Model-identity proof for external judges; checked on-chain (LETHE v0 already does `ecrecover`) | In production at NEAR AI |
| TOPLOC activation commitments | A second room spot-checks that the declared model processed the declared input. Cost: 258 bytes per 32 tokens; validation "significantly faster" than inference; detected model, prompt and precision swaps with 100% accuracy in the authors' tests ([arXiv 2501.16007](https://arxiv.org/abs/2501.16007)). The earlier "up to 100×" figure appears only in v1. | Paper (ICML 2025 per search summaries) |
| Output verification against weight exfiltration | For weights-in-vault serving: "reduces exfiltratable information to <0.5% with false-positive rate of <0.01%" on MoE-Qwen-30B ([arXiv 2511.02620](https://arxiv.org/abs/2511.02620)) | Paper |
| Zero-knowledge proofs of small deterministic scorers | Embedding or classifier sub-models where proving is practical ([Jolt Atlas, arXiv 2602.17452](https://arxiv.org/abs/2602.17452)). Not for LLM judges: zkLLM proves a 13B inference in under 15 minutes ([arXiv 2404.16109](https://arxiv.org/abs/2404.16109)), and zkFinGPT reports 620 s per proof for Llama3-8B ([arXiv 2601.15716](https://arxiv.org/abs/2601.15716)). | Research; v3 at the earliest |
| Zero-knowledge training proofs (post-deal licence compliance) | Rare post-deal audits only. VeriLoRA runs about three orders of magnitude slower than training, about 2–4 min per single-sample step ([arXiv 2508.21393](https://arxiv.org/abs/2508.21393)). VFT's dataset-binding numbers cannot be reproduced from what is published ([arXiv 2510.16830](https://arxiv.org/abs/2510.16830)). | Research |

#### 4.6.8 Capacity

**Sources**

- Rooms on operator-owned hosts in vetted facilities.
- NEAR AI's Confidential GPU Marketplace, once a job API and pricing are published (none found as of 2026-11-11).
- Other GPU-TEE clouds. One search snippet lists Phala H200 TEE capacity "from $3.50/GPU/hr"; it was not fetched and is unverified.

**Diversity rule for k-of-n classes:** the rooms must differ in **CPU-TEE vendor × operator × facility** (§4.11).

### 4.7 Mechanism: what the contract enforces and what the AI may do

**Principle.** *The room measures. The contract prices.* Every movement of money is computed and executed by contract code from signed integer components. Model judgement is an input with a bounded, one-directional effect. Checks that something is safe (attestation, policy) are done by contract or deterministic code, never delegated to an LLM: across 10 LLMs tested, agents "can reliably detect danger signals but cannot reliably verify safety" ([arXiv 2603.19011](https://arxiv.org/abs/2603.19011)). LETHE v0 already implements this principle (§4.15); this section generalises it.

#### 4.7.1 Measured value

All quantities are integers in basis points (bps, 0–10,000) or in the smallest unit of the settlement asset.

- **B**: the buyer's escrowed budget, i.e. the most the buyer will pay for a good of full measured value.
- **Appraiser output**:
  - deterministic components *c₁…c_k*, reproducible bit-for-bit, or within a declared tolerance across vendors;
  - judgement factors *ℓ₁…ℓ_j*, from LLMs or other non-reproducible models.
- **Deterministic ceiling** *D = F_class(c₁…c_k)*. *F_class* is one of a small set of formulas implemented in the contract and selected by the appraiser version registered for the listing. The contract never evaluates arbitrary code.
- **Judgement factor** *L = max(ℓ_floor, min(ℓ₁, …, ℓ_j))*. Each ℓ_i is first clamped to [0, 10,000]. ℓ_floor is chosen by the seller per listing, with a default per asset class.
- **Measured value index** *m = D × L / 10,000*.
- **Buyer-relative valuation** *V = B × m / 10,000*.

**Properties** (AC-2; they follow from the definitions):

- *m ≤ D*: judgement can lower the measured value but never raise it.
- *m ≥ ℓ_floor × D / 10,000*: judgement can remove at most the share (1 − ℓ_floor) of the deterministic ceiling.
- A seller who injects instructions into a good can at best leave the price unchanged.
- A buyer who injects instructions into a stated need can lower the price only within the floor band the seller accepted.

**Why these two rules.** Taking the minimum across judges protects buyers from a seller who fools one judge. The cost is that a buyer can exploit whichever judge is easiest to fool. The floor caps that exploit. The trade-off is deliberate, and the seller chooses the setting.

**Economic anchor.** A buyer's willingness to pay for supplemental information depends on what the buyer already knows. Bergemann, Bonatti and Smolin show this formally: "His willingness to pay for supplemental data is determined by the quality of his initial private information" ([AER 2018, DOI 10.1257/aer.20161079](https://doi.org/10.1257/aer.20161079)).

In that vocabulary:

- an *appraisal* sells an information structure about the good;
- a *purchase* sells the good itself, the realisation;
- Bergemann & Bonatti call these ex-ante and ex-post sales of information ([ARE 2019, DOI 10.1146/annurev-economics-080315-015439](https://doi.org/10.1146/annurev-economics-080315-015439)).

#### 4.7.2 Pricing rules

**Allocation and payment are separate.** The valuation decides *allocation*: whether there is a deal, and with whom. A fixed rule decides *payment*.

**Agents use structured inputs only.** They submit fields (budget, display mode, snapshot ID, round ID) and never negotiate in free text. In Microsoft's Magentic Marketplace simulations, assistant agents choosing among service proposals "exhibit severe first-proposal bias, creating 10-30x advantages for response speed over quality" ([arXiv 2510.25779](https://arxiv.org/abs/2510.25779)).

The seller chooses one rule per listing:

| Rule | Deal if | Who pays what | Incentive property | Default use |
|---|---|---|---|---|
| **R1 Posted price** | V ≥ ask | Buyer pays the ask | Payment does not depend on B, so reporting the true B is a dominant strategy. A buyer who deflates its own *m* (for example by stuffing context) can only lose the deal. | Single-buyer listings (the v1 default) |
| **R2 Value-indexed price** ("pay for marginal value") | V ≥ p(m) | Buyer pays p(m) = max(P_min, P_full × m / 10,000) | Truthful in B. The buyer *would* gain by deflating *m*, so the contract accepts only context snapshots anchored before the listing's publication (AC-6), and the seller sets P_min. | Knowledge goods where sellers want price to track novelty (v1) |
| **R3 Surplus split** (LETHE v0) | V ≥ ask | Buyer pays ask + (V − ask)/2 | **Not truthful.** The buyer gains by shading B toward ask/m. This is an instance of the general impossibility of efficient, truthful, budget-balanced bilateral trade ([Myerson–Satterthwaite 1983, DOI 10.1016/0022-0531(83)90048-0](https://doi.org/10.1016/0022-0531(83)90048-0)). | v0 compatibility and demos only. Deprecated in v1. |
| **R4 Sealed round** (k copies, many buyers) | Buyer's V_b is among the top k and ≥ reserve | Each winner pays max(reserve, V₍k+1₎), the same price for all | Uniform (k+1)-th-price rule. For a buyer who wants one copy and whose value is B × m, bidding the true B is dominant. *m* is measured, not reported. | Exclusive or limited-copy goods (v2) |
| **R5 Tender** (one buyer, many sellers) | Offers chosen to maximise Σ(V_s − ask_s) within the buyer's budget | Each winning seller is paid its *threshold* payment: the highest ask at which it would still have won | Truthful for sellers with private costs. In the data-market setting of [arXiv 2504.05563](https://arxiv.org/abs/2504.05563), "Myerson payment is the smallest IC and IR (for data sellers) payment rule" given the welfare-maximising allocation. The same paper shows leave-one-out and Shapley payments are not incentive-compatible. Buyer individual rationality there also needs subadditive buyer value. | AI-lab data requests (v2) |

**Prior art for buyer-relative pricing with a truthful payment rule**

- **Agarwal, Dahleh & Sarkar** price training data by its prediction gain on the buyer's task, using "a truthful, zero regret mechanism… based on utilizing Myerson's payment function" ([EC 2019, arXiv 1805.08125](https://arxiv.org/abs/1805.08125)).
- **PrivaDE** computes buyer-model-specific utility before purchase, using multi-party computation, with smart contracts that "enforce fair execution and payment" ([arXiv 2510.18109](https://arxiv.org/abs/2510.18109), ASIA CCS '26).
- **Marginal's difference** is the sealed two-sided context in TEEs, the on-chain clearing, and the leakage ledger. The pricing idea itself is not new.

**Where measured values change the incentive problem.** Myerson's optimal auction assumes buyers privately know their values ([Math. of OR 1981, DOI 10.1287/moor.6.1.58](https://doi.org/10.1287/moor.6.1.58)). When the room *measures* value, the incentive problem moves to what the buyer controls: the declared B and the sealed context. R1 and R4 are robust to both. R2 needs the snapshot rule.

**Seller surplus extraction.** A seller who can tailor prices to measured value can extract almost all surplus. In [arXiv 2412.18140](https://arxiv.org/abs/2412.18140), full customisation extracts first-best revenue and leaves "zero surplus to buyers". R1 and R4 leave buyers their surplus (V − price) by design. MOONSHOT §4.4's claim that the room can run "Myerson-style optimal reserve pricing" from measured valuations is withdrawn. Reserve recommendations, if offered (v3), come only from differentially private aggregates of past rounds.

**Correction to MOONSHOT.** MOONSHOT §3.1 cited "First-price auctions among LLM agents reach 1−1/e² welfare when sellers are substitutable" for data tenders. The cited result ([arXiv 2610.20587](https://arxiv.org/abs/2610.20587)) is a worst-case welfare *lower bound* when bidders' values are nearly independent given the prompt. Substitutability gets a separate bound, and the setting is agents bidding to serve prompts, not data procurement. It is therefore not used to justify R5.

#### 4.7.3 Exclusivity and copies

Information loses value to a trader as more traders hold it. Admati and Pfleiderer analyse direct versus indirect sale of information to traders ([Econometrica 1990, DOI 10.2307/2938355](https://doi.org/10.2307/2938355); [JET 1986, DOI 10.1016/0022-0531(86)90052-9](https://doi.org/10.1016/0022-0531(86)90052-9)). Every listing therefore declares `max_copies`, and the contract enforces it (AC-8). Buyers price exclusivity through R4: a listing sold as exclusive (k = 1) clears at the second-highest buyer-relative valuation. Use-rights deliveries do not count as copies unless the listing says so.

#### 4.7.4 Leakage budget

Every number shown before payment carries information about the good. Marginal treats that information as a metered, priced and capped quantity.

**Definitions**

- **Output schema.** Each listing declares the fields that may appear in a verdict, each with a finite alphabet *A_f* (for example, novelty in steps of 0.1 gives 11 values). The schema hash is stored on-chain (AC-11).
  - **Free-text fields are not allowed before payment**: a free-text output space is effectively unbounded.
  - **Every numeric field is quantised.** Unquantised scores can leak everything in one query; test labels have been inferred from a single reported log-loss score ([arXiv 2105.08266](https://arxiv.org/abs/2105.08266)).
- **Budget.** Each listing declares a budget *L_max* in millibits, a price per bit π, and optionally a per-identity sub-budget.
- **Debit.** Each appraisal debits *d = 1 + Σ_{f shown} log₂|A_f| (+ log₂ of the number of possible prices under R2)*.
  - The 1 is the deal/no-deal outcome. *d* is rounded up to millibits.
  - The contract reserves the job's maximum debit **before** the job runs, and refuses the job if the remaining budget is too small (AC-12).
  - Because the refusal depends only on public counters, never on the good, refusals themselves leak nothing. This is the "simulatable auditing" requirement ([Kenthapadi, Mishra & Nissim, PODS 2005, DOI 10.1145/1065167.1065183](https://doi.org/10.1145/1065167.1065183)).
- **Blind mode** is the default: the buyer sees only the outcome, so *d* = 1 bit (AC-13). Showing scores before payment is opt-in and priced.
- **Cached repeats.** An appraisal of an identical (listing, snapshot) pair returns the cached verdict and debits nothing extra.
- **Compensation.** The buyer pays π × *d* to the seller for every completed appraisal, deal or not (AC-15). Per-bit pricing is additive, so a buyer cannot assemble a fine-grained verdict more cheaply from coarse ones. That is the arbitrage-freeness requirement of query-based pricing ([Koutris et al., PODS 2012, DOI 10.1145/2213556.2213582](https://doi.org/10.1145/2213556.2213582)).

**What the bound guarantees.** For a deterministic interactive system, min-entropy leakage equals the log of the maximum number of outputs consistent with the adversary's adaptive strategy ([Mestel, CSF 2019, arXiv 1905.04332](https://arxiv.org/abs/1905.04332), Thm 4). So *n* adaptive appraisals with |O_i| possible verdicts leak at most Σ log₂|O_i| bits about the good. The same paper shows linear growth can actually occur (Thm 30), so the bound is not loose in the worst case.

The budget is **global per listing**, so the bound holds against any coalition of buyer identities. This is what makes Sybil probing *bounded*, not merely expensive. Without such a bound, enough accurate answers allow reconstruction, which is the classic Dinur–Nissim result ([PODS 2003, DOI 10.1145/773153.773173](https://doi.org/10.1145/773153.773173)). Per-identity nullifiers (§4.13) add a second, per-buyer limit.

**What the bound does not cover** (each item has a control or is an open question, §9)

1. **Bits are not value.** *k* bits bound only the multiplicative rise in an adversary's guessing success, a factor of at most 2^k. That follows from the min-capacity bound on g-leakage (Alvim et al., CSF 2012, [DOI 10.1109/CSF.2012.26](https://doi.org/10.1109/CSF.2012.26), as restated in Mestel). A good whose value sits in one bit (a trade direction, "does an exploit exist?") can be fully revealed by one appraisal.
   - *Control:* for low-entropy classes (signals, exploits), the schema allows **no content-correlated fields**, and sellers can mark facts that must never be appraised directly. Class defaults are calibrated by red-team tests (§8.8).
2. **Chosen-context probing.** A buyer can seal a one-claim "context", which turns `novelty` into a membership test for a claim of the buyer's choosing.
   - *Controls:* minimum context size; snapshots anchored a cooling period before the job (and before publication for R2); blind mode by default; per-identity nullifiers. The budget remains the hard bound.
3. **Side channels.** Timing, output sizes and GPU metadata are not counted. They are closed separately, through fixed duration classes, padding and per-job isolation (AC-16, AC-23).
4. **Purchased copies.** What a buyer does with a copy after a deal is outside the bound (§4.12, T20).
5. **Griefing.** A global budget lets a competitor exhaust a listing.
   - *Controls:* per-bit fees, per-identity sub-budgets, a reserved share of budget for identity-verified buyers, and seller top-ups. The economics are tested in §8.9.
6. **Correlated listings.** The same insight listed twice, or by two sellers, gets two budgets. Separate budgets for correlated secrets do not bound total exposure (Bordenabe & Smith, CSF 2016, [DOI 10.1109/CSF.2016.14](https://doi.org/10.1109/CSF.2016.14)). Screening flags near-duplicate listings, but this remains open (§9).
7. **Seller parameters leak.** The ask, budget size and per-bit price signal value. Ghosh and Roth show that loss induced by such reports cannot be compensated within the mechanism ([EC 2011, arXiv 1011.1375](https://arxiv.org/abs/1011.1375)).
8. **Randomised outputs.** Whether the same bound holds for sampled (non-greedy) LLM outputs was not verified. Judges therefore run at temperature 0 (§4.6.6).
9. **Choice of measure for datasets and evals.** For datasets and eval sets, differentially private outputs released under Ladder or Thresholdout rules protect individual records and items better than raw bit counts ([arXiv 1502.04585](https://arxiv.org/abs/1502.04585); [arXiv 1506.02629](https://arxiv.org/abs/1506.02629); [Dwork & Roth 2014, DOI 10.1561/0400000042](https://doi.org/10.1561/0400000042)). Those listings use both: a bit budget per listing, and a DP or Ladder release rule per field.

**Leakage in the other direction.** A seller learns something about buyers from outcomes: a no-deal means "this buyer already knew this". Funds care about this, because what they know is their edge. Controls:

- appraisal outcomes are never linked to buyer identities in public data;
- sellers see only aggregate counts;
- listings may not restrict eligibility below a minimum anonymity set;
- buyers can cap their own appraisals per period.

**Prior art and novelty claim.** Every ingredient exists already:

- counting output bits: quantitative information flow (Smith, FoSSaCS 2009, [DOI 10.1007/978-3-642-00596-1_21](https://doi.org/10.1007/978-3-642-00596-1_21); Mestel 2019);
- bucketing outputs to cap side-channel leakage in bits ([Köpf & Dürmuth, CSF 2009, ePrint 2009/089](https://eprint.iacr.org/2009/089));
- budgets that refuse further queries once spent (differential privacy);
- description-length bounds for reusing a holdout set ([arXiv 1506.02629](https://arxiv.org/abs/1506.02629));
- quantised, rate-limited leaderboards, which Blum and Hardt call "poorly understood heuristics" and replace with the Ladder ([arXiv 1502.04585](https://arxiv.org/abs/1502.04585));
- compensating data owners "according to their privacy loss" ([Li, Li, Miklau & Suciu, ICDT 2013, arXiv 1208.5258](https://arxiv.org/abs/1208.5258)).

MOONSHOT's "no prior implementation" is therefore narrowed. What we found nowhere is the **combination**: a per-listing, seller-set *bit* budget on an information good's appraisal outputs, depleted across all buyers, enforced by an on-chain contract, and paid per appraisal to the seller. That combination is the claim. A web search for the term "leakage budget" in information-market products found no use of it (§4.16).

#### 4.7.5 Value caps

- **Per platform.** The value at risk released to any single attested *platform* (PPID or chip identity, not room key) within an epoch is capped. Value at risk is the sum of the declared value classes of goods whose keys were released to rooms on that platform.
- **Per listing.** Key releases per listing per epoch are capped, consistent with the listing's leakage budget.
- **Global.** A global cap applies during each stage's canary.

Caps are enforced at **key release** (AC-19), not only at payout. An attacker who extracts a platform's attestation key can impersonate rooms on that platform and request keys; a short room-key lifetime does not stop this (§4.11, T1).

**Theory anchor.** NDAI models TEE security as a threshold: a secret is protected if its value ω ≤ Φ(k, p, C), a function of provider count, detection probability and penalty ([arXiv 2502.07924](https://arxiv.org/abs/2502.07924)). Caps operationalise that bound. Setting the cap level is an empirical calibration (§8.9).

#### 4.7.6 Bonds, challenges and multi-vendor agreement

- **Seller bond.** Slashed if a provenance misrepresentation is upheld: stolen data, a false licence, or a prohibited category.
- **Operator bond.** Slashed for invalid verdicts, non-delivery, or policy violations evidenced by signed job logs.
- **Challenger bond.** Forfeited if a challenge is frivolous. Successful challengers receive part of the slashed amount.
- **k-of-n verdicts.** At or above value class H, settlement needs ≥ 2 verdicts from rooms that differ in CPU-TEE vendor *and* operator (AC-24).
  - Deterministic components must agree within the appraiser's declared tolerance (default ±1 quantum).
  - Judgement factors combine by `min`.
  - Disagreement settles the job as `Fault`: the buyer is refunded, the seller is not paid, and an investigation opens.
  - **The trade-off.** Two rooms seeing the plaintext widens the confidentiality surface while removing a single point of integrity failure. Signal's SVR3 spreads trust across vendors by secret-sharing and never computes on plaintext ([OSDI 2024](https://www.usenix.org/conference/osdi24/presentation/connell)). Marginal cannot do that, because appraisal needs plaintext. That is why k-of-n applies only above H.
- **Optimistic challenge window.** Below H, a single room's verdict settles at once, but the seller's proceeds are held for a class-specific window *W*. Anyone may challenge with a bond during *W*, which triggers re-execution on another vendor.
  - This adapts the fraud-proof fallback of optimistic TEE rollups ([arXiv 2512.20176](https://arxiv.org/abs/2512.20176)), which uses ZK spot-checks on one TEE type.
  - *Cross-vendor* re-execution is Marginal's own extension, not something that paper proposes.
- **Determinism for re-execution.** LLM components run with batch-invariant kernels at temperature 0. Thinking Machines report that this made 1,000 of 1,000 temperature-0 completions identical, against 80 distinct completions with default kernels. In their test, 1,000 sequences on Qwen-3-8B took 42 s (55 s before their attention-kernel optimisation), against 26 s with default vLLM ([Thinking Machines, 2025-09-10](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/)). Cross-vendor tolerances are set empirically (§8.10).

#### 4.7.7 Truth-contingent tails (v3)

For goods whose truth is revealed later (forecasts), a share α of the price is held in escrow until a declared resolution event. It is then released according to a strictly proper scoring rule applied to the seller's stated probability. Under such rules, reporting one's true belief uniquely maximises expected score ([Gneiting & Raftery, JASA 2007, DOI 10.1198/016214506000001437](https://doi.org/10.1198/016214506000001437)).

"Select by auction now, pay by scoring rule after the outcome" has precedent in the mechanism-design literature ([Papakonstantinou et al., AIJ 2011, DOI 10.1016/j.artint.2010.10.007](https://doi.org/10.1016/j.artint.2010.10.007)).

Binary *factual* claims ("this dataset is licensed", "these wallets are one entity") are not forecasts. They are handled by seller bonds and challenges, not scoring rules. Legal limits on contracts that pay on future events are covered in §9.

#### 4.7.8 Atomic exchange is known engineering

Fair exchange without a trusted third party is impossible (Pagnia & Gärtner 1999). That technical report was not found online; it is cited via later papers. Smart contracts acting as the judge of a digital-goods exchange are established, e.g. FairSwap ([CCS 2018, DOI 10.1145/3243734.3243857](https://doi.org/10.1145/3243734.3243857)). In Marginal, the contract plus the attested room jointly play the trusted-third-party role. Marginal claims no novelty here (§4.9.4 states exactly where atomicity ends).

#### 4.7.9 Fees

| Fee | Basis | Paid by | Paid to |
|---|---|---|---|
| Clearing fee | bps of the cleared price, split between buyer and seller as configured | Buyer and/or seller | Protocol treasury, operator pool, assurance pool |
| Appraisal compute | Pass-through of room cost plus a margin | Buyer | Operators, protocol |
| Leakage compensation | π × *d* per appraisal | Buyer | Seller |
| Use-rights metering (v2–v3) | Per query, token or training-hour | Buyer | Seller, protocol |
| Challenge and bond flows | Per §4.7.6 | Losing party | Winning party, assurance pool |

Indicative rates are estimates and appear in §4.18.

### 4.8 Appraisers by asset class

**Rules for every appraiser**

1. Deterministic measurement first. Judgement only where it is unavoidable, and then only as a downward factor (§4.7.1).
2. Every appraiser version ships with:
   - a measured code hash;
   - a registered price formula;
   - an output schema with finite alphabets;
   - a **datasheet**: benchmark results, known failure modes, cost per job, and cross-vendor tolerance.
3. Outputs are aggregates. Item-level values (per-claim, per-example) never leave the room.
4. No appraiser makes live network calls with content derived from the good. In particular, fact-checking runs against an in-room snapshot of public corpora, never live web search. SAFE-style verification issues Google Search queries per fact, which from a room would leak the sealed claims ([arXiv 2403.18802](https://arxiv.org/abs/2403.18802)).

#### 4.8.1 Knowledge goods: memos, expert answers, research, due-diligence notes (v1)

**Inputs**

- **Seller:** a text good of up to N tokens (canonicalised from PDF or DOCX), topic tags, and optionally claimed sources.
- **Buyer:**
  - a notes-corpus snapshot;
  - a *stated need*: a structured question with topic tags and at most 300 characters of free text, filtered for instructions;
  - an optional opt-in to "public novelty".

**Pipeline**

1. **Segmentation (deterministic).** The good is split into sentences and paragraph units.
2. **Claim extraction.** Two different extractors run, and their results are unioned so that one extractor cannot hide claims:
   - a deterministic splitter;
   - an LLM extractor that keeps only checkable, decontextualised claims ([Claimify, arXiv 2502.10855](https://arxiv.org/abs/2502.10855); [VeriScore, arXiv 2406.19276](https://arxiv.org/abs/2406.19276)).

    LLM extraction is also an injection surface, so its output can add claims but cannot remove deterministic ones.
3. **Novelty against the buyer (deterministic).**
   - Semantic retrieval of each claim's nearest passages in the buyer's corpus. Lexical overlap misses paraphrase, while semantic retrieval detected 80–97% of paraphrases at 1% false-positive rate in [arXiv 2303.13408](https://arxiv.org/abs/2303.13408) (a non-adaptive attacker).
   - An NLI entailment check on borderline pairs.
   - Per-claim novelty *n_i* ∈ [0, 1]. The LETHE v0 form is *n_i = clamp((τ_hi − maxSim)/(τ_hi − τ_lo))*, with τ_hi = 0.78 and τ_lo = 0.45 for MiniLM; v1 recalibrates the thresholds per embedding model.
4. **Need weighting (deterministic).** Claims are weighted by similarity to the stated need: *N_b = Σ w_i n_i / Σ w_i*. This is LETHE's padding-resistant weighting, and it has a test (AC-39).
5. **Public novelty (optional, deterministic).** The same computation runs against an in-room snapshot of public corpora (news, filings, papers, chain data), giving *N_pub*. If the buyer opts in, *D = N_b × N_pub*, so restated public material is cheap.
6. **Verifiability (display field in v1, factor in v2).** The share of claims that can be checked against the public snapshot. For on-chain claims ("these wallets are linked"), checks use block-pinned replay of chain state (§4.15).
7. **Relevance judgement.** Two judges score relevance of the good to the stated need. *L = max(ℓ_floor, min(ℓ₁, ℓ₂))*.

**Output schema (default)**

- Blind mode: `outcome` only, 1 bit.
- Optional fields: `novelty` (11 levels, 3.46 bits), `relevance` (11 levels, 3.46 bits), `verifiable_share` (11 levels).

**Price formula.** *m = N_b (× N_pub) × L*.

**Delivery**

- Sealed copy.
- Or (v2) Q&A use-rights: the buyer asks questions answered from the memo inside a D-room, metered per answer, with an output firewall against verbatim reproduction.

**Prior art and known weaknesses**

- NovAScore already scores document novelty as an aggregate of atomic-fact novelty and salience against historical documents ([arXiv 2409.09249](https://arxiv.org/abs/2409.09249)). Marginal's appraiser differs by conditioning on a *specific buyer's private corpus* inside a room, and should be benchmarked against NovAScore.
- Novelty is not value. Synthesis and judgement are under-measured by claim novelty, which is why relevance and the seller-set price both matter.
- LLM novelty judgements tend to over-estimate novelty ([arXiv 2602.06054](https://arxiv.org/abs/2602.06054)), which is why novelty is deterministic here.

#### 4.8.2 Datasets (v2)

**Inputs**

- **Seller:** the dataset, licence terms, provenance evidence, and an *IID held-out split* retained for later dataset-inference audits (§4.10.4).
- **Buyer:**
  - a sealed eval set;
  - a data index (hashes, MinHash sketches or embeddings);
  - their model or a declared proxy;
  - a value schedule: "up to $X for +Δ* on eval E".

**Staged pipeline, cheapest first.** Each stage can end the job, and the buyer chooses the maximum stage up front.

1. **Integrity and category screens.** Format and schema checks, internal deduplication, a personal-data detector, licence metadata, and mandatory prohibited-content screens.
2. **Overlap with the buyer** *o* ∈ [0, 1]. Exact and near-duplicate rate using semantic deduplication ([SemDeDup, arXiv 2303.09540](https://arxiv.org/abs/2303.09540)).
3. **Forward-pass proxies with the buyer's own model (no training).**
   - In-context data selection ([Data Whisperer, arXiv 2505.12212](https://arxiv.org/abs/2505.12212); [arXiv 2407.12259](https://arxiv.org/abs/2407.12259)).
   - "Information potential" of a collection for an LLM ([arXiv 2502.13691](https://arxiv.org/abs/2502.13691)).
4. **Gradient-feature proxies.** LESS-style influence against the buyer's few-shot targets ([arXiv 2402.04333](https://arxiv.org/abs/2402.04333)). LoGra scales influence to Llama3-8B ([arXiv 2405.13954](https://arxiv.org/abs/2405.13954)).
5. **Lift test (optional, paid).** LoRA fine-tune of the buyer's model, or its proxy, on a stratified sample. The test evaluates on the buyer's sealed eval against a baseline, reporting Δ with a bootstrap interval.
   - In-Run Data Shapley can be computed during this run for item-level allocation inside the room ([arXiv 2406.11011](https://arxiv.org/abs/2406.11011)). It is a by-product of the run, not a cheaper substitute for it.
   - Training on GPUs is not bit-deterministic, so cross-vendor tolerance for Δ is wider than for embeddings.

**Uncertainty is part of the output**

- Small-scale experiments picked the better pretraining dataset in about 80% of pairwise comparisons in DataDecide ([arXiv 2504.11393](https://arxiv.org/abs/2504.11393)).
- Fine-tuning curves have a "pre-power phase" that biases naive extrapolation from samples ([arXiv 2402.02314](https://arxiv.org/abs/2402.02314)).
- No single attribution method dominates across tasks ([DATE-LM, arXiv 2507.09424](https://arxiv.org/abs/2507.09424)).
- So the lift field is a *bucketed interval*, and the appraiser datasheet states its empirical sign-agreement rate (AC-42).

**Price formula.** *D = clamp(Δ_lower / Δ*, 0, 1) × (1 − o)*, using the lower end of the interval. The judgement factor *L* covers only licence-quality flags.

**Output schema**

- `overlap` (11 levels);
- `lift_bucket` (for example 8 interval classes);
- `licence_class` (enumerated);
- `pii_flag` (2 values).

**Delivery**

- Sealed copy.
- **Train-in-vault**: the buyer's training job runs in a G-room. The output either stays in a room (weights-in-vault) or is released as a weight delta trained with differential privacy at a declared ε.
  - Post-trained models regurgitate training data, and embedding-based matching found at least 10× more memorisation than string matching in OLMo 2 and Open-Reasoner-Zero ([arXiv 2510.18554](https://arxiv.org/abs/2510.18554)). Released weights must therefore be treated as partially leaking the data.
  - DP fine-tuning has a measurable cost: RoBERTa-Large on MNLI fell from 90.2% to 87.8% at ε = 6.7 ([arXiv 2110.06500](https://arxiv.org/abs/2110.06500)).
- Use-rights (metered queries).

#### 4.8.3 Model weights and fine-tunes (v3)

**Inputs**

- **Seller:** weights, model card, base-model and licence claims.
- **Buyer:** a sealed eval set, plus their current model or reference outputs.

**Pipeline**

1. **Lineage checks.** White-box static fingerprints are robust to benign fine-tuning and quantisation ([arXiv 2508.19843](https://arxiv.org/abs/2508.19843)). Their robustness to adaptive attackers is untested: black-box fingerprints were broken in [arXiv 2509.26598](https://arxiv.org/abs/2509.26598). Lineage is therefore a seller-bonded claim, not a proof.
2. **Safety screens.**
3. **Two-sided sealed evaluation.** The seller's model runs on the buyer's eval. Google DeepMind piloted exactly this two-sided property: "The evaluator cannot see the Gemini model weights, and Google cannot see the evaluator's test prompts" ([DeepMind, 2026-08-27](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)).
4. **Win rate against the buyer's current model** on deterministic metrics where possible. Pairwise judges with a floor where not.

**Output schema:** `score_bucket`, `winrate_bucket`, `lineage_class`.

**Delivery**

- **Weights-in-vault inference**: contract-gated, metered, with no logprobs or logit-bias exposure. Logit access enabled recovery of a production model's embedding projection layer for under $20 on smaller models ([Carlini et al., arXiv 2403.06634](https://arxiv.org/abs/2403.06634)).
- A licence to deploy inside the buyer's own attested room, with the keys released only there.
- Rarely, a copy, with export-control screening (§4.13).

**Caveat.** Weights inside a room are exposed if the room's platform is physically broken. RAND states SL5 protection "is currently not possible", and its SL3 threat set already includes insiders ([RAND RB-A2849-1](https://www.rand.org/pubs/research_briefs/RBA2849-1.html)). Weight listings therefore carry platform caps and never promise protection against physical insiders.

#### 4.8.4 Eval sets (v2)

The seller owns the eval. The buyer is a model owner who wants a score; later, a lab may buy the eval itself.

**Pipeline**

1. Run the buyer's model on the sealed items with the seller's scoring code.
2. **Contamination check, set-level only.** Use the exchangeability test ([arXiv 2310.17623](https://arxiv.org/abs/2310.17623)) and guided-completion checks ([arXiv 2308.08493](https://arxiv.org/abs/2308.08493)). Instance-level membership flags are not shipped, because membership inference "barely outperform[s] random guessing" on LLMs ([arXiv 2402.07841](https://arxiv.org/abs/2402.07841); survey [arXiv 2410.18966](https://arxiv.org/abs/2410.18966)).
3. **Release rule.** Scores are quantised and released Ladder-style: a new score is published only if it beats the buyer's previous best by a margin. This keeps leaderboard-style adaptive overfitting bounded ([The Ladder, arXiv 1502.04585](https://arxiv.org/abs/1502.04585)). Each run debits the listing's leakage budget.

**Output schema:** `score_bucket`, `contamination_flag` (set-level).

**Delivery.** Per-run evaluation rights, plus an attested score certificate the buyer can publish, for example in a model card. Prior work runs this pattern on secret benchmarks: Attestable Audits on AWS Nitro, with CPU inference about 100× slower than GPU ([arXiv 2506.23706](https://arxiv.org/abs/2506.23706)), and TRUCE ([arXiv 2403.00393](https://arxiv.org/abs/2403.00393)).

**Buyer-relative variant (v3 research).** When a lab buys an eval set, its value could be measured as how much the eval's per-item results are *not* predicted by the lab's existing evals. This is a design hypothesis and is not validated.

#### 4.8.5 Exploit disclosures (v3)

**Inputs**

- **Protocol (buyer):** registered invariants, a fork configuration, a sealed known-issues list, and an escrowed bounty schedule.
- **Researcher (seller):** a sealed proof of concept.

**Pipeline**

1. Deterministic fork replay at a pinned block.
2. Invariant checks.
3. **Deduplication against the protocol's sealed known-issues list**, which is the buyer-relative step: duplicates are not paid.
4. A severity class from a deterministic loss-estimate band.
5. An LLM-written redacted summary, whose severity input can only be lowered.

**Output schema:** `valid` (2 values), `severity` (4–5 classes), `new_vs_known` (2 values).

**Delivery.** The disclosure is sealed to the protocol's key only. Sale to any other party is prohibited (§4.13).

**Competitive note.** This vertical is crowded: Mnemo, NDAI TrustKit and several NEAR hackathon entries do sealed exploit verification (§4.16). It is offered for completeness, not as a differentiator.

#### 4.8.6 Signals and forecasts (v3)

**Inputs**

- **Seller:** a forecast, committed with a timestamp.
- **Buyer:** a desk with a declared question and horizon.

**Appraisal**

- No content-correlated fields are shown, because a forecast's value can sit in a single bit (§4.7.4).
- The appraisal checks format, horizon and question match.
- It reports the seller's attested track record from previously resolved forecasts.

**Payment.** Part on delivery, and a tail α at resolution under a strictly proper scoring rule (§4.7.7).

**Constraints.** This vertical has the highest regulatory exposure: event-contract rules and material non-public information (§9).

### 4.9 Settlement, delivery and NEAR Intents

#### 4.9.1 Funding a job

| Path | How it works | Notes |
|---|---|---|
| **Direct (NEAR-native)** | The buyer sends a stablecoin (NEP-141) to the Clearing contract with `ft_transfer_call`. The job request travels in `msg`. | The simplest path. Requires a NEAR account. |
| **Intents batch** | The buyer, holding balances in the Intents verifier (`intents.near`), signs one intent batch containing two items: a transfer to Marginal's account, and an `auth_call` that calls `Clearing.on_auth(signer_id, msg)` to register the job ([near/intents](https://github.com/near/intents)). | Funding and job creation happen in one signed batch. Per the verifier code, a wNEAR deposit attached to `auth_call` is not refunded if the call fails, so the contract must not depend on that deposit. |
| **Any chain (1Click)** | The buyer requests a quote, deposits on the source chain, and solvers deliver the settlement asset to Marginal's verifier account. A per-job deposit reference attributes the funds. | For buyers who never touch NEAR (SC-4). Insured quotes add "0.02% (2 basis points)" ([1Click API](https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote.md)). |

**Settlement asset and escrow**

- Budgets and prices are denominated in a stablecoin settlement asset, so valuations are not exposed to volatility.
- **Escrow is held by the Clearing contract as NEAR-side token balances, not inside the Intents verifier.** The verifier can pause (it did after the 2026-10-01 exploit; §4.4), and refunds must never wait on it.

#### 4.9.2 Settling a verdict

When a verdict is accepted, one contract call atomically updates the internal ledger. In that single function execution:

- **price** → `held` (pending payout);
- **leakage compensation** → seller (claimable now);
- **compute** → operator (claimable now);
- **fees** → treasury, operator pool and assurance pool;
- **refund** → buyer (claimable now);
- the settlement record and audit head are written.

**External transfers**

- Transfers to recipients run as separate receipts. NEAR cross-contract calls are asynchronous, so these are "push" attempts with callbacks.
- On failure, the amount stays as a **claimable balance** (pull fallback). Funds can therefore never be lost to a failed push.
- Refunds use `ft_transfer`, not `ft_transfer_call`. The verifier documentation warns that refunds "can only be processed when `ft_transfer` is used" ([withdrawals](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals.md)).

**Release of held proceeds.** After the challenge window *W* for the listing's value class, and once a delivery receipt exists (§4.9.3), held proceeds move to the seller's payout route.

#### 4.9.3 Delivery modes

| Mode | Mechanics | Delivery receipt | Stage |
|---|---|---|---|
| **Sealed copy** | The room seals DEK_g (and the salt) to the buyer's delivery key. The verdict commits to *h_D* = hash of the delivery object. The object is posted to the blob store. | The room signs "posted *D*, hash *h_D*". Delivery is **deemed complete** when that receipt exists. The buyer can dispute within *W* only by claiming a mismatch, resolved by a dispute room that re-derives keys and compares commitments privately. The seller's payment therefore does not depend on the buyer choosing to acknowledge. | v1 |
| **Re-delivery** | Any approved room re-derives K_L via CKD and reproduces *D* with the same *h_D* (AC-31). | As above | v1 |
| **Q&A use-rights** | An entitlement record. The buyer's questions are answered from the good in a D-room, metered per answer, with an output firewall against verbatim reproduction. | Room-signed usage receipts | v2 |
| **Train-in-vault** | The buyer's training job runs on the purchased data in a G-room. The resulting weights stay in a room, or are released with DP (§4.8.2). | Room-signed job receipt | v3 |
| **Weights-in-vault inference** | A model served only in rooms. Each request requires a valid entitlement. Metering uses room-signed usage receipts. | Usage receipts | v3 |

#### 4.9.4 Payouts

**Seller payout instruction:** asset, chain and address, sanctions-screened before use (AC-47).

**Routes**

1. **To a NEAR or Intents account (NEAR-side).** This leg is atomic within NEAR.
2. **Cross-chain withdrawal through the Intents verifier.** It travels over a bridge (Omni, POA or HOT), each with "its own trust model" ([bridging overview](https://docs.near-intents.org/integration/bridging/overview.md)). Destination-chain completion is reported off-chain; it is not confirmed back on NEAR.
3. **Chain Signatures.** The contract's MPC-derived address signs a native transaction (for example on Bitcoin or Solana). This is gated by a ChainProof Guard-style policy: caps, a blocklist, and attester corroboration (§4.15).

**What "atomic DvP" means here.** Delivery-versus-payment is atomic up to the NEAR-side movement of funds and the recording of the delivery commitment. The leg to a foreign chain is asynchronous and inherits bridge risk. MOONSHOT §4.4 item 5's "one yield/resume flow" overstated this. The product states the boundary explicitly in every payout receipt.

#### 4.9.5 Private settlement (v2)

Confidential Intents runs on **FAR**, a permissioned NEAR-protocol network with a small validator set. Balances are not visible to the public, but are visible to FAR's operators. Access is partner-gated ([docs](https://docs.near-intents.org/integration/market-makers/confidential-intents.md)). The documentation does not describe a public NEAR contract holding FAR balances.

Marginal's private mode is therefore designed around **unlinkability of identity**, not invisibility of the trade:

- **Buyer.** The buyer funds a fresh per-job pseudonymous account through a Confidential Intents withdrawal. Eligibility (for example "verified institutional buyer") is proven with a zero-knowledge group-membership proof plus a per-listing nullifier, in the style of Semaphore ([docs](https://docs.semaphore.pse.dev/)). The contract learns "an eligible identity that has not appraised this listing this epoch", and nothing more.
- **Seller.** Sellers may be paid into FAR balances.
- **What remains public:** listing-level activity, amounts and timing (batching reduces the timing signal).
- **What FAR's operators can see:** FAR-side balances and transfers.
- **Prerequisite:** an Intents partnership. This is a business dependency (§9).

#### 4.9.6 Failure handling

| Failure | Behaviour |
|---|---|
| Intents verifier paused | Payouts are held as claimable balances. Refunds go to NEAR-side balances. Jobs continue. |
| Bridge delay or failure | Payout status is retried. The seller may change the route. NEAR-side funds stay in contract custody until a NEAR-side transfer succeeds. |
| MPC slow or unavailable (key release) | The job waits until its deadline, then refunds (AC-9). An independent review notes that one MPC participant can stall signing ([alinush.github.io/near](https://alinush.github.io/near), SECONDARY). |
| NRAS unavailable (GPU attestation) | New GPU-room registrations fail closed. Existing registrations continue until they expire. ITA "won't return an attestation token" without NRAS ([ITA docs](https://docs.trustauthority.intel.com/main/articles/concept-gpu-attestation.html)). |
| Room withholds a result | Timeout and refund. The operator bond is slashable if a signed job log shows wilful withholding. NVIDIA notes that CC "does not guarantee service availability" ([NVIDIA](https://docs.nvidia.com/confidential-computing/virtual-machines/threat-model)). |

### 4.10 Forget certificates

#### 4.10.1 What a certificate is

A forget certificate is a signed statement from an attested room. It says that, for a named job:

1. the listed inputs existed only in the room's volatile, TEE-protected memory;
2. no plaintext was written to persistent storage or sent off the room, beyond the outputs listed in the verdict;
3. the listed working keys and buffers were destroyed when the job ended.

The certificate is **attested, not proven**. It is exactly as credible as the room's code, the attestation chain and the hardware. It certifies **non-persistence**. It never certifies that a model "unlearned" anything:

- for unlearning methods with utility constraints, models retain about 21% of the targeted knowledge on average, rising to 83% after 4-bit quantisation ([arXiv 2410.16454](https://arxiv.org/abs/2410.16454));
- minimal fine-tuning restores "unlearned" behaviour ([arXiv 2505.16831](https://arxiv.org/abs/2505.16831)).

#### 4.10.2 When certificates are issued

| Event | Scope of certificate |
|---|---|
| Any appraisal job ends (deal or no deal) | The buyer's context: plaintext, DEK_c, and K_C if a standing context was used |
| No deal, timeout, fault or revocation | The buyer's context, **plus the good's working plaintext** and the DEK_g and K_L in room memory |
| Deal | The buyer's context, plus the good's working state in the room. The good itself is now delivered, so the certificate makes no claim about the buyer's copy. |
| Screening job at listing time | The good's working plaintext |
| Use-rights session (v2+) | That session's queries and working state |

#### 4.10.3 Certificate body (v1 schema)

```
ForgetCertificate {
  version                 // schema version
  job_id, listing_id      // or the screening/session id
  scope                   // [buyer_context | good_plaintext | session]
  input_commitments[]     // salted commitments of each covered input
  room_key                // registered room public key
  measurement             // MRTD/RTMR digests + compose hash of the room image
  platform_id             // PPID / chip id class (may be hashed for privacy)
  attestation_ref         // hash of the quote + collateral version used at registration
  policy_version          // attestation-policy version in force
  key_ids_destroyed[]     // hashes of the public parts / identifiers of destroyed keys
  egress_summary          // hashes of every object emitted (verdict, delivery, cert)
  t_start, t_end          // block heights
  outcome                 // Deal | NoDeal | Timeout | Fault | Revoked | Screening
  signature               // by room_key
}
```

- Only `hash(certificate)` is anchored on-chain, in the settlement record.
- The body is stored in the blob store and given to the parties.
- A certificate for a single-room job adds about 104 bytes of contract state (§4.4).

#### 4.10.4 Verification and deterrence

**Verification (AC-27).** Anyone can check, offline:

- the signature against the room key;
- the room key against the registration;
- the registration's quote against the vendor's root of trust, using the collateral version recorded;
- the measurement against the approved set and the attestation policy in force at `t_start`.

**Deterrence when certificates are not enough.** A physically broken room can lie. For **dataset** listings, sellers keep an IID held-out split so that they can later test statistically whether a model was trained on their data:

- one method uses gray-box loss access on IID member and non-member splits ([arXiv 2406.06443](https://arxiv.org/abs/2406.06443));
- another uses text-only access with seller-trained reference models ([arXiv 2507.03619](https://arxiv.org/abs/2507.03619)).

These methods work at dataset scale only, not for a single memo. They deter misuse after a room breach, or misuse of copy-mode deliveries. A normal no-deal buyer never holds plaintext.

#### 4.10.5 What is and is not new

**Signed erasure proofs are prior art.** The now-offline "Lethe protocol" showed, on testnet with simulated TEE hardware:

- a "Proof of Erasure — NIST 800-88 + ECDSA signature";
- "zkPoE v2 — O(1) on-chain verification via Groth16";
- an escrow on Base Sepolia.

See the [archived site, 2026-04-09](http://web.archive.org/web/20260409212333/https://lethe-protocol.github.io/). The same research circle published Conditional Recall as a mechanism-design primitive ([arXiv 2510.21904](https://arxiv.org/abs/2510.21904)).

**What Marginal adds, and the narrower claim:**

- a certificate bound to a **real hardware attestation and a versioned attestation policy**;
- issued by a **two-sided** appraisal room, covering *both* parties' inputs;
- **anchored in the settlement record** of a priced exchange;
- portable across chains via its offline-verifiable body.

### 4.11 Trust model

| Component | Trusted for | Not trusted for | If it fails |
|---|---|---|---|
| **CPU TEE hardware** (Intel TDX, AMD SEV-SNP) | Confidentiality and integrity of rooms against remote software attackers, the host OS and the hypervisor, *up to per-platform caps* | Attackers with physical access to an allow-listed host. TEE.fail, DDRop and Battering RAM are physical attacks that vendors call out of scope. | Loss bounded by the platform's epoch cap (§4.7.5); revocation; assurance pool (Stage 3) |
| **NVIDIA GPU confidential computing** | Protecting GPU-side computation *together with* a CPU TEE | Being an independent trust domain. GPU attestation is not bound to a specific CVM ([tee.fail](https://tee.fail)). HBM is not encrypted ([NVIDIA](https://docs.nvidia.com/confidential-computing/virtual-machines/threat-model)). | Same as the CPU TEE. **Never counts as a separate vendor for k-of-n.** |
| **Vendor attestation infrastructure** (Intel PCS / Trust Authority, NVIDIA NRAS, AMD KDS) | Roots of trust, TCB status, revocation | Availability: NRAS outages block GPU attestation ([ITA docs](https://docs.trustauthority.intel.com/main/articles/concept-gpu-attestation.html)) | Registrations fail closed. Existing rooms run until expiry. |
| **NEAR MPC network (CKD)** | Threshold custody of derivation secrets. NEAR states 11-of-17, TEE-backed; an independent review reports 11-of-16 and TEE-backing only since about Oct 2026 (§4.4). | Policy, which lives in KeyPolicy. Liveness: per the independent review, one participant can stall. | Collusion at or above threshold exposes every derivable key: a residual, disclosed risk. Liveness failures end in timeouts and refunds. |
| **KeyPolicy contract** | Enforcing derivation policy | — | Immutable per version (§4.5.3), audited, and formally specified |
| **RoomRegistry, attestation policy, governance** | Approving measurements, platforms and TCB policy | Unilateral or hasty changes | Time-locks; seller pinning; multi-party approval; public transparency log (§4.14) |
| **Room software** | Running audited appraisers that honour the egress rules | Freedom from bugs. The NEAR AI SGLang incident shows software inside a TEE can be exploited. | Minimal images; pinned engines; per-job isolation; revocation of a vulnerable measurement |
| **LLM judges** | Producing a bounded discount factor | Prices, payouts, safety checks, or anything outside a schema | Floor and `min` rule (§4.7.1); schema clamps |
| **NEAR protocol and Marginal contracts** | Execution and finality | — | Audits (AC-54); the pause path never blocks refunds |
| **Intents verifier and bridges** | The NEAR-side settlement leg | The cross-chain leg (bridge trust models); continuous availability (the verifier is pausable) | Escrow held outside the verifier; claimable balances; retries (§4.9.6) |
| **FAR (Confidential Intents)** | Hiding balances and transfers from the public | Hiding them from FAR's operators, who can see FAR-side data | Private mode promises unlinkability from the public only (§4.9.5) |
| **Sellers** | Nothing | Truth of claims, provenance, absence of MNPI | Bonds, attestations, screening, challenges, truth-contingent tails |
| **Buyers** | Nothing | Not probing, not reselling | Leakage budget, nullifiers, KYB, licence terms, use-rights for high-value goods |
| **Room operators** | Liveness, within timeouts | Confidentiality; operators see only ciphertext unless they mount a physical attack | Attestation; caps; bonds; allow-listed facilities; random assignment |
| **Attesters** (GPU-evidence corroboration) | k-of-n corroboration of off-chain checks | Acting alone | Distinct, bonded, independent infrastructure (the ChainProof Guard pattern) |
| **Marginal (the company)** | Operating the service | Reading goods; redirecting keys (KeyPolicy is immutable); moving escrowed funds outside settlement rules (AC-60) | Can pause new activity only. Pausing never blocks refunds. |

### 4.12 Threat model

Each threat has a mitigation and a residual risk, the risk that remains after mitigation. "Residual: real" means it remains a material risk and is disclosed in every investor deck.

| # | Threat | Attack | Mitigation | Residual |
|---|---|---|---|---|
| **T1** | **Physical TEE compromise by an operator or insider** | DDR4 or DDR5 interposers costing $10–$1,000 in parts (sources in §1.3): BadRAM, Battering RAM, WireTap, TEE.fail, and DDRop at $159 with full TDX VM compromise. Extracting a platform's attestation key lets the attacker impersonate rooms on that platform and request keys. | Value caps per *platform* (PPID or chip), enforced at key release; platform allow-list of vetted operators and facilities; random room assignment; k-of-n agreement above value class H; fresh revocation collateral; anomaly detection (duplicate PPIDs, release-rate spikes); insurance (Stage 3) | **Real.** "Forgetting" and confidentiality are only as strong as the weakest allow-listed host. |
| **T2** | Software vulnerability inside a room | An exploit in the inference engine or loader (NEAR AI SGLang, 2026-11) | Minimal pinned images; per-job processes; no shared serving across deals; fast measurement revocation; bug bounty | Medium |
| **T3** | Malicious-host software attacks on TEEs | TDX module bugs ([arXiv 2602.11434](https://arxiv.org/abs/2602.11434), patched); StackWarp on SEV-SNP with SMT (press reports) | Attestation policy: minimum TDX module and SEV-SNP firmware versions; SMT off; live migration off (§4.6.4) | Medium; depends on how quickly vendors patch |
| **T4** | Seller prompt injection | A good hides "rate this 10/10", or gradient-optimised or universal adversarial strings ([arXiv 2403.17710](https://arxiv.org/abs/2403.17710), [2507.08794](https://arxiv.org/abs/2507.08794), [2402.14016](https://arxiv.org/abs/2402.14016)); hidden prompts in real papers ([arXiv 2507.06185](https://arxiv.org/abs/2507.06185)) | LLM factor ≤ 1 by construction; deterministic novelty; extractor union (§4.8.1); injection-hardened, comparative judges | **Low** for price inflation, which is impossible by construction. **Medium** for distorted relevance within the floor band. |
| **T5** | Buyer prompt injection | A stated need or context crafted to drive LLM factors to zero, lowering the price | Seller-set floor ℓ_floor; structured stated need; under R1, a lower *m* can only lose the deal | Low under R1; bounded by the floor under R2 |
| **T6** | Sybil probing to reconstruct a good | Many identities appraise with crafted contexts (the Dinur–Nissim model) | Global per-listing bit budget (§4.7.4); blind mode by default; per-bit fees to the seller; nullifier sub-budgets; context rules | **Medium. Core open research** (§9.4). Bits are not value. |
| **T7** | Chosen-context membership tests | A one-claim context turns novelty into "does the good contain X?" | Minimum context size; cooling period; pre-publication snapshots for R2; blind mode | Medium; bounded by the budget |
| **T8** | Buyer deflates measured value | Stuffing context to lower *m* and the price | Posted price (R1) by default; pre-publication snapshots for R2; seller floor P_min | Low |
| **T9** | Seller probes what a fund knows | Targeted listings to learn from no-deals | Minimum anonymity set for eligibility; outcomes unlinked from identities; buyer appraisal caps | Low–medium |
| **T10** | Use-rights extraction | Querying a vaulted model or data to reconstruct it ([arXiv 2403.06634](https://arxiv.org/abs/2403.06634), [arXiv 2311.17035](https://arxiv.org/abs/2311.17035)) | Metering; no logprobs; output memorisation filters; per-entitlement extraction budgets; prices that assume partial leakage | Medium |
| **T11** | Train-in-vault memorisation | A released weight delta memorises training data ([arXiv 2510.18554](https://arxiv.org/abs/2510.18554)) | Weights-in-vault by default; DP option with declared ε | Medium |
| **T12** | Stolen, unlicensed or MNPI goods | The seller lists leaked data, pirated works or inside information | Seller KYB and attestations; bonds; in-room screens; buyer restricted lists; provenance proofs; takedown (§4.13) | **Legal and real** (§9) |
| **T13** | Purchase-signal leakage | Observers learn that a fund bought "memo on X" | Private mode (§4.9.5); only commitments on-chain; batching | Low–medium. FAR operators see FAR-side data. |
| **T14** | Side channels | Timing, sizes, GPU bounce-buffer metadata ([arXiv 2507.02770](https://arxiv.org/abs/2507.02770)), shared caches, NVLink contention ([arXiv 2503.17847](https://arxiv.org/abs/2503.17847)) | Padding; duration classes; per-job isolation; whole-node GPU allocation (AC-16, AC-23) | Medium |
| **T15** | Governance capture or malicious upgrade | A malicious measurement is approved | Time-locks; seller pinning; immutable KeyPolicy; multi-party approval; reproducible builds; transparency log | Low |
| **T16** | Appraiser model substitution | A room silently uses a weaker or different model | Weights hash in the measurement; provider receipts; TOPLOC spot-checks. Silent substitution is common in public APIs: 11 of 31 Llama endpoints deviated in [arXiv 2410.20247](https://arxiv.org/abs/2410.20247). | Low |
| **T17** | MPC collusion or liveness failure | At least threshold nodes collude, or one node stalls | Disclosed residual; timeouts and refunds; monitor NEAR MPC changes | Low (collusion) / medium (liveness) |
| **T18** | Buyer-agent compromise | A prompt-injected agent overspends | Function-call keys; on-chain caps (the ChainProof Guard pattern) (AC-50) | Low |
| **T19** | Delivery withholding or substitution | A room settles a deal but delivers nothing, or the wrong object | Delivery commitment in the verdict; held proceeds; re-delivery; dispute room; operator slashing (AC-30, AC-31) | Low |
| **T20** | Resale of purchased copies | The buyer redistributes a copy | Licence terms; use-rights for high-value goods; optional per-buyer canaries; dataset-inference audits for datasets (§4.10.4) | Medium. Copies are copies. |
| **T21** | Leakage-budget griefing | A competitor exhausts a listing's budget | Per-bit fees; per-identity sub-budgets; reserved budget for verified buyers; top-ups | Medium |
| **T22** | Correlated relisting | The same insight is listed under several budgets | Near-duplicate screening at listing time; seller attestations | Medium. **Open question.** |
| **T23** | Low-entropy commitments | A brute-forced hash of a yes/no good | Salted commitments (§4.3.2) | Low |
| **T24** | Replay or cross-job reuse of verdicts or receipts | Old signatures reused | Nonces; job binding; receipt replay checks (LETHE v0 already tests these) | Low |
| **T25** | Asynchronous-execution bugs | Double settlement, or stuck escrow across NEAR callbacks | State locks; property tests (§8.3); audits | Low after audit |
| **T26** | Settlement-layer incident | An Intents or bridge exploit or pause (2026-10-01) | Escrow outside the verifier; NEAR-side refunds; route diversity | Medium |

### 4.13 Compliance, identity and provenance

**Design rule: private from the public, not from compliance.** Marginal hides *who bought what* from the public. It never hides participants from Marginal's own compliance screening or from the buyer's compliance function. This section states product controls. It is not legal advice, and each item marked *(counsel)* needs a legal opinion before launch. Sources and detail: `spec-notes/regulatory.md`.

#### 4.13.1 Identity tiers and Sybil control

| Tier | Who | Required for |
|---|---|---|
| ID0 | Anonymous | Browsing listing metadata only. **No appraisals in v1–v3.** |
| ID1 | KYC (individual) or KYB (entity), with sanctions screening | Appraising and buying non-regulated categories |
| ID2 | ID1 plus institutional attestations: registered adviser status, restricted-list feed, compliance key | Funds buying knowledge goods; buyers of datasets flagged for personal data |
| ID3 | ID2 plus enhanced due diligence | Exploit buyers (affected owners only); export-sensitive weights; bulk US sensitive personal data |

**How privacy and identity coexist.**

- In private mode (§4.9.5), a verified identity proves tier membership on-chain with a zero-knowledge group-membership proof and a per-listing nullifier, so public chain data does not reveal *which* verified identity acted.
- Marginal's compliance system still holds the off-chain mapping, as sanctions and data-security rules require.
- OFAC's virtual-currency guidance recommends risk-based sanctions screening ([OFAC 2021](https://ofac.treasury.gov/media/913571/download?inline)).
- FinCEN treats anonymising *service* providers as money transmitters ([FIN-2019-G001](https://www.fincen.gov/sites/default/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf) §4.5.1).

#### 4.13.2 Material non-public information (knowledge, signals, alternative-data datasets)

**Why a category ban is not enough**

- Under US law, a tippee's liability derives from the tipper's breach and the tipper's personal benefit (*[Dirks](https://www.law.cornell.edu/supremecourt/text/463/646)*; *[Salman](https://www.supremecourt.gov/opinions/16pdf/15-628_m6ho.pdf)*). On Marginal the seller is *paid*, which plainly satisfies the benefit element if the information was obtained in breach of a duty (analysis).
- Misappropriation liability attaches to confidential information taken in breach of a duty to its source (*[O'Hagan](https://www.law.cornell.edu/supremecourt/text/521/642)*), whatever its topic.
- In the SEC's Primary Global Research cases, the expert network's own employees were charged ([SEC 2011-38](https://www.sec.gov/news/press/2011/2011-38.htm)).
- "Shadow trading" extends exposure to *peer* issuers. A jury found against Panuwat in 2024. The Ninth Circuit heard argument on 2026-06-11, and no decision was found as of this spec (secondary sources).
- EU market-abuse rules (MAR; MiCA Title VI for crypto-assets) have no personal-benefit element and reach anyone who "knows or ought to know" ([MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj), read; MAR wording from secondary sources).

**Controls (v1)**

1. **Seller KYB and per-listing attestations:** the source; no breach of duty; not an insider of named issuers or their peers; employer disclosure for expert sellers.
2. **In-room MNPI classifier at screening, as an *escalation gate*.**
   - Flagged listings are blocked from appraisal.
   - The seller may withdraw the listing, or consent to a logged review by a designated compliance reviewer under confidentiality. This is the one documented confidentiality exception (SC-21).
3. **Buyer restricted lists and peer lists**, supplied by the buyer's compliance team, matched inside the room. Matching listings return `restricted` before any appraisal (AC-62).
4. **Buyer compliance channel.** A fund's purchases are also sealed to the fund's compliance key (AC-55). This meets the need of registered advisers to maintain policies "reasonably designed … to prevent the misuse … of material, nonpublic information" ([Advisers Act §204A](https://www.law.cornell.edu/uscode/text/15/80b-4a)). The SEC's 2022 risk alert flagged weaknesses in alternative-data and expert-network controls ([SEC](https://www.sec.gov/files/code-ethics-risk-alert.pdf)).
5. **Stricter rule sets for EU buyers and for crypto-asset topics.** Token-specific non-public events are treated as presumptive inside information.
6. **Retention and a regulator-access path** through selective disclosure by participants.

**Open legal question (counsel).** Does a buyer "possess" information that only its sealed room read and then forgot, with the buyer seeing one bit? This is untested (§9.5).

#### 4.13.3 Data protection

**GDPR**

- **Roles.** The seller is the controller of personal data in its goods. Marginal aims to act as a **processor** for vault hosting and appraisal on the seller's documented instructions. Because Marginal designs the appraisal, joint controllership is a risk *(counsel)*.
- **Transparency.** The EU Court of Justice held that identifiability is assessed from the controller's side when data is collected, which bears on whether sellers told data subjects about recipients ([C-413/23 P, EDPS v SRB, 2025-09-04](http://publications.europa.eu/resource/celex/62023CJ0413.ENG.xhtml)).
- **Weights.** The EDPB says models trained on personal data are anonymous only if extraction and query-based disclosure are "insignificant" ([Opinion 28/2024](https://www.edpb.europa.eu/system/files/2024-12/edpb_opinion_202428_ai-models_en.pdf)). Buyers of weights must assess lawful development.
- **Controls:**
  - seller lawful-basis and recipient-disclosure attestations;
  - in-room personal-data detection, with blocking or anonymisation before any copy;
  - use-rights with aggregate outputs as the default for personal-data goods (AC-49);
  - processing terms under GDPR Art. 28, with joint-controller terms as a fallback;
  - transfer tooling for non-EEA buyers;
  - memorisation and extraction tests for weight listings.

**US DOJ Data Security Program** ([28 CFR Part 202](https://www.ecfr.gov/current/title-28/chapter-I/part-202), effective 2025-04-08)

- Bulk US sensitive personal data counts "regardless of whether the data is anonymized, pseudonymized, de-identified, or encrypted".
- "Data brokerage" includes "licensing of access to data", which covers in-vault use-rights.
- **Controls:**
  - a detector that maps fields to the §202.205 categories and thresholds;
  - mandatory ID3 identity for buyers of flagged datasets;
  - blocking countries of concern and covered persons;
  - onward-transfer clauses and a 14-day reporting workflow;
  - no anonymous buyers for flagged goods (AC-57).

#### 4.13.4 EU Data Governance Act and Data Act

**Data Governance Act (DGA)**

- **Likely in scope.** The DGA names "data marketplaces" as data intermediation services (recital 28) ([Reg. (EU) 2022/868](https://eur-lex.europa.eu/eli/reg/2022/868/oj)). The dataset and eval verticals are therefore likely in scope in the EU.
- **Possible exclusion.** The knowledge vertical may fall under the exclusion for services focused on "copyright-protected content" *(counsel)*.
- **What the DGA requires (Art. 11–12):**
  - notification, and an EU legal representative for non-EU providers;
  - a **separate legal person** for the intermediation service;
  - no use of intermediated data "for purposes other than to put them at the disposal of data users";
  - no tying of pricing to other services;
  - activity logs.
- **Product consequence.** MOONSHOT's "appraisal corpus" moat cannot mean training sellable pricing models on goods. Within the EU it is limited to transaction metadata used to improve the intermediation service itself, available to data holders on request (§4.16).
- **Pending change.** A pending Digital Omnibus on data would fold the DGA into the Data Act with lighter rules. The Council's mandate was agreed 2026-10-21. As of this spec, the DGA as written applies.

**Data Act.** It is reported to impose essential requirements on smart contracts that execute data-sharing agreements, including safe termination or interruption. Its text was not read this session.

- *Design response:* the Clearing contract supports governance pause (new activity only, never refunds), and KeyPolicy honours pause flags held in the registry without being upgradeable (§4.14).

#### 4.13.5 Export controls

- **Model weights.**
  - The US AI Diffusion rule's weights control (ECCN 4E091) has not been enforced since May 2025, but its text remains in the regulations, and no replacement rule was found as of 2026-11-11 ([BIS release](https://media.bis.gov/sites/default/files/documents/05.07%20Recission%20of%20AI%20Diffusion%20Press%20Release.pdf); [eCFR search](https://www.ecfr.gov/api/search/v1/results?query=%224E091%22)).
  - The EAR's encryption carve-out requires that the means of decryption are not provided to any third party ([15 CFR 734.18](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-734/section-734.18)). Decrypting weights inside an enclave hosted abroad may be an export *(counsel)*.
  - *Control:* weight rooms for flagged listings run only on platforms in allowed jurisdictions (AC-59).
- **Exploits.**
  - License Exception ACE for intrusion-software items is unavailable where the exporter has "reason to know" of unauthorised use ([15 CFR 740.22](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.22)). "Vulnerability disclosure" is carved out.
  - *Control:* exploit disclosures go **only to the affected owner, operator or vendor**, identity-verified, for remediation (AC-58).
  - The EU Cyber Resilience Act's reporting duties for manufacturers start 2026-09-11 (not verified this session).

#### 4.13.6 Copyright and provenance

**Where the legal risk sits.** The live risk is in *how data was acquired* (Bartz: pirated library) and in *market substitution* (Kadrey's market-dilution theory; Ross).

**Controls**

- seller licence-chain attestations;
- shadow-library blocklists;
- checks of text-and-data-mining opt-outs for crawled sources ([DSM Directive Art. 4(3)](https://eur-lex.europa.eu/eli/dir/2019/790/oj));
- seller bonds and indemnities;
- a takedown process;
- origin proofs for web-sourced data with TLS attestation tools, where practical ([TLSNotary](https://tlsnotary.org/docs/extension/)).

**Provenance dossier (per dataset purchase, AC-48).** Fields:

- licence class and chain;
- source categories mapped to the sections of the Commission's training-data summary template (published 2025-07-24, per secondary sources);
- opt-out checks;
- the personal-data scrub report;
- settlement and certificate references.

The dossier **supports** a provider's EU AI Act Art. 53 documentation. It does not *satisfy* it, because the provider remains responsible. The Commission says code-of-practice adherence is "a means to demonstrate compliance … while not providing a presumption of conformity" ([Commission Q&A](https://digital-strategy.ec.europa.eu/en/faqs/general-purpose-ai-models-ai-act-questions-answers)).

#### 4.13.7 Settlement regulation

- **Money transmission (counsel).**
  - FinCEN's guidance says that when a decentralised app performs money transmission, the definition can apply to "the DApp, the owners/operators of the DApp, or both". A wallet provider without "total independent control over the value" is not a transmitter ([FIN-2019-G001](https://www.fincen.gov/sites/default/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf) §4.2.2, §4.4).
  - *Design rule:* no Marginal key can move escrowed funds except through settlement rules (AC-60). Fiat on- and off-ramps go through licensed partners. State money-transmitter laws were not researched.
- **MiCA.** The transition period for unlicensed crypto-asset service providers ended 2026-07-01 ([MiCA Art. 143(3)](https://eur-lex.europa.eu/eli/reg/2023/1114/oj)).
  - *Design rule:* no custody of EU clients' crypto and no exchange service except through an authorised partner. Users interact with Intents solvers directly.
- **Truth-contingent tails (v3).**
  - A payment contingent on an event can fall within the US Commodity Exchange Act's "swap" definition ([7 U.S.C. 1a(47)](https://www.law.cornell.edu/uscode/text/7/1a)).
  - Event contracts are in flux: there was a 2026 circuit split, and the CFTC proposed a rule in June 2026 ([NPRM](https://www.federalregister.gov/documents/2026/06/12/2026-11854/prediction-markets-public-interest-determinations)).
  - *Design rule:* tails are structured as a non-transferable warranty or refund embedded in the sale, for institutional buyers only, with no secondary trading, and excluding sports and elections. Otherwise they go through a registered exchange partner (AC-61) *(counsel)*.

### 4.14 Governance and operations

#### 4.14.1 Who can change what

| Object | Change mechanism | Constraint |
|---|---|---|
| **KeyPolicy** | None. Immutable per version. A new version is a new contract account, which means new keys. | Migration needs per-listing seller consent (§4.5.3). |
| **Approved measurements** (RoomRegistry) | Governance multisig | Time-lock ≥ 7 days (target). Published source plus two reproducible builds. Listed in the transparency log. Never affects listings that pinned other measurements. |
| **Attestation policy** (minimum TCB, allow-list, freshness SLA) | Governance multisig. A security council may *tighten* policy immediately. | Loosening goes through the time-lock. Tightening (revoke or pause) is immediate (AC-20). |
| **Clearing contract** | Upgradeable behind a time-lock | No code path may move escrow except through settlement rules (AC-60). Refund paths survive any pause. |
| **Pause** | Security council | Stops new jobs and new key releases only. Refunds, claims and certificate anchoring keep working. This is the safe-interruption path that smart-contract rules may require (§4.13.4). |
| **Fees and caps** | Governance, within bounds fixed in code | Changes apply to new listings and jobs only. |

#### 4.14.2 Operator onboarding

An operator is admitted only after:

- KYB and a bond;
- facility attestation (vetted data centre);
- per-host **PPID or chip registration**, which is what the platform allow-list keys on;
- reproducible deployment of approved images;
- monitoring hooks that see no plaintext.

Operators are paid per job. They are slashed for evidenced misbehaviour and removed on repeated liveness failure.

#### 4.14.3 Incident response (TEE disclosure playbook)

1. A vendor advisory or public disclosure arrives. The security council freezes admission of affected TCB levels or vendors immediately (the automatic-freeze lesson from SGX.fail; [sgx.fail](https://sgx.fail)).
2. Caps on affected platforms drop to zero. Open jobs time out to refunds.
3. Collateral and revocation lists are refreshed. Affected sellers are notified with a list of key releases on affected platforms during the exposure window, which the contract's release events make precise (§4.5.3).
4. Rooms are rebuilt on patched TCBs, the new policy goes through the time-lock (loosening only), and service resumes.
5. Drill target: advisory to on-chain revocation within 1 hour (AC-53).

#### 4.14.4 Monitoring without plaintext

- Signed job logs (hashes and timings only), plus on-chain events: release counts per platform, appraisal and deal rates per listing, refund and fault rates.
- Anomaly rules:
  - the same PPID seen from two network origins;
  - release-rate spikes;
  - listings whose budgets drain far faster than their deal rate;
  - repeated faults by the same operator.

#### 4.14.5 Transparency

Marginal publishes:

- every approved measurement, with its source tag;
- the attestation-policy history;
- the operator and facility list (platform IDs may be hashed);
- incident reports;
- aggregate market statistics, released with differential-privacy noise.

Both replay verifiers are open source (AC-35, AC-36).

### 4.15 How LETHE, ChainProof Guard and 7Block Labs map in as v0 components

**Status of the evidence.**

- LETHE and ChainProof Guard are public repositories built during NEAR HACKATHON (Nov 2026), deployed on NEAR testnet. Their READMEs state what is real and what is simulated ([LETHE](https://github.com/jayanth-kumar-morem/lethe), [ChainProof Guard](https://github.com/jayanth-kumar-morem/chainproof-guard)).
- The audit-ledger and claim-replay tooling described below is pre-existing work of the author's. The claims about it (paying B2B customers, Annex IV dossiers, block-pinned replay) are **reported, not independently verified** for this spec.
- **Naming.** "LETHE" stays the hackathon codename only. The name is crowded in exactly this niche (§9, R21).

#### 4.15.1 LETHE (hackathon v0): what exists today

| Capability | LETHE v0 status (per its README) | Carries into | Gap to production |
|---|---|---|---|
| Listings, escrow, yield/resume settlement, refunds, timeout (~200-block window) | **Real** on testnet (`lethe-380029.testnet`) | Clearing contract (§4.7), job state machine (§4.3) | Two-phase jobs (§4.3.5); pricing rules R1–R5; leakage ledger; caps; bonds; challenge windows |
| Price recomputed by the contract in integer bps: `valuation = budget × novelty × relevance`; deal if valuation ≥ ask; seller paid `ask + (valuation − ask)/2` | **Real** | The "contract sets the price; the model can only lower it" principle (§4.7.1) | Replace the surplus split (not truthful) with posted price as the default (§4.7.2); add the floor on the LLM factor |
| Buyer-relative novelty: per-claim MiniLM similarity against the buyer's notes, `clamp((0.78 − maxSim)/(0.78 − 0.45))`, weighted by similarity to the stated need; a test shows padding does not move it | **Real** (runs locally) | Knowledge appraiser (§4.8.1) | NLI and paraphrase robustness; claim-extractor union; public-novelty option; benchmark against NovAScore |
| On-chain ed25519 check of the enclave verdict; on-chain `ecrecover` of a NEAR-AI-style receipt with body-hash binding, score parsed from the signed body, and replay protection | **Real** (exercised with a stand-in signer on testnet; tamper cases in sandbox tests) | Model-identity proof (AC-25), threat T16 | Real NEAR AI Cloud receipts (needs an API key) or self-hosted judges; per-instance binding is not possible with shared signing keys (§4.6.6) |
| Forget-certificate hash stored on-chain on no-deal; `make verify` re-checks every settlement from public RPC data | **Real** | Certificate (§4.10), replay verifier (AC-35) | Bind the certificate to an attestation quote and policy version; second independent verifier (AC-36) |
| X25519 sealed boxes for memo, notes and delivery; **ciphertext and an unsalted SHA-256 of the memo stored on-chain** | **Real** | Seal-to-room pattern | Move ciphertext off-chain; salted commitments (T23); CKD-derived per-listing keys (§4.5) |
| Seller's Solana payout address derived via Chain Signatures; NEAR Intents 1Click quote with `dry: true` | **Real** (address derivation only; no Solana transaction signed; mainnet quote only) | Payout routes (§4.9.4) | Real settlement on mainnet (the Intents verifier has no testnet) |
| Enclave attestation | **Simulated** (local mode; the owner registers the enclave key and codehash) | — | Attested rooms with an on-chain quote check (§4.6) |
| NEAR AI Cloud relevance score | Wired; without `NEARAI_API_KEY` a local stand-in signs, registered on-chain with `simulated: true` and recorded per settlement as `ai_simulated` | Judges (§4.6.6) | As above |
| Tests | 2 contract unit tests, 1 sandbox end-to-end test, 6 enclave tests | Test plan (§8) | The full plan in §8 |
| Yield payload | Capped at 1 KiB on testnet, so the checked settlement is stored in state and the resume carries only a signal | Same pattern | — |

#### 4.15.2 ChainProof Guard: the spend firewall and the k-of-n pattern

**What exists (per its README).** A NEAR contract that sits between an AI agent and the funds it manages:

- the agent holds only a **function-call access key** scoped to two guard methods;
- per-transaction and rolling-window caps, which still apply after human approval;
- a shared blocklist with evidence-backed reports;
- trusted counterparties, so that unknown receivers produce a Warn;
- **"ChainProof corroboration"** for Chain Signature requests: at least `min_attesters` distinct, *fresh*, block-pinned attestations are required, and any fresh negative attestation blocks;
- a kill switch, and a hash-chained audit log with NEP-297 events;
- 13 unit tests plus a sandbox end-to-end test. Testnet only.

**Carries into**

1. **The buyer-agent spend firewall** for agent buyers (G11, AC-50, T18).
2. **k-of-n corroboration before release**, generalised to:
   - attesters corroborating off-chain GPU-evidence checks before a room registration activates (§4.6.3);
   - policy-gated Chain Signature payouts (§4.9.4).
3. **The hash-chained audit-log pattern** (AC-37).

**Known gaps (stated in its README).**

- The agent supplies the notional value of a Chain Signature request. Production must price payloads by decoding them or using an oracle.
- The MPC promise is detached, so the signature reaches the audit log only through a callback.

#### 4.15.3 Pre-existing tooling (reported, not independently verified)

| Component | Claimed capability (reported) | Use in Marginal | Note |
|---|---|---|---|
| **Audit ledger** | Tamper-evident, hash-sealed audit ledger; a "faithfulness gate"; EU AI Act Annex IV dossiers; paying B2B customers | Audit ledger and dossier generator (§4.13.6); a warm channel for private-room customers (§4.18) | Annex IV is *high-risk-system* documentation, a different regime from the GPAI training-data summary. The EU AI Omnibus (Reg. (EU) 2026/1744) moved Annex III high-risk obligations to 2027-12-02, which shifts the timing of Annex IV demand ([Commission IP/26/1024](https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_26_1024/IP_26_1024_EN.pdf)). The dossier must be remapped to the GPAI template sections. |
| **Claim replay** | Block-pinned, replayable verification of claims against chain state | Verifiability checks for on-chain claims inside knowledge goods (§4.8.1, step 6) | — |
| **Crypto toolkit** | Groth16/Circom, indexed Merkle trees, nullifiers, ERC-3643 permissioned tokens | Nullifier-gated identity tiers (§4.13.1, AC-14); permissioned listing classes | — |

#### 4.15.4 What the v0 proves and does not prove

**Proves**

- Buyer-relative novelty pricing can be computed, recomputed by a contract from signed inputs, and replayed by third parties.
- A no-deal can end in a refund and an on-chain certificate.
- NEAR's yield/resume, Chain Signatures and Intents quoting can be composed in one flow.

**Does not prove**

- Real hardware confidentiality (attestation is simulated).
- Leakage control.
- Settlement in real assets.
- Any non-knowledge asset class.
- Demand.

#### 4.15.5 Team prerequisites

These come from MOONSHOT §11 and are not a product requirement.

- The founder has built the v0 core.
- Production needs:
  - a go-to-market co-founder from the expert-network, alternative-data or AI-data side;
  - a TEE and systems engineer for GPU rooms;
  - later, compliance counsel with securities and data-protection experience.

### 4.16 Competitive position

**Verdict: near-blue.** The category ("AI escrow in a TEE", "confidential data market") is crowded. The specific combination in §4.2 is not.

**Components.** The comparison uses six components:

- **BR**: buyer-relative pricing;
- **S2**: two-sided sealing;
- **UR**: use-rights;
- **FC**: forget certificate;
- **XC**: cross-chain settlement;
- **MW**: model weights as a good.

**Key:** Y = has it; P = partial; N = no. Status was observed 2026-11-11. Sources: `spec-notes/competitors-2026.md`, built from primary pages and repositories where available.

| Player | What it does | Status | BR | S2 | UR | FC | XC | MW | Relationship to Marginal |
|---|---|---|---|---|---|---|---|---|---|
| **Surge AI, "Train first. Pay if it works."** ([surgehq.ai/ots](https://surgehq.ai/ots)) | Labs in a Trusted Program train on the full dataset, then pay if their metrics move | Live | Y (pay/no-pay) | N | N | N | N | N | **Proves demand.** It uses trust and a full copy, while Marginal uses sealing and a mechanism. Surge could add TEE evaluation. |
| **Turnkey Verifiable Cloud** (data-brokerage pattern) ([docs](https://docs.turnkey.com/solutions/verifiable-cloud/data-brokerage)) | Runs the buyer's evaluation on the seller's corpus inside AWS Nitro before payment | Private beta; consult-led; **no pricing step** | P | Y | N | N | N | N | Closest commercial match to two-sided sealed evaluation. A potential rail or partner. |
| **Google DeepMind double-blind evaluations** ([blog](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/); [arXiv 2611.12604](https://arxiv.org/html/2611.12604)) | Model × private benchmark in Confidential Space; neither side sees the other's asset | Pilot (2026-08-27); no pricing | N | Y | P | N | N | P | Validates the room technique. Shows labs can build it in-house. |
| **OpenMined** ([openmined.org](https://openmined.org)) | Network for rule-governed access to non-public data, including pricing rules; enclave evaluation case study | Live programme | N | P | Y | N | N | P | Non-crypto neighbour. Possible partner for eval sellers. |
| **Super Protocol** ([superprotocol.com](https://superprotocol.com/)) | Confidential AI cloud plus marketplace of models and datasets on TDX + NVIDIA CC | Live; self-reports 2,000+ deployments, 50+ organisations; no appraisal or pricing | N | P | Y | N | N | Y | The strongest infrastructure incumbent. Threat if it adds buyer-relative pricing. |
| **VAST DataEnclave** | Two-sided sealing of model weights × enterprise data | Preview; GA planned Q1 2027 (secondary press) | N | Y | Y | N | N | P | Will commoditise enterprise weight rental. |
| **Phala Cloud / dstack** ([phala.com](https://phala.com/)) | GPU TEE cloud (H100/H200/B200/B300), private training | Live | N | P | P | N | P | P | Infrastructure. Marginal can use it, but must not depend on its KMS (§4.5.6). |
| **Snowflake / AWS / Databricks clean rooms** | Multi-party ML on partner data (Snowflake ML Jobs GA Jul 2026) | Live | P | P | Y | N | N | N | The enterprise default. Policy-based, not attested; no marginal-value pricing. |
| **Ocean Protocol**, **iExec** | Compute-to-data; TEE compute market | Ocean live (left the ASI Alliance 2025-10-09); iExec pivoted to confidential DeFi ("Nox", testnet) | N | P | Y | N | P | N | **Cautionary precedent** for demand (§9, R17) |
| **Vana**, **OpenLedger** | Contribution-measured payouts against a pool or shared model | Live | P | P | P | N | N | P | Value relative to a pool or a shared model, not to the buyer |
| **Nillion "Encrypted Markets"** ([post](https://nillion.com/news/the-road-to-encrypted-markets/)) | Sealed conditional trade instructions | Roadmap from Aug 2026 | N | N | N | N | P | N | An adjacent primitive, not an information market |
| **TBVH, NDAI TrustKit, DealProof, Mnemo, Sealed Trade Protocol** | Agents negotiate in a TEE, with EVM escrow; exploit disclosure | All testnet-only; four dormant since Mar–Jun 2026; DealProof pivoting to attested credentials | N–P | P | N | N–P | N | N | Prior art for "AI escrow in a TEE" |
| **Lethe protocol** ([archived](http://web.archive.org/web/20260409212333/https://lethe-protocol.github.io/)) | Erasure-based audit market. "Proof of Erasure" (NIST 800-88 + ECDSA) and Groth16 zkPoE, verified on-chain in an escrow flow | Testnet with simulated TEE (Apr 2026); site now offline; operators unidentified | N | P | P | **Y (testnet)** | N | N | **Prior art for the forget certificate**, and a name collision |
| **Opaque Systems** | Confidential AI platform | Wound down Oct 2026; team joined Anthropic (reported as a licence and acqui-hire; terms undisclosed) | — | — | — | — | — | — | Removed as an independent competitor. Big labs are bringing confidential computing in-house. |
| **AlphaSense/Tegus, GLG, Third Bridge** | Expert-call transcript libraries; AI-led calls. AlphaSense delays transcript publication by 14 or 90 days, and buyers can pay to shorten the delay. | Live | N | N | N | N | N | N | Substitutes for knowledge goods. Time-based price discrimination already exists. |
| **NEAR ecosystem**: Agent Market revamp ([NEAR Q2 2026](https://www.near.org/blog/the-state-of-near-q-2-2026)); NEAR AI Red security models | Agents hired per job with permissioned data access and escrow; TEE security models | Revamp planned Q3 2026 (launch unconfirmed) | N | N | P | N | P | N | Partner or distribution channel. Risk: NEAR AI builds a data-exchange layer itself. |
| **NEAR hackathon entries** (BlindBench, DeadDrop, KeyLease, Sealed Exploit, Redline, SealedBounty, Skarbnik, Provable Alpha) | Each overlaps one vertical | Hackathon | — | — | — | — | — | — | About 26 of 511 entries are AI spend-guard or escrow variants (MOONSHOT §9.2). "TEE judge + escrow" is saturated. |

**Biggest competitive threats, and the response to each**

1. **Data vendors add sealed evaluation** (Surge, Scale, Mercor). *Response:* be the neutral venue. Vendors can *sell through* Marginal, which gives them buyer-relative pricing without a trust programme.
2. **Labs build rooms in-house** (the DeepMind pilot). *Response:* the room is not the product; the market is. The product is cross-counterparty clearing, the leakage ledger and settlement. A lab's internal room cannot clear trades with sellers who don't trust that lab.
3. **Confidential-cloud incumbents add pricing** (Super Protocol, Turnkey, VAST). *Response:* treat them as rails. Marginal's mechanism and leakage standard are protocol-level and vendor-neutral.
4. **NEAR AI builds a data-exchange layer.** *Response:* partner as the application layer; Marginal consumes every NEAR AI primitive.

**Moats, restated for what survives scrutiny**

1. **Two-sided liquidity.** Each buyer's standing sealed context makes appraisals better for that buyer, and makes the venue more valuable to sellers.
2. **Trust track record.** A public, replayable settlement history (AC-35) and incident record.
3. **Leakage-ledger standard and mechanisms.** First-mover on an implementable standard. Novelty is narrow (§4.7.4), so this is a head start, not IP protection.
4. **Compliance artefacts** that buyers' compliance teams rely on (§4.13).
5. **Transaction-level learning, scoped by law.** MOONSHOT's "appraisal corpus" is narrowed. In the EU, the data intermediation rules confine the use of intermediated data to the intermediation service itself (§4.13.4). The moat is better appraiser calibration and fee setting from DP aggregates, **not** sellable pricing models trained on goods.
6. **NEAR-native integration**: CKD, Intents, Chain Signatures and NEAR AI. This is a moat only while those primitives stay distinctive, and it is also a platform dependency (§9, R23).

### 4.17 Roadmap: v0 → v1 → full product

**How to read it**

- Stages are gated by acceptance criteria (§6) and business gates, not by calendar dates.
- Durations are MOONSHOT's indicative **estimates**, not commitments.
- Business gates are **targets** carried over from MOONSHOT §10. They are not forecasts.

| Stage | Scope | Depends on | Exit gate (all required) | Kill / pivot criterion | Indicative duration (estimate) |
|---|---|---|---|---|---|
| **Stage 0: v0 (LETHE)** | Knowledge goods; buyer-relative novelty; contract-recomputed price; forget-certificate hash; replay verifier; simulated attestation | — | Exists on testnet (§4.15) | — | Done |
| **Stage 1: v1, the production knowledge exchange** | See the list below | Fork of the attestation crate; CKD availability (or the threshold-KMS fallback, §4.5.6); NEAR AI or own GPU capacity; counsel opinions in §4.13 | (1) All **[v1]** acceptance criteria pass; (2) 3–5 design partners (crypto funds, research DAOs, a security firm); (3) First $100k cleared (target); (4) No open critical or high audit findings | Fewer than 2 partners clear a paid trade by the end of the stage | ~6 months |
| **Stage 2: v2, data and evals** | See the list below | Blackwell capacity; a second CPU-TEE vendor; an Intents partnership for FAR; EU entity | (1) All **[v2]** criteria pass; (2) 2 AI-lab or enterprise-model buyers; (3) $5–10M GMV (target); (4) A peer-reviewed paper on the leakage ledger and measured-value mechanisms | Labs refuse TEE-measured lift as a contract basis | ~12 months |
| **Stage 3: v3, weights, use-rights, exploits, signals, assurance** | See the list below | Insurance partner; export-control and swaps opinions | (1) All **[v3]** criteria pass; (2) $100M+ GMV run-rate (target); (3) An insurance capacity partner; (4) The first weights licence | Use-rights extraction cannot be kept within declared budgets in red-team tests (AC-44) | ~18 months |
| **Stage 4: open supply** | See the list below | Consent tooling; a regulatory path for consumer data | Defined at Stage 3 exit | — | Year 3+ |

**Stage 1 (v1) scope**

- Knowledge rooms (K-rooms), verified on-chain with `dcap-qvl`.
- KeyPolicy plus CKD, with provisioning Option A (§4.5.2).
- Self-hosted judges.
- Knowledge appraiser v1.
- Pricing rules R1 (posted) and R2 (value-indexed).
- Leakage ledger v1, with blind mode as the default.
- Attestation-bound forget certificates.
- Two-phase jobs.
- Intents funding and payouts on mainnet, under canary caps.
- ChainProof Guard as the buyer-agent firewall.
- Hash-chained audit ledger.
- Identity tiers ID1–ID2.
- MNPI controls, the buyer compliance channel, and restricted lists.
- Two independent replay verifiers.
- External audits.

**Stage 2 (v2) scope**

- GPU-heavy rooms (G-rooms) on Blackwell.
- Dataset appraiser stages 1–5, including the lift test.
- Eval-set listings with a Ladder-style release rule.
- R4 sealed rounds and R5 threshold-payment tenders.
- Multi-vendor k-of-n (TDX + SEV-SNP), challenge windows, and seller and operator bonds.
- Provenance dossiers.
- Private mode (FAR partnership).
- EU data-intermediation entity.
- DOJ Data Security Program controls.
- Q&A use-rights.

**Stage 3 (v3) scope**

- Weights-in-vault and use-rights metering.
- Train-in-vault, with a differential-privacy option.
- Exploit vertical (affected owner only).
- Truth-contingent tails, structured as warranties.
- Assurance pool through a licensed partner.
- Agent payment adapters behind the guard.
- Hybrid post-quantum sealing.

**Stage 4 scope**

- Context wallets for individuals: consent UX, and personhood credentials for Sybil resistance ([arXiv 2408.07892](https://arxiv.org/abs/2408.07892)).
- Differentially private market statistics as a product. It must stay within DGA limits (§4.13.4): no models trained on goods.

**Research tracks, running in parallel and feeding the gates**

1. Leakage accounting under adaptive probing, value-weighted leakage, and correlated listings (feeds §4.7.4 defaults at the Stage 1 and Stage 2 gates).
2. Paraphrase-robust and adversarially robust novelty (AC-40).
3. Cost-bounded lift tests with calibrated intervals (AC-42).
4. Cross-vendor determinism for judges and training (AC-24, AC-38).
5. Mechanism design with *measured* rather than reported values: incentive compatibility under context manipulation, and seller surplus extraction.
6. Platform identity and location (proof-of-cloud), for caps.
7. Legal research on "possession" of information appraised in a sealed room (§9.5).

These are listed with their status in §9.4.

### 4.18 Business model and market

#### 4.18.1 Who pays, and why they pay a venue rather than deal bilaterally

| Payer | What they buy | Why through Marginal |
|---|---|---|
| **AI labs and enterprise model teams** | Datasets, expert knowledge, eval runs and fine-tunes, priced by measured lift on *their* sealed evals | Pay-for-lift without handing the eval to a vendor, and without needing a vendor "trust programme". Provenance dossiers that support EU AI Act documentation. Neutral measurement. |
| **Funds and research desks** | Memos, expert answers, alternative-data trials, on-chain intelligence | Pay only for what is new to their book. Purchases private from the public. MNPI controls and a compliance channel. |
| **Protocols and software vendors** (v3) | Exploit disclosures | Pay on a verified, *new-to-them* invariant break |
| **Sellers** | Listing, vault, appraisal | Sell without giving the good away. Paid for leakage even on no-deals. Paid in any supported asset. |
| **Agent builders** | API access | One integration to many sellers, behind on-chain spend limits |
| **Enterprises** | Private rooms (dedicated capacity with audit ledger and dossiers) | Compliance and confidentiality without building rooms themselves |

#### 4.18.2 Revenue lines

Rates are **estimates**. The benchmarks are sourced.

| Line | Basis | Indicative rate (estimate) | Benchmarks |
|---|---|---|---|
| **Clearing fee** | % of cleared price | 2–3% on large private deals; 5–10% on small knowledge goods | AWS Data Exchange charges 3% on public offers. Private offers are 3% / 2% / 1.5% by total contract value (<$1M / $1M–$10M / ≥$10M) ([AWS](https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html), P). OpenRouter 5.5% (Standard) / 8% (Business) ([OpenRouter](https://openrouter.ai/pricing), P). Super Protocol provider revenue share 5.5% ([site](https://superprotocol.com/), P, self-reported). Upwork 18.7% (FY2025, S). Fiverr 27.7% (FY2025, P via snippet). Mercor keeps ~30–40% of gross, derived from 60–70% paid to experts (S). Implied expert-network retention ~70–77% (S). |
| **Appraisal fee** | Compute pass-through plus margin | Cost + 20–30% | — |
| **Leakage compensation** | π × bits | Seller-set; passed through to the seller | Conceptual precedent: compensation "according to their privacy loss" ([arXiv 1208.5258](https://arxiv.org/abs/1208.5258)) |
| **Use-rights metering** (v2–v3) | Per query, token or training-hour | 10–20% of metered value | Inference routers (above) as the low bound |
| **Private rooms** | Annual contract | $100k–$1M per enterprise per year | Founder-reported 7Block Labs contract levels (MOONSHOT §6.2). **Unverified.** |
| **Assurance** (v3) | % of covered value | 1–2% | Deloitte projects ~$4.7B a year in AI insurance premiums by 2032 ([Deloitte](https://www.deloitte.com/us/en/insights/industry/financial-services/risk-insurance-for-ai.html), E) |

#### 4.18.3 Unit economics

These examples are **illustrative estimates, not data**.

- **Dataset sale to an AI lab, $200k cleared.**
  - Clearing fee at 3–6%: **$6k–$12k**. 3% matches AWS's private-offer rate under $1M.
  - Lift-test compute: 8–40 GPU-hours (assumption, widened from MOONSHOT's 8 because confidential-computing *training* overhead may be higher than inference, §4.6.1) × $3.50–$6.00 per GPU-hour. The $3.50 is an unverified search snippet for Phala H200 TEE capacity; the $6.00 is MOONSHOT's assumption. That gives about **$28–$240**, passed through at cost + 20–30%.
  - Leakage compensation is passed through.
  - Room operations: $1–2k per deal (MOONSHOT's assumption).
  - **Contribution: about $4k–$11k per deal.** Clearing, not appraisal, drives margin.
- **Memo sale to a fund, $2,000.**
  - Fee at 8%: $160.
  - Appraisal compute well under $10 (assumption: one K-room job of seconds to minutes).
  - High margin, but volume-dependent. **Knowledge goods are the wedge. Clearing large AI-data deals is the business.**

#### 4.18.4 Market inputs

**Type key:** P = primary; E = analyst or market-research estimate; S = secondary press. Full verification table: `spec-notes/market-2026.md`.

| Segment | Figure | Source | Type |
|---|---|---|---|
| Financial market data and analytics spend | $49.2B (2025, +6.5%) | Burton-Taylor via [Mondo Visione](https://mondovisione.com/media-and-resources/news/realtime-analytics-drive-record-growth-across-the-financial-market-data-landsca-2026326) | E |
| Alternative-data spend by investment managers | ~$2.8B (2025, +17%) | [Neudata, 2026-02-24](https://www.neudata.co/blog/state-of-the-alternative-data-market-2026) | E |
| Alternative-data spend per buyer | $1.6M/yr across ~20 datasets (2024 survey, n=60) | [Neudata 2024](https://webflow2.neudata.co/blog/the-future-of-alternative-data-report-2024) | E |
| Expert networks (global) | ~$3B (2025) | [Inex One](https://inex.one/blog/expert-network-market-size) | E |
| Insights industry | ≈$165B (2025, +6.4%). Market-research services alone: $56B (2024). | ESOMAR GMR 2026 via [ADIA summary](https://dataandinsights.com.au/global-market-research-report-2026/); 2024 split via [ResearchWorld](https://researchworld.com/articles/inside-the-153bn-insights-industry) | E (2025 figure via S) |
| Training data and services (model builders) | $15.3B (2026; "by September 2026"; time basis not explicit) | [Menlo Ventures, 2026-11-03](https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/) | E |
| Mercor | >$2B gross annualised (Jun 2026); ~$614M gross in H1-2026; ~90–91% of H1 gross from foundation-model companies | [Dealroom](https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/); [aiweekly](https://aiweekly.co/alerts/mercor-books-614m-in-h1-2026-leaning-on-openai-anthropic) | S |
| Scale AI | "just shy of $1 billion" revenue (2025, company-stated) | Forbes via [forbes.com.au](https://www.forbes.com.au/?p=189230) | S |
| AI training dataset market | $16.32B by 2033 (22.6% CAGR). ~$3.2B in 2025 is consistent with that CAGR (derived). | [Grand View Research](https://grandviewresearch.com/press-release/global-ai-training-dataset-market) | E |
| Reddit "other revenue" (mainly content licensing) | $140M (FY2025); $48M in Q3-2026 (+35%) | [8-K Q4-25](https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm); [8-K Q3-26](https://www.sec.gov/Archives/edgar/data/0001713445/000171344526000114/earningspressreleaseq326.htm) | P |
| Bug bounties | HackerOne $89.1M (Jul 2025–Jun 2026). Immunefi >$134M cumulative by end-Mar 2026. | [HackerOne](https://www.hackerone.com/report/hacker-powered-security) (P, snippet); Immunefi update via [KuCoin repost](https://www.kucoin.com/blog/en-immunefi-ecosystem-2026-q1-update) (S) | P / S |
| NEAR Intents | $37.3B cumulative volume (to 2026-11-10); $53.5M trailing-year fees | [DefiLlama API](https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume) | Aggregator |

**Not found:**

- GMV for Snowflake Marketplace or AWS Data Exchange;
- any market figure for traded model weights or eval sets;
- the share of alternative-data trials that convert to purchase;
- a credible total for AI-lab data spend other than Menlo's.

#### 4.18.5 TAM and SAM

These are **our estimates**, built from the inputs above. The years mix 2024–2026 and the segments overlap.

**TAM ≈ $126B/yr.** Annual B2B spend on information goods where inspect-before-buy or confidentiality matters:

- financial data: $49.2B
- alternative data: $2.8B
- expert networks: ~$3.0B
- market-research services: $56B (2024)
- training data and services: $15.3B
- bug bounties: ~$0.12B (HackerOne $89.1M + Immunefi Q1-2026 × 4 ≈ $30M; annualising one quarter is an assumption)

The sum is **$126.4B**.

- Menlo's $15.3B *replaces* MOONSHOT's vendor sum (~$4B) and its dataset-licensing line (~$3.2B), to avoid double counting. Whether it fully covers content licensing is unclear.
- Data brokers, IP licensing and trade-secret theft are excluded as in MOONSHOT.
- Financial market data is included for comparability with MOONSHOT, but most of it (real-time feeds) has no inspection problem.

**SAM ≈ $21.2B/yr.** Segments where a sealed, buyer-relative appraisal fixes an acute inspection or leakage problem and buyers are digital-native:

- alternative data: $2.8B
- expert networks: ~$3.0B
- training data and services: $15.3B
- bounties and disclosure: ~$0.12B

**Change from MOONSHOT.** TAM was ~$118B and SAM ~$13.15B. Most of the change is Menlo's new, larger training-data figure. **That one input drives SAM**, so its scope is a key diligence item (§9, R20).

**Year-5 revenue.** It is not presented as a single number. See the sensitivity analysis in §9.2.

## 6. Acceptance Criteria

**Conventions.**

- Every criterion is pass/fail.
- **Stage tags.** **[v1]** must hold before the production knowledge exchange leaves its capped canary. **[v2]** must hold before data, eval and multi-vendor features exit their canary. **[v3]** and **[v4]** gate those stages (§4.17). A criterion tagged with an earlier stage also holds at every later stage.
- **Verification method** (in brackets after each criterion):
  - **T**: automated test in CI or a sandbox.
  - **R**: checked by the public replay verifier on real settlements.
  - **A**: audit or inspection.
  - **M**: measured in staging or a pilot.
- Numeric thresholds marked *(target)* are design targets to be confirmed on pilot data. They are not empirical claims.

### 6.1 Pricing and mechanism (Clearing contract)

- **AC-1 [v1]** For every settled job, the contract recomputes the measured-value index *m* and the valuation *V* from the verdict's signed integer components, using the formula registered for the listing's appraiser version. If any component fails a signature, schema or range check, the verdict is rejected and the job stays open until its deadline. [T, R]
- **AC-2 [v1]** For every pricing rule, the deal outcome and the price are non-decreasing in each LLM-derived factor. The effective LLM factor is clamped to [ℓ_floor, 10,000] basis points. A property-based test over at least 10⁶ random inputs per rule finds no counterexample. [T]
- **AC-3 [v1]** No cleared price exceeds the buyer's escrowed budget. No deal clears below the listing's ask, reserve or floor. [T, R]
- **AC-4 [v1]** Conservation holds for every job, exactly in the asset's smallest unit: escrowed amount = seller proceeds + protocol fees + leakage compensation + compute pass-through + refunds + amounts held in a pending tail or challenge window. Held amounts are tracked until released. [R]
- **AC-5 [v1]** On posted-price listings, the buyer's payment is independent of the buyer's budget. The budget only determines whether the deal clears. Verified by property test. [T]
- **AC-6 [v1]** On value-indexed listings, the contract accepts only buyer-context snapshots anchored at a block height strictly lower than the listing's publication height. [T]
- **AC-7 [v2]** Sealed rounds and tenders:
  - **Rounds.** Winners and payments equal the uniform (k+1)-th-price rule over measured valuations with the reserve.
  - **Tenders.** Winning offers maximise total measured surplus within the buyer's budget, and each winning seller is paid its threshold price.
  - **Confidentiality.** No valuation or offer is published before the round closes.
  - **Losers.** Losing buyers are refunded in the closing transaction batch.

  [T, R]
- **AC-8 [v1]** The contract never authorises more than `max_copies` copy deliveries for a listing. [T, R]
- **AC-9 [v1]** Any job without an accepted verdict by its deadline can be refunded by a call from any account: the full budget plus the unconsumed part of the appraisal fee. No operator action is required. [T]
- **AC-10 [v1]** Fast-path knowledge appraisals produce an accepted verdict within the yield timeout for ≥ 99% of staging jobs *(target)*. Jobs that miss it fall back to the asynchronous path with no loss of funds. [M]

### 6.2 Leakage budget

- **AC-11 [v1]** Every listing declares an output schema (field names and finite alphabets). Its hash is stored on-chain. A verdict that contains an undeclared field, or a value outside a field's alphabet, is rejected. [T]
- **AC-12 [v1]** For each job, the contract debits *d* = 1 (the outcome bit) + Σ over shown fields of log₂|alphabet| + log₂(number of possible prices, for value-indexed rules). The debit is recorded in millibits and rounded up. The contract refuses to open a job when the listing's remaining budget is below that job's maximum possible debit. [T, R]
- **AC-13 [v1]** In blind mode (the default), the buyer receives only the outcome before settlement, and *d* = 1 bit. [T]
- **AC-14 [v1]** On nullifier-gated listings, a second appraisal by the same verified identity on the same listing in the same epoch is rejected, and the identity is not revealed on-chain. [T]
- **AC-15 [v1]** Leakage compensation of π × *d* (π is the seller's price per bit) is paid to the seller for every completed appraisal, whether or not it ends in a deal. [R]
- **AC-16 [v2]** Verdict submission times fall into declared duration classes. Over at least 1,000 staged jobs per class, within-class submission time shows no statistically significant association with any undisclosed output (p ≥ 0.01). [M]

### 6.3 Attestation, keys and rooms

- **AC-17 [v1]** A room key is registered only if its attestation:
  - is a valid quote whose measurement is in the approved registry;
  - has a TCB status that the governance policy accepts;
  - is not a debug configuration;
  - binds the room's public key in its report data;
  - for GPU rooms, comes with a GPU attestation bound to the same key.

  Each rejection case has a test. [T]
- **AC-18 [v1]** A release of a listing's key happens only for a job in state `Assigned`, only to a room whose registration is current, and only if the room's measurement is in the listing's pinned codehash set. [T]
- **AC-19 [v1]** The contract refuses any key release that would push a platform's released value-at-risk for the epoch above that platform's cap. [T]
- **AC-20 [v1]** After governance revokes a measurement or TCB level, no key release to an affected room is authorised from the next block onward. Open jobs on affected rooms resolve to refunds. [T]
- **AC-21 [v1]** A newly approved room version cannot open a listing whose pinned codehash set excludes it. [T]
- **AC-22 [v1]** In staging, network capture shows that a room emits only:
  - (a) signed verdicts;
  - (b) sealed deliveries;
  - (c) forget certificates;
  - (d) attestation and key-release protocol messages;
  - (e) calls to attested inference endpoints listed in its manifest.

  Any other egress attempt is blocked by the room's own policy and recorded in its signed job log. [A, M]
- **AC-23 [v1]** No state is shared across jobs. A canary test (plant a unique string in job A, probe for it from job B) finds zero leaks over at least 10,000 job pairs, including on rooms with shared inference infrastructure. [T, M]
- **AC-24 [v2]** Listings in value class ≥ H settle only with at least two verdicts from rooms on distinct TEE vendors and distinct operators, whose deterministic components agree within the appraiser's declared tolerance. Disagreement settles the job as `Fault` and refunds the buyer. [T, R]
- **AC-25 [v1]** Every LLM-derived factor carries a verifiable model-identity proof: a provider receipt whose signer is registered from that provider's attestation, or, for a self-hosted model, a weights hash included in the room measurement. A verdict without one is rejected. [T, R]

### 6.4 Forget certificates and destruction

- **AC-26 [v1]** Every job ends with a forget certificate covering the buyer's context. Every non-deal job's certificate also covers the good's working plaintext. The certificate hash is anchored in the job's settlement record. [T, R]
- **AC-27 [v1]** An independent verifier validates each certificate end to end from public data and the certificate body: signature → room key → attestation quote → vendor root of trust → approved measurement and TCB policy at issue time. [T]
- **AC-28 [v1]** Room images have no writable persistent storage and no swap. In a destructive staging test (power cut mid-job, then forensic imaging of host disks and memory snapshots available to the host), canary plaintext never appears; only ciphertext does. [A, M]
- **AC-29 [v1]** The certificate schema and all product copy make no claim of model unlearning or cryptographic deletion. Reviewed at each release. [A]

### 6.5 Settlement and delivery

- **AC-30 [v1]** In every deal:
  - the verdict commits to the hash of the sealed delivery object;
  - the seller's proceeds are released only after the listing's challenge window, with a delivery receipt recorded;
  - failure to deliver by the delivery deadline refunds the buyer.

  [T, R]
- **AC-31 [v1]** After a room crashes post-settlement, a different approved room re-derives the keys and re-delivers an object with the identical committed hash. [T]
- **AC-32 [v1]** Sellers can be paid in any supported asset on any supported destination chain, and every payout references its settlement ID. In the mainnet canary, ≥ 99% of payouts complete within 30 minutes *(target)*. [M, R]
- **AC-33 [v2]** With private settlement enabled, a staged analysis of all public chain data and public indexer data cannot link a buyer's persistent identity or account to a listing ID in a staged set of private trades. The per-job account is visible; the identity behind it is not. [A, M]
- **AC-34 [v1]** Each refund path returns funds to the buyer's declared refund address and asset:
  - `Timeout`
  - `NoDeal`
  - `Fault`
  - `DeliveryFailure`
  - `Revoked`

  Each path is tested end to end. [T]

### 6.6 Replay and audit

- **AC-35 [v1]** An open-source verifier reproduces, for 100% of settlements, using only public RPC or indexer data and published attestation collateral:
  - signature validity;
  - valuation recomputation and rule application;
  - conservation;
  - the leakage debit;
  - certificate anchoring.

  [R]
- **AC-36 [v1]** A second verifier, written independently (by a different team, in a different language), agrees with the first on 100% of settlements. [R]
- **AC-37 [v1]** The audit log is hash-chained, and any modification of a past entry is detected by both verifiers. [T]

### 6.7 Appraiser quality

- **AC-38 [v1]** The knowledge appraiser's deterministic components are bit-identical across repeated runs on the same platform, and within ±1 quantum across vendors, on a 1,000-pair benchmark. [T, M]
- **AC-39 [v1]** Adding irrelevant but novel text equal to 100% of the memo's length changes the novelty score by at most 1 quantum on the benchmark. [T]
- **AC-40 [v1]** On a benchmark of memos whose claims paraphrase the buyer's notes, measured novelty is ≤ 0.2 for ≥ 90% of pairs *(target)*. [M]
- **AC-41 [v1]** Across at least 500 prompt-injection templates embedded in goods and in stated needs:
  - no price exceeds its deterministic ceiling;
  - no LLM factor falls below its floor;
  - schema or parse failures resolve to the floor.

  [T]
- **AC-42 [v2]** On pilot datasets, the sign of sample lift matches the sign of full-dataset lift in at least the share declared in the appraiser's datasheet. The reported interval covers full-dataset lift at its nominal rate within ±5 percentage points *(target)*. [M]
- **AC-43 [v2]** Eval-set scores are released only through the listing's quantised release rule. No eval item text, or canary item text, appears in any output. [T]
- **AC-44 [v3]** Under the published extraction benchmarks, metered use-rights access leaks less than the listing's declared extraction budget before rate limits stop the buyer. [M]

### 6.8 Compliance and identity

- **AC-45 [v1]** Listings in regulated categories activate only after the seller has the required identity (KYB) tier and has signed the seller attestations (lawful provenance, no material non-public information). [T]
- **AC-46 [v1]** Every knowledge listing passes the in-room MNPI screen before its first appraisal. Flagged listings cannot be appraised until cleared under the documented review path. [T]
- **AC-47 [v1]** Payout addresses and identities are sanctions-screened before payout. A screened-out payout is held, not sent. [T]
- **AC-48 [v2]** For each dataset purchase, the buyer can export a provenance dossier whose fields cover what the European Commission's GPAI training-data summary template asks for, about that dataset. [A]
- **AC-49 [v1]** Dataset listings flagged by the in-room personal-data detector are blocked unless the seller declares a lawful basis and selects a delivery mode in which data never leaves a room. [T]

### 6.9 Agents and usability

- **AC-50 [v1]** Buyer agents act through function-call access keys restricted to the Clearing contract's buyer methods. Per-window spend caps are enforced on-chain. An injected instruction to exceed a cap results in Block or Warn, never in an escrow above the cap. [T]
- **AC-51 [v1]** In a moderated usability test with at least 5 first-time buyers, at least 80% complete an appraisal from upload to outcome without handling chain-specific concepts *(target)*. [M]

### 6.10 Governance and operations

- **AC-52 [v1]** Room code upgrades:
  - observe a time-lock of at least 7 days between approval and activation *(target)*;
  - two independent builders reproduce the same measurement from source;
  - pinned listings are unaffected until their sellers opt in.

  [A, T]
- **AC-53 [v1]** In a drill, the TCB-revocation playbook goes from vendor advisory to on-chain revocation within 1 hour *(target)*. [M]
- **AC-54 [v1]** The contracts and the room code have passed at least one independent external audit with no open critical or high findings before any cap is raised above canary level. [A]

### 6.11 Regulatory and compliance controls (from §4.13)

- **AC-55 [v1]** For buyers at identity tier ID2, every delivered good is also sealed to the buyer's registered compliance key, and the compliance officer can decrypt it independently of the trading desk. Tested end to end. [T]
- **AC-56 [v1]** No appraisal or purchase runs without an identity of tier ID1 or higher. Private-mode jobs carry a valid zero-knowledge tier proof and nullifier. Marginal's compliance system can resolve any job to a screened identity within its retention policy. [T, A]
- **AC-57 [v2]** Datasets flagged as falling within the categories and thresholds of 28 CFR §202.205 can be appraised or bought only by tier-ID3 buyers who pass the covered-person and country-of-concern screens. Onward-transfer terms are recorded with the settlement. [T]
- **AC-58 [v3]** An exploit listing can be configured only with the registered affected owner, operator or vendor as the sole eligible buyer and delivery key. Any other configuration is rejected. [T]
- **AC-59 [v3]** Weight listings flagged as potentially export-controlled can be assigned only to rooms on platforms whose allow-list entry carries an allowed-jurisdiction attribute. [T]
- **AC-60 [v1]** No contract function, governance and pause functions included, can transfer escrowed funds except through settlement, refund or claim rules. Verified by code audit and by property tests over every entry point. [A, T]
- **AC-61 [v3]** Truth-contingent tails can be enabled only for institutional buyers (tier ID2 or higher). The resulting entitlements are non-transferable, and listings in excluded categories (sports, elections) cannot enable tails. [T]
- **AC-62 [v1]** Buyer-supplied restricted and peer lists are matched inside the room before any appraisal. A match returns only `restricted` and debits only the outcome bit. [T]
- **AC-63 [v2]** EU-facing data intermediation runs through a separate legal entity. An audit of data flows confirms that no goods-derived data leaves rooms except declared verdict fields and buyer deliveries, and that transaction metadata is used only to operate and improve the intermediation service. [A]

## 8. Test Plan

This section describes the plan only. No test code exists for the full product yet. LETHE v0 has a small existing suite: 2 contract unit tests, 1 sandbox end-to-end test and 6 enclave tests (§4.15).

### 8.1 Environments and promotion path

| Environment | What runs there | What it can and cannot prove |
|---|---|---|
| **Local / CI** | Contract unit and property tests. Room code in an explicitly labelled *simulation* mode with mocked attestation. Verifier tools against recorded fixtures. | Logic and invariants. It proves **nothing** about confidentiality. |
| **NEAR sandbox** (`near-workspaces`) | Full contract flows, including yield/resume, timeouts, cross-contract callbacks and failure injection. | Asynchronous-execution correctness and refund paths. |
| **NEAR testnet** | Contracts, Chain Signatures (testnet signer), MPC key derivation where available on testnet, NEAR AI Cloud receipts (real signers), and registration of attested rooms. | Integration with live NEAR services. Not settlement in real assets. |
| **Staging hardware** | Real Intel TDX and AMD SEV-SNP hosts with NVIDIA confidential-computing GPUs, from at least 2 vendors and 2 operators. One "red" host where the test team has physical and root access. | Attestation, isolation, egress control, destruction and performance on real TEEs. |
| **Mainnet canary** | Production contracts with per-platform, per-listing and global value caps at canary level. Intents settlement with real but small amounts. The Intents verifier has "no testnet deployment" ([Intents docs](https://docs.near-intents.org/integration/verifier-contract/introduction.md)), so real settlement can only be tested here; CI uses `dry` 1Click quotes. | End-to-end settlement, payout latency, replay on real data. |

Promotion from one stage to the next requires every acceptance criterion tagged for that stage (§6) to pass, together with the business gates in §4.17.

### 8.2 Unit tests

**Clearing contract**

- **Pricing.** Each rule (posted, value-indexed, surplus-split, sealed round, tender) is tested in integer basis points, including boundary values: m ∈ {0, 1, 9,999, 10,000}, V = ask exactly, budget = 0, and overflow at maximum token amounts.
- **AI factor.** Clamping to [ℓ_floor, 10,000], `min()` across models, and schema-failure → floor.
- **Leakage ledger.** Debit computation for every alphabet size, rounding up, refusal at the boundary, per-identity sub-budgets, seller top-ups.
- **State machines.** Every legal listing and job transition, and rejection of every illegal one.
- **Caps.** Per-platform, per-listing and global value-at-risk counters, with epoch roll-over.
- **Lifecycle limits.** `max_copies`, deadlines, challenge windows, bond accounting and slashing arithmetic.
- **Fees.** Splits between protocol, seller, operator and assurance pool.

**Room**

- Deterministic scorers return identical bytes across runs: segmentation, embeddings, novelty, overlap, quantisation.
- Schema validation of every output field. Sealing and unsealing. Key zeroisation, checked by reading back buffers after wipe in a test build.
- Certificate construction and signature. Verdict construction, including the binding of job ID, listing, snapshot, appraiser version and nonce.

**Verifier tools**

- Parsing and validating every on-chain record type.
- Recomputing every rule.
- Validating attestation chains against stored vendor collateral.

### 8.3 Property-based and fuzz tests

- **Monotonicity in the AI factor (AC-2).** Generate random listings, budgets and component vectors. Assert that raising any LLM factor never lowers the price or flips a deal into a no-deal, and that lowering it never raises the price.
- **Conservation (AC-4).** Random sequences of jobs, timeouts, faults, challenges and refunds preserve total balances exactly.
- **Truthfulness of posted price (AC-5).** For random (budget, m, ask), the payment is constant in budget whenever the deal clears.
- **Verdict parser fuzzing.** Malformed JSON and Borsh, oversized fields, duplicate keys, Unicode confusables and negative numbers are all rejected with no state change.
- **Asynchronous callback safety.** Interleave callbacks and simulate failed promises. Assert that no job is settled twice and no escrow is released without its settlement record. NEAR cross-contract calls are asynchronous, so state must be locked across them.

### 8.4 Integration tests (end-to-end, per scenario)

Each scenario in §3.2 becomes an automated end-to-end test in the sandbox, and later on testnet:

- SC-1 and SC-2 (deal and no-deal) run through the fast yield/resume path.
- SC-6 runs through the asynchronous long-job path.
- SC-15 (timeout), SC-16 (fault), SC-17 (re-delivery) and SC-19 (revocation) exercise the refund paths.
- SC-24 runs a sealed round.

Every test asserts the final balances, the settlement record, the leakage debit, the certificate anchor and the audit-log head.

### 8.5 Attestation and key-release tests (AC-17 to AC-21, AC-25)

**Negative registration cases.** Each must be rejected:

- a wrong measurement;
- an out-of-date TCB (unless policy allows it);
- a debug-mode TD;
- a mismatched report-data binding;
- a quote replayed from another registration;
- an expired vendor collateral;
- a missing GPU attestation for a GPU room;
- a GPU attestation bound to a different key.

**Key release**

- Releases are refused for jobs not in `Assigned`, for rooms outside the pinned set, for revoked rooms, and over the cap.
- After a room crash, a fresh room re-derives the key (AC-31).

**Model identity**

- A receipt from an unregistered signer is rejected.
- A receipt with a tampered body hash is rejected.
- A receipt replayed from another job is rejected (LETHE v0 already tests the first three cases).

**Cross-check**

- For every staged registration, compare on-chain registration results with an independent off-chain verification using vendor tooling.

### 8.6 Forget and destruction tests (AC-26 to AC-29)

**Canary method**

- Seed every staged good and context with unique canary strings.
- After each job, scan for canaries in: host-visible disk, memory snapshots available to the host, network captures, logs, crash dumps, and the next job's room state.
- Pass criterion: zero canaries in any of these over the staged corpus.

**Power-cut test.** Kill the room mid-job, image the host, and scan for canaries.

**Certificate checks**

- Each certificate verifies with the independent verifier.
- Each certificate's scope matches the job outcome.
- Each certificate's anchored hash matches its body.

**Limit, stated in the test report.** These tests show the absence of persistence under normal and failure operation. They cannot show what an attacker with a successful physical TEE break could extract. That is covered by caps and threat-model controls, not by tests.

### 8.7 Replayability tests (AC-35 to AC-37)

- Run the public verifier on 100% of testnet and canary settlements in CI, nightly.
- Run a second verifier, built independently by a different team in a different language, on the same data. Compare outputs record by record.
- **Mutation testing.** Flip any byte in a stored verdict, certificate, settlement record or audit entry. Both verifiers must fail on it.
- **Cold-start test.** A third party with only public endpoints and the published verifier reproduces a randomly chosen week of settlements.

### 8.8 Adversarial and red-team tests

| Probe | Method | Pass criterion |
|---|---|---|
| **Sybil reconstruction of a good** (SC-10) | Red team gets N identities and budget B_red. It adaptively crafts buyer contexts against the live knowledge appraiser in staging, for example by bisecting topics or injecting candidate claims. We measure how much of a held-out memo it can reconstruct, by claim recall and by an LLM judge comparing the reconstruction to the original. | Recovered information stays within the listing's leakage bound. The red team's spend equals what the fee schedule predicts. We report recall versus bits spent, which calibrates the default budgets. |
| **Score leakage per field** | Estimate empirical mutual information between shown fields and held-out claim sets. | Empirical leakage ≤ the declared log₂|alphabet| bound. Quantisation levels are adjusted if fields are near-deterministic functions of content. |
| **Seller prompt injection** (SC-11) | Corpus of at least 500 injection templates in goods, metadata and file formats. | AC-41 holds. |
| **Buyer-side injection** | Injections in stated needs and contexts aimed at driving LLM factors to zero. | The factor never goes below the floor. Price impact ≤ (1 − ℓ_floor) × ceiling, as designed. |
| **Context stuffing** (SC-12) | Buyer adds near-duplicates after listing publication. | Snapshots after the listing's publication height are rejected (AC-6). |
| **Paraphrase gaming** | Seller paraphrases public or buyer-known content to look novel. | AC-40 holds. The public-novelty factor flags the paraphrased public content. |
| **Reverse probing** (SC-13) | Seller crafts targeted listings to infer a fund's knowledge. | Targeting below the minimum anonymity set is rejected. The outcome is unlinkable to identity in public data (AC-33). |
| **Side channels** | Timing, ciphertext size, GPU bounce-buffer metadata ([arXiv 2507.02770](https://arxiv.org/abs/2507.02770)), shared-cache probes ([arXiv 2508.08438](https://arxiv.org/abs/2508.08438)). | AC-16 and AC-23 hold. |
| **Use-rights extraction** (v3) | Run published model-stealing and data-extraction attacks against metered endpoints ([Carlini et al. 2024, arXiv 2403.06634](https://arxiv.org/abs/2403.06634); [arXiv 2510.18554](https://arxiv.org/abs/2510.18554)). | AC-44 holds. |
| **Delivery withholding / substitution** | A room signs a deal but delivers nothing, or the wrong object. | The buyer is refunded at the deadline. The delivery hash mismatch is detected. The operator is slashed. |
| **Governance attack drill** | Attempt to push a malicious room version. | The time-lock and seller pinning prevent opening pinned listings. Monitoring alerts fire. |
| **Physical TEE compromise (tabletop)** | Assume an operator extracts a platform's attestation key (TEE.fail class). | Loss ≤ that platform's epoch cap. Detection and revocation complete within the AC-53 drill time. Payouts from the assurance pool are computed correctly. |

### 8.9 Economic tests

- **Agent-based market simulation.** Run buyer and seller agents in an open-source agentic-market harness such as Microsoft's Magentic Marketplace ([arXiv 2510.25779](https://arxiv.org/abs/2510.25779)), adapted to Marginal's mechanisms. Measure welfare, seller revenue, buyer savings, conversion and leakage per deal under each pricing rule.
- **Best-response search.**
  - For each rule, search over buyer budget shading and context manipulation, and over seller ask inflation.
  - Confirm that posted price and the uniform (k+1)-th price show no profitable deviation in reported budget.
  - Confirm that threshold payments in tenders show no profitable deviation in seller asks.
  - Quantify the shading that surplus split invites (§4.7.2).
- **Leakage-budget calibration.** Sweep budget size, price per bit and appraisal fee. Measure honest-buyer conversion against red-team reconstruction cost. Outputs are recommended default budgets per asset class.
- **Griefing economics.** Cost for an attacker to exhaust a listing's budget, versus honest-buyer delay, under per-identity sub-budgets and seller top-ups.
- **Value-cap calibration.** Monte Carlo of value-at-risk per platform under the threat model, against assumed attack costs. Attack-cost inputs come from published attack write-ups and are labelled as assumptions in the output.
- **Fee sensitivity.** Elasticity of conversion to clearing and appraisal fees in pilots. Feeds the business model in §4.18.

### 8.10 Appraiser validation

- **Knowledge benchmarks.** Build labelled (memo, notes) pairs with known claim overlap: verbatim, paraphrased, partially overlapping, and disjoint but on-topic. Measure novelty calibration (AC-38 to AC-40). Add expert panels from design-partner funds that rate "was this new to you?" blind, for criterion validity.
- **Lift-test validity (v2).** On pilot datasets where full fine-tunes are affordable, compare sample lift to full lift (AC-42). Report cost per appraisal.
- **Cross-vendor determinism.** Run the same jobs on TDX and SEV-SNP rooms, with batch-invariant inference for LLM components. The Thinking Machines work showed this can make temperature-0 outputs identical across 1,000 runs ([Thinking Machines, 2025-09-10](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/)). Record disagreement rates and set tolerances.
- **Eval-set leakage (v2).** Simulate adaptive model-owner submissions against the release rule. Measure overfitting to the private eval, in the style of the leaderboard-reuse literature (§4.8.4).

### 8.11 Performance and cost

For each asset class, measure on staging hardware:

- p50 and p95 latency per stage of the appraisal pipeline;
- GPU-hours per lift test;
- overhead with confidential computing on vs off;
- cold-load versus warm-room cost, because published results show cold loads under confidential computing are expensive ([arXiv 2505.16501](https://arxiv.org/abs/2505.16501)).

These results set the fee schedule's compute pass-through and the fast-path versus async-path routing threshold (AC-10).

### 8.12 Security reviews and audits

- External audit of the contracts, covering NEAR async patterns, access control, arithmetic and upgrade paths.
- External audit of the room code and its build pipeline (reproducibility, measurement registration).
- Cryptographic review of the key hierarchy and the certificate formats.
- Penetration test of the operator infrastructure.
- A public bug bounty before caps are raised.

AC-54 gates cap increases on these reviews.

### 8.13 Compliance tests

- **MNPI screen.** Precision and recall on a labelled corpus built with compliance counsel.
- **PII detector.** Recall on synthetic and benchmark personal-data sets.
- **Identity (KYB) and sanctions-screening flows.** Covered by AC-45 and AC-47.
- **Provenance dossier.** Exported fields are reviewed against the Commission template (AC-48).
- **Category blocks.** Each prohibited category in §4.13 is blocked end to end.
- **Regulatory controls (AC-55 to AC-63), tested end to end:**
  - compliance-key delivery;
  - tier proofs and nullifiers in private mode;
  - 28 CFR 202 flags and buyer gating;
  - affected-owner-only exploit configuration;
  - jurisdiction-restricted weight rooms;
  - no escrow movement outside settlement rules (including from governance and pause paths);
  - tail eligibility;
  - in-room restricted-list matching.
- **Counsel review gates.** Written opinions on money transmission, GDPR role allocation, DGA scope, export status of decrypt-in-enclave, and MNPI "possession" are required before each stage's canary exit. A missing opinion holds the gate.

### 8.14 Chaos and failure injection

Inject each of the following during staging and canary runs. Assert that every job ends in a defined terminal state with funds conserved:

- room crash before, during and after verdict submission;
- MPC network unavailable or slow;
- NEAR RPC failure;
- an Intents solver that fails to fill;
- a destination-chain payout delay;
- a blob-store outage;
- a stale attestation collateral cache;
- clock skew;
- a governance pause during open jobs.

### 8.15 Canary launch checklist (per stage)

1. All acceptance criteria for the stage pass (§6), with CI evidence archived.
2. Both replay verifiers pass on all canary settlements.
3. External audits are closed (AC-54), and the incident drill is passed (AC-53).
4. Caps are set from the §8.9 value-cap calibration, with the assumptions published.
5. The design-partner pilot has run for the period the §4.17 gate specifies, with no unresolved dispute.
6. Signed compliance sign-off is complete for the categories being launched.

## 9. Risks & Open Questions

### 9.1 Risk register

**Reading the register**

- Severity and likelihood are **our judgement**: H (high), M (medium) or L (low).
- "Open" marks a risk without a complete mitigation. Those link to the open questions in §9.4–9.5.

| ID | Risk | Sev. | Lik. | Mitigation | Residual / open |
|---|---|---|---|---|---|
| **R1** | **Hardware attacks on enclaves.** Physical interposers cost $10–$1,000 in parts. BadRAM; Battering RAM; WireTap; TEE.fail, which extracted Intel's per-CPU attestation key; and DDRop, at $159, which fully compromises an Intel TDX VM. Intel and AMD treat these as out of scope. TEE.fail was demonstrated on BuilderNet, Secret Network and dstack-style stacks. | H | M (needs physical access to an allow-listed host) | Per-*platform* value caps enforced at key release (§4.7.5); platform allow-list of vetted operators and facilities; random assignment; k-of-n agreement above class H; immediate admission freeze on disclosure; fresh revocation collateral; assurance pool (Stage 3). The limitation is stated in every deck. | **Open:** how to price caps from insider-access cost rather than hardware cost; proof-of-location (§9.4, OR9) |
| **R2** | **Software and firmware vulnerabilities inside TEEs.** NEAR AI's 2026-11 inference-engine incident exposed confidential requests. A Google–Intel review found a host-to-TD compromise in TDX Module 1.5 (patched). StackWarp affects SEV-SNP with SMT on. | H | M | Minimal pinned images; per-job isolation; attestation policy with minimum TCB versions (§4.6.4); bug bounty; revocation drills (AC-53) | Medium |
| **R3** | **Appraisal-score leakage; fake buyers reconstructing a good.** | H | H (if unmitigated) | Global per-listing bit budget, debited before execution so refusals are simulatable; blind mode by default; per-bit compensation; nullifier sub-budgets; context rules; no free text (§4.7.4) | **Open research:** bits are not value; chosen-context probing; correlated listings; randomised outputs (OR1–OR3) |
| **R4** | **Appraiser validity.** Novelty is not value. Paraphrase gaming. LLM judges can be manipulated: universal phrases transfer across judges ([arXiv 2402.14016](https://arxiv.org/abs/2402.14016)). Lift tests are noisy and costly: small experiments picked the better dataset ~80% of the time in [arXiv 2504.11393](https://arxiv.org/abs/2504.11393). | H | M | Deterministic core; judges can only discount; floor band; appraiser datasheets; intervals instead of point values; seller-chosen pricing rules; benchmarks (AC-38–AC-43) | **Open:** paraphrase-robust novelty (OR5); calibrated lift tests (OR6) |
| **R5** | **Buyers game measured value.** Budget shading under surplus split; context deflation under value-indexed pricing. | M | M | Posted price by default; pre-publication snapshots for R2; seller floor (§4.7.2) | **Open:** incentive compatibility with measured values (OR4) |
| **R6** | **Cross-vendor non-determinism** causes false Fault outcomes or disputed re-execution. | M | M | Batch-invariant inference at temperature 0; empirical tolerances; re-execute deterministic components only where possible (§4.7.6) | **Open:** determinism of GPU training for lift tests (OR7) |
| **R7** | **NEAR primitive maturity.** No official CKD mainnet launch post found. Shade Agents deprecated. MPC: no proactive refresh, single-node stall, threshold reports differ (11-of-17 vs 11-of-16). Confidential Intents runs on a permissioned network (FAR). Intents has no testnet, is pausable, and suffered the 2026-10-01 exploit. No published job API for the GPU marketplace. | H | M | Own and audit the attestation code; threshold-KMS fallback (§4.5.6); escrow held outside the verifier; timeouts and refunds; mainnet canary under caps; direct engagement with NEAR One and NEAR AI | Medium. **Open:** CKD Option B (IBE) feasibility; FAR partnership terms |
| **R8** | **Insider information when selling to funds.** Payment satisfies "personal benefit" (*Dirks*/*Salman*); intermediary staff were charged (Primary Global Research); shadow trading (*Panuwat*, appeal argued 2026-06-11, no decision found); EU MAR and MiCA reach anyone who "knows or ought to know". | H | M | §4.13.2 controls: KYB; attestations; MNPI gate; buyer restricted and peer lists matched in-room; buyer compliance channel; EU and crypto rule sets; retention | **Open legal question:** does a buyer "possess" information that only its sealed room read and then forgot? (§9.5) |
| **R9** | **Data protection.** GDPR roles are untested for TEE exchanges, and identifiability is judged from the collecting controller's side (C-413/23 P). The DOJ Data Security Program treats encrypted data as covered and in-vault access as "brokerage". The EU Data Governance Act requires a separate entity and no other use of data. | H | M | §4.13.3–4.13.4: processor posture; attestations; personal-data screens; use-rights defaults; identity tier ID3 for flagged data; EU entity; narrowed "corpus" moat | **Open:** controller/processor allocation; DGA scope for knowledge goods *(counsel)* |
| **R10** | **Stolen data, copyright, trade secrets.** Bartz (pirated acquisition); Ross (no fair use for a non-generative tool, Third Circuit, 2026-09-29); Kadrey (market-dilution theory). | H | M | Licence-chain attestations; shadow-library blocklists; opt-out checks; seller bonds and indemnities; takedown; TLS-attested origin proofs where practical | Medium |
| **R11** | **Export controls.** The weights control (4E091) is unenforced but still on the books; decrypting in an enclave abroad may be an export. Intrusion-software controls apply to exploits. | M (weights) / H (exploits) | M | Jurisdiction-restricted weight rooms (AC-59); exploits to affected owners only (AC-58) | **Open:** export status of decrypt-in-enclave *(counsel)* |
| **R12** | **Settlement regulation.** Money transmission (FinCEN: DApp operators may be covered); OFAC; MiCA licensing period ended 2026-07-01. | M–H | M | No unilateral control over escrow (AC-60); licensed fiat partners; identity screening before trades; no custody of EU clients' crypto | **Open:** formal opinion *(counsel)* |
| **R13** | **Truth-contingent tails as swaps or event contracts.** US circuit split in 2026; CFTC rulemaking. | M | M | Stage 3 only; non-transferable warranty structure; institutional buyers; excluded categories; or a registered exchange partner (AC-61) | Open until CFTC and court outcomes settle |
| **R14** | **Liability for a wrong appraisal** ("who is liable when the AI misprices?") | M | M | Appraisals are measurements per a published datasheet, not advice; contract-set prices; disputes, re-execution and bonds; assurance (Stage 3) | Medium |
| **R15** | **Demand risk: the Ocean and iExec history.** No Ocean Market or compute-to-data volume figures were found. A third-party review reportedly counted 32 assets and 14 orders, but that page was unreachable, so the figure is unverified. iExec pivoted to confidential DeFi. | H | M | Sell *measured marginal value*, not access. Start with buyers who already pay: funds, and labs whose vendors already sell pay-for-lift ([Surge](https://surgehq.ai/ots)). Demand-led tenders. Kill criteria at each stage (§4.17). | **Open:** will buyers trust TEE-measured numbers enough to pay on them? (R19) |
| **R16** | **Two-sided cold start** | H | H | Buyer tenders, so sellers come to buyers; expert networks and data vendors as *sellers through* Marginal; the founder's existing B2B channel (7Block Labs, founder-reported) for private rooms | Medium |
| **R17** | **Buyer concentration.** AI-data demand is a few labs: ~90–91% of Mercor's H1-2026 gross came from foundation-model companies (S). | M | H | Diversify across funds, enterprises and eval buyers; avoid exclusive deals with one lab; neutral-venue positioning | Medium |
| **R18** | **Incumbent response.** Data vendors adding sealed evaluation; labs building rooms in-house (the DeepMind pilot); Super Protocol, Turnkey or VAST adding pricing; NEAR AI building a data-exchange layer. | M | M | Neutral venue; rails as partners; leakage standard; compliance artefacts (§4.16) | Medium |
| **R19** | **Buyers refuse TEE-measured lift as a contract basis** | H | M | Multi-vendor agreement; open-source rooms; reproducible builds; audits; attested score certificates; small capped stakes first; Stage 2 kill criterion | **Open**, answered only by pilots |
| **R20** | **Year-5 revenue sensitivity.** The obtainable revenue may be small for a venture outcome, and it depends on one segment (§9.2). | H | M | Prioritise the AI-lab clearing line after the knowledge wedge; verify the scope of Menlo's $15.3B; track GMV per lab buyer as the leading indicator | See §9.2 |
| **R21** | **Name collision.** "Lethe protocol" (erasure-proof audit market; prior art). "Marginal" (marginal.network, a DeFi leverage protocol; GitHub last pushed 2025-03-26; app returned HTTP 402). A US "MARGINAL SOFTWARE" word mark (serial 78065984; status unknown). | M | H | Keep LETHE as the hackathon codename only. Commission a formal clearance search (USPTO, EUIPO, UKIPO, WIPO; Nice classes 9, 35, 36, 42) before public use of "Marginal". Prepare alternatives. | **Open:** final name (§9.3) |
| **R22** | **Execution.** Solo founder, broad scope | H | H | Sequence verticals by stage; hire go-to-market and TEE engineering first (§4.15.5); kill criteria | Medium |
| **R23** | **Platform dependency on NEAR** (CKD, Intents, NEAR AI) and its incident history | M | M | Key-release fallback; settlement-route diversity; chain-agnostic certificate format | Medium |
| **R24** | **Long-horizon confidentiality.** CKD recovery keys and X25519 are not post-quantum. | L now; M long-term | L | Hybrid ML-KEM sealing in Stage 3; short listing lifetimes for long-value goods | Low |
| **R25** | **Fee calibration.** Leakage fees and compute costs price out honest buyers; budgets starve appraisals. | M | M | Calibrate in pilots (§8.9); per-class defaults; cached repeat verdicts | **Open:** default budgets and π (OQ1) |
| **R26** | **Seller surplus extraction deters buyers.** With full customisation, a seller can extract first-best revenue and leave zero buyer surplus ([arXiv 2412.18140](https://arxiv.org/abs/2412.18140)). | M | L–M | R1 and R4 leave buyer surplus by design; no seller-side access to individual buyers' measured values | Low |

### 9.2 Year-5 revenue sensitivity

Every number here is an **estimate**. No year-5 revenue figure is a forecast.

**(a) Top-down.** SAM ≈ $21.2B (§4.18.5) × share of SAM cleared (GMV) × blended take rate:

| Share of SAM cleared → GMV | 3% take | 6% take | 10% take | 15% take |
|---|---|---|---|---|
| 0.25% → $53M | $1.6M | $3.2M | $5.3M | $8.0M |
| 1% → $212M | $6.4M | $12.7M | $21.2M | $31.8M |
| 3% → $636M | $19.1M | $38.2M | $63.6M | $95.4M |

**(b) Bottom-up.** Every driver marked (A) is an **assumption**. The other inputs are sourced in §4.18.4. This is the frame from `spec-notes/market-2026.md` §3.2.

| Segment | Driver | Low | Base | High |
|---|---|---|---|---|
| Funds / alternative data | buyers (A) × $1.6M budget × share routed (A) × take (A) | 20 × 5% × 3% → GMV $1.6M, rev $0.05M | 60 × 10% × 6% → GMV $9.6M, rev $0.58M | 150 × 20% × 10% → GMV $48M, rev $4.8M |
| AI labs and model builders | buyers (A) × GMV per buyer (A) × take (A) | 3 × $5M × 3% → GMV $15M, rev $0.45M | 8 × $20M × 6% → GMV $160M, rev $9.6M | 15 × $60M × 10% → GMV $900M, rev $90M |
| Expert answers | answers/yr (A) × ~$1,000 (call-price benchmark) × take (A) | 2,000 × 10% → GMV $2M, rev $0.2M | 10,000 × 15% → GMV $10M, rev $1.5M | 50,000 × 25% → GMV $50M, rev $12.5M |
| Exploit disclosure | share (A) of a ~$120M/yr bounty pool (A) × 10% (A) | 0.5% → rev $0.06M | 2% → rev $0.24M | 5% → rev $0.6M |
| Private rooms | rooms (A) × $250k (A; founder-reported range) | 2 → $0.5M | 10 → $2.5M | 30 → $7.5M |
| **Total** | | **GMV ≈ $19M, revenue ≈ $1.3M** | **GMV ≈ $182M, revenue ≈ $14.4M** | **GMV ≈ $1.0B, revenue ≈ $115M** |

**What the arithmetic says**

1. The AI-lab line is ~67% of base-case revenue and ~78% of high-case revenue. Year-5 revenue is essentially *number of lab buyers × GMV per lab × take rate*.
2. The funds line stays small even in the high case, consistent with "knowledge goods are the wedge, not the business".
3. Reaching $50M revenue at a 6% blended take needs ≈ $833M GMV, ≈ 3.9% of the SAM estimate.
4. MOONSHOT's original SOM ($7M–$59M) brackets the base case.
5. The venture case still rests on two things no sourced base can size:
   - AI-lab data budgets moving from bilateral deals to exchanges;
   - **latent supply**: information never sold today because it cannot be shown safely.

    Both are hypotheses for pilots to test, not facts.

### 9.3 Name collision

- "Lethe" is taken in exactly this niche:
  - the Lethe protocol's erasure-proof audit market (archived April 2026, now offline);
  - an ETHGlobal project named "Lethe";
  - Lethean (LTHN);
  - several machine-unlearning papers.
- "Marginal" collides with marginal.network, a DeFi leverage protocol in the same broad field (on-chain financial markets). It looks dormant (GitHub last pushed 2025-03-26) but may hold rights.
- There is also a US "MARGINAL SOFTWARE" mark for financial-calculation software, status unknown ([Justia](https://trademark.justia.com/owners/kosaka-dane-1752676)).
- **Decision needed before any public launch:**
  - run a formal clearance search;
  - if "Marginal" is not clear, use a composite or different mark;
  - keep "LETHE" as the hackathon codename only.

### 9.4 Open research problems

| ID | Problem | Why it matters | Current approach |
|---|---|---|---|
| OR1 | **Value-weighted leakage.** Bits bound guessing advantage, not dollar value. | A one-bit good can be fully revealed within a tiny budget | Class rules that forbid content-correlated fields; seller-marked "never appraise directly" facts; gain-function leakage theory ([Alvim et al. 2012](https://doi.org/10.1109/CSF.2012.26)) as the research basis |
| OR2 | **Adaptive chosen-context probing.** Tighter-than-worst-case bounds, and DP alternatives for single secrets. | The worst-case bound (Mestel Thm 4) may starve honest use. Adaptivity can make leakage grow linearly. | Red-team calibration (§8.8); DP or Ladder release rules for datasets and evals |
| OR3 | **Correlated listings.** The same insight relisted. | Separate budgets do not bound total exposure | Near-duplicate screening; seller attestations |
| OR4 | **Incentive compatibility with measured values** | Classic mechanisms assume reported values. Here the buyer controls B and its context, and the seller controls its parameters. | R1/R4 defaults; snapshot rules; formal analysis planned for the Stage 2 paper |
| OR5 | **Paraphrase-robust, adversarially robust novelty** | Sellers will paraphrase. Buyers' notes are messy. | Semantic retrieval + NLI + extractor union; NovAScore baseline; adversarial evaluation |
| OR6 | **Cost-bounded lift tests with calibrated uncertainty** | Sample lift can mislead; extrapolation is biased early in training ([arXiv 2402.02314](https://arxiv.org/abs/2402.02314)) | Staged proxies; interval outputs; datasheet sign-agreement rates |
| OR7 | **Cross-vendor determinism** for judges and training | Needed for re-execution and k-of-n | Batch-invariant inference; tolerance bands; deterministic-only re-execution |
| OR8 | **Forgetting as a mechanism.** General welfare results beyond worked examples ([arXiv 2510.21904](https://arxiv.org/abs/2510.21904)); composition with output leakage. | The theory behind the certificate's economic value is illustrative, not general | Treat the certificate as a trust and compliance artefact first |
| OR9 | **Platform identity and location** (proof-of-cloud) | Caps and facility vetting rely on knowing *which* machine is where; attestation alone cannot show location ([Flashbots](https://writings.flashbots.net/mind-the-gap-tee-poc)) | PPID allow-list now; track proof-of-cloud work |
| OR10 | **Legal "possession" and roles.** Information appraised and forgotten in a sealed room; GDPR roles; export status of decrypt-in-enclave. | Determines MNPI, data-protection and export exposure | Counsel opinions before Stage 1 exit |

### 9.5 Open product questions

- **OQ1.** Default leakage budgets, per-bit prices and minimum context sizes per asset class. To be set from pilots and red-team data (§8.8–8.9).
- **OQ2.** Default judge floor ℓ_floor per class, and value-class thresholds *H* for k-of-n.
- **OQ3.** Challenge-window lengths *W* per class, trading seller cash-flow against dispute coverage.
- **OQ4.** Which stablecoin(s) to settle in, and how to handle issuer risk.
- **OQ5.** Is CKD usable as identity-based encryption (Option B, §4.5.2)? Needs confirmation from NEAR One and a cryptographic review.
- **OQ6.** Can terms for a FAR (Confidential Intents) partnership be agreed, and what do FAR operators see in practice?
- **OQ7.** Will NEAR AI's Confidential GPU Marketplace publish a job API and pricing usable for G-rooms?
- **OQ8.** How should the buyer compliance channel interact with "sealed from Marginal"? Specifically: which compliance staff, which keys, and what retention.
- **OQ9.** The final product name (§9.3).
- **OQ10.** Does a no-deal appraisal by a fund's sealed room create compliance-reportable "possession" of the appraised content? *(counsel; see OR10)*

### 9.6 Where this spec corrects MOONSHOT.md

MOONSHOT.md itself is unchanged. The corrected statements are used throughout this spec. Detailed evidence is in `spec-notes/*.md`.

| # | MOONSHOT claim | Corrected statement (source) |
|---|---|---|
| 1 | TEE.fail "extracted TDX/SEV-SNP attestation keys … could impersonate NVIDIA CC GPUs" | It extracted Intel's per-CPU attestation key. On AMD it extracted in-VM OpenSSL keys. NVIDIA reports were *relayed*, not forged ([tee.fail](https://tee.fail)). |
| 2 | "Physical TEE attacks cost $50–$1,000"; caps set "from the observed cost of TEE.fail-class attacks" | The range is $10–$1,000, and DDRop ($159) gives full TDX compromise ([ddropattack.eu](https://ddropattack.eu/)). Caps key to platforms and to insider-access cost. |
| 3 | Blackwell implied to protect memory; "TOPLOC verifies up to 100× faster"; 2409.03992 shows "frontier-size" models | HBM is unencrypted on both GPU generations ([NVIDIA](https://docs.nvidia.com/confidential-computing/virtual-machines/threat-model)). TOPLOC v2 says "significantly faster". The 100B+ evidence is [2608.26575](https://arxiv.org/abs/2608.26575). |
| 4 | "Intel Trust Authority co-verifies" as a mitigation | Intel Trust Authority delegates GPU checks to NRAS and does not mitigate physical attacks ([ITA](https://docs.trustauthority.intel.com/main/articles/concept-gpu-attestation.html)) |
| 5 | Shade Agents as the room framework | Deprecated: "not maintained since April 19, 2026" ([docs](https://docs.near.org/ai/shade-agents)). Marginal owns its attestation code. |
| 6 | CKD seals goods "to a policy (codehash X, this auction)" | CKD binds keys to the calling contract. Policy is Marginal's contract, made immutable per version ([NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html)). |
| 7 | Confidential Intents on "a private shard" hides who bought what | It runs on FAR, a permissioned NEAR instance. Data is hidden from the public, not from FAR's operators ([docs](https://docs.near-intents.org/integration/market-makers/confidential-intents.md)). |
| 8 | Intents ~$34.9B cumulative volume, "35+ chains" | $37.3B cumulative to 2026-11-10 (DefiLlama API); the docs list 32 chains |
| 9 | Key release and settlement "in one yield/resume flow" | The yield times out at 200 blocks (~2 min), so jobs are two-phase. Atomicity ends at the NEAR-side transfer (§4.3.5, §4.9.4). |
| 10 | Conditional Recall "proves … strictly dominate" | Worked examples "for appropriate payoffs", not a general theorem ([arXiv 2510.21904](https://arxiv.org/abs/2510.21904)) |
| 11 | 2604.08606 shows "inspection is only fair … against what the buyer already knows" | The paper is "Extrapolating Volition with Recursive Information Markets"; it makes no fairness claim. Buyer-relative value is anchored in Bergemann, Bonatti & Smolin 2018. |
| 12 | Myerson payment as "the minimal truthful rule" for buyer-side price discovery; Myerson reserves from measured values | [2504.05563](https://arxiv.org/abs/2504.05563) covers *seller* costs, and is used here for tenders (R5). Measured values move the incentive problem to buyer inputs (§4.7.2). |
| 13 | "First-price auctions … reach 1−1/e² welfare when sellers are substitutable" | A worst-case lower bound under near-independent values, for agents bidding for prompts, not data tenders ([arXiv 2610.20587](https://arxiv.org/abs/2610.20587)) |
| 14 | SVD mechanism "extracts near-full welfare" | It gets seller *revenue* within an additive log κ, leaving buyers little surplus ([arXiv 2412.18140](https://arxiv.org/abs/2412.18140)) |
| 15 | The Nash split as the bilateral rule | Not truthful (Myerson–Satterthwaite). Posted price is the default (§4.7.2). |
| 16 | Leakage budget: "no prior implementation … nothing like it" | The concepts have prior art (QIF, DP budgets, the Ladder, query pricing, privacy-loss compensation). Only the contract-enforced, priced, per-listing combination is claimed (§4.7.4). |
| 17 | Buyer-relative pricing cleared by a truthful mechanism is new | Prior art: [Agarwal, Dahleh & Sarkar 2019](https://arxiv.org/abs/1805.08125); [PrivaDE](https://arxiv.org/abs/2510.18109). Novelty is the sealed-TEE, two-sided, on-chain combination. |
| 18 | The forget certificate as a new settlement artefact; Lethe protocol "Flashbots-adjacent" | Signed erasure proofs in an escrow flow exist (Lethe protocol, testnet). The claim is narrowed to an attestation-bound, two-sided certificate. The "Flashbots-adjacent" label is unsupported. |
| 19 | Surge "pay if metric improves" (SECONDARY, Sacra) | A primary vendor page exists ([surgehq.ai/ots](https://surgehq.ai/ots)). Labs receive the full dataset first. The Sacra link was an AI-generated chat page. |
| 20 | STRIDE "13× faster"; In-Run Shapley and STRIDE as "cheap proxies" | "Over 12×" against an extrapolated baseline. Neither is a pre-screen ([arXiv 2606.05165](https://arxiv.org/abs/2606.05165), [2406.11011](https://arxiv.org/abs/2406.11011)). |
| 21 | Attestable Audits ran on "TDX/SEV-SNP/Nitro"; ManaTEE "signs eval results" | A Nitro-only, CPU prototype ([arXiv 2506.23706](https://arxiv.org/abs/2506.23706)). The ManaTEE signing claim is unverified. |
| 22 | VFT/VeriLoRA prove "trained only on a committed dataset" | VeriLoRA is ~1000× slower than training with no dataset binding. VFT's numbers cannot be reproduced from what is published. |
| 23 | Dataset inference deters a no-deal buyer; "4-bit quantisation restores 83%" | Dataset inference works at dataset scale and deters after a breach or a copy leak. Unlearned models "retain" 83% on average after quantisation (vs 21%). |
| 24 | Market figures (Menlo $37B / $12.5B; ESOMAR $153B; Neudata "$1.6M across 20 vendors"; HackerOne $81M; Bartz "P (court)") | Menlo 2026: $15.3B training data and services, 2025 restated to $33B. ESOMAR ≈$165B (2025). Neudata: $1.6M across ~20 *datasets* (2024). HackerOne $89.1M. Bartz is press-sourced; final approval by Judge Martínez-Olguín; appeals filed. |
| 25 | EU AI Act GPAI duties "in force 2025-08-02"; licensed data "becomes a compliance input"; dossiers "satisfy" Art. 53 | They *apply* from 2025-08-02, with fines from 2026-08-02. Art. 53 requires disclosure and a copyright policy, not licensing. Dossiers *support*, never satisfy. |
| 26 | MNPI "category ban"; export-control row; "securities status" of tails | A category ban is insufficient (§4.13.2). 4E091 is unenforced but on the books; exploit controls were missing. Tails are mainly a CFTC and state-gaming question. DGA, DOJ data rule, FinCEN, OFAC and MiCA were missing (§4.13). |
| 27 | Bartz as "the price of scrape first, license never" | Training on lawfully acquired books was ruled fair use; the liability came from the pirated library |
| 28 | The NEAR "DCML paper (arXiv 2410.13752)" | That ID is an Atoma Network paper ([arXiv](https://arxiv.org/abs/2410.13752)) |
| 29 | Agent Market launched ~2026-02-05 and lacks escrow | Launched 2026-02-04, with escrow and a dispute agent ([NEAR AI](https://near.ai/blog/introducing-near-ai-agent-market)) |
| 30 | Opaque as a competitor | Wound down in Oct 2026; its team joined Anthropic (terms undisclosed) ([opaque.co](https://www.opaque.co/)) |

### 9.7 Sources

The full verified source lists, with source-type labels and query logs, are in `spec-notes/` (`near-primitives.md`, `tee-security.md`, `mechanism-econ.md`, `ml-papers.md`, `competitors-2026.md`, `market-2026.md`, `regulatory.md`) and `moonshot-notes/`. The most important citations used in this spec:

**Information economics and mechanism design**

- Arrow 1962, NBER, DOI [10.1515/9781400879762-024](https://www.nber.org/system/files/chapters/c2144/c2144.pdf). Shows the value of information is unknown to the buyer until disclosed.
- Bergemann, Bonatti & Smolin 2018, *AER*, DOI [10.1257/aer.20161079](https://doi.org/10.1257/aer.20161079). Willingness to pay depends on prior information.
- Hörner & Skrzypacz 2016, *JPE*, DOI [10.1086/688874](https://doi.org/10.1086/688874). Gradual sale; third parties help the seller.
- Admati & Pfleiderer 1990, DOI [10.2307/2938355](https://doi.org/10.2307/2938355). Selling information to traders.
- Myerson 1981, DOI [10.1287/moor.6.1.58](https://doi.org/10.1287/moor.6.1.58).
- Myerson & Satterthwaite 1983, DOI [10.1016/0022-0531(83)90048-0](https://doi.org/10.1016/0022-0531(83)90048-0).
- Agarwal, Dahleh & Sarkar, [arXiv 1805.08125](https://arxiv.org/abs/1805.08125). Truthful pricing by buyer-task gain.
- NDAI Agreements, [arXiv 2502.07924](https://arxiv.org/abs/2502.07924). TEE + agents mitigate hold-up under stated conditions.
- Conditional Recall, [arXiv 2510.21904](https://arxiv.org/abs/2510.21904). Forgetting commitments, shown in worked examples.
- [arXiv 2504.05563](https://arxiv.org/abs/2504.05563). LOO and Shapley are not incentive-compatible as payments; Myerson payment is minimal for sellers.
- [arXiv 2412.18140](https://arxiv.org/abs/2412.18140). Seller revenue extraction.
- [arXiv 2510.25779](https://arxiv.org/abs/2510.25779). First-proposal bias in agent markets.
- Gneiting & Raftery 2007, DOI [10.1198/016214506000001437](https://doi.org/10.1198/016214506000001437).
- FairSwap, DOI [10.1145/3243734.3243857](https://doi.org/10.1145/3243734.3243857).

**Leakage**

- Mestel 2019, [arXiv 1905.04332](https://arxiv.org/abs/1905.04332). Adaptive min-entropy leakage equals log of the consistent output count.
- Smith 2009, DOI [10.1007/978-3-642-00596-1_21](https://doi.org/10.1007/978-3-642-00596-1_21).
- Köpf & Dürmuth, [ePrint 2009/089](https://eprint.iacr.org/2009/089).
- The Ladder, [arXiv 1502.04585](https://arxiv.org/abs/1502.04585).
- Holdout reuse, [arXiv 1506.02629](https://arxiv.org/abs/1506.02629).
- Kenthapadi et al. 2005, DOI [10.1145/1065167.1065183](https://doi.org/10.1145/1065167.1065183).
- Dinur & Nissim 2003, DOI [10.1145/773153.773173](https://doi.org/10.1145/773153.773173).
- Li et al. 2013, [arXiv 1208.5258](https://arxiv.org/abs/1208.5258).
- Koutris et al. 2012, DOI [10.1145/2213556.2213582](https://doi.org/10.1145/2213556.2213582).
- [arXiv 2105.08266](https://arxiv.org/abs/2105.08266). Label inference from scores.

**TEE security and performance**

- [tee.fail](https://tee.fail), [ddropattack.eu](https://ddropattack.eu/), [batteringram.eu](https://batteringram.eu), [wiretap.fail](https://wiretap.fail), [badram.eu](https://badram.eu), [sgx.fail](https://sgx.fail).
- NVIDIA CC threat model, [docs](https://docs.nvidia.com/confidential-computing/virtual-machines/threat-model).
- [arXiv 2608.26575](https://arxiv.org/abs/2608.26575), Blackwell CC performance.
- [arXiv 2509.18886](https://arxiv.org/abs/2509.18886), CPU and GPU TEE inference costs.
- [arXiv 2505.16501](https://arxiv.org/abs/2505.16501), CC throughput with model swapping.
- [arXiv 2507.02770](https://arxiv.org/abs/2507.02770), GPU CC metadata.
- [arXiv 2602.11434](https://arxiv.org/abs/2602.11434), TDX module review.
- [arXiv 2501.16007](https://arxiv.org/abs/2501.16007), TOPLOC.
- [arXiv 2511.02620](https://arxiv.org/abs/2511.02620), weight-exfiltration detection.
- [arXiv 2512.20176](https://arxiv.org/abs/2512.20176), optimistic TEE rollups.
- Flashbots, ["Mind the Gap"](https://writings.flashbots.net/mind-the-gap-tee-poc).
- Apple PCC, [blog](https://security.apple.com/blog/private-cloud-compute/).
- RAND, [RB-A2849-1](https://www.rand.org/pubs/research_briefs/RBA2849-1.html).
- Thinking Machines, [nondeterminism](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/).

**NEAR primitives**

- CKD, [NEAR One](https://blog.nearone.org/research/2026/02/23/mpc-ckd.html).
- [yield/resume](https://docs.near.org/smart-contracts/anatomy/yield-resume).
- [Shade Agents status](https://docs.near.org/ai/shade-agents).
- [near/intents](https://github.com/near/intents) and [Intents docs](https://docs.near-intents.org/).
- [Confidential Intents](https://docs.near-intents.org/integration/market-makers/confidential-intents.md).
- [NEAR AI response signatures](https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md).
- [NEAR AI incident report](https://near.ai/blog/security-incident-report-sglang-vulnerability).
- Independent MPC review, [alinush.github.io/near](https://alinush.github.io/near) (secondary).

**Appraisal and ML**

- [2409.09249](https://arxiv.org/abs/2409.09249) NovAScore.
- [2502.13691](https://arxiv.org/abs/2502.13691) information potential.
- [2505.12212](https://arxiv.org/abs/2505.12212) Data Whisperer.
- [2402.04333](https://arxiv.org/abs/2402.04333) LESS.
- [2504.11393](https://arxiv.org/abs/2504.11393) DataDecide.
- [2507.09424](https://arxiv.org/abs/2507.09424) DATE-LM.
- [2410.16454](https://arxiv.org/abs/2410.16454), [2505.16831](https://arxiv.org/abs/2505.16831): unlearning limits.
- [2406.06443](https://arxiv.org/abs/2406.06443), [2507.03619](https://arxiv.org/abs/2507.03619): dataset inference.
- [2510.18554](https://arxiv.org/abs/2510.18554): alignment-data extraction.
- [2403.06634](https://arxiv.org/abs/2403.06634): model stealing.
- [2310.17623](https://arxiv.org/abs/2310.17623), [2402.07841](https://arxiv.org/abs/2402.07841): contamination and membership-inference limits.
- [2403.17710](https://arxiv.org/abs/2403.17710), [2402.14016](https://arxiv.org/abs/2402.14016), [2410.05451](https://arxiv.org/abs/2410.05451): judge attacks and defences.
- [2506.23706](https://arxiv.org/abs/2506.23706) Attestable Audits.
- DeepMind double-blind evaluations, [blog](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/).

**Market**

- [Menlo 2026](https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/).
- [Neudata 2026](https://www.neudata.co/blog/state-of-the-alternative-data-market-2026).
- [Inex One](https://inex.one/blog/expert-network-market-size).
- Burton-Taylor via [Mondo Visione](https://mondovisione.com/media-and-resources/news/realtime-analytics-drive-record-growth-across-the-financial-market-data-landsca-2026326).
- [Surge](https://surgehq.ai/ots).
- [Dealroom on Mercor](https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/).
- Reddit 8-K filings on [EDGAR](https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm).
- [AWS listing fees](https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html).
- [OpenRouter pricing](https://openrouter.ai/pricing).
- [DefiLlama API](https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume).
- *[Try Before You Buy*, arXiv 2012.08874](https://arxiv.org/abs/2012.08874).

**Regulatory**

- [Commission GPAI Q&A](https://digital-strategy.ec.europa.eu/en/faqs/general-purpose-ai-models-ai-act-questions-answers).
- [DGA](https://eur-lex.europa.eu/eli/reg/2022/868/oj).
- [28 CFR Part 202](https://www.ecfr.gov/current/title-28/chapter-I/part-202).
- [15 CFR 734.18](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-734/section-734.18).
- [15 CFR 740.22](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.22).
- [FIN-2019-G001](https://www.fincen.gov/sites/default/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf).
- [MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj).
- *[Dirks](https://www.law.cornell.edu/supremecourt/text/463/646)*.
- *[Salman](https://www.supremecourt.gov/opinions/16pdf/15-628_m6ho.pdf)*.
- [Advisers Act §204A](https://www.law.cornell.edu/uscode/text/15/80b-4a).
- [C-413/23 P](http://publications.europa.eu/resource/celex/62023CJ0413.ENG.xhtml).
- [EDPB Opinion 28/2024](https://www.edpb.europa.eu/system/files/2024-12/edpb_opinion_202428_ai-models_en.pdf).
- [CFTC NPRM 2026](https://www.federalregister.gov/documents/2026/06/12/2026-11854/prediction-markets-public-interest-determinations).

**Competitors**

- [Turnkey](https://docs.turnkey.com/solutions/verifiable-cloud/data-brokerage).
- [Super Protocol](https://superprotocol.com/).
- [Lethe protocol, archived](http://web.archive.org/web/20260409212333/https://lethe-protocol.github.io/).
- [NDAI TrustKit](https://github.com/discordwell/ndai-hackathon), [TBVH](https://github.com/deepsp94/tbvh), [DealProof](https://github.com/kkoci/Dealproof), [Mnemo](https://github.com/Eduardogbg/mnemo).
- [marginal.network](https://marginal.network/).
- v0 repositories: [LETHE](https://github.com/jayanth-kumar-morem/lethe), [ChainProof Guard](https://github.com/jayanth-kumar-morem/chainproof-guard).

