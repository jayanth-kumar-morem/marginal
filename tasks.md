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

---

## E1. Repo and deploy

- [ ] **E1.1 Marginal repo skeleton** · P0 · §3.1 · needs X-1 (private until X-2)
  - Cargo workspace: `contracts/{clearing,keypolicy,test-tokens/musdc}` and `crates/marginal-core`.
  - pnpm workspace: `room`, `services/{gateway,operator-agent,compliance}`, `apps/web`, `sdk/ts`, `verifiers/replay-ts` and `scripts`.
  - Pinned toolchains: Rust, near-sdk 5.30, cargo-near, Node 22.
  - Contracts built with `cargo near build reproducible-wasm`. CI runs the build, clippy, eslint and tests.
  - **Done:** CI is green on empty packages.
- [ ] **E1.2 `musdc` test stablecoin** · P0
  - NEP-141, 6 decimals, NEP-145 storage. Only the faucet account can mint.
  - **Done:** sandbox tests for transfer and storage.
- [ ] **E1.3 Deploy script and profiles** · P0 · §3.24
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
    5. Delete KeyPolicy's access keys and assert the list is empty.
    6. Write `deploy/manifest.<profile>.json`.
  - **Done:** one command deploys a fresh sandbox end to end.

## E2. `marginal-core`

- [ ] **E2.1 Types and errors** · P0 · §3.3, §4.1
  - All §3.3 Borsh types, each with a version byte. Unbuilt features exist as enum variants only.
  - One error enum with stable string codes.
  - **Done:** round-trip tests.
- [ ] **E2.2 Pricing and leakage** · P0 · §3.7, §3.8
  - `mul_div`, `judgement_factor` and `ceiling` (`KnowledgeV1`, `DatasetLiteV0`).
  - `measured_index`, `valuation` and `apply_rule` (R1; other rules return disabled).
  - The mbits lookup table, and `max_debit` for Blind mode. Open mode adds components and judge factors.
  - **Done:** proptests for AC-2, AC-3, AC-5 and AC-41; Blind + Sealed = 1,000 mbits; Open ≈ 16.7 bits.
- [ ] **E2.3 Commitments, signing bytes, conservation** · P0 · §3.9.1, §3.10, §3.12.3, §3.17, §3.18
  - Hashes and signing bytes: `job_commitment`, the salted good commitment, verdict and certificate bytes, and the audit-chain step.
  - The AC-4 conservation function.
  - **Done:** `fixtures/vectors.json` committed; conservation proptest passes.
- [ ] **E2.4 wasm package** · P0
  - `@marginal/core-wasm` for the room and `replay-ts`. It exports pricing, `max_debit`, `job_commitment`, and Borsh for verdicts, certificates and deliveries.
  - **Done:** both reproduce `vectors.json` byte for byte.

## E3. KeyPolicy (immutable)

Each version is deployed once, then its keys are deleted. Every PR gets a second reviewer.

- [ ] **E3.1 State, init, views** · P0 · §3.12.2
  - Fixed at init: `chain_id`, `registry` (= clearing in M1), `clearing`, `mpc`, `ckd_domain_id = 2` and `dcap_verifier`.
  - No setters and no upgrade method.
- [ ] **E3.2 Attestation checks** · P0 · §3.13
  - Depend on near/mpc's attestation crate at a pinned revision (vendor it only if it will not build standalone). It does the parsing and the RTMR3 replay.
  - Add the `report_data` binding and the required and forbidden event checks.
  - **Done:** the E7.1 fixture replays to its quoted RTMR3.
- [ ] **E3.3 `issue_nonce` and `register_room`** · P0 · D3 · §3.13 · needs E7.1, E3.2, E4.3
  - **First (S-2):** call `tee-verifier-2026-11-02.testnet` with the E7.1 quote. Check that its code hash is `8SrqVCh3RtHz6mG2eiMwBGZDPkmccA5JiVvqrDYT3VL3`.
  - Calls: `verify_quote_with_collateral_dates` (200 TGas), then `on_quote_verified` (60 TGas).
  - Callback checks:
    - TCB status, collateral age, not a debug TD;
    - `report_data`, the nonce, and a 16-byte PPID;
    - each required RTMR3 event present exactly once, and no `os-image-hash` event.
  - On success: store the `Attestation`, emit `room_registered`, and call `admit_room`.
  - **Done:** the live room registers on testnet; copies with a debug TD, wrong report data or an RTMR3 mismatch are rejected (DRC-3).
  - **Fallback if the verifier fails:** AttesterQuorum.
- [ ] **E3.4 `set_pins`** · P0 · §3.12.2
  - `Explicit` or `FollowGovernance`. The path hash uses the predecessor, so only the seller can write it. A missing pin set denies release.
- [ ] **E3.5 `authorize`** · P0 · §3.12.3 · needs E4.3, E5.6
  - Checks the room signature, the attestation's expiry and the pins.
  - Calls `registry.check_room` and `clearing.authorize_release`, joined with `.and()`.
  - Stores a `Ticket` that expires after 50 blocks.
  - **Done:** sandbox denials for a commitment mismatch, an unpinned measurement and an expired room.
- [ ] **E3.6 `derive`** · P0 · §3.12.3 · needs E8.2
  - Calls `request_app_private_key` (domain 2, `AppPublicKeyPV`) with 1 yocto and 30 TGas, plus whatever the relayer adds. The ticket is marked used only on success.
  - **Done:** a key derived through KeyPolicy on testnet passes the room's check.
