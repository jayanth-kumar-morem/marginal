# Mechanism and information-economics verification notes (for SPEC.md)

Compiled 2026-11-11. Scope: MOONSHOT.md §2, §3.1 rows 2–4, §3.2 item 5, §4.4, §7 item 3, §9.3, and moonshot-notes/papers.md sections D and F.

**Method.**
- arXiv IDs were checked through the export API (`export.arxiv.org/api/query?id_list=...`, six batches, 31 IDs). All 31 resolved.
- Claims that depend on a theorem's assumptions were checked against the arXiv HTML full text: 2510.21904, 2604.08606, 2504.05563, 2610.20587, 2502.07924, 2412.18140 and 2403.14443.
- DOIs, volumes and pages for non-arXiv works were checked through the Crossref REST API (`api.crossref.org/works`).
- Source-type labels: **PRIMARY** means the paper itself, a publisher or official record, or the arXiv/Crossref metadata of the paper. **SECONDARY** means a summary, aggregator, search snippet or another paper's description. **UNVERIFIED** means not confirmed this session.
- "Content not re-read" means the DOI and title were verified but the paper's text was not fetched this session. Those items rely on the paper's well-known content and are flagged as such.

**Pages that could not be fetched or read:**
- The NBER PDF of Arrow (1962) is an image scan with no text layer.
- Smith's FoSSaCS 2009 PDF returns 404 on the FIU site.
- RAND P-1856 returned 403.
- The Southampton e-print page (Papakonstantinou et al.) returned 403.
- The Bergemann–Ottaviani Handbook chapter PDF and the arXiv PDF of 1603.02187 came back as compressed binary.
- The edegan wiki was down for maintenance.

---

## 1. Verdict table

