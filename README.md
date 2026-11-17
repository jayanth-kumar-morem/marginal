# Marginal

**A confidential exchange that prices information goods by their measured marginal value, on NEAR.**

Built by [7Block Labs](https://7blocklabs.com) · demo: **https://marginal.7blocklabs.com**

## For judges (start here)

| | |
| --- | --- |
| Hosted demo | https://marginal.7blocklabs.com (opens `/listings`) |
| Demo video | https://x.com/jay_ensures/status/2121727522962538557 |
| Live contracts (NEAR testnet; attestation flagged **Simulated**) | `clearing.marginal-sim.testnet`, `keypolicy.marginal-sim.testnet`, `musdc.marginal-sim.testnet` · [explorer](https://explorer.testnet.near.org/accounts/clearing.marginal-sim.testnet) |
| Honest scorecard | [What is real and what is not](#what-is-real-and-what-is-not) |
| Re-run locally | `pnpm install && make models && make check`, then the [full runbook](#run-it-from-a-fresh-clone) |

*Note for reviewers:* the submission overview mentions a "Real and simulated" table and a local sandbox. That table is now [What is real and what is not](#what-is-real-and-what-is-not) below. A hosted testnet showcase was added after submission; every simulated element is flagged on chain and in the UI.

A seller lists a document without revealing it. A buyer says what they already know. A TEE room
reads both, measures how much the document would actually add to *that* buyer, and prices it on
that measurement. The buyer pays for what the document was worth to them; the seller learns nothing
about the buyer; and what leaked is metered, so the same information cannot be sold twice over.

Everything that decides money happens on NEAR. The room is not trusted to be honest — it is trusted
only to be the program it says it is, and the contract checks both.

---

## What NEAR does here

This is not a project that keeps its state on NEAR and its logic elsewhere. Four things are on
chain, and each is load-bearing.

**1. The contract re-verifies the enclave's signature on every verdict.**
A room's key is only on chain because KeyPolicy verified a real Intel TDX quote for it — on chain,
through a locked DCAP verifier contract, with 200 TGas
([`contracts/keypolicy/src/registration.rs`](contracts/keypolicy/src/registration.rs), method
`verify_quote_with_collateral_dates`) — and because the quote's RTMR3 event log replayed to the
value the quote reports. When that room later submits a verdict, clearing checks the ed25519
signature against exactly that key, and refuses it if the room is not the one the job was given to
or its attestation has lapsed
([`contracts/clearing/src/verdict.rs:132`](contracts/clearing/src/verdict.rs), `env::ed25519_verify`).

**2. The contract recomputes the price itself.**
The room reports *components*, not a price. Clearing recomputes the measured index and applies the
pricing rule with `marginal-core`, the same crate the room runs
([`contracts/clearing/src/verdict.rs`](contracts/clearing/src/verdict.rs), `measured_index` and
`apply_rule`). A room that inflates a price does not get paid more; a judge can only ever
*discount*, never raise. The price is the contract's, not the room's.

**3. MPC Confidential Key Derivation releases the listing key.**
A room gets a listing's key by asking NEAR's MPC network (`v1.signer-prod.testnet`, CKD domain 2) —
and only after KeyPolicy has authorised that exact job. The room never holds a durable key, so a
room that is replaced cannot read what it was never given.

**4. Chain Signatures and NEAR Intents pay the seller in USDC on Solana.**
A seller is paid where they want to be paid. The payout route is priced through NEAR Intents' 1Click
API ([`services/gateway/src/quote.ts`](services/gateway/src/quote.ts), `1click.chaindefuser.com`)
and the proceeds are sent to a Solana address derived for that seller by NEAR's Chain Signatures,
so no bridge and no custodian stands between the settlement and the payout.

> **Build status, stated plainly:** 1–3 are built and run. For 4, the **1Click quote is live** (the
> gateway proxies a real dry quote and stores nothing — `dry: true` is forced on every call), and
> the **Chain-Signatures-derived address is not implemented yet**: the seller types their Solana
> address, and `/sell` says so on the page rather than implying it was derived. See
> [What is real and what is not](#what-is-real-and-what-is-not).

---

## Run it from a fresh clone

Every step below was run from a clean tree. Each says what you should see.

**Prerequisites:** Node 22 (`.nvmrc`), pnpm 9, Rust (`rust-toolchain.toml`) with `cargo-near` and
`cargo-llvm-cov` (`cargo install --locked cargo-near cargo-llvm-cov`), and Docker for the three
host services.

### 1. Install, and enable the git hooks

```sh
pnpm install
```

**See:** the workspace resolves and `.githooks/pre-commit` is enabled.

### 2. Fetch the embedder's weights

```sh
make models
```

**See:** `room/models/all-MiniLM-L6-v2/` populated and every file checked against the committed
`SHA256SUMS`. Nothing the room scores with comes off the network at run time; this is fetched once
and pinned.

### 3. Run the gates — this is the claim worth checking

```sh
make check
```

**See:** `cargo fmt`, clippy on four configurations, every Rust test under instrumentation at
**100% of lines, functions and regions**, then eslint, `tsc` and every TypeScript test at **100% of
lines, branches and functions**. The gate fails if a single line is uncovered. Nothing is excluded
to make it pass — if a line is hard to reach it is deleted or extracted, never ignored.

```sh
make props
```

**See:** `marginal-core`'s pricing and leakage invariants at 10⁶ cases each — including AC-2 (a
judge can only discount) and AC-5 (the price never exceeds the deterministic ceiling).

```sh
make e2e
```

**See:** near-workspaces suites deploying the **real** clearing contract, the real locked TDX
verifier wasm and `keypolicy-sim`, then walking a complete deal: a buyer's deposit of 503,515,920
base units settles to a 400,000,000 price, a 100,500,000 refund, 15,920 of leakage compensation and
a 2,000,000 fee split 1.2M/0.6M/0.2M — with conservation checked on every settlement.

### 4. Deploy a local chain

```sh
deploy/scripts/up.sh sandbox
```

**See:** a throwaway NEAR node, then `musdc`, `clearing` and KeyPolicy deployed, followed by the
seeding every usable chain needs — the appraiser, the fee table, the Groth16 verifying key, the
measurement set, the platform, the operator agent's account, and clearing's own storage entry on
the settlement token. It ends with `manifest written:` and the node's URL. **Leave it running.**

The sandbox profile deploys `keypolicy-sim` and prints `!!! SIMULATED ATTESTATION` to say so. Off
the sandbox that build is refused by the profile validator and by the deploy script unless the
profile is named `*-sim` — the name is recorded in clearing's `config()` and shown on every page —
and by the contract itself on mainnet (`sim-attestation` + `mainnet` is a `compile_error!`).
`testnet-sim` is the one such profile: the seeded showcase, where every room and every settlement
is flagged `Simulated`. `testnet-demo` never carries one.

### 5. Start the three host services

```sh
cd deploy/services && docker compose --env-file .env.sandbox up --build
```

**See:** `gateway on 8081 … replay against clearing.sandbox`, `operator agent on 8082, judges
simulated`, and `compliance on 8083, list 520 addresses` — that last number is the **real OFAC SDN
list**, fetched and parsed, not a fixture. None of the three is trusted: every object the gateway
serves is checked against a hash the chain committed to, and every message the agent relays is
signed by the room.

### 6. Start a room

```sh
pnpm --filter @marginal/room build
cd room && MARGINAL_SIMULATED_ATTESTATION=1 \
  MARGINAL_RPC_URL=<rpc from the manifest> MARGINAL_CHAIN_ID=sandbox \
  MARGINAL_CLEARING=clearing.sandbox MARGINAL_KEYPOLICY=keypolicy.sandbox \
  MARGINAL_OPERATOR_URL=http://127.0.0.1:8082 \
  MARGINAL_MPC_PUBLIC_KEY=<room/src/testing.ts's MPC_PUBLIC_KEY> \
  node -e "import('./dist/main.js').then((m) => m.main())"
```

**See:** `room <key> registered, polling clearing.sandbox every 2000 ms`. Start it **once** — a room
makes fresh keys on every boot, so a restart leaves a stale room in the eligible pool.

Then check the chain agrees:

```sh
near view clearing.sandbox eligible '{"class":"Kcpu"}'
```

**See:** exactly one room key — the one the room just printed. It is there because KeyPolicy
recorded an attestation and clearing's registry admitted it against the approved measurement set.

### 7. Open the app

The hosted demo is at **https://marginal.7blocklabs.com**. To run it yourself:

```sh
MARGINAL_MANIFEST=$PWD/deploy/manifest.sandbox.json \
MARGINAL_GATEWAY_URL=http://127.0.0.1:8081 MARGINAL_COMPLIANCE_URL=http://127.0.0.1:8083 \
  pnpm --filter @marginal/web dev
```

**See:** http://localhost:3100. `/rooms` shows the room that just registered — its measurement, its
PPID hash, the RTMR3 event order, and `Simulated` where a real quote's TCB status would be. A
banner on every page says which elements are simulated; it is generated from the chain's own
`simulated_flags`, not written by hand.

No browser wallet knows a local node, so signing uses a **sandbox-only dev key**: paste an account
and key from `deploy/.keys/sandbox.json` into the bar at the top. That path is refused unless the
network is not a public one, the deployment has no wallet URL, **and** the RPC is on loopback —
which a manifest cannot fake, because the transaction still has to reach a node on this machine.

### 8. Walk it

With a seller account funded (`musdc.mint` from the faucet account the deploy created) and a buyer
with an escrow balance (`ft_transfer_call` to clearing with `msg = {"Deposit":{"account":…}}`):

1. **`/sell`** — upload a memo. It is canonicalised, committed to and sealed **in the browser**;
   what reaches the chain is a commitment and a ciphertext hash. **See:** two signatures, then a
   screening job that completes in seconds and the listing turning `Active`.
2. **`/listing/[id]`** — **See:** the posted ask, the teaser, and the leakage meter: spent,
   reserved and remaining, with π per bit, exactly as the contract counts them.
3. **`/appraise/[id]`** — state a need and a budget. The budget must cover the ask; the contract
   refuses otherwise, because no deal could ever be struck. **See:** the real debit before you sign.
4. **`/jobs/[id]`** — **See:** the state machine live: `Assigned` → `Computing` → settled. For a
   RoomSealed listing the move to `Computing` is the room's own signed ack, recorded in the audit
   chain under its own kind so a replay can tell it apart from a KeyPolicy key release.
5. **`/verify`** — **See:** the settlement re-checked from four contract views with `marginal-core`
   itself, and the two things it *cannot* check from views named as unchecked rather than implied.

---

## What is real and what is not

Stated here because an honest scorecard is worth more than a demo that overclaims.

| | Status |
| --- | --- |
| Pricing, leakage metering, escrow, settlement, refunds | **Real.** On chain, 100% covered, conservation checked on every settlement |
| On-chain TDX quote verification through a locked verifier | **Real.** A recorded production quote verifies inside KeyPolicy's gas budget |
| Groth16 sealed verdicts | **Real.** A proof verifies on chain and debits exactly 1,000 mbits |
| OFAC SDN screening | **Real.** The published list, parsed; the demo's blocked address is a genuine SDN entry |
| NEAR Intents 1Click quote | **Real**, and deliberately read-only: `dry: true` is forced and nothing is stored |
| Room attestation **in the local demo and the hosted showcase** | **Simulated.** `keypolicy-sim` admits a room that proves nothing; every record it makes says `Simulated` and the settlement carries the flag |
| Key release **in the local demo and the hosted showcase** | **RoomSealed**, the documented fallback (SDD §3.12.7), not MPC CKD — a local node cannot reach the MPC network, and a simulated room's listings are RoomSealed |
| Chain-Signatures-derived payout address | **Not built.** The seller types the address and the page says so |
| Judges | **Simulated** unless a NEAR AI key is supplied; flagged on chain either way |
| Context envelope for an appraisal | **Not built** (`TODO(E12.1)`). Without it the room rejects the input *without decrypting the good*, which is the specified behaviour — and the settlement proves it: zero bits debited |

The twelve readiness checks of SDD §5.4 are tracked internally with the same discipline: a check is
**shown** only if it was run against the deployment it names, never because the code for it exists.

---

## Libraries

**Contracts and core (Rust).** `near-sdk` and `near-contract-standards` (both pinned `=5.30.1`),
`borsh`, `sha2`, `hex` and `serde` — all `no_std` in `marginal-core`, which has no other
dependencies because the contracts, the room and the verifier all have to agree to the last unit.
`near-workspaces` and `proptest` for tests; `cargo-near` for reproducible contract builds;
`ark-*` via `marginal-groth16` for the sealed-verdict proof system.

**Room and services (TypeScript).** `onnxruntime-web` (pure wasm, so the measurement does not
depend on a native binary), `libsodium-wrappers`, `snarkjs` and `circomlibjs`, `@noble/curves` and
`@noble/hashes`, `@scure/base`, `near-api-js`. The dstack client and the WordPiece tokenizer are
written out rather than imported: the room's dependency list is part of what a seller pins.

**Web.** Next.js 15, React 19, Tailwind 4, `@near-wallet-selector` with MyNearWallet,
`@near-js/{crypto,signers,transactions,utils}`, Radix UI primitives, `@tabler/icons-react`,
`@tanstack/react-table`, `react-hook-form` with `zod`, `recharts`, `sonner`, `next-themes`.
`apps/web/src/components/ui/**` is vendored shadcn/ui, Magic UI and 21st.dev code, kept as it ships.

**Circuits.** circom and snarkjs; the proving and verifying keys in `circuits/` come from a
**development ceremony** and are not a trusted setup.

**AI-generated code.** This repository was written with Claude Code (Claude Opus 5). The design
(`SDD.md`) and the specification (`SPEC.md`) were written before the code and the code follows them.
An internal build plan records, task by task, what was verified and what was not — the same
discipline the real-versus-simulated table above comes from.

---

## Layout

| Path | What |
| --- | --- |
| `contracts/clearing` | Listings, jobs, pricing, escrow, settlement, payouts, the room registry |
| `contracts/keypolicy` | Attestation and key release. Immutable, created keyless, never holds an access key |
| `crates/marginal-core` | `no_std` types, pricing, leakage, commitments, signing bytes, attestation checks — the one implementation everything else agrees with |
| `crates/marginal-core-wasm` | The same crate as wasm, for TypeScript |
| `room/` | The TEE room: registration, the job loop, the appraiser, judges, certificates |
| `services/` | Gateway, operator agent, compliance — all untrusted by design |
| `apps/web` | The Next.js app |
| `verifiers/replay-ts` | Re-checks a settlement from public data alone |
| `circuits/` | The sealed-verdict circuit |
| `SPEC.md`, `SDD.md` | The product spec and the design. Section numbers in code comments (§x.y) point at the SDD |

---

## Licence

**Business Source License 1.1** — see [LICENSE](LICENSE). Licensor: **7Block Labs**.

The source is open to read, run and modify for any **non-production** purpose — evaluating it,
judging it, running it locally, studying it. Production use needs a commercial licence until the
Change Date (2030-11-15), when it converts to Apache 2.0. The hackathon's own rule is "Any. MIT is
fine. Repo stays public through judging; add a LICENSE file" — BUSL satisfies that while leaving the
product with its author.
