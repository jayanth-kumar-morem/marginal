# Marginal: build tasks

Source: [`SDD.md`](SDD.md) (SDD-001 v0.2, 2026-11-12). Every task cites the SDD section it builds.

**Revision 2 (2026-11-12).**

- M1 is cut from 128 tasks to 69.
- All eleven demo surfaces (D1–D11) and every readiness check (DRC-1 to DRC-12) are unchanged.
- The cut work moves to M2. [What M1 cuts](#what-m1-cuts) lists each cut and why no demo surface loses anything.

## Where this stands (2026-11-14, 15:30 UTC)

**52 of M1's 69 tasks are closed: every contract, the room, the judges, the Sealed path, the three
host services — and the web app.** E1–E6 are complete (the deploy, `marginal-core`, the immutable
KeyPolicy, and clearing from a listing through a funded job, a key release, a priced verdict,
settlement, delivery and a claim); E7 the room's reproducible build and job loop; E8 the worker, the
sealed-box crypto, MPC CKD recovery, the appraisal pipeline, `knowledge@1` from the measured image
and `dataset-lite@0`; E9 the judges with the API key outside the room; E10 Sealed verdicts end to
end; E11 the gateway, operator agent and compliance service; **E13 all seven pages**, with E12's
verifier and the SDK's browser crypto built underneath them.

**What is left is the demo itself:** E12's two **Done:** lines (a testnet settlement to replay, the
SDK's remaining builders), E14.3's three scripts, and E15 (the testnet deploy, DRC-1 to DRC-12, the
video and the submission; the README is written). E14.1 and E14.2 are closed, so the demo's spine
now runs on a real chain against a measured corpus.

**Nothing has yet run on real hardware or on testnet.** The room has never booted in a CVM (E7.1,
[P-1](#paid-and-account-gated-steps-jay)), no key has been derived through the real MPC network
(E8.2), no NEAR AI receipt is real (E9.1, [P-2](#paid-and-account-gated-steps-jay)) and nothing is
deployed to testnet ([P-3](#paid-and-account-gated-steps-jay), free). The web app reads a local
sandbox today; it cannot write to one, because no browser wallet signs for a sandbox.

**The one thing blocking a live demo is a room.** A job needs an eligible room, and the sandbox
deploys the real KeyPolicy, which refuses a room without a real TDX quote. So `/listings` and
`/listing/[id]` show real chain data, every other page shows an honest empty state, and the pages
that need a settled job were verified against a stub RPC built from the view shapes they are typed
against. E14.1 (near-workspaces with `keypolicy-sim`) is where that becomes a real end-to-end run,
and the testnet deploy is where the demo becomes real.

**Ten tasks are code-complete but cannot be ticked**, because their **Done:** lines name something
only a live room, a key, a testnet or another task can show: E3.2, E3.3, E3.6, E7.2, E7.4, E8.2,
E8.5, E8.6, E9.1 and E12.2. Each carries a **To close** line with the exact steps.

**Order note.** E11 and E13 were built before E12 was finished: the services and the pages are P0
and on every surface, and the SDK's remaining transaction builders are only needed by the write
paths, which cannot be exercised until the testnet deploy.

**`make check` passes with 100% coverage on both sides**, and `make web` builds the app.

## How this list works

- **Milestones.**
  - `M1`: the Hackathon Demo Profile (HDP) on testnet. It contains only what makes a DRC pass.
  - `M2`: the v1 mainnet canary. It holds everything M1 cut.
  - v2–v4 are not built.
- **Priority inside M1** follows the demo surfaces (SDD §1.6):
  - `P0`: D1, D2, D3, D4 and D11.
  - `P1`: D5, D6, D7 and D8.
  - `P2`: D9 and D10.
- **One sub-issue ≈ one PR.** Each has a **Done** line, and tests ship in the same PR as the code. `needs` lists hard dependencies only.
- **Parallel tracks** after E1–E2:
  - contracts: E3–E6 and E10 — **E3–E6 and E10 are closed**, so nothing is left on this track;
  - room: E7–E9;
  - off-chain: E11–E14.
- **What each open task needs from the contracts** is written into it, under "From the contracts": the exact message, operation or view, so nobody has to re-read six epics of notes to build against them. Every such operation has a vector in `fixtures/vectors.json`.

### Do these first

These three carry the most risk. Each is the opening step of a task, not a separate spike.

1. **E7.1** Boot a Phala CVM and record a real quote. Spike S-4. **Still open**, and it needs [P-1](#paid-and-account-gated-steps-jay).
2. **E8.2** Derive a key through MPC CKD from a dev account and recover it in TypeScript. Spike S-1. **Still open**: KeyPolicy's side of the call is built and tested against a mock MPC, with the argument layout copied from near/mpc 3.19.0, but no real derivation has run.
3. ~~**E3.3** Register that quote through the locked tee-verifier. Spike S-2.~~ **The contract half is retired (2026-11-13):** the sandbox runs the real locked verifier (`fixtures/tee-verifier.wasm`, code hash `8SrqVCh3…VL3`) against a real TDX quote and it answers inside its gas budget — 125 TGas of the 200 it is given. What is left of S-2 is only E7.1's own quote.

### Paid and account-gated steps (jay)

Everything only the user can do, in one place: each row is a step I cannot take, what it costs, and what stays blocked until it happens. Costs are stated before they are incurred (CLAUDE.md working rule 4); nothing here has been bought. `todo:jay` lines in my replies point at these ids.

| # | Step | Needs | Cost | Blocks | Do it when |
|---|---|---|---|---|---|
| P-1 | Boot the room CVM (E7.1) | A Phala Cloud account with a card | **$0.232/h**, so about **$0.25** for a one-hour capture; **$5.60/day** if left up ([SDD §1.5](SDD.md)). It is destroyed after the capture and booted again for the demo, so nothing runs in between | E3.2, E3.3 and E3.6 Done lines; E7.1, E7.4, E7.5; E8.2–E8.5; the room half of E15.1; D3 and DRC-3 | After E7.2 and E7.3 build the image, so one boot captures the fixture. **First** run `phala os-images --prod --json` and confirm a **dstack ≥ 0.6.0** image exists (E3.2 finding 4): with 0.5.x the room can never register |
| P-2 | A NEAR AI Cloud API key (E9.1) | A NEAR AI account | Under **$0.003 per appraisal** ([SDD §1.5](SDD.md)); a few cents for the demo | E9.1, D6, DRC-6. The judge port has a test double, so everything else runs without it | Before E9.1. Not needed for E3–E6 |
| P-3 | Fund the testnet deployer (E15.1) | The `marginal-demo.testnet` account, already created | **Free** (testnet faucet): 18 NEAR, up from 16 since KeyPolicy grew to 235 KB | Every testnet Done line: E3.3, E3.6, E15.1. `up.sh` refuses before creating anything if the balance is short | Before the first testnet deploy. Independent of P-1, so it can be done any time |
| P-5 | Publish the room image (E7.2) | A container registry the CVM can pull from without credentials | **Free** on ghcr.io for a public package | E7.1 and everything behind it: the compose file has to name the image by digest, and a dstack CVM holds no registry credentials (`allowed_envs: []`), so the image has to be **public**. That publishes the room's built `dist/` — the repository stays private either way, but this is a disclosure decision, so it is yours (X-2) | With P-1, before the boot: `room/image/build.sh image` prints the digest to push and to pin |
| P-4 | Submit (E15.5) | A person: the repo visibility decision (X-2), an X post, the submission form | **Free** | E15.5 | Last. Re-read the rules first; they may have changed |

**Nothing above is bought or started by me.** P-1 and P-2 cost money, so I stop and ask; P-3, P-4 and P-5 are free but only the user holds the account — and P-5 is a disclosure decision, not a cost.

## Simplicity rules

1. **M1 is the demo.** A task that does not help some DRC pass belongs in M2.
2. **Formats are final in M1.** Borsh data formats are fixed from day one, each with a version byte. Admin, governance and policy interfaces may still change in M2.
3. **Fallbacks only on failure.** RoomSealed and AttesterQuorum are built only if CKD or the tee-verifier fails.
4. **Read state from contract views.** There is no indexer:
   - one process per role, all in one docker compose file;
   - SQLite wherever a database is needed.
5. **Flag simulation at once.** Every simulated element sets its `simulated_flags` bit in the PR that adds it.

## Epic index

| Epic | Scope | Tasks | Done | Demo surfaces |
|---|---|---|---|---|
| [E1](#e1-repo-and-deploy) | Repo, test token, deploy script | 3 | **3** | all |
| [E2](#e2-marginal-core) | `marginal-core` | 4 | **4** | all |
| [E3](#e3-keypolicy-immutable) | KeyPolicy (immutable) | 7 | **4** (3 built, waiting on a live room) | D1, D3 |
| [E4](#e4-clearing-rooms-listings-snapshots) | Clearing: rooms, listings, snapshots | 6 | **6** | D1, D3, D8 |
| [E5](#e5-clearing-jobs-funding-leakage-agents) | Clearing: jobs, funding, leakage, agents | 7 | **7** | D1, D4, D5 |
| [E6](#e6-clearing-verdicts-settlement-claims) | Clearing: verdicts, settlement, claims | 5 | **5** | D1, D6, D7, D8, D11 |
| [E7](#e7-room-image-and-supervisor) | Room image and supervisor | 5 | **2** (2 more built, waiting on a live room and on E8) | D1, D3 |
| [E8](#e8-room-worker-and-appraisers) | Room worker and appraisers | 7 | **5** (2 more built, waiting on a live MPC derivation and on E14.2's corpus) | D1, D8, D9 |
| [E9](#e9-judges) | NEAR AI judges | 1 | — (built, waiting on a key) | D6 |
| [E10](#e10-sealed-verdicts-d10) | Sealed verdicts and ZK | 3 | **3** | D10 |
| [E11](#e11-services) | Gateway, operator agent, compliance | 4 | **4** | all |
| [E12](#e12-sdk-and-verifier) | SDK and `replay-ts` | 2 | — (both built in part: the SDK's crypto and the verifier) | all, D2 |
| [E13](#e13-web-app) | Web app | 7 | **7** | all |
| [E14](#e14-tests-fixtures-and-demo-scripts) | Tests, fixtures, demo scripts | 3 | — | D4, D5, D6, D11 |
| [E15](#e15-demo-and-submission) | Demo and submission | 5 | — | all |
| [E16–E19](#m2-v1-mainnet-canary) | Mainnet canary | — | — | — |

---

## Decisions

| ID | Decision | Status | Blocks |
|---|---|---|---|
| X-1 | **Repo (OI-10)** | **Decided: a new Marginal repo.** It replaces LETHE as one of your two allowed entries; ChainProof Guard stays the other (Q-015). | E1.1, E15 |
| X-2 | **Patent and licence (§10).** File a provisional or record a decision not to file, then pick MIT or Apache-2.0. | Acknowledged. Keep the repo private until it is settled, because a public push is a public disclosure. | Public push, E15.3 |
| X-3 | **Vendor trials (OI-24).** Sumsub and TRM Labs. | Acknowledged; M2 | E18 |
| X-4 | **Payout-hold "control" (OI-19, DR-16)** | **Decided: minimal.** Holds expire after a contract-fixed maximum (30 days, estimate) unless renewed with a fresh screening. A sanctions match goes to the issuer's freeze or a licensed partner. Counsel confirms before canary. | E16 |
| X-5 | **CFTC comment (OI-20).** Matters for v3 only. | Open; comments close **2026-11-18** | — |
| X-6 | **Data and model licences (OI-21).** MS MARCO, ANLI, TAP-DLND. | Open; M2 | E17 |
| X-7 | **1Click partner agreement (OI-22)** | Open; M2 | E16 |
| X-8 | **Governance members (OI-14).** At least 3 outside members. | Open; M2 | E19 |
| X-9 | **Counsel brief (OI-18, §11.3)** | Open; M2 | Canary launch |
| X-10 | **Trademark clearance for "Marginal" (PN-14)** | Open | Public use of the name |

## What M1 cuts

None of these is needed for any DRC.

| Cut from M1 | Why every demo surface still works | Moves to |
|---|---|---|
| Spikes as separate tasks | Each spike is the first step of the task it de-risks (see [Do these first](#do-these-first)). S-3 runs inside E10.2 and S-5 inside E9.1. S-6 is dropped with bge-small. | — |
| A separate `registry` contract | Room policy is a module inside clearing, and KeyPolicy is initialised with `registry = clearing`, so KeyPolicy's interface is unchanged. This also removes an async cross-contract hop from `request_appraisal`. | E16 |
| Time-lock, upgrade staging, pause, dev DAO | No demo surface shows governance. In HDP, `gov` is a dev account labelled `gov.profile = demo`. | E19 |
| Registry deny-side methods; KeyPolicy `freeze`, `unfreeze`, `retire` | No demo surface shows them. Mainnet uses a new KeyPolicy version anyway. | E16 |
| RoomSealed mode | CKD is live on testnet. Contract tests use a mock MPC contract instead. | Only if CKD fails |
| Value-at-risk caps, identity tiers, anonymity-set minimum, identity sub-budgets, verified-buyer reserve | D4 needs only the global leakage budget and nullifiers. | E16 |
| Fast-path yield; `Appraise` inside `ft_transfer_call` | The async path with polling meets DRC-1's 3-minute target. Prefunded balances serve both buyers and agents. | E16 |
| Push payouts and refund routes | Refunds credit the buyer's balance, and seller proceeds credit a claimable balance. The route is still recorded and cited (D7), and the OFAC block happens at `release_held` (D8). | E16 |
| R2, R3 and shown fields (`DisplayMode::Fields`) | Every demo uses R1 in Blind mode. Open mode already publishes the components. | E16 |
| Re-delivery, disputes, the `Revoked` and `Fault` states | No demo surface shows them. | E16 |
| A separate `zkverify` contract; sealed openings | D10 verifies the proof inside clearing in one call (about 36 TGas). | E16 |
| Egress enforcement (nftables, worker isolation, proxy), the second-RPC cross-check, duration-class wait, sealed job log, typed logger | D3 shows attestation, not egress. Under CKD, the job-commitment proof makes the second RPC unnecessary (DR-5). | E17 |
| bge-small, NLI, τ calibration, AC-38–AC-40 benchmarks | LETHE's MiniLM with its τ (0.78 / 0.45) already separates Fund A from Fund B. One embedder also serves lift-lite. | E17 |
| Screening beyond the MNPI lexicon and rules | D8 needs only the MNPI flag. | E17 |
| A deployed sim judge; the signer-registry attester | D6 uses the real NEAR AI judges. Gov sets the signer list, with an expiry. The sim judge exists only as a test double. | E18 |
| Indexer, Postgres, WebSocket API, NEP-366 relayer | The web app, verifier and audit export read contract views (`get_job`, `get_settlement`, `get_audit`). Demo accounts hold testnet NEAR. | E18 |
| Compliance Postgres, identity credentials, signed export bundle | Compliance is a small service on SQLite. The export is built from chain data, so it re-verifies without a gateway signature. | E18 |
| CLI, `GuardedBuyer`, `/agents` page, Playwright, CI hygiene gates, nightly verifier | Demo operations run from `scripts/`. D5's approval is a button on `/jobs`. | E18, E19 |

## SDD issues found while planning

To fix in SDD v0.3.

| # | Issue | Proposed fix | When |
|---|---|---|---|
| 1 | §3.4 has `withdraw_listing` call `keypolicy.retire`, but `retire` is keyed to the seller's predecessor ID, so a call from clearing cannot match | The seller signs `retire` as a second transaction | Before the mainnet KeyPolicy (E16); M1 has no `retire` |
| 2 | RoomSealed has no "room ack" method (§3.5 vs §3.4) | Accept `submit_verdict` from `Assigned` | Only if RoomSealed is ever built |
| 3 | Clearing's setters cite a time-lock that only the registry defines | One shared time-lock module | E19 |
| 4 | No method lets attesters write NEAR AI signer entries | `attest_signer(entry, sigs)`. M1 uses a gov setter instead. | E18 |
| 5 | `get_jobs_for_room` is used in §3.6 but missing from the views | Add it | E4.1 |
| 6 | `DryQuote` has no NEAR-side recipient | The seller claims proceeds from their claimable balance | E6.5 |
| 7 | Lift-lite uses MiniLM while knowledge uses bge-small | One embedder (MiniLM in M1) | E8.7 |
| 8 | §3.3 uses types it never defines: `FeeSplit`, `RefundRoute`, `CategoryId`, `BlobRef.size_class`, and the `Tier` values. `FormulaParams` appears only as a field access. | Defined in `marginal-core` (E2.1): `FeeSplit {compute, treasury, operator_pool, assurance_pool}`, `RefundRoute {Balance, NearAccount, IntentsAccount}`, `CategoryId(u16)`, `size_class: u8`, `Tier {Id0..Id3}` (SPEC §4.13.1), `FormulaParams {delta_star_bps}`. Copy them into §3.3. | SDD v0.3 |
| 9 | `SettlementRecord.v` is the Open-mode valuation, which collides with the version byte `v` that every stored record now starts with | The valuation is `value` in code | SDD v0.3 |
| 10 | §3.8 says the millibit table is "generated by build.rs" | A checked-in table plus a test that verifies every entry with big integers. Same guarantee, no build-time cost. | SDD v0.3 |
| 11 | §3.8's `max_debit` calls `unshown_component_alphabets(mode)`, but shown fields are separate appraiser outputs (§3.15), not views of components | Open mode charges every component. A shown field adds its own alphabet when `DisplayMode::Fields` is built (E16.6); until then `Fields` is refused. | E16.6 |
| 12 | §3.7's `mul_div` returns `u128`, but division by zero and an overflowing result are possible | `mul_div` returns `Result`; `valuation` also refuses `m > 10⁴`, which would break AC-3 | SDD v0.3 |
| 13 | §3.17–§3.19 sketch the signed messages with gaps: `OpenBody`, `SealedBody`, `VerdictStatus` payloads, `JudgeFactor`/`ModelProof`, `DeliveryV1`'s entry tuple, `AuditEntry.subject_id`, and the `kind` of an audit entry are not defined | Defined in `marginal-core` (E2.3): `OpenBody {components, factors, shown}`, `SealedBody {commitment, shown, outcome, price, proof}`, `JudgeFactor {model_id, factor_bps, proof}`, `ModelProof` as in §3.16, `ShownField {id, index}`, `DeliveryEntry {recipient, ciphertext}` (same bytes as the tuple), `AuditEntry.subject_id: u64`, `AuditKind` = the §3.10 catalogue in order. Copy them into §3.17–§3.19. | SDD v0.3 |
| 14 | AC-4 / §3.9.1 give the conservation invariant but no function | `check_conservation(deposit, buckets, moved_out)`: `deposit == Σ buckets + moved_out`, exactly. The settlement split by outcome (§3.9.2) is E6. | SDD v0.3 |
| 15 | `VerdictV1` and `ForgetCertificateV1` say "version byte follows" the domain, but have no version field | Versioned by name and signing domain (`"marginal/verdict/v1" ‖ borsh`), not a byte. Stored records (`Listing`, `Job`, …) keep the leading `v: u8`. §3.1 also lacked `crates/marginal-core-wasm/` and `fixtures/`; both are added. | SDD v0.3 |
| 16 | §3.13 binds a room by `SHA-512("marginal-room-v1" ‖ chain_id ‖ keypolicy ‖ sign_pk ‖ box_pk ‖ nonce)`, a concatenation of two variable-length strings | `SHA-512("marginal-room-v1" ‖ borsh(RoomBinding))`: Borsh length-prefixes the strings, so no two bindings give the same bytes. Implemented in `marginal-core::attest` (E3.2). Update §3.13 and the room (E7/E8). | SDD v0.3 |
| 17 | §3.13 never says who holds the key a quote names: a quote proves software, not key possession, so anyone with a TDX machine could register another room's public key under their own box key | A registration carries a signature by the room's signing key over `"marginal/room-pop/v1" ‖ report_data`; KeyPolicy checks it (E3.2/E3.3). A registered key keeps its box key, class, measurement and PPID. | SDD v0.3 |
| 18 | §3.13 nonces are not tied to an account, so anyone can spend an operator's nonce (a griefing front-run) | A nonce is bound to the account that asked for it (E3.3). Storage for nonces, pins, attestations and tickets is paid by the caller (KeyPolicy has no owner to top it up). | SDD v0.3 |
| 19 | §3.1 lists `marginal-attest/`, a fork of near/mpc's attestation crate. Their `attestation` and `tee-verifier-interface` crates are `no_std` and light, but neither is published to crates.io, their event log is JSON-shaped where a contract needs Borsh, and their replay is bundled with near/mpc's own policy | No fork and no git dependency on their monorepo from an immutable contract. The 20-line replay and the verifier's Borsh types live in `marginal-core::{attest,verifier}`, checked against a real quote and event log (`fixtures/`) and read against their implementation (E3.2). `crates/marginal-attest/` is not created. | SDD v0.3 |
| 20 | §3.13 requires "an empty instance-id" as if it followed from a fresh instance. In dstack it is empty **only** when `app-compose.json` sets `"no_instance_id": true` (`dstack-util/src/system_setup.rs:3114`); otherwise it is always 20 bytes | Say so in §3.13 and put the flag in the §3.13 `app-compose.json` listing (E7.2 carries it) | SDD v0.3 |
| 21 | §3.13 requires `storage-encrypted = 1` without saying it needs a guest image of dstack ≥ 0.6.0, where that event was added. On 0.5.x there is only `storage-fs` | State the minimum guest version in §3.13; E7.1 checks `phala os-images --prod --json` before booting | SDD v0.3 |
| 22 | §3.13 treats `app-id = compose_hash[..20]` as a property of dstack. It is only the default: 0.6.x lets a deployment pin an explicit app id even without a KMS, and upstream says a relying party must then gate the compose hash separately | Keep the check (it is the tightening that stops an app id outliving its compose) and record in §3.13 that it is our policy, not dstack's guarantee. E7.1 must not pin an app id | SDD v0.3 |
| 23 | §3.13's event order omits `gpu-policy-hash` on CPU-only rooms and the opt-in V2 (canonical-JSON) event-log digest. On 0.6.x `gpu-policy-hash` is emitted unconditionally (`sha256("{}")` with no GPU policy), and `event_log_version: 2` changes every digest | Note both in §3.13. The policy already allows one `gpu-policy-hash`; E7.2 leaves `event_log_version` unset, and our replay implements V1 only | SDD v0.3 |
| 24 | §3.4 gives `submit_provisioning` and `submit_screening` a `sig` but never says what it signs. A relayer account sends both calls, so the room's signature is the only authority: it has to cover the key that gets stored and the result that gets applied, not just the certificate | `marginal_core::reports`: `ProvisioningV1` and `ScreeningV1`, each with its own signing domain, binding chain, contract, job, listing version, room key and payload. Implemented and vectored in E4 | SDD v0.3 |
| 25 | §3.4's `create_listing` row lists the checks but not where they live, and §3.3 gives no input type for them | `ListingSpec` and `validate_spec` in `marginal_core::listing`, so the contract, the SDK and the seller's tooling make the same checks; the contract keeps the ones that need its state (appraiser, token, profile). `PublishSpec` is the same for `publish_listing` | SDD v0.3 |
| 26 | §3.11 has `admit_room` apply "class requirements" and a TCB policy table. In M1 KeyPolicy already admits only `UpToDate`, and no demo surface has a GPU room | The registry checks the platform and the measurement set; class is handled by `eligible`, which only ever offers a room to work for its own class. The TCB table and GPU corroboration stay v2 | E16 |
| 27 | §3.4 gives `request_appraisal` its checks but no input type, and §3.20 defines credentials without signing bytes or a chain binding | `AppraisalRequest` and `validate_request` in `marginal_core::request`; `NullifierCredential` in `marginal_core::credential` with its own domain, binding chain, contract, subject, listing and epoch. Both implemented and vectored in E5 | SDD v0.3 |
| 28 | §3.5 draws the job lifecycle but gives no transition function, so each caller would re-read the diagram | `marginal_core::lifecycle::transition`, one table, with an exhaustive test over every pair of M1 states (E5.1) | SDD v0.3 |
| 29 | §3.4 says `authorize_release` is "`keypolicy-v1` only" and the deposit convention is left open. KeyPolicy (immutable, already built) sends `job_id` as a JSON **number** and attaches **no deposit** | Clearing takes `job_id: u64` and is not payable; the predecessor check is the authorisation, since a receipt from the KeyPolicy contract cannot be forged by an access key. Found by running the real KeyPolicy against the real clearing (E5.6) | SDD v0.3 |
| 30 | §3.9.2 gives `Restricted` a "screening-only share" of the compute fee without saying what the share is | M1 pays the whole compute fee: the room did the work either way, and a fraction nobody has defined would be a number invented in code. Fix the table in §3.9.2 or drop the distinction | SDD v0.3 |
| 31 | §3.16 says a body with a reasoning field is "rejected with factor 0", as a rule of its own. With the strict parse of DR-2, such a body already scores 0: the rule is unreachable on chain | Keep the rule in `marginal_core::judge` for the room and `replay-ts` (which must not publish such a body), and say in §3.16 that on chain the strict parse subsumes it (E6.2) | SDD v0.3 |
| 32 | §3.5's job lifecycle has no way out of `PendingApproval` except approval, so a parked job nobody approves could never be refunded and its funds would be locked for good | `PendingApproval → Timeout` is allowed, and `refund_expired` ends a parked job like any other (E6.4) | SDD v0.3 |
| 33 | §3.13's `app-compose.json` listing is not a deployable file: dstack also requires `manifest_version`, `name` and `runner`, and the listing shows `pre_launch_script: null` where omission is the only unambiguous encoding — dstack's own SDKs drop a falsy `pre_launch_script` when they normalise, which would predict a different compose hash from the one the guest measures | `room/image/app-compose.json` adds the three required keys (`manifest_version: 2`, `name: "marginal-room"`, `runner: "docker-compose"`) and omits `pre_launch_script` entirely. Add all four to the §3.13 listing | SDD v0.3 |
| 34 | §3.13 and §3.14.3 are silent on where the compose hash comes from, so the listing reads as if any JSON with those keys would do. dstack hashes the **file's bytes** (`dstack-util/src/system_setup.rs`: `sha256_file(app_compose_file)`) while its SDKs predict the hash from recursively key-sorted compact JSON — two different numbers for the same keys in a different order | `build.sh compose` writes the canonical form, so both agree, and `room/src/image.test.ts` pins that. Say in §3.13 that the compose hash is the SHA-256 of the deployed file and that the file is written canonically | SDD v0.3 |
| 35 | §3.18 gives `ForgetCertificateV1.attestation_ref` the type `[u8; 32]` and the comment "quote hash ‖ collateral hash". Those are two 32-byte hashes, so the field as written does not fit, and a verifier has no rule to recompute it by | `marginal_core::certificate::attestation_ref(quote_hash, collateral_hash)`: `SHA-256("marginal/attestation-ref/v1" ‖ borsh((quote_hash, collateral_hash)))`, with a vector, so the room and `replay-ts` agree and a certificate can be tied to one KeyPolicy record. Say so in §3.18 | SDD v0.3 |
| 36 | §3.18 requires every forget certificate to carry an `Outcome`, but §3.9.2's outcome table is about appraisals. A provisioning or screening job has no outcome in it, and the enum has no value for "the job ran and nothing was priced" | M1 writes `NoDeal`, which is literally true of both — no value changed hands — and says so in the code. Either give §3.18 a `Completed` outcome for non-appraisal kinds or state that `NoDeal` is the value; `replay-ts` (E12.2) has to accept whichever it is | SDD v0.3 |
| 37 | §3.17 specifies phase 1 from PSE's perpetual powers of tau (`ppot_0080_13.ptau`). That file's host answers **403** (checked 2026-11-14) and PSE's own mirror is a torrent of the 2^28 file, so the ceremony as written cannot be run | `circuits/build.sh` generates phase 1 locally with deterministic entropy and labels the whole setup `dev`, which is what §3.17's own "M1 runs a dev setup" allows. Name a reachable phase-1 source in §3.17, or say that M1's phase 1 is local | SDD v0.3 |
| 38 | §3.17's Sealed mode has no path for a verdict with no price. A restricted good or an unreadable input has nothing to prove, but the mode as written requires a sealed body with an outcome bit, so such a job could only ever time out and its funds would sit until `refund_expired` | A Sealed verdict may carry a status (`Restricted`, `InputRejected`, `InputError`) with **no** body and no proof, and settles like the Open one does. `check_sealed` does that (E10.2) and `a_sealed_job_can_end_without_a_price` pins it. Say so in §3.17 | SDD v0.3 |
| 39 | `get_listing` returns `schema_hash` but not the `OutputSchema` it hashes, so a client cannot compute `max_debit` for Open mode — the one number §3.8 says "the UI must show". Recomputing the hash client-side would mean re-implementing a Borsh layout in TypeScript, which this repo forbids | Either return the schema from `get_listing` (it is small and already public), or add a `schema_hash` op to `marginal-core-wasm` so a client can pin a local table against the chain's hash. `/appraise/[id]` does the latter by hand today: a table of the two shipped appraisers' schemas, used only when its hash matches | SDD v0.3 |
| 40 | Clearing's appraiser registry (`set_appraiser`) has no view, so a buyer cannot see the `compute_fee` their deposit must cover, and `/appraise/[id]` has to label its escrow figure as excluding it | Add `get_appraiser(id, version)` to `views.rs`. It is read-only and the entry is already public | SDD v0.3 |
| 41 | `SIM_SETTLEMENT` exists in `marginal_core::types` and is decoded by the web app, but **no contract ever sets it** — only `SIM_ATTESTATION` and `SIM_JUDGE` are. The HDP settles in `musdc`, a test stablecoin, which is exactly the element that bit is for, so §6.3 rule 1 ("any simulated element sets a bit") is not met for the asset | Either clearing sets `SIM_SETTLEMENT` when the settlement token is not a real asset — which needs a way for the contract to know, so a profile flag or a governance list, and that is a policy decision — or the bit is dropped and §6.3's claim is narrowed to attestation and judges. Until then the README says plainly that the asset is a test token | SDD v0.3 |
| 42 | §3.5's job lifecycle stores `Requested`, and `lifecycle::transition` allows `Requested → Timeout`, but **no job is ever stored as `Requested`**: `request_appraisal` and `approve_parked` both call `assign_rooms` in the same call, so a job appears as `Assigned` or `PendingApproval` and never in between. That transition arm is reachable only from core's unit tests | Either say in §3.5 that `Requested` is a moment inside one call rather than a stored state, or keep it and name what would store it (a deployment with no eligible room would, if `request_appraisal` were allowed to park for one). E14.1's suite covers `PendingApproval`, `Assigned` and `Computing` for exactly this reason | SDD v0.3 |
| 43 | `get_listing` publishes the appraiser as `"knowledge@1"`, a display string, while a verdict's `AppraiserRef` carries `{id, version, formula_id}` and must match the listing's exactly or the verdict is `E_SCHEMA`. So a client that has only views cannot rebuild the reference a verdict needs — E14.1's suite takes it from core's sample, and a non-sample room or a future `replay-ts` recompute could not | Add `formula_id` to `get_listing`'s appraiser, or return the `AppraiserRef` as an object. Not an M1 blocker: the room knows its own appraiser, and nothing in M1 builds a verdict from views | SDD v0.3 |

---

## E1. Repo and deploy

- [x] **E1.1 Marginal repo skeleton** · P0 · §3.1 · needs X-1 (private until X-2)
  - Cargo workspace: `contracts/{clearing,keypolicy,test-tokens/musdc}` and `crates/marginal-core`.
  - pnpm workspace: `room`, `services/{gateway,operator-agent,compliance}`, `apps/web`, `sdk/ts`, `verifiers/replay-ts` and `scripts`.
  - Pinned toolchains: Rust, near-sdk 5.30, cargo-near, Node 22.
  - Contracts built with `cargo near build reproducible-wasm`. No hosted CI (cost): a scoped pre-commit hook runs clippy, eslint, tsc and unit tests; `make ci` is the full local gate.
  - **Done:** `make ci` is green on empty packages.
  - **Completed 2026-11-12.** `make ci` (check, reproducible wasm, e2e) exits 0 locally. Node 22 via `.nvmrc`; Rust pinned to 1.99.1. `repository` in `Cargo.toml` is a placeholder URL (required by `cargo near build reproducible-wasm`), to confirm when the repo is created.
  - **Revised 2026-11-12 (E1 review).** GitHub workflow replaced by `.githooks/pre-commit` (enabled by `pnpm install`). It runs `make check-rust` and/or `make check-node` depending on the staged paths (about 25 s, including the 100% coverage gate), and blocks staged secret keys, `deploy/.keys/`, manifests and `.env` files. Also: removed compiled `.js` that had been committed under `src/` (now gitignored), dropped the unused near-sdk `unstable` feature, and added `CLAUDE.md` with the development rules.
- [x] **E1.2 `musdc` test stablecoin** · P0
  - NEP-141, 6 decimals, NEP-145 storage. Only the faucet account can mint.
  - **Done:** sandbox tests for transfer and storage.
  - **Completed 2026-11-12.** 4 near-workspaces tests: metadata, faucet-only mint, storage gating, transfers.
  - **Revised 2026-11-12 (E1 review).** `mint` emits a NEP-297 `ft_mint` event, and a forced `storage_unregister` emits `ft_burn` for the burned balance; the sandbox test checks the mint event. 13 native unit tests now cover every method, so coverage can be measured (the sandbox tests run on wasm, which coverage tools cannot see).
- [x] **E1.3 Deploy script and profiles** · P0 · §3.24
  - Profiles: `deploy/profiles/{sandbox,testnet-demo}.toml`. In HDP:
    - cooling blocks are 0;
    - W is 10 minutes;
    - only rule R1 is enabled;
    - asset classes are {Knowledge, Dataset (lite)};
    - `gov` is a dev account.
  - `up.sh` runs in order:
    1. Deploy the token.
    2. Deploy clearing.
    3. Deploy KeyPolicy (`registry = clearing`).
    4. Seed the room policy.
    5. Assert KeyPolicy has no access keys. It is created keyless (see the revision note).
    6. Write `deploy/manifest.<profile>.json`.
  - **Done:** one command deploys a fresh sandbox end to end.
  - **Completed 2026-11-12** for `sandbox`: `deploy/scripts/up.sh sandbox [--once]`, verified by `deploy.e2e.ts` (step order, on-chain code hash = built wasm, profile values in `config()`, KeyPolicy has 0 access keys, a second run refuses). Not yet run: `testnet-demo` (needs the funded deployer from E15.1's todo:jay). The seed step is a no-op until E4.3 adds the room-policy module; it fails loudly if a profile lists entries before then. Clearing and KeyPolicy are skeletons with `new` and `config()` only; E3 and E4 extend them.
  - **Revised 2026-11-12 (coverage).** 100% coverage, and the code moved to where it belongs.
    - `paths.ts` and `chain.ts` hold what the CLI and the tests share (paths, `view`, `accountExists`, units); `cli.ts` is the command and `up.ts` only its entry point, so the testnet code path now runs against a local node standing in for testnet (key from the environment, dirty-tree and existing-keys refusals, keys saved).
    - The post-deploy checks (no access keys, config read back) are one tested function, `verifyDeployment`; the code-hash check is `assertCodeHash`.
    - `up.sh` refuses an unknown profile before it starts a build.
    - **Revised 2026-11-12 (E1 review).**
    - **Atomic deploys.** Each contract is created, funded, deployed and initialised in one transaction from the deployer, so no one can call `new` first. Before this, deploy and init were separate transactions.
    - **KeyPolicy is created keyless.** No access key ever exists on it, which is stronger than deleting the key after init.
    - **Keys saved as they are created.** Account keys are written to `deploy/.keys/<profile>.json` (0600) as each account is created, so a failed deploy cannot lose them. On non-sandbox networks the file is never overwritten.
    - **Account existence check.** It now distinguishes "account does not exist" from RPC failures.
    - **Testnet deploy guards.** A testnet deploy refuses a dirty tree and always runs the reproducible build. The manifest records the git commit.
    - **Stricter profile validator.** It now rejects dotted, duplicate or over-long sub-account names and non-URL RPC entries.
    - **Clearing init checks.** `new` rejects an empty token list and a zero challenge window.
    - **Tests.** The e2e test also checks the keys file's mode and contents, that keys are saved incrementally, and that `new` cannot be called again.

## E2. `marginal-core`

- [x] **E2.1 Types and errors** · P0 · §3.3, §4.1
  - All §3.3 Borsh types, each with a version byte. Unbuilt features exist as enum variants only.
  - One error enum with stable string codes.
  - **Done:** round-trip tests.
  - **Completed 2026-11-12.** `crates/marginal-core/src/{types,error}.rs`; tests in `tests/{roundtrip,errors}.rs` (15 tests).
    - **Round trips.** Every type, every enum variant, and both the all-`None` and all-`Some` shape of each of the four stored records. Plus property tests over the numeric extremes (`u128::MAX`, empty and long strings).
    - **Wire format is pinned.** A test fixes every enum's variant order (it is the discriminant), and a byte-by-byte golden layout of `Snapshot` fails if any layout changes. Append variants only; a layout change needs a version bump and a migration.
    - **Version byte.** `Listing`, `Snapshot`, `Job` and `SettlementRecord` start with `v: u8`, which `Record::decode` checks. Wrong version, truncation at every length, and trailing bytes are all refused. Nested types change only with their record.
    - **Errors.** `CoreError` has 48 stable codes: every code in SDD §4.1 plus seven core ones (`E_ARITHMETIC`, `E_FORMULA_DISABLED`, `E_RULE_DISABLED`, `E_DISPLAY_DISABLED`, `E_RULE_PARAMS`, `E_DECODE`, `E_VERSION`). One macro generates the enum, `code()`, `from_code()` and `ALL`. A test reads `SDD.md` §4.1 and fails if a documented code is missing.
    - **Not here:** `VerdictV1` and `ForgetCertificateV1` belong to §3.17 and §3.18 and arrive with their signing bytes in E2.3. JSON views are not in core: `u128` needs string encoding for JavaScript, so the views are built in E4. Clearing's E1 skeleton keeps its own two-variant `AssetClass` and `Rule`: `cargo near` needs JSON and Borsh schemas for every type in a contract's interface, and core's types have none, so E4.1 replaces them with the real view types. SDD gaps filled here are items 8 and 9 under "SDD issues found while planning".
- [x] **E2.2 Pricing and leakage** · P0 · §3.7, §3.8
  - `mul_div`, `judgement_factor` and `ceiling` (`KnowledgeV1`, `DatasetLiteV0`).
  - `measured_index`, `valuation` and `apply_rule` (R1; other rules return disabled).
  - The mbits lookup table, and `max_debit` for Blind mode. Open mode adds components and judge factors.
  - **Done:** proptests for AC-2, AC-3, AC-5 and AC-41; Blind + Sealed = 1,000 mbits; Open ≈ 16.7 bits.
  - **Completed 2026-11-12.** `src/{math,pricing,leakage,leakage_lut}.rs`; tests in `tests/{math,pricing,leakage}.rs` (26 tests). `marginal-core` is at 100% of lines, functions and regions (`make cov-rust`).
    - **AC-2, AC-3, AC-5, AC-41** are property tests, each run at 10⁶ cases (the SPEC's AC-2 bar) with `make props` (38 s, release mode); `make check` runs them at the default 256. Judge factors range over 0, above 100% and `u32::MAX`; floors, budgets (up to `u128::MAX`) and asks are all random.
    - **Blind + Sealed = 1,000 mbits** for any schema. **Open = 16,706 mbits (16.7 bits)** for the knowledge schema: two components at 21 levels and two judges on 11 levels.
    - **Exactness.** `mul_div` uses a 256-bit intermediate and is checked against a big-integer oracle, with the awkward values (`2⁶⁴ ± 1`, `2¹²⁷ ± 1`, `u128::MAX`) over-represented. All 4,096 table entries are checked as "the smallest `k` with `2^k ≥ n^1000`". There are no floats in the crate.
    - **The tests have teeth.** I injected 15 bugs one at a time (a judge raising the price, a dropped floor or clamp, a boundary `>=` turned into `>`, a price set to the value, a dropped carry in `mul_div`, a tampered table entry, a reordered enum, a skipped version check, and more). Every one made a test fail.
    - **Refused, not undercounted.** Rules R2–R5, `DisplayMode::Fields` and `DatasetV1` return `E_RULE_DISABLED`, `E_DISPLAY_DISABLED` and `E_FORMULA_DISABLED`. A posted price of 0 returns `E_RULE_PARAMS`. See items 10–12 under "SDD issues found while planning" for the deviations from §3.7 and §3.8.
    - **Not here.** The contract-side use of `max_debit` (reserve, debit, refusal) is E5; the room consumes the same code as wasm in E2.4.
- [x] **E2.3 Commitments, signing bytes, conservation** · P0 · §3.9.1, §3.10, §3.12.3, §3.17, §3.18
  - Hashes and signing bytes: `job_commitment`, the salted good commitment, verdict and certificate bytes, and the audit-chain step.
  - The AC-4 conservation function.
  - **Done:** `fixtures/vectors.json` committed; conservation proptest passes.
  - **Completed 2026-11-13.** One module per SDD section in `crates/marginal-core/src/`: `commit` (`JobCore`, `job_commitment`, `good_commitment`), `verdict` (`VerdictV1`, `verdict_signing_bytes`), `certificate` (`ForgetCertificateV1`, `forget_signing_bytes`, `certificate_hash`), `delivery` (`DeliveryV1`, `delivery_hash`: needed by E2.4's Borsh for deliveries), `audit` (`audit_step`) and `conservation` (`check_conservation`), over two shared files: `codec.rs` (Borsh and SHA-256) and `json.rs` (the JSON model).
    - **Vectors.** `fixtures/vectors.json` has 47 cases (13 are refusals) covering every operation: pricing, `max_debit`, both commitments, every message's encode, decode, signing bytes and hash, the audit step and conservation. 28 carry an answer worked out by hand that the test asserts independently (for example the D1 example: 1,000 USDC at m = 0.72 is 720 USDC, so a deal at the 400 USDC ask). Regenerate on purpose with `UPDATE_VECTORS=1 cargo test -p marginal-core-wasm --test vectors` and review the diff.
    - **Conservation.** `check_conservation(deposit, buckets, moved_out)` enforces `deposit == Σ buckets + moved_out` exactly, with `E_CONSERVATION` for a missing or extra unit and `E_ARITHMETIC` instead of wrapping. The proptest splits any deposit into the seven buckets plus what moved out (it conserves), then adds or removes one unit anywhere (it does not), and checks that moving value between buckets keeps the total. The settlement split by outcome (SDD §3.9.2) is E6; it will be checked with this function.
    - **Hashes are checked independently.** The tests recompute each hash and signing byte string with `sha2` directly (`SHA-256("marginal/job/v1" ‖ borsh(core))`, `"marginal/verdict/v1" ‖ borsh(verdict)`, and so on), the TypeScript tests recompute two of them with node's own SHA-256, and byte-by-byte golden layouts pin `DeliveryV1` and `AuditEntry`. A test changes each field of a job in turn and requires 20 distinct commitments, so none is left unbound.
    - **The tests can fail.** I injected 17 bugs (a commitment without its domain, salt and good swapped, an audit step that ignores the previous head or the payload, a conservation check that accepts a shortfall, a bucket left out of the total, a changed signing domain, hashes over the wrong bytes, upper-case hex, amounts as JSON numbers, and in the wasm and TypeScript layers a mis-mapped operation, errors reported as ok, a stale memory view and a refusal returned instead of thrown). Every one made a test fail.
    - **SDD gaps filled:** items 13–15 under "SDD issues found while planning".
- [x] **E2.4 wasm package** · P0
  - `@marginal/core-wasm` for the room and `replay-ts`. It exports pricing, `max_debit`, `job_commitment`, and Borsh for verdicts, certificates and deliveries.
  - **Done:** both reproduce `vectors.json` byte for byte.
  - **Completed 2026-11-13.** `crates/marginal-core-wasm/` is a Rust crate (`src/lib.rs`) and the npm package (`src/*.ts`) together.
    - **Interface.** One function, `call(op, input)`: JSON in, JSON out, over 21 operations (everything in the task's list, plus the audit step, the good commitment, conservation and the signing bytes and hashes). The Rust side replies `{"ok": …}` or `{"err": "E_CODE"}` and never panics on input, and `call` throws a `CoreError` with the stable code.
    - **No new tooling.** The module has zero imports and exports only `memory`, `alloc`, `dealloc` and `call_raw`; the TypeScript wrapper is about 50 lines. It builds with plain `cargo build` (`make wasm-core`, 6 s, 586 KB), so there is no `wasm-bindgen` or `wasm-pack` to install or keep in step.
    - **Both consumers reproduce the vectors.** `room/src/vectors.test.ts` and `verifiers/replay-ts/src/vectors.test.ts` each load the wasm through `@marginal/core-wasm` and require every one of the 47 cases to match, with the shared check in the package (`reproduceVectors`) so it is written once. The package's own tests also cover a 1 MB input that makes the module grow its memory mid-call (the wrapper must not keep a stale view), 3,000 calls in a row, and every refusal and failure path.
    - **Coverage** stays at 100%: Rust 1,236 regions and 732 lines including the unsafe pointer functions (driven natively with real pointers); TypeScript 64 tests.
    - **Not done:** a browser build, and E13 found it is not needed: the web app keeps `marginal-core` on the server and the browser reaches it through a route handler (`/api/encode`, `/api/appraise`, `/api/replay`), which also keeps plaintext out of every request. The wasm itself is portable, so a browser build stays available if a client ever has no server. What E13 did change is **how the file is found**: `wasm.ts` holds `import.meta.url` in a variable and reads a string path, because webpack rewrites the literal `new URL(…, import.meta.url)` into an asset that is not on disk and a wrapped `node:fs` refuses a `URL` from another realm. Typed TypeScript interfaces for the JSON model are also left to the consumers (E8, E12), because they would duplicate the Rust types; the vectors are what keep the two sides in step.

## E3. KeyPolicy (immutable)

Each version is deployed once, then its keys are deleted. There is no second reviewer (decision 2026-11-13), so each task's note below records the adversarial self-review instead: what was attacked, what that found, and the bugs injected on purpose to prove the tests can fail.

**Status 2026-11-14: the contract is finished and nothing in E3 is waiting on me.** All seven tasks are built, and E3.1, E3.4, E3.5 and E3.7 are closed. E3.2, E3.3 and E3.6 stay open because their **Done** lines name things that only exist on a live room or testnet, not because code is missing: they need [P-1](#paid-and-account-gated-steps-jay) (the Phala CVM) and [P-3](#paid-and-account-gated-steps-jay) (the funded deployer). Each carries a **To close** line with the exact steps and the errors to expect, so finishing them is a run, not a rewrite. Verified meanwhile: 100% coverage; the full `make ci` gate; the real locked verifier in the sandbox at 125 of its 200 TGas; two real dstack CVMs whose event logs replay to their own quoted RTMR3; 31 injected bugs all caught.

- [x] **E3.1 State, init, views** · P0 · §3.12.2
  - Fixed at init: `chain_id`, `registry` (= clearing in M1), `clearing`, `mpc`, `ckd_domain_id = 2` and `dcap_verifier`.
  - No setters and no upgrade method.
  - **Completed 2026-11-13.** `contracts/keypolicy/src/`: `lib.rs` (state, `new`), `registration.rs`, `pins.rs`, `release.rs`, `views.rs`, and four helpers the others share: `calls.rs` (promises), `events.rs` (NEP-297 plus the audit chain), `fees.rs`, `store.rs` (raw storage, one table prefix per record). `sim.rs` is E3.7.
    - **Immutability is read from the built wasm, not asserted.** The sandbox test parses `keypolicy.wasm` and requires its imports to be on an allow-list that has no `promise_batch_action_deploy_contract`, `_add_key*`, `_delete_key`, `_stake`, `_transfer` or `_create_account`. KeyPolicy makes only function calls (`calls.rs` uses `env::promise_*` directly, because the SDK's `Promise` builder can also add those actions). It also has no setter, owner or upgrade method, calling `new` twice is refused, and the account is created keyless by `deploy.ts` as before. `keypolicy-sim` must have the same imports and exactly one extra method.
    - **Interface.** Request types cross the interface as opaque Borsh bytes (`Base64VecU8`) and views return JSON, because `cargo near` needs ABI schemas for every public type and core's types have none. Views: `config` (including the fees and TTLs), `get_attestation`, `get_pins`, `get_ticket`, `audit_head`. Every state change emits a NEP-297 event carrying `seq` and `head` of KeyPolicy's own audit hash chain.
    - **Storage is paid by the caller.** KeyPolicy has no owner to top it up, so it must not be possible to drain it by calling it. `issue_nonce` 0.002 NEAR, `register_room` 0.01, `set_pins` 0.01, `authorize` 0.005, kept and not refunded. A test stores each method's largest record and checks the fee covers the storage actually used. **Cost:** a demo run pays these from the operator's and seller's testnet accounts; testnet NEAR only.
    - **Deploy balance.** The wasm is 235 KB, about 2.4 NEAR of storage, so the testnet balance for `keypolicy` goes from 2 to 4 NEAR and the deployer needs **18 NEAR** (was 16); `scripts/src/deploy.ts`, its test, `CLAUDE.md`, the profile comment and E15.1 are updated.
- [ ] **E3.2 Attestation checks** · P0 · §3.13 · code done; Done line **blocked on [P-1](#paid-and-account-gated-steps-jay)**
  - Depend on near/mpc's attestation crate at a pinned revision (vendor it only if it will not build standalone). It does the parsing and the RTMR3 replay.
  - Add the `report_data` binding and the required and forbidden event checks.
  - **Done:** the E7.1 fixture replays to its quoted RTMR3.
  - **Built, and every rule checked against real data or dstack's source, 2026-11-13. Stays open on its literal Done line only: there is no E7.1 fixture, because E7.1 needs a Phala CVM the user has to pay for.** The code is `crates/marginal-core/src/{verifier,attest}.rs`.
    - **Two real CVMs replay to their own quoted RTMR3**, neither of them ours: near/mpc's production node (a KMS key provider) and, added here, dstack's own `key_provider: "none"` capture (`fixtures/dstack-none-quote.json`, upstream's `tdx-lite-getquote.json` at tag v0.6.4). The second one runs the key provider a Marginal room must run, so its `key-provider` payload is `{"name":"none","id":""}` byte for byte: the constant is no longer an assumption. Both fail our full policy for stated, pinned reasons (the first has a KMS, the second keeps an instance id and predates `storage-encrypted`), and each reason is asserted rather than described.
    - **Every constant now has evidence**, because an event the policy requires that dstack never writes would make registration impossible, and we would only find out on the Phala machine:

      | Rule | Evidence |
      | --- | --- |
      | event type `0x08000001`; `digest = SHA-384(type_le ‖ ":" ‖ name ‖ ":" ‖ payload)`; `rtmr = SHA-384(rtmr ‖ digest)` from 48 zero bytes | Both real logs replay to their quoted RTMR3; dstack `cc-eventlog/src/runtime_events.rs:23,126,161` and near/mpc `attestation/src/attestation.rs:190,432` are the same algorithm |
      | `key-provider` = `{"name":"none","id":""}` | dstack source (`measurement_name()` is `none`, `id()` is `&[]` hex-encoded, `KeyProviderInfo { name, id }` serialised compactly) **and** the real no-KMS capture |
      | `storage-encrypted` = `1` | dstack `dstack-util/src/system_setup.rs:3261`: `if opts.storage_encrypted { b"1" } else { b"0" }` |
      | no `os-image-hash` proves no KMS | `system_setup.rs:2551`: only emitted after keys come back from a KMS |
      | `app-id` = first 20 bytes of the compose hash | Both real logs; see the caveat below |
      | empty `instance-id` | The real no-KMS log has a **non-empty** one: see the caveat below |
      | TCB `UpToDate`; PPID exactly 16 bytes | The real verifier reply (`status == "UpToDate"`, a 16-byte PPID) |
    - **Four findings that E7.2 must act on**, all from reading dstack rather than assuming:
      1. **`instance-id` is empty only if `app-compose.json` sets `"no_instance_id": true`** (`system_setup.rs:3114`). It has nothing to do with the instance being fresh, which is what §3.13 implies. Without that flag every room is refused.
      2. **`init_script: ""` emits one `init-script-hash` event** of `sha256("")` (a bare string deserialises to a one-element list, with no empty filter). The key must be absent, not empty, or the room is refused.
      3. **Nothing in dstack forces `app-id` to be the compose prefix.** It is the deploy-time app id, which merely *defaults* to `compose_hash[..20]`; dstack 0.6.x lets a deployment pin an explicit one even without a KMS, and says in a source comment that a relying party must then gate the compose hash separately. Requiring the derived value is our own tightening: it is what stops an app id outliving the compose it was issued for. The room must not be deployed with a pinned app id, and never as an upgrade of an existing app.
      4. **The guest image must be dstack ≥ 0.6.0**: `storage-encrypted` does not exist before it (added for 0.6.0; `storage-fs` alone from 0.5.5). §3.13 already assumes 0.6.0 for a different reason ("apps cannot add RTMR3 events since dstack 0.6.0"), so the policy is coherent, but it makes the image version a hard requirement rather than a preference. Upstream's stable line is still 0.5.14 and 0.6.4 is pre-release, and what Phala Cloud actually offers is not published: check with `phala os-images --prod --json` **before** booting the room (E7.1).
    - **Checks, in a fixed order** (`evaluate_quote`): quote signature (the verifier's own verdict), TCB `UpToDate`, not a debug TD, `report_data`, 16-byte PPID, collateral not stale, RTMR3 replay equals the quoted value, then the event policy below. An attestation lasts the earlier of the collateral's expiry and 24 h from now.
    - **Not done:** §3.13 also wants the collateral's *age* checked against a maximum the registry sets. M1 cuts the registry's deny-side methods (E16), so KeyPolicy refuses expired collateral and records `collateral_issued_at` for the registry to judge later.
    - **To close E3.2:** boot the room (E7.1), save its quote and event log beside the others, and assert three things: the log replays to the quoted RTMR3, `evaluate_quote` accepts it with the room's own binding, and a copy with a changed binding, a debug TD or a tampered log is refused.
    - **Deviation: near/mpc's crates are not depended on; their code is the oracle instead.** I checked their tag 3.19.0 rather than assume: `attestation` and `tee-verifier-interface` are both `#![no_std]` and light, so an earlier note here that they "do not build standalone" was **wrong** and is withdrawn. The real reasons: neither is published to crates.io, so depending on them means a git dependency on a fast-moving monorepo inside a contract that can never be upgraded; their event log is JSON-shaped (`EventLog { imr, event_type, digest: hex, event: String, event_payload: String }`, `attestation-types/src/tcb_info.rs:39`) where a contract needs Borsh; and their replay is bundled inside `Attestation::verify` with near/mpc's own policy, not ours. So `marginal-core` keeps its own 20-line `replay_rtmr3` and mirrors the verifier's Borsh DTOs, and both are checked against real bytes.
      - **Their implementation agrees with ours**, read line by line (`attestation/src/attestation.rs:190` and `:432`): start from 48 zero bytes, refuse any RTMR3 event whose type is not `0x08000001`, `digest = SHA-384(event_type ‖ ":" ‖ name ‖ ":" ‖ payload)`, `rtmr = SHA-384(rtmr ‖ digest)`. One difference: they write the event type with `to_ne_bytes`, we write `to_le_bytes`. Both are the same on every target either of us builds for, and the real log proves little-endian is the right answer.
      - The locked verifier's Borsh types are mirrored in `verifier.rs`; the real reply (680 B) decodes and re-encodes to the same bytes, the real arguments round-trip, and the sandbox runs the real verifier wasm, so any skew in that layout fails a test rather than a deploy.
    - **Checks, in a fixed order** (`evaluate_quote`): quote signature (the verifier's own verdict), TCB `UpToDate`, not a debug TD, `report_data`, 16-byte PPID, collateral not stale, RTMR3 replay equals the quoted value, then the event policy, which is §3.13's list in full: exactly one each of `compose-hash`, `key-provider` (payload exactly `{"name":"none","id":""}`), `app-id` (equal to the first 20 bytes of the compose hash), `instance-id` (empty), `storage-encrypted` (= `1`) and `system-ready`; no `os-image-hash`, no `init-script-hash`; at most one `gpu-policy-hash`. Any other event is ignored: the measurement pins what runs. An attestation lasts the earlier of the collateral's expiry and 24 h from now.
    - **Hardening beyond §3.13.** (1) `report_data = SHA-512("marginal-room-v1" ‖ borsh(binding))`, not a plain concatenation: Borsh length-prefixes the two strings, so no two bindings give the same bytes (a test tries). (2) **Proof of possession.** A quote shows what software runs, not who holds a key; with only the quote, anyone with a TDX machine could register a room's public key with a box key of their own in a race with the room. The room signs `"marginal/room-pop/v1" ‖ report_data` with its signing key and the contract checks it. (3) A registered key keeps its box key, class, measurement and PPID: a renewal that changes any of them is refused (`E_ROOM_KEY_IN_USE`). (4) Only TCB `UpToDate` passes; there is no `OutOfDate` allowance in M1.
- [ ] **E3.3 `issue_nonce` and `register_room`** · P0 · D3 · §3.13 · code done; Done line **blocked on [P-1](#paid-and-account-gated-steps-jay) and [P-3](#paid-and-account-gated-steps-jay)** · needs E7.1, E3.2, E4.3
  - **First (S-2):** call `tee-verifier-2026-11-02.testnet` with the E7.1 quote. Check that its code hash is `8SrqVCh3RtHz6mG2eiMwBGZDPkmccA5JiVvqrDYT3VL3`.
  - Calls: `verify_quote_with_collateral_dates` (200 TGas), then `on_quote_verified` (60 TGas).
  - Callback checks:
    - TCB status, collateral age, not a debug TD;
    - `report_data`, the nonce, and a 16-byte PPID;
    - each required RTMR3 event present exactly once, and no `os-image-hash` event.
  - On success: store the `Attestation`, emit `room_registered`, and call `admit_room`.
  - **Done:** the live room registers on testnet; copies with a debug TD, wrong report data or an RTMR3 mismatch are rejected (DRC-3).
  - **Fallback if the verifier fails:** AttesterQuorum.
  - **Built and verified in the sandbox 2026-11-13; stays open: no live room, no testnet.** What is demonstrated, on built wasm in a local chain: the verifier's code hash is `8SrqVCh3…VL3` (the exact wasm NEAR One locked, in `fixtures/tee-verifier.wasm`, deployed in the sandbox); KeyPolicy calls it with the real argument layout and gets the real reply, so **S-2's contract-side risk is retired**; the verifier burns **125 TGas of the 200** it is given (whole call 137 TGas), inside near/mpc's own 90% guard. With a real quote that is not bound to our registration, KeyPolicy gets a real `Verified` and refuses at the `report_data` check; stores nothing. Debug TD, wrong report data, RTMR3 mismatch, a stale collateral, a wrong PPID length and every missing, repeated or forbidden event are each a unit test, and the verifier answering `Rejected` or being unreachable are distinct errors (`E_QUOTE_SIG`, `E_VERIFIER_UNAVAILABLE`).
    - **Not verified:** that Phala's quote passes (E7.1: its PPID, its TCB status, its event log); anything on testnet; the registry side (`admit_room` is a test double until E4.3). The AttesterQuorum fallback is not built, because nothing has failed.
    - **Nonces.** 32 random bytes, valid for 5,000 blocks (about 80 minutes), **bound to the account that asked for them**, spent by the first `register_room` whatever happens next (an operator that must retry asks for a new one). Issuer binding is a self-review finding: without it anyone could watch the chain for a nonce, spend it, and force the operator to start over.
    - **To close E3.3**, once [P-3](#paid-and-account-gated-steps-jay) funds the deployer and [P-1](#paid-and-account-gated-steps-jay) boots the room: deploy with `up.sh testnet-demo`, have the operator agent call `issue_nonce` and relay the room's real quote to `register_room`, and check the receipts show the real verifier called with 200 TGas, `room_registered` emitted and `admit_room` reached. Then repeat with the three copies the fixtures already cover (a debug TD, wrong report data, a tampered event log), which must be refused on chain with `E_DEBUG_TD`, `E_REPORT_DATA` and `E_RTMR3_REPLAY` (DRC-3). The native and sandbox tests assert all of this already; what testnet adds is the real room, the real registry and real gas.
- [x] **E3.4 `set_pins`** · P0 · §3.12.2
  - `Explicit` or `FollowGovernance`. The path hash uses the predecessor, so only the seller can write it. A missing pin set denies release.
  - **Completed 2026-11-13.** The key is `(predecessor, listing_id, version)` through `listing_key_id`, so only the seller's own account writes its listing's pins, and the same pins path is recomputed from the room's `KeyRequest.path` at `authorize`. `Explicit` takes 1 to 16 distinct measurement hashes (`E_NOT_PINNED` for none, too many or a duplicate); `None` means `FollowGovernance`. Calling again replaces the pins for that `(listing, version)`, so a seller can drop a measurement they stop trusting; keys already released stay released. Pins only narrow who gets a key: the registry's `check_room` still runs for every release, so pinning a room governance has not approved gets nothing. A missing pin set denies release. Tests: another account's pins are a different record; each invalid pin set; the fee; the event.
    - **Not done:** a sanity check that a pinned hash names a measurement anyone built. KeyPolicy cannot know; a typo makes the listing unreleasable, never unsafe. The seller UI (E12) should show the hash of the published `MEASUREMENTS.md` entry.
- [x] **E3.5 `authorize`** · P0 · §3.12.3 · needs E4.3, E5.6
  - Checks the room signature, the attestation's expiry and the pins.
  - Calls `registry.check_room` and `clearing.authorize_release`, joined with `.and()`.
  - Stores a `Ticket` that expires after 50 blocks.
  - **Done:** sandbox denials for a commitment mismatch, an unpinned measurement and an expired room.
  - **Completed 2026-11-13.** `release.rs`. The room signs `"marginal/keyreq/v1" ‖ borsh(KeyRequest {chain_id, keypolicy, room_key, job_id, path, app_key, job_commitment, value_class})` with its registered signing key; `chain_id` and `keypolicy` are in the bytes, so a signature made for one chain or contract is useless on another. The checks, in order: fee; binding; signature; attestation exists and is unexpired; the path is the canonical `listing/{hex}/v{n}` form (re-rendered and compared, so no two strings name one listing); pins exist and allow the room's measurement; then `registry.check_room` and `clearing.authorize_release` run in parallel (`.and()`), and only if both say yes is the `Ticket` stored (50 blocks).
    - **Sandbox, on built wasm with the test doubles for E4.3 and E5.6 (`contracts/test-mocks/mocks`):** no pins, pins for another version only, a wrong chain, a bad signature, a room the registry no longer admits (`E_ROOM_REVOKED`) and a commitment mismatch (clearing's refusal, `E_RELEASE_DENIED`) are each refused with the right code and **no ticket is stored**; the whole path (register, pin, authorize, derive) succeeds across real contracts.
    - **Expiry is a native test only.** An attestation lasts 24 h, and the sandbox's clock cannot be moved a day in test time (90,000 blocks took over ten minutes, so the attempt was dropped). The check is one comparison, covered by a native test with the clock set past it, and a mutation that removed it was caught. The registry's own expiry (`admit_room` sets 24 h, E4.3) reaches KeyPolicy as `check_room` saying no, which the sandbox shows.
    - **Not verified:** against the real clearing's `authorize_release`, which is E5.6; it stays a double until then, and clearing's platform-cap refusal is the double's own unit test only. The registry half is no longer mocked: E4.3 runs `admit_room` and `check_room` on the real clearing against the real KeyPolicy (`contracts/clearing/tests/sandbox.rs`), inside the 15 TGas KeyPolicy attaches.
- [ ] **E3.6 `derive`** · P0 · §3.12.3 · code done; Done line **blocked on [P-1](#paid-and-account-gated-steps-jay) and [P-3](#paid-and-account-gated-steps-jay)** · needs E8.2
  - Calls `request_app_private_key` (domain 2, `AppPublicKeyPV`) with 1 yocto and 30 TGas, plus whatever the relayer adds. The ticket is marked used only on success.
  - **Done:** a key derived through KeyPolicy on testnet passes the room's check.
  - **Built and verified in the sandbox 2026-11-13; stays open: no testnet, no real MPC (S-1 / E8.2).** `derive(ticket_id)` is callable by anyone (the answer is encrypted to the room's app key, so it is useless to anyone else, and the relayer pays the gas). It sends `request_app_private_key` with the near/mpc argument layout copied from a real call (`fixtures/tee-verifier-args.borsh` and the near/mpc 3.19.0 types: `AppPublicKeyPV {pk1: bls12381g1:…, pk2: bls12381g2:…}`, base58), 1 yocto, 30 TGas, domain 2. The ticket is marked used only when the MPC answer comes back (`on_derived`): a failed or timed-out MPC call keeps the ticket, a retry succeeds until it expires (sandbox test, with the ticket's expiry moved past by `fast_forward`); a spent or expired ticket is refused; two derives racing both get the answer, one `key_derived` event.
    - **Not verified:** that the real MPC network accepts these arguments and that the recovered key passes the room's check. That is E8.2's first step (S-1) and the Done line. The argument shape is copied from near/mpc's source at 3.19.0 and the mock accepts exactly it, which a wrong guess would not survive, but it is not the same as a testnet call.
    - **To close E3.6**, in this order: E8.2's first step proves CKD works at all from a dev account (free, needs only [P-3](#paid-and-account-gated-steps-jay)); then, with the room up ([P-1](#paid-and-account-gated-steps-jay)), `authorize` a real job and call `derive`, and check the room recovers `sk_L` from `big_y`/`big_c` and decrypts what it was sent. If the MPC network refuses the argument shape, only `derive` in `release.rs` changes: the ticket, the pins and the audit chain do not.
- [x] **E3.7 Test build** · P0 · §6.1
  - A `sim-attestation` feature (`keypolicy-sim`, with `compile_error!` alongside `mainnet`), and a mock MPC contract that returns fixed bytes. Contract tests only.
  - **Completed 2026-11-13.** Feature `sim-attestation` adds one method, `register_room_simulated`, that takes a room's keys, class, measurement and PPID hash directly (core's `SimRoom`) and skips the quote; it still spends the nonce, charges the fee, and goes through the same `record_room` as a real registration. Enabling it together with `mainnet` is a `compile_error!` (a test builds both). `make wasm-dev` builds it as `target/near/keypolicy-sim/`, and the sandbox test checks that its imports and exports differ from the real build's by exactly that method. The test doubles are one wasm, `contracts/test-mocks/mocks`, that plays the verifier (replies with configured bytes), the registry and clearing (`admit_room`, `check_room`, `authorize_release`, with the platform-cap and commitment-mismatch refusals) and the MPC network (records requests, can be set down). That path is added to SDD §3.1 and `CLAUDE.md` in this commit.
  - **Review of E3 as a whole, 2026-11-13** (the second reviewer's job):
    - **Found and fixed during review.** (a) No proof of possession: anyone with a TDX machine could register another room's public key under their own box key (now signed, tested on native and wasm). (b) Nonces were not bound to the account that asked: anyone could spend another operator's nonce (now issuer-bound, tested on native and wasm). (c) A refused takeover of a registered key was only caught late; the check that refuses it before paying for the verifier's 200 TGas had no test (found by mutation, now tested). (d) `report_data` as a plain concatenation was not injective (now Borsh). (e) KeyPolicy's testnet balance (2 NEAR) was smaller than its own code's storage (now 4).
    - **Injected bugs: 31, every one now caught by a failing test.** In KeyPolicy: the proof-of-possession check removed, the nonce issuer ignored, the nonce expiry off by one, both room-key-reuse refusals removed, the room-signature, pin, attestation-expiry, chain-binding and ticket-expiry checks removed, a used ticket reusable, a ticket never marked used, a fee one yocto short, the `authorize` fee not charged. In core: the signing domain dropped, the report data built by concatenation, TCB status, debug-TD, report-data and PPID-length checks removed, the attestation lifetime doubled, the collateral expiry ignored, an allowed `init-script-hash`, the storage-encryption value unchecked, the RTMR3 replay starting from non-zero and accepting foreign event types, the path's canonical form unchecked, duplicate, empty and 17 pins accepted, an explicit pin list that allows everything. (One survived the first time: item (c) above.)
    - **Coverage** stays 100%: Rust 2,589 regions, 233 functions, 1,543 lines; TypeScript 100%.
    - **Handoffs.** *E4.3:* `admit_room(room: AdmitRoom)` (JSON; core's `AdmitRoom`: `room_key`, `box_pk`, `ppid_hash`, `measurement`, `class`, `tcb_status`, `tee_tcb_svn`, `registered_height`, `expires_at`, `collateral_issued_at`, `quote_hash`, `attestation_mode`), and `check_room(room_key) -> {ok, deny_reasons}`. *E5.6:* `authorize_release(job_id, room_key, path_hash, job_commitment, value_class)` is called with 1 yocto from KeyPolicy only; `path_hash` is `marginal_core::keyrelease::path_hash`; the class is the listing's own, not the room's; one release per job. *E7 and E8:* the room signs `room_pop_signing_bytes` to register and `key_request_signing_bytes` to authorize (both are `@marginal/core-wasm` operations, with `evaluate_quote` for the operator's pre-flight check, so a registration that would fail is caught before it spends 200 TGas).

## E4. Clearing: rooms, listings, snapshots

**Status 2026-11-14: built and closed.** All six tasks are done, verified natively, as built wasm on a local chain, and against the real KeyPolicy. What is not verified is named in each note. 100% coverage holds; 30 injected bugs were all caught.

Clearing follows KeyPolicy's shape (E3): arguments that carry `marginal-core`'s types travel as Borsh bytes and views return JSON built in `views.rs`, because `cargo near`'s ABI step needs a JSON and Borsh schema for every type in the interface and core's types have none. So there is one encoding of a record — core's — and the SDK builds it through `@marginal/core-wasm`.

- [x] **E4.1 Scaffold and gov setters** · P0 · §3.4, §6.2
  - A `config()` view showing the profile and toggles.
  - The `gov` role sets these directly in M1: appraiser registry, token allow-list, issuer key, NEAR AI signer list (with expiry), fee table, compliance key.
  - Typed errors, and views including `get_jobs_for_room`.
  - Replace the skeleton's local `AssetClass` and `Rule` enums with view types over `marginal-core`'s (they need JSON and Borsh schemas for `cargo near`'s ABI step).
  - **Completed 2026-11-14.** `contracts/clearing/src/`: `lib.rs` (state, `new`, `config`), `gov.rs`, `registry.rs`, `listing.rs`, `snapshot.rs`, `views.rs`, and three helpers the rest share: `events.rs` (NEP-297 plus the audit chain), `fees.rs`, `store.rs` (raw storage, one prefix per table).
    - **Setters.** `set_appraiser` (by `id@version`, naming a core `FormulaId` this build actually has), `set_tokens`, `set_issuer_key`, `set_compliance_key`, `set_ai_signer` (with an expiry; setting one in the past removes it), `set_fees`. Each is gov-only, bumps `policy_version` and emits `policy_executed`, so a record says which policy produced it. The fee table is validated on the way in: rates are fractions and the three shares add up to one whole.
    - **No local enums left.** The skeleton's `AssetClass`/`Rule` are gone: the profile carries plain strings (`"R1"`, `"Knowledge"`) that are checked against core's enums when a listing is created, and the listing itself stores core's types.
    - **Views:** `config`, `get_listing`, `get_leakage`, `get_job`, `get_jobs_for_room` (SDD issue 5), `get_snapshot`, `get_room`, `audit_head`, `get_audit`. Amounts are decimal strings so JavaScript cannot round them.
    - **Deploy.** `new` now takes `keypolicy` and `chain_id` as well: `admit_room` must know the one account allowed to call it, and every report a room signs names the chain. `deploy.ts` passes both and `verifyDeployment` checks `clearing.keypolicy` is the account that was deployed.
    - **Not done:** the time-lock queue and `pause`. M1 cuts both (E19); `gov` is a dev account (`gov.profile = demo`).
- [x] **E4.2 Events and audit chain** · P0 · D8 · §3.10
  - NEP-297 `marginal` events carry `seq` and `head`.
  - Every state change appends an `AuditEntry`, readable through `get_audit(from, limit)`.
  - **Done:** recomputing the chain from `get_audit` matches `audit_head`.
  - **Completed 2026-11-14.** `events.rs` appends the entry, stores it under its sequence number and logs the event in one place, so an event and an entry cannot disagree. The **Done line is a test**: `the_chain_recomputed_from_get_audit_matches_the_head` replays every entry from the view through core's `audit_step` and compares the result with `audit_head`, and the sandbox test does the same across the whole listing path on chain. A second test tampers with each entry in turn and shows every later head changes.
    - `get_audit` pages from 1, never runs past the head, and is capped at 100 entries a call, so one view cannot run out of gas.
    - The kinds are core's `AuditKind` catalogue (SDD §3.10), asserted in order for a full path: policy, listing created, job assigned, provisioned, published, screening result, snapshot anchored.
- [x] **E4.3 Room policy module** · P0 · D3 · §3.11
  - The registry, as a module inside clearing:
    - gov approves a measurement set and admits a platform (PPID exactly 16 bytes);
    - `admit_room` is KeyPolicy-only and sets a 24 h expiry;
    - `check_room` and `eligible`.
  - **Done:** a test per deny reason; Phala PPIDs and the E7.3 measurement are seeded on testnet.
  - **Completed 2026-11-14, except the testnet seeding, which needs [P-1](#paid-and-account-gated-steps-jay) and [P-3](#paid-and-account-gated-steps-jay).** `registry.rs`. `approve_measurement_set` indexes every member by its measurement hash, so admission is one lookup rather than a scan. `admit_platform` takes the **PPID itself** and refuses anything that is not exactly 16 bytes (Phala's published list contains an empty entry, SDD §3.13), then stores it hashed the way KeyPolicy records it.
    - **`admit_room` is proved against the real KeyPolicy, not a mock.** KeyPolicy's wasm is already built, so its call is fixed: `contracts/clearing/tests/sandbox.rs` deploys the real clearing and the real `keypolicy-sim`, registers a room through KeyPolicy and checks the record lands in the registry. It also measures the cost: **2 TGas of the 15** KeyPolicy attaches, so the budget holds with room to spare. The mocks in E3 stay for KeyPolicy's own tests.
    - **A test per deny reason:** `unknown` (no record), `expired` (a day on), and `platform_not_admitted` (the platform record removed, as E16's deny side will do). A room whose record is gone altogether is also skipped, and `eligible` drops all of them from the pool.
    - **Expiry** is the earlier of KeyPolicy's own expiry and 24 h from admission, so the registry's limit holds even if an attestation would last longer. A renewal replaces the record in place and does not grow the pool.
    - **The pool is capped** at 32 rooms per class, and a full pool first drops the rooms that are no longer current, so a dead room cannot hold a place forever.
    - **Not done:** the deny-side methods and the time-lock (E16, E19: M1 cuts them), the TCB policy table (KeyPolicy already admits only `UpToDate`), GPU corroboration (v2), and `cap_per_epoch` is recorded but not counted against (the counters are E5.6 and E16).
- [x] **E4.4 `create_listing` and provisioning** · P0 · §3.4
  - Checks: appraiser enabled; finite alphabets with no free-text field; R1 bounds; `max_copies ≥ 1`.
  - `begin_provisioning` creates the job; `submit_provisioning` stores `pk_l` and anchors the certificate.
  - **Completed 2026-11-14.** The checks that depend only on the seller's input are core's (`marginal_core::listing::validate_spec`), so the SDK and the seller's tooling make exactly the same ones: finite alphabets (an alphabet of zero levels is a free-text field and has its own code), distinct named fields, R1 with a positive ask, `max_copies ≥ 1`, a floor that is a fraction, positive deadlines, and a fresh leakage account whose counters are zero. The state checks stay in the contract: the appraiser version is registered, enabled and matches the formula the listing names; the token is allow-listed; the asset class and R1 are enabled by the profile.
    - The listing's `key_path_hash` is fixed at creation from `(seller, listing_id, version)` with core's `listing_path`, so it is the path KeyPolicy will derive and the seller pins against.
    - `begin_provisioning` opens a provisioning job and assigns one room at random from the eligible pool (`env::random_seed`, `n = 1` below value class H). `submit_provisioning` stores `pk_l` and returns the listing to `Draft`.
    - **Certificates are anchored in the audit chain**, not stored: the event carries `cert_hash`, and the chain commits to the event. The certificate itself lives in the blob store (§3.18).
- [x] **E4.5 Publish and screening** · P0 (Held: P1, D8) · §3.4
  - `publish_listing(good_commitment, ciphertext, payout)` creates a screening job.
  - No cross-contract pin check: KeyPolicy denies release without pins, and the SDK always sets pins first.
  - `submit_screening` moves the listing to `Active` (with `publish_height`) or to `Held`.
  - **Completed 2026-11-14.** `publish_listing` takes a core `PublishSpec` (commitment, ciphertext ref, payout route), refuses a Ckd listing with no `pk_l`, and opens the screening job. `Pass` makes the listing `Active` and records `publish_height`; `Flag { reason }` holds it (M1 has one reason, MNPI, D8). A `RoomSealed` listing publishes straight from `Draft`, since it has no listing key to provision.
    - **No cross-contract pin check**, as the task says: KeyPolicy denies release for a listing with no pins, so the check would cost an async hop to learn what KeyPolicy enforces anyway.
    - **`resolve_held` is not built.** SDD §3.4 gives it to the seller (withdraw) or the compliance reviewer (clear after a consented review); no demo surface shows either, and the review path is E17. A flagged listing stays `Held`.
- [x] **E4.6 `anchor_snapshot`** · P0 · §3.4
  - Storage-paid; records `anchor_height`.
  - **Completed 2026-11-14.** `snapshot.rs`: the buyer pays, owns the record, and the contract records the height it was anchored at, which is what E5's cooling and R2 checks read (AC-6).
  - **Storage is paid by whoever creates a record**, as in KeyPolicy: 0.03 NEAR a listing, 0.02 to publish, 0.01 a snapshot, 0.02 a measurement set, 0.01 a platform. `admit_room` is the exception: KeyPolicy attaches 1 yocto, only KeyPolicy can call it and the pool is capped, so clearing's own balance covers a bounded number of rooms.
  - **Review of E4 as a whole, 2026-11-14** (no second reviewer):
    - **Injected bugs: 30, every one caught by a failing test.** The room signature unchecked; any room answering any job; a stale room answering; the job kind and state unchecked; the chain, contract and listing bindings unchecked; anyone moving a seller's listing; publishing without provisioning; publishing from any status; a flag publishing the listing; the listing fee not charged; the token allow-list, appraiser and asset-class checks ignored; anyone admitting a room or setting policy; the platform and measurement checks ignored; a room's expiry uncapped; expired rooms staying current; the PPID length unchecked; fee shares that need not add up; an audit chain that ignores the previous head or the payload; free text, an empty component list, duplicate field ids, a zero ask and preset leakage counters all allowed; and a signing domain dropped.
    - **Two checks were dead and were deleted, not covered up.** `submit_provisioning` and `submit_screening` each re-checked the listing's status, but a job is `Assigned` only while its listing is in the matching state, so the job-state check is the status check. A mutation showed no test depended on either, which is what found them.
    - **Not verified:** anything on testnet (needs [P-3](#paid-and-account-gated-steps-jay)); a real room's own signatures (E7/E8 — the sandbox signs with a test key); the appraisal path, funding, leakage counters and settlement, which are E5 and E6.
    - **Handoffs.** *E5:* `request_appraisal` reads `get_leakage`, the listing's `eligibility` and `publish_height`; jobs are already stored as core `Job` records with their commitment, and `store::add_open_job`/`close_job` keep a room's queue. *E5.6:* `authorize_release` is the one method KeyPolicy still calls that clearing does not have; `admit_room` and `check_room` are live, so only the release half is mocked now. *E7/E8:* a room signs `provisioning_signing_bytes` and `screening_signing_bytes` (both are `@marginal/core-wasm` operations, with vectors).

## E5. Clearing: jobs, funding, leakage, agents

**Status 2026-11-14: built and closed.** All seven tasks are done, verified natively and as built wasm on a local chain, including the first run of the **whole buyer path against the real KeyPolicy**: deposit, request, key release. 100% coverage holds; 38 injected bugs were all caught, and the two integration bugs the sandbox found are below.

- [x] **E5.1 Job state machine** · P0 · §3.5
  - `transition(from, to)` covers only the M1 states: `PendingApproval`, `Requested`, `Assigned`, `Computing`, `Verdicted`, `Deal`, `NoDeal`, `Restricted`, `InputRejected`, `Final`, `DeliveryFailure`, `Timeout`.
  - **Done:** an exhaustive test over all pairs, and a test that double settlement is impossible.
  - **Completed 2026-11-14.** `marginal_core::lifecycle`, so the contract, the room and anything replaying a job's history read one table. **The Done line is two tests:** one walks all 12 × 12 pairs and asserts each is allowed or refused against a list written out by hand (13 moves are legal); the other asserts that no terminal state has any way out, which is what makes double settlement impossible — the second attempt cannot leave the state the first arrived at. A third test pins that `Revoked` and `Fault` (v2) are unreachable in both directions.
- [x] **E5.2 Balances** · P0 · §3.9.3
  - `ft_on_transfer` with `Deposit{for}`. `withdraw_balance` rejects agent keys. Refunds credit the balance.
  - **Completed 2026-11-14.** `escrow.rs`. Escrow lives in clearing's own NEP-141 balances, so a refund never depends on another contract being live (SPEC §4.9.1). `Deposit{for}` credits the account the message names, not whoever sent the tokens, so a relayer or an exchange can fund a buyer. Anything clearing cannot use — an unknown token, a message it cannot parse, a message naming another path — is returned whole rather than panicking, which is what NEP-141 gives back to the sender.
    - `withdraw_balance` takes the balance down first, then calls the token; its callback puts the amount back if the token call failed, so a withdrawal never destroys value. It demands one yocto and refuses agent keys.
    - **Not built:** the Intents path (`on_auth`, `FundAuth`, §3.9.3 path 3) and `Appraise` inside a transfer message. Both are cut from M1 with the fast-path yield ("What M1 cuts"); a prefunded balance serves buyers and agents alike.
- [x] **E5.3 Buckets and leakage ledger** · P0 · D4 · §3.8, §3.9.1
  - Buckets `budget`, `compute`, `comp_reserved` and `fee_reserved` (storage is 0 in M1).
  - Reserve `max_debit` at request. The debit equals the reservation, except:
    - `Restricted` debits 1,000 mbits;
    - `InputRejected` and `Timeout` release the reservation.
  - Compensation goes to the seller's claimable balance. The listing becomes `Exhausted` when the budget runs out.
  - **Done:** conservation holds after every transition.
  - **Completed 2026-11-14 for the reserve side; the debit rules are written where they are used, in E6.3.** `marginal_core::funding` computes what a job costs (`fund`, `compensation`, `fee_bps`, `total`) and `leakage.rs` reserves it. A job's buckets are funded in the call that creates it, from the buyer's balance, so a job is never half-funded: the **Done line is a test** that the amount taken from the balance equals `total(buckets)` and satisfies AC-4's conservation check exactly.
    - `max_debit` is core's, so the reservation is the same number the room and the verifier compute. A reservation that would pass the listing's budget is `E_BUDGET_EXHAUSTED`, and one that would overflow the counters is refused rather than wrapped.
    - **Why the debit is not here.** E5 has no caller for it: spending or releasing a reservation happens at settlement, which is E6.3, and a contract with unreachable code is worse than one with a short task note. The rules this task states (the debit equals the reservation; `Restricted` debits only the outcome bit; `InputRejected` and `Timeout` release it; the listing becomes `Exhausted` when what is left cannot pay for the cheapest job) are recorded at the top of `leakage.rs` for E6.3 to implement with its own tests.
- [x] **E5.4 Nullifiers** · P0 · D4 · §3.20, AC-14
  - Verify `NullifierCredential` against the gov-set issuer key, and track `used_nullifiers[(listing, epoch)]`.
  - **Completed 2026-11-14.** `marginal_core::credential` defines what compliance signs; `identity.rs` checks and spends it. The credential must be signed by the issuer governance registered, be unexpired, and name this chain, this contract, this listing and the account presenting it — each refusal has its own test, and the expired case is **signed correctly**, so only the expiry can be the reason it fails (a mutation found that the first version of that test passed for the wrong reason).
    - One identity therefore gets one appraisal per listing per epoch across every account it controls. The identity never reaches the chain: the event carries a domain-separated tag of the nullifier, not the nullifier. `is_nullifier_used` lets the SDK check before a buyer spends gas.
- [x] **E5.5 `request_appraisal`** · P0 · §3.4
  - Checks, in order:
    1. listing `Active` with copies left;
    2. nullifier, if the listing is gated;
    3. snapshot owned by the caller;
    4. leakage fits the budget;
    5. balance covers the job;
    6. agent caps.
  - Assignment uses `random_seed`. Computes `job_commitment`.
  - Carries `DEK_c` sealed to the room's `box_pk` (HDP, §3.12.4).
  - **Done:** a test per check, each leaving state unchanged.
  - **Completed 2026-11-14.** `job.rs`, in exactly that order, with `marginal_core::request::AppraisalRequest` as the input form so the SDK makes the same checks. The **Done line is a test** that runs every refusal and asserts, after each one, that the balance, the leakage counters and the next job id are untouched.
    - The job is stored as a core `Job` with its buckets and its `job_commitment` (§3.12.3), one room assigned at random from the eligible pool, and `DEK_c` kept beside it for the room to collect (`get_context_key`).
    - A budget below the listing's ask is refused: no deal could ever be struck, so the job would only burn gas. `min_price` lives in core next to the rule it comes from.
- [x] **E5.6 `authorize_release`** · P0 · §3.4
  - KeyPolicy-only. Checks the room assignment, the commitment and the path. Moves the job to `Computing`.
  - **Completed 2026-11-14, and this is the task that closed E3's open end.** KeyPolicy's wasm is already built, so its call is fixed; the sandbox test runs the real KeyPolicy against the real clearing and **found two bugs a mock had hidden**:
    1. KeyPolicy sends `job_id` as a **JSON number**, not a string. Clearing took `U64` (a string) and every release failed to deserialise. Clearing now takes `u64`, with a comment saying why.
    2. KeyPolicy attaches **no deposit**: the `1` in its `Call::json(..., 1)` is a gas *weight*, not a yocto. Clearing demanded one yocto and refused every call. The predecessor check is the real authorisation — a receipt from the KeyPolicy contract cannot be forged by an access key — so the method is not payable and demands nothing.
    - What it checks: the job exists and is `Assigned` to the room that asked, the commitment equals the job's, the path hash is the listing's own, and the value class is **the listing's**, not whatever the request claimed. Then the job moves to `Computing` and the release is recorded with the platform hash the value at risk will be counted against (E16).
    - **Not built:** the platform and per-listing release caps (AC-19). M1 cuts value-at-risk caps (E16); `cap_per_epoch` is recorded on the platform record and nothing counts against it yet.
- [x] **E5.7 Agent firewall** · P1 · D5 · §3.21
  - Agent keys are registered and revoked from a full-access key only.
  - Caps: per-job maximum, per-window maximum, and `human_above`. Over a cap → `Block`; above `human_above` → `PendingApproval`.
  - `approve_parked` must be signed by a non-agent key. Admin methods reject agent keys.
  - **Done:** DRC-5 passes in sandbox.
  - **Completed 2026-11-14 natively; the DRC-5 sandbox run is E15.2.** `agent.rs`. A buyer registers a function-call key with caps; `request_appraisal` applies them to the signing key. Over a cap the answer is `Blocked` with the cap's name — a **successful transaction that creates no job**, so the attempt is on the audit chain where the buyer can see what their agent tried; above `human_above` the job is parked and waits for `approve_parked` from a key that is not an agent key. A test asserts a blocked request leaves the balance, the leakage counters, the job counter and the agent's own window exactly as they were.
    - The window caps both the total spent and the number of jobs, and starts again when it runs out. The hard caps are applied before the human threshold, so a job that is both over the window and above the threshold is blocked rather than parked.
    - `register_agent_key`, `revoke_agent_key`, `approve_parked` and `withdraw_balance` all refuse a call signed by a registered agent key, before they do anything else.
    - **Not built:** `allowed_categories`. D5 shows the budget caps and the human approval; a category list adds a second policy surface no demo surface exercises.
  - **Review of E5 as a whole, 2026-11-14** (no second reviewer):
    - **Injected bugs: 38, every one caught by a failing test.** Caps ignored, a blocked request keeping the money, spend not recorded, listing status and copies unchecked, a budget under the ask, a nullifier not required or reusable, its signature, expiry or subject unchecked, a snapshot's owner or cooling ignored, the buyer never paying, leakage never reserved, the release's room, commitment, path, class or caller unchecked, a parked job needing no human, deposits credited to the sender instead of the named account, an unknown token accepted, a withdrawal ignoring the balance or keeping a failed transfer, an agent withdrawing, a reservation passing the budget, every agent cap in turn, terminal states moving, a verdict skipping to final, compensation rounding up, a fee ignoring its rate, judges unbounded, half a credential accepted.
    - **Three of those survived the first run and found real test weaknesses**, now fixed: the expiry test passed for the wrong reason (the signature refused it first), nothing tested a deposit made *for* another account, and core's own `validate_request` had no unit test of its own.
    - **A tooling bug worth recording:** the mutation script restored files with their original timestamps, so cargo reused the *mutated* build. It now touches each restored file. Any mutation run before this fix could have reported a later test as passing when it was built against mutated code; the suite was rerun clean afterwards.
    - **Not verified:** anything on testnet; settlement, verdicts and claims (E6); DRC-5 end to end (E15.2).

## E6. Clearing: verdicts, settlement, claims

**Status 2026-11-14: built and closed. Clearing is now complete for M1.** All five tasks are done, verified natively and as built wasm on a local chain: a deal now runs end to end — the room's verdict is priced by clearing, the good is delivered, the window passes, the seller is paid and claims real tokens. 100% coverage holds; 51 injected bugs, 49 caught and 2 that found redundant checks (below).

- [x] **E6.1 `submit_verdict` (Open)** · P0 · §3.17
  - Checks: room signature, assignment, binding (domain, chain, job, version, nonce, commitment) and schema.
  - Then: recompute with core; a deal requires `delivery_commitment`; the certificate hash must be present.
  - A rejection emits `verdict_rejected`, and the job stays open.
  - **Completed 2026-11-14.** `verdict.rs`. **Clearing works out the price itself** from the components and factors the room published (`measured_index`, `apply_rule`): the room's own `price` is never read. The two kinds of refusal are kept apart, which is the heart of this task:
    - **Refused outright** (the call fails, nothing changes): a bad signature, a room the job was not given to, a room whose attestation has lapsed, a job that is not `Computing`, a verdict naming another chain, contract, listing or version, and a commitment that is not the job's.
    - **Rejected** (the call succeeds, `verdict_rejected` is emitted, **the job stays open** until its deadline so the room can fix it and try again): a missing delivery commitment or certificate, an appraiser that is not the listing's, a schema the formula cannot price, shown fields (M1 is blind), a sealed verdict (E10), and every receipt failure. A test walks each one and asserts the job is still `Computing` with no settlement.
    - **A rejected verdict spends nothing.** The first version recorded judge receipts before the certificate check, so a rejected verdict burnt its own receipts and the room could never retry. A test caught it; receipts now enter the replay set only when the verdict is accepted.
- [x] **E6.2 Judge receipts** · P1 · D6 · §3.16
  - LETHE's checks: `resp_hash`, `ecrecover` against an unexpired signer from the gov-set list, the model allow-list and the replay set.
  - Also: a strict parse reproduces the factor, and the body has no reasoning field.
  - **Completed 2026-11-14, against a signature made the way the provider's TEE makes one; not against a real NEAR AI receipt, which needs [P-2](#paid-and-account-gated-steps-jay).** The rules that need no host functions live in `marginal_core::judge`, so `replay-ts` re-checks a published verdict exactly as the contract did: the strict parse, the body binding (`sha256(body)` must appear in the signed text), and the `personal_sign` envelope. The contract recovers the signer with `env::ecrecover` and checks it against the governance registry (address → model and expiry), the model, and the replay set.
    - **The strict parse is the whole scoring rule** (DR-2): a body is worth something only if it is exactly `{"relevance":k}` with `k` in 0..=10, whitespace aside. Anything else scores 0, which resolves to the listing's floor (AC-41).
    - **`has_reasoning` turned out to be redundant in the contract** (a mutation survived until I saw why): any body carrying a reasoning field already fails the strict parse, so it already scores 0. The rule stays in core with its own test, because the room must not publish such a body at all; the contract no longer re-checks it.
    - **`env::ecrecover` aborts** on a recovery byte outside 0..=3 rather than returning `None`, which would have killed the whole call instead of rejecting one receipt. The byte is checked first.
    - **Not done:** the attester-maintained signer registry (§3.16: entries added and refreshed by k-of-n attesters). M1's `gov` sets the list directly, with an expiry (E18).
- [x] **E6.3 Settlement** · P0 · §3.9.2
  - The outcome table produces a `SettlementRecord` with `simulated_flags`.
  - The buyer's refund goes to their balance. The seller's compensation goes to claimable. `held_until` is now + W.
  - **Completed 2026-11-14.** The table is `marginal_core::settle` — money, so core — and `settle.rs` applies it. Every outcome has a test of its own, and **every settlement is checked against AC-4's conservation invariant as it happens**, not only in test builds: if the arithmetic ever disagreed with the deposit, the call stops.
    - `Deal` holds the price for the window, pays the room for what it leaked and for its compute, takes the fee on the **actual price** and refunds the rest. `NoDeal` still pays compensation and compute. `Restricted` compensates one bit. `InputRejected` releases the reservation but still pays compute. `Timeout` returns everything.
    - The debit rules E5.3 states are implemented here, where their caller is: a listing whose remaining budget cannot pay for the cheapest job becomes `Exhausted`, and a deal counts its copy and goes `SoldOut` at the last one.
    - `simulated_flags` records what was simulated (attestation, judge), so a record always says which toggles produced it (§6.3 rule 2).
    - **Not done:** `screening-only share` for `Restricted`'s compute fee (§3.9.2 gives no fraction, so the whole compute fee is paid; `tasks.md` SDD issue 30).
- [x] **E6.4 Receipt, release, timeout** · P0 · D11 · §3.4
  - `submit_delivery_receipt`.
  - `release_held` needs the receipt, W passed and a fresh `PayoutApproval`. A match gives `Blocked`; otherwise the proceeds go to the seller's claimable balance.
  - `refund_expired` ends in `Timeout` or `DeliveryFailure`.
  - **Done:** DRC-11 is exact in sandbox.
  - **Completed 2026-11-14, and the Done line is a sandbox test.** `the_room_is_killed_and_the_buyer_is_made_whole` funds a real job through a real token, lets the deadline pass with no verdict, calls `refund_expired` from an account that is not the buyer, and asserts the buyer's balance is **exactly** what it was before, the leakage reservation is released and the room's queue is clear (DRC-11).
    - `release_held` needs the receipt, the window passed, and a `PayoutApproval` signed by the compliance key and bound to this chain, contract, seller and route hash. A sanctions match leaves the payout `Blocked` with its screening reference, paying nothing.
    - `refund_expired` after a deal, past the delivery deadline with no receipt, gives back the held price **and the fee that was taken on it** (`DeliveryFailure`); a test asserts the fee is reversed out of governance's claimable too.
    - A parked job nobody approves also times out. The lifecycle table had no `PendingApproval → Timeout` move, so those funds would have been locked for good; the coverage gate found it.
    - **Not done:** `dispute_delivery` (§3.4) and the `Fault` outcome, both v2.
- [x] **E6.5 Claims and payout route** · P0 (route: P1, D7) · §3.9.4
  - `claim(token)` uses `ft_transfer`, and its callback restores the balance on failure.
  - The `NearAccount` or `DryQuote` route is stored on the listing and cited in the settlement record.
  - **Completed 2026-11-14.** Every outgoing transfer is a pull: settlement credits a claimable balance, the owner calls `claim`, and the callback puts the amount back if the token refuses it, so nothing a token does can stop a job from ending. A sandbox test claims a real `musdc` balance and checks `ft_balance_of` on the token afterwards. Agent keys cannot claim.
    - The route is the listing's `payout`, screened at release through the approval's `route_hash`; the release event cites it. `DryQuote` is stored and cited like `NearAccount`; the live 1Click quote itself is the gateway's (E13), and `IntentsAccount` and `ChainSig` are M2.
  - **Review of E6 as a whole, 2026-11-14** (no second reviewer):
    - **Injected bugs: 51. 49 were caught by a failing test**, including an unchecked verdict signature, any room reporting, a trusted room price, a deal with no delivery commitment or certificate, sealed verdicts accepted, every receipt check in turn (signer, expiry, model, body binding, replay, recomputed factor, recovery byte), receipts spent on rejection, a seller or operator not paid, a buyer not refunded, leakage not debited, a window not recorded, a receipt that need not match the commitment or could be replayed, a release with no receipt or before the window, a blocked payout paid anyway, every field of the approval, a timeout ignoring its deadline, a settled job refunded twice, a failed claim keeping the money, an agent claiming, and each row of the outcome table.
    - **The two that survived found redundant checks, which were removed rather than papered over:** the component-count check (the formula's own arity check answers it with the same code) and `has_reasoning` in the contract (the strict parse already scores such a body 0). Both rules stay in core, with their own tests, because the room and `replay-ts` need them.
    - **Three bugs the tests found in my own code:** receipts burnt by a rejected verdict; no `PendingApproval → Timeout` move, which would have locked a parked job's funds; and `env::ecrecover` aborting the call on a malformed recovery byte.
    - **Not verified:** anything on testnet; a real NEAR AI receipt ([P-2](#paid-and-account-gated-steps-jay)); a real room's signatures (E7, E8); Sealed verdicts (E10).

## E7. Room image and supervisor

- [ ] **E7.1 Phala CVM and quote fixture** · P0 · §3.13 · **blocked on [P-1](#paid-and-account-gated-steps-jay)** · **do first (S-4)**
  - A `tdx.large` on a pinned node, deployed with `--no-gateway --no-pre-launch-script` and `key_provider: "none"`.
  - **Check the image version first:** `phala os-images --prod --json`. The guest must be **dstack ≥ 0.6.0**, or KeyPolicy refuses every registration: the `storage-encrypted` event §3.13 requires does not exist before 0.6.0, and §3.13's "apps cannot add RTMR3 events" is also a 0.6.0 property. Upstream's stable line was still 0.5.14 on 2026-11-13 with 0.6.4 pre-release, and Phala does not publish which it deploys. If prod has no 0.6.x image, stop and decide before paying for a CVM (E3.2 note).
  - Deploy it as a **new app**, never as an upgrade, and do not pin an `app_id`: KeyPolicy requires `app-id` to be the first 20 bytes of the compose hash.
  - **Done:** the inner certificate is type 5; the PPID is on Phala's list; the TCB status is recorded; the RTMR3 replay matches; quote, collateral and event log are saved to `fixtures/quotes/`. Then E3.2 closes: the same three assertions as the two real CVMs in `crates/marginal-core/tests/attest.rs`, this time with `evaluate_quote` **accepting** the room.
  - **Ready for it, 2026-11-14.** E7.2 and E7.3 build the image and print the compose hash, so one
    boot can capture everything. Two things to get right on the day, both of which decide whether the
    quote is usable at all:
    - **Deploy `room/image/out/app-compose.json` byte for byte.** The compose hash is the SHA-256 of
      the file dstack reads. If Phala's CLI assembles its own file from the compose instead of taking
      ours, the hash is its file's, not the one we recorded — so save the deployed `app-compose.json`
      next to the quote and check it against `build.sh compose` before trusting anything.
    - **The image has to be public** ([P-5](#paid-and-account-gated-steps-jay)): the compose names it
      by digest and a CVM holds no registry credentials.
- [ ] **E7.2 Image and compose** · P0 · §3.13 · built except the model pins, which arrive with E8.6
  - Pinned base digests and Node 22; `npm ci --ignore-scripts`; onnxruntime-node and MiniLM files pinned by SHA-256; read-only root file system.
  - `app-compose.json` exactly as in §3.13, plus three keys that KeyPolicy's policy makes mandatory (found by reading dstack's source in E3.2; all three refuse the room if wrong):
    - `"no_instance_id": true` — the only thing that makes dstack write an empty `instance-id`;
    - **no `init_script` key at all** — `""` still emits an `init-script-hash` event of `sha256("")`, which the policy forbids;
    - leave `event_log_version` unset: V1 is the default digest, and our replay implements V1 only.
  - A CPU-only room on dstack 0.6.x still gets a `gpu-policy-hash` event (`sha256("{}")`); the policy allows it and records it in the measurement.
  - The only operator input is the RPC URL.
  - **Built, 2026-11-14.** `room/image/`: `Dockerfile` (two stages on
    `node:22.23.5-bookworm-slim@sha256:e9f565d3…21ee`, `pnpm install --frozen-lockfile
    --ignore-scripts`, and a runtime stage holding nothing but `room/dist` and `@marginal/core-wasm`
    with `core.wasm` beside it), `docker-compose.tmpl.yaml` (read-only rootfs, `cap_drop: [ALL]`,
    `no-new-privileges`, a 16 MB `tmpfs` for `/tmp`, no swap, no port, no `env_file`, and the dstack
    socket as its only mount) and `app-compose.json`. The build context is `git archive HEAD`, so no
    uncommitted file and nothing under `deploy/.keys/` can reach the image.
  - Nothing is a **runtime** input at all, which is stronger than the task asked: the RPC URL, the
    operator agent's URL, the chain id and both contract accounts are written literally into the
    compose file, so each of them changes the compose hash (DR-9). `dstack` drops host-supplied
    variables anyway (`allowed_envs: []`), so a value that was not measured could not arrive.
  - **Not built: the onnxruntime-node and MiniLM SHA-256 pins**, because `room/models/` does not
    exist until E8.6 and inventing digests for files nobody has is worse than leaving the bullet
    open. Two SDD issues found while writing the file: 33 (§3.13's listing is missing the three keys
    dstack requires and shows `pre_launch_script: null` where omission is the only safe encoding) and
    34 (the compose hash is the SHA-256 of the deployed file, which §3.13 never says).
  - **No `nftables.conf` either** (SDD §3.1 lists one in `room/image/`): egress enforcement is a
    cut M1 already made ([What M1 cuts](#what-m1-cuts) → E17.1), and a policy file nothing applies
    would only make the measurement look stronger than it is.
  - **To close:** E8.6 adds `room/models/` with its pins, then re-runs `build.sh` and updates
    `room/image/MEASUREMENTS.md` with the new compose hash.
- [x] **E7.3 Reproducible build** · P0 · D3 · §3.13
  - `build.sh` and `MEASUREMENTS.md`.
  - **Done:** a second build from the git tag reproduces the compose hash (DRC-3).
  - **Completed 2026-11-14.** `build.sh compose` assembles `out/docker-compose.yaml` and
    `out/app-compose.json` from the committed templates and the deployment pins, and prints the
    compose hash and the app id. `room/src/image.test.ts` is the DRC-3 check and runs on every `make
    check`: the hash is the same across runs, it changes when any pin changes (the image digest and
    the RPC URL are both exercised), it equals the SHA-256 of the file that gets deployed, the file
    is canonical JSON, the compose file is embedded verbatim with no placeholder left and no
    `env_file`, and a build missing any pin is refused rather than guessed.
  - **Why the hash is computed twice over.** dstack measures `sha256_file(app-compose.json)` while
    its own SDKs predict the hash from recursively key-sorted compact JSON. Writing the canonical
    form makes the two answers the same number, so a verifier can use either (SDD issue 34).
  - **Verified beyond the Done line:** `build.sh image` builds, and a second `--no-cache` build of
    the same commit gave the same manifest digest
    (`sha256:f0bacb3b…af08` at commit `7d96482`). The digest is per **commit**, not per source tree:
    `SOURCE_DATE_EPOCH` is the commit's timestamp, so a later commit gives a new digest even when
    the room's code has not changed. That is the right semantics for "built from this tag", and it
    is why the pin lands only when the image is published ([P-5](#paid-and-account-gated-steps-jay)).
  - **Not verified:** that another machine reproduces that image digest (only this host was tried),
    and the one known gap — `core.wasm` is built on the host rather than inside the image, so two
    builders must also compare `core_wasm_sha256`. `MEASUREMENTS.md` says so.
- [ ] **E7.4 Boot and registration** · P0 · D3 · code done; Done line **blocked on [P-1](#paid-and-account-gated-steps-jay)**
  - Keys generated in memory; `report_data`; quote and event log through `@phala/dstack-sdk`.
  - Registration through the operator agent, with daily renewal. A restart always means new keys.
  - **From the contracts (E3).** `report_data` is `room_report_data(binding)` — `SHA-512("marginal-room-v1" ‖ borsh(RoomBinding{chain_id, keypolicy, sign_pk, box_pk, nonce}))`, **not** a plain concatenation. The registration must also carry `sign_sig`, the room's own signature over `room_pop_signing_bytes(binding)`, or KeyPolicy refuses it: a quote proves what software runs, not who holds the key. Both are `@marginal/core-wasm` operations with vectors, and the nonce belongs to the account that asked for it, so the operator agent must issue and spend it from the same account.
  - **Built, 2026-11-14.** `room/src/{keys,dstack,registration,boot,main}.ts`. Keys are generated in
    memory at every boot and never written anywhere, the binding and both signatures come from
    `@marginal/core-wasm` (so the room computes exactly what KeyPolicy checks), and `boot` renews on
    its own every five minutes while the attestation has less than an hour left — a failed renewal is
    reported and tried again rather than ending the room, because a lapsed attestation means every
    verdict is refused (E6.1).
  - **The room checks its own registration before anyone pays for it:** it reads the report data back
    out of the quote at offset 568, replays the RTMR3 log and applies the same event policy KeyPolicy
    will (`rtmr3_replay`, `room_events`). The 200 TGas verifier call and the storage are the
    operator's money, so a quote that cannot pass is refused locally.
  - **A mutation found a real gap.** Replacing `sign_sig` with 64 zero bytes left every test
    passing: `proofOfPossession` was checked on its own, but nothing checked that
    `buildRegistration` used it. The bundle test now verifies the signature against the room's
    published key over `room_pop_signing_bytes`, which is the check KeyPolicy makes.
  - **Deviation from the task text: not `@phala/dstack-sdk`.** The room needs one call, `GetQuote`,
    and node already frames an HTTP request over a unix socket, so `dstack.ts` is a direct client of
    the guest agent's v0 surface (`{report_data: hex}` to `/prpc/GetQuote`, `{quote, event_log}`
    back; dstack `guest-agent/src/backend.rs`). One dependency fewer inside the TEE is one fewer
    thing in the measurement to audit. It is tested over a real unix socket, not a mock.
  - **To close:** E7.1's CVM. Nothing here has met a real guest agent or a real registry: the route,
    the quote's own bytes and the collateral the operator agent adds are all unexercised, and the
    operator agent itself is E11.3.
- [x] **E7.5 Job loop** · P0 · §3.14
  - Poll `get_jobs_for_room` and fork one worker per job.
  - The supervisor keeps the signing key, signs over IPC, and submits through the operator agent.
  - **From the contracts (E4, E5).** `get_jobs_for_room(room_key)` is live and returns only the room's **open** jobs (clearing removes one when it is answered or times out), each with its `kind`, `listing_id`, `job_commitment` and `deadline_height`. A room holds at most 32 open jobs. The context key a buyer sealed to the room is `get_context_key(job_id)`.
  - **Completed 2026-11-14.** `room/src/{scheduler,spawn,signer}.ts`. The loop polls
    `get_jobs_for_room`, never starts a job twice (the view still lists one until the room answers
    it), caps how many run at once, and survives a chain that is down. `forkSpawner` is the fork: an
    empty environment, a heap cap, one process per job, a ten-minute kill, and exactly two things a
    worker may ask for over IPC — a signature, or a relay through the operator agent.
  - **What the supervisor will not do.** It signs only a message beginning with one of the room's own
    domains (`marginal/verdict/v1` and four others) and at most 64 KiB, so a worker that has been
    talked into something cannot turn the room's key into a signature over a key request for another
    job or a registration for another room. `room-pop` is deliberately not on that list: the
    supervisor signs its own proof of possession and never takes one from a worker.
  - **Verified:** real forks of real worker processes, not a double — the happy path through
    signature and relay, a refused domain, a relay the agent rejects, a worker that exits non-zero,
    one that will not finish (killed), one that cannot be started at all, one that sends a message
    the supervisor does not take, and one that gives up before its relay comes back (the reply is
    dropped, not an error).
  - **Not verified:** anything a real worker does. The module `forkSpawner` forks,
    `room/dist/worker/main.js`, is E8; until then a job that arrives is forked, fails to start and is
    reported.
  - **Mutations over all of `room/src`: 54 run, 53 caught** — one per guard, constant, offset and
    policy check across the eleven modules. Four survived the first pass; three were real gaps and
    are closed: a full scheduler was never asserted to skip the RPC (it only looked full), the
    stop-before-first-tick test asserted before the microtask that reschedules, and `sign_sig` was
    never verified (E7.4). The one survivor that stays is `if (child.connected)` in `spawn.ts`:
    removing it changes nothing a test can observe, but it makes a finished worker's child emit
    `ERR_IPC_CHANNEL_CLOSED` after the job has already ended, so the guard earns its line.

## E8. Room worker and appraisers

- [x] **E8.1 Crypto** · P0
  - libsodium sealed boxes, XChaCha20-Poly1305, HKDF and `memzero`. Secrets are kept only in `Uint8Array`s.
  - **Completed 2026-11-14.** `room/src/crypto/sodium.ts`: sealed boxes, XChaCha20-Poly1305,
    X25519, HKDF-SHA256 and `memzero`, in one module so the room has one implementation of each and
    the SDK (E12.1) can produce the same bytes. `libsodium-wrappers` is pinned at `0.8.4`; HKDF
    comes from node, because libsodium's own KDF is not HKDF and §3.19 specifies HKDF-SHA256 with a
    salt and an info string.
  - **Checked against published vectors, not only against itself:** libsodium's own
    XChaCha20-Poly1305 IETF vector and RFC 5869 test case 1. These formats cross into a buyer's
    browser, so a round-trip against our own code would prove nothing about interoperability.
  - Every failure path is a thrown error with its own message (a sealed box that does not open, a
    ciphertext that does not authenticate, a wrong key or nonce length), so no caller can mistake a
    failure for a plaintext. Tampering with any byte of a sealed box, a nonce, a key or the
    associated data is tested.
  - The module readies libsodium with a top-level `await`, so there is no "did you initialise it"
    state for a caller to get wrong.
  - **Honest about zeroisation:** `memzero` is defence in depth. V8 can copy a buffer during garbage
    collection, so non-persistence rests on the worker process exiting, the CVM having no persistent
    storage and no swap, and TDX memory protection — which is what the forget certificate states
    (§3.14.2, §3.18).
  - **Not verified:** nothing uses these yet; E8.2 to E8.5 are the callers.
- [ ] **E8.2 CKD recovery** · P0 · §3.12.3 · **do first (S-1)** · code done; Done line **blocked on [P-3](#paid-and-account-gated-steps-jay)**
  - **First:** call `request_app_private_key` from a dev account on testnet and recover the key.
  - Then, per job:
    - a scalar `a` and app key `A`;
    - `app_id` computed locally;
    - recover σ, then check the pairing with the NEAR DST;
    - `K_L`, then `sk_L` and `pk_L`.
  - **Done:** the `ckd-example-cli` vectors pass, and a live derivation succeeds.
  - **From the contracts (E3).** To get a key the room signs `key_request_signing_bytes(KeyRequest{chain_id, keypolicy, room_key, job_id, path, app_key, job_commitment, value_class})` and the relayer sends it to `keypolicy.authorize`; the path is `listing_path(seller, listing_id, version)`. KeyPolicy then asks clearing, and `derive(ticket_id)` is callable by anyone, because the answer is encrypted to the room's app key. Both the bytes and the path are `@marginal/core-wasm` operations.
  - **Built, 2026-11-14.** `room/src/crypto/ckd.ts`: the per-job scalar and its app key
    `A = (a·G1, a·G2)`, the app id the room computes itself, σ recovery with the pairing check, and
    the listing keys derived from σ. The constants are near/mpc's, read from
    `crates/ckd-example-cli/src/ckd.rs` at release 3.19.0 rather than guessed: the hash-to-curve DST
    `NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_`, the app-id prefix `near-mpc v0.1.0 app_id derivation:`,
    and the HKDF salt `near-mpc-ckd-hkdf-v1`.
  - **The `info` string is ours, and deliberately not near/mpc's.** Their own note says to use a
    distinct `info` per key purpose, so `K_L` is derived with `marginal/ckd-listing-key/v1` and the
    X25519 secret under it with `marginal/ckd-listing-x25519/v1`. The test checks the two differ and
    that neither equals the example CLI's key, which is what that separation is for.
  - **What the pairing check buys, and why it is not optional.** `app_id` binds KeyPolicy's account
    and the path, so a σ that passes `e(H(mpc_pk ‖ app_id), G2) = e(σ, G2)` proves KeyPolicy — and
    therefore clearing — accepted this job's commitment (DR-5). Only then may the room trust job
    parameters it read over RPC. Every point is checked on-curve, in the prime-order subgroup and
    non-identity before use, as near/mpc's `verify` does, and a σ at infinity is refused.
  - **Tested:** the app id against an independently computed SHA3-256 (not against this code);
    recovery against an MPC side played exactly as near/mpc's own `simulate_ckd_response` does; and
    a refusal for each of a wrong app id, a wrong scalar, a wrong MPC key, a substituted point, a
    non-G1 answer, an identity point, and a σ at infinity. A seller sealing `DEK_g` to the derived
    `pk_L` is shown to reach this room and no other.
  - **The `ckd-example-cli` vectors pass.** A deterministic exchange (msk = 1234567890,
    a = 987654321, y = 55555) was printed from near/mpc's own `ckd.rs` helpers with
    `cargo test -p ckd-example-cli` at release 3.19.0, and the TypeScript recovers exactly that σ
    (`a33980119e8f…a564`) and exactly their strong key (`7bafabb3ad7f…d42a`). That pins the app id,
    the blinding, the hash-to-curve domain, the subgroup handling and the HKDF across two
    implementations and two curve libraries (`blstrs` and `@noble/curves`).
  - **Not verified: a live derivation**, the other half of the **Done:** line. No answer from the
    real MPC network has been recovered, so nothing proves the live domain id, the response shape on
    the wire or the latency.
  - **To close:** fund the testnet deployer ([P-3](#paid-and-account-gated-steps-jay)), call
    `request_app_private_key` on `v1.signer-prod.testnet` (domain 2) from a dev account with an app
    key from `appKey()`, and recover the key with `recoverSigma`.
- [x] **E8.3 Provisioning and screening jobs** · P0
  - Provisioning: derive `K_L` and submit `pk_L` with its certificate.
  - Screening: run `screening@1` and submit `Pass` or `Flag(code)` with its certificate.
  - **From the contracts (E4).** Both are signed messages, not bare arguments: `provisioning_signing_bytes(ProvisioningV1{…, pk_l, cert_hash})` and `screening_signing_bytes(ScreeningV1{…, result, cert_hash})`, each binding the chain, the contract, the job, the listing version and the room key (`@marginal/core-wasm`, with vectors). M1's only flag reason is `FLAG_MNPI = 1`. Clearing refuses a report whose job is not `Assigned` to this room, so the room must answer the job it was given.
  - **Completed 2026-11-14.** `room/src/worker/`: the worker's side of the supervisor channel
    (`ipc.ts`), the key round trip (`keys.ts`), what every job loads and checks (`context.ts`), the
    two jobs, and the entry point the fork runs (`main.ts`). Plus `room/src/cert/forget.ts` (the
    forget certificate, shared with E8.5) and `room/src/appraisers/screening/` (the MNPI lexicon and
    rules, which is E8.6's screening half, brought forward because E8.3 cannot run without it).
  - **A worker holds no key and has no network.** It asks the supervisor for a signature over one of
    the room's own domains, for a relay through the operator agent, or for a blob — and can ask for
    nothing else. Every I/O the SDD puts behind supervisor IPC (§3.14.1) now is.
  - **Verified end to end in one process and in a real fork:** a provisioning job derives the
    listing key through a real CKD exchange (the MPC side played exactly as near/mpc plays it),
    signs a certificate, stores it at `certs/{hash}` and reports `pk_L`; a screening job opens the
    good from a real sealed box and real XChaCha20-Poly1305, runs the lexicon and submits `Pass` or
    `Flag(1)`. `worker/main.test.ts` runs the whole worker through its entry point against an HTTP
    RPC, with the room drawing its **own random scalar** — so the pairing check is doing real work.
  - **What the tests pin, beyond the happy path.** A room refuses a job of another kind; a job whose
    chain id or KeyPolicy does not match the room's pins; a listing that moved version; a ciphertext
    that is not the published one; a wrap that is not `DEK_g ‖ salt`; a good that does not match its
    commitment; an `authorize` answer that is not a ticket id; a `derive` answer that is not a key.
    The screening report is checked to contain **none** of the document: clearing gets a reason code
    and the matched terms go only to the job log.
  - **Three things the contracts needed and core did not have**, now added with vectors:
    `attestation_ref` (SDD issue 35), and Borsh `key_request_encode`/`_decode`,
    `provisioning_encode` and `screening_encode` — clearing and KeyPolicy take Borsh in base64, and
    the room's signature has to cover exactly those bytes.
  - **A new pin in the measured image:** `MARGINAL_MPC_PUBLIC_KEY`. Every derived key is checked
    against it, so a host that could choose it could answer with a key it made itself. It goes in
    the compose file, which means it is measured and changes the compose hash.
  - **Deviation:** the forget certificate's `outcome` is `NoDeal` for both job kinds, because §3.9.2
    has no outcome for a job that priced nothing (SDD issue 36).
  - **Not verified:** no real MPC answer, no real blob store and no chain — the operator agent
    (E11.3) and the blob store (E11.1) are the other side of every call made here.
- [x] **E8.4 Appraisal pipeline** · P0 · §3.14.2 · **what clearing will check is built (E6.1, E6.2)**
  1. Load the job and recompute its commitment.
  2. Get the key through `authorize` + `derive`, and the context through `DEK_c`.
  3. A context that is too small gives `InputRejected`.
  4. A restricted-list match gives `Restricted` (D8).
  5. Fetch and check the good.
  6. Appraise and quantise.
  7. Decide the branch with core-wasm.
  8. Exit the process.
  - **From the contracts (E6.1).** Clearing recomputes the price itself from the published components and factors, so the verdict's own numbers are only a claim: send `VerdictV1` with `open: Some(OpenBody{components, factors, shown: vec![]})` and sign `verdict_signing_bytes`. It is **rejected, not fatal**, if the components are not what the formula takes, any field is shown (M1 is blind), the appraiser is not the listing's, a deal has no `delivery_commitment`, or `cert_hash` is zero — the job stays `Computing` until its deadline, so the room can fix it and send again. A room whose attestation has lapsed is refused outright, so renew before the window closes.
  - **Completed 2026-11-14.** `room/src/worker/appraisal.ts`, all eight steps in order, and the
    order is the design: the commitment is recomputed **before** anything is decrypted, the context
    is checked **before** the good is touched, and the restricted list is applied **before** the
    good is read. A job that fails any of those is answered with a verdict rather than left silent,
    because silence would lock the buyer's funds until the deadline.
  - **The commitment check is what makes the rest trustworthy (DR-5).** The room rebuilds
    `job_commitment` from the chain's own answers — including `formula_params` as the default and
    `assigned_rooms` empty, which is what clearing commits to at request time — and refuses the job
    if it does not match. A test tampers with one field (`max_debit_mbits`) and shows the room asks
    for no key at all.
  - **The worker still holds no key.** `box_sk` stays in the supervisor: the worker hands over the
    sealed context key and gets the plaintext back (a fourth IPC request). The supervisor cannot
    tell which job a sealed box belongs to, so a worker can open any context key sealed to this
    room — which is this room's own key for this room's own jobs, and the limitation is written into
    the code.
  - **Verified:** a full appraisal — components published, the delivery sealed and stored, the
    receipt submitted with the hash the verdict committed to, and **the buyer opening that delivery
    with their own key**; a compliance copy as a second entry only when the job asked for one; too
    little context giving `InputRejected` with the appraiser never called; a restricted-list match
    giving `Restricted` with nothing else computed; a missing context key; a tampered commitment; a
    snapshot the chain does not have; a malformed bundle; and a relay that answers without a price.
    One test runs the **real `knowledge@1`** from the image through the whole pipeline.
  - **Two views had to grow** for the room to recompute the commitment at all: `get_listing` now
    carries `disclosure_policy`, and `get_job` carries its buckets. `get_job`'s `mode` is now
    serialised by serde rather than `Debug`, because `DisplayMode::Fields` has a payload that
    `Debug` writes in a form nothing can parse back (M1 keeps `Fields` refused — SDD issue 11).
  - **Not verified:** nothing has run against a real chain, a real blob store or the real MPC
    network; the duration-class wait (step 11) is a cut M1 already made (E17); and no judge runs,
    so `factors` is empty and `judgement_factor([])` leaves the ceiling alone (E9.1).
- [ ] **E8.5 Delivery and certificate** · P0 · §3.18, §3.19 · **clearing's side is built (E6.1, E6.4)** · built; the SDK half of the Done line is E12.1
  - Deterministic `DeliveryV1`, with an optional `compliance_pk` entry (D8), and `h_D`.
  - A `ForgetCertificateV1` for every job.
  - **Done:** the delivery is byte-identical across runs, and the SDK opens it.
  - **From the contracts (E6.4).** The delivery hash the room submits to `submit_delivery_receipt` must equal the `delivery_commitment` the verdict carried, and it can be submitted once. Until it arrives the seller cannot be paid; past the listing's `delivery_deadline_blocks` the buyer gets the price and its fee back (`DeliveryFailure`). Certificates are anchored by hash in the audit chain, so the blob itself lives in the blob store.
  - **Built, 2026-11-14.** `room/src/crypto/delivery.ts` is §3.19 exactly: the ephemeral key is
    `HKDF(sk_L, salt = job_commitment, info = "marginal/delivery/v1")`, each recipient's key is
    `HKDF(X25519(eph_sk, r), info = "marginal/delivery-key/v1" ‖ eph_pk ‖ r)`, the nonce is
    `SHA-256(eph_pk ‖ r)[0..24]`, and the payload `DEK_g ‖ salt ‖ listing_version` is sealed with
    `job_commitment` as the associated data. The forget certificate is `room/src/cert/forget.ts`,
    already issued by both job kinds (E8.3).
  - **Nothing in it is drawn.** Two runs produce byte-identical `D` and therefore the same `h_D`,
    which is what the verdict commits to and what makes re-delivery possible from any room holding
    `K_L` (AC-31). The derived nonce is safe only because each `(eph_sk, recipient)` pair encrypts
    one message, so the nonce hashes both — the test checks two recipients get different ones.
  - **Tested:** byte-identical across runs; `h_D` equals `SHA-256` of core's own `delivery_encode`;
    the buyer and the compliance copy each open their entry and a stranger opens neither; another
    job commitment does not authenticate; the ephemeral derivation is checked against §3.19's HKDF
    rather than against itself.
  - **`get_job` now exposes `delivery_pk`, `compliance_pk`, `context_auth_pk`, `mode` and
    `snapshot_id`.** The room cannot seal a delivery or recompute `job_commitment` without them, and
    they are public keys the commitment already binds, so publishing them reveals nothing new.
  - **Not met: "the SDK opens it."** `openDelivery` here is the buyer's side and is tested, but the
    SDK does not exist. **To close:** E12.1 imports this sealing instead of re-implementing it, and
    opens a delivery the room produced.
  - **Not verified:** no delivery has been submitted to clearing, because that happens at the end of
    an appraisal (E8.4).
- [x] **E8.6 `knowledge@1` and `screening@1`** · P0 (MNPI: P1, D8) · §3.15
  - Port LETHE's `novelty.js`: claims, MiniLM max similarity per claim, τ 0.78 / 0.45, and need weighting. Single-threaded ONNX; `N_pub = 10,000`; 21-level components.
  - Screening: an issuer lexicon and MNPI rules, giving `Flag(reason)` or `Pass`.
  - **Done:** on the D1 fixture, A gets Deal and B gets No deal. The MNPI fixture is flagged.
  - **From E7.2.** This task brings `room/models/`, so it also carries the pins E7.2 could not: every
    MiniLM weight and tokenizer file pinned by SHA-256 and loaded with no runtime download
    (§3.14.3, AC-38). Adding them changes the image, so re-run `room/image/build.sh` and update
    `room/image/MEASUREMENTS.md` with the new compose hash.
  - **Built, 2026-11-14.** `room/src/appraisers/`: `screening/` (landed with E8.3, which cannot run
    without it) and `knowledge/` — the tokenizer, the embedder, the novelty measurement and the
    appraiser. `room/models/all-MiniLM-L6-v2/` holds the weights, fetched by `make models` and
    checked against a committed `SHA256SUMS` before every load; the binaries are gitignored (the
    ONNX file is 90 MB) and `build.sh` copies them into the image, so the compose hash covers them.
  - **Two deviations from the task text, both to make the room smaller and more deterministic.**
    `onnxruntime-web` instead of `onnxruntime-node`: the node package's `postinstall` downloads a
    native binary, which an image built with `--ignore-scripts` cannot run, and its kernels are
    chosen by CPU instruction set — the wasm build has no install step and the same kernels
    everywhere, which is what AC-38 wants. And the BERT WordPiece tokenizer is written out (160
    lines) rather than imported: `@huggingface/tokenizers` is a native binding and
    `@huggingface/transformers` drags an image library and a second ONNX runtime in with it, and
    every dependency inside the room is part of its measurement.
  - **Both are checked against the reference implementation**, not against themselves.
    `fixtures/minilm-vectors.json` holds `@huggingface/transformers` 4.3.2's own token ids and
    sentence embeddings for seven inputs (accents, CJK, punctuation, unknown subwords, empty); the
    room reproduces every id exactly and every embedding to a cosine above 0.99999. One documented
    difference: on an input over 126 tokens transformers.js drops `[SEP]` when it truncates and the
    room keeps it, which is what HF's Python tokenizer does — claims are never that long, and the
    fixture leaves that case out rather than pretend.
  - **The novelty measurement is LETHE's `enclave/lib/novelty.js`**, ported with its τ values
    (0.78 / 0.45) and its padding-resistant need weighting (AC-39), and with the one thing LETHE got
    wrong fixed: it fetched MiniLM from the network at run time, so it scored with weights the host
    chose. Components are quantised to 21 levels before they leave, and `N_pub` is a whole because
    M1 has no in-room corpus.
  - **The separation the Done line is about, measured:** the buyer's own notes read back scored
    **under 3,000 bps** and news to the same buyer **over 6,000 bps**, with the same need and
    context. Run-to-run output is byte-identical (AC-38), and the appraiser's output carries counts
    but no text — the test checks a distinctive word from the document appears nowhere in it.
  - **Not verified: the D1 fixture itself**, which is E14.2 (LETHE's Fund A and Fund B corpus). The
    separation above is on two documents written for the test, not on the demo corpus, so nothing
    here shows that A gets `Deal` and B gets `No deal` through the rule.
  - **Closed 2026-11-14 by E14.2.** The corpus exists and `room/src/appraisers/knowledge/corpus.test.ts`
    runs the real appraiser over it: Fund A's novelty is 9,735 bps and Fund B's 1,341 bps, which
    `marginal-core` prices at a **Deal at the ask** and a **no deal** respectively, with the outcome
    line 2.6× below A and 2.8× above B. The MNPI fixture is flagged, and the D1 memo passes the same
    screen. Swapping the two buyers' contexts fails the test.
- [x] **E8.7 `dataset-lite@0`** · P2 · D9 · §3.15.3
  - Integrity checks, then overlap measured with MiniLM.
  - A closed-form ridge, baseline vs augmented.
  - A bootstrap over eval-row correctness (B = 200, seeded from `job_commitment`, no retraining).
  - Outputs: bucket and price.
  - **Done:** DRC-9 completes within its duration class.
  - **Completed 2026-11-14.** `room/src/appraisers/dataset-lite/`: the integrity checks, the overlap
    measurement, the closed-form ridge probe (`linear.ts`) and the seeded bootstrap. Nothing
    iterates and nothing is drawn at random: one-vs-rest least squares in float64 with a fixed λ,
    solved by Cholesky, and a `xorshift128+` bootstrap seeded from the first eight bytes of
    `job_commitment` — so two rooms measuring the same job get the same interval to the last bit.
  - **A judgement the SDD left open:** the buyer's label set is taken from their whole dataset, not
    just the rows they trained on. A class the buyer can measure but cannot yet predict is exactly
    what a seller might be able to fix, and refusing those rows would make the appraiser blind to
    the lift it exists to measure. The test turns on that case.
  - **Verified:** rows the buyer already has count as overlap and are worth nothing; a dataset that
    teaches the buyer's evaluation set shows a lower bound above zero; the same job measured twice
    gives the identical answer, bootstrap and all (AC-38); and every malformed input — a row that is
    not `{text, label}`, a label the buyer does not use, too many rows, a context that is not a
    split — is refused rather than defaulted. A repeated row is dropped, not counted twice.
  - **Not verified: DRC-9's timing.** Nothing has been run at §3.15.3's caps (20k seller rows, 5k
    evaluation rows) on a `tdx.large`, so "completes within its duration class" is unmeasured. The
    caps are enforced, and the cost is one embedding pass plus a 384×384 Cholesky, but the number
    is not in hand.
  - **Note on the formula:** `DatasetLiteV0` divides by `delta_star`, and clearing commits
    `FormulaParams::default()` (zero) in M1, which `ceiling` reads as one — so `D` is effectively
    `1 − o` until a listing can set `delta_star_bps`. That is clearing's side (E16), not this task's.

## E9. Judges

- [ ] **E9.1 NEAR AI Cloud judges** · P1 · D6 · §3.16 · built; Done line **blocked on [P-2](#paid-and-account-gated-steps-jay)**
  - **First (S-5):** strict JSON, with reasoning off and `signature_kind == provider_tee`.
  - Models: `Qwen/Qwen3.8-27B` and `z-ai/glm-5.3-flash` (`reasoning_effort: "low"`).
  - Request: temperature 0, `stream: false`, headers `x-no-aliasing: true` and `Accept-Encoding: identity`, LETHE's delimiter prompt.
  - Strict regex parse; any parse failure gives 0. `JudgePort` has a test double.
  - **Done:** the injected memo is clamped to the floor, and its price stays at or below the ceiling (DRC-6).
  - **From the contracts (E6.2), which decide what a receipt is worth on chain:**
    - the body must be exactly `{"relevance":k}`, `k` in 0..=10 (whitespace aside), or it scores 0 and resolves to the listing's floor. `marginal_core::judge::parse_relevance` is that parse, as a `@marginal/core-wasm` operation, so the room can check a body before it publishes one;
    - the signed `text` must contain the lowercase hex of `sha256(response_body)`, which is how clearing binds the receipt to the body (`binds_body`);
    - the signature is `personal_sign` over that text, recovered with `ecrecover` to a **20-byte Ethereum address**;
    - governance registers that address with `set_ai_signer(address, model, expires_at)`, and the model string must match the factor's `model_id`: that pairing is the allow-list;
    - a receipt's text is accepted once, ever (the replay set), so a cached receipt cannot be reused on a second job.
    - **Unverified until this task runs:** whether NEAR AI's real `text` actually embeds `sha256(response_body)` in hex. E6.2's tests sign a receipt the way the provider's TEE would, not a real one. If the real format differs, only `binds_body` changes (`marginal-core`), and its vectors with it.
  - **Built, 2026-11-14.** `room/src/judges/`: the prompt (ported from LETHE's `ai.js`, with the
    scale changed to an integer 0..10), the NEAR AI client, the simulated stand-in, and the chooser.
    The appraiser carries the factors into the verdict, so `judgement_factor` takes the minimum of
    what came back and clamps it up to the listing's floor.
  - **The API key is not in the room, and cannot be.** A key written into the compose file would be
    published with the measurement, and `allowed_envs: []` means the host cannot pass one in either.
    So the client takes its transport as an argument: in a room that is the supervisor's egress
    proxy, which adds the key on the way out (§3.14.3). The room sends no `Authorization` header at
    all, and a deployment with no key needs no configuration — the call fails, the factor is zero,
    and zero resolves to the floor.
  - **Every failure is a factor of zero, never an exception**, because a judge that is down must not
    stop a job: twelve cases are tested (HTTP error, not a completion, not JSON, a reasoning field
    in the body, content that is not the strict shape, a value outside the scale, a signature
    endpoint that errors, a signature that is not `provider_tee`, one that is not 65 bytes, a
    receipt whose text does not bind the body, and either endpoint throwing).
  - **The room checks a receipt before it publishes one**, with `marginal-core`'s own
    `judge_body_ok`, `parse_relevance` and `receipt_binds_body` — the same functions clearing uses —
    so it never spends gas on a receipt the contract would refuse.
  - **`get_listing` now carries `external_judges_allowed`.** External judges are opt-in per listing
    (T35: NEAR AI's engines are launched at run time from a public repository and a signer address
    does not pin the code), and the room cannot honour an opt-in it cannot read.
  - **Not verified:** anything against the real service — no key, so no real receipt, no real
    `text` format, no latency and no cost. The simulated judge is what runs today, and it is
    flagged `Simulated` on chain so a demo cannot pass it off as a real one.
  - **To close:** a NEAR AI key ([P-2](#paid-and-account-gated-steps-jay)) and E11.2's proxy, then
    DRC-6: the injected memo clamped to the floor with its price at or below the ceiling.

## E10. Sealed verdicts (D10)

- [x] **E10.1 Circuit and dev setup** · P2 · §3.17
  - One circuit for `KnowledgeV1` with R1, plus the Poseidon commitment.
  - Phase 1: `ppot_0080_13.ptau`. Phase 2: one team contribution, labelled `dev`. The verifying key is stored pre-encoded.
  - **Done:** wrong witnesses fail, and the circuit agrees with core on 10³ vectors.
  - **Completed 2026-11-14.** `circuits/formula_knowledge_v1.circom`: 938 non-linear and 750 linear
    constraints, 8 public inputs (`jc_hi`, `jc_lo`, budget, ask, floor, outcome, price, commitment)
    and 5 private ones. Everything is integer basis-point arithmetic with range checks, floored the
    way `pricing.rs` floors it — a circuit that agreed with a real-number model but not with the
    contract would be worthless. The commitment is `Poseidon(7)` over the job's two limbs, the four
    private scores and a salt, so an opening cannot be moved to another job.
  - `circuits/build.sh circuit|ceremony` builds it. The committed artefacts are the verifying key,
    the proving key and the witness generator, pinned by `circuits/SHA256SUMS`: a re-run ceremony
    would produce a different proving key, so the one that matches the committed verifying key has
    to be the committed one. The intermediate `.r1cs`, `.sym` and the ceremony are gitignored.
  - **Verified:** `room/src/prove.test.ts` runs 10³ pseudorandom cases — components, factors, floor
    and ask drawn by a fixed xorshift so every machine runs the same ones — prices each with
    `marginal-core` through `@marginal/core-wasm`, and hands the answer to the circuit's witness
    generator, which checks every `===` constraint. All 1,000 are accepted; all 1,000 with the
    outcome bit flipped are refused. It asserts both branches are present (deals and no-deals), so a
    run that priced everything the same way could not pass. About 25 s.
  - **Not verified:** the setup is `dev` and that is not decoration. Phase 1 is local
    ([issue 37](#sdd-issues-found-while-planning)) and phase 2 has one contribution, from this
    machine; anyone holding either phase's toxic waste could forge a proof. Acceptable only because
    every M1 deployment is flagged on chain, and it is E19's to redo.
- [x] **E10.2 Verification in clearing** · P2 · §3.17
  - **First (S-3):** measure the gas.
  - `marginal-groth16` runs inside `submit_verdict` in M1: one multiexp, a `g1_sum`, and the pairing check.
  - **Done:** Blind + Sealed debits exactly 1,000 mbits; an invalid proof gives `E_PROOF_INVALID`.
  - **Completed 2026-11-14.** `crates/marginal-groth16` does the verification over the host's
    `alt_bn128` functions: one multiexp over `IC`, one `g1_sum` to negate `A`, one pairing check of
    four pairs. It deliberately does not parse a verifying key — a key arrives **already prepared**
    (`marginal_core::groth16::VerifyingKeyJson::prepare`, off chain), because decoding one from its
    JSON on chain would cost more than the verification it enables. `set_verifying_key` (gov) checks
    the shape once, when it is set, so a key that is stored is a key that can be used.
  - Also in core: `groth16.rs` (`decimal_le`, proof and input encoding, `commitment_limbs`) with four
    new wasm ops and vectors, so the room and `replay-ts` encode exactly what the contract reads.
  - Two gaps found while building it and fixed: the settlement record's `components_commitment` was
    always `None`, although §3.3 marks it "Sealed mode only" — it now holds the commitment the proof
    was checked against, which is what a later opening is replayed against, and `get_settlement`
    shows it; and `get_listing` did not expose `l_floor_bps`, which is one of the proof's public
    inputs, so the room could not read a value it has to prove against.
  - **Verified:** `contracts/clearing/src/tests/sealed.rs`, 12 tests, against **two real snarkjs
    proofs** made for that test's own job (`fixtures/groth16-vectors.json`, under `sealed`; the
    fixtures' public inputs are asserted to be the job's, so a change to the request or the listing
    fails loudly instead of as a pairing error). A Sealed deal settles at the ask and debits exactly
    1,000 mbits; a Sealed no-deal refunds the buyer and debits 1,000; a **valid proof of the other
    outcome** gives `E_PROOF_INVALID`, leaves the job `Computing` and writes no settlement; with no
    key set it is `E_PROOF_DISABLED`; and the schema refusals (both bodies, no body, a shown field,
    a body with a price but a status without one, another rule) each leave the job open.
  - **Not verified: the gas (S-3).** The pairing check has only run under near-sdk's mocked host,
    which charges nothing. From NEAR's published parameters the call is about **78 TGas** — multiexp
    17.1 + 9 × 3.4, pairing check 9.7 + 4 × 5.1, the `g1_sum` negligible — which leaves room inside
    the 300 TGas limit, but that is arithmetic, not a measurement. A near-workspaces test that walks
    a Sealed job to `Computing` and submits one of these proofs is the measurement; it belongs with
    E14.1's cross-contract suite.
- [x] **E10.3 Room prover** · P2
  - snarkjs in the worker.
  - **Done:** DRC-10; the buyer sees only the outcome.
  - **Completed 2026-11-14.** `room/src/prove.ts`: the outcome and the price are what core says
    (`measured_index`, `apply_rule` through `@marginal/core-wasm`), and this file only arranges them
    into the circuit's public inputs — a prover that disagreed with the contract would produce
    proofs the contract rejects, which is the failure mode worth having. The witness generator and
    the proving key are read through `readVerified`, like the embedder's weights, so a host cannot
    swap in a key that proves something else (DR-9).
  - `room/src/measured.ts` is new: `readVerified` moved out of the embedder, because the prover
    needs the same check (CLAUDE.md rule 5). Its own test moved with it.
  - **Two dependencies join the room's measurement:** `snarkjs@0.7.6` and `circomlibjs@0.1.7`. Both
    are pure JavaScript and wasm with no install script, which is what lets them be in an image
    built with `--ignore-scripts`. snarkjs caches its worker pool on the global object, so
    `proveSealed` releases it after each proof: one proof per job, and a process that kept the pool
    would never exit.
  - **Verified:** `room/src/prove.test.ts` — the room's own proof, from the same inputs, carries the
    commitment the contract's fixture carries and verifies against the committed verifying key; and
    `room/src/worker/appraisal.test.ts` runs the whole pipeline in Sealed mode: the submitted verdict
    has `open: null`, a 32-byte commitment and a 256-byte proof, the outcome and the price clearing
    would have computed, and the room reports **no components** back. A job whose formula or rule the
    committed key is not for is refused rather than answered with a proof that cannot check out.
  - **Not verified:** one process end to end — the room's tests talk to a fake operator and a fake
    chain, so the proof has never gone from a real room into a real `submit_verdict` (that is E14.1
    and the testnet demo); and the image cannot run yet, which is E7.2's own open item. The image
    build does carry the circuits (`room/image/Dockerfile` copies them to the path `prove.js`
    resolves, and `build.sh image` prints `circuits_sha256`).

## E11. Services

- [x] **E11.1 Services host** · P0 · §2.7
  - One docker compose: gateway, operator agent and MinIO. Compliance runs as its own container.
  - **Completed 2026-11-14.** `deploy/services/`: one Dockerfile for all three (same workspace, the
    command picks the entry point) and a compose file. Compliance is its own container with its own
    volume, because it holds the two keys that can grant something. `services/common` is the HTTP
    plumbing the three share — routing, bodies, errors, env — so none of it is copied.
  - **Deviation: no MinIO.** The gateway stores objects itself, content-addressed, with HMAC-signed
    upload grants. An S3 server would be a second thing to run and secure for no demo surface, and
    the property that matters — an object cannot be swapped for another — comes from the grant
    naming the content's SHA-256, not from S3. `deploy/services/README.md` says so.
  - **Not the room's image.** Nothing here is measured or reproducible: these services are untrusted
    by design, and `room/image/` is the one with pinned digests because that one is what a seller
    pins.
  - **Not verified:** the compose has not been brought up (that needs a funded agent key and a
    deployed clearing, [P-3](#paid-and-account-gated-steps-jay)); each service is tested over real
    HTTP in process.
- [x] **E11.2 Gateway** · P0 · §3.22
  - Content-addressed presigned uploads (ciphertext only).
  - `GET /v1/replay/{job_id}`: runs `replay-ts` with the `dcap-qvl` CLI.
  - A 1Click dry-quote proxy that stores nothing and never logs response bodies (D7).
  - **Completed 2026-11-14.** `services/gateway/`: the content-addressed store, the replay endpoint
    and the dry-quote proxy, all over real HTTP in the tests.
  - **An upload is two steps and the second is checked.** `POST /v1/uploads` issues a grant naming
    the key, the content's SHA-256 and its size, signed with the deployment's HMAC key; `PUT
    /v1/blob/{key}` is refused unless the bytes hash to what the grant said. So the gateway being
    untrusted costs nothing: it cannot substitute an object, and it holds no upload state.
  - **Tested:** the whole flow; an upload with different bytes of the same length, the wrong length,
    another key, a token from another deployment's key, an expired grant, and no token at all; a key
    with `..` in it; and a grant request with every field malformed.
  - **`/v1/replay/{job_id}`** takes `replay-ts` as a dependency and answers 503 when it is not
    configured, which is the honest answer until E12.2 exists — the route is wired, the verifier is
    not written.
  - **The dry quote forces `dry: true`** whatever the caller asked, so this proxy can never commit
    anyone to a swap, and it keeps nothing: no body is stored and none is logged (D7).
  - **Not verified:** no real 1Click call (the upstream is stubbed), and the replay endpoint has
    never served a real replay.
- [x] **E11.3 Operator agent** · P0 · §3.13
  - `issue_nonce`, collateral fetch, `register_room` relay and renewal.
  - Relays the room's signed submissions from a funded function-call key. Restarts the CVM.
  - **From the contracts (E3).** A nonce is bound to the account that asked for it, so the same key must call `issue_nonce` and `register_room`; it lasts 5,000 blocks (about 80 minutes) and one `register_room` spends it whatever happens next. Registration costs 0.01 NEAR of storage and the verifier call gets 200 TGas, so **run the pre-flight first**: the `evaluate_quote` operation in `@marginal/core-wasm` makes the same checks KeyPolicy will, against the quote and event log the room produced, and a registration that would fail is then caught before it spends gas. Collateral comes from `pccs.phala.network` through `dcap-qvl`, and the attestation is only good for 24 h, so renew daily.
  - **Completed 2026-11-14.** `services/operator-agent/`: the nonce, the registration relay with its
    collateral, the submission relay, the blob channel and the judge proxy. The `near.ts` relay is
    the real `near-api-js` client and is tested against a **fake JSON-RPC node** — signing, action
    encoding, gas and deposit included — rather than behind a double.
  - **The agent can only do what the room is allowed to ask for.** Methods are an allow-list per
    contract (`authorize` and `derive` on KeyPolicy; the four submissions on clearing), and anything
    else is a 403 that never reaches the chain. It attaches the storage deposits KeyPolicy charges,
    and 300 TGas for a registration because the verifier call alone takes 200.
  - **The NEAR AI key lives here and nowhere else.** `/v1/judge` forwards exactly two paths to NEAR
    AI, adds the `Authorization` header and **forces `x-no-aliasing: true`** whatever the room asked
    — aliasing would make the signature the gateway's rather than the model's TEE, which is not the
    room's choice to make. The body is passed through untouched and never logged: it is what the
    provider's TEE signs over and what ends up on chain in Open mode.
  - **Collateral is `dcap-qvl`'s.** A missing binary is a 503 naming it, not a 500, because an
    operator has to install it and the message should say so.
  - **Not built: the CVM restart.** It needs Phala's API and a running CVM
    ([P-1](#paid-and-account-gated-steps-jay)); the agent has no credentials for Phala and does not
    pretend to. **Not built: the room's own pre-flight before registering** — the room already runs
    `rtmr3_replay` and `room_events` on its own quote before handing it over (E7.4), so the agent
    would be checking a second time; `evaluate_quote` on the agent's side is worth adding when there
    is a real quote to try it on.
  - **Not verified:** nothing has run against a real chain or a real `dcap-qvl`.
- [x] **E11.4 Compliance service** · P0 (OFAC: P1, D8) · §3.20
  - Issuer key labelled `demo`; SQLite.
  - `POST /v1/nullifiers` for allow-listed demo identities.
  - `POST /v1/payout-approvals` screens against the OFAC SDN file, fetched at start and daily.
  - **Done:** D4 credentials work, and a payout to a listed address is blocked.
  - **From the contracts (E5.4, E6.4).** Both are ed25519 over bytes `marginal-core` builds, with vectors: `nullifier_signing_bytes(NullifierCredential{chain_id, clearing, subject, listing_id, epoch, nullifier, expiry_height})` under the key set by `set_issuer_key`, and `payout_approval_signing_bytes(PayoutApproval{…, route_hash, list_version, screening_id, blocked, expiry_height})` under `set_compliance_key`. `route_hash` is `sha256(borsh(PayoutRoute))` of the listing's own route. A sanctions match is `blocked: true` with the screening id, which clearing records as `Blocked` rather than paying; it is not a refusal to sign.
  - **Completed 2026-11-14.** `services/compliance/`: the two signing keys, the SDN parser, the
    SQLite record and the two endpoints. Both answers are signatures over `marginal-core`'s own
    bytes, verified in the tests the way clearing verifies them.
  - **D4 works and D8 blocks.** A demo identity gets the same nullifier for the same subject,
    listing and epoch — which is what stops one person appraising a listing twice through two
    accounts — and a different one next epoch. A payout to a listed address comes back
    `blocked: true` with a screening id and the list version, which clearing records as `Blocked`
    while keeping the money claimable: nothing is seized and the decision can be re-checked against
    a file anyone can download.
  - **It refuses rather than guesses.** An unread list is a 503, never a quiet "not listed"; a list
    that cannot be fetched is an error, not an empty list; and the service never learns the payout
    route, because the route is hashed before it arrives.
  - **Not verified:** the real SDN file has never been parsed (the tests use a fixture in Treasury's
    own shape, and a 10 MB download does not belong in a test), and nothing has been checked against
    a deployed clearing.

## E12. SDK and verifier

- [ ] **E12.1 SDK** · P0 · §3.23 · **the browser half is built (E13.2 needed it)**
  - Crypto: `canonicalise` (`.md`, `.txt`); DEK, AEAD and salted commitments; seal `DEK_g` to `pk_L` and `DEK_c` to `box_pk`; delivery keys in IndexedDB.
  - Transaction builders: listing, provisioning, pins, publish, snapshot, deposit, request, approve, claim, withdraw.
  - Also:
    - `watchJob`, by polling `get_job`;
    - `openDelivery`, which checks the good's commitment;
    - Chain Signatures address derivation and the 1Click dry quote, ported from LETHE.
  - **Built 2026-11-14, the browser half.** `sdk/ts/src/crypto.ts`: `canonicalise` (`.md`/`.txt`,
    documented byte for byte because the commitment is taken over its output), a local-only `claims`
    preview that mirrors the room's own rule, `dek`/`salt`/`aeadSeal` in the room's exact format
    (`nonce ‖ XChaCha20-Poly1305`), `sealTo` (libsodium sealed box) and `wrapKey` for the
    `DEK_g ‖ salt` bundle the room opens, `goodCommitment` over WebCrypto, and the delivery keys in
    IndexedDB with an in-memory fallback so it is testable. It is **browser-safe on purpose**: no
    `node:*`, and nothing from `@marginal/core-wasm`, which loads its wasm through `node:fs`.
  - **`goodCommitment` is pinned to core**, not merely consistent with it: a test computes the same
    commitment with `marginal-core`'s own `good_commitment` op and asserts the two are equal, which
    is what lets a seller publish a commitment the contract and the room will both accept.
  - **`openDelivery` and `openGood` are built too** (2026-11-14), which is what DRC-1's "the
    delivery decrypts in the browser and the commitment check passes" needs. The delivery's keys and
    nonces are *derived*, not drawn (§3.19), so this side has to agree with the room's to the bit:
    the test opens **a delivery the room's own `sealDelivery` produced**, for the buyer and for the
    compliance copy, and checks that the wrong job commitment fails to authenticate. `openGood`
    then opens the listing's ciphertext with the delivered key and refuses it unless
    `SHA-256(salt ‖ good)` is the commitment the listing published — decrypting alone would prove
    only that a key was delivered.
  - Both are wired in: `/jobs/[id]` opens a delivery from the key this browser kept (or one pasted),
    and `/compliance` opens the compliance copy with the officer's key. Neither key ever leaves the
    tab; `/api/delivery` only fetches the two objects from the gateway and decodes the public
    envelope, because the gateway sends no CORS headers and the Borsh is core's.
  - **Still to build:** the transaction builders as a package (the pages build their arguments
    through `/api/encode`'s allow-list today, which is the same `@marginal/core-wasm` call in the
    same process — but the SDK is where a second client would find them), `watchJob`, and the Chain
    Signatures address derivation and 1Click dry quote ported from LETHE.
  - **From the contracts (E4, E5).** Every argument that carries a `marginal-core` type is **Borsh in base64**, built through `@marginal/core-wasm`, never hand-rolled JSON: `ListingSpec` for `create_listing`, `PublishSpec` for `publish_listing`, `BlobRef` for `anchor_snapshot`, `AppraisalRequest` for `request_appraisal`, `MeasurementSet` for `approve_measurement_set`. A deposit is `ft_transfer_call` with `msg = {"Deposit":{"account":"<id>"}}`. Run core's own checks before paying gas: `validate_spec` and `validate_request` refuse exactly what the contract will. Amounts come back from views as decimal strings.
- [ ] **E12.2 `replay-ts`** · P0 · D2 · §3.18 · **built, and honest about what views cannot give**
  - Checks, per settlement:
    - signatures;
    - the Open recompute, or the Sealed proof;
    - conservation, and debit = `max_debit`;
    - the certificate anchor;
    - the audit chain, via `get_audit`.
  - It follows each certificate to its quote with the `dcap-qvl` CLI, compares against the current approved set, and counts `simulated_flags`.
  - **Done:** DRC-2; flipping any stored byte makes it fail.
  - **Built 2026-11-14.** `verifiers/replay-ts` recomputes, with `marginal-core` itself: the state
    an outcome must end in, the buckets settlement leaves behind, the debit against its reservation
    (DRC-2's "debit = `max_debit`", DRC-10's exactly 1,000 mbits), π · d, the certificate anchor,
    and the whole audit hash chain against `audit_head()`. One flipped byte in the log fails it, and
    a test proves that. It is wired into the gateway's `/v1/replay/:id` (which answered 503 until
    now) and into the web app's own route handler, so a reader gets the same answer from either.
  - **What it cannot do from four views, and says so in the report:** a verdict's components, judge
    factors, room signature and Groth16 proof are in the transaction that carried them, not in a
    view, so the Open recompute of `m` and the signature check are **named as unchecked** rather
    than implied. Closing that needs the verdict bytes — a transaction read or an indexer (E18).
  - **To close:** DRC-2 needs a testnet settlement to run against, the `dcap-qvl` walk, and the
    verdict bytes for the recompute. Two core ops were added for it (`state_for`, `compensation`),
    each with a vector.
  - **From the contracts (E2–E6).** Everything it needs to recompute is a `@marginal/core-wasm` operation with a vector in `fixtures/vectors.json` (84 cases): the verdict and certificate signing bytes, `measured_index` and `apply_rule` for the Open recompute, `max_debit` for the debit, `settle` for the outcome table, `check_conservation` for AC-4, `audit_step` for the chain, and the judge rules (`parse_relevance`, `binds_body`, `personal_sign_preimage`) for each receipt. Read the chain with `get_settlement`, `get_job`, `get_listing` and `get_audit(from, limit)` (capped at 100 entries a call).

## E13. Web app

- [x] **E13.1 Shell** · P0 · §6.3, §3.23
  - Next.js, wallet selector, manifest-driven configuration, strict CSP. A banner for simulated elements, driven by on-chain flags (DRC-12).
  - **Done:** the shell renders on every route from a fresh browser, reads which deployment it is
    talking to from the deploy manifest, offers the viewer's own wallet, and carries the simulated
    banner the profile's on-chain flags produce.
  - **Completed 2026-11-14.** `apps/web` is a Next.js 15 app started from
    `7blocklabs-products/eu-ai-act-gov/app` rather than from scratch: its theme (the four brand
    tokens, Geist + Space Grotesk + Geist Mono) and its 88 vendored `components/ui` files came over
    untouched, and everything of the previous product — Clerk, Stripe, Prisma, the AI SDKs, 160 API
    routes, 15 domain component directories — was removed. Two bugs came with the copy and were
    fixed: its dark tokens were dead code (no `ThemeProvider` existed) and `ui/sonner.tsx` pinned
    itself to light.
  - `src/lib/config.ts` reads `deploy/manifest.<profile>.json` at run time (it is gitignored, so it
    is never imported) with an environment override per field; `src/lib/simulated.ts` turns the
    `SIM_*` bits into the words on the banner and on each record, which is the same function E15.3's
    README table will be generated from. `src/components/wallet.tsx` is wallet-selector with
    MyNearWallet, and it signs **descriptors** the SDK builds — the server holds no key.
  - **Verified:** every page returns 200 and renders real view data from a local sandbox; the banner
    reads "This is the sandbox profile on sandbox…"; a per-record card on `/jobs/[id]` names a
    simulated attestation and a simulated judge with what each one means (DRC-12).
  - **Not verified:** the CSP has not been exercised by a browser (it is set in `next.config.ts` on
    top of the four headers that came with the copy), and no wallet has signed anything, because
    MyNearWallet cannot sign for a local sandbox — that needs the testnet deploy
    ([P-3](#paid-and-account-gated-steps-jay)).
- [x] **E13.2 `/sell`** · P0 (payout: P1, D7)
  - Wizard: file → canonicalise → parameters → provision → seal and upload → pins → publish.
  - The payout step shows the derived Solana address and a live dry quote, which is not stored.
  - **Done:** a seller can take a document from their disk to a published listing without the
    plaintext leaving the browser, and see every argument before it is signed.
  - **Completed 2026-11-14.** Seven steps that unlock strictly in order, because each one needs what
    the last produced: the document is canonicalised and committed to in the browser, the spec is
    checked with core's own `validate_spec` **before** any gas is paid, the listing is created and
    provisioning begun, the good is sealed and uploaded, the pins are set, and only then is it
    published. What reaches the chain is a commitment and a ciphertext hash; what reaches the
    gateway is ciphertext; what reaches our server is neither.
  - **The seller-to-room handshake is verified against the room's own code**, which is the part that
    could silently not work: an object sealed by `@marginal/sdk` and uploaded through the gateway
    was fetched back and opened by **the room's** `unseal` and `aeadOpen`, and
    `SHA-256(salt ‖ good)` equalled the published commitment. `/api/encode` was exercised against
    the real wasm (an allow-listed op encodes, a disallowed one is 403, bad input is
    `E_DECODE`), and `/api/blob` against the real gateway (stored and served back byte-identical;
    a gateway that is not running is a 502 that says so). Four mutations — unpadded base units,
    salt and good swapped, CRLF normalisation removed, the nonce not prepended — were each caught
    by the tests and reverted.
  - **Not verified:** the four signed steps (`create_listing`, `begin_provisioning`, `set_pins`,
    `publish_listing`). No browser wallet signs for a sandbox, and no eligible room exists on one,
    so step 5 is blocked on `pk_L` — which the page says plainly rather than hiding. Their argument
    shapes were checked by reading the contracts. The payout step's live dry quote (D7) goes through
    the gateway's 1Click proxy and is displayed, never stored, per its terms.
- [x] **E13.3 `/listings` and `/listing/[id]`** · P0 · D1, D4
  - Rule, leakage meter (spent / reserved / budget), pins, screening status.
  - **Done:** the market lists every published listing from contract views alone, and a listing's
    page shows the rule, the leakage meter, the pins and why it can or cannot be appraised.
  - **Completed 2026-11-14.** There is no indexer in M1, so the market is enumerated the only way a
    view allows: `config()` says how many listings exist and each is read by id, newest first, with
    a gap skipped rather than treated as an error. The meter counts **reserved** bits against the
    budget as the contract does, which is why a listing can refuse an appraisal while its spent
    total still looks small.
  - **Verified live** against a local sandbox with a real listing: ask 400 mUSDC under R1, floor
    10%, 32 bits of budget at π = 6.25 mUSDC a bit, the real key-path hash, `FollowGovernance`
    pins, "listing key: not provisioned yet", and the status note explaining that a `Draft` cannot
    be appraised yet.
  - **Not verified:** the screening status of a `Held` listing (D8 needs the MNPI fixture, E14.2)
    and an `Exhausted` one (D4 needs the red-team script, E14.3).
- [x] **E13.4 `/appraise/[id]`** · P0 · D1, D8, D10
  - Notes, or a restricted list (D8); the stated need; budget.
  - Privacy: Open, or Sealed once D10 is on, with the debit and cost shown. Seal, then request.
  - **Done:** a buyer can see what an appraisal will cost them in bits and in tokens before they
    sign, choose the mode, and send a request the contract accepts.
  - **Completed 2026-11-14.** The cost preview is core's own: `max_debit` for the mode and the
    judge count, π × d ÷ 1000 for what the seller is owed, and `validate_request` before anything is
    signed, all through `/api/appraise` because `marginal-core` is a wasm module that cannot run in
    a browser. Open and Sealed are shown side by side, so "one bit" is a number the buyer can
    compare rather than a claim.
  - **Verified:** the page renders listing 1 from the live sandbox with its ask, floor and leakage
    meter, and refuses to offer a form for a `Draft` (`statusNote`'s reason is shown instead); the
    route answers `open` 16,706 mbits / 104.4125 mUSDC and `sealed` 1,000 mbits / 6.25 mUSDC against
    the real wasm, encodes the Borsh argument, and refuses an unknown op with `E_DECODE`. 21 tests,
    100% of the two `.ts` files.
  - **The appraisable path was then verified** against a stub RPC serving an `Active` listing: the
    stated need, the context and restricted-list fields, the budget defaulted to the ask with the
    escrow balance beside it, both modes with their debit, the judge count, and the two honest notes
    the build needs — that the context envelope is not sealed yet (E12.1) and that no browser wallet
    knows a sandbox.
  - **Not verified:** the signature path and the hop to `/jobs/<id>`, because no wallet can sign for
    a sandbox and no `Active` listing exists on one.
  - **Two view gaps it had to work around**, both recorded as SDD issues 39 and 40: the listing's
    `OutputSchema` is not in `get_listing` (only its hash), so the Open debit comes from a local
    table that is used **only when its own hash matches the listing's**; and the appraiser
    registry's `compute_fee` has no view, so the escrow figure is shown as excluding it.
- [x] **E13.5 `/jobs` and `/jobs/[id]`** · P0 · D1, D5, D6, D11
  - State, outcome, refund, certificate verification (gateway replay), delivery decrypt-and-check.
  - An approve button for `PendingApproval` (D5).
  - **Done:** a job's page shows its state against §3.5's machine, the money to the unit, the
    simulated flags its settlement carries, and the two calls a viewer can make on it.
  - **Completed 2026-11-14.** `jobActions` decides what is offered from the state and the **block
    height**, not the clock, because a deadline is a height: `approve_parked` appears only on
    `PendingApproval` (D5's button, which exists here because M1 cut `/agents`), and
    `refund_expired` only once the deadline has passed and the job is still running (D11 — anyone
    may call it). Both are signed by the viewer's own wallet.
  - **Verified:** `/jobs` renders from `config().next_job_id` against the live sandbox, and
    `/jobs/[id]` was rendered against a settled job served by a stub RPC built from the view shapes
    these pages are typed against — the Deal path shows the outcome sentence, the buckets, the
    price, the refund, the debit in bits, the certificate, and the DRC-12 card naming a simulated
    attestation and a simulated judge.
  - **Not verified against a real settled job**, because a job needs a registered room and the
    sandbox deploys the real KeyPolicy, which refuses a room without a real TDX quote
    (`E_NO_ELIGIBLE_ROOM`). E14.1's near-workspaces suite deploys `keypolicy-sim` and is where this
    becomes a real end-to-end check; D6's clamped-judge display and the delivery
    decrypt-and-commitment-check (E12.1's `openDelivery`) are waiting on the same thing.
- [x] **E13.6 `/verify` and `/rooms`** · P0 · D2, D3
  - `/verify`: the replay explorer and the certificate → quote walk.
  - `/rooms`: PPID, TCB status, RTMR3 events and the measurement.
  - **Done:** `/verify` re-checks every settlement from public chain data and walks one certificate
    back to its quote; `/rooms` shows each eligible room's attestation record.
  - **Completed 2026-11-14.** `/verify` runs E12.2's verifier through `/api/replay/[jobId]` and
    shows every check by name, with the checks four views **cannot** give marked with a dash rather
    than counted as passes. `/rooms` lists the rooms `eligible()` reports — which is the honest
    list, since an expired room is not one a good can be opened by — with the PPID hash, the TCB
    status, the measurement, the RTMR3 event order that proves `key_provider: none`, and
    `check_room`'s deny reasons.
  - **Verified:** both pages render against the live sandbox (empty: no room is registered) and
    against a stub RPC carrying a settled job and a simulated attestation, where the replay reported
    8 checks passed and 2 named as unavailable, and the walk showed settlement → certificate → room
    key → mode → quote → collateral → measurement → compose hash.
  - **Not verified:** DRC-2's native `dcap-qvl` leg and a real TDX quote (E7.1,
    [P-1](#paid-and-account-gated-steps-jay)), and DRC-3's reproducible rebuild from a git tag.
- [x] **E13.7 `/compliance`** · P1 · D8
  - Compliance-copy decrypt.
  - Audit export, built in the browser from `get_audit`, settlements and certificates, and re-verified on load.
  - **Done:** the page shows what compliance holds and what it screened, and an audit export built
    from chain data alone that re-verifies when it is loaded back.
  - **Completed 2026-11-14.** The export is a zip built in the browser from `get_audit`, the
    settlements, the listings' public metadata and the certificate hashes, with a manifest naming
    the chain, the clearing account, the published head and the head the walk recomputed. Loading
    one back re-folds the chain with core's `audit_step` and compares every entry against the chain
    — which is why it needs no signature from us (that is what M1 cut, and why it can be cut).
  - **A race found and fixed while building it:** `get_audit`'s window is a range of *sequences*,
    not a page of entries, so the last page reaches past the head that was just read. On a live
    chain an entry landing in between would be folded into the digest and a sound chain would be
    reported broken. The walk now drops anything past the head it started from.
  - **Verified live** against the sandbox: 2 of 2 entries walked and the recomputed head equal to
    the contract's `0f6f02da…151b75`; the browser loop export → zip → load → re-verify answered
    "holds"; and the tamper cases are caught by sequence and by field (an edited `payload_hash`
    gives "seq 2: payload_hash differs from the chain", a removed entry "seq 2: the export is
    missing this entry", a foreign zip a 400). 62 tests, 100% of both `.ts` files, plus 7 mutation
    checks on the audit logic — every one of them fails the tests.
  - **Not verified:** the compliance-copy decrypt itself. The delivery is not a sealed box: it is
    HKDF over X25519 with XChaCha20-Poly1305 and a derived nonce, with the job commitment as AAD
    (§3.19), so opening it belongs to E12.1's `openDelivery` and is behind a `TODO(E12.1)` naming
    that function. Everything around it is wired: the sealed bundle is fetched and decoded, the
    compliance entry is identified against `job.compliance_pk`, and the pasted key never leaves the
    component. Nor is the sanctions panel verified against a running compliance service, and no
    `Held` listing or `Restricted` job exists yet (E14.2's fixtures).

## E14. Tests, fixtures and demo scripts

- [x] **E14.1 Sandbox contract tests** · P0 · §5.2
  - near-workspaces, with `keypolicy-sim`, the mock MPC, an imported tee-verifier, `musdc` and a test room key.
  - Covers SC-1–SC-3, SC-10, SC-11, SC-14, SC-15, SC-21, SC-29 and every M1 refund path.
  - **Done:** the demo's spine runs on a real chain, and every figure the contracts store is the one
    `marginal-core` says it should be.
  - **Completed 2026-11-14.** `contracts/tests/` is a workspace member with no `src/`: a world
    (`tests/common/mod.rs`) and three suites. The world deploys the **real** clearing, KeyPolicy in
    its `keypolicy-sim` build (so a room can register without a TDX quote), the **real locked
    tee-verifier** from `fixtures/`, the mocks wasm as the MPC network, and `musdc` — nothing is a
    double for a contract that exists, and every signature is real. It then seeds governance and
    exposes the whole script as steps, so a suite reads as the demo does. `marginal-core`'s own
    sample listing is included by `#[path]`, so the figures are the ones `fixtures/vectors.json`
    came from.
  - **What is asserted, to the unit** (ask 400,000,000, π 1,000 a bit, compute fee 1,000,000):
    a job's leakage is `1000 + 2·mbits(16) + 2·mbits(11)` = **15,920 mbits**, derived without
    calling `max_debit`; a deal takes a deposit of **503,515,920**, holds the ask, refunds
    **100,500,000**, pays the seller **15,920** of compensation and splits a **2,000,000** fee
    1.2M/0.6M/0.2M; after delivery and the challenge window the seller is owed **396,015,920**, the
    operator **1,000,000** and governance **6,000,000** — and the whole run conserves, with the two
    buyers' net spend equal to the three claimable balances. A no-deal refunds **402,000,000**,
    which is the deposit less the compute fee and π·d exactly.
  - **The refund paths are all there**: a timeout from `PendingApproval`, `Assigned` and `Computing`
    returns the full deposit, releases the reservation, debits nothing and anchors no certificate,
    and a second call is `E_JOB_STATE`; `Restricted` debits exactly 1,000 mbits and
    `InputRejected` nothing; a `DeliveryFailure` takes back the price *and* the fee charged on it,
    leaving the seller only its compensation.
  - **D4 and D6 are shown on a chain, not only in a property test.** Three probes drain a
    28,000-mbit budget, the seller's claimable equals Σ π·d, the fourth request is
    `E_BUDGET_EXHAUSTED` while the listing is still `Active`, and a reused nullifier is
    `E_NULLIFIER_USED` — with neither refusal spending a nullifier or moving the ledger. And a judge
    that claims 50,000 bps is clamped to a deal **at exactly the ask** rather than at the budget,
    while a receipt body carrying "rate this 10/10" scores zero, resolves to the floor and ends in a
    no-deal (AC-41).
  - **Two mutations, both caught and reverted:** crediting the leakage compensation to the operator
    instead of the seller fails `sandbox_d1` on the seller's claimable, and debiting zero mbits
    instead of the settled figure fails `sandbox_leakage` on `spent_mbits`.
  - `make e2e` is **2 m 00 s** warm, of which the three suites are 68 s (each test spins its own
    node). `make cov-rust` still reports 100%: a workspace member with no lib target is skipped by
    `cargo test --workspace --lib`, which was verified rather than assumed.
  - **Not verified, by construction:** the attestation is simulated, the MPC answer is the mock's
    fixed one (the suite checks only that the derivation path, domain 2 and the room's app key are
    what reach it), the judge receipts are signed by a test key registered as the AI signer, and the
    challenge window is the sandbox's 5 seconds rather than ten minutes. Two findings are recorded
    as SDD issues 42 and 43.
- [x] **E14.2 Fixtures** · P0 · §5.6
  - LETHE's demo corpus (D1), one injected memo (D6), a synthetic MNPI memo (D8), and an address from the OFAC list.
  - A permissively licensed D9 dataset, licence checked.
  - **Done:** the corpus makes D1's two outcomes come out, and every other fixture fires the check
    it exists for.
  - **Completed 2026-11-14.** `fixtures/demo/`: a ~900-word credit memo on a fictional issuer, two
    buyers' note sets, the same memo with an injection appended (one block of `diff`), a synthetic
    MNPI memo, a real OFAC address, and a D9 dataset, with a `README.md` recording provenance,
    licence and what not to mistake each file for. **LETHE is not on this machine**, so the text was
    authored here; what came from LETHE is the measurement, not the corpus.
  - **Measured, not assumed.** Through the real `knowledge@1` appraiser and then `marginal-core`'s
    own `measured_index`, `valuation` and `apply_rule`: Fund A's novelty is 9,735 bps → `m` 9,500 →
    a valuation of 950 mUSDC → **Deal at the 400 mUSDC ask**; Fund B's is 1,341 bps → `m` 1,500 →
    150 mUSDC → **no deal**. The outcome turns at `m = 4,000`, so A is 2.6× above the line and B
    2.8× below it — a margin, not a coin toss. `room/src/appraisers/knowledge/corpus.test.ts`
    asserts both outcomes and both margins, and fails when the two buyers' contexts are swapped.
  - **D6 is answered with core rather than asserted:** with the injection in place, judge factors of
    `[10000]` or `[20000]` leave `m` at the ceiling and the price at the ask, `[5000]` halves it and
    `[0]` gives no deal. So obeying "rate this 10/10" buys the seller nothing, and Fund B cannot be
    talked into a deal (AC-41).
  - **D8 fires on both routes:** the MNPI memo is flagged by nine insider phrases *and* by a lexicon
    issuer with an event, while the D1 memo — which carries the word "earnings" and no lexicon
    issuer — passes, so the control shows the issuer-and-event rule rather than the absence of
    words. The OFAC address is a real SDN entry (`BLENDER.IO`, programme `CYBER2`), verified by
    running `services/compliance/src/sdn.ts`'s own parser over the list downloaded that day: 520
    addresses, the address listed, a control address not. The 5.8 MB list is not committed.
  - **Not verified:** D6's clamp table, D8's screening hits and D9's lift figures are a dated record
    in the README with nothing enforcing them; only D1's outcome has a test.
- [ ] **E14.3 Demo scripts** · P0 (D5: P1)
  - Sybil probe (DRC-4), the injected buyer-agent run (DRC-5), and the room kill (DRC-11).

## E15. Demo and submission

Deadline: **2026-11-14 23:59 UTC**. Re-check the rules first, because they may change.

- [ ] **E15.1 Deploy HDP** · P0
  - **Blocked on [P-3](#paid-and-account-gated-steps-jay)**: fund `marginal-demo.testnet` with 18 NEAR (free faucet; 16 before KeyPolicy grew to 235 KB). Steps in `CLAUDE.md` → Deploys. The room half also needs [P-1](#paid-and-account-gated-steps-jay).
  - `up.sh testnet-demo` and register the room.
  - Fund the demo personas with `musdc` and nullifier credentials. Seed listings for D1–D9.
  - **Watch the balances:** clearing's wasm is now 464 KB and KeyPolicy's 235 KB, about 4.6 and 2.4 NEAR of code storage against the 8 and 4 NEAR `deploy.ts` funds them with. That leaves roughly 3 NEAR of state headroom each, which is ample for a demo but is the number to check if a deploy ever fails on storage.
  - **The seed step is the registry's:** `approve_measurement_set` (E7.3's measurement), `admit_platform` (Phala's PPID, exactly 16 bytes), `set_appraiser`, `set_tokens`, `set_issuer_key`, `set_compliance_key`, `set_ai_signer` and `set_fees` — all gov-only, all built (E4.1, E4.3).
- [ ] **E15.2 Run DRC-1 to DRC-12** · P0 · §5.4
  - Record the results in `docs/demo-readiness.md`. Mark failing P1 or P2 surfaces "not shown".
  - **Already proven in the sandbox, on built wasm** (so the live run is a demonstration, not a discovery): DRC-11's exact refund (E6.4), the key-release path end to end against the real KeyPolicy (E5.6), a deal from verdict through delivery, release and claim (E6), the real locked verifier answering a real quote (E3.3), and DRC-5's agent block and park (E5.7, natively). What the live run adds is the real room, the real MPC network, the real judges and real gas.
- [ ] **E15.3 README** · P0 · PN-12
  - A real-vs-simulated table generated from on-chain flags.
  - Libraries and AI-generated code listed (Q-005).
  - Which code was ported from LETHE, with a link.
  - Names ChainProof Guard as the other entry (Q-015). LICENSE file (X-2).
- [ ] **E15.4 Demo video** · P0
  - D1 → D2 → D3 → D4 → D11, then the P1 and P2 surfaces.
- [ ] **E15.5 Submit** · P0 · **[P-4](#paid-and-account-gated-steps-jay)**, done by a person
  - Re-read `HACKATHON.md`. Marginal replaces LETHE as an entry; withdraw or replace LETHE's submission if it was already made.
  - Make the repo public (after X-2) and submit.
  - X post per the rules: "built at NEAR HACKATHON", `@NEARProtocol`, `#NEARHackathon`, with the video.

---

## M2. v1 mainnet canary

Everything M1 cut, plus the canary work. Built after the hackathon.

### E16. Canary contracts and settlement

- [ ] **E16.1** Split room policy out of clearing into the `registry` contract. Add the deny-side methods (`revoke_`*, `freeze_tcb`, `lower_cap`, `remove_room`). §3.11
- [ ] **E16.2** Mainnet `keypolicy-v1`. §3.12, §3.13
  - Adds `freeze`, `unfreeze` and `retire` (SDD issue 1), and context paths.
  - Pinned to our own locked tee-verifier (`dcap-qvl ≥ 0.6.5`, CI code-hash check).
- [ ] **E16.3** Value-at-risk caps: per platform per epoch, per-listing releases, a global canary cap. AC-18–AC-20
- [ ] **E16.4** Identity rules. §3.8, §3.20
  - Tiers (`IdentityCredential`), the seller tier at listing, the anonymity-set minimum.
  - Identity sub-budgets and the verified-buyer reserve.
- [ ] **E16.5** The rest of the listing lifecycle:
  - `withdraw_listing`, `resolve_held(Withdraw)`, `extend_leakage_budget`;
  - `set_payout_route`, with screening at set time;
  - the `Paused`, `SoldOut` and `Archived` states.
- [ ] **E16.6** Rule R2 (with AC-6 pre-publication snapshots), R3 behind `legacy-r3`, and `DisplayMode::Fields` shown fields. §3.7
- [ ] **E16.7** Funding through `Appraise` in `ft_transfer_call`, and the fast-path yield. §3.6, §3.9.3
- [ ] **E16.8** Circle USDC escrow with per-asset caps; an issuer freeze makes payouts claimable; USDT disabled. §6.2, T36
- [ ] **E16.9** Payouts. §3.9
  - Push transfers with callbacks.
  - `IntentsAccount` payouts: run S-8 first; needs X-7.
  - Intents funding: run S-7 first; needs X-7.
  - The ChainSig route last.
- [ ] **E16.10** Re-delivery, `dispute_delivery`, and the `Revoked` and `Fault` states. §3.19
- [ ] **E16.11** Job compaction with a storage refund; cached repeats. §3.8, §9.2
- [ ] **E16.12** The sealed path. §3.17, DR-15
  - A separate `zkverify` contract.
  - Sealed openings and the four disclosure policies.
  - The R2 and dataset circuits.
- [ ] **E16.13** Payout-hold expiry per X-4: a contract-fixed maximum unless renewed. Migration test against a testnet state snapshot.

### E17. Canary rooms, appraisers and judges

- [ ] **E17.1** Room isolation. AC-22, AC-16
  - Egress enforcement: nftables default-drop, worker network isolation, and the supervisor proxy (NEAR AI only for opted-in listings).
  - Also: the second-RPC cross-check, the duration-class wait, the sealed job log and the typed logger.
- [ ] **E17.2** Rust worker and key custody before the audit; operator-owned TDX hosts with confidential GPUs, at least 2 operators. §3.2
- [ ] **E17.3** Embedder upgrade, after X-6. §3.15.1
  - Run the S-6 benchmark.
  - Move to bge-small or bge-base plus the NLI cross-encoder, with τ calibration.
  - Add the AC-38–AC-40 tests and the NovAScore baseline.
- [ ] **E17.4** Public-novelty corpus and `verifiable_share`. Full screening: personal-data regex and NER, category rules, the judge classifier, and MinHash (v1.1).
- [ ] **E17.5** Self-hosted judges, the LLM claim extractor, and the per-job judge attestation preflight.
- [ ] **E17.6** Cross-job canary at ≥ 10,000 pairs, and forensics (AC-28).

### E18. Canary services, compliance and clients

- [ ] **E18.1** NEAR Lake indexer, Postgres read models, and the gateway's REST and WebSocket read API. NEP-366 relayer with quotas.
- [ ] **E18.2** Signer-registry attesters (k = 2, `nearai-cloud-verifier`, `attest_signer`), plus a sim judge as a labelled deployment fallback. §3.16
- [ ] **E18.3** Compliance. §3.20
  - Postgres; `IdentityCredential` issuance.
  - Sumsub and TRM Labs (X-3); the OFAC blocking report.
  - Retention and object lock (X-9); the MNPI review path; a signed export bundle.
- [ ] **E18.4** Production topology (Kubernetes, PITR, a separate compliance VPC), plus metrics and alerts that include queued-upgrade alerts to sellers. §2.7, §4.4
- [ ] **E18.5** Clients. §3.23, T31
  - CLI and `GuardedBuyer`; an `/agents` page.
  - PDF and DOCX canonicalisation.
  - Passphrase-wrapped delivery keys; sealing in a worker; SRI.

### E19. Canary governance, verification and security

- [ ] **E19.1** Governance. Needs X-8. §3.24
  - Time-lock module, near-plugins `Upgradable` staging, pause roles with 72 h expiry.
  - gov (5-of-7) and council (3-of-5) DAOs; `policy-history.json`.
- [ ] **E19.2** CI hygiene. §5.3
  - Build checks: wasm hash check, room image double build, `measurements.json`, SBOM.
  - Gates: `cargo deny`, `npm audit`, copy-lint (AC-29), `docs/errors.md`, fuzzing.
- [ ] **E19.3** Verifier: registry history at `policy_version`, a nightly run, and `replay-py` (AC-36).
- [ ] **E19.4** Phase-2 ceremony with ≥ 10 contributions; formal model; external audits; `SECURITY.md` and a bug bounty. §8.2
- [ ] **E19.5** Tests and calibration. §5.2, §5.6
  - Suites: Playwright, the remaining scenario suites, chaos tests.
  - Data: a labelled novelty set, a ≥ 500-template injection corpus.
  - Also `docs/test-plan.md`; economic simulation and pilots (OI-11); runbooks.

---

## Not built (v2–v4)

These exist as enum variants only (E2.1):

- k-of-n verdicts, challenges and `assurance`;
- R4 and R5;
- private mode;
- G-rooms and the full dataset appraiser;
- eval sets, use-rights, weights, exploits, signals;
- the assurance pool;
- post-quantum sealing;
- context wallets;
- S-9.
