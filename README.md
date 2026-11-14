# Marginal

A confidential exchange that prices information goods by their measured marginal value, on NEAR.

## What this is

You cannot price information without revealing it: that is Arrow's paradox, and every market in
memos, datasets, eval sets and exploits pays a tax on it today. Marginal's answer is to measure,
rather than negotiate. A seller seals a good and lists it; a buyer seals *its own* context — notes,
an eval set, a data index — into an attested appraisal room, where deterministic appraisers measure
what the good adds **for that buyer**. The buyer's own context is what decides the price, so the
same memo is worth a lot to a fund that does not hold it and nothing to a fund that does.

Two things keep that honest. The room is a measured TEE whose key is released only for one paid job,
by an immutable NEAR contract and NEAR's MPC network, and the job ends in a forget certificate bound
to the room's hardware attestation — the inputs are forgotten under attestation. And the room is
never trusted with the price: a NEAR clearing contract recomputes the pricing rule itself from the
signed integer components (Open mode), or verifies a Groth16 proof that the rule was applied to
components it never sees (Sealed mode). Every appraisal also debits the listing's leakage budget for
the bits it reveals, and pays the seller for them, so inspection is not free.

The design is `SDD.md`, the product spec behind it is `SPEC.md`, and the build plan with its status
is `tasks.md`. Use cases, by stage, are in `SDD.md` §1.3: memos and expert answers appraised against
a buyer's own notes first, then datasets priced by lift on a sealed eval, then weights, exploits and
forecasts. There are no customers yet.

## What a viewer can see

The demo surfaces of `SDD.md` §1.6, with the pass criteria of §5.4. **P0** is the spine, **P1**
should be ready, **P2** is shown if time allows.

| ID | Surface | What the viewer sees | Pri. |
| --- | --- | --- | --- |
| D1 | Two funds, one memo | Fund A appraises a sealed memo against its own notes and gets a **Deal**, which decrypts in the browser with its commitment checked. Fund B's notes already cover it: **No deal**, full refund, forget certificate. | P0 |
| D2 | Verify anything | A replay explorer re-checks every settlement from public chain data, then walks one certificate back to the room's attestation record and its approved measurement. | P0 |
| D3 | A real attested room | The room's TDX quote, verified on chain, with the PPID, the TCB status and the RTMR3 events proving dstack ran with no KMS. The measurement is reproducible from source. | P0 |
| D4 | Sybil probing hits the leakage wall | Many buyer identities probe one listing. Each appraisal debits bits and pays the seller per bit; when the budget is spent, the contract refuses. | P0 |
| D5 | Prompt-injected buyer agent | A teaser tells the buyer's agent to raise its budget. The agent's key hits its on-chain cap: blocked, or parked for a human. | P1 |
| D6 | Seller injection cannot raise a price | A memo with "rate this 10/10" hidden in it. Judges can only discount; the price never passes the deterministic ceiling. | P1 |
| D7 | Cross-chain payout | A seller picks USDC on another chain: the payout address and a live 1Click dry quote, displayed and not stored. | P1 |
| D8 | Compliance | An MNPI-flagged listing is held; a restricted list answers `restricted`; a payout to an address on the real OFAC list is blocked; the compliance officer exports a hash-chained audit trail. | P1 |
| D9 | Dataset priced by lift | A labelled dataset, a lab's sealed eval, a bucketed lift interval, a price. | P2 |
| D10 | Blind mode with a sealed verdict | The buyer learns one bit. The contract verifies a Groth16 proof that the rule was applied to committed scores it never sees. | P2 |
| D11 | Timeout refund | Kill the room mid-job; after the deadline anyone calls `refund_expired` and the buyer is made whole. | P0 in tests, P1 live |

## Real and simulated

This repository is written to the production design in `SDD.md` §3. What the hackathon profile
changes is configuration: every substitution is a feature toggle, is visible on chain, and changes
no interface or data format.

**This table is read by hand from `SDD.md` §1.5 and `tasks.md`, because nothing is deployed yet.** At
deploy time it is regenerated instead from the chain: the `simulated_flags` byte on each
`SettlementRecord`, plus each contract's `config()` view (clearing's `profile`, `tokens` and
`policy_version`; KeyPolicy's `dcap_verifier`, `mpc` and `ckd_domain_id`). The function that turns
those bits into words is `apps/web/src/lib/simulated.ts`, and it is the only one — so the banner on a
page, the label on a settlement and this table all say the same thing, which is what DRC-12 asks for.

