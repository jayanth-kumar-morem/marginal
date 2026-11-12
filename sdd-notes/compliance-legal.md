# Marginal: compliance vendors, retention and counsel brief (SDD OI-8, OI-18)

- **As of:** 2026-11-12.
- **Scope:** SDD §11 OI-8 (KYB/KYC and sanctions vendors; retention policy) and OI-18 (what counsel must opine on). Inputs: SDD §3.9.4, §3.20, §3.22, §9.2–9.3, §11; SPEC §4.13, §8.13; `spec-notes/regulatory.md` (2026-11-11). This file does not repeat what `regulatory.md` settles. It adds vendor facts, retention rules, and what changed in 2025–2026, and turns each legal topic into a precise question for counsel.
- **Not legal advice.** This is vendor and legal research. Where I give a view, it is labelled **Analysis**.
- **Source labels:**
  - **PRIMARY**: statute, regulation, regulator release, court opinion or docket, official list file, or the vendor's own docs and pricing page (for vendor facts).
  - **SECONDARY**: law-firm memo, press, trade or aggregator site.
  - **UNVERIFIED**: a search snippet I could not open, or background knowledge I could not re-read this session.
- **Access notes:**
  - EUR-Lex HTML is reachable with `curl` through the ELI URI (`http://data.europa.eu/eli/reg/<year>/<n>/oj`) or `legal-content/EN/TXT/HTML/?uri=CELEX:<id>`. That route worked for the AMLR, MAR, the Data Act, the GDPR, the Digital Omnibus proposal and three CJEU judgments, so those are read **PRIMARY** here. `regulatory.md` could not read them.
  - eCFR's versioner API works with `--compressed`. The eCFR HTML and congress.gov pages blocked automated fetches. leginfo.ca.gov, fatf-gafi.org, govtrack and senate.gov returned 403.
  - Vendor pricing pages: Sumsub and Veriff were readable. Persona returned 403. Footprint and Middesk returned 404.

---

## 0. Headline findings (new since `regulatory.md`)

1. **The Chainalysis on-chain sanctions oracle is deprecated.** Its last update was 2026-03-18, and Chainalysis says it is "not recommended for new integrations or production sanctions screening" [PRIMARY]. Separately, Chainalysis disclosed a breach on 2026-10-30 that affected credentials for all users [SECONDARY].
2. **The OFAC SDN list has no NEAR address type.**
   - The SDN Advanced XML issued 2026-11-09 defines 20 "Digital Currency Address" feature types: XBT, ETH, TRX, USDT, LTC, XMR, BCH, DASH, ZEC, **SOL**, USDC, DOGE, XVG, XRP, ETC, BTG, BSV, BSC, BNB and ARB [PRIMARY, downloaded].
   - So screening a NEAR account against the SDN list is close to a no-op. NEAR-side protection has to come from screening the *identity* behind the account, plus chain analytics. TRM lists NEAR as "Full" coverage [PRIMARY, vendor].
3. **OFAC recordkeeping is now 10 years.** 31 CFR 501.601 was amended by 89 FR 74832 (2024-09-13), effective March 2025 [PRIMARY text; SECONDARY for dates]. DOJ DSP §202.1101 is also 10 years [PRIMARY]. Screening and payout-approval records should be kept 10 years, not 5.
4. **EU AMLR Art. 77** [PRIMARY, read]:
   - It sets 5 years from the end of the relationship, the occasional transaction, or a refusal.
   - It **requires deletion** of personal data at expiry.
   - Authorities may extend retention by at most 5 more years.
   - It applies from **2027-07-10** (Art. 90).
   - Art. 79 bars CASPs from keeping accounts that allow anonymisation.
5. **CFTC proposal on swaps (2026-10-19).**
   - The CFTC proposed to further define "swap" to expressly include event contracts (91 FR 66022). **Comments close 2026-11-18**, six days from now.
   - On the same date it issued an interim final rule excluding casino-style gambling from "swap" [PRIMARY].
6. **US crypto-perimeter changes in 2026:**
   - The CLARITY Act failed cloture on 2026-09-15 [SECONDARY]. The BRCA (developer safe harbour) is not law.
   - Storm's retrial on the hung counts moved to 2027-04-26, and his Rule 29 motion is pending [SECONDARY].
   - *Lewellen* was dismissed for lack of standing on 2026-03-25 [SECONDARY].
   - FinCEN withdrew its mixing and unhosted-wallet NPRMs on 2026-10-06 [PRIMARY].
   - The GENIUS Act takes effect 2027-01-18 [PRIMARY snippet, SECONDARY].
7. **California's DFAL has required a licence (or a completed application) since 2026-07-01.**
   - Its statutory "control" includes the **"power to execute unilaterally or prevent indefinitely"** a transaction [PRIMARY text via the bill; current code unverified].
   - Marginal's `PayoutApproval` gate is a power to prevent a payout. That gate is also how Marginal would block an SDN's funds. **This is the sharpest new money-transmission question.**
8. **The Digital Omnibus proposal (COM(2025) 837):**
   - It repeals the DGA, makes data intermediation registration voluntary and replaces legal separation with "functional separation".
   - It **deletes Data Act Art. 36** (the smart-contract essential requirements) [PRIMARY, read].
   - Parliament is still "Awaiting committee decision" [PRIMARY, OEIL]. **None of this is law.**
9. **Best legal analogues for the "sealed room" on MNPI:**
   - The information-barrier defences for legal persons: Rule 10b5-1(c)(2), Rule 14e-3(b) and MAR Art. 9(1) [PRIMARY, read].
   - MAR recital 24 presumes *use* from possession [PRIMARY].
10. **GDPR guidance in 2026.**
    - The EDPB adopted draft *anonymisation* guidelines in July 2026. They are entity-relative, follow SRB, and were open for consultation until 2026-10-30. It also adopted *final* blockchain guidelines (02/2025 v2) [PRIMARY].
    - The pseudonymisation guidelines are still v1.0 [SECONDARY].
    - EDPB Recommendations 01/2020 Use Case 6 "does not rule out" future technology that avoids access in the clear [PRIMARY]. TEEs are untested ground.

---

## Part A: OI-8 vendors

### A.1 What the design needs (from SDD §3.20, §3.9.4; SPEC §4.13.1)

| Need | Where | Notes |
|---|---|---|
| KYC (individual) and KYB (entity) with sanctions and PEP screening, for ID1 | Onboarding | Every buyer and seller (AC-56) |
| ID2 institutional attestations | Funds | Registered-adviser status, restricted-list feed, compliance key. Mostly document review, not a vendor product. |
| ID3 enhanced due diligence | Exploit buyers, export-sensitive weights, DSP-flagged datasets | UBO, source of funds, end use, country-of-concern and covered-person checks (28 CFR 202) |
| Ongoing monitoring | Credential expiry and re-screening | List changes can turn a clean identity into a hit |
| Payout-address screening | `set_payout_route`, `release_held` (AC-47) | Routes are NEAR accounts, Intents accounts, and foreign-chain addresses (EVM, Solana and others via Intents withdrawals or Chain Signatures) |
| Credential issuance | Compliance service signs `IdentityCredential`, `NullifierCredential`, `PayoutApproval` | In-house. Vendors supply verification results, not credentials. |
| v2: zk tier proof plus nullifier | Private mode | In-house group-membership proof. Portable vendor credentials are optional inputs. |

### A.2 KYC / KYB vendors

