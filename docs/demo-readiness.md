# Demo readiness

The twelve checks of [`SDD.md`](../SDD.md) §5.4, each with what has actually been shown. E15.2 is
the task that turns this file into a record of a run; this version is the state **before** the
testnet deploy, written so that the gap between "built" and "shown" is visible rather than implied.

**Read "ready" as §1.6 defines it:** the surface works end to end on testnet from a fresh browser.
Nothing here is ready by that definition yet, because nothing is deployed to testnet. What is here
is what each check needs, what exists, and what is missing — so the remaining work is a list rather
than a discovery.

Status words, used strictly:

| Word | Means |
| --- | --- |
| **shown** | The check was run and passed, against the thing it names. |
| **built** | The code is written and tested, and the check has not been run against a deployment. |
| **blocked** | Something only the author can do stands in the way, named with its id. |

## The checks

| # | Surface | Status | What has been shown, and what has not |
| --- | --- | --- | --- |
| DRC-1 | D1 · two funds, one memo | **built** | Both halves exist either side of a gap. The contracts settle the two outcomes to the unit in native tests, and the pages for all four steps — list, appraise, watch, open — render against real chain state. What has not happened is one run from a fresh browser: the listing needs a room to provision its key, and no room has registered. The CKD half is blocked on [P-1]; the browser half on [P-3]. |
| DRC-2 | D2 · verify anything | **built** | `verifiers/replay-ts` re-checks a settlement from four contract views with `marginal-core` itself, and a flipped byte in the audit log fails it (tested). It runs in three places — a shell, the gateway's `/v1/replay/:id`, and `/verify`. It has never run against a testnet settlement, because there is none, and the `dcap-qvl` leg needs a real quote ([P-1]). Two checks it cannot make from views — the room's signature and the Open recompute of `m` — it reports as unchecked rather than implying it made them. |
| DRC-3 | D3 · a real attested room | **blocked** | [P-1]: no CVM has booted, so there is no quote, no on-chain registration and no `OnChainDcap` record. The pieces are built and verified apart: the room's image builds reproducibly (a `--no-cache` rebuild reproduced its digest), KeyPolicy verifies a **real** recorded TDX quote through the locked verifier inside its gas budget, and `/rooms` shows the PPID, the TCB status, the measurement and the RTMR3 order a record carries. |
| DRC-4 | D4 · the leakage wall | **built** | The contract refuses an appraisal once the budget is spent, and the leakage meter on `/listing/[id]` shows spent, reserved and remaining as the contract counts them. The red-team script that drains a listing with many identities is E14.3, and the end-to-end needs a room. |
| DRC-5 | D5 · prompt-injected buyer agent | **built** | Agent keys, per-window caps and the parked state are in clearing with native tests, and `/jobs/[id]` carries the approve button that only a non-agent key can use. The injected run is E14.3. |
| DRC-6 | D6 · seller injection cannot raise a price | **built** | The property holds in `marginal-core` at 10⁶ cases: a judge can only discount, and the price never exceeds the deterministic ceiling. The injected memo is a fixture (E14.2) and the Open-mode verdict that displays the clamp is on `/jobs/[id]`. Not run end to end. |
| DRC-7 | D7 · cross-chain payout | **built** | The gateway proxies a **live** 1Click dry quote with `dry: true` forced and stores nothing, and `/sell`'s payout step shows the route and the quote, labelled displayed-not-stored. The Chain-Signatures-derived address is not derived yet: the seller types the address, and the page says so. |
| DRC-8 | D8 · compliance | **built** | The audit export is the part that is shown: built in the browser from contract views, its hash chain recomputed with core's own step, equal to the contract's published head, and re-verified when loaded back — with a tampered entry and a missing entry each caught by sequence and field. The MNPI hold, the restricted-list outcome and the OFAC payout block need the fixtures (E14.2) and a deployment; the compliance-copy decrypt is built and unexercised, because no job has carried a compliance copy. |
| DRC-9 | D9 · dataset priced by lift | **built** | `dataset-lite@0` runs on CPU with a seeded bootstrap and reports its bucket; the corpus and a run inside its duration class are E14.2 and a deployment. |
| DRC-10 | D10 · blind mode with a sealed verdict | **built** | The strongest of the built checks: clearing verifies a **real** Groth16 proof on chain and debits exactly 1,000 mbits, and a valid proof of the other outcome is refused with `E_PROOF_INVALID` while the job stays open. The gas has not been measured on chain (about 78 TGas by NEAR's published parameters), the setup is a dev ceremony, and the buyer's outcome-only view has not been seen in a browser against a real sealed job. |
| DRC-11 | D11 · timeout refund | **built** | `refund_expired` restores the buyer in native tests, with conservation checked on every settlement, and `/jobs/[id]` offers the call to anyone once the deadline has passed. Killing a live room mid-job is E14.3 and needs [P-1]. |
| DRC-12 | All · simulated elements flagged | **built** | `simulated_flags` is set on every settlement a simulated element produced, `apps/web/src/lib/simulated.ts` turns those bits into the banner on every page and the per-record card on a settlement, and the verifier counts them. Two gaps: the README's table is written by hand until there is a deployment to generate it from, and `SIM_SETTLEMENT` is set by no contract although the demo settles in a test token (SDD issue 41). |

[P-1]: ../tasks.md#paid-and-account-gated-steps-jay
[P-3]: ../tasks.md#paid-and-account-gated-steps-jay

## What stands between this and a run

**Changed 2026-11-14 by E14.4.** Items 1, 3, 4 and 5 below are done, and a **local** run is now
possible end to end — see [`local-demo.md`](local-demo.md). That matters for this scorecard in a
specific, limited way: it moves checks from "built" towards "shown", but **only ever as a local run
with three elements stood in for** (simulated attestation, RoomSealed key release instead of MPC
CKD, and a pasted sandbox dev key instead of a browser wallet), each flagged on chain and in the UI.
No row below is marked **shown** on that basis, because §1.6's definition of ready names testnet and
a fresh browser. When a local walk is run, record it as its own line — "run locally, with X stood in
for" — and keep **shown** for the testnet run.

Two things E14.4 found by running what the tests already passed, both of which would have broken the
testnet deploy: nothing registered clearing with the settlement token, so **no buyer could have
deposited**; and `set_verifying_key` was seeded by nothing, so **every sealed verdict (DRC-10) would
have failed**. Both are fixed, and the deploy now refuses to write a manifest if the first is not
done. The lesson for the remaining checks is that a green gate is not a run.

1. ~~**[P-3], free:** fund `marginal-demo.testnet` from the faucet.~~ **Done 2026-11-14:** the
   account holds 19.99 NEAR against the 19 the deploy now needs. A browser still cannot sign against
   a local sandbox — MyNearWallet does not know one — which is why the sandbox-only dev signer
   exists, and why it is not a readiness claim.
2. **[P-1], about $0.25:** boot the room's CVM and capture a real quote. This unblocks DRC-3, the
   CKD key release in DRC-1, and the room kill in DRC-11.
3. ~~**E14.1**, the cross-contract suite with `keypolicy-sim`~~ **done**: the D1 walk, the refund
   paths and the leakage wall run without hardware, natively.
4. ~~**E14.2**, the fixtures~~ **done**: the corpus DRC-1 and DRC-6 measure, the MNPI memo DRC-8
   holds, and the real OFAC SDN entry its payout block needs.
5. **E14.3**, the three scripts: the sybil probe (DRC-4), the injected agent run (DRC-5) and the room
   kill (DRC-11).

## How to record a run

When a deployment exists, replace each row's "what has been shown" with what was observed, and keep
the words strict: a check is **shown** only if it was run against the deployment it names. A P1 or
P2 surface that fails is marked "not shown" rather than quietly dropped — that is what §5.4 asks
for, and what the README's real-versus-simulated table is generated from.