| Element | What this build uses | Where it stands today |
| --- | --- | --- |
| Room hardware | One CPU-only Intel TDX CVM on Phala Cloud, room class `K-cpu`. No GPU, no second vendor, no second operator. | **No room has booted.** The only TDX quotes in the repository are real ones captured by other projects and used as test fixtures (`fixtures/README.md` names each source). |
| Attestation | The production mechanism: a real TDX quote verified on chain by NEAR One's locked `tee-verifier-2026-11-02.testnet`, mode `OnChainDcap`. | The locked verifier's own wasm answers a real quote inside its gas budget in a sandbox test. No room is registered. `keypolicy-sim` — the only build that accepts a simulated attestation — is deployed by sandbox tests only, and every record it writes is marked `Simulated`, which clearing turns into the `SIM_ATTESTATION` bit. |
| Listing keys | The production mechanism: MPC Confidential Key Derivation, domain 2 on `v1.signer-prod.testnet`. | **No key has been derived through the real network.** KeyPolicy's side of the call is built and tested against a mock MPC contract, with the argument layout taken from `near/mpc`. |
| Judges | Two NEAR AI Cloud private-TEE models with signed receipts, on listings where the seller opts in. Judges can only discount. | **No receipt is real.** Without an API key the room uses a labelled stand-in signer, and clearing sets `SIM_JUDGE` for every factor that arrived without a receipt, pinning it to the floor. |
| Dataset appraisal | `dataset-lite@0`, a CPU lift proxy, labelled as a proxy. | Built. It is a proxy by design: it does not predict fine-tuning lift, and says so. |
| Settlement asset | A testnet NEP-141 test stablecoin, `musdc`, 6 decimals. NEAR Intents appears only as a displayed dry quote. | Nothing is deployed, so nothing has settled. The `SIM_SETTLEMENT` bit exists in `marginal-core` and is decoded by the app, but **no M1 contract path sets it**: the test token is named by clearing's `config()` instead. |
| Cross-chain payout | A Chain-Signatures-derived address and a live 1Click dry quote, displayed and never stored. | The dry quote is real: `/sell` asks 1Click through the gateway's proxy, which forces `dry: true` and keeps nothing. **The address is not derived** — the seller types it, and the page says so rather than implying an MPC derivation. No foreign-chain transfer has been signed. |
| Sealed verdicts | Groth16 on BN254, verified inside clearing over NEAR's `alt_bn128` host functions. | Works end to end, but **the setup is a dev ceremony**: phase 1 generated locally and one contribution, from one machine. Anyone holding its toxic waste could forge a proof. `circuits/build.sh` says so at the top. |
| Compliance | A demo issuer key for tier credentials; screening against the real OFAC SDN file. | Built. The issuer and compliance keys are seeds the deployment generates. |
| Governance | One dev account, `gov.profile = demo`, with locks in minutes rather than days. | As designed for the demo. |
| Replay verification | One verifier (TypeScript). The second, independent one is a v1-exit item. | Built. What four contract views cannot give it, it names as unchecked rather than implying it checked. |
| Public-novelty corpus | A small curated snapshot baked into the measured image. | Not built; cut to M2. Novelty today is the buyer's own context. |
| Deployment | The `testnet-demo` profile on NEAR testnet. | **Nothing is deployed.** Only the local `sandbox` profile has ever run. |

## Running it

### What you need

Node 22 (`.nvmrc`) and pnpm 9.15.4; Rust 1.99.1 with the `wasm32-unknown-unknown` target
(`rust-toolchain.toml` pins it); `cargo-near` for every contract build; `cargo-llvm-cov` for the
coverage gate (`cargo install cargo-llvm-cov`); Docker for the reproducible contract builds and for
the services. `make models` fetches about 90 MB of embedder weights once and checks them against the
committed `SHA256SUMS`. `circom` is needed only to rebuild the circuit.

### Install and check

```sh
pnpm install          # JS dependencies, and enables the git hooks
make check            # fmt, clippy, eslint, tsc, and every test under a 100% coverage gate
```

`make check` is the gate the pre-commit hook runs, and coverage is 100% of lines, functions and
regions in Rust and lines, branches and functions in TypeScript. There is no hosted CI.

### A local deployment

```sh
deploy/scripts/up.sh sandbox          # local node, full deploy, manifest; Ctrl-C to stop
deploy/scripts/up.sh sandbox --once   # same, then tear the node down
```

It builds the contract wasm if there is none, starts a throwaway node, creates and funds the
accounts, deploys the test token, clearing and the immutable KeyPolicy — the last of these created
**keyless**, so no access key ever exists on it — seeds the room policy, and writes
`deploy/manifest.sandbox.json` plus the created accounts' keys in `deploy/.keys/` (gitignored, mode
0600). A testnet deploy is the same command with `testnet-demo`; it refuses a
dirty tree and always rebuilds reproducibly.