| Vendor | Offering | Public pricing | Free tier or trial | Reusable, portable or zk | Crypto / NEAR relevance | API style | Label |
|---|---|---|---|---|---|---|---|
| **Sumsub** | KYC, AML screening and ongoing monitoring, address verification, Travel Rule; KYB, transaction monitoring and fraud on "Custom" | **Basic $1.35/verification, $149/mo minimum. Compliance $1.85/verification, $299/mo minimum** (adds AML screening and ongoing monitoring). KYB and transaction monitoring: contact sales | **14-day trial, 50 free checks.** Charged only for successful verifications. Card payment only | "Sumsub ID, reusable KYC" in Basic | Crypto-native: Travel Rule; crypto monitoring through 6 analytics providers. Its docs claim 350 chains, but **NEAR is not confirmed** | REST plus Web/Mobile SDK (UNVERIFIED detail) | PRIMARY (pricing page); PRIMARY-vendor docs (snippets) |
| **Persona** | KYC (government ID plus selfie), database checks, KYB, watchlists (product scope beyond IDV is UNVERIFIED this session); "Persona Connect" for reusing verified identity | Pricing page blocked (403). Aggregators: "Essential" from **$250/mo**, 12-month minimum | **Startup program:** "500 free monthly verifications and $1 pricing thereafter", "up to 12 months free". Eligibility applies | **Reusable Personas** (passkey-secured); **Chainlink CCID credential issuer** (2026-05-05), which links "KYC Verified" credentials to wallets | NEAR not found (CCID chain list not checked) | REST plus hosted or embedded flow | PRIMARY-vendor (startup page and blog, via snippets); SECONDARY (aggregators) |
| **Veriff** | IDV; PEP and sanctions add-on; KYB on Enterprise | **Essential $0.80, $49/mo minimum. Plus $1.39, $99/mo minimum. Premium $1.89, $209/mo minimum.** PEP and sanctions **+$0.64**; ongoing monitoring **+$0.09**; 2-year retention **+$0.30** | **15-day trial, 50 live verifications, unlimited sandbox, no card** | Not mentioned | None found | REST plus SDK, hosted page | PRIMARY (pricing page) |
| **Onfido (Entrust)** | IDV, KYC | Not public | — | — | — | — | UNVERIFIED (not researched in depth) |
| **Jumio** | IDV, KYX, AML screening | Not public | — | — | — | — | UNVERIFIED (not researched in depth) |
| **Footprint** | KYC, KYB, PII vault in AWS Nitro Enclaves; passkey-based "one-click" re-use | A *preview* page shows **KYC $0.50/verification** plus PII storage. The production page returned 404 | Unknown | Passkey re-use across Footprint customers (vendor claim) | — | REST plus hosted flow | UNVERIFIED (preview deployment) |
| **Alloy** | Decisioning and orchestration over many data vendors | Not public | — | — | — | — | UNVERIFIED (not researched in depth) |
| **Middesk** | US KYB: Secretary of State filings, TIN match, watchlists | **Not public.** Vendr's buyer median is about **$11,875/yr** (range $10k–$186k) | — | — | — | REST | SECONDARY (Vendr, FitGap) |
| **idOS** (successor to the Fractal Protocol) | Decentralised encrypted storage and access grants for **reusable KYC credentials**. An Issuer SDK turns KYC-provider results into idOS credentials | Not found | — | **Yes:** W3C-style credentials and user-granted access. Does not verify identities itself | **Supports NEAR wallets** (also EVM, XRPL, Stellar). NEAR Foundation is a consortium backer | SDK | PRIMARY-vendor (docs FAQ, via snippet); SECONDARY |
| **Fractal ID** | KYC provider | — | — | The Fractal Protocol was discontinued for idOS. The Fractal Wallet extension was delisted 2025-09-16. Fractal deleted about 900k user records after a 2024 breach | — | — | SECONDARY |
| **Human ID** (Holonym / human.tech) | zk proofs of government ID, phone, and **"Proof of Clean Hands"** (OFAC SDN and PEP check) | Not found | — | **zk-SBT attestations via Sign Protocol** on Optimism, Base and Stellar | **On NEAR, only a uniqueness proof** (an SBT used by nada.bot). No KYC or sanctions attestation on NEAR found | SDK, on-chain attestations | PRIMARY-vendor docs (snippets) |
| **zkMe** | zkKYC | Not found | — | zk credentials; claims 30+ chains | **NEAR not found** | SDK | SECONDARY |
| **Privado ID** (ex-Polygon ID; Billions) | Iden3 / Circom verifiable credentials with zk queries | Open source | Self-host | **Yes** (W3C VCs, zk proofs) | EVM-oriented; NEAR not found | SDK | SECONDARY |
| **Quadrata** | On-chain KYC passport | — | — | Passport NFT | EVM chains | — | UNVERIFIED. A doc page reportedly updated 2026-02 still lists the product. I expected a sunset but found no source for one |

### A.3 Wallet and address screening

| Vendor | Product | NEAR | Solana | Free option | Pricing | Notes | Label |
|---|---|---|---|---|---|---|---|
| **Chainalysis** | Address Screening and KYT (paid). Free Sanctions Screening API (REST, `X-API-Key`). On-chain sanctions oracle | **Not confirmed** for KYT or Address Screening. Address Screening calls itself "network agnostic" | The oracle is EVM-only. The free API's chain coverage is not stated | **Free API:** needs a free key. Probed live on 2026-08-27 [SECONDARY]. **Oracle: deprecated, last update 2026-03-18.** It was on Ethereum, Polygon, BNB, Avalanche, Optimism, Arbitrum, Fantom, Celo, Blast and Base | Paid products: quote. "We do not charge for rescreens" | **Breach disclosed 2026-10-30.** All users had to reset passwords and rotate API keys. Restoration was phased (about 2026-11-06/07) | PRIMARY (oracle docs, product page); SECONDARY (API probe, breach) |
| **TRM Labs** | Wallet Screening API, transaction monitoring, forensics. Free "Sanctions and Beacon Network API" | **Yes, "Full" coverage** across the platform: wallet screening, monitoring, tracing | Yes (TRM coverage page) | **Free:** submit contact details and receive docs and onboarding. Endpoint `POST api.trmlabs.com/public/v1/sanctions/screening` (Basic auth). Rate limits not published. Chain list for the free API not published | Paid: quote | Best documented NEAR support among analytics vendors | PRIMARY (vendor docs and coverage page) |
| **Elliptic** | Lens (wallet screening), Navigator (transactions) | **NEAR Foundation partnership (2022-02)** covered Lens and Navigator screening on NEAR. Current coverage list not confirmed | — | No | Quote | — | PRIMARY-vendor (2022 PR); current status UNVERIFIED |
| **Merkle Science** | KYT, Tracker | **Not found** | — | No | Quote | — | UNVERIFIED |
| **Sumsub Crypto Monitoring** | Routes to 6 analytics providers (Nominis, Cyvers and others) | Per-provider tables. NEAR not confirmed | — | Trial | Custom plan | Lets one vendor contract cover both KYC and address screening | PRIMARY-vendor docs (snippets) |

### A.4 List screening (identities and addresses)

| Source | Content | Formats and access | Update cadence | Licence and cost | NEAR | Label |
|---|---|---|---|---|---|---|
| **OFAC SDN and consolidated lists** (Sanctions List Service) | SDN plus non-SDN lists, including "Digital Currency Address – <SYM>" features | `SDN.CSV` (~5.8 MB) plus `SDN_COMMENTS.CSV`; `SDN_ADVANCED.XML` (~128 MB); legacy flat files; archived **delta files** by year; e-mail notifications. Download base: `sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/` | Published whenever OFAC acts (no fixed schedule). The file read here has DateOfIssue **2026-11-09** | **Free** US-government data | **No NEAR type.** SOL appears 3 times. Counts from the CSV (a lower bound, because remarks are truncated): XBT 533, TRX 271, ETH 122, USDT 94 | PRIMARY (downloaded 2026-11-12) |
| **OpenSanctions** | Aggregated sanctions, PEP and other lists | Bulk data "open for download". Hosted API "billed by the query", "prepaid credit bundles", "sign up with free credits" | Frequent (not checked) | **CC BY-NC 4.0.** Commercial use needs a licence: Screening API (pay per query), flat-rate Screening licence (internal use), or Reseller. No public prices | n/a | PRIMARY (licensing page) |
| **ComplyAdvantage** | Sanctions, PEP and adverse-media screening | Self-serve "Starter" plus Enterprise | — | Starter reported at **$99–$149/mo** depending on source and tier (100–2,000 monitored entities). Enterprise: quote | n/a | SECONDARY (aggregators disagree) |
| **Dow Jones Risk & Compliance** | Sanctions, PEP and adverse-media data | Enterprise | — | Quote | n/a | UNVERIFIED (not researched) |
| EU, UN and UK lists | Needed for EU and UK users | Free | — | Free | n/a | UNVERIFIED this session |

### A.5 Recommended stack

**v1 canary (Analysis):**

1. **KYC, KYB and identity sanctions screening: Sumsub on the Compliance plan, plus a KYB add-on.**
   - Why: published per-check prices; KYC, KYB, AML screening, ongoing monitoring and Travel Rule in one contract; crypto-native; reusable KYC available.
   - Fallback: **Persona** if the startup program applies (500 free per month) or if the team wants Chainlink CCID interop later.
   - Add **Middesk** only if US entity volume justifies a quote-based contract.
   - Avoid building on Fractal ID (wound down) or Quadrata (status unclear).
2. **Address screening: TRM.**
   - Paid Wallet Screening covers NEAR accounts and foreign-chain payout addresses. TRM is the only analytics vendor that documents NEAR coverage.
   - Run the free TRM sanctions API **and** the compliance service's own OFAC SDN ingestion as an independent second check.
   - **Do not use the Chainalysis oracle.** Hold off on Chainalysis products until its breach remediation is clear.
3. **Independent list check (always on):**
   - Ingest `SDN_ADVANCED.XML` (or `SDN.CSV` plus comments) nightly, and also on OFAC "recent actions".
   - Hash the file and record its DateOfIssue.
   - Put `{list_id, issue_date, sha256}` into every `PayoutApproval` and screening record.
   - Add the EU consolidated list for EU users.
4. **Portable or zk credentials:** keep issuing Marginal's own credentials and nullifiers (§3.20). For v2, *accept* idOS credentials (NEAR wallets supported) or Persona CCID credentials as **inputs** to ID1 issuance, with reliance terms agreed with the issuing provider. Never treat them as a substitute for Marginal's own screening record. Human ID gives only uniqueness on NEAR, which could help Sybil control but not KYC.
5. **Data minimisation with vendors:**
   - Send vendors only what each check needs.
   - Set vendor-side retention to the minimum. Veriff sells *extended* 2-year retention, so its default is shorter.
   - Pull the decision and key fields into the compliance database under a DPA.
   - The Chainalysis breach shows vendor-held data is part of the attack surface (§9.3 table).

**Hackathon demo (HDP), free:**

- **Identity:** keep the allow-list and the `demo` issuer key (SDD §1.5). Optional real-vendor flow: Sumsub's 14-day/50-check trial or Veriff's 15-day/50-check trial with unlimited sandbox. Both need a company signup, which is the team's decision. I did not sign up.
- **Sanctions:** build the "static list" from the **real OFAC SDN file**. It is free, public and has an issue date.
  - Extract the digital-currency addresses and demo a *blocked foreign-chain payout*: an `IntentsWithdraw` or `ChainSig` destination that is a listed ETH, TRX or SOL address. That is honest, because SDN entries exist for those chains.
  - For NEAR accounts, demo identity-based screening, because the list has no NEAR addresses.
  - Optionally call the free TRM sanctions API (needs contact-form onboarding).
- **Avoid OpenSanctions bulk data in the demo** unless the use is clearly non-commercial. A company's product demo is probably commercial use under CC BY-NC (Analysis). Use OFAC directly.

### A.6 Integration notes for the SDD

