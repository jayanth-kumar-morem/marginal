# Market verification notes for SPEC.md (Marginal)

Research date: **2026-11-11**. Research only. These notes check the market figures in MOONSHOT §3.3, §5 and §6 and in `moonshot-notes/market.md` against the most primary source I could reach. They also record newer figures and collect inputs for a bottom-up year-5 revenue sensitivity.

**Type key.** **P** = primary (a filing, the company's own release or docs, or the publisher's own data). **E** = estimate from a market-research firm or analyst. **S** = secondary press citing someone else.

**Other tags.** **Snippet** = I saw the figure in the search-result text for that URL but did not fetch the page, so treat it as one notch weaker. **Arithmetic** = my own calculation from sourced numbers. **ASSUMPTION** = not data.

No numbers were invented. Where I could not find something, the notes say "not found". Where sources conflict, both figures are given.

Budget used: **32 web searches + 25 page fetches = 57 calls.** One fetch returned HTTP 403. The full list is in §5.

---

## 1. Verdict table

| # | Figure as used in MOONSHOT | Verdict | Value at source (with year) | URL | Type | Source date | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Financial market data & analytics spend **$49.2B** (2025, +6.5%) | **CONFIRMED** | $49.2B, +6.5% (2025). Real-time trading/data >35% of spend. Americas 50.3% / EMEA 31.5% / Asia 18.2%. | Burton-Taylor (TP ICAP) release reproduced by Mondo Visione: https://mondovisione.com/media-and-resources/news/realtime-analytics-drive-record-growth-across-the-financial-market-data-landsca-2026326 ; FOW (MOONSHOT's link): https://www.fow.com/insights/market-data-spend-hits-usd49-2bn-as-ai-volatility-and-algos-drive-growth | E (publisher's own release) | 2026-03-26 | 2024 was $44.3B (https://www.finextra.com/newsarticle/45769/global-spending-on-financial-market-data-hits-443bn). BCG Expand puts 2025 at ">$50B" using a different scope (https://waterstechnology.com/data-management/7953031/data-industry-spend-hits-50b-for-first-time-in-new-report, S, snippet). |
| 2 | Alt-data spend by investment managers **~$2.8B** (2025, +17%) | **CONFIRMED** | ~$2.8B, +17% YoY (2025). Built from 2,805 datasets on Neudata Scout (2,215 in 2024) plus a buyer survey. | https://www.neudata.co/blog/state-of-the-alternative-data-market-2026 ; release: https://www.neudata.co/press-release/ai-adoption-is-rising-but-alt-data-vendor-spend-hasn-t-neudata-report-finds | E | 2026-02-24 | Vendors adding AI features "hasn't" lifted buyer spend. 57% of firms expect budgets to rise; 15% expect growth above 15%. |
| 3 | Neudata **$23.1B by 2030** (market.md A2) | **CONFIRMED (do not use)** | ~$23.1B by 2030 "if current growth trends persist" | same Neudata blog | E | 2026-02-24 | It implies ~52.5% CAGR from $2.8B (arithmetic: (23.1/2.8)^(1/5)), which contradicts the reported +17%. |
| 4 | Neudata earlier **"$15.4B"** (2025) | **CORRECTED (superseded method)** | Old method: 2024 at least $2.5B; 2025 **range $3.3B–$15.4B**; 2030 $8.6B–$39.9B (21% CAGR 2020–30). 2024 sensitivities were $2.7B–$12.7B and $11.4B. | https://www.neudata.co/education/how-big-is-the-alternative-data-market-for-investment-managers ; old release: https://www.neudata.co/press-release/alternative-data-spending-by-investment-management-firms-could-top-15-4bn-in-2025-according-to-neudata-s-latest-report | E | Education page undated (© 2026, data to 2024). Release 2025 (not fetched). | The old method multiplied buyers per dataset by a price set at 30% of the vendor's range, then scaled up. **The new 2025 point estimate ($2.8B) is below the old 2025 floor ($3.3B).** Quote $15.4B only as a discarded upper bound. |
| 5 | Alt-data **average buyer budget $1.6M/yr "across 20 vendors"**; multi-strats "~$5M across 43 vendors" (market.md A3, dated 2025) | **CORRECTED** | "total spending averaging **$1.6m per year**" across "an average of **20 datasets**". The largest firms take "an average of 43 datasets" vs 8 for smaller-budget firms. Survey of 60 buyers and 97 providers, Jun–Jul **2024**. | https://webflow2.neudata.co/blog/the-future-of-alternative-data-report-2024 | E (survey) | 2024-09-18 | The year is 2024, not 2025, and the unit is datasets, not vendors. The **$5M multi-strat figure is not in Neudata's text**; it appears only in Hedgeweek (S): https://www.hedgeweek.com/hedge-funds-gear-up-for-a-2025-alternative-dataset-budget-boom/ . Implied spend ≈ $80k per dataset per buyer (arithmetic). Don't confuse this with Neudata's seller-side "average dataset earns $1.1m/yr (2024), ~$1.6m excluding non-revenue datasets" (education page). |
| 6 | Average dataset used by **~20 investment clients**, down from 25 | **CONFIRMED** | ~20 (2025) vs 25 (2024) | Neudata 2026 blog (row 2) | E | 2026-02-24 | Fewer buyers per dataset suggests demand is fragmenting. |
| 7 | Expert networks **>$2.5B (2024)** | **CONFIRMED** | >$2.5B, +9% (2024) | https://www.prnewswire.com/news-releases/inex-one-the-expert-network-industry-exceeds-2-5-billion-302429073.html (MOONSHOT's newswire.ca link is a syndicated copy) | E | Apr 2025 | — |
| 8 | Expert networks **~$3B (2025)** | **CONFIRMED** | "~$3Bn in 2025, growing 12% annually between 2023-25". The same post also gives 11% for 2025. | https://inex.one/blog/expert-network-market-size | E (snippet) | Feb 2026 | The post is internally inconsistent on growth. Inex One also estimates ~11,200 client firms in 2026; corporates are ~47% of client firms but ~12% of spend (https://inex.one/blog/who-uses-expert-networks ; https://nexusexpertresearch.co/blog/how-11200-firms-now-use-expert-networks/, snippet). |
| 9 | Expert networks, US **~$1.8B** (IBISWorld) | **CONFIRMED (re-dated)** | ~$1.8B, which IBISWorld labels **2026** | https://www.ibisworld.com/united-states/industry/expert-networks/4758/ | E (snippet; paywalled) | 2026 | market.md dated it 2025. Newer, low-confidence global sizings: Business Research Insights $4.86B (2026) (https://www.businessresearchinsights.com/market-reports/expert-networks-market-109731); industryresearch.biz $4.03B (2025) / $4.65B (2026) (https://www.industryresearch.biz/market-reports/expert-networks-market-100456). Both methods are opaque; prefer Inex One. |
| 10 | ESOMAR insights industry **$153B (2024)**; MR services **$56B** | **STALE** | **GMR 2026: 2025 ≈ US$165B (+6.4%)**, with 2024 restated to ≈ US$154B. The 2025 sector split (including MR services) was **not found**. The 2024 split from GMR 2025 was software $62B, MR $56B, reporting $35B. | https://dataandinsights.com.au/global-market-research-report-2026/ (ADIA member summary of ESOMAR GMR 2026); 2024: https://researchworld.com/articles/inside-the-153bn-insights-industry ; ESOMAR listing: https://esomar.org/reports-and-publications | E (2025 figure via S summary) | ADIA page undated (~Oct 2026) | Use "≈$165B (2025)". Keep $56B for MR services but label it 2024. |
| 11 | Mercor **>$2B annualised gross run-rate (Jun 2026)** | **CONFIRMED** | "over $2 billion in gross annualized revenue in June 2026", "double its pace at the start of the year" | https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/ | S (citing The Information) | 2026-07-06 | **Conflict:** ARR Club reports a "$1.5B+ run-rate" with 35–40% gross margins (2026-06-04, https://www.arr.club/signal/mercor-arr-hit-1-5b, S). **Newer:** Mercor raised a $750M Series D at a $20B valuation on 2026-11-10 (P: https://www.mercor.com/blog/series-d/), but the post discloses no revenue. Unverified claim: run-rate "expected to reach $2.8B" by end-2026 (BigGo, S: https://finance.biggo.com/news/865c23cb-3e0d-4c21-aa0d-6bf2a7fc8d1a). |
| 12 | Mercor **$614M gross H1-2026** | **CONFIRMED (fix URL)** | ~$614M gross H1-2026; ~90–91% from foundation-model companies | https://aiweekly.co/alerts/mercor-books-614m-in-h1-2026-leaning-on-openai-anthropic ; https://cryptobriefing.com/mercor-614m-revenue-ai-infrastructure/ | S (citing The Information; snippet) | 2026 | **The figure is not in the Dealroom article MOONSHOT cites for it.** Cite aiweekly instead. |
| 13 | Mercor experts get **60–70%** of gross; Mercor keeps **~30–40%** | **CONFIRMED (derived)** | "pays out 60% to 70% of its topline revenue to contractors". Dealroom's own net estimate is $600–800M. | Dealroom (row 11) | S | 2026-07-06 | The 30–40% retained share is arithmetic. Mercor is "profitable on a free cash flow basis". Network size: ">30,000 weekly active contractors" (Dealroom) vs ">five million experts in our network" (Mercor blog). These measure different things. |
| 14 | Mercor went from **~$1B to >$2B in ~4 months** | **CONFIRMED** | as above | Dealroom; aiweekly | S | 2026 | — |
| 15 | Scale AI **~$1B (2025, company-stated)** | **CONFIRMED (better source)** | "Scale tells Forbes it tallied **just shy of $1 billion** in revenue last year" (2025), up from $870M (2024). It "expects to top $1 billion in revenue this year" (2026). | Forbes (Richard Nieva) via https://www.forbes.com.au/?p=189230 | S (company-stated) | 2026-05-19 | Replace the Nov-2025 newsio link with this one. **Conflict:** Bloomberg reported in Apr 2025 that Scale expected ~$2B for 2025 (https://www.bloomberg.com/news/articles/2025-04-02/scale-ai-expects-to-more-than-double-sales-to-2-billion-in-2025), and Sacra estimates $2B. Forbes also says Meta's commitment "would represent nearly half of Scale's annual revenue". |
| 16 | Surge AI revenue **>$1B (2024)** | **CONFIRMED** (not re-fetched) | >$1B (2024) | Reuters via TradingView: https://www.tradingview.com/news/reuters.com%2C2025%3Anewsml_L6N3SX0O9%3A0-scale-ai-s-bigger-rival-surge-ai-seeks-up-to-1-billion-capital-raise-sources-say/ | S | Jul 2025 | **2025 revenue: not found** from any primary or Reuters text. Aggregators list ~$1.4B annualised (Aug 2025) with an unverified Reuters attribution (https://clinkbill.com/arr-leaderboard/surge ; https://getlatka.com/companies/surgehq.ai). |
| 17 | Surge **"pay only if the metric improves"** programme (MOONSHOT: secondary, Sacra) | **CONFIRMED; upgrade to P** | "**Labs in our Trusted Program can train on the full dataset, evaluate the resulting model, and pay only when it moves the metrics that matter.**" Headline: "Train first. Pay if it works." Claimed lifts include GLM-4.7 SWE-Bench Pro 37.2% → 44.3%. | https://surgehq.ai/ots | P (vendor page) | Undated (© 2026; Sacra dates it 2026-09-10) | The Sacra URL in MOONSHOT is an **AI-generated chat answer** (https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/), so drop it. **Key nuance for the spec:** the lab receives the *full dataset* and *self-measures* before paying. This is trust-based pay-for-lift, the exact inspection problem a TEE appraisal removes. No pricing terms are published, and the page mislabels some model/benchmark cards. |
| 18 | AI training dataset market **~$3.2B (2025) → $16.3B (2033)** | **CONFIRMED (forecast) / UNVERIFIED (2025 base)** | **$16.32B by 2033**; CAGR **22.6% (2026–33)**; base year 2025; image/video 41.9%; North America 35.1% | https://grandviewresearch.com/press-release/global-ai-training-dataset-market | E | Mar 2026 | The fetched text does not state the 2025 value. $3.2B is consistent with the CAGR (arithmetic: 16.32/1.226^7 ≈ $3.9B in 2026, so ≈ $3.2B in 2025). An older Grand View edition gave $8.60B by 2030 at 21.9% CAGR (snippet). |
| 19 | MarketsandMarkets alternative **$2.68B (2024) → $11.16B (2030)** (market.md B9) | **CORRECTED** | **$2.82B (2024) → $9.58B (2029)**, 27.7% CAGR | https://www.globenewswire.com/de/news-release/2025/08/12/3131847/0/en/AI-Training-Dataset-Market-Surges-to-9-58-billion-by-2029-Dominated-by-Scale-AI-US-Appen-Australia-AWS-US.html | E | 2025-08-12 | I could not locate the $2.68B/$11.16B pair; it may come from another edition. |
| 20 | Reddit "other revenue" **$140.0M (FY2025)**, up from $15.2M (2023) | **CONFIRMED (P)** | FY2025: "Other revenue increased **22%** year-over-year to **$140 million**". Q4-2025: $36M (+8%). FY total revenue $2.2B (+69%); ad revenue $2.1B (+74%). | 8-K exhibit on EDGAR: https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm ; 10-K: https://www.sec.gov/Archives/edgar/data/1713445/000171344526000022/rddt-20251231.htm | P | 8-K 2026-02-05; FY2025 10-K | **10-K text (Item 7):** "We also generate revenue from content licensing and products sold directly to users". Premium/Gold revenue is "not material"; other revenue "increased as a result of content licensing agreements executed in 2024 and 2025". I could not extract the numeric $140.0M line from the parsed 10-K text (3 fetches; the disaggregation table did not parse), so the number is cited from the 8-K. A 2024 figure of $114.7M is consistent with +22% (arithmetic). The $15.2M for 2023 was not re-checked. |
| 21 | Reddit latest 2026 quarter (market.md: Q3-2026 $48.0M, +35%, via sec-api secondary) | **CONFIRMED; now P** | **Q3-2026 other revenue $48M, +35% YoY**; total revenue $895M (+53%) | https://www.sec.gov/Archives/edgar/data/0001713445/000171344526000114/earningspressreleaseq326.htm | P | 2026-10-29 | Annualised ≈ $192M (arithmetic). CNBC: Reddit remains "in negotiations" with Google over the data-licensing renewal (https://www.cnbc.com/2026/10/29/reddit-rddt-q3-2026.html, S). |
| 22 | News Corp–OpenAI **>$250M over 5 years** | **CONFIRMED (S only)** | WSJ, citing people familiar: "could be worth more than $250 million over five years", including cash and credits. The companies did not disclose terms. | https://malaysia.news.yahoo.com/news-corp-inks-openai-licensing-211417483.html ; https://www.bnnbloomberg.ca/openai-inks-deal-with-wall-street-journal-publisher-news-corp-1.2076258 | S | 2024-05-22 | ≈ $50M/yr (arithmetic). |
| 23 | Bartz v. Anthropic **$1.5B, ~$3,000/work; final approval 2026-07-20** (MOONSHOT: Bloomberg Law, typed "P (court)") | **CONFIRMED; type label CORRECTED** | Final approval and final judgment on **2026-07-20**, granted by **Judge Araceli Martínez-Olguín** (N.D. Cal.), not Alsup. Alsup granted preliminary approval on 2025-09-25 and took inactive status on 2025-12-31. "approximately $3,000 per-work award". Fees ≈ $101.56M (6.8% of the fund), with 10% held back pending a post-distribution accounting. | https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/ ; https://www.jurist.org/news/2026/07/judge-approves-record-1-5-billion-settlement-involving-anthropic/ | S (court order not fetched) | 2026-07-21 | Bloomberg Law is press, so the "P (court)" label is wrong. Two single-source, **unverified** claims: first payments expected on or before 2026-11-15, and appeals filed (https://ailawsuittracker.com/settlements/bartz-v-anthropic/). |
| 24 | Enterprise GenAI spend **$37B (2025)**; foundation-model APIs **$12.5B** | **STALE** | Menlo's new **"2026: The State of Enterprise AI"** uses a new taxonomy: "Enterprise AI deployment spend scaled to **$177B by September 2026**, up from **$33B** last year" (2025 restated to $33B). Infrastructure $99.5B / applications $77.3B. **Development spend $102.5B**, including training compute $87.2B and **training data and services $15.3B** ("inputs for training models, including expert data and evaluations"). **No API dollar total.** | https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/ (old edition: https://menlovc.com/perspective/2025-the-state-of-generative-AI-in-the-enterprise/) | E (VC survey + model) | 2026-11-03 | The old $37B/$12.5B were verified by fetch earlier today (market.md D1) but are not repeated in the new edition. Menlo says Mercor-type labelling vendors were reclassified from deployment to development. The excerpt doesn't say whether $177B is annualised or cumulative, so quote it verbatim. |
| 25 | Anthropic **40%** / OpenAI **27%** of enterprise LLM usage (market.md D1) | **STALE** | Anthropic **55%**, OpenAI **31%**, Google **9%** (down from 21%) of enterprise LLM API spend; Anthropic + OpenAI = 86% | Menlo 2026 (row 24) | E | 2026-11-03 | — |
| 26 | AWS Data Exchange **3% public; private 1.5–3%** | **CONFIRMED (with tiers)** | ADX public offers **3%**; SaaS public 3%; server products (AMI/container/ML) **20%**. Private offers by total contract value: **<$1M 3%, $1M–<$10M 2%, ≥$10M 1.5%, all renewals 1.5%**. Channel-partner private offers +0.5pp; South Korea +1pp (from 2025-04-01). Fee is charged on pre-tax TCV. | https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html | P | Effective 2024-01-05 (page read 2026-11-11) | — |
| 27 | OpenRouter **~5.5%** (Galaxy) | **CONFIRMED; upgrade to P** | "OpenRouter's fee is charged when you buy credits, **5.5% on Standard and 8% on Business**, never on individual requests". BYOK: the first $25k/month of list-price inference is free, then **5%** of list price. Enterprise fee discounts available. | https://openrouter.ai/pricing ; Galaxy: https://www.galaxy.com/insights/perspectives/inference-market-and-micro-structure | P / E | Page read 2026-11-11; Galaxy 2026-08-11 (Vikram Singh) | Galaxy gives no actual OpenRouter GMV, only an illustration ($1B GPV → $55M) and 125× token growth since Jan 2025. |
| 28 | Deloitte **~$4.7B AI insurance premiums by 2032** | **CONFIRMED** | "around US$4.7 billion" annual global premiums by 2032, "around 80%" CAGR. Modelled on the cyber-insurance penetration curve. | https://www.deloitte.com/us/en/insights/industry/financial-services/risk-insurance-for-ai.html | E | 2024-05-29 | Authors: Suhrada, Schmidt, Jain. |
| 29 | Chainalysis **>$3.4B stolen (2025)** | **CONFIRMED** (not re-fetched) | >$3.4B (Jan to early Dec 2025) | https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/ | P | 2025-12-18 | Verified by fetch in market.md earlier today; not re-fetched in this pass. |
| 30 | HackerOne **$81M** bounties (report Oct 2025) | **STALE** | 2025 report: $81M. **2026 report (10th ed.): $89.1M** in bounty payouts, Jul 2025–Jun 2026, across 92,194 valid reports. | 2026: https://www.hackerone.com/report/hacker-powered-security ; 2025: https://www.hackerone.com/press-release/hackerone-report-finds-210-spike-ai-vulnerability-reports-amid-rise-ai-autonomy | P (2026 figure from snippet) | 2025-10-01; 2026 edition ~autumn 2026 | $89.1M / $81M = +10% (arithmetic). One secondary claims +18%, which does not reconcile. |
| 31 | Immunefi cumulative payouts (market.md: >$112M Feb 2025; $116M+; homepage "$140M+") | **STALE / partly UNVERIFIED** | **>$134M cumulative by end-Mar 2026**. Q1-2026 payouts were $7.87M (1,104 reports) or $7.3M (1,268 reports); sources conflict. One $3M payout was 38% of Q1. Critical-only awards to date: $107.3M. | https://www.kucoin.com/blog/en-immunefi-ecosystem-2026-q1-update (repost of Immunefi update); https://immunefi.com/blog/research/nearly-every-long-running-bug-bounty-program-on-immunefi-has-found-a-critical-bug/ | S / P (snippet) | ~Apr 2026 | The "$140M+" homepage claim was not re-checked and conflicts with $134M unless it was reached after March. |
| 32 | "Not found: GMV for Snowflake Marketplace or AWS Data Exchange" | **CONFIRMED (still not found)**, plus: marketplace fees not public | Snowflake docs list usage-based, subscription and installment plans. "After receiving payment from consumers, Stripe pays providers"; Snowflake pays providers for capacity-commitment purchases. **No fee or commission stated.** Databricks Marketplace fee: **not found** (2 searches; API docs only). | https://docs.snowflake.com/en/collaboration/provider-listings-pricing-model | P | Read 2026-11-11 | — |
| 33 | "Not found: GLG/AlphaSights revenue after 2019" | **CONFIRMED (still not found)** | Unofficial GLG pricing: clients pay ~$1,000+/hr (Harvard D3 case). Clients "often pay $1,300 or more for a one-hour call, with as little as $300 passed to the expert"; GLG's "reported 72% gross margin". | https://d3.harvard.edu/platform-digit/?p=2094 ; https://spearswms.com/wealth/expert-networks | S (snippet) | Undated | Implied network retention ≈ 70–77% (arithmetic on S figures). No official GLG disclosure found. |
| 34 | §5.2 "AI expert/human data ~$4B" (Mercor $2B + Surge $1B + Scale $1B) | **STALE (a better aggregate exists)** | Menlo: "training data and services" **$15.3B** (2026) | Menlo 2026 (row 24) | E | 2026-11-03 | This includes Mercor-type vendors, so use it *instead of* the vendor sum, not in addition. See §2.6. |

Outside this checklist and not re-checked: NEAR Intents volume, M&A, VDR, zero-day prices, IP Commission.

---

## 2. New figures that strengthen or weaken the market case

### 2.1 Strengthen

- **Pay-for-lift is already sold to labs, but on trust.** Surge's Trusted Program: "train on the full dataset, evaluate the resulting model, and pay only when it moves the metrics that matter" (P, https://surgehq.ai/ots). The buyer gets the goods first and grades itself. Marginal's pitch is the same contract without the handover.
- **Model builders' data budget is now sized.** Menlo, Nov 2026 (E, https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/):
  - "training data and services" is **$15.3B** within $102.5B of development spend.
  - Post-training adoption rose from **6% → 10%** of AI builders.
  - **91%** of builders that post-train use outside partners, and **41%** use expert-data and evaluation platforms.
- **Expert-data demand is spreading beyond labs.** Mercor raised a $750M Series D at a $20B valuation on 2026-11-10 (P, https://www.mercor.com/blog/series-d/): "Every company now needs what we built for the frontier AI labs". This is both a demand signal and a competitor or channel.
- **Licensing revenue is still growing.** Reddit Q3-2026 other revenue was **$48M, +35% YoY** (P, https://www.sec.gov/Archives/edgar/data/0001713445/000171344526000114/earningspressreleaseq326.htm).
- **The disclosure market is growing.** HackerOne paid **$89.1M** in bounties, Jul 2025–Jun 2026, up ~10% (P, snippet, https://www.hackerone.com/report/hacker-powered-security).
- **The insights industry grew 6.4%** to ≈ **US$165B** in 2025 (E via S, https://dataandinsights.com.au/global-market-research-report-2026/).
- **Expert networks are growing about 12% a year** to ~$3B (2025) across ~11,200 client firms (E, https://inex.one/blog/expert-network-market-size).
- **There is now a court-approved price anchor per work.** Bartz v. Anthropic pays ~$3,000 per work (S, https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/). This raises the cost of unprovenanced training data. It is a settlement, not a market price.
- **A neutral venue has value.** Scale's 2025 revenue (~$1B, Forbes) was about half the ~$2B Bloomberg reported it expected before Meta's 49% stake. Labs reportedly pulled away after the stake (market.md B5, S: https://sacra.com/research/scale-ai). A buyer-neutral exchange avoids this conflict.

### 2.2 Weaken

- **Alt data is a ~$3B niche, not $15B.** Neudata's new $2.8B is below its old method's 2025 floor of $3.3B. AI adoption "hasn't" lifted vendor spend, and clients per dataset fell from 25 to 20 (E, Neudata 2026).
- **AI-data demand is a handful of buyers.** About 90–91% of Mercor's H1-2026 gross came from foundation-model companies (S, aiweekly/cryptobriefing). Few buyers means strong buyer power, lumpy revenue and key-account risk.
- **Licensing contracts are few and renewal-dependent.** Reddit is "in negotiations" with Google over its renewal (S, CNBC).
- **Benchmark take rates for data marketplaces are low.** AWS charges 1.5–3% on data/private offers (P). Snowflake and Databricks fees are unpublished.
- **Generic confidential-data marketplaces show weak demand.** See §2.4 (Ocean, iExec).

### 2.3 Buyers struggle to evaluate data before buying (checklist 14)

- **Academic framing.** Azcoitia & Laoutaris, *Try Before You Buy* (arXiv 2012.08874; DE '22, ACM): in most data marketplaces, "data sellers are invited to indicate a price, together with a description of their datasets". Whether the price is worth paying "can only be done after having used the data with their AI/ML algorithms" (P, https://arxiv.org/abs/2012.08874).
- **Trial capacity.** A 2018 BattleFin/AlternativeData.org survey of 69 buyers found most expected to test **10 or fewer datasets** in 2019 (S, snippet, A-Team: https://a-teaminsight.com/?p=32157; URL mapping from search summary). This is old.
- **Sales cycles.** In 2019, sales cycles ran **~7 months**, and buyers lacked data-testing resources (S, snippet, https://a-teaminsight.com/blog/alternative-data-budgets-rise-in-2019-but-providers-and-buyers-are-not-in-step).
- **Time to signal.** A well-resourced team once needed **~6 months** to go from a new data source to an investable signal (S, snippet, https://a-teaminsight.com/blog/alt-datas-new-competitive-edge-from-discovery-to-synthesis/).
- **Trial cost.** A vendor blog says that for large funds the direct and opportunity cost of a trial "can be close to the price of the data itself". Its example is a **3-month trial** that ended "inconclusive" (S, vendor, low confidence, https://www.monda.ai/blog/selling-data-to-hedge-funds-why-alternative-data-trials-fail-and-how-to-fix-them).
- **Recent buy-side survey.** Coalition Greenwich's 2025 study surveyed 56 buy-side firms (Sep–Oct 2025). About 60% had increased their alt-data use over two years (E, snippet, https://www.greenwich.com/node/158341 ; https://coalitiongreenwichuat.crisil.com/press-release/ai-fuels-buy-side-spending-boom-alternative-data). No trial statistics were seen.
- **Share of trials that convert to purchase: not found** in any Neudata, Eagle Alpha, BattleFin, Exabel or Greenwich source reachable this session.

### 2.4 Demand history: Ocean, iExec (checklist 13)

- **Ocean Market deprecation: no announcement found.** The terms page is still live (https://market.oceanprotocol.com/terms).
  - A 2026 Coin Bureau review reportedly counted **32 assets and 14 orders** in the Ocean Market interface (S, snippet; page returned 403, **unverified**: https://coinbureau.com/review/ocean-protocol).
  - Ocean left the ASI Alliance on **2025-10-09** (S, https://finance.yahoo.com/news/ocean-protocol-exits-asi-alliance-134338791.html).
  - Ocean has published **no compute-to-data volume statistics** (not found). One social post claims "3,000+ compute jobs" on the newer Ocean Network GPU service (S, low confidence).
- **iExec: no dataset-sales or data-marketplace revenue figures found.**
  - Its **2026 Privacy Roadmap** centres on confidential DeFi and RWAs (P, https://www.iex.ec/news/2026-privacy-roadmap).
  - A 2026 analysis reports only "hundreds of weekly active users" (S, unverified, https://yellow.com/asset/rlc).
- **Post-mortem: no dedicated analyst post-mortem found.** The academic evidence above (arXiv 2012.08874) is the best available explanation: buyers cannot value data without using it, and sellers won't let them use it before payment.

### 2.5 AI labs' total spend on data (checklist 15)

- **Best credible figure:** Menlo's **$15.3B "training data and services"** (2026, E, https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/). Its time basis ("by September 2026") is not stated explicitly.
- **"~$1B per frontier lab per year on human data": UNVERIFIED.** The claim circulates on recruiting and aggregator blogs (for example https://www.herohunt.ai/blog/hiring-ai-training-talent-labs-guide-2026/ and https://aitraining.jobs/research/what-ai-labs-pay-for-human-data), attributed to TIME/micro1 and Labelbox's CEO. No primary was located.
- **Anthropic RL environments.** The Information reported that Anthropic discussed spending >$1B on RL environments over a year (S, snippet; primary not fetched).
- **Epoch AI estimate of lab data spend: not found.**
- **Vendor proxies (S):**
  - Mercor: $2B gross run-rate.
  - Surge: >$1B (2024).
  - Scale: ~$1B (2025).
  - Handshake: ~$1B gross annualised AI-training revenue, ~$300M net (S, snippet, unverified).

### 2.6 Effect on MOONSHOT's TAM/SAM (arithmetic only; not a new estimate)

- **SAM.** Replace the AI-data lines (expert data ~$4B + dataset licensing ~$3.2B = $7.2B) with Menlo's $15.3B. SAM then becomes 2.8 + 3.0 + 15.3 + 0.15 ≈ **$21.3B**, up from $13.15B. Caveats: Menlo's scope may include non-tradeable or in-house services, and its period basis is unclear.
- **TAM.** The ESOMAR MR-services line ($56B) stays at its 2024 value until the 2025 split is published.

---

## 3. Inputs for a bottom-up year-5 revenue sensitivity

### 3.1 Sourced inputs

| # | Input | Value | Source | Type |
|---|---|---|---|---|
| I1 | Alt-data spend per buyer | **$1.6M/yr** across ~20 datasets (2024), so ≈ $80k per dataset per buyer (arithmetic) | https://webflow2.neudata.co/blog/the-future-of-alternative-data-report-2024 | E (survey, n=60 buyers) |
| I2 | Dataset count, large vs small buyers | 43 vs 8 datasets | same | E |
| I3 | Alt-data market and growth | $2.8B (2025), +17%; 57% of firms expect budget increases | https://www.neudata.co/blog/state-of-the-alternative-data-market-2026 | E |
| I4 | Buyers per dataset; revenue per dataset | ~20 clients (2025); $1.1M/yr average (2024), ~$1.6M excluding non-revenue datasets | Neudata 2026 blog; https://www.neudata.co/education/how-big-is-the-alternative-data-market-for-investment-managers | E |
| I5 | Implied number of alt-data buyer-equivalents | ≈ 1,750 ($2.8B / $1.6M). **Arithmetic mixing a 2025 total with a 2024 average; ASSUMPTION-grade.** | derived from I1, I3 | — |
| I6 | Expert networks | ~$3B (2025), ~12%/yr; ~11,200 client firms (2026) | https://inex.one/blog/expert-network-market-size | E |
| I7 | Expert call price and split | ~$1,000–1,300 per hour/call to the client; ~$300 to the expert; GLG "72% gross margin" | https://d3.harvard.edu/platform-digit/?p=2094 ; https://spearswms.com/wealth/expert-networks | S |
| I8 | Model-builder data spend | $15.3B "training data and services" (2026) | https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/ | E |
| I9 | Post-training buyers | 10% of AI builders post-train; 91% of them use outside partners; 41% use expert-data/eval platforms | same | E |
| I10 | Largest human-data vendor | Mercor: $2B gross run-rate (Jun 2026); $614M H1-2026; 60–70% paid to experts; ~90–91% of gross from labs | Dealroom (row 11); aiweekly (row 12) | S |
| I11 | Other vendors | Scale ~$1B (2025); Surge >$1B (2024) | Forbes (row 15); Reuters (row 16) | S |
| I12 | Large licensing deal sizes | News Corp–OpenAI >$250M/5 yrs (≈ $50M/yr, arithmetic). Reddit $140M (FY2025) from "content licensing". Press attributes it to two partners, Google ~$60M and OpenAI ~$70M/yr (market.md B1, S, unverified). | rows 20, 22 | S / P |
| I13 | Per-work price anchor (books) | ~$3,000 per work (settlement) | row 23 | S |
| I14 | Bug-bounty pool | HackerOne $89.1M/yr (Jul-25 to Jun-26); Immunefi $7.3–7.9M in Q1-2026 | rows 30–31 | P / S |
| I15 | Take rate: data marketplace | AWS ADX public 3%; private 3% / 2% / 1.5% by TCV (<$1M / $1–10M / ≥$10M); renewals 1.5% | https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html | P |
| I16 | Take rate: AI routing | OpenRouter 5.5% (Standard) / 8% (Business); BYOK 5% above $25k/mo | https://openrouter.ai/pricing | P |
| I17 | Take rate: labour marketplace | Upwork **18.7%** (FY2025; GSV ~$4.0B); Q4-2025 cited as 19% or 19.4% (sources conflict) | https://www.panabee.com/news/upwork-earnings-2025-annual (primary shareholder letter not fetched) | S |
| I18 | Take rate: labour marketplace | Fiverr **27.7%** (FY2025, up from 27.6%) | https://www.fiverr.com/news/fiverr-q4-earnings-2025 | P (snippet) |
| I19 | Take rate: expert data | Mercor retains ~30–40% of gross (derived) | row 13 | S |
| I20 | Take rate: expert networks | GLG retains ~70–77% (implied) | row 33 | S |
| I21 | Pay-for-lift precedent | Surge Trusted Program | https://surgehq.ai/ots | P |

### 3.2 Assumptions (labelled) and an illustrative frame

Every cell marked **A** is an ASSUMPTION. Other cells come from §3.1. GMV is shown before revenue; amounts are $ per year in year 5.

| Segment | Drivers | Low | Base | High |
|---|---|---|---|---|
| Funds / alt data | buyers on Marginal **(A)** × $1.6M budget (I1) × share routed **(A)** × take **(A)** | 20 × 5% × 3% → GMV $1.6M, **rev $0.05M** | 60 × 10% × 6% → GMV $9.6M, **rev $0.58M** | 150 × 20% × 10% → GMV $48M, **rev $4.8M** |
| AI labs & model builders | buyers **(A)** × spend cleared per buyer **(A)** × take **(A)** (benchmarks I15–I16) | 3 × $5M × 3% → GMV $15M, **rev $0.45M** | 8 × $20M × 6% → GMV $160M, **rev $9.6M** | 15 × $60M × 10% → GMV $900M, **rev $90M** |
| Expert answers | answers/yr **(A)** × ~$1,000 (I7) × take **(A)** (vs I7, I17–I20) | 2,000 × 10% → GMV $2M, **rev $0.2M** | 10,000 × 15% → GMV $10M, **rev $1.5M** | 50,000 × 25% → GMV $50M, **rev $12.5M** |
| Exploit disclosure | share of ~$120M/yr pool **(A**: HackerOne $89.1M + Immunefi Q1-26 × 4 ≈ $30M; annualising one quarter is itself an assumption) × 10% take **(A)** | 0.5% → GMV $0.6M, **rev $0.06M** | 2% → GMV $2.4M, **rev $0.24M** | 5% → GMV $6M, **rev $0.6M** |
| Private rooms (SaaS) | rooms **(A)** × $250k/yr **(A**, inside MOONSHOT's $100k–$1M range, which is Jay's own unverified data) | 2 → **$0.5M** | 10 → **$2.5M** | 30 → **$7.5M** |
| **Total** | | GMV ≈ $19M, **rev ≈ $1.3M** | GMV ≈ $182M, **rev ≈ $14.4M** | GMV ≈ $1.0B, **rev ≈ $115M** |

How to read it (arithmetic):

- The AI-lab line is **~67% of base revenue and ~78% of high**. Year-5 revenue therefore depends mainly on the number of lab or model-builder buyers × spend cleared per buyer × take rate.
- The funds line stays small even in the high case, which matches MOONSHOT's "wedge, not the business".
- Base AI-lab GMV ($160M) is ≈ 1.0% of Menlo's $15.3B; high ($900M) is ≈ 5.9%.
- MOONSHOT's SOM range ($7M–$59M) brackets this base case ($14.4M) and sits well below the high case ($115M).
- Appraisal fees are excluded. MOONSHOT treats them as cost pass-through.

---

## 4. Not found (said plainly)

- Surge AI 2025 revenue from a primary or Reuters text.
- Snowflake Marketplace and Databricks Marketplace take rates or fees (not public); GMV for Snowflake Marketplace or AWS Data Exchange.
- The 2025 ESOMAR sector split, including MR services.
- Grand View's 2025 base value in its press-release text.
- The MarketsandMarkets $2.68B / $11.16B pair.
- Ocean Market's official usage, volume or deprecation notice; compute-to-data volumes; iExec dataset sales.
- The share of alt-data trials that convert to purchase; any recent survey on trial time or cost from Neudata, Eagle Alpha, BattleFin, Exabel or Greenwich.
- A credible total for AI-lab data spend other than Menlo's $15.3B; any Epoch AI figure.
- Official GLG pricing or revenue.
- The Bartz court order itself (not fetched; date confirmed via Authors Guild and JURIST).
- The numeric "Other revenue" line in the parsed Reddit 10-K text (taken from the 8-K instead).

---

## 5. Queries and fetches run

### Web searches (32)

| # | Query | Mode |
|---|---|---|
| 1 | Burton-Taylor 2025 financial market data analytics spend $49.2 billion | standard |
| 2 | Neudata 2026 report alternative data vendor spend 2025 $2.8 billion average budget | standard |
| 3 | expert network industry market size 2026 report Inex One 2025 revenue | extended |
| 4 | ESOMAR Global Market Research 2026 report insights industry 2025 turnover billion | extended |
| 5 | Mercor revenue 2026 run rate gross $614 million first half experts paid | extended |
| 6 | Surge AI 2025 revenue Edwin Chen | extended |
| 7 | Mercor Series D $750 million $20 billion valuation November 2026 revenue | extended |
| 8 | Surge AI labs pay only if model metric improves performance-based pricing | standard |
| 9 | Scale AI 2025 revenue "just shy of $1 billion" CFO Forbes | standard |
| 10 | Snowflake Marketplace paid listings fee provider revenue share percentage Snowflake charges | standard |
| 11 | Databricks Marketplace paid listings fees commercial transactions revenue share providers | standard |
| 12 | Upwork 2025 annual results marketplace take rate gross services volume | standard |
| 13 | Fiverr 2025 full year results marketplace take rate | standard |
| 14 | Databricks Marketplace paid listing "Databricks does not" process payments provider consumer contract offline | standard |
| 15 | Inex One 2026 expert network industry report market size 2025 growth | extended |
| 16 | ESOMAR "Global Market Research 2026" market research sector 2025 US$ billion research services growth | extended |
| 17 | MarketsandMarkets AI training dataset market size 2025 2030 billion | standard |
| 18 | Neudata average alternative data budget per fund vendors multi-strategy "$1.6m" OR "1.6 million" datasets per buyer | standard |
| 19 | Reddit 10-K fiscal 2025 "other revenue" data licensing $140.0 million (sec.gov only) | standard |
| 20 | Reddit third quarter 2026 results other revenue data licensing million | extended |
| 21 | Bartz v. Anthropic settlement final approval Judge Alsup order date $1.5 billion | extended |
| 22 | News Corp OpenAI content deal "more than $250 million" over five years Wall Street Journal | standard |
| 23 | GLG expert network cost per call hourly rate clients pay $1,000 expert receives | standard |
| 24 | Ocean Market deprecated sunset Ocean Protocol marketplace shut down | extended |
| 25 | Ocean Protocol compute-to-data jobs volume statistics Ocean Market datatoken sales revenue | standard |
| 26 | iExec data marketplace traction usage revenue datasets sold 2025 2026 | standard |
| 27 | why data marketplaces fail study evaluation problem buyers cannot assess data value before purchase Arrow information paradox | standard |
| 28 | alternative data survey trial conversion rate time to evaluate dataset onboarding weeks buyers Eagle Alpha BattleFin | standard |
| 29 | AI labs total spending on training data 2025 2026 billion human data estimate OpenAI Anthropic Google Meta | extended |
| 30 | Immunefi total bounties paid to date 2026 whitehats million | standard |
| 31 | HackerOne 2026 Hacker-Powered Security Report total bounties paid million | extended |
| 32 | alternative data buy-side survey evaluating datasets trial takes months cost of evaluation percentage of trials converted to purchase | standard |

### Page fetches (25)

1. https://www.neudata.co/blog/state-of-the-alternative-data-market-2026
2. https://dataandinsights.com.au/global-market-research-report-2026/
3. https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html
4. https://www.mercor.com/blog/series-d/
5. https://sacra.com/chat/h/b1bf3f50-c909-4c7e-a641-f40c2c0f14f1/ (an AI-generated chat page)
6. https://www.forbes.com.au/?p=189230
7. https://www.galaxy.com/insights/perspectives/inference-market-and-micro-structure
8. https://surgehq.ai/ots
9. https://dealroom.co/news/137121-mercor-doubles-to-2b-gross-revenue-run-rate-as-ai-labs-buy-expert-data/
10. https://openrouter.ai/pricing
11. https://mondovisione.com/media-and-resources/news/realtime-analytics-drive-record-growth-across-the-financial-market-data-landsca-2026326
12. https://www.neudata.co/education/how-big-is-the-alternative-data-market-for-investment-managers
13. https://grandviewresearch.com/press-release/global-ai-training-dataset-market
14. https://www.deloitte.com/us/en/insights/industry/financial-services/risk-insurance-for-ai.html
15. https://www.sec.gov/Archives/edgar/data/1713445/000171344526000022/rddt-20251231.htm (chars 0–100k)
16. https://www.sec.gov/Archives/edgar/data/0001713445/000171344526000114/earningspressreleaseq326.htm
17. https://webflow2.neudata.co/blog/the-future-of-alternative-data-report-2024
18. https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/
19. https://docs.snowflake.com/en/collaboration/provider-listings-pricing-model
20. Reddit 10-K (as #15), chars 150k–250k
21. Reddit 10-K (as #15), chars 250k–350k
22. https://coinbureau.com/review/ocean-protocol (**HTTP 403**)
23. https://menlovc.com/perspective/2026-the-state-of-enterprise-ai/
24. https://www.sec.gov/Archives/edgar/data/1713445/000171344526000020/earningspressreleaseq425.htm
25. https://arxiv.org/abs/2012.08874

Local files read: `MOONSHOT.md` (§3.3, §5, §6), `moonshot-notes/market.md` (all), `SPEC-PROMPT.md`, and a grep of `moonshot-notes/competitors.md` for Ocean, iExec and marketplace benchmarks.