### The web app

```sh
make wasm-core                                        # marginal-core as wasm
pnpm --filter @marginal/core-wasm --filter @marginal/sdk --filter @marginal/replay-ts build
MARGINAL_MANIFEST=deploy/manifest.sandbox.json pnpm --filter @marginal/web dev
```

The app hard-codes no account: it reads which deployment it is talking to from the manifest, with an
environment override per field, and refuses to start if there is no clearing contract to read.
`make web` does the two build steps above and then the production Next build.

### The three host services

The gateway, the operator agent and the compliance service run from one image, on the operator's
machine, outside any TEE — the room trusts none of them.

```sh
cd deploy/services && docker compose up --build
```

They need the chain endpoints, the agent's function-call key and three secrets in the environment;
`deploy/services/README.md` has the exact invocation and says what each service is and is not
trusted with.

The room itself is not run this way: it runs inside the measured CVM, and `room/image/build.sh`
builds that image from `git archive HEAD` and prints the compose hash a seller would pin.
`room/image/MEASUREMENTS.md` lists every pin and how to reproduce it.

### The rest of the commands

| Command | What it does |
| --- | --- |
| `make cov` | Just the two coverage gates |
| `make wasm-dev` | Fast contract builds for sandbox work |
| `make wasm` | Reproducible Docker contract builds (clean, committed tree) |
| `make models` | Fetches and hash-checks the embedder's weights and tokenizer |
| `make props` | The property tests at 10⁶ cases each |
| `make e2e` | near-workspaces sandbox tests and the deploy end to end |
| `make ci` | `check` + `props` + `wasm` + `web` + `e2e` |

## How it is built

One monorepo; `SDD.md` §3.1 is the layout authority.