- Add to `PayoutApproval`: `list_version_hash`, `screen_id`, `vendor_id` (all off-chain), and an `outcome` enum `{clear, review, blocked}`. Only `clear` produces a signed approval.
- Re-screen at `set_payout_route` **and** at `release_held` if the approval is older than one list update. Keep approval expiry short (hours).
- **True sanctions hit:**
  - OFAC requires holders of blocked property to block it and report it (31 CFR 501.603) [PRIMARY].
  - Clearing needs a **`Blocked`** payout state. Funds must not be refunded or released while in it.
  - Add a reporting workflow in the compliance service.
  - This interacts with the "control" questions in C.1.

---

## Part B: retention (OI-8)

### B.1 Legal anchors

| Regime | Rule | Period | Applies to Marginal? | Label |
|---|---|---|---|---|
| US BSA | 31 CFR 1010.430(d): "All records that are required to be retained by this chapter shall be retained for a period of five years"; records must be accessible "within a reasonable period of time" | **5 years** | Only if Marginal is a financial institution (for example an MSB/money transmitter). Open: see C.1 | PRIMARY (eCFR, read) |
| OFAC | 31 CFR 501.601: records "available for examination for **at least 10 years** after the date of such transaction". Blocked property: the blocking period plus at least 10 years after unblocking. Amended by 89 FR 74832 (2024-09-13); the final rule took effect 2025-03-21. The change tracks the 10-year IEEPA/TWEA limitations period (April 2024) | **10 years** | **Yes** for a US person engaging in transactions subject to OFAC regulations. Applies to screening and payout records | PRIMARY (eCFR text); SECONDARY (dates: GT Law, Foley Hoag) |
| OFAC reporting | 31 CFR 501.603: holders of blocked property must report | — | Yes, on a hit | PRIMARY (eCFR, read; reporting deadline not re-read) |
| DOJ DSP | 28 CFR 202.1101(a): "at least 10 years after the date of such transaction". (b) Restricted transactions also need policies, audits, due-diligence records, agreements and annual certifications | **10 years** | DSP-flagged goods (AC-57) | PRIMARY (eCFR, read) |
| FATF R.11 | Transaction records and CDD records for "at least five years", after the business relationship ends or the occasional transaction | **5 years** (standard) | Indirectly, through national law | UNVERIFIED wording (FATF site returned 403); SECONDARY |
| EU AMLR (Reg. (EU) 2024/1624) | Art. 77(1): CDD copies, suspicion assessments, transaction records, **unredacted**. Art. 77(3): "5 years commencing on the date of the termination of the business relationship …"; "obliged entities **shall delete** personal data upon expiry of the five-year period". Authorities may require more, "shall not exceed 5 years". Art. 90: applies from **2027-07-10** (2029-07-10 for points (3)(n)–(o)) | **5 years** (+≤5) | Only if Marginal (or its EU entity) is an obliged entity, for example a CASP | PRIMARY (EUR-Lex, read) |
| EU AMLR Art. 79 | CASPs may not keep "anonymous crypto-asset accounts" or "any account otherwise allowing for the anonymisation … including through anonymity-enhancing coins" | — | If Marginal is a CASP (relevant to v2 private mode) | PRIMARY (read) |
| GDPR | Art. 5(1)(e): kept "for no longer than is necessary". Art. 17(3)(b) and (e): the legal-obligation and legal-claims exceptions to erasure | Purpose-bound | Yes, for EU data subjects | PRIMARY (5(1)(e) read; Art. 17 not re-read) |
| Buyer-side records | Advisers Act Rule 204-2 (5 years); MiFID II (5–7 years) | Buyer's own duty | Buyers keep their own copies through the audit export | UNVERIFIED this session |
| Limitation periods (for sizing review-log retention) | SEC disgorgement: 10 years for scienter-based violations (NDAA FY2021). IEEPA: 10 years | — | Context | UNVERIFIED (SEC); SECONDARY (IEEPA, via OFAC rule commentary) |

**Two conflicts to resolve with counsel (Analysis):**

1. **The US 10-year rule versus the EU 5-year mandatory deletion.** If Marginal's EU entity becomes an AMLR obliged entity, Art. 77(3) requires deletion at 5 years "without prejudice to retention periods for data collected for the purposes of other Union legal acts or national law complying with" the GDPR. US OFAC law is neither. Keeping an EU person's identity record for 10 years would need its own GDPR basis: legitimate interest, or Art. 17(3)(e) legal claims for a US-person group entity. Option: keep only a **minimal sanctions-evidence record** (name, date of birth or incorporation, country, list version, result, hash of documents) for years 6–10, and delete document images at 5 years.
2. **If Marginal is *not* an obliged entity anywhere** (the non-custodial thesis), AML retention periods are not legal obligations for it. They become contractual (for example with a licensed partner) or risk-based, and the GDPR basis is legitimate interest, not legal obligation. The retention schedule should not cite the BSA or AMLR as the legal basis unless counsel confirms they apply.

### B.2 Recommended retention per data class

Implement in `retention_jobs` with three mechanisms: object-lock retention on `certs/` and `joblogs/`; **crypto-shredding** (destroy per-period keys) for encrypted records and for on-chain pseudonyms; and a **legal-hold** flag that overrides any deletion.

| Data class (SDD store) | Content | Retention (default) | Clock starts | Deletion method | Basis (Analysis) |
|---|---|---|---|---|---|
| **Identity records**: `identities`, vendor results | KYC/KYB documents, selfies, extracted fields, UBO, vendor decision | **Full record: 5 years.** **Minimal sanctions-evidence record: 10 years** | End of relationship (account closed, or 24 months without activity) | Delete images and documents at 5 years. At 10 years, crypto-shred the minimal record | FATF R.11 / BSA / AMLR (5 years); OFAC (10 years) for transaction-linked evidence |
| **Credential issuance logs**: `credentials_issued` | subject account, identity_id, tier, flags, issuer key, expiry, screening reference | **10 years** | Credential expiry | Delete. Use per-year signing-log keys | Proves who was screened, and when, for each transaction (OFAC, DSP) |
| **Nullifier map**: `nullifier_map` and key `k_nf` | `(listing_id, epoch, nullifier) → identity_id` | **10 years** | End of the epoch's last job | **Rotate `k_nf` per epoch-year and crypto-shred.** On-chain nullifiers then become unlinkable to anyone | AC-56 needs job-to-identity resolution for the transaction-record period |
| **Screening results**: `screening_results`, `payout_approvals` | Identity and address screens, list version hash, vendor ID, outcome, reviewer | **10 years**. **Blocked:** while blocked plus 10 years | Transaction date (`release_held` or refund) | Delete | 31 CFR 501.601 |
| **Review logs**: `review_log` | MNPI review path (`ConsentReview`, reviewer key, decision, `resolve_held`), escalations, restricted-list hits | **10 years** (at least 5) | Decision date | Delete. Content stays sealed; the log holds metadata and hashes | Insider-trading limitation periods (UNVERIFIED); buyer §204A needs |
| **Job logs**: `joblogs/{job_id}.enc` (object lock) | Signed room logs, encrypted | **5 years**; **10 years** if the job involved a DSP-flagged good, a sanctions event or a dispute | Job terminal state | Object-lock expiry, then delete | Transaction evidence; minimisation for the rest |
| **Certificates**: `certs/` (object lock) plus on-chain anchors | Settlement and forget certificates (hashes, signatures) | **10 years** off-chain. On-chain anchors are permanent | Certificate date | Object-lock expiry | They are the transaction record. **They must contain no personal data or unsalted identifiers** (EDPB blockchain guidelines 02/2025, final July 2026) |
| **Restricted-list snapshots** (buyer-sealed) | Issuer and ticker lists | Per buyer instruction. Marginal keeps only metadata (hash, time) for **5 years** | Upload | Delete the blob on instruction | Buyer controls; metadata proves which list applied |
| Seller attestations | Signed statements; hash in `dossier_hash` | **10 years** after listing archive | `Archived` | Delete the blob; the hash stays on-chain | Evidence in MNPI and IP disputes |
| Audit exports | Assembled bundles | Not stored (re-generable) | — | — | — |

**SDD design note (Analysis).** `IdentityCredential.identity_hash` is a "salted internal id". If any credential or its hash lands on-chain, it is pseudonymous personal data for Marginal and cannot be erased. Either keep `identity_hash` strictly off-chain, or derive it with a per-period key that is crypto-shredded on the same schedule as `k_nf`.

---

## Part C: counsel brief (OI-18)

Format for each topic: **Questions for counsel** (precise) → **Current best evidence** (what changed in 2025–2026 marked ★) → **Our design's position** → **Risk** → **SDD action**.

### C.1 Money transmission, custody and CASP status

**Questions for counsel**

1. **BSA / FinCEN.** Under 31 CFR 1010.100(ff)(5) and FIN-2019-G001 §§4.2.2 and 4.4, is Marginal (the operator) a money transmitter when all of these hold?
   - (a) It deploys and governs, through a time-locked upgrade, a NEAR contract that holds buyer stablecoin and releases it by rule.
   - (b) Its compliance key can **withhold** (never redirect) a payout by not issuing a `PayoutApproval`.
   - (c) It runs the gateway, relayer and rooms.
   Does a withhold-only key amount to "total independent control over the value"?
2. **State law, California DFAL first.** Is the `PayoutApproval` gate "control" under Cal. Fin. Code §3102 ("power to execute unilaterally **or prevent indefinitely** a digital financial asset transaction")? If so, would any of these avoid it?
   - (i) A **time-bounded** hold that defaults to seller release or buyer refund.
   - (ii) Delegating screening and blocking to a licensed partner, or to the stablecoin issuer's freeze power.
   - (iii) Licensing.
   Do MTMA states (31+) or NY treat it the same way?
