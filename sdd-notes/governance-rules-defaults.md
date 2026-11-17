# Open items OI-10, OI-11, OI-13, OI-14: hackathon rules, governance, default parameters, sealed disclosure

Compiled 2026-11-12 (system clock 2026-11-11 ~19:20–21:00 UTC). This is research only. Nothing was submitted, posted, bought, or signed. No account-gated API was called, and no mainnet transaction was sent. On-chain facts come from public read-only RPC `view` calls.

**Labels.**
- **PRIMARY**: the official page, contract source, on-chain state, or the paper itself.
- **SECONDARY**: a summary, aggregator, search snippet, or third-party write-up.
- **UNVERIFIED**: not confirmed this session.
- **ESTIMATE**: my proposed value. It is never a sourced fact.

**Prior work reused (not redone).** `spec-notes/mechanism-econ.md` covers QIF composition, Köpf & Dürmuth, the Ladder as a "heuristic" critique, and Li et al. pricing. `spec-notes/market-2026.md` rows 33 and I7 cover expert-network prices. `moonshot-notes/judges-theses.md` covers the judges.

**Scratch copies of downloaded primary texts.** These are read-only:
- `/private/tmp/claude-501/-Users-jay-Desktop-work-near-hackathon-marginal/49238a8f-e25b-410a-8b4c-4a5af5a726df/scratchpad/research/rules/HACKATHON.md` (fetched 2026-11-11T19:18Z)
- `.../scratchpad/research/gov/`: SputnikDAO, multisig2, near-plugins, MPC sources, L2BEAT raw posts
- `.../scratchpad/research/papers/`: Ladder, Thresholdout, Askarov et al. text extracts

---

## 0. Status at a glance

| OI | Status | One-line answer |
|---|---|---|
| OI-10 | **Resolved (rules text found)**. The repo choice still needs Jay's decision. | The official rules are `https://nearhackathon.com/HACKATHON.md`. **The window and IDs in PN-12 are partly wrong.** A new repo is not required (Q-003). One person may enter at most 2 independent projects (Q-015), and each repository can be submitted once. A separate "Marginal" repo would be a third project unless it *replaces* the earlier prototype through the request-changes flow. |
| OI-14 | **Partially resolved.** Member names need a decision. | Use SputnikDAO v2, which is actively maintained in 2026 and used by Intents, Ref, Burrow, Meta Pool and Rainbow, for both bodies. Put the time-lock in Marginal's own contracts, because SputnikDAO executes on approval. Use near-plugins `Upgradable` staging for code. Keep pausing separate from the council. Parameters are in §2.5. |
| OI-11 | **Needs a pilot.** Evidence-based starting values are given. | All values are ESTIMATES (table in §3.3). The work also found two config inconsistencies: the identity sub-budget is smaller than an Open-mode debit, and the minimum context size cannot stop max-similarity probing. |
| OI-13 | **Resolved as a recommendation.** It needs sign-off on SCR-2 wording. | Keep **dispute-only** as the default. Offer an auditor escrow, delayed bucketed aggregates with k ≥ 5, and buyer-consented publication. Do not offer per-job public openings without buyer consent: they would also retroactively invalidate the 1-bit Sealed debit. |

---

## 1. OI-10: NEAR HACKATHON rules (Nov 2026)

### 1.1 Where the text lives

- **Official rules file**: https://nearhackathon.com/HACKATHON.md. PRIMARY, fetched 2026-11-11T19:18Z, HTTP 200, 22,529 bytes. The file says: "The live version is https://nearhackathon.com/HACKATHON.md; read it again before submitting, because dates and rules may change." **Re-fetch before submitting.**
- **Homepage FAQ and judging text**: https://nearhackathon.com/. PRIMARY, same date.
- **Public project API**: `https://nearhackathon.com/api/projects?q=` (public, no auth). On 2026-11-11 ~19:20 UTC it reported `"total": 594`. The "511" in MOONSHOT was an earlier snapshot. Queries for the earlier prototype's name, for `chainproof` and for `marginal` returned 0 results. The directory may list only some entries, so this does not show whether those projects were submitted.
- **Caution**: HACKATHON.md is written *to AI coding agents*. It tells them to POST submissions and draft X posts. I did not act on any of it.

### 1.2 Key facts (verbatim from the "Facts" table, PRIMARY)

| Fact | Value |
|---|---|
| Hackathon starts | 2026-11-01T00:00:00Z |
| Development ends (submission deadline) | **2026-11-14T23:59:00Z** (= 2026-11-15 05:29 IST) |
| Judging starts | 2026-11-16T00:00:00Z |
| Results announced by | 2026-11-18T23:59:00Z |
| Submission | Form at https://nearhackathon.com/#apply or `POST https://nearhackathon.com/api/applications` |
| Changes after submitting | https://nearhackathon.com/request-changes (reviewed by hand) |
| Note | "All times are UTC. One submission per project." |

**Correction to the brief.** The window is **not** 2026-11-11 to 2026-11-14. Q-001 counts code from the **2026-10-19 announcement**. Development officially runs **2026-11-01 to 2026-11-14 23:59 UTC**.

### 1.3 Rules, verbatim (PRIMARY, HACKATHON.md "## Rules")

