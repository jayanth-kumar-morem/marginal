# Marginal: regulatory research notes (input for SPEC.md §9)

- **As of:** 2026-11-11
- **Scope:** checklist items 1–9 from the spec brief, plus a few adjacent regimes that came up and matter for the verticals. **Not legal advice.** These notes record what sources say, add my analysis (labelled **Analysis**), and flag uncertainty.
- **Source labels:** **PRIMARY** = official legal text, regulator release, court opinion or docket. **SECONDARY** = law-firm memo, press, trade or academic commentary. **UNVERIFIED** = a search-result snippet I could not open, or a statement from background knowledge I could not re-read this session. Treat UNVERIFIED items as leads, not facts.
- **Access caveats (affect confidence):**
  - EUR-Lex returned empty pages (HTTP 202) to automated fetches. Where I say an EU text was "read", I read the same act from the EU Publications Office copy (`publications.europa.eu/resource/celex/<CELEX>.ENG.xhtml`). That worked for the DGA (32022R0868), MiCA (32023R1114), the DSM Directive (32019L0790) and the CJEU judgment C-413/23 P (62023CJ0413). It did **not** work for the AI Act, the AI Omnibus (Reg. 2026/1744), MAR, the Data Act or the CRA. Statements about those texts rely on Commission or Parliament pages, secondary sources or background knowledge, and are labelled.
  - Federal Register HTML pages hit a captcha, so I used the FR JSON API for metadata and abstracts.
  - CourtListener and the Ninth Circuit docket were blocked (401/403). "No Ninth Circuit decision in Panuwat" therefore rests on searches only.

---

## 0. Headline findings

1. **Thomson Reuters v. Ross was affirmed by the Third Circuit on 2026-09-29.** It is the first federal appellate ruling on fair use in AI training, and it went against the AI developer (a non-generative tool). The opinion was initially sealed. [SECONDARY]
2. **The AI Omnibus (Reg. (EU) 2026/1744, OJ 2026-07-24) moved the high-risk dates** to 2027-12-02 (Annex III) and 2028-08-02 (Annex I). **None of the sources I found say it changed the GPAI obligations or the GPAI dates (2025-08-02 / 2026-08-02 / 2027-08-02).** I could not read the OJ text itself. [PRIMARY for the procedure; SECONDARY for "GPAI unaffected"]
3. **Model-weights export control (ECCN 4E091): BIS stopped enforcing it in May 2025, but the text is still in the EAR.** The eCFR's current text still references 4E091. BIS promised a rescission notice and a replacement rule. As of 2026-11-11 I found neither in the Federal Register. [PRIMARY]
4. **The DOJ Data Security Program counts bulk US sensitive personal data "regardless of whether the data is anonymized, pseudonymized, de-identified, or encrypted".** Its "data brokerage" definition includes "licensing of access to data", which would cover in-vault use-rights. Anonymous buyers are therefore not workable for datasets that hit the thresholds. [PRIMARY]
5. **The EU DGA lists "data marketplaces" as an example of a data intermediation service** (recital 28). DGA Art. 12(a) bars using intermediated data for any purpose other than making it available to data users, and requires a separate legal person. That conflicts with MOONSHOT's "appraisal corpus" moat as written. The DGA also excludes "services that focus on the intermediation of copyright-protected content", which may take the memo vertical out of scope. [PRIMARY; scope analysis is mine]
6. **Selling exploits runs into US export controls on intrusion software** (ECCNs 4D004 and 4E001.c, License Exception ACE). There are carve-outs for "vulnerability disclosure", but ACE is unavailable where the exporter has "reason to know" of unauthorized use. In the EU, an undisclosed exploit in a protocol whose token trades on an EU platform may also be **inside information under MiCA Art. 87**. MOONSHOT has no row for either. [PRIMARY; the MiCA application is my analysis]
7. **Event contracts are in flux.** In 2026 the circuits split: the Third Circuit sided with Kalshi and CFTC preemption, while the Ninth and Sixth Circuits sided with the states. The CFTC withdrew its 2024 proposal (Feb 2026), issued an ANPRM (Mar 2026) and an NPRM (Jun 2026). Truth-contingent payments for "signals" can fall within the CEA's "swap" definition. [PRIMARY + SECONDARY]
8. **SEC v. Panuwat (shadow trading): the Ninth Circuit heard argument on 2026-06-11** (per a secondary report). I found no decision as of 2026-11-11. [SECONDARY / UNVERIFIED]

---

## 1. EU AI Act: GPAI obligations, Art. 53(1)(c)–(d)

**Rule.** Providers of general-purpose AI models must (c) put in place a policy to comply with Union copyright law, in particular to identify and comply with rights reservations expressed under Art. 4(3) of the DSM Directive (the TDM opt-out), and (d) publish a "sufficiently detailed summary" of training content on a template provided by the AI Office. The Commission's Q&A confirms the copyright-policy duty under Art. 53(1)(c). Under DSM Art. 4(3), the text-and-data-mining exception applies only where use "has not been expressly reserved by their rightholders in an appropriate manner, such as machine-readable means in the case of content made publicly available online" (read from the official text). Fines for GPAI providers can reach 3% of global annual turnover or EUR 15m, whichever is higher (Art. 101, per the Commission Q&A).