| # | Claim (as worded in MOONSHOT or the notes) | Verdict | What the source actually says (≤2 sentences) | URL or DOI | Source type | Date |
|---|---|---|---|---|---|---|
| 1 | §2: "In 1962 Kenneth Arrow pointed out… To know what it is worth, the buyer has to see it, and once they have seen it they no longer need to buy it." | CONFIRMED (paraphrase is fair) | Arrow: "…its value for the purchaser is not known until he has the information, but then he has in effect acquired it without cost". An exact-phrase search matched this wording, and a Cardiff working paper cites it at p. 615. The clause before it, "there is a fundamental paradox in the determination of demand for information", is the standard quotation but I could not check it word for word because the NBER PDF is a scan. | NBER PDF https://www.nber.org/system/files/chapters/c2144/c2144.pdf ; DOI 10.1515/9781400879762-024 (in *The Rate and Direction of Inventive Activity*, pp. 609–626) ; page cite: https://orca.cardiff.ac.uk/77948/1/e2013_2.pdf | PRIMARY (citation) / SECONDARY (exact wording and page) | 1962 |
| 2 | §15.1 script: "In 1962 Kenneth Arrow showed that information can't be sold." §14 slide 2: "information can't be sold without being given away" | OVERSTATED | Arrow identified a paradox in the *demand* for information. The literature reads it as the reason legal protection such as patents is needed, not as proof that sale is impossible. Hörner & Skrzypacz (2016) show partial, gradual sale is possible, with a third party allowing full surplus extraction. | https://en.wikipedia.org/wiki/Arrow_information_paradox ; DOI 10.1086/688874 | SECONDARY / PRIMARY | 1962 / 2016 |
| 3 | §2(2): NDAI shows "a TEE plus an AI agent acts as an 'ironclad NDA' that resolves the hold-up problem." | CONFIRMED, with conditions | The abstract says TEEs plus AI agents "can mitigate and even fully eliminate" hold-up, and "ironclad NDA" is the paper's own phrase. Full elimination assumes fully secure TEEs, an invention value ω ≤ Φ(k,p,C) (a k-of-n provider threshold with detection probability p and penalty C), agents that value the invention "with sufficient fidelity", and symmetric Nash bargaining inside the TEE. It does not analyse what the deal or price outcome itself leaks. | https://arxiv.org/abs/2502.07924 (HTML read) | PRIMARY | 2025-02-11 |
| 4 | §2(2): Conditional Recall "proves that mechanisms where the buyer's agent can be made to forget strictly dominate perfect-recall mechanisms in information markets". §4.4(4): "says this commitment strictly improves market outcomes" | OVERSTATED | The abstract only says "We explore the game theoretic implications of a technology (such as TEEs) that allows agents to commit to forget information". The introduction asserts "we demonstrate how conditional recall mechanisms strictly dominate classical solutions that assume perfect recall", but the body gives worked example equilibria and no general theorem (the Arrow example holds "For appropriate payoffs"). Its assumptions: forgetting is used once, the forgetter remembers having forgotten, other players observe that it happened, and TEEs make it credible. In some games individual forgetting changes nothing (the Mafia example). | https://arxiv.org/abs/2510.21904 (HTML read) | PRIMARY | 2025-10-24 |
| 5 | §2(2): "*Recursive inspection* (2604.08606) shows inspection is only fair when it is done against what the buyer already knows. That last property is the core of Marginal's pricing." | CORRECTED | The title is "Extrapolating Volition with Recursive Information Markets" (Pallavi Sudhir & Tran-Thanh, AAMAS-2026 GAIW workshop). It measures value against the buyer's prior-optimal decision and proves its Recursive Inspection Protocol is ex-ante superior to any admissible purchase protocol under a common prior (Thm 3.3). It makes no fairness claim, and the authors note their marginal-value mechanism fails their own extrapolated-volition goal. Better anchors for buyer-relative value are Bergemann, Bonatti & Smolin (2018) and 2412.18140 (see §2). | https://arxiv.org/abs/2604.08606 (HTML read) | PRIMARY | 2026-04-08 |
| 6 | §16 lists 2603.19011 (no claim attached) | CONFIRMED (identity) | "Security awareness in LLM agents: the NDAI zone case" (Bottazzi & Park). Across 10 LLMs, a failing attestation suppresses disclosure in every model, but a passing one gets mixed responses: models "can reliably detect danger signals but cannot reliably verify safety". | https://arxiv.org/abs/2603.19011 | PRIMARY | 2026-03-19 |
| 7 | §15.2 / §9: Information Bazaar (2403.14443) as inspect-then-forget prior art | CONFIRMED | The title is "Language Models Can Reduce Asymmetry in Information Markets" (first author Nasim Rahaman, not Weiss), and it names its environment "the Information Bazaar". Forgetting is simulated in a Python/mesa agent model with no TEE, and the paper does not analyse leakage through inspection. | https://arxiv.org/abs/2403.14443 (HTML read) | PRIMARY | 2024-03-21 |
| 8 | §3.1 row 3: "an SVD selling mechanism extracts near-full welfare". papers.md D#29: "losing only a condition-number factor" | CORRECTED | Value is information gain relative to the buyer's prior data (Bayesian linear regression). With full customisation the seller extracts first-best *revenue*, leaving "zero surplus to buyers". From a fixed data pool, the "SVD Mechanism" gets seller revenue within an *additive* log(κ) of first-best, so this is a surplus-extraction result, not a welfare result. | https://arxiv.org/abs/2412.18140 (HTML read) | PRIMARY | 2024-12-24 |
| 9 | §3.1 row 4 / §4.4(2): "Shapley or LOO values are not truthful prices" | CONFIRMED (in its setting) | Sellers have private data-collection costs and buyer values are known. LOO payments induce cost misreporting (Claim 3, proof only sketched), and Shapley is "not IC either" (Remark 1, supported mainly by simulations). | https://arxiv.org/abs/2504.05563 (HTML read) | PRIMARY | 2025-04-07 |
| 10 | §3.1 row 4: "Myerson payment is the minimal truthful, buyer-optimal rule". §4.4(2): "the minimal truthful rule" used to justify buyer-side price discovery | CONFIRMED in a seller-cost (procurement) setting; MISAPPLIED in §4.4(2) | Thm 5.1: "Myerson payment is the smallest IC and IR (for data sellers) payment rule", given the welfare-maximising allocation. Buyer IR also needs subadditive buyer value (Thm 5.3). The paper does not model buyers bidding, and for two-sided private values the authors say "only impossibility results can be established". | https://arxiv.org/abs/2504.05563 | PRIMARY | 2025-04-07 |
| 11 | papers.md D#28: Fairshare, NeurIPS 2025 | CONFIRMED | Buyers are LLM builders and sellers are annotators. Exploitative pricing drives high-quality sellers out, and valuation-based "fairshare" pricing maximises long-run buyer utility and seller profit (journal ref NeurIPS 2025, DOI 10.52202/085713-1119). | https://arxiv.org/abs/2502.00198 | PRIMARY | 2025-01-31 (v4 2025-11-19) |
| 12 | §3.1 row 4: "First-price auctions among LLM agents reach 1−1/e² welfare when sellers are substitutable". §4.4(2): "first-price sealed tenders are near-efficient (1−1/e² welfare)" | CORRECTED | 1−1/e² is a worst-case *lower bound* over all Bayes–Nash equilibria (n ≥ 2). It holds as bidders' values approach independence conditional on the prompt (Thm 5, building on Jin & Lu's tight bound for independent values). Substitutability corresponds to a *separate* "competitive floor" bound of (1−1/e)+α/e for two bidders above floor α. The setting is a forward first-price auction in which serving agents bid for prompts, with no data or procurement tender. In EmbedLLM simulations it reached about 99% of oracle welfare. | https://arxiv.org/abs/2610.20587 (HTML read) | PRIMARY | 2026-10-14 |
| 13 | papers.md F#40: "With a competitive floor and near-conditional-independence, FPA welfare approaches 1−1/e²" | CORRECTED | These are two distinct theorems. The competitive floor gives (1−1/e)+α·[1/e−S_m(ε)]₊ (Thm 3). Near-conditional-independence gives (1−1/e²) minus an error term (Thm 5). | https://arxiv.org/abs/2610.20587 | PRIMARY | 2026-10-14 |
| 14 | §3.2(5): "Magentic Marketplace shows a 10–30× first-proposal bias and welfare collapse at scale." Framed as "LLM agents are bad negotiators" | CONFIRMED (number); OVERSTATED ("collapse", "negotiators") | The abstract says "Performance degrades sharply with scale" and "all models exhibit severe first-proposal bias, creating 10-30x advantages for response speed over quality". The study is about assistant agents choosing among service proposals, not specifically haggling. | https://arxiv.org/abs/2510.25779 | PRIMARY | 2025-10-27 |
| 15 | papers.md F#39: AgenticPay "ICLR 2026"; "buyer/seller role asymmetries across models (abs)" | UNVERIFIED (venue); OVERSTATED (marked "abs") | The arXiv record has no venue or comment field. The abstract reports 110+ tasks, "substantial gaps in negotiation performance" and long-horizon reasoning difficulties, but does not mention role asymmetries. | https://arxiv.org/abs/2602.06008 | PRIMARY | 2026-02-05 |
| 16 | papers.md D#33: information design with LLMs | CONFIRMED | Treats language framing as a non-Bayesian shift of the receiver's prior, combined with Bayesian signaling. Characterises when optimising framing alone, or framing plus signaling, is tractable, and runs an LLM prompt-optimisation study. | https://arxiv.org/abs/2509.25565 | PRIMARY | 2025-09-29 (v2 2026-03-03) |
| 17 | §4.4(2): "Because the room sees each buyer's valuation, it can run Myerson-style optimal reserve pricing *without any party seeing the other bids*." | OVERSTATED | Myerson (1981) designs revenue-optimal auctions when buyers privately know their willingness to pay and the seller holds a prior over it. If the room *measures* value, the incentive problem moves to what the buyer controls (declared `budget_b`, which context to seal), and a seller who can target measured value can extract almost all surplus (2412.18140). | DOI 10.1287/moor.6.1.58 ; https://arxiv.org/abs/2412.18140 | PRIMARY | 1981 / 2024 |
| 18 | §4.4(2): "valuation decides allocation, a truthful mechanism decides payment… *Bilateral:* ask plus a Nash split of surplus (v0)" | OVERSTATED (a Nash split is not a truthful mechanism) | When both sides hold private information, bilateral trade has no mechanism that is at once efficient, IC, IR and budget-balanced (Myerson–Satterthwaite; content not re-read; 2504.05563 likewise reports only impossibility results for two-sided private values). NDAI's Nash split assumes the TEE agents see the true value ω. | DOI 10.1016/0022-0531(83)90048-0 ; https://arxiv.org/abs/2502.07924 | PRIMARY | 1983 / 2025 |
| 19 | §4.4(3): "Leakage budget (new)… I found no prior implementation of this." §2: the leakage budget is a "priced, metered, enforced quantity" | OVERSTATED as a concept; CONFIRMED that I also found no implementation | Every ingredient predates MOONSHOT: counting output bits (quantitative information flow, QIF), refusing queries after a budget (differential-privacy budgets, query auditing), quantising and rate-limiting score oracles (Kaggle; Blum & Hardt call these "poorly understood heuristics"), and paying owners for leakage (Li et al. 2013). I found no paper or product that combines a per-listing, seller-set *bit* budget on an information good's appraisal outputs with contract enforcement and per-appraisal seller compensation. | see §2.3 | PRIMARY | 2005–2021 |
| 20 | §9.3 "Genuinely new" #2: "appraisal leakage measured in bits, compensated, and enforced by the contract. I found nothing like it" | OVERSTATED (concept); CONFIRMED (no implementation) | Same as row 19. Close precedents: Li, Li, Miklau & Suciu (2013) compensate data owners "according to their privacy loss", and Köpf & Dürmuth (2009) bound side-channel leakage in bits and bucket outputs to keep it under a target. | DOI 10.1145/2448496.2448502 ; https://eprint.iacr.org/2009/089 | PRIMARY | 2009 / 2013 |
| 21 | §7(3): "Leakage-budget accounting and appraisal mechanisms are new mechanism-design IP… The first venue with a credible 'inspection costs you X bits…' will become the standard." | OVERSTATED | Claim novelty only for the combination and the implementation. "Will become the standard" is a forecast with no source. | — | — | — |
| 22 | §9.3 "Genuinely new" #1: "price set by measured *buyer-specific* marginal value and cleared by a truthful mechanism (Myerson/auction) enforced in a contract" | OVERSTATED (partial prior art) | Agarwal, Dahleh & Sarkar price training data by its prediction gain on the buyer's task using "a truthful, zero regret mechanism… based on utilizing Myerson's payment function". PrivaDE computes buyer-model-specific utility before purchase, with "smart contracts [that] enforce fair execution and payment" (MPC, not TEE). What remains new is the sealed-TEE, two-sided-context, on-chain-clearing combination. | https://arxiv.org/abs/1805.08125 (EC 2019, DOI 10.1145/3328526.3329589) ; https://arxiv.org/abs/2510.18109 | PRIMARY | 2018-05-21 / 2025-10-20 |
| 23 | §4.4(6): "a share of payment sits in escrow and settles by a proper scoring rule or a challenge" | CONFIRMED (established theory), with caveats | Under strictly proper scoring rules, reporting one's true belief uniquely maximises *expected* score. Two-stage designs already exist: a cost-revealing auction picks the forecaster, who is later paid by a strictly proper scoring rule once the outcome is observed. Binary "truth" claims ("this dataset is licensed") are verification problems, not forecasts. | DOI 10.1198/016214506000001437 ; DOI 10.1016/j.artint.2010.10.007 | PRIMARY (DOIs) / SECONDARY (content of the second, via search snippet) | 2007 / 2011 |
| 24 | Checklist: Pagnia & Gärtner (1999), fair exchange is impossible without a trusted third party. Underlies §4.4(5) atomic DvP | CONFIRMED (secondary only) | The source is Darmstadt technical report TUD-BS-1999-02 (March 1999), cited in later reference lists for that result. I found no online copy, and one citing page says a revised version is "available upon request". | e.g. https://typeset.io/pdf/modular-fair-exchange-protocols-for-electronic-commerce-2y92pc736d.pdf (citing paper) | SECONDARY (report itself UNVERIFIED) | 1999 |
| 25 | §4.4(8): "Value caps per attested key… a physical TEE break costs more than it can steal" | CONFIRMED (theory anchor exists) | NDAI models TEE security as a threshold: a secret is safe "if and only if" ω ≤ Φ(k,p,C). Note that the paper's own derivation of Φ is internally inconsistent (p^k vs (1−p)^k). | https://arxiv.org/abs/2502.07924 | PRIMARY | 2025-02-11 |
| 26 | §4.4(2): "Exclusivity is itself an option the seller can price: sell exclusive, sell k copies…" | CONFIRMED (theory supports it) | Admati & Pfleiderer (1990) compare direct sale of information to traders with indirect sale through a portfolio, and find the better method depends on how much equilibrium prices reveal. A later paper summarises the 1986 paper as showing a monopolist should sell signals "of finite precision" (deliberately degraded). | DOI 10.2307/2938355 (abstract via https://econpapers.repec.org/RePEc:ecm:emetrp:v:58:y:1990:i:4:p:901-28) ; DOI 10.1016/0022-0531(86)90052-9 ; https://leeds-faculty.colorado.edu/garcia/paper9v45.pdf (snippet) | PRIMARY / SECONDARY | 1986 / 1990 |
| 27 | Checklist question: does the `log2(#outputs)` debit compose additively under adaptive queries? | CONFIRMED (worst case, deterministic channels) | For a deterministic interactive system, min-entropy leakage equals the log of the maximum number of outputs consistent with the adversary's adaptive strategy (Mestel Thm 4). So n adaptive appraisals with \|O_i\| possible verdicts leak at most Σ log2\|O_i\|, and Thm 30 shows leakage grows either as O(log n) or Θ(n), so the linear sum can be tight. | https://arxiv.org/abs/1905.04332 (CSF 2019; HTML read) | PRIMARY | 2019-05-10 |
| 28 | Affiliations: "EPFL/CISPA" (2504.05563), "Google" (2610.20587), "Microsoft" (2510.25779), "Berkeley" (2602.06008) | UNVERIFIED | I verified authors via the arXiv API. Affiliations were not checked. | arXiv API | PRIMARY (authors only) | — |

---

## 2. New findings and prior art that matter for the mechanism

### 2.1 Classic economics of selling information

- **Bergemann, Bonatti & Smolin, "The Design and Price of Information", *AER* 108(1):1–48 (2018).** DOI 10.1257/aer.20161079. PRIMARY (Crossref abstract).
  - Abstract: "His willingness to pay for supplemental data is determined by the quality of his initial private information". Every revenue-maximising menu contains a fully informative experiment, and every experiment is a non-dispersed stochastic matrix.
  - *Why it matters:* this is the canonical anchor for "price against what the buyer already knows". Cite it instead of 2604.08606. It also suggests the appraisal outputs are themselves a designed *experiment* (a menu), not ad-hoc fields.
- **Admati & Pfleiderer, "A monopolistic market for information", *JET* 39(2):400–438 (1986)** (DOI 10.1016/0022-0531(86)90052-9), and **"Direct and Indirect Sale of Information", *Econometrica* 58(4):901–928 (1990)** (DOI 10.2307/2938355).
  - Sources: the 1990 abstract via EconPapers (SECONDARY host of the publisher abstract). The 1986 abstract was not shown on EconPapers, and its "finite precision signals" finding comes from a later paper's snippet (SECONDARY).
  - *Why it matters:* the value of alpha-type information to each holder depends on how many others trade on it. This gives theory for exclusivity and k-copy pricing, and for deliberately noisy or personalised versions of a signal.
- **Hörner & Skrzypacz, "Selling Information", *JPE* 124(6):1515–1562 (2016).** DOI 10.1086/688874. Abstract excerpts via https://econpapers.repec.org/RePEc:ucp:jpolec:doi:10.1086/688874 (SECONDARY host).
  - The agent "can prove her competence but faces a holdup problem". It is optimal to give away part of the information early and sell the rest gradually. She captures only part of the value, but "Introducing a third party allows her to extract the maximum surplus" (quoted via search summary).
  - *Why it matters:* this is theory for staged, paid appraisals and for the room acting as the third party. It also warns that the third party shifts surplus *to the seller*, which bears on buyer participation.
- **Babaioff, Kleinberg & Paes Leme, "Optimal Mechanisms for Selling Information", EC 2012.** arXiv 1204.5519; DOI 10.1145/2229012.2229024. PRIMARY.
  - A monopolist data seller faces a buyer with a correlated private signal. "Multiple rounds of partial information disclosure (interleaved by payment to the seller) are sometimes necessary to achieve optimal revenue if the buyer is allowed to abort".
  - *Why it matters:* a formal basis for multi-stage appraisal fees.
- **Bergemann & Bonatti, "Markets for Information: An Introduction", *Annual Review of Economics* 11:85–107 (2019).** DOI 10.1146/annurev-economics-080315-015439. PRIMARY (Crossref abstract).
  - Distinguishes "ex ante sales of information (the buyer acquires an information structure) and ex post sales (the buyer pays for specific realizations)".
  - *Why it matters:* the right vocabulary for SPEC. An appraisal sells an information structure about a realisation, and a purchase sells the realisation.
- **Myerson, "Optimal Auction Design", *Math. of Operations Research* 6(1):58–73 (1981).** DOI 10.1287/moor.6.1.58. PRIMARY (Crossref abstract).
  - The setting is a seller with "imperfect information about how much the buyers might be willing to pay", who designs the auction to maximise expected utility.
  - *Why it matters:* this is the correct scope for "Myerson-style reserve" (row 17).
- **Myerson & Satterthwaite, "Efficient mechanisms for bilateral trading", *JET* 29:265–281 (1983).** DOI 10.1016/0022-0531(83)90048-0. PRIMARY (DOI only; content not re-read).
  - *Why it matters:* any bilateral rule (including the v0 Nash split) trades off efficiency against truthfulness.
- **Jin & Lu, "First Price Auction is 1−1/e² Efficient", FOCS 2022.** DOI 10.1109/FOCS54457.2022.00024. PRIMARY (title and DOI).
  - *Why it matters:* this is where the 1−1/e² bound for independent values comes from. 2610.20587 extends it to near-conditional-independence.

### 2.2 Data-market mechanism design (prior art to §4.4 items 1–2)

- **Agarwal, Dahleh & Sarkar, "A Marketplace for Data: An Algorithmic Solution", EC 2019.** arXiv 1805.08125; DOI 10.1145/3328526.3329589. PRIMARY.
  - A two-sided data market priced by prediction gain on the buyer's task. It uses "a truthful, zero regret mechanism… utilizing Myerson's payment function", plus replication-robust fairness for sellers. It notes data's "usefulness… is difficult to verify a priori".
  - *Why it matters:* closest mechanism-level prior art to Marginal's "buyer-relative value + Myerson". Cite it and differentiate on sealing (TEE), two-sided context and on-chain clearing.
- **Ghosh & Roth, "Selling Privacy at Auction", EC 2011.** arXiv 1011.1375. PRIMARY.
  - Buying differentially private data reduces to multi-unit procurement auctions. Also, "no individually rational mechanism can compensate individuals for the privacy loss incurred due to their reported valuations for privacy".
  - *Why it matters:* precedent for paying for leakage. It also warns that a seller's own reports (ask, budget size, leakage price) leak information that the mechanism cannot compensate.
- **PrivaDE, Wong, Torkamani, Ciampi & Sarkar.** arXiv 2510.18109; DOI 10.1145/3779208.3785393 (AsiaCCS'26). PRIMARY.
  - An MPC protocol in which model owner and data owner jointly compute a utility score. It scores a "small, representative subset" to limit leakage, and "smart contracts enforce fair execution and payment".
  - *Why it matters:* the closest academic analogue of the appraise-then-settle loop. It has no bit accounting and no TEE.
- **Peng et al., "Reliable and Private Utility Signaling for Data Markets".** arXiv 2511.07975. PRIMARY.
  - Defines a desirable pre-trade "utility signaling mechanism" with privacy and reliability, implemented with malicious-secure MPC, hash-verified inputs and MPC KNN-Shapley.
  - *Why it matters:* formal desiderata for an appraisal "signal". It addresses input reliability, which is Marginal's seller-side honesty problem.
- **PriArTa** (arXiv 2411.00745; 2024-11-01), **FLMarket** (arXiv 2411.11713; 2024-11-18) and **SIMT** ("Data Pricing for Graph Neural Networks without Pre-purchased Inspection", AAMAS-2025, arXiv 2502.08284). PRIMARY.
  - These are pre-purchase valuation or pricing schemes that mitigate leakage by preprocessing, a security protocol, or by avoiding inspection altogether (SIMT is IC, IR and budget-feasible).
  - *Why it matters:* this is the recent "inspection leakage" literature, and none of it meters leakage in bits.
- **Bottazzi & Park (2603.19011).** See row 6.
  - *Why it matters:* LLM agents cannot verify that their environment is safe. Attestation checks must be done by contract or deterministic code (as LETHE v0 already does), and agents should never be asked to judge "is this room secure?".

### 2.3 Leakage-budget prior art (the key item)

**(a) Quantitative information flow (bits of leakage from outputs)**
- **Smith, "On the Foundations of Quantitative Information Flow", FoSSaCS 2009, LNCS 5504:288–302.** DOI 10.1007/978-3-642-00596-1_21 (PRIMARY via Crossref).
  - The PDF returned 404, so its content is known here only through secondary summaries: https://alastairreid.github.io/RelatedWork/papers/smith:fossacs:2009 (SECONDARY). It argues Shannon leakage is a poor threat bound and proposes min-entropy (one-try guessing) leakage.
  - The "log2 #feasible outputs for deterministic programs" theorem could not be quoted from the primary text this session. Use Mestel (below) as the verified citation.
- **Mestel, "Quantifying information flow in interactive systems", CSF 2019.** arXiv 1905.04332 (HTML read). PRIMARY.
  - Thm 4: min-entropy leakage of a deterministic interactive channel is the log of the maximum number of outputs consistent with the adversary's strategy ("it suffices to count the maximum number of outputs that can be seen by Bob, consistently with his choice of strategy").
  - Thm 30: over n rounds, capacity is either O(log n) or Θ(n).
  - It also quotes the "miracle" theorem (Alvim et al. 2012, Thm 5.1): "for any channel 𝒞 and any gain function g… the g-capacity is at most the min-entropy capacity".
  - *Why it matters:* this is the verified basis for the additive debit (row 27).
- **Köpf & Basin, "An information-theoretic model for adaptive side-channel attacks", CCS 2007** (DOI 10.1145/1315245.1315282). Journal version JCS 19(1):1–31 (2011), DOI 10.3233/JCS-2009-0397. PRIMARY (abstract).
  - Models adaptive adversaries and expresses "remaining uncertainty about a secret as a function of the number of interactions".
  - *Why it matters:* the canonical adaptive-query leakage model. An explicit "n·log2 r" statement was not seen in the abstract.
- **Köpf & Dürmuth, "A provably secure and efficient countermeasure against timing attacks", CSF 2009.** IACR ePrint 2009/089. PRIMARY.
  - "The amount of information about the key that an unknown-message attacker can extract from a deterministic side-channel is bounded from above by |O| log2(n+1) bits". They bucket outputs to trade leakage against cost.
  - *Why it matters:* (i) quantising outputs to cap leakage in bits is 2009 side-channel engineering. (ii) Without adaptive chosen inputs, leakage grows only logarithmically, so the linear debit is conservative for non-adaptive use.
- **Alvim, Chatzikokolakis, Palamidessi & Smith, "Measuring Information Leakage Using Generalized Gain Functions", CSF 2012:265–279.** DOI 10.1109/CSF.2012.26. PRIMARY (DOI and abstract); theorem statement via Mestel.
  - *Why it matters:* gain functions model what the adversary *values*. Min-capacity (bits) bounds only the *multiplicative* rise in any adversary's expected gain. The theory of *additive* g-leakage was developed later (Alvim et al., TCS 2019, per a search snippet from https://www.trustworthy.systems/publications/papers/Alvim_KMMPS_19.pdf; SECONDARY).
- **Mardziel, Alvim, Hicks & Clarkson, "Quantifying Information Flow for Dynamic Secrets", IEEE S&P 2014:540–555.** DOI 10.1109/SP.2014.41. PRIMARY (DOI). Content via Mestel's related-work section: "allowing an adaptive adversary can greatly increase information flow".
- **Bordenabe & Smith, "Correlated Secrets in Quantitative Information Flow", CSF 2016:93–104.** DOI 10.1109/CSF.2016.14. PRIMARY (title and DOI).
  - Search snippet (SECONDARY): "Dalenius" leakage of a correlated secret is bounded by capacity.
  - *Why it matters:* the same insight sold under several listings (or variants of one) gets a separate budget for each, which multiplies exposure.
- **Bounded-leakage cryptography: Dziembowski & Pietrzak, "Leakage-Resilient Cryptography", FOCS 2008** (DOI 10.1109/FOCS.2008.56), and **Akavia, Goldwasser & Vaikuntanathan, "Simultaneous Hardcore Bits and Cryptography against Memory Attacks", TCC 2009** (DOI 10.1007/978-3-642-00457-5_28). PRIMARY (DOIs); content not re-read.
  - *Why it matters:* "the adversary may learn up to λ bits of any function of the secret" is a standard security model, and the leakage budget is that model applied to an information good.

**(b) Differential-privacy budgets**
- **Dwork & Roth, *The Algorithmic Foundations of Differential Privacy*, FnT-TCS 9(3–4):211–487 (2014).** DOI 10.1561/0400000042. PRIMARY (DOI); content not re-read.
  - The privacy budget, basic composition (ε adds) and advanced composition (roughly √k growth).
  - *Why it matters:* the established template for a per-dataset budget that is depleted across all analysts and then refuses further queries. For dataset and eval-set listings, DP-noised numeric outputs give guarantees that compose better than worst-case bit counting.

**(c) Adaptive data analysis and leaderboards (closest precedent for eval-set listings)**
- **Dwork, Feldman, Hardt, Pitassi, Reingold & Roth.**
  - "Preserving Statistical Validity in Adaptive Data Analysis": arXiv 1411.2664, STOC 2015, DOI 10.1145/2746539.2746580.
  - "Generalization in Adaptive Data Analysis and Holdout Reuse": arXiv 1506.02629.
  - "The reusable holdout", *Science* 349:636–638 (2015), DOI 10.1126/science.aaa9375.
  - All PRIMARY. 1506.02629 states that "a simple approach based on description length can also be used to give guarantees of statistical validity in adaptive settings", unified with DP via "approximate max-information".
  - *Why it matters:* a *description-length* (bits-of-output) budget for a reused holdout is a direct conceptual precedent for debiting `log2(#outputs)`.
- **Blum & Hardt, "The Ladder: A Reliable Leaderboard for Machine Learning Competitions".** arXiv 1502.04585. PRIMARY.
  - "Existing approaches therefore often resort to poorly understood heuristics such as limiting the bit precision of answers and the rate of re-submission". The Ladder has guarantees "in a fully adaptive model" and withstands attacks.
  - *Why it matters:* MOONSHOT's leakage budget v1 (quantise to 0.1, rate-limit) is exactly what this paper calls a heuristic. For sealed eval sets, adopt a Ladder- or Thresholdout-style release rule.
- **Whitehill, "Climbing the Kaggle Leaderboard by Exploiting the Log-Loss Oracle".** arXiv 1707.01825 (2017-07-06). PRIMARY.
  - A log-loss oracle lets an attacker infer all test labels in batches, reaching rank #4 of 848 "without ever training a classifier". The paper bounds batch size by floating-point resolution.
- **Aggarwal et al., "Label Inference Attacks from Log-loss Scores", ICML 2021.** arXiv 2105.08266. PRIMARY.
  - Labels can be inferred "from the reported log-loss score of a single carefully constructed prediction vector if we allow arbitrary precision", and the attacks also work "under addition of noise… and under limited precision".
  - *Why it matters:* an unquantised score has an effectively unbounded `log2(#outputs)`. Quantisation is mandatory, but noise alone is not enough.
- **Singh et al., "The Leaderboard Illusion".** arXiv 2504.20879 (2025-04-29). PRIMARY.
  - Private testing of many variants with selective disclosure biases Chatbot Arena; for example, "27 private LLM variants tested by Meta" before Llama-4.
  - *Why it matters:* in the eval-set vertical, a buyer can run many model variants against a sealed eval. Budget per eval set across *all* runs, not per run.

**(d) Query auditing**
- **Kenthapadi, Mishra & Nissim, "Simulatable auditing", PODS 2005:118–127** (DOI 10.1145/1065167.1065183). Journal version "Denials leak information: Simulatable auditing", *JCSS* 79(8):1322–1340 (2013), DOI 10.1016/j.jcss.2013.06.004. Content from abstract snippets via search (SECONDARY).
  - Denials can leak information. A *simulatable* auditor decides whether to deny using only past queries and answers, never the data.
  - *Why it matters:* the contract's refusal rule must not depend on the good. Debiting by the size of the output space, fixed before the appraisal runs, is simulatable. Debiting by the information "actually revealed" would leak through refusals.
- **Dinur & Nissim, "Revealing information while preserving privacy", PODS 2003:202–210.** DOI 10.1145/773153.773173. PRIMARY (DOI); content not re-read.
  - *Why it matters:* the classic reconstruction attack from too many accurate aggregate answers. It is the formal model of MOONSHOT threat T3 (Sybil appraisal).

**(e) Query-based pricing, arbitrage-freeness, compensation for leakage**
- **Koutris, Upadhyaya, Balazinska, Howe & Suciu, "Query-based data pricing", PODS 2012:167–178** (DOI 10.1145/2213556.2213582). Journal version *JACM* 62(5) (2015), DOI 10.1145/2770870. PRIMARY (abstract).
  - The price function must be "arbitrage-free and discount-free". A unique such extension of the seller's explicit view prices exists, and computing it is hard for general conjunctive queries.
  - *Why it matters:* appraisal fees must not let a buyer assemble a fine-grained verdict more cheaply from several coarse ones.
- **Li, Li, Miklau & Suciu, "A Theory of Pricing Private Data", ICDT 2013:33–44 (Best Paper).** arXiv 1208.5258; DOI 10.1145/2448496.2448502. PRIMARY (ar5iv HTML read).
  - "By charging buyers for access to private data we overcome a fundamental limitation" of perturbation mechanisms. The market maker must ensure "whatever disclosure is obtained by the buyer, all contributing individuals are properly compensated", and "the users are compensated according to their privacy loss". Price π(q,v)=f²(q)/v is arbitrage-free if and only if f is a semi-norm.
  - The paper assumes a stateless market maker and does not treat Sybils.
  - *Why it matters:* this is the closest precedent to "buyers pay leakage compensation to the seller". Marginal's differences: the leakage is about an information good rather than personal data, it is measured in QIF bits rather than ε, and it is enforced by a contract.
- **Zheng, Cao & Yoshikawa, "Pricing Private Data with Personalized Differential Privacy and Partial Arbitrage Freeness".** arXiv 2105.01651. PRIMARY.
  - Data owners bound their own privacy loss, and the paper adds "privacy budget allocation techniques" across queries.
  - *Why it matters:* this is the DP analogue of a *seller-set* per-listing budget.

**(f) Commercial and adjacent (not peer-reviewed)**
- Turnkey data brokerage (https://docs.turnkey.com/solutions/verifiable-cloud/data-brokerage) and a Duality blog (https://dualitytech.com/?p=16611) describe TEE pre-purchase testing. SECONDARY, not read in full.
- No bit-metered leakage accounting turned up in any product.

**Novelty verdict on the leakage budget.** Each ingredient has prior art:
- bit-counting of outputs (Smith/Köpf/Mestel)
- a global budget that refuses further queries (DP)
- simulatable refusal (Kenthapadi et al.)
- quantisation and rate limits for score oracles (Kaggle/Ladder)
- compensation for leakage (Li et al. 2013; Ghosh & Roth)
- arbitrage-free pricing (Koutris et al.)
- bounded-leakage security models (Dziembowski–Pietrzak; Akavia et al.)

What I found nowhere is the combination: a per-listing, seller-set budget in *bits* on an *information good's appraisal outputs*, depleted across all buyers, enforced by an on-chain contract, priced per appraisal to the seller, and running in TEE appraisal rooms. That is a defensible "new combination". It is not a new concept, and SPEC should say "builds on QIF, DP budgets and query pricing", not "no prior implementation".

### 2.4 Composition of the `log2(#outputs)` debit, and its known weaknesses

**Composition (verified).** A buyer chooses its sealed context and can adapt it after each verdict, so every appraisal is a chosen-input query. For deterministic appraisals, Mestel's Thm 4 implies that n adaptive appraisals with |O_i| possible verdicts leak at most log2 Π|O_i| = Σ log2|O_i| bits. Debits therefore add, and debiting each field separately within a verdict is a conservative upper bound on the joint output. The sum can be tight: Mestel's Thm 30 shows linear growth Θ(n) is possible, and Mardziel et al. show adaptivity "can greatly increase information flow". When inputs are not attacker-chosen, Köpf & Dürmuth's bound grows only as |O|·log2(n+1). For randomised (sampled LLM) appraisals, the claim that min-capacity ≤ log2|O| still holds is from my prior knowledge and is **UNVERIFIED this session**.

**Weaknesses SPEC should state:**
1. **Bits are not value.** By the miracle theorem, k bits bound only the *multiplicative* rise (at most 2^k) in any adversary's expected gain. When the valuable content is a low-entropy fact, one bit can carry all of it. Examples: the trade direction of a signal ("long or short"), "does an exploit exist?", "is the target company X?". With a prior success of 1/2, a single 1-bit field can push the adversary's success to 1. Additive value leakage depends on the gain scale (Alvim et al. 2012; additive theory per Alvim et al. 2019). This is my illustration, derived from the cited theorem.
2. **It is a worst-case bound.** It over-debits non-adaptive use (Köpf & Dürmuth), so small budgets may starve legitimate appraisals.
3. **Chosen-context probing.** A buyer can seal a one-claim "context", which turns `novelty` into a membership test for that claim. Leakage then goes to the buyer's *choice* of claim at the full per-query rate, as in Dinur–Nissim-style reconstruction.
4. **Every observable output counts.** That includes verdict fields, the quoted price, deal/no-deal, refusals (zero bits only if the refusal rule is simulatable), timing, and any free text. A free-text field has an astronomically large output space, so the budget in effect forbids free text, which is consistent with the information-design risk in 2509.25565.
5. **Real-valued outputs leak without limit unless quantised** (Aggarwal et al.; Whitehill).
6. **Sybils and griefing.** The budget must be global per listing, treating all buyers as one colluding adversary. A global budget can be exhausted by a competitor, which denies inspection to genuine buyers, so pricing per bit and reserving budget for identity-verified buyers matter. Simply debiting `log2(#outputs)` is Sybil-proof in total leakage but not in fairness.
7. **Correlated listings.** Separate budgets for correlated goods (the same insight relisted, or variants) do not bound total exposure (Bordenabe & Smith).
8. **The seller's parameters leak.** The ask, budget size and leakage price signal value, and Ghosh & Roth show such report-induced loss cannot be compensated inside the mechanism.
9. **Choice of measure.** For dataset and eval-set listings, DP-noised outputs with Thresholdout/Ladder-style release protect individual records and items far better than raw bit counts. For memo-like single secrets, QIF bits are the more natural measure.

### 2.5 Model extraction via query access (use-rights, weights-in-vault)

- **Tramèr, Zhang, Juels, Reiter & Ristenpart, "Stealing Machine Learning Models via Prediction APIs", USENIX Security 2016.** arXiv 1609.02943. PRIMARY.
  - Extracts logistic regression, neural networks and decision trees "with near-perfect fidelity" from BigML and Amazon ML. Even "omitting confidence values from model outputs still admits potentially harmful model extraction attacks".
- **Carlini et al., "Stealing Part of a Production Language Model".** arXiv 2403.06634 (2024-03-11). PRIMARY.
  - Recovers the embedding projection layer of OpenAI's Ada and Babbage "for under $20". It confirms hidden dimensions of 1024 and 2048, recovers gpt-3.5-turbo's hidden size, and estimates under $2,000 to recover its whole projection matrix.
- **Kesarwani et al., "Model Extraction Warning in MLaaS Paradigm", ACSAC 2018.** DOI 10.1145/3274694.3274740. PRIMARY (title and DOI only).
  - A precedent for monitoring per-user extraction.
- *Why it matters:* every use-rights query against a vaulted model or dataset is a leakage event. Use-rights need the same metering as appraisals (restrict logits and logprobs, debit per query), and listings should be priced on the assumption that partial extraction will happen, as MOONSHOT §4.6 T4 already suggests.

### 2.6 Truth-contingent payment

- **Gneiting & Raftery, "Strictly Proper Scoring Rules, Prediction, and Estimation", *JASA* 102(477):359–378 (2007).** DOI 10.1198/016214506000001437. PRIMARY (DOI). Content via a Scilit abstract summary (SECONDARY): https://www.scilit.net/publications/d9b5bf35d7b36a1d5797bb86067a03b0.
  - Properness is defined in expected score, so it presumes an expected-score maximiser who cannot influence the outcome.
- **Papakonstantinou, Rogers, Gerding & Jennings, "Mechanism design for the truthful elicitation of costly probabilistic estimates in distributed information systems", *Artificial Intelligence* 175:648–672 (2011).** DOI 10.1016/j.artint.2010.10.007. PRIMARY (DOI). The ECAI 2008 version is summarised via search snippet (SECONDARY): a cost-revealing auction selects the estimator, and payment by a strictly proper scoring rule follows once the outcome is observed.
  - *Why it matters:* direct prior art for "auction now, scoring-rule tail later" in the signals vertical.
- **Lambert, Langford, Wortman, Chen et al., "Self-financed wagering mechanisms for forecasting", EC 2008** (DOI 10.1145/1386790.1386820). **Hanson, "Combinatorial Information Market Design", *Information Systems Frontiers* 5:107–119 (2003)** (DOI 10.1023/A:1022058209073). **Lambert, Pennock & Shoham, "Eliciting properties of probability distributions", EC 2008** (DOI 10.1145/1386790.1386813). PRIMARY (title and DOI); content not re-read.
  - *Why it matters:* budget-balanced multi-forecaster payouts, market scoring rules, and which statistics (means, quantiles) can be paid for truthfully. The last matters if a "forecast" field is a point estimate rather than a probability.
- **Caveat for SPEC:** claims like "this dataset is licensed" or "this wallet is a mule" are not probabilistic forecasts. They need verification plus bonds and challenges, not a scoring rule.

### 2.7 Fair exchange and atomic DvP

- **Pagnia & Gärtner (1999).** See row 24; SECONDARY only.
- **Dziembowski, Eckey & Faust, "FairSwap: How to fairly exchange digital goods", CCS 2018:967–984.** DOI 10.1145/3243734.3243857; ePrint 2018/740. PRIMARY.
  - Uses a smart contract that "takes the role of an external judge that completes the exchange in case of disagreement"; "R only pays if he receives the correct x".
- **Campanelli, Gennaro, Goldfeder & Nizzardo, "Zero-Knowledge Contingent Payments Revisited", CCS 2017:229–243.** DOI 10.1145/3133956.3134060. PRIMARY (title and DOI); content not re-read.
- *Why it matters:* the chain-plus-TEE pair is the "trusted third party" that Pagnia & Gärtner say is required. Atomic DvP is known engineering, not a contribution.

---

## 3. Novelty assessment of MOONSHOT §4.4

Key: (a) established theory · (b) known engineering · (c) genuinely new combination · (d) open research.

| §4.4 item | (a) Established theory | (b) Known engineering | (c) New combination? | (d) Open research |
|---|---|---|---|---|
| 1. Buyer-relative valuation `V_b = budget_b × f(signed components)` | Value of information is relative to the buyer's prior information (Arrow 1962; Bergemann, Bonatti & Smolin 2018; 2412.18140; prediction gain in Agarwal, Dahleh & Sarkar 2019) | Integer-bps recomputation on-chain; signed TEE outputs | Measuring value against the buyer's *sealed* private corpus, model or evals inside a TEE before purchase, with no party seeing the other. No live implementation found; PrivaDE and TIP do it with MPC or HE | **Incentive compatibility of measured value**: the buyer controls `budget_b` and what it seals, so it can sandbag or game. Calibrating `f` to money. Seller surplus extraction threatens participation (2412.18140) |
| 2. Price discovery (Nash split, sealed tenders, sealed auction, Myerson reserve) | Myerson (1981) payments and optimal auctions; the first-price PoA bounds (Jin & Lu 2022; 2610.20587); Nash bargaining (as in NDAI); bilateral impossibility (Myerson–Satterthwaite 1983) | Sealed or batched rounds (commit-reveal, batch auctions) as a fix for first-proposal bias (Magentic) | TEE-measured valuations fed into a contract-run sealed auction. The mechanism idea partly predates it (Agarwal, Dahleh & Sarkar 2019); the sealed, on-chain execution is new | A mechanism for *measured* rather than reported values. Bilateral pricing with two-sided private information. Exclusivity and k-copy pricing under value dilution (Admati & Pfleiderer). 2610.20587 is unproven for data procurement and 2504.05563 does not cover buyer bidding |
| 3. Leakage budget | QIF min-entropy leakage and output counting (Smith 2009; Köpf & Basin 2007; Mestel 2019); DP budgets and composition; description-length bounds (Dwork et al. 2015); simulatable auditing; arbitrage-free and privacy-loss pricing (Koutris et al.; Li et al. 2013); bounded-leakage cryptography | Quantised, rate-limited score oracles (Kaggle; "heuristics" per Blum & Hardt); per-dataset DP budget ledgers; output bucketing (Köpf & Dürmuth) | **Yes, as a combination:** a per-listing, seller-set bit budget on an information good's appraisals, depleted across all buyers, contract-enforced, with per-appraisal seller compensation. No implementation found | Value-weighted leakage (bits are not value; g-leakage). Adaptive chosen-context probing. Correlated listings. Griefing by budget exhaustion. Counting side outputs (price, deal/no-deal, timing). Randomised LLM outputs. Semantic leakage through paraphrase. The trade-off between appraisal usefulness and budget. How to set budgets and per-bit prices |
| 4. Conditional recall / forget certificate | Forgetting as commitment (Conditional Recall: illustrative, not general); NDAI deletes the session on no-deal; Information Bazaar (simulated) | TEE teardown, key destruction, attested signed statements, on-chain anchoring | A forget certificate as a portable settlement artefact (MOONSHOT §9.3 #3). No counter-example found in this stream | A general welfare result for forgetting. Composing it with leakage of *outputs*, since the certificate covers plaintext, not what the outputs already revealed. LLM agents cannot verify safety (2603.19011) |
| 5. Atomic delivery-versus-payment | Fair exchange needs a trusted third party (Pagnia & Gärtner 1999, SECONDARY) | Smart contract as judge (FairSwap 2018), ZK contingent payments (2017), NEAR yield/resume | No | None of significance |
| 6. Truth-contingent tails | Strictly proper scoring rules (Gneiting & Raftery 2007); auction plus ex-post scoring (Papakonstantinou et al. 2011); wagering and market scoring rules | Escrow plus oracle resolution (prediction markets) | No | Oracle design. Binary "truth" claims need verification, not scoring. Seller influence over outcomes |
| 7. Bonds and challenges with cross-vendor re-execution | Optimistic verification with a judge (FairSwap-style) | Optimistic rollups and bonded challenges (MOONSHOT cites 2512.20176, which I did not re-verify) | Partially: cross-*TEE-vendor* re-execution of AI appraisals | Determinism of LLM appraisal across vendors (MOONSHOT already flags this) |
| 8. Value caps per attested key | NDAI's threshold Φ(k,p,C) (secret safe iff ω ≤ Φ) | Exposure caps and key rotation | No | Calibrating caps to real attack costs (empirical) |

**Bottom line for SPEC.** The defensible novelty is the *system*: two-sided sealed appraisal in TEEs, plus contract-enforced clearing, a bit-metered leakage ledger, and forget certificates. No single mechanism element is new on its own. Items 3 and 4 hold real research questions, item 1 holds an under-appreciated one (incentive compatibility of measured value), and items 5–8 are known engineering.

### Concrete spec implications (my recommendations, each tied to a source above)
- **Fixed schema, fixed debit.** Define each appraisal's output schema before it runs and debit Σ log2|range(field)|, plus 1 bit for deal/no-deal and log2(#price levels) if a price is shown. Compute the debit before execution so refusals are simulatable (Kenthapadi et al.).
- **No free text** in pre-payment outputs. Quantise every numeric field (Aggarwal et al.; Whitehill).
- **One budget per listing across all buyers**, treated as a single colluding adversary. Price leakage *per bit* rather than per appraisal (Li et al. 2013), make fees arbitrage-free (Koutris et al.), and reserve part of the budget for identity-verified buyers to blunt griefing.
- **Eval-set listings** should use a Ladder or Thresholdout release rule, not raw scores (Blum & Hardt; Dwork et al.).
- **Return cached verdicts for repeated queries.** For an identical (good, context-hash) pair, return the cached verdict so repeats debit 0 extra bits. This is my design suggestion and is not sourced.
- **State that bits bound guessing advantage, not dollar value**, and let sellers mark "low-entropy, high-value" facts that must never be appraised directly (miracle theorem via Mestel).
- **Cite Agarwal, Dahleh & Sarkar (2019) and PrivaDE as prior art** for buyer-relative, truthful clearing, and cite Bergemann, Bonatti & Smolin (2018) for buyer-relative value. Drop "only fair when done against what the buyer knows" as a 2604.08606 claim.

---

## 4. Queries and fetches run (about 56 in total)

**arXiv export API batches (curl):**
1. http://export.arxiv.org/api/query?id_list=… (12 IDs; the http call returned empty, so it was retried on https).
2. A reachability check.
3. https batch of 12: 2502.07924, 2510.21904, 2604.08606, 2603.19011, 2403.14443, 2412.18140, 2504.05563, 2502.00198, 2610.20587, 2510.25779, 2602.06008, 2509.25565.
4. The same 12 for comment, journal_ref and DOI fields.
5. 1502.04585, 1411.2664, 1506.02629, 1011.1375, 2403.06634, 1609.02943, 1805.08125, 1204.5519.
6. 1208.5258, 2510.18109, 2411.00745, 2411.11713.
7. 1707.01825, 2105.08266, 1905.04332, 2504.20879.
8. 2511.07975, 2502.08284, 2105.01651.

**Crossref API (curl):**
9. Title search, 17 titles: Arrow; Bergemann–Bonatti–Smolin; both Admati & Pfleiderer papers; Hörner & Skrzypacz; Bergemann & Bonatti; Myerson; Gneiting & Raftery; Smith; Dwork & Roth; Kenthapadi et al.; Koutris et al.; reusable holdout; Köpf & Basin; Dinur & Nissim; ZKCP; FairSwap.
10. DOI lookups: 10.1257/aer.20161079, 10.1086/688874, 10.1198/016214506000001437, 10.1145/1386790.1386813, plus a Hörner title search.
11. Abstracts: Bergemann & Bonatti ARE, Myerson, Kenthapadi et al. JCSS, Koutris et al. JACM, both Admati & Pfleiderer papers, Smith, FairSwap, ZKCP, Köpf & Basin JCS.
12. Titles: Dziembowski & Pietrzak; Akavia et al.; Mardziel et al.; Alvim et al. 2012; Kesarwani et al.; Papakonstantinou et al.; Lambert et al. (wagering); Hanson.
13. Titles: Myerson–Satterthwaite; Jin & Lu; Agarwal, Dahleh & Sarkar EC; Babaioff, Kleinberg & Paes Leme EC; Bordenabe & Smith.

**WebFetch:**
14. arxiv.org/html/2510.21904 (results and assumptions)
15. arxiv.org/html/2604.08606
16. arxiv.org/html/2504.05563
17. arxiv.org/html/2610.20587
18. arxiv.org/html/2502.07924
19. arxiv.org/html/2412.18140
20. arxiv.org/html/2510.21904 (verbatim quotes)
21. arxiv.org/html/2403.14443
22. nber.org/system/files/chapters/c2144/c2144.pdf (scanned image, no text)
23. users.cs.fiu.edu/~smithg/papers/fossacs09.pdf (404)
24. rand.org/pubs/papers/P1856.html (403)
25. didattica.unibocconi.it Bergemann–Ottaviani PDF (binary; metadata only, DOI 10.1016/bs.hesind.2021.11.008)
26. en.wikipedia.org/wiki/Arrow_information_paradox
27. www.cs.fiu.edu/~smithg/papers/fossacs09.pdf (redirects to the 404 host)
28. eprint.iacr.org/2009/089
29. arxiv.org/pdf/1603.02187 (binary)
30. researchportal.ip-paris.fr (Alvim et al. 2012 abstract)
31. ar5iv.labs.arxiv.org/html/1208.5258
32. ar5iv.labs.arxiv.org/html/1905.04332
33. eprints.soton.ac.uk/265706 (403)
34. econpapers Hörner & Skrzypacz
35. econpapers Admati & Pfleiderer 1986 (no abstract)
36. econpapers Admati & Pfleiderer 1990
37. eprint.iacr.org/2018/740
38. edegan wiki Arrow page (maintenance page)

**WebSearch** (standard unless marked):
39. Pagnia Gärtner 1999 "On the impossibility of fair exchange without a trusted third party" TUD-BS-1999-02
40. Köpf Basin 2007 adaptive side-channel "n log" bound
41. Exact phrase "its value for the purchaser is not known until he has the information, but then he has in effect acquired it without cost" Arrow 1962
42. Smith "On the Foundations of Quantitative Information Flow" min-entropy deterministic "feasible outputs"
43. "An information-theoretic model for adaptive side-channel attacks" Köpf Basin pdf
44. Data marketplace pre-purchase evaluation leakage budget "inspection paradox" TEE arXiv 2024 2025
45. "A theory of pricing private data" Li Miklau Suciu compensation
46. Köpf Dürmuth countermeasure log2(n+1)
47. Alvim et al. gain functions, miracle theorem, multiplicative leakage
48. Kaggle leaderboard probing, AUC/log-loss oracle, Whitehill
49. Privacy budget marketplace, DP pricing, compensation
50. Outcome-contingent payments for selling information, proper scoring rule ex post
51. Hörner Skrzypacz "Selling Information" JPE abstract
52. Kenthapadi Mishra Nissim "simulatable auditing" denials leak
53. TEE data marketplace buyer evaluates dataset before purchase, leakage, 2025–2026
54. Admati Pfleiderer 1986 noise, personalised signals, dilution
55. **(extended)** information market inspection leakage in bits, budget per listing, seller compensated, "leakage budget" (no direct prior art found)
56. Gneiting Raftery 2007 abstract