3. **The OFAC versus "control" conflict.** OFAC requires holders of blocked property to block and report it (501.603). Can a non-custodial design satisfy OFAC without the "prevent indefinitely" power that state law treats as control? Who is the "holder" of blocked funds in a contract?
4. **18 U.S.C. §1960.** What is officer and developer exposure given the Storm §1960 conviction (2025-08-06), the pending Rule 29 motion and retrial (2027-04-26), DOJ's April 2025 memo and the August 2025 statement on "truly decentralized" software, and the absence of any BRCA safe harbour?
5. ***Van Loon*.** Van Loon held that *immutable* Tornado Cash contracts are not "property" under IEEPA. Clearing is **upgradeable**. Should clearing be immutable per version, like KeyPolicy, with user-opt-in migration? Does that change the FinCEN or state analysis?
6. **MiCA.** For EU users:
   - Is Marginal providing "custody and administration … on behalf of clients" (Art. 3(1)(17): "safekeeping or **controlling** … crypto-assets or … the means of access") or "transfer services" (Art. 3(1)(26)) when its compliance approval conditions release?
   - Is the arrangement "fully decentralised" (recital 22)?
   - Must EU flows go through an authorised CASP now that the transition ended (2026-07-01)?
   - Does AMLR Art. 79 later constrain private mode?
