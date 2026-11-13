# Marginal: build tasks

Source: [`SDD.md`](SDD.md) (SDD-001 v0.2, 2026-11-12). Every task cites the SDD section it builds.

**Revision 2 (2026-11-12).**

- M1 is cut from 128 tasks to 69.
- All eleven demo surfaces (D1–D11) and every readiness check (DRC-1 to DRC-12) are unchanged.
- The cut work moves to M2. [What M1 cuts](#what-m1-cuts) lists each cut and why no demo surface loses anything.

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
  - contracts: E3–E6 and E10;
  - room: E7–E9;
  - off-chain: E11–E14.

### Do these first

These three carry the most risk. Each is the opening step of a task, not a separate spike.

1. **E7.1** Boot a Phala CVM and record a real quote. Spike S-4.
2. **E8.2** Derive a key through MPC CKD from a dev account and recover it in TypeScript. Spike S-1.
3. **E3.3** Register that quote through the locked tee-verifier. Spike S-2.

### Paid and account-gated steps (jay)

Everything only the user can do, in one place: each row is a step I cannot take, what it costs, and what stays blocked until it happens. Costs are stated before they are incurred (CLAUDE.md working rule 4); nothing here has been bought. `todo:jay` lines in my replies point at these ids.

| # | Step | Needs | Cost | Blocks | Do it when |
|---|---|---|---|---|---|
| P-1 | Boot the room CVM (E7.1) | A Phala Cloud account with a card | **$0.232/h**, so about **$0.25** for a one-hour capture; **$5.60/day** if left up ([SDD §1.5](SDD.md)). It is destroyed after the capture and booted again for the demo, so nothing runs in between | E3.2, E3.3 and E3.6 Done lines; E7.1, E7.4; the room half of E15.1; D3 and DRC-3 | After E7.2 and E7.3 build the image, so one boot captures the fixture. **First** run `phala os-images --prod --json` and confirm a **dstack ≥ 0.6.0** image exists (E3.2 finding 4): with 0.5.x the room can never register |
| P-2 | A NEAR AI Cloud API key (E9.1) | A NEAR AI account | Under **$0.003 per appraisal** ([SDD §1.5](SDD.md)); a few cents for the demo | E9.1, D6, DRC-6. The judge port has a test double, so everything else runs without it | Before E9.1. Not needed for E3–E6 |
| P-3 | Fund the testnet deployer (E15.1) | The `marginal-demo.testnet` account, already created | **Free** (testnet faucet): 18 NEAR, up from 16 since KeyPolicy grew to 235 KB | Every testnet Done line: E3.3, E3.6, E15.1. `up.sh` refuses before creating anything if the balance is short | Before the first testnet deploy. Independent of P-1, so it can be done any time |
| P-4 | Submit (E15.5) | A person: the repo visibility decision (X-2), an X post, the submission form | **Free** | E15.5 | Last. Re-read the rules first; they may have changed |

**Nothing above is bought or started by me.** P-1 and P-2 cost money, so I stop and ask; P-3 and P-4 are free but only the user holds the account.

## Simplicity rules

1. **M1 is the demo.** A task that does not help some DRC pass belongs in M2.
2. **Formats are final in M1.** Borsh data formats are fixed from day one, each with a version byte. Admin, governance and policy interfaces may still change in M2.
3. **Fallbacks only on failure.** RoomSealed and AttesterQuorum are built only if CKD or the tee-verifier fails.
4. **Read state from contract views.** There is no indexer:
   - one process per role, all in one docker compose file;
   - SQLite wherever a database is needed.
5. **Flag simulation at once.** Every simulated element sets its `simulated_flags` bit in the PR that adds it.

## Epic index

| Epic | Scope | Tasks | Demo surfaces |
|---|---|---|---|
| [E1](#e1-repo-and-deploy) | Repo, test token, deploy script | 3 | all |
| [E2](#e2-marginal-core) | `marginal-core` | 4 | all |
| [E3](#e3-keypolicy-immutable) | KeyPolicy (immutable) | 7 | D1, D3 |
| [E4](#e4-clearing-rooms-listings-snapshots) | Clearing: rooms, listings, snapshots | 6 | D1, D3, D8 |
| [E5](#e5-clearing-jobs-funding-leakage-agents) | Clearing: jobs, funding, leakage, agents | 7 | D1, D4, D5 |
| [E6](#e6-clearing-verdicts-settlement-claims) | Clearing: verdicts, settlement, claims | 5 | D1, D6, D7, D8, D11 |
| [E7](#e7-room-image-and-supervisor) | Room image and supervisor | 5 | D1, D3 |
| [E8](#e8-room-worker-and-appraisers) | Room worker and appraisers | 7 | D1, D8, D9 |
| [E9](#e9-judges) | NEAR AI judges | 1 | D6 |
| [E10](#e10-sealed-verdicts-d10) | Sealed verdicts and ZK | 3 | D10 |
| [E11](#e11-services) | Gateway, operator agent, compliance | 4 | all |
| [E12](#e12-sdk-and-verifier) | SDK and `replay-ts` | 2 | all, D2 |
| [E13](#e13-web-app) | Web app | 7 | all |
| [E14](#e14-tests-fixtures-and-demo-scripts) | Tests, fixtures, demo scripts | 3 | D4, D5, D6, D11 |
| [E15](#e15-demo-and-submission) | Demo and submission | 5 | all |
| [E16–E19](#m2-v1-mainnet-canary) | Mainnet canary | — | — |

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
    - **Not done:** a browser build. The SDK (E12.1) will need `core.wasm` loaded without `node:fs`; the module itself is already portable. Typed TypeScript interfaces for the JSON model are also left to the consumers (E8, E12), because they would duplicate the Rust types; the vectors are what keep the two sides in step.

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

- [ ] **E6.1 `submit_verdict` (Open)** · P0 · §3.17
  - Checks: room signature, assignment, binding (domain, chain, job, version, nonce, commitment) and schema.
  - Then: recompute with core; a deal requires `delivery_commitment`; the certificate hash must be present.
  - A rejection emits `verdict_rejected`, and the job stays open.
- [ ] **E6.2 Judge receipts** · P1 · D6 · §3.16
  - LETHE's checks: `resp_hash`, `ecrecover` against an unexpired signer from the gov-set list, the model allow-list and the replay set.
  - Also: a strict parse reproduces the factor, and the body has no reasoning field.
- [ ] **E6.3 Settlement** · P0 · §3.9.2
  - The outcome table produces a `SettlementRecord` with `simulated_flags`.
  - The buyer's refund goes to their balance. The seller's compensation goes to claimable. `held_until` is now + W.
- [ ] **E6.4 Receipt, release, timeout** · P0 · D11 · §3.4
  - `submit_delivery_receipt`.
  - `release_held` needs the receipt, W passed and a fresh `PayoutApproval`. A match gives `Blocked`; otherwise the proceeds go to the seller's claimable balance.
  - `refund_expired` ends in `Timeout` or `DeliveryFailure`.
  - **Done:** DRC-11 is exact in sandbox.
- [ ] **E6.5 Claims and payout route** · P0 (route: P1, D7) · §3.9.4
  - `claim(token)` uses `ft_transfer`, and its callback restores the balance on failure.
  - The `NearAccount` or `DryQuote` route is stored on the listing and cited in the settlement record.

## E7. Room image and supervisor

- [ ] **E7.1 Phala CVM and quote fixture** · P0 · §3.13 · **blocked on [P-1](#paid-and-account-gated-steps-jay)** · **do first (S-4)**
  - A `tdx.large` on a pinned node, deployed with `--no-gateway --no-pre-launch-script` and `key_provider: "none"`.
  - **Check the image version first:** `phala os-images --prod --json`. The guest must be **dstack ≥ 0.6.0**, or KeyPolicy refuses every registration: the `storage-encrypted` event §3.13 requires does not exist before 0.6.0, and §3.13's "apps cannot add RTMR3 events" is also a 0.6.0 property. Upstream's stable line was still 0.5.14 on 2026-11-13 with 0.6.4 pre-release, and Phala does not publish which it deploys. If prod has no 0.6.x image, stop and decide before paying for a CVM (E3.2 note).
  - Deploy it as a **new app**, never as an upgrade, and do not pin an `app_id`: KeyPolicy requires `app-id` to be the first 20 bytes of the compose hash.
  - **Done:** the inner certificate is type 5; the PPID is on Phala's list; the TCB status is recorded; the RTMR3 replay matches; quote, collateral and event log are saved to `fixtures/quotes/`. Then E3.2 closes: the same three assertions as the two real CVMs in `crates/marginal-core/tests/attest.rs`, this time with `evaluate_quote` **accepting** the room.
- [ ] **E7.2 Image and compose** · P0 · §3.13
  - Pinned base digests and Node 22; `npm ci --ignore-scripts`; onnxruntime-node and MiniLM files pinned by SHA-256; read-only root file system.
  - `app-compose.json` exactly as in §3.13, plus three keys that KeyPolicy's policy makes mandatory (found by reading dstack's source in E3.2; all three refuse the room if wrong):
    - `"no_instance_id": true` — the only thing that makes dstack write an empty `instance-id`;
    - **no `init_script` key at all** — `""` still emits an `init-script-hash` event of `sha256("")`, which the policy forbids;
    - leave `event_log_version` unset: V1 is the default digest, and our replay implements V1 only.
  - A CPU-only room on dstack 0.6.x still gets a `gpu-policy-hash` event (`sha256("{}")`); the policy allows it and records it in the measurement.
  - The only operator input is the RPC URL.
- [ ] **E7.3 Reproducible build** · P0 · D3 · §3.13
  - `build.sh` and `MEASUREMENTS.md`.
  - **Done:** a second build from the git tag reproduces the compose hash (DRC-3).
- [ ] **E7.4 Boot and registration** · P0 · D3
  - Keys generated in memory; `report_data`; quote and event log through `@phala/dstack-sdk`.
  - Registration through the operator agent, with daily renewal. A restart always means new keys.
- [ ] **E7.5 Job loop** · P0 · §3.14
  - Poll `get_jobs_for_room` and fork one worker per job.
  - The supervisor keeps the signing key, signs over IPC, and submits through the operator agent.

## E8. Room worker and appraisers

- [ ] **E8.1 Crypto** · P0
  - libsodium sealed boxes, XChaCha20-Poly1305, HKDF and `memzero`. Secrets are kept only in `Uint8Array`s.
- [ ] **E8.2 CKD recovery** · P0 · §3.12.3 · **do first (S-1)**
  - **First:** call `request_app_private_key` from a dev account on testnet and recover the key.
  - Then, per job:
    - a scalar `a` and app key `A`;
    - `app_id` computed locally;
    - recover σ, then check the pairing with the NEAR DST;
    - `K_L`, then `sk_L` and `pk_L`.
  - **Done:** the `ckd-example-cli` vectors pass, and a live derivation succeeds.
- [ ] **E8.3 Provisioning and screening jobs** · P0
  - Provisioning: derive `K_L` and submit `pk_L` with its certificate.
  - Screening: run `screening@1` and submit `Pass` or `Flag(code)` with its certificate.
- [ ] **E8.4 Appraisal pipeline** · P0 · §3.14.2
  1. Load the job and recompute its commitment.
  2. Get the key through `authorize` + `derive`, and the context through `DEK_c`.
  3. A context that is too small gives `InputRejected`.
  4. A restricted-list match gives `Restricted` (D8).
  5. Fetch and check the good.
  6. Appraise and quantise.
  7. Decide the branch with core-wasm.
  8. Exit the process.
- [ ] **E8.5 Delivery and certificate** · P0 · §3.18, §3.19
  - Deterministic `DeliveryV1`, with an optional `compliance_pk` entry (D8), and `h_D`.
  - A `ForgetCertificateV1` for every job.
  - **Done:** the delivery is byte-identical across runs, and the SDK opens it.
- [ ] **E8.6 `knowledge@1` and `screening@1`** · P0 (MNPI: P1, D8) · §3.15
  - Port LETHE's `novelty.js`: claims, MiniLM max similarity per claim, τ 0.78 / 0.45, and need weighting. Single-threaded ONNX; `N_pub = 10,000`; 21-level components.
  - Screening: an issuer lexicon and MNPI rules, giving `Flag(reason)` or `Pass`.
  - **Done:** on the D1 fixture, A gets Deal and B gets No deal. The MNPI fixture is flagged.
- [ ] **E8.7 `dataset-lite@0`** · P2 · D9 · §3.15.3
  - Integrity checks, then overlap measured with MiniLM.
  - A closed-form ridge, baseline vs augmented.
  - A bootstrap over eval-row correctness (B = 200, seeded from `job_commitment`, no retraining).
  - Outputs: bucket and price.
  - **Done:** DRC-9 completes within its duration class.

## E9. Judges

- [ ] **E9.1 NEAR AI Cloud judges** · P1 · D6 · §3.16 · **blocked on [P-2](#paid-and-account-gated-steps-jay)**
  - **First (S-5):** strict JSON, with reasoning off and `signature_kind == provider_tee`.
  - Models: `Qwen/Qwen3.8-27B` and `z-ai/glm-5.3-flash` (`reasoning_effort: "low"`).
  - Request: temperature 0, `stream: false`, headers `x-no-aliasing: true` and `Accept-Encoding: identity`, LETHE's delimiter prompt.
  - Strict regex parse; any parse failure gives 0. `JudgePort` has a test double.
  - **Done:** the injected memo is clamped to the floor, and its price stays at or below the ceiling (DRC-6).

## E10. Sealed verdicts (D10)

- [ ] **E10.1 Circuit and dev setup** · P2 · §3.17
  - One circuit for `KnowledgeV1` with R1, plus the Poseidon commitment.
  - Phase 1: `ppot_0080_13.ptau`. Phase 2: one team contribution, labelled `dev`. The verifying key is stored pre-encoded.
  - **Done:** wrong witnesses fail, and the circuit agrees with core on 10³ vectors.
- [ ] **E10.2 Verification in clearing** · P2 · §3.17
  - **First (S-3):** measure the gas.
  - `marginal-groth16` runs inside `submit_verdict` in M1: one multiexp, a `g1_sum`, and the pairing check.
  - **Done:** Blind + Sealed debits exactly 1,000 mbits; an invalid proof gives `E_PROOF_INVALID`.
- [ ] **E10.3 Room prover** · P2
  - snarkjs in the worker.
  - **Done:** DRC-10; the buyer sees only the outcome.

## E11. Services

- [ ] **E11.1 Services host** · P0 · §2.7
  - One docker compose: gateway, operator agent and MinIO. Compliance runs as its own container.
- [ ] **E11.2 Gateway** · P0 · §3.22
  - Content-addressed presigned uploads (ciphertext only).
  - `GET /v1/replay/{job_id}`: runs `replay-ts` with the `dcap-qvl` CLI.
  - A 1Click dry-quote proxy that stores nothing and never logs response bodies (D7).
- [ ] **E11.3 Operator agent** · P0 · §3.13
  - `issue_nonce`, collateral fetch, `register_room` relay and renewal.
  - Relays the room's signed submissions from a funded function-call key. Restarts the CVM.
- [ ] **E11.4 Compliance service** · P0 (OFAC: P1, D8) · §3.20
  - Issuer key labelled `demo`; SQLite.
  - `POST /v1/nullifiers` for allow-listed demo identities.
  - `POST /v1/payout-approvals` screens against the OFAC SDN file, fetched at start and daily.
  - **Done:** D4 credentials work, and a payout to a listed address is blocked.

## E12. SDK and verifier

- [ ] **E12.1 SDK** · P0 · §3.23
  - Crypto: `canonicalise` (`.md`, `.txt`); DEK, AEAD and salted commitments; seal `DEK_g` to `pk_L` and `DEK_c` to `box_pk`; delivery keys in IndexedDB.
  - Transaction builders: listing, provisioning, pins, publish, snapshot, deposit, request, approve, claim, withdraw.
  - Also:
    - `watchJob`, by polling `get_job`;
    - `openDelivery`, which checks the good's commitment;
    - Chain Signatures address derivation and the 1Click dry quote, ported from LETHE.
- [ ] **E12.2 `replay-ts`** · P0 · D2 · §3.18
  - Checks, per settlement:
    - signatures;
    - the Open recompute, or the Sealed proof;
    - conservation, and debit = `max_debit`;
    - the certificate anchor;
    - the audit chain, via `get_audit`.
  - It follows each certificate to its quote with the `dcap-qvl` CLI, compares against the current approved set, and counts `simulated_flags`.
  - **Done:** DRC-2; flipping any stored byte makes it fail.

## E13. Web app

- [ ] **E13.1 Shell** · P0 · §6.3
  - Next.js, wallet selector, manifest-driven configuration, strict CSP. A banner for simulated elements, driven by on-chain flags (DRC-12).
- [ ] **E13.2 `/sell`** · P0 (payout: P1, D7)
  - Wizard: file → canonicalise → parameters → provision → seal and upload → pins → publish.
  - The payout step shows the derived Solana address and a live dry quote, which is not stored.
- [ ] **E13.3 `/listings` and `/listing/[id]`** · P0 · D1, D4
  - Rule, leakage meter (spent / reserved / budget), pins, screening status.
- [ ] **E13.4 `/appraise/[id]`** · P0 · D1
  - Notes, or a restricted list (D8); the stated need; budget.
  - Privacy: Open, or Sealed once D10 is on, with the debit and cost shown. Seal, then request.
- [ ] **E13.5 `/jobs/[id]`** · P0 · D1, D5, D11
  - State, outcome, refund, certificate verification (gateway replay), delivery decrypt-and-check.
  - An approve button for `PendingApproval` (D5).
- [ ] **E13.6 `/verify` and `/rooms`** · P0 · D2, D3
  - `/verify`: the replay explorer and the certificate → quote walk.
  - `/rooms`: PPID, TCB status, RTMR3 events and the measurement.
- [ ] **E13.7 `/compliance`** · P1 · D8
  - Compliance-copy decrypt.
  - Audit export, built in the browser from `get_audit`, settlements and certificates, and re-verified on load.

## E14. Tests, fixtures and demo scripts

- [ ] **E14.1 Sandbox contract tests** · P0 · §5.2
  - near-workspaces, with `keypolicy-sim`, the mock MPC, an imported tee-verifier, `musdc` and a test room key.
  - Covers SC-1–SC-3, SC-10, SC-11, SC-14, SC-15, SC-21, SC-29 and every M1 refund path.
- [ ] **E14.2 Fixtures** · P0 · §5.6
  - LETHE's demo corpus (D1), one injected memo (D6), a synthetic MNPI memo (D8), and an address from the OFAC list.
  - A permissively licensed D9 dataset, licence checked.
- [ ] **E14.3 Demo scripts** · P0 (D5: P1)
  - Sybil probe (DRC-4), the injected buyer-agent run (DRC-5), and the room kill (DRC-11).

## E15. Demo and submission

Deadline: **2026-11-14 23:59 UTC**. Re-check the rules first, because they may change.

- [ ] **E15.1 Deploy HDP** · P0
  - **Blocked on [P-3](#paid-and-account-gated-steps-jay)**: fund `marginal-demo.testnet` with 18 NEAR (free faucet; 16 before KeyPolicy grew to 235 KB). Steps in `CLAUDE.md` → Deploys. The room half also needs [P-1](#paid-and-account-gated-steps-jay).
  - `up.sh testnet-demo` and register the room.
  - Fund the demo personas with `musdc` and nullifier credentials. Seed listings for D1–D9.
- [ ] **E15.2 Run DRC-1 to DRC-12** · P0 · §5.4
  - Record the results in `docs/demo-readiness.md`. Mark failing P1 or P2 surfaces "not shown".
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