**Key dates.**
- AI Act in force 2024-08-01 [UNVERIFIED this session; background knowledge].
- GPAI obligations **apply from 2025-08-02** (Art. 113(b), per the Commission Q&A) [PRIMARY].
- **Commission enforcement powers, including fines on GPAI providers (Art. 101), from 2026-08-02.** Art. 113(b) applies Chapter V from 2025-08-02 "with the exception of Article 101". I could not re-read this text because EUR-Lex was blocked, so it is UNVERIFIED this session, but it is widely reported.
- Models placed on the market **before 2025-08-02 must comply by 2027-08-02** (Art. 111(3)) [SECONDARY: WilmerHale; Art. 111(3) is referenced on the Commission Q&A page].
- **Training-data summary template published 2025-07-24** [SECONDARY: WilmerHale and others; the Commission's template page resolves]. Per secondary summaries it has three sections: general model information; data sources (public datasets, private and licensed third-party datasets, crawled data including the top 10% of scraped domain names, with relaxations for SMEs, user data, synthetic data); and data-processing aspects. The Commission does not audit content directly but can act on complaints or on "qualified alerts" from the scientific panel [SECONDARY].

**GPAI Code of Practice.** Published **2025-07-10** [PRIMARY]. Adhering to it is "a means to demonstrate compliance … while not providing a presumption of conformity" [PRIMARY, Commission Q&A]. The Commission's signatory page (last updated 2026-10-07) lists AI Studio Delta, Aleph Alpha, Almawave, Amazon, Anthropic, Black Forest Labs, Bria AI, Cohere, Domyn, Dweve, Fastweb, Google, IBM, LINAGORA, Microsoft, Mistral AI, Open Hippo, OpenAI, Pleias, Reflection AI, ServiceNow and WRITER. **xAI signed only the Safety and Security chapter** [PRIMARY]. The list my fetch returned may be truncated: one search snippet also showed "Accexible" and "AI Alignment Solutions". **Meta declined to sign** [SECONDARY]. I did not read the copyright chapter's commitments this session. That it requires respecting robots.txt and excluding piracy domains is UNVERIFIED.

**Digital Omnibus on AI: status and effect.**
- Proposed 2025-11-19 (COM(2025) 836). Political agreement 2026-05-07. Parliament vote 2026-06-16. Council adoption 2026-06-29. Signed 2026-07-08. **Published in the OJ on 2026-07-24 as Regulation (EU) 2026/1744.** The procedure is marked "completed" [PRIMARY: Parliament OEIL procedure file]. Entry into force is three days after publication [PRIMARY: Commission IP/26/1024], so **2026-07-27** (my arithmetic, matching secondary reports).
- **What changed** [PRIMARY: Commission IP/26/1024]:
  - Annex III high-risk obligations now apply from **2027-12-02**, and Annex I (product-embedded) obligations from **2028-08-02**.
  - New prohibition on AI that generates non-consensual intimate content or child sexual abuse material.
  - SME privileges extended to small mid-caps.
  - "The Commission AI Office's enforcement powers will be strengthened to support oversight of certain AI systems, including those built on general-purpose models."
  - Article 50(2) marking for systems already on the market moved to 2026-12-02 [SECONDARY: Sidley].
- **GPAI obligations and dates:** the Commission release says nothing about changing them. One secondary source says GPAI obligations are "unaffected". I could not read the OJ text. **Flag: verify against EUR-Lex 2026/1744 before the spec states this as fact.**
- The **separate data and GDPR Digital Omnibus** is still being legislated. See §3 and §4.

**What it means for Marginal.**
- **Demand:** the EU obliges GPAI providers to disclose sources and run a copyright policy. It does **not** oblige them to license data. Licensing with a provenance trail reduces risk and makes the summary and copyright-policy work easier. It is not legally required. Present "compliance input" as an inference.
- **Product:** a provenance dossier per dataset sale should cover licence chain, source categories mapped to the template's sections, and TDM-reservation checks on crawled sources. It should be exportable by the buyer. **Marginal cannot "satisfy" a provider's Art. 53 duties.** The provider stays responsible.
- **Weights vertical:** a seller who places a fine-tuned GPAI model on the EU market may itself be a GPAI provider. The Commission's GPAI guidelines set compute-based thresholds for when a downstream modifier becomes a provider [UNVERIFIED this session; the guidelines page resolves but I did not read it]. Collect provider-status attestations from weight sellers.

**Uncertainty:** medium. Dates are solid for 2025, 2026 and 2027. "GPAI unaffected by the Omnibus" rests on the Commission release plus one secondary source.

**Sources:**
- AI Act (Reg. (EU) 2024/1689), PRIMARY, not fetched (EUR-Lex blocked): https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- Commission GPAI Q&A, PRIMARY: https://digital-strategy.ec.europa.eu/en/faqs/general-purpose-ai-models-ai-act-questions-answers
- Commission template page, PRIMARY (URL resolves, content via secondary): https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models
- WilmerHale on the template, SECONDARY: https://wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/european-commission-releases-mandatory-template-for-public-disclosure-of-ai-training-data
- DSM Directive 2019/790 Art. 4(3), PRIMARY (read via the Publications Office copy): https://eur-lex.europa.eu/eli/dir/2019/790/oj
- GPAI Code of Practice signatories, PRIMARY: https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai
- Meta declines, SECONDARY: https://techinformed.com/meta-rejects-eu-ai-code-of-practice/
- GPAI guidelines page, PRIMARY (not read): https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers
- OEIL 2025/0359(COD), PRIMARY: https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2025%2F0359%28COD%29
- Reg. (EU) 2026/1744, PRIMARY (URL from search; text unreadable to my tools): https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng
- Commission IP/26/1024 (2026-05-07), PRIMARY: https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_26_1024/IP_26_1024_EN.pdf
- Sidley, SECONDARY: https://datamatters.sidley.com/2026/06/22/eu-lawmakers-reach-provisional-agreement-to-delay-key-eu-ai-act-obligations/
- Usercentrics ("GPAI unaffected"), SECONDARY: https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/

---

## 2. Insider trading and MNPI when selling information to funds

### 2.1 US framework

- **Misappropriation theory.** *United States v. O'Hagan*, 521 U.S. 642 (1997): a person who trades on confidential information misappropriated in breach of a duty owed to the *source* of the information commits securities fraud, even if he owes no duty to the issuer's shareholders [PRIMARY].
- **Tipper/tippee.** *Dirks v. SEC*, 463 U.S. 646 (1983): a tippee's liability derives from the tipper's breach. The test is whether the insider personally benefits, directly or indirectly, from the disclosure. A gift of confidential information to a trading relative or friend qualifies [PRIMARY].
- *United States v. Newman*, 773 F.3d 438 (2d Cir. 2014) required "a meaningfully close personal relationship" that generates an exchange "of a pecuniary or similarly valuable nature" [PRIMARY, as quoted in *Salman*].
- *Salman v. United States*, 580 U.S. 39 (decided 2016-12-06) held that Newman's pecuniary-exchange requirement for gifts to family or friends "is inconsistent with Dirks" [PRIMARY].
- **Analysis:** on Marginal **the seller is paid**. Pecuniary gain is the clearest form of "personal benefit" under Dirks. If a seller lists confidential information obtained in breach of a duty (to an employer, a client or a source), the personal-benefit element is satisfied by the sale itself. A buyer who knows, or should know, of the breach inherits liability.

### 2.2 Expert-network enforcement history

- **Primary Global Research (PGR), 2010–2012.** On 2011-02-03 the SEC charged six people. Four were "consultants" moonlighting from technology companies (Longoria, DeVore, Jiau, Shimoon). Two were **PGR employees** (Nguyen, Fleishman). Illicit gains were initially put at about $6m (Release 2011-38) [PRIMARY, per search-result text; sec.gov blocks automated fetches].
- On 2011-02-08 an amended complaint added a hedge fund and four portfolio managers and analysts. The SEC described a scheme netting more than $30m on information about AMD, Seagate, Western Digital and others (Release 2011-40) [PRIMARY, same caveat]. SEC officials said working for an expert network is not illegal, but trading on MNPI is [SECONDARY, press summary].
- Later litigation releases: LR-22270 (2012-02-24, Shimoon) and LR-22358 (Fleishman consent judgment) [PRIMARY, from search].
- **Analysis:** the intermediary's own staff were charged. Marginal cannot rely on "we never see the content" as a full defence. What the venue accepts, how it screens, and what its classifier flags will be examined.

### 2.3 SEC v. Panuwat ("shadow trading")

- A Medivation executive bought options in Incyte, a peer company, after learning confidentially of Medivation's acquisition. A jury in N.D. Cal. found him liable under the misappropriation theory on **2024-04-05** [SECONDARY: Paul Weiss]. Medivation's broadly worded insider-trading policy was central to the case.
- Notice of appeal filed 2024-11-08, Ninth Circuit **No. 24-6882** [SECONDARY: The Regulatory Review; AIMA amicus brief].
- **Oral argument on 2026-06-11.** Per the search-result description of an Akin Gump alert, both sides met skepticism and a new trial was seen as Panuwat's best realistic outcome [SECONDARY; I could not open the page].
- A law-review piece from April 2026 describes the case as pending [SECONDARY].
- **I found no Ninth Circuit decision as of 2026-11-11.** That is UNVERIFIED, because the docket was inaccessible.
- **Analysis:** a memo about Company A can be MNPI for trading Company B (a competitor, supplier or peer). MNPI screens therefore need to run at the sector and peer level, not only at the issuer level.

### 2.4 Investment Advisers Act §204A and SEC exam focus

- **§204A** (15 U.S.C. 80b-4a) requires registered advisers to "establish, maintain, and enforce written policies and procedures reasonably designed … to prevent the misuse … of material, nonpublic information" [PRIMARY].
- **SEC Division of Examinations risk alert, "Investment Adviser MNPI Compliance Issues", 2022-04-26** [PRIMARY]. Its deficiency themes are alternative data, "value-add investors" and expert networks. On expert networks it cites failures to track and log calls, to review call notes, and to review trading by supervised persons in issuers similar to those discussed, plus restricted-list gaps [SECONDARY summaries: MoFo, Goodwin, Simpson Thacher].
- **SEC v. Silver Point Capital** (press release 2024-209, December 2024): a §204A-type charge over MNPI held by a consultant who sat on Puerto Rico creditors' committees [PRIMARY, via search]. **I did not verify how the case has proceeded since.**
- **Analysis:** fund buyers will require Marginal to supply what their §204A programme needs: identity or attestations of sources, purchase logs, and the content their compliance officers can review. A good that is sealed even from the buyer's compliance team will not be bought by a registered adviser. "Sealed from the public and from Marginal" must coexist with "readable by the buyer's compliance function".

### 2.5 Standard expert-network compliance controls (industry practice)

- Signed consultant attestations: no breach of duties, no current employer or client confidential information, no MNPI.
- Exclusion or extra screening of current employees of the issuer and its close peers.
- Buyer restricted lists and do-not-contact lists cross-checked before a call.
- Chaperoned calls on request.
- Call logging, and transcript or notes review.
- Monitoring of buyer staff trading.
- Audit trails.

Sources: SIFMA "Best Practices for Use of Expert Networks" [SECONDARY, industry; page resolves, I did not read it]; vendor guides such as IQNetwork [SECONDARY, vendor, low weight]; SEC 2022 risk alert themes [PRIMARY staff view].

### 2.6 EU Market Abuse Regulation (Reg. (EU) 596/2014) and MiCA's parallel regime

- **MAR** (text not fetched this session; paraphrase from background knowledge, so UNVERIFIED wording):
  - **Art. 7** defines inside information: information of a precise nature, not made public, relating directly or indirectly to issuers or financial instruments, that would be likely to have a significant effect on prices if made public.
  - **Art. 10**: disclosure is unlawful unless made "in the normal exercise of an employment, a profession or duties".
  - **Art. 14** prohibits insider dealing, recommending or inducing it, and unlawful disclosure.
  - The insider-dealing provisions also reach anyone who possesses inside information and "knows or ought to know" it is inside information (Art. 8(4)).
  - **There is no personal-benefit element.** The EU standard is stricter than Dirks.
- **MiCA Title VI** (Arts. 86–92; read from the official text) applies the same structure to crypto-assets "admitted to trading or in respect of which a request for admission to trading has been made" (Art. 86(1)). It applies to conduct "in the Union and in third countries" (Art. 86(3)) and whether or not the trade is on a platform (Art. 86(2)). Art. 87 defines crypto inside information. Art. 90(1): "No person in possession of inside information shall unlawfully disclose inside information to any other person, except where such disclosure is made in the normal exercise of an employment, a profession or duties" [PRIMARY].
- **US commodities and crypto:** CFTC Rule 180.1 (17 CFR 180.1) is the CEA anti-fraud rule modelled on Rule 10b-5. It is the hook for misappropriation-style cases in commodities [PRIMARY URL; I did not re-read its scope this session].

**What it means for Marginal (knowledge, signals, alt-data datasets):**
1. Seller onboarding: KYB/KYC plus a per-listing attestation (source, no duty breach, not a current insider of named issuers or peers).
2. Buyer-supplied restricted and peer lists, matched inside the room.
3. An in-room MNPI classifier as a **gate that escalates**, not a guarantee.
4. A sealed compliance channel to the buyer's compliance officer: content, provenance and attestations, decryptable only by the buyer's compliance key.
5. Retention and a regulator-access path.
6. Stricter EU-buyer and crypto-asset rules: no personal-benefit test; treat token-specific non-public events (listings, exploits, unlocks, treasury moves) as presumptively inside information.

**Uncertainty:** medium. The law is settled in outline. How a TEE-mediated, content-blind venue would be treated is untested. The Panuwat appeal is pending.

**Sources:**
- O'Hagan, PRIMARY: https://www.law.cornell.edu/supremecourt/text/521/642
- Dirks, PRIMARY: https://www.law.cornell.edu/supremecourt/text/463/646
- Salman (quotes Newman), PRIMARY: https://www.supremecourt.gov/opinions/16pdf/15-628_m6ho.pdf
- SEC 2011-38, PRIMARY: https://www.sec.gov/news/press/2011/2011-38.htm
- SEC 2011-40, PRIMARY: https://www.sec.gov/news/press/2011/2011-40.htm
- LR-22270, PRIMARY: https://www.sec.gov/litigation/litreleases/lr-22270
- LR-22358, PRIMARY: https://www.sec.gov/enforcement-litigation/litigation-releases/lr-22358
- Panuwat verdict (Paul Weiss), SECONDARY: https://www.paulweiss.com/practices/transactional/investment-funds/publications/federal-jury-finds-defendant-liable-in-sec-shadow-trading-case?id=50980
- Panuwat appeal filed (Regulatory Review), SECONDARY: https://www.theregreview.org/2025/03/12/englebert-ninth-circuit-to-consider-shadow-theory-of-insider-trading/
- Panuwat oral argument (Akin Gump), SECONDARY, not opened: https://www.akingump.com/en/insights/alerts/both-sides-receive-skepticism-from-ninth-circuit-in-sec-v-panuwat-oral-argument
- AIMA amicus brief, No. 24-6882, SECONDARY: https://www.aima.org/asset/42D79539-BAB9-4CE4-ACC18F72C47BC322/
- Hofstra JIBL (April 2026, pending), SECONDARY: https://www.hofstrajibl.org/2026/04/whats-done-in-the-dark-will-be-brought-to-the-light-sec-v-panuwat-and-the-evolution-of-shadow-trading-regulation/
- §204A, PRIMARY: https://www.law.cornell.edu/uscode/text/15/80b-4a
- SEC risk alert 2022-04-26, PRIMARY: https://www.sec.gov/files/code-ethics-risk-alert.pdf
- MoFo summary of the risk alert, SECONDARY: https://www.mofo.com/resources/insights/220502-sec-deficiencies-investment-adviser-mnpi-compliance-practices.html
- Silver Point (SEC 2024-209), PRIMARY: https://www.sec.gov/newsroom/press-releases/2024-209
- SIFMA best practices, SECONDARY: https://www.sifma.org/resources/guides-playbooks/best-practices-for-use-of-expert-networks
- IQNetwork guide, SECONDARY (vendor): https://iqnetwork.co/expert-network-compliance-guide/
- MAR, PRIMARY, not fetched: https://eur-lex.europa.eu/eli/reg/2014/596/oj
- MiCA, PRIMARY (read): https://eur-lex.europa.eu/eli/reg/2023/1114/oj
- CFTC Rule 180.1, PRIMARY: https://www.ecfr.gov/current/title-17/chapter-I/part-180/section-180.1

---

## 3. EU Data Governance Act (Reg. (EU) 2022/868) and Data Act

**Rule (read from the official text).**
- **Art. 2(11)** defines a "data intermediation service" as "a service which aims to establish commercial relationships for the purposes of data sharing between an undetermined number of data subjects and data holders on the one hand and data users on the other, through technical, legal or other means". It excludes, at least:
  - (a) services that obtain data, aggregate, enrich or transform it to add substantial value, and license the resulting data **without establishing a commercial relationship between data holders and data users**;
  - (b) **"services that focus on the intermediation of copyright-protected content"**;
  - (c) single-data-holder or closed-group services;
  - (d) public-sector non-commercial sharing.
- **Recital 28** gives "data marketplaces on which undertakings could make data available to others" as an example of a covered service. It also says cloud storage, analytics and data-sharing *software* are not covered if they only provide tools and do not aim to establish commercial relationships.
- "Data" means "any digital representation of acts, facts or information" (Art. 2(1)).
- "Access" means "data use … without necessarily implying the transmission or downloading of data" (Art. 2(13)). This is relevant to in-vault use-rights.
- **Art. 10(a)** brings in intermediation between data holders and potential data users, including "platforms or databases enabling the exchange or joint use of data".
- **Art. 11 (notification):**
  - The provider must notify the national competent authority and may start once notified (Art. 11(4)). The notification is valid EU-wide (Art. 11(5)).
  - A non-EU provider must designate a **legal representative** in a Member State (Art. 11(3)).
  - Changes must be notified within 14 days. The Commission keeps a public register.
  - The label "data intermediation services provider recognised in the Union" is available on confirmation (Art. 11(9)).
- **Art. 12 (conditions), key items:**
  - (a) **"shall not use the data for which it provides data intermediation services for purposes other than to put them at the disposal of data users and shall provide data intermediation services through a separate legal person"**;
  - (b) pricing may not depend on use of other services from the same provider or related entities;
  - (c) activity metadata (dates, times, connections) may be used **only** to develop the intermediation service, including fraud detection and cybersecurity, and must be available to data holders on request;
  - (e) anonymisation, pseudonymisation and conversion tools only at the explicit request of the holder or subject;
  - (f) fair, transparent, non-discriminatory access and prices;
  - (g) anti-fraud and anti-abuse procedures;
  - (h) insolvency continuity and data retrieval;
  - (j)–(l) prevent unlawful transfer of or access to non-personal data, notify holders of unauthorised access, and apply "the highest level of security" to competitively sensitive information;
  - (o) keep a log record.
- **Enforcement (Art. 14):** competent authorities can impose fines and suspend or stop a service. Penalties are set nationally (Art. 34).
- **Dates:** the DGA applies from **2023-09-24** (Art. 38). Providers operating on 2022-06-23 had to comply by **2025-09-24** (Art. 37) [all PRIMARY].

**Would Marginal count?** (Analysis.)
- **Datasets and evals vertical: very likely yes** when offered in the EU. Marginal is an open, many-to-many venue that establishes commercial relationships between data holders and data users, which is the recital-28 "data marketplace". Exclusion (a) does not fit, because Marginal brokers a direct holder-to-user deal rather than buying and relicensing. Use-rights fall within "access".
- **Knowledge vertical (memos, research):** possibly excluded under (b) as copyright-protected content. Expert answers made to order and factual data are less clearly excluded.
- **Weights:** weights are "digital representation of … information", but whether brokering them is "data sharing" is untested.
- **Exploits:** probably outside the DGA's purpose, but there is no source.

**Product consequences if in scope.**
1. Run EU intermediation through a **separate legal entity** that does nothing else.
2. **The appraisal corpus (MOONSHOT §7, moat 2) must be limited** to transaction metadata used to improve *that* intermediation service (Art. 12(c)), shared back with holders on request. Marginal must not use goods or derived features of goods for other purposes, such as training general "information-pricing models" for sale (Art. 12(a)).
3. No tying of fees to Marginal's other services, such as discounts for using its own TEE cloud (Art. 12(b)).
4. Notify before launch, appoint an EU legal representative, log activity, and plan for insolvency continuity.

**Pending change (Digital Omnibus on data, COM(2025) 837, proposed 2025-11-19).**
- It would **repeal the DGA** and move data intermediation into the Data Act with "targeted modifications", making registration **voluntary** [SECONDARY: MediaLaws, 2025-12-19; Lewis Silkin].
- One commercial source says the separate-legal-entity requirement becomes **functional separation** [UNVERIFIED, low-quality source].
- **Status:** the Council agreed its negotiating mandate on **2026-10-21** [PRIMARY Council press-release URL and title, page blocked; SECONDARY: Addleshaw Goddard]. The Parliament position and trilogues are pending. **The DGA as written still applies on 2026-11-11.**

**Data Act (Reg. (EU) 2023/2854).** Applicable from **2025-09-12** [UNVERIFIED this session; EUR-Lex blocked; widely reported].
- **Art. 36** sets "essential requirements" for smart contracts that execute data-sharing agreements: robustness and access control, safe termination or interruption, data archiving and continuity, consistency with the agreement's terms. They fall on the vendor of the application, or on the person who deploys smart contracts for others [UNVERIFIED wording, from background knowledge].
- **Analysis:** Marginal's NEAR settlement contract, if it executes the release of data under a sale agreement involving EU parties, may be such a smart contract. That would require a kill-switch or interruption path and an EU declaration of conformity. This sits uneasily with "immutable, no admin keys" designs.
- I did not verify whether the data Omnibus amends or deletes Art. 36.

**Uncertainty:** medium-high on scope. High that the DGA is in force and that recital 28 covers data marketplaces.

**Sources:**
- DGA, PRIMARY (read via the Publications Office copy): https://eur-lex.europa.eu/eli/reg/2022/868/oj and http://publications.europa.eu/resource/celex/32022R0868.ENG.xhtml
- MediaLaws (2025-12-19), SECONDARY: https://www.medialaws.eu/the-data-omnibus-the-good-the-bad-and-the-ugly-behind-the-dga-and-data-act-rewrite/
- Lewis Silkin, SECONDARY: https://www.lewissilkin.com/en/insights/2025/11/21/the-eu-digital-omnibus-targeted-simplification-of-ai-cybersecurity-and-data-ru-102lvly
- Sealmetrics ("functional separation"), UNVERIFIED: https://docs.sealmetrics.com/legal/omnibus/data-intermediation
- Council press release 2026-10-21, PRIMARY (title and date only; fetch blocked): https://www.consilium.europa.eu/en/press/press-releases/2026/10/21/digital-rulebook-council-agrees-position-to-simplify-data-protection-privacy-and-cyber-reporting-rules/
- Addleshaw Goddard, SECONDARY: https://www.addleshawgoddard.com/en/insights/insights-briefings/2026/data-protection/eu-digital-omnibus-european-council-adopts-its-position/
- Data Act, PRIMARY, not fetched: https://eur-lex.europa.eu/eli/reg/2023/2854/oj

---

## 4. GDPR and personal data in traded goods

**EDPB Opinion 28/2024** (adopted **2024-12-17** per the PDF; the EDPB web page shows 18 December) [PRIMARY].
- **Anonymity of models.** Models trained on personal data "cannot, in all cases, be considered anonymous". To be anonymous, both "the likelihood of direct (including probabilistic) extraction of personal data" and "the likelihood of obtaining, intentionally or not, such personal data from queries, should be insignificant", taking into account all means reasonably likely to be used. Claims are assessed case by case.
- **Legitimate interest** follows the three-step test: legitimate interest, necessity, balancing.
- **Unlawful development and later use:**
  - Scenario 1: the same controller deploys; case by case.
  - Scenario 2: another controller deploys and must carry out "an appropriate assessment … to ascertain that the AI model was not developed by unlawfully processing personal data".
  - Scenario 3: if the model is genuinely anonymised, the GDPR does not apply to its later operation.

**CJEU C-413/23 P, EDPS v SRB, judgment of 2025-09-04** (First Chamber; read from the official text) [PRIMARY].
- **Pseudonymisation can mean the data is not personal for a recipient.** Para 77: for a recipient such as Deloitte, pseudonymised data "may … [not be] personal in nature". This presupposes that the recipient "is not in a position to lift those measures" and that the measures prevent re-identification "including by recourse to other means of identification such as cross-checking". Para 87 adds that pseudonymisation "may … effectively prevent persons other than the controller from identifying the data subject".
- **The controller's duty to tell data subjects about recipients is judged from the controller's side.** Para 111: "the identifiable nature of the data subject must be assessed at the time of collection of the data and from the point of view of the controller."
- **Result:** the Court set aside the General Court's judgment and sent the case back to it.
- **Scope caveat:** the case interprets Regulation 2018/1725, which binds EU institutions. Its definitions mirror the GDPR's. Commentators note open questions for controller-to-processor transfers [SECONDARY: Clifford Chance, Jones Day].

**Exchange role: processor or controller?** (Analysis; confirm with counsel.)
- **Seller = controller** of any personal data in the good.
- **Marginal:**
  - The room *decrypts and processes* the data on Marginal-operated, Marginal-designed infrastructure.
  - SRB does not take Marginal out of the GDPR, because its approved code is precisely what "lifts" the encryption.
  - The most defensible posture is **processor (Art. 28) for vault hosting and appraisal on the seller's documented instructions**. Marginal decides only non-essential technical means, per the EDPB controller/processor guidelines 07/2020 framework [PRIMARY URL; I did not re-read it this session].
  - **Risk:** Marginal designs the appraisal and decides what is extracted or retained, for example the appraisal corpus. That could make it a joint controller (Art. 26).
- **Buyer:**
  - **Copy delivery:** the buyer becomes an independent controller.
  - **Use-rights in the vault:** buyer and Marginal roles need explicit allocation.
- **Transparency is the binding constraint for sellers.** Under SRB para 111, the seller's notice at collection had to name the recipients or recipient categories. Most datasets collected for other purposes will need a new legal basis or a compatibility analysis before sale.
- **Weights:** the buyer, as deployer, has a scenario-2 duty to assess lawful development. Marginal's provenance dossier, plus in-room memorisation and extraction tests matching the EDPB's "insignificant likelihood" standard, is a product feature, not a guarantee.

**Pending change.** The data/GDPR Digital Omnibus (COM(2025) 837) would make the definition of personal data **relative to the entity**, codifying SRB. Reports also describe AI-training provisions [SECONDARY: Covington/Inside Privacy, iubenda]. The Council mandate is dated 2026-10-21 (see §3). **This is not law on 2026-11-11.**

**Product controls.**
- Seller attestations of lawful basis and that recipients were disclosed.
- In-room PII detection, with blocking or anonymisation before any copy delivery.
- DPIA templates.
- Art. 28 processing terms, with joint-controller terms as a fallback.
- Chapter V transfer tooling for non-EEA buyers on copy delivery.
- Default to use-rights with aggregate or anonymous outputs for personal-data goods.

**Uncertainty:** high on role allocation, which is untested for TEE exchanges. Low on the holdings quoted above.

**Sources:**
- EDPB Opinion 28/2024, PRIMARY: https://www.edpb.europa.eu/system/files/2024-12/edpb_opinion_202428_ai-models_en.pdf
- EDPB page for Opinion 28/2024, PRIMARY: https://www.edpb.europa.eu/our-work-tools/our-documents/opinion-board-art-64/opinion-282024-certain-data-protection-aspects_en
- CJEU judgment C-413/23 P, PRIMARY: http://publications.europa.eu/resource/celex/62023CJ0413.ENG.xhtml
- CJEU press release 107/25, PRIMARY: https://curia.europa.eu/jcms/upload/docs/application/pdf/2025-09/cp250107en.pdf
- Clifford Chance, SECONDARY: https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2025/09/pseudonymized-data-after-edps-v-srb.html
- Jones Day, SECONDARY: https://www.jonesday.com/es/insights/2025/09/cjeu-clarifies-scope-of-personal-data-in-edps-v-srb-decision
- EDPB Guidelines 07/2020, PRIMARY: https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en
- Inside Privacy, SECONDARY: https://www.insideprivacy.com/ai/european-commission-proposes-revisions-to-gdpr-and-other-digital-rules-under-digital-omnibus-package
- iubenda, SECONDARY: https://www.iubenda.com/en/blog/eu-digital-omnibus-gdpr-changes-proposed-amendments-explained/

---

## 5. US export controls

### 5.1 Model weights (AI Diffusion rule, ECCN 4E091)

- **The rule.** BIS's "Framework for Artificial Intelligence Diffusion" interim final rule (90 FR 4544) was published 2025-01-15, effective 2025-01-13 [PRIMARY: FR API]. It created ECCN 4E091 for certain model weights. Most compliance dates were 2025-05-15 [PRIMARY: BIS release]. The 4E091 scope (closed weights of models trained with more than 10^26 operations; published weights excluded) is UNVERIFIED this session; that is my recollection of the IFR.
- **Rescission announced, not completed.** In a release dated **2025-05-12** (law firms date it 2025-05-13), BIS "initiated a rescission". Under Secretary Kessler "instructed BIS enforcement officials not to enforce" the rule. BIS "plans to publish a Federal Register notice formalizing the rescission and will issue a replacement rule in the future" [PRIMARY]. The same release warned about using US AI chips to train or run Chinese AI models.
- **Status on 2026-11-11** [PRIMARY]:
  - **The eCFR's current text still contains 4E091** in §740.27 (License Exception AIA, including a version effective 2026-07-16), §742.6, §748.3 and Supp. 10 to Part 748 (eCFR search API, 50 matches, several marked ongoing).
  - An FR API search found only three BIS rules mentioning AI since 2025-05-01: Entity List additions (2025-09-16); "Revision to License Review Policy for Advanced Computing Commodities" (2026-01-15); and "Enhanced Favorable Treatment for the United Arab Emirates" (2026-07-14, effective 2026-07-10, amending Parts 740/742/774). Going by the FR API metadata, the UAE rule's abstract says nothing about rescinding the AI Diffusion rule or about 4E091.
  - **I found no rescission notice and no replacement rule.** Secondary sources say BIS's regulatory plan targeted fiscal year 2026 and that deadline passed [SECONDARY / UNVERIFIED].
- **Weights-in-vault is not automatically outside the EAR.** §734.18(a)(5) excludes from "export" only the sending, taking or storing of technology or software that is "secured using 'end-to-end encryption'", uses FIPS 140-2-grade cryptography, and is "not intentionally stored in a country listed in Country Group D:5". "End-to-end encryption" requires that "the means of decryption are not provided to any third party" [PRIMARY].
- **Analysis:** a room that *decrypts* weights inside an enclave hosted abroad is arguably a release in that country, not an encrypted transit. Where the enclave sits matters. **Open question for export counsel.**
- **Product implications:**
  - Classify weight listings (open versus closed, training compute).
  - Treat frontier closed weights as potentially controlled.
  - Host weight rooms only in the US or allied jurisdictions; never in D:5 or E-group countries.
  - Screen buyers, and keep BIS's May 2025 chip and model-training guidance in mind for train-in-vault.
  - Watch the Federal Register for the replacement rule.

### 5.2 Cybersecurity items (relevant to selling exploits)

- **The rule.** BIS "Information Security Controls: Cybersecurity Items" (86 FR 58205) was published 2021-10-21 with an original effective date of 2022-01-19 [PRIMARY: FR API]. The effective date was delayed to 2022-03-07, and ACE and its definitions were refined on 2022-05-26 (87 FR 31948) [PRIMARY metadata; content per SECONDARY summary]. The rule implements Wassenaar Arrangement controls on intrusion software and IP-network surveillance [SECONDARY: Mayer Brown].
- **License Exception ACE (15 CFR 740.22), read from the eCFR** [PRIMARY]:
  - It covers cybersecurity items in ECCNs 4A005, 4D001.a, 4D004, 4E001.a and .c, 5A001.j, 5B001.a, 5D001.a and .c, and 5E001.a.
  - No ACE to E:1/E:2.
  - No ACE to government end users in D:1–D:5. There are narrow exceptions for national CSIRTs and police in A:6 countries.
  - Non-government end users in D:1/D:5 only for "vulnerability disclosure", "cyber incident response", deemed exports or "favorable treatment cybersecurity end users".
  - **ACE is unavailable where the exporter "knows" or has "reason to know" the item will be used to affect the confidentiality, integrity or availability of systems without the owner's authorization** (740.22(c)(5)).
  - A note to (c)(3) says ECCN 4E001 excludes "vulnerability disclosure" and "cyber incident response" from control under 4E001.a/.c.
- **Analysis:**
  - MOONSHOT's exploit vertical ("disclosure sealed to protocol key on payout") fits the vulnerability-disclosure model.
  - Selling working exploit tooling, or exploit-development technology, to anyone other than the affected owner or operator moves into controlled territory, for example 4D004 (software for generating, delivering or commanding intrusion software).
  - Selling to government buyers in D-group countries, or where Marginal has reason to suspect unauthorized use, would need a licence or be prohibited.
  - **Restrict the vertical to sales to the affected owner, operator or vendor, KYB'd, for remediation.**
  - Non-US sellers also face their own regimes; I did not research the EU dual-use regulation.
- **Adjacent rule (EU Cyber Resilience Act, Reg. (EU) 2024/2847):** manufacturers must report actively exploited vulnerabilities from **2026-09-11** (Art. 14) [PRIMARY URL, not fetched; UNVERIFIED this session]. Buyers who are manufacturers will have clocks running. Whether smart-contract protocols are "products with digital elements" is unclear.

**Uncertainty:** high for weights (the rule is in limbo). Medium for exploits (the rule is clear, but product classification depends on facts).

**Sources:**
- AI Diffusion IFR, PRIMARY: https://www.federalregister.gov/documents/2025/01/15/2025-00636/framework-for-artificial-intelligence-diffusion
- BIS release (2025-05-12), PRIMARY: https://media.bis.gov/sites/default/files/documents/05.07%20Recission%20of%20AI%20Diffusion%20Press%20Release.pdf
- eCFR search for 4E091, PRIMARY: https://www.ecfr.gov/api/search/v1/results?query=%224E091%22
- FR 2026-14132 (UAE rule), PRIMARY: https://www.federalregister.gov/documents/2026/07/14/2026-14132/enhanced-favorable-treatment-for-the-united-arab-emirates-under-the-export-administration
- FR 2026-00789, PRIMARY: https://www.federalregister.gov/documents/2026/01/15/2026-00789/revision-to-license-review-policy-for-advanced-computing-commodities
- Akin Gump, SECONDARY: https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/bis-rescinds-ai-diffusion-rule-and-issues-new-guidance
- Roc Telecom ("rescinded but not gone"), SECONDARY: https://roctelecom.com/insights/ai-diffusion-rule-itad/
- EAR §734.18, PRIMARY: https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-734/section-734.18
- Cyber IFR, PRIMARY: https://www.federalregister.gov/documents/2021/10/21/2021-22774/information-security-controls-cybersecurity-items
- 2022 amendment, PRIMARY: https://www.federalregister.gov/documents/2022/05/26/2022-11282/information-security-controls-cybersecurity-items
- ACE (15 CFR 740.22), PRIMARY: https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.22
- Mayer Brown, SECONDARY: https://www.mayerbrown.com/en/insights/publications/2021/10/bis-announces-new-rule-to-limit-exports-of-certain-cybersecurity-products
- MoFo, SECONDARY: https://www.mofo.com/resources/insights/211105-bis-releases-interim-final-rule
- CRA, PRIMARY, not fetched: https://eur-lex.europa.eu/eli/reg/2024/2847/oj

---

## 6. US DOJ Data Security Program (28 CFR Part 202, implementing EO 14117)

**Rule.** EO 14117 was published at 89 FR 15421 (2024-03-01). The final rule (90 FR 1636, published 2025-01-08) is **effective 2025-04-08** [PRIMARY: FR API]. Read from the eCFR [PRIMARY]:

- **Prohibition (§202.301):** US persons may not knowingly engage in a covered data transaction involving **data brokerage** with a country of concern or a covered person.
- **Definition of data brokerage (§202.214):** "the sale of data, licensing of access to data, or similar commercial transactions", where the recipient did not collect the data directly from the individuals.
- **Onward-transfer duty (§202.302):** for data brokerage with *any other* foreign person, the US person must contractually bar onward brokerage of the same data to a country of concern or covered person. It must also report known or suspected violations within 14 days.
- **Bulk thresholds (§202.205), counted over any 12 months:**
  - human 'omic data: >1,000 US persons (>100 for genomic data);
  - biometric identifiers: >1,000;
  - precise geolocation: >1,000 devices;
  - personal health data: >10,000;
  - personal financial data: >10,000;
  - covered personal identifiers: >100,000.
- **Government-related data** has no volume threshold.
- **§202.206: bulk data counts "regardless of whether the data is anonymized, pseudonymized, de-identified, or encrypted".** An example in the definitions (§202.230) treats encrypted data accessible to covered persons as in scope, according to my fetch.
- **Countries of concern:** China (including Hong Kong and Macau), Cuba, Iran, North Korea, Russia and Venezuela, per the definitions my fetch returned. I did not read §202.601 itself.
- Restricted transactions (vendor, employment, investment agreements) must meet the CISA security requirements issued 2025-01-03 [PRIMARY: DOJ NSD page].

**Key dates.**
- Effective 2025-04-08.
- DOJ "Implementation and Enforcement Policy Through July 8, 2025" (issued 2025-04-11) [PRIMARY].
- Due diligence and audit (subpart J) and reporting (§§202.1103–1104) **effective 2025-10-06** [SECONDARY: Crowell and others]. My fetch of DOJ's NSD page rendered this as 2025-10-05, a minor discrepancy. Check against the rule text.
- The NSD page was updated 2026-10-08. Its latest FAQ is dated 2025-09-24. I saw no 2026 change to the list of countries of concern.

**Relevance to Marginal** (Analysis).
- If Marginal, or any seller, is a US person and a dataset contains bulk US sensitive personal data, selling a copy **or licensing in-vault access** is data brokerage.
- Sales to covered persons are prohibited.
- Sales to other foreign buyers need the onward-transfer clause and the 14-day reporting duty.
- TEE encryption does not take the data out of scope (§202.206).
- **Pseudonymous buyers (Confidential Intents) are incompatible with this category.** Marginal must know the buyer and screen covered-person status, even if the purchase stays private from the public.

**Controls.**
- A category detector at listing that maps fields to the §202.205 categories and counts US persons.
- Mandatory KYB for buyers of flagged goods.
- Block countries of concern and covered persons.
- Contract clauses and reporting workflow.
- Room hosts not located in countries of concern.

**Uncertainty:** low on the rule text. Medium on how "US person" applies to a non-US Marginal entity with US sellers. I did not research evasion or causing liability.

**Sources:**
- 28 CFR Part 202 (eCFR), PRIMARY: https://www.ecfr.gov/current/title-28/chapter-I/part-202
- Final rule (90 FR 1636), PRIMARY: https://www.federalregister.gov/documents/2025/01/08/2024-31486/preventing-access-to-us-sensitive-personal-data-and-government-related-data-by-countries-of-concern
- EO 14117, PRIMARY: https://www.federalregister.gov/documents/2024/03/01/2024-04573/preventing-access-to-americans-bulk-sensitive-personal-data-and-united-states-government-related
- DOJ NSD page, PRIMARY: https://www.justice.gov/nsd/data-security
- Crowell, SECONDARY: https://www.crowell.com/en/insights/client-alerts/doj-data-security-program-update-active-enforcement-begins-this-week

---

## 7. Copyright and AI-training rulings (one line each, plus updates)

- **Bartz v. Anthropic** (N.D. Cal., Judge Alsup, 2025-06-23): training on lawfully acquired books was fair use, but building a central library from pirated copies was not [SECONDARY: Global Legal Post]. **Settlement:** $1.5bn, final approval **2026-07-20** by Judge Araceli Martínez-Olguín, with fees cut to about $101.56m [SECONDARY: Authors Guild, BetaNews]. **Appeals of the final approval were filed** and the appeal window ran to 2026-08-19, so the effective date and payouts are pending [SECONDARY: Writers Beware]. I did not check the current status of those appeals.
- **Kadrey v. Meta** (N.D. Cal., Judge Chhabria, No. 23-cv-03417-VC, 2025-06-25): summary judgment for Meta on fair use, limited to the 13 plaintiffs because they offered no meaningful evidence of "market dilution". The judge said market dilution could defeat fair use on a better record [SECONDARY: Authors Alliance, Goodwin].
- **Thomson Reuters v. Ross** (D. Del., Judge Bibas sitting by designation, February 2025): copying Westlaw headnotes to train a non-generative legal-search AI was not fair use. **Third Circuit affirmed 2026-09-29** in an initially sealed opinion. Factors 1, 3 and 4 favoured TR. The court stressed that the tool was non-generative. ROSS said it would seek rehearing en banc and certiorari [SECONDARY: IPWatchdog, Haynes Boone, Ballard Spahr, Patently-O].
- **What it means for Marginal** (Analysis):
  - The legal risk sits in **acquisition provenance** (pirated sources, as in Bartz) and in **market substitution or dilution** (Kadrey, Ross).
  - Controls: block shadow-library and pirated sources; require a licence chain and source attestations; run TDM-reservation checks for crawled data; use seller bonds and indemnities; prefer use-rights over copies where rights are unclear.
- **Uncertainty:** medium. District rulings split, and there is one appellate ruling, limited to non-generative AI.

**Sources:**
- Global Legal Post, SECONDARY: https://www.globallegalpost.com/news/anthropic-meta-fair-use-rulings-in-ai-training-expose-judicial-split-on-market-harms-1365503569
- Authors Guild, SECONDARY: https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/
- BetaNews, SECONDARY: https://betanews.com/article/anthropic-copyright-settlement-approved/
- Writers Beware, SECONDARY: https://writerbeware.blog/2026/07/23/anthropic-settlement-update-final-settlement-approved/
- Authors Alliance on Kadrey, SECONDARY: https://www.authorsalliance.org/2025/06/26/meta-wins-on-fair-use-for-now-but-court-leaves-door-open-for-market-dilution/
- Goodwin on Kadrey, SECONDARY: https://www.goodwinlaw.com/en/insights/publications/2025/06/alerts-practices-aiml-northern-district-of-california-judge-rules
- IPWatchdog on Ross, SECONDARY: https://ipwatchdog.com/2026/09/30/third-circuit-affirms-revised-fair-use-ruling-against-ross-ai-legal-research-platform-in-sealed-opinion/
- Haynes Boone on Ross, SECONDARY: https://www.haynesboone.com/news/alerts/third-circuit-rejects-fair-use-for-rosss-copying-of-westlaw-headnotes
- Ballard Spahr on Ross, SECONDARY: https://www.ballardspahr.com/insights/alerts-and-articles/2026/10/third-circuit-addresses-fair-use-in-ai-training-but-leaves-generative-ai-questions-unresolved
- Patently-O on Ross, SECONDARY: https://patentlyo.com/patent/2026/10/ease-is-not-necessity-third-circuit-affirms-no-fair-use-in-thomson-reuters-v-ross.html

---

## 8. Crypto settlement: money transmission, sanctions, MiCA

**FinCEN FIN-2019-G001 (issued 2019-05-09; read from the PDF)** [PRIMARY].
- **Unhosted wallets:** users are not money transmitters (§4.2.1).
- **Multi-signature wallet providers:** if the provider only adds a second authorization key and lacks "total independent control over the value", it "is not a money transmitter because it does not accept and transmit value". Combining that with hosted-wallet services makes it one (§4.2.2).
- **DApps:** "when DApps perform money transmission, the definition of money transmitter will apply to the DApp, the owners/operators of the DApp, or both" (§4.4). A DApp developer is not a money transmitter "for the mere act of creating the application" (§5.2.2).
- **Anonymizing services:** an anonymizing *services* provider is a money transmitter (§4.5.1(a)). An anonymizing *software* provider is not (§4.5.1(b)).
- **CVC payment processors** are money transmitters. They generally fail the payment-processor exemption because they do not settle through systems that admit only BSA-regulated institutions (§4.6).
- **Escrow is not addressed by name** in FIN-2019-G001 (a text search of the document found no "escrow").
- **Analysis:**
  - Whether Marginal is a money transmitter turns on control.
  - A NEAR contract that holds buyer funds and releases them on attested conditions looks like a DApp that "accepts and transmits value". This is especially so if Marginal holds an upgrade key, a guard co-signing key with unilateral power, or MPC control.
  - A design where Marginal holds only a non-unilateral co-signing role (the multisig analogy) and never has total independent control reduces the risk but does not remove it.
  - Fiat on- and off-ramps should go through licensed partners.
  - State money-transmitter laws were not researched.
- **DOJ posture (2025, non-binding):**
  - The April 2025 Blanche memo narrowed 18 U.S.C. §1960(b)(1)(A)/(B) prosecutions to willful violations.
  - In August 2025 Matthew Galeotti said DOJ would not bring new §1960(b)(1)(C) charges against developers of "truly decentralized" software that "solely automates peer-to-peer transactions" with no third-party custody or control [SECONDARY: Alston & Bird, WilmerHale].
  - Roman Storm (Tornado Cash) was **convicted on 2025-08-06 of conspiracy to operate an unlicensed money-transmitting business**. The jury hung on the laundering and sanctions counts [SECONDARY].
  - Advocacy groups call the issue unresolved, citing *Lewellen v. Bondi* (N.D. Tex.) [SECONDARY: Coin Center].
- **Uncertainty: HIGH.**

**OFAC.**
- OFAC's "Sanctions Compliance Guidance for the Virtual Currency Industry" (October 2021) applies sanctions obligations to virtual-currency activity and recommends risk-based screening, geolocation and IP blocking, and KYC [PRIMARY URL resolves; I did not re-read the text this session, so "strict liability" phrasing is UNVERIFIED].
- *Van Loon v. Treasury* (5th Cir., **2024-11-26**): Tornado Cash's "immutable smart contracts … are not 'property'" under IEEPA, so OFAC exceeded its authority; reversed and remanded [PRIMARY, read].
- **Analysis:** code may be unsanctionable, but persons and addresses are not. Confidential Intents hides who bought what from the *public*. Marginal and its settlement partners must still screen identities and addresses off-chain before any trade. "Private from the public, not from compliance" should be a stated design rule.

**MiCA (Reg. (EU) 2023/1114; read from the official text)** [PRIMARY].
- Applies from **2024-12-30** (Art. 149(2)).
- The CASP grandfathering period ran at most to **2026-07-01** (Art. 143(3)), so it **has now ended** for every Member State.
- Recital 22: services "provided in a fully decentralised manner without any intermediary" are outside scope.
- **Analysis:** accepting crypto as payment for an information good is not, by itself, a crypto-asset service, though I found no source saying so expressly. Marginal would need a CASP licence, or an authorized partner, if it custodies EU clients' crypto (for example buyer deposits held in escrow), exchanges one crypto-asset for another, or transfers crypto-assets on clients' behalf. That applies if Marginal runs the Intents routing as a service rather than the user interacting with solvers directly. MiCA's market-abuse title also applies to crypto signals (see §2.6).
- **Not researched or verified this session (leads):** the EU AML Regulation's ban on CASPs maintaining accounts that allow anonymisation (reported to apply from 2027) [UNVERIFIED]; the EU travel rule for CASPs (Reg. (EU) 2023/1113) [UNVERIFIED].

**Sources:**
- FIN-2019-G001, PRIMARY: https://www.fincen.gov/sites/default/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf
- Alston & Bird, SECONDARY: https://www.alston.com/en/insights/publications/2025/09/doj-illicit-finance-enforcement-defi
- WilmerHale, SECONDARY: https://www.wilmerhale.com/en/insights/client-alerts/20250910-doj-signals-approach-to-digital-assets-what-it-means-for-developers-and-platforms
- Coin Center, SECONDARY: https://coincenter.org/a-thin-doj-policy-memo-is-no-substitute-for-legal-protection/
- OFAC virtual-currency guidance, PRIMARY: https://ofac.treasury.gov/media/913571/download?inline
- Van Loon v. Treasury, PRIMARY: https://www.ca5.uscourts.gov/opinions/pub/23/23-50669-CV0.pdf
- MiCA, PRIMARY: https://eur-lex.europa.eu/eli/reg/2023/1114/oj

---

## 9. Truth-contingent payments and event contracts (CFTC)

- **Statute** [PRIMARY]. The CEA defines a "swap" to include any agreement "that provides for any purchase, sale, payment, or delivery … that is dependent on the occurrence, nonoccurrence, or the extent of the occurrence of an event or contingency associated with a potential financial, economic, or commercial consequence" (7 U.S.C. 1a(47)(A)(ii)). CFTC Rule 40.11 governs event contracts on registered exchanges (DCMs) [PRIMARY URL].
- **2026 CFTC actions** [PRIMARY]:
  - The CFTC **withdrew its 2024 event-contracts proposal** (notice of 2026-02-06, per the 2026-06 NPRM as summarised in search results).
  - **ANPRM "Prediction Markets"**, 91 FR 12516 (2026-03-16; press release 9194-26).
  - **NPRM "Prediction Markets; Public Interest Determinations"**, 91 FR 35806 (2026-06-12). It proposes factors, a review process and a definition of "gaming" under Part 40.
  - I did not verify whether a final rule has issued.
- **Courts** [SECONDARY]:
  - **Third Circuit (April 2026):** sports event contracts on a DCM are swaps under exclusive CFTC jurisdiction (in Kalshi's favour against New Jersey).
  - **Ninth Circuit (around 2026-08-28):** Nevada may regulate Kalshi's sports contracts as gambling.
  - **Sixth Circuit (2026-09-25):** the contracts are not swaps and are subject to state gaming law. Kalshi sought rehearing.
  - A petition for Supreme Court review is reportedly pending.
- **What it means for Marginal (signals vertical)** (Analysis):
  - A payment that depends on whether a forecast comes true, and that is separate from the purchase of the information, can be a swap. Off-exchange swaps are limited to eligible contract participants.
  - If the contingency concerns a single security, it may be a security-based swap under SEC jurisdiction.
  - Separately, state gaming law may apply.
  - **Safer structures:**
    1. A truth-contingent refund or warranty embedded in the sale of the good, non-transferable, with no secondary market, limited to institutional buyers.
    2. Or list the contingent leg through a registered DCM partner.
    3. Exclude sports, elections and other "enumerated activities".
  - The CFTC/SEC treatment of commercial warranties as non-swaps is UNVERIFIED this session.
- **Uncertainty: HIGH**, given an active circuit split and live rulemaking.

**Sources:**
- 7 U.S.C. 1a, PRIMARY: https://www.law.cornell.edu/uscode/text/7/1a
- Rule 40.11, PRIMARY: https://www.ecfr.gov/current/title-17/chapter-I/part-40/section-40.11
- ANPRM, PRIMARY: https://www.federalregister.gov/documents/2026/03/16/2026-05105/prediction-markets
- CFTC press release 9194-26, PRIMARY: https://www.cftc.gov/PressRoom/PressReleases/9194-26
- NPRM, PRIMARY: https://www.federalregister.gov/documents/2026/06/12/2026-11854/prediction-markets-public-interest-determinations
- Skadden (Third Circuit), SECONDARY: https://www.skadden.com/insights/publications/2026/04/third-circuit-affirms-kalshis-preliminary-injunction
- The Hill (Ninth Circuit), SECONDARY: https://thehill.com/policy/technology/6058357-ninth-circuit-prediction-markets-kalshi-states-cftc/
- CNBC (Sixth Circuit), SECONDARY: https://www.cnbc.com/2026/09/25/appeals-court-rules-states-can-regulate-sports-prediction-markets.html
- CoinDesk (Sixth Circuit), SECONDARY: https://www.coindesk.com/policy/2026/09/25/another-appeals-court-rules-against-prediction-market-provider-kalshi-says-sports-contracts-are-subject-to-state-regulations

---

## 10. Risk table

Severity is **my judgement** (High / Medium / Low) for Marginal as an operator, assuming EU and US customers. Vertical codes: K = knowledge, D = datasets, W = weights, E = evals, X = exploits, S = signals.

| # | Regulatory risk | Verticals | Severity (judgement) | Candidate control in the product |
|---|---|---|---|---|
| R1 | US insider trading (misappropriation, tipper/tippee). The sale price itself satisfies Dirks's "personal benefit". Intermediary staff can be charged (PGR). | K, S, D (alt-data) | **High** | Seller KYC/KYB and per-listing attestations (source, no duty breach, not an insider of named issuers or peers); employer/issuer screens; buyer restricted lists matched in-room; MNPI classifier as an escalation gate; human compliance review by the buyer's compliance officer through a sealed compliance key; retention and regulator access |
| R2 | Shadow trading (Panuwat; appeal pending) | K, S | Medium–High | Peer and sector expansion of restricted lists; flag issuer-adjacent topics; seller attestation that covers the employer's peers |
| R3 | EU MAR and MiCA Title VI: no personal-benefit test; "knows or ought to know" | K, S, X (token exploits) | **High** for EU buyers and crypto | Stricter EU and crypto rule set; token-specific non-public events treated as presumptive inside information; geo- and buyer-type gating |
| R4 | Buyer §204A obligations (registered advisers) | K, S, D | Medium (adoption blocker) | Compliance export: provenance, attestations, purchase log, content readable by the buyer's compliance function |
| R5 | EU DGA data-intermediation regime: notification, separate legal person, no other use of data, no tying, logs | D, E (maybe W; K possibly excluded as copyright content) | Medium | Separate EU intermediation entity; notify before EU launch; limit the "appraisal corpus" to transaction metadata used to improve the service; publish FRAND terms; insolvency continuity |
| R6 | GDPR: personal data in goods; role allocation; SRB transparency at collection; EDPB anonymity test for weights | D, E, W, K | **High** | Seller lawful-basis and recipient-disclosure attestations; in-room PII scan with block or anonymise; Art. 28 terms with joint-controller fallback; DPIA; transfer tooling; use-rights default with aggregate outputs; memorisation and extraction tests for weights |
| R7 | DOJ DSP: bulk US sensitive personal data; encrypted or pseudonymised data still counts; licensing access is brokerage | D, E, W (if trained on such data) | **High** where triggered | Category and threshold detector at listing; mandatory buyer KYB; block countries of concern and covered persons; onward-transfer clause; 14-day reporting workflow; no anonymous buyers for flagged goods |
| R8 | Export controls on weights: 4E091 unenforced but on the books; replacement pending; room location can create an export | W | Medium (uncertain) | Classify weights; host frontier-weight rooms only in the US or allied jurisdictions; buyer screening; watch the FR; counsel opinion on decrypt-in-enclave abroad |
| R9 | Export controls on intrusion software (4D004, 4E001.c; ACE limits) | X | **High** | Sell only to the affected owner, operator or vendor for remediation ("vulnerability disclosure"); KYB; no government end users in D-groups; deny where there is reason to know of unauthorized use; disclosure only, no weaponised tooling |
| R10 | EU CRA reporting clocks for manufacturers (from 2026-09-11) | X | Low–Medium | Coordinated-disclosure workflow; time-boxed release to the affected party |
| R11 | Copyright: pirated acquisition; market dilution; Ross (no fair use for non-generative training) | D, K, W, E | **High** | Provenance and licence chain; shadow-library blocklists; TDM-opt-out checks; seller bonds and indemnities; takedown process; use-rights for unclear rights |
| R12 | Money transmission: FinCEN, state law, §1960 | All (settlement) | Medium–High | Non-custodial contract with no unilateral Marginal control (multisig analogy); licensed fiat partners; counsel opinion; no in-house anonymizing service |
| R13 | OFAC sanctions (strict liability, per OFAC guidance; wording not re-read) | All | **High** | Off-chain identity and address screening before every trade, Confidential Intents included; geo-blocking; "private from the public, not from compliance" |
| R14 | MiCA CASP authorization (grandfathering ended 2026-07-01) | All (EU settlement) | Medium | No custody or exchange for EU clients except through an authorized CASP partner; user-direct Intents interaction |
| R15 | CFTC swaps or event contracts, and state gaming law, for truth-contingent payouts | S | Medium–High | Embed as a non-transferable warranty or refund inside the sale; institutional buyers only; no secondary trading; exclude sports and elections; or a DCM partner |
| R16 | Stolen goods and trade secrets (not researched in depth) | All | **High** | Provenance attestations; zkTLS origin proofs where applicable; bonds; takedown; KYB |
| R17 | EU AI Act GPAI duties of weight sellers and lab buyers (demand side; Marginal not the provider) | W, D | Low–Medium | Provenance dossier mapped to template sections; provider-status attestations for weight sellers; never claim a dossier "satisfies" Art. 53 |

---

## 11. Corrections and updates to MOONSHOT's regulatory statements

1. **§2 item 5 and §3.3: "GPAI obligations (Art. 53(1)(c)–(d), in force 2025-08-02)".**
   - Correct to: the obligations **apply from** 2025-08-02. The Act entered into force on 2024-08-01, which is background knowledge, not verified this session.
   - Add: **Commission enforcement powers, including fines, start 2026-08-02** and are live now. Models placed on the market before 2025-08-02 have until 2027-08-02, which MOONSHOT already says.
   - Add: the AI Omnibus (Reg. (EU) 2026/1744, OJ 2026-07-24) did **not**, as far as the Commission release and secondary sources show, change GPAI obligations. It postponed the high-risk dates to 2027-12-02 and 2028-08-02.
   - The Code of Practice is voluntary and gives no presumption of conformity. Signatories include Anthropic, OpenAI, Google, Microsoft, Amazon and Mistral. xAI signed the safety chapter only. Meta declined (secondary source).
2. **§2 item 5: "Licensed data … becomes a compliance input."** Art. 53 requires disclosure and a copyright policy, **not licensing**. Label this as an inference about demand.
3. **§7 moat 4: "Provenance dossiers that satisfy EU AI Act Art. 53".**
   - Change "satisfy" to "**support**". The provider stays responsible.
   - Annex IV is high-risk technical documentation, a different regime from GPAI. Its Annex III trigger moved to 2027-12-02, which affects the timing of demand for Rippner's Annex IV product (§11 of MOONSHOT).
4. **§2 Bartz: "That is the price of 'scrape first, license never'."** The 2025-06-23 ruling held that **training on lawfully acquired books was fair use**. The liability exposure came from **downloading pirated copies** to build a library.
   - Correct to: "the price of acquiring pirated copies".
   - Final approval on 2026-07-20 is confirmed, but **appeals were filed** and payouts are pending.
   - Add *Thomson Reuters v. Ross*: the **Third Circuit affirmed on 2026-09-29**, the first appellate AI-training ruling, which held no fair use for a non-generative tool.
   - Add Kadrey's market-dilution theory.
5. **§4.6 T6 and the §12 MNPI row: "MNPI category ban".**
   - Under the misappropriation theory, liability attaches to *any* confidential information obtained in breach of a duty. A topic ban cannot catch that.
   - Being paid satisfies Dirks's personal-benefit element.
   - Shadow trading extends exposure to peer issuers.
   - EU MAR and MiCA have no personal-benefit element and use a "knows or ought to know" standard.
   - Expert-network employees were themselves charged in the PGR cases.
   - Replace with the R1–R4 control set. Note the design tension: buyers' §204A compliance teams need to read what was bought.
6. **§12 row "Export controls on model weights" is stale and incomplete.**
   - (a) Status: BIS has not enforced 4E091 since May 2025, but the text is still in the EAR per the eCFR. No rescission notice or replacement rule had been published as of 2026-11-11.
   - (b) "Weights-in-vault (no transfer)" does not by itself avoid the EAR. The §734.18 encryption carve-out does not cover decryption in a foreign enclave, so where the room sits matters.
   - (c) **Missing: export controls on exploits** (intrusion software, ACE). That is a High risk for the exploit vertical.
7. **§12 "securities status of truth-contingent tails".**
   - The main exposure is the **CFTC swap and event-contract regime and state gaming law**: the 2026 circuit split, plus the CFTC's 2026 ANPRM and NPRM.
   - Securities law applies only if the contingency is security-based.
   - Re-label the row and the mitigation (R15).
8. **§12 is missing several regimes:**
   - the **EU DGA**: separate legal entity and no other use of data. This conflicts with moat 2, the "appraisal corpus", which needs redesign for the EU;
   - the **DOJ DSP**: encrypted or pseudonymised data still counts, and licensing access counts as brokerage;
   - **money transmission** (FinCEN 2019; DOJ §1960 posture);
   - **OFAC**;
   - **MiCA CASP** (grandfathering ended 2026-07-01) and MiCA market abuse;
   - the **EU CRA** for exploits.
9. **§2 item 4 and §4.6 T7: Confidential Intents "hides who bought what".**
   - Keep this as privacy *from the public*.
   - Marginal must still know and screen buyers for OFAC, the DSP and MNPI controls.
   - Marginal should not itself operate an anonymizing *service*. FinCEN 2019 §4.5.1(a) treats such providers as money transmitters.
10. **§12 "Stolen data / copyright / GDPR" row.**
    - Add the SRB transparency point: sellers must have told data subjects about recipients when they collected the data.
    - Add EDPB 28/2024: buyers of weights must check lawful development, and models are anonymous only if extraction is "insignificant".
    - Add the GDPR role allocation, which is untested for TEE exchanges.

---

## 12. Log of queries and fetches (2026-11-11)

**WebSearch** (mode in brackets):
1. European Commission template public summary training content general-purpose AI models published July 2025 [standard]
2. Digital Omnibus AI Act general-purpose AI obligations delay agreement Parliament Council 2026 [extended]
3. SEC v. Panuwat Ninth Circuit appeal decision shadow trading [extended]
4. BIS AI diffusion rule rescission replacement rule model weights export controls 2026 [extended]
5. Panuwat Ninth Circuit opinion affirmed OR reversed 2026 insider trading Medivation Incyte [extended]
6. SEC charges Primary Global Research expert network consultants insider trading press release 2011 [standard]
7. General-Purpose AI Code of Practice signatories list European Commission [standard]
8. bis.gov press release … rescission of Biden-era Artificial Intelligence Diffusion Rule May 13 2025 [standard]
9. DOJ Data Security Program 28 CFR Part 202 effective April 8 2025 October 6 2025 data brokerage … [standard]
10. CJEU C-413/23 P EDPS v SRB judgment 4 September 2025 pseudonymised data personal data recipient [standard]
11. Council adopts AI Act simplification digital omnibus regulation published Official Journal 2026 … [extended; EU domains only]
12. Thomson Reuters v. Ross Intelligence Third Circuit interlocutory appeal fair use decision 2026 [extended]
13. Bartz v. Anthropic $1.5 billion settlement final approval granted date [standard]
14. CFTC event contracts 2026 rulemaking sports prediction markets Kalshi state litigation appeals court ruling [extended]
15. "Panuwat" Ninth Circuit ruling shadow trading 2026 [extended]
16. Digital Omnibus data governance act data intermediation services repeal Data Act Council general approach October 2026 … [extended]
17. Digital Omnibus proposal COM(2025) 837 data intermediation … personal data definition Article 4(1) … [standard]
18. DOJ non-custodial software developers 18 U.S.C. 1960 … Galeotti Roman Storm verdict FinCEN 2019 guidance [extended]
19. CFTC event contracts proposed rule OR withdrawal OR staff advisory 2026 prediction markets [extended; cftc.gov and federalregister.gov]
20. SEC Division of Examinations risk alert investment adviser MNPI compliance issues alternative data expert networks April 2022 [standard]
21. BIS interim final rule October 2021 intrusion software License Exception ACE … Wassenaar [standard]
22. Kadrey v. Meta June 25 2025 Chhabria summary judgment fair use market dilution order [standard]
23. Digital Omnibus Data Act amendments data intermediation services … DGA repeal what changes [standard]
24. "Investment Adviser MNPI Compliance Issues" risk alert sec.gov [standard; sec.gov]
25. expert network compliance best practices consultant attestation restricted list chaperoned calls transcript review MNPI hedge funds [standard]

**WebFetch:**
1. eCFR search API for "4E091": OK
2. Federal Register API, BIS documents matching "artificial intelligence" since 2025-05-01: OK (3 results)
3. CourtListener API, Panuwat: 401
4. Commission GPAI Code signatory page: OK
5. Federal Register HTML 2026-14132: captcha redirect
6. CourtListener HTML search: 403
7. Federal Register API 2026-14132.json: OK
8. DOJ NSD data-security page: OK
9. CJEU press release 107/25 PDF: unreadable binary (I used the judgment text instead)
10. Akin Gump Panuwat alert: 403
11. eCFR versioner 28 CFR Part 202: OK (first 100k characters)
12. Federal Register API 2024-31486.json: OK
13. Commission GPAI Q&A: OK
14. EUR-Lex eli 2026/1744: empty
15. Council press release 2026-10-21: 403
16. EUR-Lex HTML OJ:L_202601744: empty
17. EUR-Lex HTML CELEX 32022R0868: empty
18. EDPB Opinion 28/2024 page: OK (metadata only)
19. Commission IP/26/1024 PDF: binary, extracted locally with PDFKit
20. Parliament OEIL procedure file 2025/0359(COD): OK
21. FinCEN FIN-2019-G001 PDF: binary, extracted locally
22. eCFR versioner 15 CFR 740.22: OK
23. EDPB Opinion 28/2024 PDF: binary, extracted locally
24. White & Case Digital Omnibus memo: 403
25. MediaLaws data-omnibus article: OK

**Direct downloads (curl, read locally):**
- Publications Office: DGA 32022R0868 (OK); CJEU 62023CJ0413 (OK); MiCA 32023R1114 (OK); DSM 32019L0790 (OK).
- Publications Office, not available (404), including content-negotiation and ELI retries: AI Act 32024R1689; Reg. 2026/1744; Data Act 32023R2854; MAR 32014R0596; CRA 32024R2847; AMLR 32024R1624.
- Salman opinion PDF (supremecourt.gov): OK.
- Van Loon opinion PDF (ca5.uscourts.gov): OK.
- BIS rescission release PDF (media.bis.gov): OK.
- eCFR versioner 15 CFR 734.18: OK.
- LII 7 U.S.C. 1a: OK.
- Federal Register API metadata for 2025-00636, 2021-22774, 2026-05105, 2026-11854, 2024-04573 and 2022-11282: OK.
- HTTP status checks on about 25 citation URLs: all cited non-EUR-Lex URLs returned 200, except sec.gov and Justia (403 to automated clients; the sec.gov URLs come from search results) and an FTC PADFA URL (404, not used).

**Not researched (flag for counsel):** US state money-transmitter laws; the EU AML Regulation anonymity ban and travel rule; the EU dual-use regulation for exploits; trade-secret law (DTSA and the EU Trade Secrets Directive) for "stolen goods"; the CFAA; MiFID II research-payment rules for EU fund buyers; whether Marginal or its sellers could be "investment advisers" (15 U.S.C. 80b-2(a)(11); URL https://www.law.cornell.edu/uscode/text/15/80b-2, not analysed); PADFA (FTC).