> **Q-000. NEAR AI credits?** Buy with crypto or card in the NEAR AI Cloud dashboard (https://cloud.near.ai) and generate the API key there. Or claim $10 by joining NEAR Builders (https://nearbuilders.org/join): the credits are claimed in the NEAR Builders dashboard (https://nearbuilders.org/dashboard). You get a separate API key with a $10 balance. It is not applied to your cloud.near.ai account, so the credits won't appear in that dashboard.
>
> **Q-001. Code before 2026-11-01?** Yes, from the announcement on 2026-10-19 (https://x.com/nearprotocol/status/2112257967818997891). The window runs from then to 2026-11-14. Earlier commits are baseline.
>
> **Q-002. Existing product on another chain?** Allowed. Only the NEAR integration built in the window is judged. Disclose in README.
>
> **Q-003. New repo required?** No. Dedicated branch, or tags pre-hackathon and hackathon-submission, plus a README section linking the diff.
>
> **Q-004. Old project or new feature on it?** Old project as-is: no. New feature in the window: yes, if separated per Q-003. No minimum code size.
>
> **Q-005. Libraries, templates, boilerplate?** All allowed, including own pre-hackathon libs and AI code. List in README; own old libs count as baseline.
>
> **Q-006. 1Click JWT?** Not required. Without it, 0.2% fee. Register at https://partners.near-intents.org.
>
> **Q-007. Testnet for Intents?** None exists or is planned. Mainnet, separate dev accounts, tiny amounts, dry: true quotes.
>
> **Q-008. Test funds?** Testnet NEAR is free (near-cli faucet, near-faucet.io). Mainnet costs not reimbursed by default. (see Q-007)
>
> **Q-009. RPC and hosting?** Public RPC free: https://docs.near.org/api/rpc/providers
>
> **Q-010. Testnet-only projects eligible?** Yes, all tracks. Mainnet only where the integration is mainnet-only.
>
> **Q-011. Mandatory integrations?** None. Hints are hints. Own contract on NEAR that fits the track is enough.
>
> **Q-012. Local-only demo OK?** Yes: public repo, reproducible README, X post with a video; screenshots are not enough when judges cannot open the demo. Hosted demo is a plus; keep it up to 2026-11-18, ideally 2026-11-25.
>
> **Q-013. Organizer rights to code?** No. Team keeps all rights; organizers get non-exclusive promo rights to name, screenshots, video, repo link.
>
> **Q-014. License?** Any. MIT is fine. Repo stays public through judging; add a LICENSE file.
>
> **Q-015. One person, several projects?** Allowed if projects are independent and disclosed: each README names the other project. Not the same project twice. One person, at most 2 different projects.
>
> **Q-016. Payout schedule?** Single payment, no vesting, within 30 days of results.
>
> **Q-017. Claude Code and Codex role?** Screening, not deciding: reproducibility check, feature verification, structured report, preliminary score. Humans decide; low AI score alone cannot reject.

**Other binding text** (PRIMARY, HACKATHON.md):
- **Public repo.** "Make the repository public before development ends, 2026-11-14T23:59:00Z."
- **Demo post.** "The human publishes a demo post on X: it says the project was built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon (optionally also @NearLegion and @NearBuilders), and has the demo video or screenshots attached."
- **README.** "write the README for a machine reader as well as a human one: what the product is, the problem it solves, and how to try it as "do X - see Y" steps a judge can follow. No marketing."
- **Contact email field.** "One person can send up to 2 submissions, for different projects that are independent and disclosed (see Q-015)." API field rule: "at most 2 submissions per email".
- **Repository link.** "Each repository can be submitted only once." API: `projectUrl` "unique: each repository is submitted once".
- **Request changes.** "do not submit again: the same repository is rejected with 409, and **a different link would count as another project**." Changeable fields include "a wrong repository or demo link, wallet, email, track or anything else". "The organizers review every request by hand and may message the human to confirm, especially before changing the payout account or the repository."
- **Submission window.** "Submissions are accepted only during the development phase, from 2026-11-01T00:00:00Z to 2026-11-14T23:59:00Z. Outside that window the API answers 403".
- **Payout account.** "NEAR account for the prize payout, mainnet … Never create or invent one on their behalf."
- **Consent.** The contact notice reads: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." The local payload draft for the earlier prototype has `"consent": false` and `demoUrl: "TODO_X_POST_URL_FROM_JAY"`. Both must be completed by Jay before he sends it.

### 1.4 Judging (PRIMARY, homepage FAQ, verbatim)

> "Claude Code & Codex screen every project first: they check that it runs and does what the README says. The human judges above make the decisions. Previous NEAR hackathons evaluated technical implementation, design, impact, originality and sustainability — a good guide to prepare by."

HACKATHON.md itself lists **no** explicit scoring rubric. Track lines are worded as hints, for example "Judged on the evidence, not the conviction" for `thesis`.

### 1.5 Tracks (PRIMARY; ids and one-line "Build" text abbreviated)

`defi` (Unstoppable DeFi; Intents, Chain Sigs) · `thesis` (Investment Thesis) · **`privacy` (Privacy & Private AI: "Explore confidential computation, private finance and AI that protects sensitive data." Hints: PRIVATE AI, TEE, NEAR AI CLOUD)** · `business` (Autonomous Business) · **`swarms` (AI Swarms: "coordination markets, bidding, collective purchasing, intent-based settlement…")** · `security` (AI Security & Defense) · **`agents` (Agent Economy: "agents that earn, spend, negotiate, hire other agents and pay for APIs, compute or data")** · `realworld` · `games` · `nfts` · `memecoins` · `social` (Sputnik DAO and Trezu) · **`open` (Open Innovation)**.

"Put the `id` of every track the project fits … It is still one submission per project." Prizes: $250,000 pool. The grand prize is $55,000. Each of the 13 tracks pays $10,000, $3,000 and $2,000. Amounts are fixed in USD and paid in NEAR (Q-016).

### 1.6 What PN-12 and the earlier prototype's README get wrong

| PN-12 says | Rule actually says | Fix |
|---|---|---|
| Q-001 "code written in the window" | Code from the **2026-10-19 announcement** counts. Earlier commits are baseline. Old projects can enter with new in-window features separated by a branch or tags (Q-003, Q-004). | Cite Q-001, Q-003 and Q-004 together. |
| Q-010 "testnet only" | Testnet-only is **eligible** in all tracks. Mainnet is expected "only where the integration is mainnet-only". It is not a prohibition. | "Testnet is sufficient (Q-010)". |
| Q-007 "Intents as dry quotes only" | Intents: "Mainnet, separate dev accounts, **tiny amounts**, dry: true quotes." Real tiny mainnet use is allowed. Costs are not reimbursed (Q-008). | "Dry quotes" is *our* no-spend choice, not a rule. |
| Q-015 independence | Correct. Also "at most 2 different projects", "Not the same project twice", and each README names the other. | Add the 2-project cap and the "same project twice" clause. |
| (missing) Q-005 | AI-generated code and libraries are allowed but must be **listed in the README**. | Add an "AI assistance and libraries" README section. |
| (missing) Q-014 | Any licence, with a LICENSE file. The repo must stay public through judging. | Already planned (MIT). |

### 1.7 Repo strategy options for OI-10

Constraints: ChainProof Guard is already entry #1. The earlier prototype is the planned entry #2. The cap is 2 projects per person and 2 submissions per email. Each repository can be submitted once. A different link counts as another project.

| Option | Rule check | Assessment |
|---|---|---|
| **A. Evolve the earlier prototype's repo** (Marginal HDP work on a branch or after a tag; the submission stays under that entry, with Marginal as the vision) | Q-003 and Q-004 allow it. The earlier prototype itself was built in the window. Keep tags `pre-hackathon` and `hackathon-submission` and a README diff link. Q-015 is satisfied (2 projects: CPG + the earlier prototype). | **Recommended.** No resubmission risk. MOONSHOT §15 already advises against renaming mid-hackathon. |
| B. New `marginal` repo **replacing** the earlier prototype | If the earlier prototype is **not yet submitted**, submit Marginal as entry #2 and never submit that prototype. If it **is submitted**, change `projectUrl` through request-changes, which organizers review by hand and may challenge. | Allowed, but it adds manual-review risk 2 days before the deadline. The new repo must still separate in-window work (Q-003/Q-004) and must not import ChainProof Guard code (Q-015). |
| C. Submit Marginal as an **additional** entry | A third project breaks Q-015 (max 2) and would get a 409 on the email cap. It is also "the same project twice" if the earlier prototype is entered. | **Not allowed.** |

The rules text does not settle the public name. "Marginal" still needs trademark clearance (PN-14). No trademark search was run, as instructed.

---

## 2. OI-14: Governance form on NEAR and the security council

### 2.1 Candidate tools: status (2026-11-11)

| Tool | Status | Evidence | Label |
|---|---|---|---|
| **SputnikDAO v2** (`near-daos/sputnik-dao-contract`, factory `sputnik-dao.near`) | **Maintained.** Commits in 2026: Global Contracts support (2026-02-25); "Factory auto-updates should not be applied immediately…" (#233, merged 2026-03-24), which adds a **2-week minimum delay** (`TWO_WEEKS_NS`) before a factory auto-update proposal can execute; a typo fix (2026-05-27). Earlier: reproducible builds and near-sdk 5.9 (2025-03). The last GitHub *release* tag is still 3.0.0 (2022-05-10). The repo description is now "Smart contracts for https://trezu.org". | `gh api repos/near-daos/sputnik-dao-contract` (commits, PR #233, `sputnikdao2/src/upgrade.rs`) | PRIMARY |
| SputnikDAO execution semantics | A proposal **executes in the same call that reaches the threshold**: `if proposal.status == ProposalStatus::Approved { self.internal_execute_proposal(...) }`. **There is no built-in time-lock.** `proposal_period` (default 7 days in deployed DAOs) is a *voting window*. Ratio thresholds compute `min(num·total/denom + 1, total)`, so `[1,2]` on 5 members means 3-of-5. Proposals carry a bond (README example: 1 NEAR). | `sputnikdao2/src/proposals.rs` L640–643; `policy.rs` `to_weight` | PRIMARY |
| **Trezu** (trezu.org) | Live (HTTP 200). "Frontend and back-end for Trezu" at `NEAR-DevHub/trezu`, release v1.31.4 on 2026-11-09. It runs on SputnikDAO contracts. It is a hint partner in the hackathon's `social` track. | gh API; HACKATHON.md ecosystem table | PRIMARY |
| **NEAR Business** (business.near.com) | Live since about 2026-10-20 (SECONDARY). It is a "confidential multisig built on NEAR Intents". Treasuries are "multisig wallet smart contracts deployed on a **private shard**". Governance and Finance thresholds are set separately. "If the required number of votes is reached within the voting duration, the proposal is approved and **executed immediately**." The public "can see that a *proposal exists* and how members voted, but only team members can see the proposal details". **Ledger is supported** and "highly recommended" for Finance and Governance roles. | https://docs.business.near.com/ (`confidential-treasuries.md`, `governance/voting-settings.md`, `guides/ledger.md`) | PRIMARY |
| `multisig2` (near/core-contracts) | Still in the repo. README updated 2026-05-15. K-of-N via access keys or accounts, `DeployContract` and `FunctionCall` requests, a 15-minute request cooldown, a default of 12 active requests per key, and `--useLedgerKey` for Ledger signing. The README says: "Please do your own due diligence … no guarantee that this contract doesn't have issues." **No delay or time-lock.** | `multisig2/README.md` | PRIMARY |
| AstroDAO (astrodao.com) | **Appears unmaintained.** `astrodao.com` and `app.astrodao.com` timed out (20 s) on 2026-11-11. No 2026 activity was found. | curl; search | PRIMARY (timeout) / SECONDARY |
| Fireblocks for NEAR | Custody plus staging via partners. Fireblocks Trust Company and Figment launched NEAR staking under qualified custody in June 2026 (SECONDARY). A Fireblocks support article reportedly says "The contract call API for the NEAR protocol is not currently supported" and transactions use **Raw Signing** (SECONDARY snippet). Using Fireblocks to vote on SputnikDAO would therefore need raw signing. | support.fireblocks.io/hc/en-us/articles/6768841931420 (snippet only) | SECONDARY |
| Ledger NEAR app | Supported in Ledger Live ("send, receive and stake"). The `@ledgerhq/hw-app-near` JS binding exists. near-cli supports `--useLedgerKey` (multisig2 README). Trezu and NEAR Business document Ledger flows. | ledger.com blog; npm; NEAR Business docs | PRIMARY/SECONDARY |

### 2.2 Time-lock implementations available on NEAR

| Implementation | What it does | Evidence |
|---|---|---|
| **near-plugins `Upgradable`** (Aurora → `near/near-plugins`, v0.5.3, 2026-06-18) | Code is staged with `up_stage_code` and later deployed with `up_deploy_code`. "Optionally a staging duration can be set, which defines the minimum duration that must pass before staged code can be deployed… **Updating the staging duration is itself subject to a delay**." The default is 0. Roles come from `AccessControllable`. `Pausable` is in the same crate. | `near-plugins/src/upgradable.rs` doc comments (PRIMARY). An audit is listed: Hacken "[SCA] Aurora Labs, Plugins, Mar2023" (SECONDARY). Aurora's audit pages disagree on whether the firm was Hacken or AuditOne. |
| SputnikDAO factory auto-update delay | 14 days, for *factory-pushed* code only (#233). | PRIMARY |
| MPC contract TEE grace period | `tee_upgrade_deadline_duration_seconds = 604800` (7 days): "The grace period duration for expiry of old mpc image hashes once a new one is added." Unused launcher hashes have a TTL of 1,209,600 s (14 days). | `v1.signer` `config` view (PRIMARY, block ~224.1M); `crates/contract/src/config.rs` |
| Generic "queue/execute" time-lock contract | **No audited, widely used standalone time-lock contract for NEAR was found.** A 2020 NEAR forum post describes the staged-upgrade idea ("typically 1-7 days") (SECONDARY). | gov.near.org/t/bridge-upgradability-and-governance-plan/633 |

### 2.3 How major NEAR protocols actually govern upgrades (on-chain, 2026-11-11)

| Protocol (account) | Who can upgrade / pause | Time-lock? | Evidence |
|---|---|---|---|
| **NEAR Intents verifier** (`intents.near`) | near-plugins ACL. Super-admins are `intents.sputnik-dao.near` and `intents.near` itself. Role `DAO` is held by `intents.sputnik-dao.near`, whose council of 5 votes **3-of-5** on call, upgrade and transfer. Role `Upgrader` is held by `ctl-intents.near`, an Aurora-style controller whose DAO is the same SputnikDAO and whose `Updater` role is held by one implicit account that is also a council member. `PauseManager` has 6 implicit accounts plus `pm.bridge.near`, and **any one can pause**. `UnpauseManager` is empty, so only the DAO can unpause. `intents.near` holds 9 function-call keys and **no full-access key**. | **None** found. `upgrade()` deploys immediately for `DAO` or `Upgrader`. | `contracts/defuse/src/contract/upgrade.rs`, `mod.rs` (`#[pausable(pause_roles(DAO, PauseManager), unpause_roles(DAO, UnpauseManager))]`); RPC `acl_get_grantees` (PRIMARY) |
| **MPC signer** (`v1.signer`) | **No access keys at all.** Contract updates need participant votes `vote_contract_update` reaching the threshold, currently **11 of 16 participants** (`state`: `threshold 11`). Adding an OS measurement or launcher hash needs threshold votes. **Removing** one needs **all participants** ("since this invalidates attestations of nodes running that launcher"). | No time-lock on code. A 7-day grace period applies to old image hashes. | `crates/contract/src/api/update.rs`, `api/tee_measurements.rs`; RPC `state`/`config` (PRIMARY) |
| **Ref Finance / Rhea** (`v2.ref-finance.near`) | `owner: ref-finance.sputnik-dao.near`, a **3-of-5** council. Two guardian accounts can pause (`guardians`). The contract has 0 access keys. | None visible. | RPC `metadata` + DAO `get_policy` (PRIMARY) |
| **Burrow** (`contract.main.burrow.near`) | `owner_id: burrow.sputnik-dao.near`, a **3-of-5** council. | None visible. | RPC `get_config` + `get_policy` (PRIMARY) |
| **Meta Pool** (`meta-pool.near`) | `get_owner_id` returns `stnear.sputnik-dao.near`, a council of 4 with threshold 55/100, so **3-of-4**. | None visible. | RPC (PRIMARY) |
| **Rainbow / Omni bridge (NEAR side)** (`omni.bridge.near`) | Super-admin and `DAO` is `rainbowbridge.sputnik-dao.near` (5-member council, 2/5 ratio, so **3-of-5**). `UpgradableCodeStager` is `bridge-ops.near`. `PauseManager` is `bridge-ops.near` plus the DAO. There are 0 access keys. | **`staging_duration: null`**: the Upgradable time-lock exists but is **not enabled**. | RPC `up_get_delay_status`, `acl_*` (PRIMARY) |
| HOT (`v2_1.omni.hot.tg`) | There are 0 access keys. The upgrade authority was not determined this session. A Veridise "HOT DAO V2" audit PDF exists (not read). | UNVERIFIED | RPC keys (PRIMARY); veridise.com PDF (not read) |

**Takeaway.** Two governance patterns dominate on NEAR: a **SputnikDAO council of 3-of-4 or 3-of-5**, and **near-plugins ACL with single-key pause roles and DAO-only unpause**. **None of the DeFi and bridge contracts checked enforce an upgrade time-lock.** The MPC network is the outlier: governance by an 11-of-16 vote of operators. A Marginal 7-day time-lock would therefore be stricter than current NEAR practice, which is a selling point for sellers.

### 2.4 Security-council best practice

| Source | Requirement / practice | Label |
|---|---|---|
| **L2BEAT Stages** (forum post #291, raw text fetched) | Stage 1 Security Council: "a multisig setup consisting of **at least 8 participants** and require a **75% consensus threshold**… participants… decentralized and diverse enough, possibly coming from different companies and jurisdictions. If multiple addresses belong to the same entity, they will be collapsed and counted as one… identities (or the pseudonyms)… publicly disclosed." Exit window: "Upgrades initiated by entities outside of the Security Council are allowed if they provide at least a **5 days exit window**." Stage 2: "Users should be provided with at least **30 days** to exit… including upgrades initiated by a DAO." **Changelog: "30 April, 2026: Stage 1 minimum challenge period reduction from 7d to 5d"**. The "≥7-day" figure in the brief is now **5 days** for Stage 1, and 7 days still applies to the Stage 2 challenge period. | PRIMARY (https://forum.l2beat.com/raw/291, /raw/425) |
| L2BEAT 7d→5d rationale (2026-04-30) | "a 5d challenge period is a comfortable lower bound… one day to resolve economic attacks, and 4 days to resolve network delays… The 7d lower bound for Stage 2 remains unaffected." The 7 days was sized for L1 *51%-censorship fork* coordination (~6 days) plus 1 day. | PRIMARY |
| "Outside members ≥ 50%" (brief) | Not in the current Stage text. The Dec 2023 L2BEAT Medium post is cited as the rationale, but the fetch returned 403. | UNVERIFIED |
| **Arbitrum DAO Constitution** | "a committee of **12 members**… Performing any Emergency Action requires a **9-of-12** approval". Non-Emergency Actions "**require a 9-of-12 approval** in order to take effect" and then pass through AIP phases 4–7 as a delay. The older 7-of-12 figure is outdated. "there should not be more than **3 candidates associated with a single entity**". Removal needs ≥9 council votes or a token vote. Terms are 2 years from the March 2026 cohort (docs page). | PRIMARY (https://docs.arbitrum.foundation/dao-constitution) |
| **OP Mainnet** (ETHBEAT/L2BEAT project page) | Security Council "**10/13** — Gnosis Safe with cohorts of 7 + 6"; charter threshold 75%. Upgrades go through a "2/2 multisig composed by the Optimism Foundation and a Security Council"; regular upgrades have a "7-day veto window", and emergency upgrades via "SC + Foundation (2/2), instant". "There is no exit window for users". Challenge period "3d 12h + 3d 12h execution delay". | SECONDARY (aggregator, https://ethbeat.org/scaling/projects/op-mainnet) |
| **ETHBEAT "Security Councils in Practice"** (2026-07-22) | Observed: Arbitrum 9/12; OP 10/13; Celo 6/8 in a 2/2; Taiko 7/9; Scroll 9/12 plus a **3/12 minority pauser**. Advice: "Keep high-liveness duties such as pausing separate from the council… deputy pauser with expiry and revocation". "In a real emergency, the SC may be too slow to act." Use onchain-executable payloads and git-commit references. Avoid a council at Stage 0 if other multisig assumptions already exist. | SECONDARY (https://ethbeat.org/publications/security-councils-in-practice) |

### 2.5 Recommendation (ESTIMATES; decision owner: Jay)

**Shape.**
1. **Gov** is a SputnikDAO v2 instance, voted through the Trezu UI or CLI. It **never executes grant-side changes directly**. Its proposals call `registry.queue(change)` (Marginal's own time-lock), and `execute` becomes callable after the delay.
2. **Clearing and registry code upgrades** use near-plugins `Upgradable` with `up_init_staging_duration`, so the stager and deployer are the gov DAO and the delay is enforced in-contract.
3. **The security council** is a separate SputnikDAO with deny-side permissions only (§3.11). Its lower threshold favours liveness.
4. **Pause** is a near-plugins `PauseManager` role held by individual council keys plus an ops key, so any one of them can pause, following the Intents pattern. **Unpause** needs a council majority.
5. **Disable SputnikDAO factory auto-upgrade** (`FactoryInfoUpdate`) on both DAOs, so DAO code changes only through an explicit `UpgradeSelf` vote.
6. **Do not use a NEAR Business confidential treasury for governance.** Proposal *details* are hidden there, which defeats the public queue that sellers watch. It is fine for the company treasury.
7. **All signers use Ledger.** Avoid custody setups whose NEAR contract-call support is missing (Fireblocks raw signing only).

| Parameter | HDP (testnet demo) | v1 canary (mainnet) | v1 GA / Stage-2-like target | Basis |
|---|---|---|---|---|
| Gov DAO size / threshold | 1–3 dev accounts, 2-of-3 | **5-of-7**, ≥3 outside the company, ≤2 per entity | **≥8, ≥75% (6-of-8 or 9-of-12)**, ≤3 per entity, identities public | NEAR practice is 3-of-5. L2BEAT Stage 1: ≥8, 75%. Arbitrum: ≤3 per entity. |
| Time-lock on grant-side policy (measurement approval, platform admission, cap raise, TCB loosening) | Minutes | **7 days** | 14–30 days | L2BEAT Stage 1 ≥5 d, Stage 2 30 d. MPC TEE grace 7 d. Seller explicit pins bypass this risk. |
| Code-upgrade staging (clearing, registry; KeyPolicy is immutable) | Minutes | **14 days** (clearing is in the confidentiality trust base, PN-10) | **30 days** | L2BEAT Stage 2 30 d. SputnikDAO factory delay 14 d. |
| Changing the staging duration itself | n/a | ≥ current duration (built into near-plugins) | same | near-plugins |
| Security council (deny-side: revoke, freeze, lower cap, remove room) | same as gov | **3-of-5**, majority outside | **3-of-8 to 4-of-8** for deny-only actions. Any action that *grants* or bypasses the time-lock (should not exist) would need ≥75%. | Deny-side errors cost liveness (refunds), not confidentiality, so a low threshold is safer. |
| Pause | dev key | any 1 PauseManager key (council members + ops), **auto-expiring after 72 h** unless the council confirms | same | Intents and Ref (single-key pause); ETHBEAT "deputy pauser with expiry" |
| Unpause | dev key | council majority (3-of-5) | 5-of-8 | Intents: DAO-only unpause |
| Key custody | n/a | Ledger per signer; no shared keys; rotation via proposal | same | NEAR Business docs; multisig2 `--useLedgerKey` |
| Transparency | events | Public queue, events, `transparency/policy-history.json`, member list | plus a published council charter | L2BEAT disclosure requirement |

**Recommended SDD changes (OI-14).**
- §3.11 and §6.2: state that SputnikDAO has no execution delay and the time-lock lives in `registry.queue/execute` plus near-plugins `Upgradable` staging. Use 7 days for policy and 14 days for code in canary.
- §6.2: add a pause row (single-key `PauseManager` with expiry; unpause by council).
- §8: note that NEAR peers (Intents, Ref, Burrow, Omni) run without upgrade time-locks. Marginal's is stricter by design.
- Fill OI-14's "Resolution path" with: "SputnikDAO v2 ×2 + near-plugins; council membership by recruitment".

---

## 3. OI-11: Default parameters (all proposed values are ESTIMATES)

### 3.1 Evidence by parameter

**(1) Leakage budgets and quantisation**

| Analogue | Parameters in use | Label / source |
|---|---|---|
| Kaggle reference mechanism | The released score is rounded to α, "**typically 0.00001**", and released on every submission. The error grows ~√k with the number of submissions k. "Kaggle primarily restricts the rate of re-submission and to some extent the numerical precision of the released scores." Daily limits vary by competition (3/day and 20/day examples seen; 5/day is common lore). The public LB uses ~25–33% of the test set (SECONDARY). | PRIMARY: Blum & Hardt, arXiv 1502.04585, Fig. 7 and §1. Limits: SECONDARY. |
| **Ladder** (Blum & Hardt 2015) | A new score is released only if it beats the best by η, rounded to η. With η = O(n^-1/3 log^1/3(kn)) the leaderboard error is O(log^1/3(kn)/n^1/3). The **parameter-free** variant releases if `R < R_prev − s/√n`, rounds to 1/n, and "such an estimate only reveals log(n) bits"; each step is "roughly at the 0.15 significance level". Real test: Kaggle "Photo Quality Prediction", 12,000 test samples (3,600 public), 1,830 submissions, 200 teams. | PRIMARY (paper text extracted) |
| **Thresholdout** (Dwork et al. 2015, arXiv 1506.02629) | Experiments used "**T = 0.04 and σ = 0.01**", which is "lower than the values necessary for the proof", with Gaussian noise and an overfitting budget **B** decremented each time the holdout disagrees. In the synthetic test (n = 10,000, d = 10,000), standard holdout reuse reported >63% accuracy where the truth was 50% (k = 500). | PRIMARY |
| DP budgets in production | US Census 2020: redistricting ε = 13.64 (ρ = 2.63, δ = 10⁻⁵); DHC person ε = 19.46. Apple LDP per user-day: Health 2, Emoji 4, Safari 8, QuickType 16. Google COVID mobility: 2.64/day. LinkedIn Audience Engagements: 0.15 per query and 34.9 per month. Microsoft telemetry: 1.672 per 6 h. Wikipedia pageviews: 0.72 per user-day. Google RAPPOR is deprecated. | SECONDARY (desfontain.es list, updated 2025-08-18, with primary links) |
| **Password guessing (a deployed QIF budget)** | NIST SP 800-63B-4 §3.2.2: limit consecutive failed attempts "on a single subscriber account to **no more than 100**". Look-up and OOB secrets must be "at least six decimal digits". → 100 guesses against a 10⁶ space give min-entropy leakage ≤ log2(101) = **6.66 bits of a 19.93-bit secret (~33%)**. | PRIMARY (NIST page); arithmetic is mine |
| k-anonymity range query (HIBP) | "the first 5 characters" of the hash (20 bits of 160) are sent. "A range search typically returns approximately **800** hash suffixes". Padding gives "a random number of records between 800 and 1,000". | PRIMARY |
| Timing-side-channel bucketing | Köpf & Dürmuth: deterministic side channel leakage ≤ \|O\|·log2(n+1) bits (mechanism-econ.md). | PRIMARY (prior notes) |

**(2) π anchors**: Expert networks: ~$1,000–1,300 per hour or call to the client, about $300 to the expert (market-2026.md I7, SECONDARY). That is about $17–22 per minute. Research reports: Autonomous Research pay-per-report was "$1,000 for a single company report to $5,000" (SECONDARY, dated). Sell-side access runs $4k–$10k+ per user (SECONDARY). Alt-data: no trial-price survey was found. Lowenstein 2025: more than two-thirds of respondents have alt-data budgets over $1M (SECONDARY). Per-dataset vendor ranges run from free to $500k+/yr (weak vendor guide).

**(3) Challenge windows**

| System | Window | Label |
|---|---|---|
| UMA Optimistic Oracle | "The default liveness window is **two hours**" (examples use 7,200 s). OOv2 now has `setDefaultLiveness` and a bounded `minimumDisputeWindow` (OpenZeppelin audit, 2026-03). | PRIMARY docs / SECONDARY audit summary |
| Across | Root-bundle liveness started at 120 min, was cut to **90 min**, and an RFC proposes 60 min. Bundles are proposed about every 1.5 h. | SECONDARY (forum RFC, docs) |
| Arbitrum One (BoLD) | Challenge period 45,818 blocks ≈ **6.4 days**; ~7 days until claimable. A dispute adds at most one more period, plus a 2-day Security Council grace period. | PRIMARY (docs.arbitrum.io) |
| OP Mainnet | 3d 12h challenge plus 3d 12h execution delay = **7 days** | SECONDARY (ETHBEAT) |
| L2BEAT Stage 1 minimum | **5 days** since 2026-04-30 (was 7) | PRIMARY |
| ZK / TEE fast finality | OP Succinct: proofs "every 1 hour", configurable lower (Succinct blog). Base "Azul" TEE+ZK multiproof reportedly cut withdrawals from 7 days to about 1 day (2026-05-28). | Succinct PRIMARY; Base SECONDARY/UNVERIFIED |

Why rollups need 5–7 days: the window is sized for *L1 51%-censorship* fork coordination (L2BEAT #425). Marginal's W instead has to cover the time to notice a bad verdict, run a re-execution on another vendor (minutes to hours), and get the challenge included on NEAR. That is closer to the UMA/Across regime (hours), stretched for human review on high-value classes.

**(4) Judge floor ℓ_floor**
- MT-Bench (Zheng et al. 2023, arXiv 2306.05685): "strong LLM judges like GPT-4 can match both controlled and crowdsourced human preferences well, achieving over 80% agreement, the same level of agreement between humans." So disagreement runs about 20% even at best (PRIMARY abstract).
- "Judging the Judges" (arXiv 2406.12624): "only the best (and largest) models achieve reasonable alignment… their assigned scores may still differ with up to 5 points from human-assigned scores", plus "a tendency toward leniency" (PRIMARY abstract).
- Adversarial robustness:
  - Raina et al. (arXiv 2402.14016): "short universal adversarial phrases… scores can be drastically inflated such that irrespective of the assessed text, maximum scores are predicted". Judges are "significantly more susceptible… when used for absolute scoring".
  - "One Token to Fool LLM-as-a-Judge" (arXiv 2507.08794): "master keys" such as ":" give false positives across leading models.
  - JudgeDeceiver (arXiv 2403.17710): optimisation-based injection; known defences are "insufficient" (all PRIMARY abstracts).
- **Implication for `L = max(ℓ_floor, min(ℓ₁, ℓ₂))`.** Injection by the *seller* inflates ℓ toward 1. The min-of-two judges and the deterministic D ceiling bound that. Judge *failure, deflation or parse failure* pushes L down to ℓ_floor, so **the floor caps the seller's worst-case loss from judge error at (1 − ℓ_floor)**.
- **min-of-two bias (my derivation).** For two iid judges with noise σ, E[min] = μ − σ/√π ≈ μ − 0.56σ. With σ ≈ 1–2 points on 0–10 (ESTIMATE, consistent with "up to 5 points" worst cases), the downward bias is about 0.6–1.1 points (6–11% of L) before the floor applies.

**(5) Minimum context size**
- k-anonymity practice: k = 5–10 is common, and "uncommon… to use values of k above 5" (El Emam and Dankar via SECONDARY).
- The CMS cell-suppression policy bars displaying cells of 1–10, i.e. ≥11 (HHS-hosted guidance, PRIMARY via snippet). CDC WONDER uses <10 (SECONDARY). HIBP's anonymity set is ~800–1,000.
- **These do not transfer directly.** In knowledge@1, per-claim novelty is `maxSim` over buyer context sentences. A prober can pad 29 junk sentences around one candidate claim, so context *size* does not dilute a membership test. This is the k-anonymity analogue of an attacker supplying the other k−1 records (the "n−1 attack", known concept, UNVERIFIED this session). Only the **budget**, **per-identity sub-budgets**, **anchored snapshots with a cooling period**, and blind mode bound it. The need weighting (AC-39) protects the *good's* claim weighting, not the context side.

**(6) Duration classes**
- Askarov, Zhang & Myers, CCS 2010 (PRIMARY text): "simple mitigation schemes can ensure that no more than log²(t) bits of information are leaked". When a slot is missed, "double the quantum q… Doubling the quantum ensures that in time T there can be at most log(T+1) misses". **Theorem 1**: I(X; Y,Z) ≤ H(Z) + I(X; Y), so total leakage is at most storage leakage plus the timing channel's entropy.
- Köpf & Dürmuth: the bound scales with the number of distinguishable observations (mechanism-econ.md).
- **Implication.** If every job ends exactly at its class boundary, timing reveals only on-time versus timeout. A content-dependent timeout is then an extra outcome symbol. Either debit the outcome alphabet as 3 symbols (`mbits(3)` = 1,585 mbits) or make timeouts depend only on public events.

### 3.2 Debit arithmetic for knowledge@1 (from §3.8 and §3.15.1 alphabets)

`mbits(11) = 3460`, `mbits(21) = 4393`, `mbits(3) = 1585`.

| Mode | Debit per appraisal | Appraisals per 32-bit budget | per 64-bit budget |
|---|---|---|---|
| Sealed, blind | 1,000 mbits (1 bit) | 32 | 64 |
| Sealed, all 3 shown fields (novelty, relevance, verifiable share; 11 levels each) | 1,000 + 3×3,460 = 11,380 | 2 | 5 |
| **Open, blind** (2 components at 21 levels + 2 judges at 11) | 1,000 + 2×4,393 + 2×3,460 = **16,706** | 1 | 3 |
| R2 value-indexed with q = 1,000 bps | adds 3,460 | — | — |

**Inconsistency found.** The HDP sample `listing.toml` sets `sub_budget_bits_per_identity = 4`. Any **Open-mode** appraisal (16.7 bits), and any Sealed appraisal showing even two fields (7.9 bits), can then *never* be reserved by a single identity. Open is the HDP default (§6.2). Either set the sub-budget to at least one `max_debit` for the listing's mode, or derive it as a fraction of the budget with a floor of `max_debit`.

### 3.3 Proposed defaults (ESTIMATES)

| Parameter | Proposed default | Range | Evidence and reasoning | Confidence |
|---|---|---|---|---|
| `budget_bits`: knowledge memo, Sealed default | **32 bits** | 16–128 | NIST lets 100 guesses leak ~6.7 bits of a ~20-bit secret (~33%). A memo of 20–50 claims has far more entropy, but each 1-bit answer can be one chosen-context membership test. 32 gives 32 blind appraisals or 2 fielded ones. Ladder and Thresholdout show useful oracles can run on a few released bits. | Low–Med |
| `budget_bits`: low-entropy goods (signals, exploits) | **8 bits**, blind only, no content-correlated fields | 4–16 | One bit can be the whole secret. SPEC already bans content-correlated fields for these classes. | Low |
| `budget_bits`: datasets and eval sets [v2] | 64–128, with **Ladder release** (parameter-free variant) instead of raw scores | — | Blum & Hardt; Thresholdout T = 0.04, σ = 0.01 | Med |
| Quantisation of shown fields | 11 levels (10%) for fields; 21 levels for committed components | 5–21 | Kaggle releases ~16.6 bits per score (α = 1e-5), the case Blum & Hardt criticise. Coarse alphabets keep the debit near 3.5 bits per field. | Med |
| `sub_budget_bits_per_identity` | `max(4 bits, max_debit(mode))`, and ≤ 25% of budget | — | Fixes the §3.2 inconsistency. Keeps griefing per Sybil bounded. | Med |
| `verified_reserve` | 0.25 (keep) | 0.2–0.5 | Anti-griefing (mechanism-econ.md row 198) | Low |
| `π` (price per bit) | **π = r × ask / budget_bits with r = 0.5.** For ask 400 and B = 32 that is **6.25 USDC per bit**; a blind appraisal costs about $6 plus compute. | r = 0.25–1.0 | A griefer who exhausts the budget then pays the seller r × ask, which makes griefing compensated. Cross-check: $6 is about 20 seconds of a $1,000–1,300/h expert call. The HDP placeholder (π = 2, B = 64, ask 400) implies r = 0.32. | Low (pilot) |
| Minimum context size | **≥ 30 sentences** (keep) **plus** a snapshot anchored ≥ 24 h before the job **plus** at most one active context per identity per listing | 20–100 sentences; 6–72 h cooling | k = 5–10 and cell ≥ 11 are the norms in other fields, but padding defeats size against `maxSim`. Treat size as hygiene and let the budget and sub-budget be the bound. | Low |
| `ℓ_floor` | **0.6** (keep) in HDP and canary with NEAR AI judges. **0.5** once self-hosted, injection-hardened judges pass benchmarks. | 0.4–0.8 | Judges disagree with humans ~20% at best. min-of-two biases L down ~6–11%. Parse failures resolve to the floor (AC-41). Injection can drive absolute scores to the extremes. The floor bounds seller loss at 40% (or 50%). | Low–Med |
| Value classes (nominal = upper bound) | L ≤ $1k; M ≤ $10k; H ≤ $100k (k-of-n in v2); above $100k not allowed in v1 canary | — | Interposer attacks cost $10–$1,000 in parts (SPEC T1), so caps must assume host compromise is cheap. Keep per-platform value at risk per epoch small. | Low |
| Per-platform cap per 24 h epoch (canary) | ≤ 10× class-M nominal ($100k) total, and ≤ 1 class-H release per platform per epoch | — | NDAI threshold intuition (SPEC §4.7.5). Needs the §8.9 calibration. | Low |
| `W` challenge window | **HDP 10 min; L 24 h; M 72 h; H 7 days** (v2 with k-of-n) | 2 h – 7 d | UMA 2 h and Across 90 min cover automated bonded disputes. Rollups use 5–7 d for L1 censorship, which Marginal does not need. Human review of high-value verdicts and vendor re-execution need hours to days. The cost is seller cash flow. | Med–Low |
| Duration classes | Geometric ×2 ladder: **30 s, 60 s, 120 s, 240 s, 480 s, 960 s**. Each (appraiser, input size class) picks the class at the **p99.9** measured runtime +20%. Overrun gives Timeout. | ×1.5–×2 steps | Askarov et al. 2010 (doubling quanta, Theorem 1); Köpf & Dürmuth (few observable buckets) | Med |
| Outcome alphabet when timeouts are content-dependent | Debit `mbits(3) = 1,585` instead of 1,000, **or** guarantee timeouts arise only from public events (room expiry, RPC) | — | Theorem 1: timing entropy adds to leakage | Med |
| Time-lock | 7 d policy; 14 d code (canary) | 5–30 d | §2.5 | Med |

### 3.4 What still needs pilots or a red team
- (a) Real knowledge@1 runtimes per size class, to set duration classes.
- (b) A red-team chosen-context probing campaign to see how many bits a membership test really costs in practice (SPEC §8.8).
- (c) Willingness to pay per blind appraisal from 3–5 design-partner funds, to set r.
- (d) Judge agreement on our 0–10 relevance task, using two families plus human labels, to set ℓ_floor.
- (e) Dispute latency in a canary, to set W.

---

## 4. OI-13: Sealed-mode disclosure policy

### 4.1 Precedents

| Precedent | What is disclosed, and when | Relevance | Label / source |
|---|---|---|---|
| **US federal sealed bidding** (FAR 14.402-1) | "personally and publicly open all bids… if practical, read the bids aloud… have the bids recorded". Examination by interested persons is permitted. | **Full post-close price disclosure**, but for standardised goods where a bid reveals a price, not the bidder's private knowledge. | PRIMARY (acquisition.gov, FAC 2026-01) |
| **US negotiated procurement debriefing** (FAR 15.506(d)–(e)) | Losers learn the overall evaluated cost or price and technical rating of the *winner* and themselves, plus rankings. "The debriefing **shall not include point-by-point comparisons** of the debriefed offeror's proposal with those of other offerors". Trade secrets and "Commercial and financial information that is privileged or confidential" are excluded. | Closest analogue to novelty scores. **Aggregates yes, per-competitor detail no.** | PRIMARY |
| FCC spectrum auctions | "limited information disclosure, also referred to as anonymous bidding… withhold, until after the close of bidding" (Auction 89 proposal). Auction 101: gross winning bids are published after the last round. The purpose is to reduce collusion risk. | Delay-then-disclose. Whether all losing bids with identities are released after close varies by auction; it was not confirmed for current procedures. | PRIMARY (Federal Register snippets) / SECONDARY |
| US Treasury auctions | Results are published by bidder **category** (primary dealer, direct, indirect, investor class). "the information available about the ownership of specific securities remains limited" (NY Fed). No per-bidder bids are published (inference). | Aggregate-only disclosure | SECONDARY (NY Fed Current Issues 13-1; TreasuryDirect FAQ) |
| ENS 2017 Vickrey registrar (commit-reveal) | All bids are revealed on-chain in the reveal phase. Unrevealed bids forfeit. | Commit-reveal **necessarily** publishes losing bids. | SECONDARY (EIP-162 mirrors, Medium) |
| **Cryptobazaar** (ePrint 2024/1410) and Ethereum sealed-bid ZK auctions (ePrint 2018/704) | Keep losing bids confidential while the outcome stays publicly verifiable. "No information about the losing bids is leaked" (2018/704). | The ZK literature treats loser privacy as a design goal. That matches Sealed mode. | PRIMARY (ePrint abstracts via search) |
| Flashbots MEV-Share | Users choose "hints" (calldata, logs, function_selector, contract_address, hash). "To use full privacy mode, share this hint and this hint alone." | **User-chosen disclosure granularity**: a precedent for per-listing or per-job options. | PRIMARY (docs.flashbots.net) |
| AWS Clean Rooms | Analysis logging is opt-in per membership (default DISABLED). Logs include the analysis rule, query runners and result receivers. "Members can use the logs to determine if the queries comply with the analysis rules". | **Audit trail to participants**, not the public | PRIMARY (docs.aws.amazon.com) |
| SEC Form 13F | Holdings are disclosed 45 days after quarter end. **Confidential treatment** can omit positions for up to one year if disclosure "would reveal ongoing strategy". | Regulators accept that revealing *what a fund knows or holds* harms it. Precedent for delay and regulator-only escrow. | SECONDARY (law-firm and SEC summaries) |
| FINRA TRACE | Investment-grade trades "over $5 million in size are disseminated as '5MM+'"; high-yield over $1M as "1MM+" (since 2002). | **Capped or bucketed** post-trade transparency | PRIMARY (finra.org) |
| AlphaSense/Tegus transcripts | Enter the library after a 14-day (public) or 90-day (private) delay | Delayed publication of investor knowledge | PRIMARY snippet (competitors-2026.md) |
| Rothkopf, Teisberg & Kahn (JPE 1990) | "Why are Vickrey auctions rare?": they model cases where **third parties capture part of the rent that second-price bids reveal**, and fear of cheating. | Theory of harm from post-auction valuation disclosure | PRIMARY (abstract via IDEAS) |
| OECD bid-rigging guidelines | Advise limiting information flows that help collusion. Exact wording on post-tender publication was **not retrieved** (403 and PDF extraction failed). | Supports minimal disclosure | UNVERIFIED wording |

### 4.2 What a published Sealed opening would reveal
- **The buyer's knowledge.** `N_b` is the need-weighted share of the good's claims that are *not* in the buyer's context. With the public listing description, it reveals how much of a named research topic a fund already knew. v1 links accounts to outcomes (DR-8), so this attaches to an account. That is the 13F "ongoing strategy" harm and the Rothkopf "rent captured by third parties" harm. For MNPI-adjacent categories it also creates "who knew what, when" evidence (SPEC OQ10).
- **The buyer's need.** Judge relevance scores reveal how well the good matched the sealed stated need (DR-3 keeps the need off-chain).
- **The seller's good.** For **no-deal** jobs, publishing `N_b`, `N_pub` and `ℓᵢ` adds about 16.7 bits per job (§3.2) to what the world knows about an *undelivered* good. The Sealed debit charged only 1 bit. **Publication after close would retroactively break the leakage accounting** (AC-12, AC-13) unless the extra bits were debited at job time, which turns Sealed into Open.

### 4.3 Recommendation

**Default: `DisputeOnly` (keep §3.17).** The opening (components, factors, receipts, salt) is encrypted to the dispute key. It is opened only to the dispute panel, and only the dispute *outcome* is published.

**Configurable options**, set per listing by the seller. Options that involve buyer data also need buyer opt-in per job:

| Option | Who sees what | When | Consent | Leakage accounting |
|---|---|---|---|---|
| `DisputeOnly` (default) | Dispute panel only | On dispute | Implied by the terms | None extra |
| `AuditorEscrow` | Also encrypted to a named auditor or regulator key (ID2 compliance) | On lawful request or audit | Seller plus platform terms | None extra (not public) |
| `DelayedAggregate` | Public: bucketed histogram of outcomes or m (≤ 5 buckets) per listing, **only if ≥ 5 distinct buyers** (k ≥ 5; CMS-style ≥ 11 for regulated categories), no per-job values | ≥ 90 days after close (13F/AlphaSense-style delay) | Seller | Pre-debit the aggregate's bits at close (`log2(buckets^k)` upper bound, or a fixed allowance) |
| `PublishWithBuyerConsent` | That job's full opening | After close | **Buyer opt-in for that job** + seller | Bits debited at job time, as in Open mode |
| ~~`PublicAfterClose`~~ (per-job openings without buyer consent) | — | — | — | **Not offered**: it harms buyers (§4.2) and breaks AC-13 |

**Recommended SDD and SPEC changes.**
- §3.17 "Disclosure": replace with the table above. Add `disclosure_policy` to the listing config (§3.24) and to `VerdictV1` binding (a hash of the policy in `job_commitment`, so it cannot change after the job).
- SCR-2 wording: "For Sealed verdicts, public replay covers signatures, proof, conservation, debit and anchoring. Openings (components, factors, model-identity receipts) are disclosed only under the listing's disclosure policy: dispute-only by default; auditor escrow, delayed k-anonymous aggregates, or buyer-consented publication as options. Any disclosure that is public is debited at job time."
- AC-35: public verifiers check that every published opening matches `C` and that its bits were debited.

---

## 5. Sources (accessed 2026-11-11/12 unless stated)

**Hackathon**
- https://nearhackathon.com/HACKATHON.md (PRIMARY; full text saved in scratchpad)
- https://nearhackathon.com/ (PRIMARY; FAQ and judging)
- https://nearhackathon.com/api/projects (PRIMARY; total 594)

**Governance**
- https://github.com/near-daos/sputnik-dao-contract (commits to 2026-05-27; PR #233; `sputnikdao2/src/{proposals,policy,upgrade}.rs`) (PRIMARY)
- https://github.com/near/core-contracts/tree/master/multisig2 (PRIMARY)
- https://github.com/NEAR-DevHub/trezu (release 1.31.4, 2026-11-09) (PRIMARY)
- https://docs.business.near.com/ (`llms.txt`, `what-is.md`, `confidential-treasuries.md`, `governance/voting-settings.md`, `guides/ledger.md`) (PRIMARY)
- https://github.com/near/near-plugins (`near-plugins/src/upgradable.rs`) (PRIMARY); Hacken near-plugins audit listing, Mar 2023 (SECONDARY)
- https://github.com/near/intents (`contracts/defuse/src/contract/upgrade.rs`, `mod.rs`) (PRIMARY); https://github.com/aurora-is-near/aurora-controller-factory (PRIMARY)
- https://github.com/near/mpc (`crates/contract/src/api/update.rs`, `api/tee_measurements.rs`, `config.rs`; release 3.18.0, 2026-10-28) (PRIMARY)
- Mainnet RPC views (rpc.mainnet.near.org, free.rpc.fastnear.com, block ~224.1M): `intents.near` ACL; `intents.sputnik-dao.near`, `ref-finance.sputnik-dao.near`, `burrow.sputnik-dao.near`, `stnear.sputnik-dao.near`, `rainbowbridge.sputnik-dao.near` policies; `ctl-intents.near` ACL; `v1.signer` state/config; `v2.ref-finance.near` metadata; `contract.main.burrow.near` config; `meta-pool.near` owner; `omni.bridge.near` ACL and staging status; access-key lists (PRIMARY)
- https://forum.l2beat.com/t/the-stages-framework/291 (raw) and /t/…/425 (2026-04-30) (PRIMARY)
- https://docs.arbitrum.foundation/dao-constitution; https://docs.arbitrum.foundation/concepts/security-council (PRIMARY)
- https://ethbeat.org/scaling/projects/op-mainnet; https://ethbeat.org/publications/security-councils-in-practice (2026-07-22) (SECONDARY)
- Ledger NEAR: https://www.ledger.com/blog/send-receive-stake-near-tokens-through-ledger-live (SECONDARY)
- Fireblocks NEAR raw signing: https://support.fireblocks.io/hc/en-us/articles/6768841931420-Staking-NEAR (SECONDARY snippet)
- NEAR Business launch: https://crowdfundinsider.com/2026/10/319771-… (403; SECONDARY via search)

**Defaults**
- Blum & Hardt, arXiv 1502.04585 (PRIMARY)
- Dwork et al., arXiv 1506.02629 (PRIMARY)
- https://desfontain.es/blog/real-world-differential-privacy.html (updated 2025-08-18) (SECONDARY)
- https://pages.nist.gov/800-63-4/sp800-63b.html §3.2.2, §3.1.2.1 (PRIMARY)
- https://haveibeenpwned.com/API/v3 (PRIMARY)
- Askarov, Zhang, Myers CCS 2010, https://www.cs.cornell.edu/andru/papers/ccs10.pdf (PRIMARY)
- Köpf & Dürmuth, ePrint 2009/089 (abstract PRIMARY; PDF 403)
- Zheng et al., arXiv 2306.05685; Thakur et al., arXiv 2406.12624; Raina et al., arXiv 2402.14016; arXiv 2507.08794; Shi et al., arXiv 2403.17710; Ye et al., arXiv 2410.02736 (PRIMARY abstracts)
- UMA: https://docs.uma.xyz/developers/setting-custom-bond-and-liveness-parameters (PRIMARY snippet)
- Across: https://forum.across.to/t/reduce-root-bundle-liveness-to-60-minutes/1876 (SECONDARY)
- Arbitrum BoLD: https://docs.arbitrum.io/arbitrum-bridge/withdrawal-monitoring (PRIMARY snippet)
- OP Succinct: https://www.succinct.xyz/blog-articles/introducing-op-succinct-full-validity-proving-on-the-op-stack (PRIMARY snippet)
- Base Azul (SECONDARY/UNVERIFIED)
- CMS cell suppression: https://www.hhs.gov/guidance/document/cms-cell-suppression-policy (PRIMARY snippet)
- k-anonymity norms (SECONDARY)
- Expert networks: `spec-notes/market-2026.md` (SECONDARY)
- Research pricing: https://marketsmedia.com/wide-variation-research-prices/ (SECONDARY)
- Alt-data budgets: https://www.lowenstein.com/… alt-data report 2025 (SECONDARY)

**Disclosure**
- FAR 14.402-1, 15.506: https://www.acquisition.gov/far/14.402-1, https://www.acquisition.gov/far/15.506 (PRIMARY)
- FCC limited information: Federal Register via govinfo (75 FR 32776 etc.) (PRIMARY snippets); Wiley summary of Auctions 101/102 (SECONDARY)
- NY Fed Current Issues 13-1; TreasuryDirect auction FAQ (SECONDARY)
- ENS EIP-162 (SECONDARY)
- Cryptobazaar, ePrint 2024/1410; ePrint 2018/704 (PRIMARY abstracts via search)
- https://docs.flashbots.net/flashbots-mev-share/searchers/understanding-bundles (PRIMARY)
- https://docs.aws.amazon.com/clean-rooms/latest/userguide/query-logs.html (PRIMARY snippet)
- SEC 13F confidential treatment (SECONDARY)
- https://www.finra.org/filing-reporting/trade-reporting-and-compliance-engine-trace/trace-reporting-timeframes (PRIMARY snippet)
- Rothkopf, Teisberg & Kahn, JPE 98(1) 1990, doi 10.1086/261670 (PRIMARY abstract)
- OECD bid-rigging guidelines 2025 (UNVERIFIED wording)

---

## 6. Query and fetch log

**Web searches (30).**
1. Trezu NEAR multisig treasury SputnikDAO launch
2. AstroDAO NEAR shut down / sunset
3. Fireblocks NEAR custody staking
4. Ledger Live NEAR app / useLedgerKey
5. L2BEAT stages Security Council 8 / 75% / exit window
6. Optimism Security Council threshold 2026
7. near-plugins audit Upgradable staging
8. Kaggle 5 submissions per day public LB
9. NIST 800-63B 100 failed attempts
10. expert network call cost per hour
11. alt-data pricing trials
12. single research report price
13. UMA default liveness 7200
14. Across root bundle liveness
15. TEE prover / OP Succinct finality
16. CMS cell suppression
17. k-anonymity k = 5 / 10
18. Askarov predictive mitigation
19. FCC limited information procedures
20. FAR 15.506 / 14.402-1
21. Treasury auction bidder disclosure
22. Rothkopf "Why are Vickrey auctions rare"
23. OECD bid-rigging disclosure
24. ENS Vickrey reveal
25. ZK sealed-bid auctions, losing-bid privacy
26. FINRA TRACE caps
27. AWS Clean Rooms query logs
28. SEC 13F confidential treatment
29. HOT bridge governance
30. Arbitrum BoLD challenge period

**WebFetch (20).**
- nearhackathon.com/HACKATHON.md
- docs.business.near.com
- crowdfundinsider (403)
- l2beat.com/stages (301 → ethbeat)
- forum.l2beat.com/t/…/291
- medium.com/l2beat (403)
- docs.arbitrum.foundation security-council and dao-constitution
- ethbeat.org op-mainnet
- ethbeat.org security-councils-in-practice (after redirect)
- arxiv 1502.04585 abs and pdf (binary)
- desfontain.es real-world DP
- haveibeenpwned API v3
- pages.nist.gov 800-63B-4
- eprint 2009/089
- docs.flashbots.net MEV-Share
- ideas.repec Rothkopf
- OECD component-5 (403)

**curl / gh / RPC (read-only).**
- HACKATHON.md raw; homepage; projects API (q = the earlier prototype's name, chainproof, marginal, veto, guard)
- GitHub metadata for 8 repos
- SputnikDAO README, `proposals.rs`, `upgrade.rs`, `policy.rs`, PR #233
- multisig2 README
- near-plugins README and `upgradable.rs`
- intents tree, `upgrade.rs`, `mod.rs`
- aurora-controller-factory README
- mpc `update.rs`, `tee_measurements.rs`, `attestation.rs`, `config.rs`
- About 25 mainnet RPC view calls (listed in §5)
- L2BEAT raw posts 291 and 425
- Arbitrum constitution HTML
- FAR 14.402-1 and 15.506 HTML
- arXiv API (6 abstracts)
- Ladder, Thresholdout and Askarov PDFs (text extracted locally)
- NEAR Business docs pages
- astrodao.com and trezu.org reachability

**Failed or blocked.**
- crowdfundinsider (403)
- Medium L2BEAT (403)
- OECD pages (403; PDF text extraction failed)
- Köpf & Dürmuth PDF (403)
- The Ladder PDF through WebFetch returned binary (extracted locally instead)