- [ ] **E3.7 Test build** · P0 · §6.1
  - A `sim-attestation` feature (`keypolicy-sim`, with `compile_error!` alongside `mainnet`), and a mock MPC contract that returns fixed bytes. Contract tests only.

## E4. Clearing: rooms, listings, snapshots

- [ ] **E4.1 Scaffold and gov setters** · P0 · §3.4, §6.2
  - A `config()` view showing the profile and toggles.
  - The `gov` role sets these directly in M1: appraiser registry, token allow-list, issuer key, NEAR AI signer list (with expiry), fee table, compliance key.
  - Typed errors, and views including `get_jobs_for_room`.
- [ ] **E4.2 Events and audit chain** · P0 · D8 · §3.10
  - NEP-297 `marginal` events carry `seq` and `head`.
  - Every state change appends an `AuditEntry`, readable through `get_audit(from, limit)`.
  - **Done:** recomputing the chain from `get_audit` matches `audit_head`.
- [ ] **E4.3 Room policy module** · P0 · D3 · §3.11
  - The registry, as a module inside clearing:
    - gov approves a measurement set and admits a platform (PPID exactly 16 bytes);
    - `admit_room` is KeyPolicy-only and sets a 24 h expiry;
    - `check_room` and `eligible`.
  - **Done:** a test per deny reason; Phala PPIDs and the E7.3 measurement are seeded on testnet.
- [ ] **E4.4 `create_listing` and provisioning** · P0 · §3.4
  - Checks: appraiser enabled; finite alphabets with no free-text field; R1 bounds; `max_copies ≥ 1`.
  - `begin_provisioning` creates the job; `submit_provisioning` stores `pk_l` and anchors the certificate.
- [ ] **E4.5 Publish and screening** · P0 (Held: P1, D8) · §3.4
  - `publish_listing(good_commitment, ciphertext, payout)` creates a screening job.
  - No cross-contract pin check: KeyPolicy denies release without pins, and the SDK always sets pins first.
  - `submit_screening` moves the listing to `Active` (with `publish_height`) or to `Held`.
- [ ] **E4.6 `anchor_snapshot`** · P0 · §3.4
  - Storage-paid; records `anchor_height`.

## E5. Clearing: jobs, funding, leakage, agents

- [ ] **E5.1 Job state machine** · P0 · §3.5
  - `transition(from, to)` covers only the M1 states: `PendingApproval`, `Requested`, `Assigned`, `Computing`, `Verdicted`, `Deal`, `NoDeal`, `Restricted`, `InputRejected`, `Final`, `DeliveryFailure`, `Timeout`.
  - **Done:** an exhaustive test over all pairs, and a test that double settlement is impossible.
- [ ] **E5.2 Balances** · P0 · §3.9.3
  - `ft_on_transfer` with `Deposit{for}`. `withdraw_balance` rejects agent keys. Refunds credit the balance.
- [ ] **E5.3 Buckets and leakage ledger** · P0 · D4 · §3.8, §3.9.1
  - Buckets `budget`, `compute`, `comp_reserved` and `fee_reserved` (storage is 0 in M1).
  - Reserve `max_debit` at request. The debit equals the reservation, except:
    - `Restricted` debits 1,000 mbits;
    - `InputRejected` and `Timeout` release the reservation.
  - Compensation goes to the seller's claimable balance. The listing becomes `Exhausted` when the budget runs out.
  - **Done:** conservation holds after every transition.
- [ ] **E5.4 Nullifiers** · P0 · D4 · §3.20, AC-14
  - Verify `NullifierCredential` against the gov-set issuer key, and track `used_nullifiers[(listing, epoch)]`.
- [ ] **E5.5 `request_appraisal`** · P0 · §3.4
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
- [ ] **E5.6 `authorize_release`** · P0 · §3.4
  - KeyPolicy-only. Checks the room assignment, the commitment and the path. Moves the job to `Computing`.
- [ ] **E5.7 Agent firewall** · P1 · D5 · §3.21
  - Agent keys are registered and revoked from a full-access key only.
  - Caps: per-job maximum, per-window maximum, and `human_above`. Over a cap → `Block`; above `human_above` → `PendingApproval`.
  - `approve_parked` must be signed by a non-agent key. Admin methods reject agent keys.
  - **Done:** DRC-5 passes in sandbox.

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

- [ ] **E7.1 Phala CVM and quote fixture** · P0 · §3.13 · needs @jay: Phala account and payment · **do first (S-4)**
  - A `tdx.large` on a pinned node, deployed with `--no-gateway --no-pre-launch-script` and `key_provider: "none"`.
  - **Done:** the inner certificate is type 5; the PPID is on Phala's list; the TCB status is recorded; the RTMR3 replay matches; quote, collateral and event log are saved to `fixtures/quotes/`.
- [ ] **E7.2 Image and compose** · P0 · §3.13
  - Pinned base digests and Node 22; `npm ci --ignore-scripts`; onnxruntime-node and MiniLM files pinned by SHA-256; read-only root file system.
  - `app-compose.json` exactly as in §3.13. The only operator input is the RPC URL.
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

- [ ] **E9.1 NEAR AI Cloud judges** · P1 · D6 · §3.16 · needs @jay: a NEAR AI API key
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
- [ ] **E15.5 Submit** · P0 · @jay, done by a person
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