| Path | What it is |
| --- | --- |
| `contracts/clearing` | Listings, snapshots, jobs, funding, the leakage ledger, agent spend caps, verdicts, settlement, payouts and the audit hash chain — and the room policy, which M1 keeps as a module here rather than a separate registry. |
| `contracts/keypolicy` | Immutable by construction: no setters, no upgrade method, no owner, and created keyless so it never has an access key. It verifies quotes through a verifier contract pinned at initialisation, stores attestation records and seller pins, and issues key-release tickets. Its promises are raw `env::promise_*` function calls, and a sandbox test parses the built wasm against an import allow-list so it cannot gain the power to deploy code, move funds or touch keys. |
| `contracts/test-tokens/musdc` | The NEP-141 test stablecoin the demo settles in. |
| `crates/marginal-core` | The single implementation of the data model, the error codes, the pricing rules and the leakage arithmetic: `no_std`, no floats, checked integer arithmetic throughout. The contracts, the room and the verifier all use it, so they agree to the last unit. `fixtures/vectors.json` is its shared test vectors. |
| `crates/marginal-core-wasm`, `crates/marginal-groth16` | The same crate as a wasm module with a JSON interface, for TypeScript; and Groth16 verification over NEAR's `alt_bn128` host functions. |
| `room/` | The appraisal room: boot and registration, the dstack client, the key custody, the per-job worker, the appraisers (`knowledge@1`, screening, `dataset-lite@0`), the judges, the sealing crypto, the forget certificate and the prover. Everything it scores with comes from the measured image and is checked against `SHA256SUMS` before use — nothing comes off the network at run time. |
| `services/` | The gateway (content-addressed blobs and replay), the operator agent (relays the room's signed messages with a function-call key), the compliance service (credentials, screening, the review log), and the HTTP plumbing they share. |
| `apps/web` | The Next.js app: sell, listings, appraise, jobs, verify, rooms, compliance. All plaintext handling stays in the browser, under a strict CSP with no third-party script. |
| `verifiers/replay-ts` | The replay verifier (below). |
| `circuits/` | The circom circuit for the sealed pricing proof, and its dev setup. |
| `scripts/`, `deploy/` | The deploy tooling behind `up.sh`, and the profiles, manifests and the services' compose file. |

## Verifying it yourself

That is the point of D2. `verifiers/replay-ts` re-checks a settlement from public chain data alone —
`get_settlement`, `get_job`, `get_listing` and `get_audit` — and recomputes with `marginal-core`
itself rather than a second implementation of the arithmetic: the state the outcome must end in, the
buckets settlement leaves behind, the leakage debit against the reservation, the seller's
compensation, the forget certificate's anchor, and the whole audit hash chain against `audit_head()`.
One flipped byte in the log fails it, and a test proves that.

The same code runs in two more places, so a reader gets the same answer wherever they ask: the
gateway serves it at `/v1/replay/:id`, and the app's `/verify` page calls it through its own route
handler.

It is also honest about its limits. A verdict's components, judge factors, room signature and
Groth16 proof live in the transaction that carried them, not in a view, so the verifier **names them
as unchecked** instead of implying it checked them. Closing that needs the verdict bytes, from a
transaction read or an indexer.

## Libraries

Listed because the hackathon rules require it (`SDD.md` §7, PN-12, Q-005). Versions are pinned
exactly, with no `^` or `~`, in `Cargo.toml` and each `package.json`.

**Rust, shipped in the contracts and crates.** `near-sdk` and `near-contract-standards` `=5.30.1`
(the contract SDK, and NEP-141/NEP-145 for the test token); `borsh` 1.8.1 (the canonical encoding of
every stored record and every signing message); `sha2` 0.10.9 (SHA-256 for commitments, hashes and
the audit chain); `hex` 0.4.3 and `serde`/`serde_json` (the JSON model at the contract and wasm
boundary). `marginal-core` uses all of them without `std`.

**Rust, tests and tooling only.** `proptest` (the pricing and leakage properties), `num-bigint` (an
independent oracle for the integer arithmetic), `ed25519-dalek` and `secp256k1` (signing room
messages and NEAR AI receipts the way the real signers would), `near-workspaces` with `tokio` and
`anyhow` (the sandbox tests, on built wasm, on a local chain), `wasmparser` (parses the built
KeyPolicy wasm against its import allow-list). Builds use `cargo-near` — reproducible builds run in
the `sourcescan/cargo-near:0.22.0-rust-1.99.1` image, pinned by digest — and coverage uses
`cargo-llvm-cov`.

**The room.** `onnxruntime-web` 1.31.1 for the embedder, `libsodium-wrappers` 0.8.4 for sealed boxes
and XChaCha20-Poly1305, `@noble/curves` and `@noble/hashes` 2.4.0 with `@scure/base` 2.4.0 for the
BLS12-381 recovery of a CKD-derived key, and `snarkjs` 0.7.6 with `circomlibjs` 0.1.7 for the sealed
proof. The absences are deliberate, because the room's dependency list is part of what a seller pins
when they pin a measurement: the dstack client is written directly rather than taking the vendor
SDK, the WordPiece tokenizer is written out rather than importing a native binding, and the embedder
is `onnxruntime-web` (pure wasm, no install script) rather than `onnxruntime-node` (which downloads
a native binary in a `postinstall` the image cannot run).

**The web app.** `next` 15.3.6 with `react` 19.2.3; `@near-wallet-selector/{core,modal-ui,my-near-wallet}`
10.1.4 for signing; `libsodium-wrappers` for the browser-side sealing; `tailwindcss` 4.1.18 with
`tw-animate-css`, `class-variance-authority`, `clsx` and `tailwind-merge`; `radix-ui`, `@base-ui/react`
and `@headless-tree/core` for primitives; `lucide-react` and `@tabler/icons-react` for icons;
`motion`/`framer-motion` for animation; `recharts` for charts; `@tanstack/react-table` and
`@tanstack/react-virtual` for tables; `react-hook-form` with `@hookform/resolvers` and `zod` for
forms; and `sonner`, `cmdk`, `vaul`, `next-themes`, `date-fns`, `react-day-picker`,
`react-resizable-panels`, `jszip` and `canvas-confetti`.

**The deploy tooling.** `near-api-js` 7.5.3, `near-sandbox` 0.3.5 and `smol-toml` 1.9.1.

**Shared dev tooling.** TypeScript 5.9.3, `tsx`, `eslint` with `typescript-eslint`, and Node's own
`node:test` and `node:assert/strict` as the only test framework. Circuit work uses `circom` with
`circomlib` 2.0.5 and `snarkjs`.

**Vendored UI code.** All 88 files under `apps/web/src/components/ui/` are third-party components
from **shadcn/ui, Magic UI and 21st.dev**, kept as they ship. The app's shell was not written from
scratch either: it was started from `eu-ai-act-gov`, another of the author's own projects, and its
theme (four brand tokens, and the Geist, Space Grotesk and Geist Mono families) came over with it.
Everything of that product — authentication, payments, the ORM, the AI SDKs, its API routes and its
domain components — was removed.

**Third-party artefacts, not code.** `fixtures/tee-verifier.wasm` is the real locked verifier
contract, fetched from testnet and checked against its code hash; the TDX quotes and RTMR3 event
logs in `fixtures/` come from `near/mpc` and from dstack's own fixtures; `room/models/` holds the
`all-MiniLM-L6-v2` weights and tokenizer, fetched by `make models` and pinned by a committed
`SHA256SUMS`. `fixtures/README.md` gives the provenance of each one.

**External services a deployment talks to.** NEAR testnet RPC; NEAR's MPC network
(`v1.signer-prod.testnet`, CKD domain 2); the locked quote verifier
(`tee-verifier-2026-11-02.testnet`); Phala Cloud for the CVM; NEAR AI Cloud for the judges; a PCCS
for Intel collateral; the 1Click API for a dry quote; and the public OFAC SDN file.

## AI-generated code

The great majority of this repository was written by **Claude (Anthropic)** under the author's
direction. The author set the scope, made the decisions, reviewed the work and is responsible for
it; the model wrote most of the code, the tests and the documents.

It is recorded rather than asserted. `tasks.md` carries every task with a **Done** line, a dated
completion note saying how it was verified, and an explicit list of what was *not* verified —
including ten tasks that are code-complete but deliberately not ticked, because only a live room, a
real key or a deployment can close them. Nearly every commit carries a `Co-Authored-By: Claude`
trailer (31 of the 39 commits at the time of writing), so the history shows it too.

## The author's other entry

The rules allow at most two independent projects per person, and ask each README to name the other
(`SDD.md` §7, PN-12, Q-015). This repository is one of the author's two entries and **replaces
LETHE**, the v0 hackathon build whose testnet deployment is left untouched; **ChainProof Guard** is
the other. Both are the author's own earlier projects, and `SDD.md` §1.1 has the repository link for
each.

Marginal is a new codebase, not a resubmission. `SDD.md` §2.3 lists line by line what carries over
from LETHE and what changed; in code, the ported parts are the novelty measurement in
`room/src/appraisers/knowledge/` (its MiniLM similarity, its τ values of 0.78 and 0.45 and its
padding-resistant need weighting) and the judge prompt in `room/src/judges/`. Everything else —
the immutable KeyPolicy, attested registration, the leakage ledger, the formula registry, Sealed
verdicts, the certificate format — is new. ChainProof Guard's two patterns (function-call-key spend
caps and k-of-n attester corroboration) are **re-implemented** here, not imported.