7. **GENIUS Act.** Which settlement stablecoins remain usable once the DASP restrictions apply (from 2028-07-18 under Treasury's proposal)? Is Marginal a "digital asset service provider"? (OI-12.)

**Current best evidence**

- **Definition** [PRIMARY]: money transmission is "the acceptance of currency, funds, or other value that substitutes for currency from one person and the transmission … to another location or person by any means" (31 CFR 1010.100(ff)(5)(i)(A)). "Facts and circumstances" govern, and there are payment-processor and other limits ((ff)(5)(ii)).
- **FIN-2019-G001:**
  - Multisig co-signers lacking "total independent control" are not transmitters (§4.2.2).
  - The definition can apply to "the DApp, the owners/operators of the DApp, or both" (§4.4).
  - Anonymizing *service* providers are transmitters (§4.5.1(a)).
  - Escrow is not addressed by name.
  - [PRIMARY, from `regulatory.md`]
- ★ **FinCEN withdrew** both the 2020 unhosted-wallet NPRM (91 FR 63514) and the 2023 CVC-mixing §311 proposal (91 FR 63513) on **2026-10-06** [PRIMARY]. No new DeFi rule was found.
- ***Van Loon v. Treasury*** (5th Cir., 2024-11-26): immutable smart contracts are "not 'property'" [PRIMARY, from `regulatory.md`].
- ★ **Storm:**
  - Convicted 2025-08-06 on the §1960 conspiracy count; the jury hung on the others [SECONDARY].
  - Prosecutors sought an October 2026 retrial. Judge Failla **moved it to 2027-04-26** because of the pending Rule 29 motion [SECONDARY: The Block 2026-08-26, crypto.news].
  - No Rule 29 ruling or sentencing found.
- ★ **DOJ posture:** the April 2025 memo narrowed §1960 prosecutions. The August 2025 statement said no new §1960(b)(1)(C) charges against "truly decentralized" software developers [SECONDARY, from `regulatory.md`]. This is policy, not law.
- ★ ***Lewellen v. Bondi*** (N.D. Tex.): dismissed **without prejudice for lack of standing** on 2026-03-25, with no ruling on the merits [SECONDARY: Baker McKenzie, The Block].
- ★ **BRCA:**
  - S.3611 was introduced 2026-01-12 (Lummis–Wyden) and referred to Senate Banking [SECONDARY: GovTrack text]. H.R.3533 was introduced 2025-05-21 [congress.gov URL; 403].
  - It would stop non-controlling developers and providers being treated as money transmitters.
  - It was reportedly folded into CLARITY as §604 [SECONDARY].
- ★ **CLARITY (market structure):**
  - The House passed it in July 2025. Senate Banking advanced its own text in May 2026.
  - **Senate cloture failed 2026-09-15** (49–50 per one tracker) [SECONDARY: DLA Piper, DeFi Rate].
  - Bills not enacted by January 2027 must be reintroduced. **There is no federal developer safe harbour.**
- ★ **GENIUS Act:**
  - Enacted 2025-07-18. It takes effect **2027-01-18**: the OCC final rule (bulletin 2026-50) and Treasury's interim final rule say so [PRIMARY via snippet; SECONDARY].
  - Treasury NPRM on issuance, offer and sale: 2026-08-18 (FR 2026-16796) [PRIMARY URL].
  - FinCEN/OFAC NPRM on PPSI AML and sanctions programmes: 2026-04-10 (FR 2026-06963) [PRIMARY URL].
  - DASPs may offer only stablecoins from permitted or qualifying issuers from **2028-07-18** (per the proposal) [SECONDARY: Jones Day].
  - One commenter reads the DASP definition as excluding protocols, self-custody interfaces and validators [SECONDARY].
- ★ **California DFAL:**
  - Covered activity has needed a licence, or a *completed* application, since **2026-07-01**. Applications opened 2026-03-09; the fee is $7,500 [SECONDARY: Goodwin, Jenner].
  - **"Control" means "power to execute unilaterally or prevent indefinitely a digital financial asset transaction"** (AB 39 as chaptered) [PRIMARY bill text via snippet; current code UNVERIFIED (leginfo 403)].
- **MTMA:** enacted in full or in part in 31 states (CSBS, 2026-09-03), or 35 per another summary [SECONDARY].
- **MiCA** [PRIMARY, read]:
  - Art. 3(1)(16) lists the services, including (a) custody and (j) transfer.
  - Art. 3(1)(17): custody = "safekeeping or controlling, on behalf of clients, of crypto-assets or of the means of access to such crypto-assets".
  - Art. 3(1)(26): transfer = "providing services of transfer, on behalf of a natural or legal person, of crypto-assets from one distributed ledger address or account to another".
  - Recital 22: in scope "including when part of such activities or services is performed in a decentralised manner". Out of scope "where crypto-asset services are provided in a fully decentralised manner without any intermediary".
  - The transition ended 2026-07-01.
  - EBA/ESMA's Art. 142 joint report on DeFi came out in January 2025. No final Commission DeFi regime was found. A 2026 MiCA review consultation asks about the DeFi perimeter [SECONDARY].

**Our design's position**

- No Marginal key can move escrow except through settlement rules (AC-60). Refunds work through a pause.
- Payouts need a compliance `PayoutApproval`, which is a withhold-only power.
- Clearing is upgradeable behind a time-lock.
- Fiat ramps go through partners. Users deal with Intents solvers directly.

**Risk: HIGH** for US state licensing. The withhold power looks like "prevent indefinitely". **Medium–high** for federal (§1960 posture is policy-dependent). **Medium** for MiCA (custody "controlling … means of access" versus a withhold-only key).

**SDD action:** add a `Blocked` payout state and an OFAC report workflow. Model the alternatives counsel will ask about:

- a bounded hold;
- a partner or issuer freeze;
- immutable clearing per version.

Record the decision as a design rule.

### C.2 GDPR roles for TEE-based appraisal

**Questions for counsel**

1. For each step, who is controller, joint controller or processor? The steps are: seller upload and vault storage; key release by KeyPolicy; room decryption and appraisal (Marginal's code, on Marginal's or an operator's TEE); verdict and price output; the MNPI review path; delivery; the buyer's sealed context. Is Marginal a processor for the seller (vault and appraisal) **and** for the buyer (context), or a joint controller, given it **designs the appraiser** and decides what metadata it keeps?
2. Is seller ciphertext in Marginal's blob store personal data *for Marginal*, under the relative test in C-413/23 P SRB? KeyPolicy releases keys only to attested rooms that run Marginal-approved code. Does Marginal "have the means" of re-identification because its approved code decrypts?
3. Does in-enclave plaintext processing by a third-country room operator count as a Chapter V transfer? Can attestation plus KeyPolicy (keys released only to EEA-pinned rooms, or rooms of the seller's choosing) work as a supplementary measure, given EDPB Use Case 6?
4. How are Art. 28(3) duties met when processing is sealed: documented instructions, audits under (h), sub-processor approval of room operators (EDPB Opinion 22/2024)?
5. Is the on-chain nullifier (HMAC of identity, listing and epoch) personal data for the public or for Marginal? Is crypto-shredding `k_nf` an adequate "erasure" for chain data (EDPB blockchain guidelines 02/2025, final)?

**Current best evidence**

- **Statute** [PRIMARY, read]:
  - Art. 4(2): "processing" means "any operation … performed on personal data …, such as collection, recording, … **storage**, … retrieval, consultation, use, disclosure by transmission …".
  - Art. 4(5): pseudonymisation requires that the "additional information is kept separately".
  - **Analysis:** storing or computing on encrypted personal data is processing by whoever performs it, *if* the data is personal for that entity. Under SRB that is assessed relative to the entity. Inside a room, Marginal's software decrypts and uses plaintext, so the processing happens even though no Marginal employee sees it.
- **Joint control without access** [PRIMARY, read]:
  - *Wirtschaftsakademie* (C-210/16, 2018-06-05) para 38: the law does not "require each of them to have access to the personal data concerned".
  - **C-683/21 (Grand Chamber, 2023-12-05):** an entity that "participated in the determination of the purposes and means" may be a controller "even if that entity has not itself performed any processing operations". Joint control does not need an arrangement between the parties. Testing on personal data is processing unless the data is anonymous or fictitious.
  - *Fashion ID* (C-40/17, 2019-07-29): joint control is "limited to the operation or set of operations … in respect of which it actually determines the purposes and means".
- **Relative identifiability:** *EDPS v SRB* (C-413/23 P, 2025-09-04) [PRIMARY, from `regulatory.md`].
  - ★ The **EDPB draft anonymisation guidelines** (adopted July 2026; consultation to 2026-10-30) adopt an entity-dependent "reasonably likely" test, with a contextual and a simplified approach. The criteria are no record isolation, no linkage and no inference. They take SRB into account [PRIMARY: EDPB news, 2026-07-08].
  - The EDPB's pseudonymisation guidelines 01/2025 are still v1.0 (consultation version), which says pseudonymised data remain personal data [SECONDARY].
- **Transfers:** EDPB Recommendations 01/2020 v2.0 [PRIMARY, read].
  - Use Case 1: encrypted storage with "keys … retained solely under the control of the data exporter" is an effective measure.
  - Use Case 6: where a processor "needs access to the data in the clear", the EDPB is "incapable of envisioning an effective technical measure", but "does not rule out that further technological development may offer measures … without requiring access in the clear".
  - **Analysis:** attested TEEs are the obvious candidate. No regulator has endorsed them yet.
- ★ **EDPS TechSonar 2025–2026** covers confidential computing. It frames TEEs as shifting trust from operators to hardware [SECONDARY, snippet; page 403].
- **Processor chains:** EDPB Opinion 22/2024 (October 2024). Controllers should know every processor and sub-processor. Processors should proactively disclose the chain [SECONDARY summaries].
- ★ **Digital Omnibus (GDPR part):**
  - It would codify the entity-relative definition of personal data.
  - The Council mandate was agreed 2026-10-21 [PRIMARY title; from `regulatory.md`].
  - **Parliament has no position.** OEIL shows "Awaiting committee decision", a draft report of 2026-06-22 and amendments of 2026-07-27 [PRIMARY].
  - **Not law.**

**Our design's position:** the seller is controller. Marginal aims to be processor (Art. 28), with joint-controller terms as fallback (SPEC §4.13.3).

**Risk: HIGH.** Joint control is plausible because Marginal designs the appraiser; this is the C-683/21 pattern. The transfer analysis for foreign rooms is untested.

**SDD action:**

- Pin EU-personal-data listings to EEA rooms (or seller-chosen jurisdictions) through KeyPolicy.
- Keep the "appraisal corpus" to transaction metadata.
- Document per-step roles in a processing register.
- Make sure certificates and anchors contain no personal data.

### C.3 EU Data Governance Act scope and the Digital Omnibus

**Questions for counsel**

1. Is Marginal (datasets and evals; also knowledge goods) a "data intermediation service" under DGA Art. 2(11) and Art. 10(a)? Recital 28 names "data marketplaces". Does the Art. 2(11)(b) exclusion for "intermediation of copyright-protected content" take the memo vertical out?
2. If in scope before the Omnibus applies, what is the minimum compliant structure? Art. 11 notification; Art. 12(a) separate legal person and no other use; Art. 12(c) metadata use limits.
3. If the Omnibus passes as proposed (voluntary regime, functional separation), is it worth registering voluntarily?
4. Data Act Art. 36 (in force now): is Marginal "the vendor of an application using smart contracts" or a person deploying them "for others in the context of executing an agreement … to make data available"? If so, do the governance pause plus KeyPolicy pause flags meet "safe termination and interruption", and must Marginal issue an **EU declaration of conformity**?

**Current best evidence**

- **DGA:** applies now. Art. 2(11), recital 28 and Art. 12 [PRIMARY, from `regulatory.md`].
- ★ **Data Act Art. 36(1)** [PRIMARY, read]:
  - (a) robustness and access control;
  - (b) "safe termination and interruption … a mechanism exists to terminate the continued execution of transactions and … internal functions which can reset or instruct the contract to stop or interrupt";
  - (c) data archiving and continuity;
  - (d) access control "at the governance and smart contract layers";
  - (e) consistency with the agreement.
  - Art. 36(2): conformity assessment and an **EU declaration of conformity**.
- ★ **Digital Omnibus COM(2025) 837 (2025-11-19)** [PRIMARY, read]:
  - Its title includes "repealing Regulations … (EU) 2022/868". DGA provisions move into the Data Act.
  - "The regime for data intermediation services providers shall be turned into a voluntary regime."
  - Legal separation is replaced by "a functional separation while keeping certain safeguards".
  - **"Article 36 is deleted"** (recital 16 cites "substantial compliance ambiguities").
- ★ **Status:**
  - Council mandate 2026-10-21 [PRIMARY title].
  - Parliament (2025/0360(COD), ITRE and LIBE jointly): **"Awaiting committee decision."** Draft report 2026-06-22; amendments 2026-07-27. No committee or plenary vote and no trilogue listed [PRIMARY: OEIL, 2026-11-12].
  - **The DGA and Data Act Art. 36 apply as written today.** No source gives an adoption date. Adoption before mid-2027 looks unlikely (Analysis).

**Our design's position:**

- In the EU, the "appraisal corpus" is limited to transaction metadata (SPEC §4.13.4).
- Pause stops new activity, never refunds. KeyPolicy honours pause flags but is immutable.

**Risk: MEDIUM.** Notification and entity structure are manageable. Art. 36 conformity for an "immutable, no admin key" contract is the awkward part, and it may be deleted.

**SDD action:**

- Map AC-60 and the pause path to Art. 36(1)(a)–(e) in a conformity file.
- Keep a separate EU entity in the corporate plan.
- Watch the Omnibus trilogue.

### C.4 Export controls: decrypt-in-enclave, model weights, exploits

**Questions for counsel**

1. Suppose a US seller's weights (or technology) are sent encrypted to an attested enclave in country X, where KeyPolicy releases the key and the weights are decrypted and executed with no human access. Is that an **export to X** under 15 CFR 734.13(a)(1)? Or is it within §734.18(a)(5)?
   - §734.18(b) requires that data be "not in unencrypted form between an originator … and an intended recipient (or the recipient's in-country security boundary)" and that "the means of decryption are not provided to any third party".
   - Is the enclave the "intended recipient"? Is the room operator a "third party"?
2. Is there a **"release"** when no person can inspect the plaintext? §734.15(a) requires "visual or other inspection by a foreign person" or "oral or written exchanges".
3. Who is the **exporter**: seller, Marginal (room operator) or buyer? Do BIS's cloud advisory opinions (2009 and later) extend to Marginal operating rooms?
4. How should weights be classified (EAR99; published under §734.7; ECCN 4E091, which is in the text but unenforced)? What changes if the replacement rule or the Remote Access Security Act is enacted?
5. For exploits: confirm the affected-owner-only structure fits "vulnerability disclosure" and that License Exception ACE limits (740.22(c)(5)) are respected.

**Current best evidence**

- **EAR text** [PRIMARY, eCFR read]:
  - §734.13(a)(1): export is "an actual shipment or transmission out of the United States … in any manner".
  - §734.15(a): "release" means inspection, or oral or written exchanges, with a foreign person.
  - §734.18(a)(5): sending, taking or storing technology or software that is unclassified, end-to-end encrypted, protected by FIPS 140-2-grade cryptography, and "not intentionally stored in" D:5 is not an export.
  - §734.18(b): the end-to-end definition above. "The originator and the recipient may be the same person."
  - **Analysis:** the carve-out fits encrypted storage abroad, where only the US seller decrypts in the US. It fits poorly where the stated purpose is decryption and execution in country X. The conservative reading is that an X-hosted weight room receives an export to X.
- **Cloud advisory opinions** [SECONDARY]:
  - BIS (2009-01-13): providing computational capacity is not itself an export, and the cloud provider is not the exporter of users' data.
  - Later opinions (2011; 2014, date disputed) say the user is generally responsible.
  - These are fact-specific.
- ★ **4E091:** still in the EAR text and unenforced since May 2025. No rescission notice or replacement rule as of 2026-10-21 [SECONDARY], and none in the FR as of 2026-11-11 (`regulatory.md`) [PRIMARY].
- ★ **Remote Access Security Act (H.R. 2683):** passed the House **369–22 on 2026-01-12**. Referred to Senate Banking on 2026-01-13. Not enacted [SECONDARY: Baker McKenzie, GovTrack]. It would let BIS control foreign persons' remote (cloud) access to EAR items.
- **Exploits:** 4D004 and 4E001.c, ACE 740.22 [PRIMARY, from `regulatory.md`].

**Our design's position:** weight rooms for flagged listings run only in allowed jurisdictions (AC-59). Exploits go only to affected owners (AC-58).

**Risk: MEDIUM** for weights. Most are EAR99, so the exposure is embargoed destinations and prohibited end users, but rule changes are pending. **HIGH** for exploits.

**SDD action:**

- Add the room's country to the KeyPolicy release conditions for every weight or technology listing, not only "flagged" ones.
- Record each room's facility country in `Platform`. It is already there as `facility`.
- Treat the room country as the export destination in screening.

### C.5 MNPI "possession" in a sealed room

**Questions for counsel**

1. **US.** A fund's sealed room reads a memo against the fund's context. The fund's people see only `{deal / no-deal, price}`; on no-deal the content is forgotten under a forget certificate.
   - Is the fund (or any natural person at it) "aware of" the MNPI under Rule 10b5-1(b) for later trades?
   - Is the outcome bit, combined with the listing metadata, itself MNPI (derived information)?
2. Can a fund rely on **Rule 10b5-1(c)(2)** (and, for tender offers, **Rule 14e-3(b)**) by showing that the decision-makers "w[ere] not aware" and that the sealed room is a policy "that prevent[s] such individuals from becoming aware"? What must the fund's §204A policies say about Marginal appraisals?
3. **EU.** Under MAR Art. 8(1) ("possesses inside information and uses that information") and recital 24 (use "should be implied"), can a legal person rely on **Art. 9(1)** (adequate internal arrangements ensuring the decision-maker "was not in possession")? Is releasing a memo to a sealed room an "unlawful disclosure" under Art. 10 by the seller?
4. **Marginal's own exposure.** What is Marginal's exposure as an intermediary that screens and classifies (the PGR precedent)? Does the **review path** (SC-21), where a compliance reviewer reads the content, make Marginal or the reviewer an insider (wall-crossing)?
5. Do signed non-reliance or "big boy" acknowledgements between seller and buyer have any value? (SEC position: no defence in enforcement.)

**Current best evidence**

- **Rule 10b5-1(b)** [PRIMARY, read]: a trade is "on the basis of" MNPI "if the person making the purchase or sale was **aware** of the material nonpublic information".
- **Rule 10b5-1(c)(2)** [PRIMARY, read]: a non-natural person may show that "the individual making the investment decision … was not aware of the information" **and** that it "had implemented reasonable policies and procedures … to ensure that individuals making investment decisions would not violate the laws …". These "may include … those that prevent such individuals from becoming aware of such information".
- **Rule 14e-3(b)** [PRIMARY, read]: the same structure for tender offers, including policies "which prevent such individual(s) from knowing such information".
- **Criminal standard (2d Cir.):** "knowing possession". *Teicher* (1993, dicta), *Royer* (2008), and *Rajaratnam* (2013) affirmed a possession-based instruction [SECONDARY: Wiggin & Dana, JD Supra]. The "use" circuits (*Adler*, 11th Cir. 1998; *Smith*, 9th Cir. 1998) are from background knowledge [UNVERIFIED].
- **MAR** [PRIMARY, read]:
  - Art. 8(1): insider dealing "arises where a person possesses inside information and uses that information".
  - Art. 8(4): applies to anyone who "knows or ought to know".
  - **Recital 24:** where a person in possession trades, "it should be implied that that person has used that information".
  - **Art. 9(1):** a legal person is not deemed to have used information "from the mere fact" of possession if it "has established, implemented and maintained adequate and effective internal arrangements and procedures that effectively ensure that neither the natural person who made the decision … nor another natural person who may have had an influence on that decision, was in possession of the inside information".
- **Big boy letters:** SEC officials said in 2007 that they are "no defense to an SEC enforcement action". Barclays (2007) settled [SECONDARY: Cleary Gottlieb].
- **Information barriers:** OCIE "Staff Summary Report on Examinations of Information Barriers: Broker-Dealer Practices Under Section 15(g)" (2012-09-27) gives control-room practices [SECONDARY summaries; PRIMARY URL].
- ★ **SEC FY2026 exam priorities:** MNPI handling across public and private sides; AI governance and oversight of automated tools and alternative data [SECONDARY].
- ★ ***Panuwat*** (9th Cir. No. 24-6882): argued 2026-06-11. **No decision found** as of 2026-11-12 [SECONDARY / UNVERIFIED].

**Analysis.**

- The room is closest to a legal-person **information barrier**: the entity "possesses" through a mechanism, but its decision-makers do not.
- The US (c)(2) and EU Art. 9(1) defences both turn on *the people who made the decision* not being aware or in possession, plus effective procedures. A sealed room that outputs one bit is a strong factual fit.
- Two weak points:
  - (a) The bit and the price are *derived from* the content and may be material for some listings.
  - (b) After a **deal**, the buyer's compliance key (AC-55) and delivery give real possession.
- So the defence mainly protects **no-deal** appraisals.

**Our design's position:** SPEC §4.13.2 controls; restricted and peer lists matched in-room; forget certificates; buyer compliance channel.

**Risk: HIGH** for the knowledge and signals verticals. Untested.

**SDD action:**

- Keep listing metadata deliberately coarse (no issuer-plus-event pairing in public metadata).
- Let buyers choose to **suppress the price** on no-deal, returning the bit only.
- Log appraisals per buyer *desk* so the buyer can wall off the trading staff.
- Draft a model §204A or MAR Art. 9 procedure buyers can adopt.

### C.6 Truth-contingent payments as swaps or event contracts

**Questions for counsel**

1. Is a truth-contingent **price adjustment embedded in a sale of an information good** a "swap" under 7 U.S.C. 1a(47)(A)(ii)? That is, a refund or bonus paid by the seller depending on whether the good's forecast proves true: non-transferable, institutional buyers only, no secondary market. Or is it a customary commercial arrangement under the 2012 joint interpretation ("the purchase, sale, lease, or transfer of … intellectual property"; contingent consideration such as earn-outs)?
2. Would the CFTC's **2026-10-19 proposal** to "expressly" include event contracts in "swap" change the answer? **Should Marginal or its counsel comment by 2026-11-18?**
3. If the contingency is a single issuer's security price or event, is it a security-based swap under the SEC? Which state gaming laws apply?
4. Is a DCM partner the only safe route for anything beyond an embedded warranty?

**Current best evidence**

- **Statute:** 7 U.S.C. 1a(47)(A)(ii) [PRIMARY, from `regulatory.md`].
- ★ **CFTC:**
  - **Proposed rule "Further Definition of 'Swap'—Inclusions"**, 91 FR 66022 (2026-10-19; RIN 3038-AF82; comments close **2026-11-18**, or 11-19 per regulations.gov). It would define "swap" to expressly cover event contracts on sports, politics, culture and weather. It is a CFTC-only action.
  - **Interim final rule** excluding "casino-style gambling products" from "swap", 91 FR 65969 (effective 2026-10-19).
  - Earlier 2026 actions: NPRM on public-interest determinations (2026-06-12); ANPRM (2026-03-16); withdrawal of the 2024 proposal (February 2026); NPRM on event-contract data reporting (2026-07-01); ANPRM on crypto asset transactions (2026-10-13).
  - [PRIMARY: FR API]
- **2012 joint interpretation** (77 FR 48208, 2012-08-13) [PRIMARY, read]:
  - Customary commercial arrangements "will not be considered swaps". The list includes "Sales, servicing, or distribution arrangements" and "The purchase, sale, lease, or transfer of real property, **intellectual property**, equipment, or inventory".
  - Business-combination agreements "can contain earn-out provisions and contingent value rights".
  - Consumer "service contracts … comprise consumer warranties".
- ★ **Courts:**
  - 3d Cir. (April 2026): for Kalshi.
  - 9th Cir. (2026-08-28): for Nevada.
  - 6th Cir. (2026-09-25): for the states.
  - **New Jersey's cert petition: No. 26-299, filed 2026-09-02.** Kalshi's response deadline is reportedly extended to 2026-12-07. No grant or denial yet [SECONDARY].

**Our design's position:** tails (v3) are structured as a non-transferable warranty or refund inside the sale, institutional only, no secondary trading, excluding sports and elections, or else listed through a DCM (AC-61).

**Risk: MEDIUM–HIGH.** It does not block v1. The definitional rulemaking is live right now.

**SDD action:** none for v1. Add a note that the v3 tail design waits on the final CFTC swap-inclusion rule and counsel's view of the commercial-arrangement exclusion.

### C.7 Counsel brief summary table

| # | Topic | The question in one line | Risk | Blocks |
|---|---|---|---|---|
| C.1 | Money transmission and custody | Does a withhold-only compliance key, plus an upgradeable escrow contract, make Marginal a transmitter, a DFAL licensee or a CASP? How should OFAC blocking be reconciled with "control"? | **High** | v1 canary (US users, CA users, EU users) |
| C.2 | GDPR roles | Processor or joint controller for sealed appraisal? Is ciphertext personal data for Marginal? Is in-enclave processing abroad a transfer? | **High** | v1 canary with EU personal-data goods |
| C.3 | DGA and Data Act | Is Marginal a data intermediation service? Must it file an Art. 36 smart-contract conformity declaration now? | Medium | EU launch of datasets and evals |
| C.4 | Export | Is decryption in a foreign enclave an export, and who is the exporter? Weights classification; exploits | Medium (weights) / **High** (exploits) | Weights and exploits verticals |
| C.5 | MNPI | Does a one-bit sealed appraisal make the fund "aware" or "in possession"? Do the 10b5-1(c)(2) and MAR Art. 9(1) barrier defences apply? | **High** | Fund buyers of knowledge goods |
| C.6 | Swaps and event contracts | Is an embedded truth-contingent adjustment a swap after the October 2026 CFTC proposal? | Medium–High | v3 tails |

---

## Part D: recommended SDD changes (consolidated)

1. **§3.20, compliance service data.** Replace "Vendors … open (OI-8)" with the stack in A.5:
   - Sumsub (KYC, KYB, identity AML screening);
   - TRM (address screening, NEAR included);
   - nightly OFAC SDN ingestion as the independent list check;
   - Middesk optional for US KYB;
   - no Chainalysis oracle.
2. **§3.9.4, `PayoutApproval`.**
   - Add off-chain `list_version` (issue date plus SHA-256), `screen_id` and `vendor`.
   - Re-screen at route set and at release.
   - Add a **`Blocked`** payout state (no refund, no release) and an OFAC blocked-property reporting workflow.
   - Note that SDN has no NEAR address type: NEAR payouts rely on identity screening plus TRM exposure.
3. **§3.22 and §9.2, retention.**
   - Add the B.2 table as `retention_jobs` policy.
   - Object-lock periods: `certs/` 10 years; `joblogs/` 5 years, or 10 years if flagged.
   - Crypto-shred `k_nf` and any `identity_hash` salt per period.
   - Add a legal-hold override.
   - Cite 31 CFR 501.601 (10 years) and 28 CFR 202.1101 (10 years). Cite BSA and AMLR only once counsel confirms they apply.
4. **§3.20, credentials.** Keep `identity_hash` off-chain, or derive it with a shreddable per-period key.
5. **§1.5 HDP row "KYB/KYC and sanctions vendors".**
   - "Static list" becomes the **real OFAC SDN file** (issue date shown).
   - Demo a blocked foreign-chain payout address (ETH, TRX or SOL).
   - Note that vendor trials (Sumsub, Veriff: 50 checks) are optional and need signup.
6. **§9.3.** Add a TRM row and an OFAC download row. Note the Chainalysis breach as the reason vendors get minimal fields.
7. **§11 OI-18.** Replace the one-line item with the C.7 table. Add "Comment deadline on the CFTC swap-inclusion NPRM: 2026-11-18" as a dated watch item.
8. **New open item: "control" design decision.** Choose between:
   - (a) a bounded compliance hold;
   - (b) a partner or issuer freeze for sanctions;
   - (c) immutable clearing per version;
   - (d) licensing (DFAL / MTMA).
   Blocks the v1 canary for US users. Owner: counsel plus design.
9. **SPEC §4.13.4 (via SCR).** Data Act Art. 36 is now **read** (PRIMARY). The design must map pause and governance to Art. 36(1)(a)–(e) and plan for an EU declaration of conformity unless the Omnibus deletion is adopted first.

---

## Part E: sources

**Vendors**
- Chainalysis oracle docs (deprecated), PRIMARY: https://go.chainalysis.com/chainalysis-oracle-docs.html
- Chainalysis Address Screening product page, PRIMARY: https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/
- Chainalysis free API probe (apis.io), SECONDARY: https://apis.io/providers/chainalysis/
- Chainalysis breach, SECONDARY: https://www.bleepingcomputer.com/news/security/chainalysis-says-breach-exposed-credentials-for-all-customers/ ; https://cryptoslate.com/cryptos-crime-tracking-giant-restores-its-main-tools-after-hackers-exposed-every-users-login-data/
- TRM free Sanctions API, PRIMARY: https://docs.trmlabs.com/guides/sanctions/introduction ; endpoint doc: https://docs.trmlabs.com/api/sanctions/screening/submit-one-or-more-addresses-to-be-screened
- TRM NEAR coverage, PRIMARY: https://www.trmlabs.com/blockchain-coverage/near
- Elliptic–NEAR partnership (2022), PRIMARY-vendor: https://www.elliptic.co/media-center/elliptic-partners-with-near-foundation-to-enhance-on-chain-security
- Sumsub pricing, PRIMARY: https://sumsub.com/pricing/
- Sumsub crypto monitoring docs, PRIMARY-vendor (snippets): https://docs.sumsub.com/docs/crypto-monitoring
- Veriff pricing, PRIMARY: https://www.veriff.com/pricing
- Persona startups, PRIMARY-vendor (snippet): https://withpersona.com/startups ; Persona–Chainlink CCID (2026-05-05): https://withpersona.com/blog/persona-partners-with-chainlink
- Persona aggregator pricing, SECONDARY: https://www.softwareadvice.com/aml/persona-profile/
- Footprint preview pricing, UNVERIFIED: https://frontpage-git-belce-v4-2.preview.onefootprint.com/pricing
- Middesk, SECONDARY: https://www.vendr.com/marketplace/middesk ; https://us.fitgap.com/products/045340/middesk
- ComplyAdvantage, SECONDARY: https://pricingsaas.com/companies/complyadvantage ; https://apis.io/plans/complyadvantage/complyadvantage-plans-pricing/
- OpenSanctions licensing, PRIMARY: https://www.opensanctions.org/licensing/
- OFAC Sanctions List Service, PRIMARY: https://ofac.treasury.gov/sanctions-list-service ; files: https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ADVANCED.XML (and SDN.CSV, SDN_COMMENTS.CSV)
- OFAC FAQ 563 (address field format), PRIMARY URL: https://ofac.treasury.gov/faqs/563
- idOS docs, PRIMARY-vendor (snippet): https://docs.idos.network/how-it-works/faqs-users ; NEAR guide: https://pages.near.org/?p=21069
- Fractal (protocol to idOS; data deletion), SECONDARY: https://medium.com/frctls/the-protocol-is-dead-long-live-the-protocol-22686e31b67f ; https://extpose.com/ext/231025
- Human ID docs, PRIMARY-vendor (snippets): https://docs.passport.human.tech/building-with-passport/individual-verifications/introduction ; https://docs.id.human.tech/for-users/using-with-near
- zkMe, SECONDARY: https://www.alchemy.com/dapps/zkme
- Privado ID, SECONDARY: https://www.spark.money/research/fintech-kyc-reusable-identity-credential

**Retention**
- 31 CFR 1010.430, PRIMARY: https://www.ecfr.gov/current/title-31/section-1010.430
- 31 CFR 501.601 and 501.603, PRIMARY: https://www.ecfr.gov/current/title-31/section-501.601 ; https://www.ecfr.gov/current/title-31/section-501.603
- OFAC 10-year final rule (FR 2025-04864), PRIMARY URL from search, not opened: https://www.govinfo.gov/content/pkg/FR-2025-03-21/html/2025-04864.htm ; SECONDARY: https://www.gtlaw.com/en/insights/2025/4/us-treasury-extends-recordkeeping-requirement-for-economic-sanctions-compliance-to-10-years
- 28 CFR 202.1101, PRIMARY: https://www.ecfr.gov/current/title-28/chapter-I/part-202
- AMLR (Reg. (EU) 2024/1624) Arts 77, 79, 90, PRIMARY (read via EUR-Lex): https://eur-lex.europa.eu/eli/reg/2024/1624/oj ; Springlex Art. 77 copy: https://www.springlex.eu/en/packages/aml/amlr-regulation/article-77/
- FATF Recommendations, PRIMARY (403): https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html
- GDPR, PRIMARY (read): https://eur-lex.europa.eu/eli/reg/2016/679/oj

**Money transmission and custody**
- 31 CFR 1010.100(ff)(5), PRIMARY: https://www.ecfr.gov/current/title-31/section-1010.100
- FinCEN withdrawals 2026-10-06, PRIMARY: https://www.federalregister.gov/api/v1/documents/2026-20429.json ; https://www.federalregister.gov/api/v1/documents/2026-20430.json ; https://www.govinfo.gov/content/pkg/FR-2026-10-06/pdf/2026-20429.pdf
- Storm retrial moved, SECONDARY: https://www.theblock.co/news/regulation/2026-08-26-tornado-cash-roman-storm-retrial-april-2027-412761 ; https://www.coindesk.com/business/2026/03/10/u-s-requests-october-retrial-for-tornado-cash-developer-roman-storm
- Lewellen dismissal, SECONDARY: https://blockchain.bakermckenzie.com/2026/04/01/federal-court-dismisses-crypto-developers-pre-enforcement-challenge-relating-to-his-crowdfunding-tool/
- BRCA S.3611 text, SECONDARY (GovTrack): https://www.govtrack.us/congress/bills/119/s3611/text ; H.R.3533, PRIMARY URL (403): https://www.congress.gov/bill/119th-congress/house-bill/3533/text
- CLARITY cloture failure, SECONDARY: https://www.dlapiper.com/en/insights/publications/2026/09/senate-fails-to-advance-the-clarity-act ; https://defirate.com/clarity-act-fact-sheet/
- GENIUS Act: OCC bulletin 2026-50, PRIMARY (snippet): https://www.occ.treas.gov/news-issuances/bulletins/2026/bulletin-2026-50.html ; Treasury NPRM, PRIMARY URL: https://www.federalregister.gov/documents/2026/08/18/2026-16796/genius-act-regulations-on-payment-stablecoin-issuance-offer-and-sale ; FinCEN/OFAC PPSI NPRM, PRIMARY URL: https://www.federalregister.gov/documents/2026/04/10/2026-06963/permitted-payment-stablecoin-issuer-anti-money-launderingcountering-the-financing-of-terrorism ; Jones Day, SECONDARY: https://www.jonesday.com/en/insights/2026/08/us-treasury-proposes-genius-act-rules-for-stablecoin-issuance-offer-and-sale ; effective date, SECONDARY: https://vasptracker.com/en/us/analysis/genius-act-effective-date-rulemaking/
- California DFAL: DFPI, PRIMARY: https://dfpi.ca.gov/financial-services/digital-financial-assets-law/ ; Goodwin, SECONDARY: https://www.goodwinlaw.com/en/insights/publications/2026/04/alerts-finance-dcb-california-dfal-license-application-open ; AB 39 chaptered text ("control"), PRIMARY via LegiScan: https://legiscan.com/CA/text/AB39/2023 ; Cal. Fin. Code §3102, SECONDARY copy: https://california.public.law/codes/financial_code_section_3102
- MTMA, SECONDARY: https://www.csbs.org/node/231461 ; https://www.csbs.org/mtma-legislative-update-august-2026
- MiCA, PRIMARY (read via Publications Office cellar item): https://eur-lex.europa.eu/eli/reg/2023/1114/oj
- EBA/ESMA Art. 142 joint report, PRIMARY URL: https://www.eba.europa.eu/sites/default/files/2025-01/5fe168a2-e5a6-41a1-a1b4-87a35ecebb5c/Joint%20Report%20on%20recent%20developments%20in%20crypto-assets%20(Art%20142%20MiCAR).pdf

**GDPR**
- CJEU C-683/21, PRIMARY (read): https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62021CJ0683
- CJEU C-210/16 Wirtschaftsakademie, PRIMARY (read): https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62016CJ0210
- CJEU C-40/17 Fashion ID, PRIMARY (read): https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62017CJ0040
- EDPB news 2026-07-08 (anonymisation draft; blockchain final), PRIMARY: https://www.edpb.europa.eu/news/edpb-sheds-light-on-anonymisation-and-web-scraping-for-generative-ai-and-adopts-final-version_en
- EDPB Recommendations 01/2020 v2.0, PRIMARY (read): https://edpb.europa.eu/system/files/2021-06/edpb_recommendations_202001vo.2.0_supplementarymeasurestransferstools_en.pdf
- EDPB pseudonymisation guidelines 01/2025, PRIMARY URL: https://www.edpb.europa.eu/system/files/2025-01/edpb_guidelines_202501_pseudonymisation_en.pdf ; status, SECONDARY: https://www.praxikon.com/en/avg/richtsnoeren
- EDPB Opinion 22/2024, SECONDARY: https://huntonak.com/privacy-and-information-security-law/edpb-adopts-opinion-on-processors-and-guidelines-on-legitimate-interests
- EDPS TechSonar confidential computing, PRIMARY URL (403): https://www.edps.europa.eu/data-protection/technology-monitoring/techsonar/confidential-computing

**DGA, Data Act, Omnibus**
- Data Act Art. 36, PRIMARY (read): https://eur-lex.europa.eu/eli/reg/2023/2854/oj
- COM(2025) 837, PRIMARY (read): https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:52025PC0837
- OEIL 2025/0360(COD), PRIMARY: https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2025/0360(COD)

**Export**
- 15 CFR 734.13 / 734.15 / 734.18, PRIMARY (eCFR read): https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-734
- BIS advisory opinions list, PRIMARY URL: https://www.bis.gov/advisory-opinions ; cloud AO summary, SECONDARY: https://www.technologyslegaledge.com/2014/12/what-happens-in-the-cloud-stays-in-the-cloud-bis-reinforces-export-control-insulation-for-cloud-based-computing-and-processing/
- 4E091 status, SECONDARY: https://www.onelexpartners.com/news-and-insights/us-export-controls-and-ai-a-practitioners-guide
- Remote Access Security Act, SECONDARY: https://sanctionsnews.bakermckenzie.com/us-house-passes-remote-access-security-act/ ; https://www.govtrack.us/congress/bills/119/hr2683

**MNPI**
- 17 CFR 240.10b5-1, PRIMARY (eCFR read; (c)(2) via LII): https://www.law.cornell.edu/cfr/text/17/240.10b5-1
- 17 CFR 240.14e-3, PRIMARY (eCFR read): https://www.ecfr.gov/current/title-17/section-240.14e-3
- MAR (Reg. (EU) 596/2014) Arts 8, 9, recital 24, PRIMARY (read): https://eur-lex.europa.eu/eli/reg/2014/596/oj
- Rajaratnam (knowing possession), SECONDARY: https://www.wiggin.com/publication/second-circuit-affirms-raj-rajaratnam-conviction-addresses-important-issues-of-law-regarding-wiretap-applications-and-insider-trading-elements/
- Big boy letters, SECONDARY: https://www.clearygottlieb.com/news-and-insights/publication-listing/recent-sec-enforcement-action-involves-big-boy-letters29
- OCIE information-barriers report (2012), SECONDARY: https://corpgov.law.harvard.edu/2012/10/17/good-walls-better-compliance-ocies-report/
- SEC FY2026 exam priorities, SECONDARY: https://www.akerman.com/en/perspectives/sec-releases-2026-examination-priorities-key-implications-for-private-fund-advisers.html

**Swaps and event contracts**
- CFTC swap-inclusion NPRM, PRIMARY: https://www.federalregister.gov/api/v1/documents/2026-21377.json
- CFTC casino-style IFR, PRIMARY: https://www.federalregister.gov/api/v1/documents/2026-21376.json
- FR CFTC listing since 2026-06, PRIMARY: https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=commodity-futures-trading-commission&conditions[term]=prediction%20markets&conditions[publication_date][gte]=2026-06-01
- 2012 joint further definition of "swap", PRIMARY (read): https://www.govinfo.gov/content/pkg/FR-2012-08-13/html/2012-18003.htm
- NJ cert petition No. 26-299, SECONDARY: https://www.legalsportsreport.com/275556/new-jersey-asks-supreme-court-to-rule-on-kalshi-sports-predictions/ ; https://siapredict.com/blog/kalshi-supreme-court-flaherty-docket-26-299

---

## Part F: query and fetch log (2026-11-12)

**WebSearch** (mode in brackets):
1. TRM Labs free sanctions screening API supported blockchains [std]
2. Chainalysis sanctions oracle supported networks [std]
3. Chainalysis free sanctions screening API deprecated 2026 [ext]
4. Elliptic NEAR coverage [std]
5. Chainalysis KYT NEAR support [std]
6. Merkle Science supported blockchains NEAR [std]
7. OFAC SDN "Digital Currency Address" types [std]
8. Persona pricing free plan [std]
9. Footprint pricing [std]
10. Middesk KYB pricing [std]
11. ComplyAdvantage pricing 2026 [std]
12. Fractal ID shutdown [ext]
13. Quadrata sunset [std]
14. Human ID / Holonym NEAR [std]
15. idOS NEAR reusable KYC [std]
16. zkMe NEAR [std]
17. Privado ID chains 2026 [std]
18. AMLR Art. 77 retention and application date [std]
19. OFAC 10-year recordkeeping rule [std]
20. Roman Storm 2026 developments [ext]
21. CLARITY / BRCA status November 2026 [ext]
22. GENIUS Act developer rule of construction and effective date [ext]
23. California DFAL July 2026 [std]
24. Cal. Fin. Code 3102 "control" [std]
25. BIS cloud advisory opinions [std]
26. BIS 4E091 replacement November 2026 [ext]
27. Remote Access Security Act status [ext]
28. EDPB pseudonymisation guidelines final [ext]
29. Digital Omnibus Parliament position November 2026 [ext]
30. CJEU C-683/21 holding [std]
31. EDPB Opinion 22/2024 / Guidelines 07/2020 [std]
32. Panuwat Ninth Circuit decision [ext]
33. Big boy letters and SEC enforcement [std]
34. Knowing possession: Teicher / Rajaratnam [std]
35. Kalshi certiorari and CFTC final rule [ext]
36. SCOTUS action on the NJ–Kalshi petition [ext]
37. 2012 swap definition: commercial agreements [std]
38. Lewellen v. Bondi 2026 [ext]
39. FinCEN 2026 DeFi / non-custodial rules [ext]
40. EDPS TechSonar confidential computing [std]
41. EDPB Recommendations 01/2020 use cases [std]
42. MTMA state count 2026 [std]
43. SEC FY2026 exam priorities MNPI and AI [std]
44. OCIE 2012 information-barriers report [std]
45. FATF R.11 text [std]
46. Chainalysis 2026 security incident [std]
47. Sumsub crypto monitoring NEAR [std]
48. Persona reusable identity 2026 [std]
49. MiCA Art. 142 DeFi report [ext]

**WebFetch:**
1. Chainalysis free-tools page: OK (now Address Screening)
2. docs.sanctions.trmlabs.com: 302
3. Chainalysis oracle docs: OK (deprecated)
4. TRM sanctions intro: OK
5. TRM NEAR coverage: OK
6. OFAC SLS page: OK
7. OFAC data-formats page: 404
8. OpenSanctions licensing: OK
9. Sumsub pricing: OK
10. Persona pricing: 403
11. Veriff pricing: OK
12. Footprint (www): 404
13. Middesk pricing: 404
14. Footprint pricing: 404
15. eCFR 501.601: OK
16. eCFR 202.1101: OK
17. eCFR 1010.430: OK
18. FR API citation query: 400
19. Springlex AMLR Art. 77: OK
20. FR API OFAC search: 0 results
21. FATF: 403
22. congress.gov H.R.3533: 403
23. DLA Piper CLARITY: OK
24. leginfo §3102: 403
25. Lummis release: 403
26. GovTrack S.3611: 403
27. EDPB news 2026-07-08: OK
28. OEIL 2025/0360(COD): OK
29. EUR-Lex COM(2025) 837: OK
30. eCFR 10b5-1 HTML: captcha redirect
31. FR API 2026-21377: OK
32. FR API 2026-21376: OK
33. FR API CFTC listing: OK
34. FR API 2026-20429/20430: OK
35. Coin Center Lewellen order PDF: 404
36. OpenSanctions non-commercial page: 404
37. CFATF R.11: 404
38. EDPS TechSonar: 403

**Direct downloads (curl, read locally; scratchpad):**
- OFAC `SDN.CSV`, `SDN_COMMENTS.CSV`: OK.
- OFAC `SDN_ADVANCED.XML`: partial (16 of 128 MB; header and reference sets complete; DateOfIssue 2026-11-09).
- MiCA via a Publications Office cellar item: OK.
- EUR-Lex via ELI: AMLR, MAR, Data Act, GDPR: OK.
- EUR-Lex CELEX HTML: C-683/21, C-210/16, C-40/17, COM(2025) 837: OK.
- eCFR versioner (with compression): 17 CFR 240.10b5-1 (partial), 240.14e-3; 15 CFR 734.13, 734.15, 734.18, 734.20; 31 CFR 1010.100, 501.603: OK.
- LII 17 CFR 240.10b5-1: OK.
- EDPB Recommendations 01/2020 PDF (text via PDFKit): OK.
- govinfo FR 2012-18003 (2012 swap definition release): OK.

**Not done (flag):**
- No vendor accounts, API calls needing keys, or signups.
- Onfido, Jumio, Alloy and Dow Jones pricing not researched (quote-only, UNVERIFIED).
- NY BitLicense "control" not researched.
- EU, UN and UK list formats not verified this session.
- The OFAC 501.603 reporting deadline was not re-read.