On the hackathon's window rule: every commit in this repository was made on or after 2026-11-12,
which is inside the window, so there is no pre-hackathon work to separate by a branch or a tag and
no diff link to give.

## Licence

Not chosen yet, and the choice is the author's: `tasks.md` X-2 holds a licence decision open
alongside a patent decision, which is also why the repository is still private. The rules accept any
licence provided there is a LICENSE file, and require the repository to stay public through judging
(PN-12, Q-014).

TODO(jay) - decide the licence (X-2: MIT or Apache-2.0, after the patent decision), add the LICENSE file, and name it here.

TODO(jay) - paste the LETHE and ChainProof Guard repository links into "The author's other entry" if you want them inline; they are in `SDD.md` §1.1.

## Status

`tasks.md` is the honest version, and it is kept current. As of its 2026-11-14 note, **49 of M1's 69
tasks are closed**: the deploy, `marginal-core`, the immutable KeyPolicy, clearing from a listing
through a funded job, a key release, a priced verdict, settlement, delivery and a claim; the room's
reproducible image and job loop; the worker, the sealing crypto, the appraisal pipeline and both
appraisers; the judges; Sealed verdicts end to end; the three host services; and all seven pages of
the web app, with the verifier and the SDK's browser crypto underneath them. `make check` passes with
100% coverage on both sides, and `make web` builds the app.

What is not done is the demo itself: the testnet deploy, the readiness run, the cross-contract test
suite, the demo corpus and scripts, the SDK's remaining transaction builders. And, plainly:

- **nothing has run on real hardware or on testnet.** No room has booted in a CVM, no key has been
  derived through the real MPC network, no NEAR AI receipt is real, and nothing is deployed;
- the pages that need a settled job were verified against a stub built from the view shapes they are
  typed against, because the real KeyPolicy refuses a room without a real TDX quote, so a local
  sandbox cannot produce one;
- the ZK setup is a dev ceremony and must be redone before anyone relies on it.

One thing this project never claims, in the product or anywhere else: that data is deleted or
unlearned. A forget certificate is exactly as strong as the room code, the attestation chain and the
hardware behind it. The claim is that inputs are **forgotten under attestation** — not proven, and
not cryptographic deletion.
