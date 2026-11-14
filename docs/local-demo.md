# Running the whole demo locally

Everything in this file runs on one machine, costs nothing, and needs no TDX hardware, no Phala
account and no testnet funds. It is what E14.4 built, and it exists because the honest answer to
"can't we just test it locally?" was, until then, no — four separate things stood in the way, and
three of them broke the testnet deploy too (`tasks.md` → E14.4 records them).

**Read this first, because it is the whole point of the file.** A local run is a *demonstration of
the mechanism*, not a claim that the system is ready. [SDD](../SDD.md) §1.6 defines ready as "the
surface works end to end **on testnet** from a fresh browser", and a local run is not that. Three
things here are simulated or stood in for, every one of them flagged on chain and in the UI:

| What | Stood in for by | Flagged as |
| --- | --- | --- |
| The room's attestation | `keypolicy-sim`'s `register_room_simulated` — the host claims what a quote would have proved | `tcb_status: "Simulated"`, `AttestationMode::Simulated`, and `simulated_flags` on every settlement |
| MPC CKD key release | `RoomSealed` (§3.12.7): the seller seals `DEK_g` to the room's `box_pk` | The key-release mode is on the listing, and `/sell` shows §3.12.7's three limitations before signing |
| The browser wallet | A sandbox dev key pasted into the browser | A permanent bar: "Signing with a local sandbox dev key, not a wallet" |

So **DRC-3 does not pass locally**, and it cannot: a real quote is bound to a nonce KeyPolicy just
issued, so no recorded quote can stand in. That one needs the CVM ([P-1](../tasks.md#paid-and-account-gated-steps-jay)).
Everything else — pricing, the leakage wall, escrow and settlement to the unit, the audit chain,
delivery and the decrypt-and-check, the verifier, refunds and timeouts — is the real code.

## What you need

Node 22, pnpm, Rust, and Docker for the three host services. That is all.

```sh
export PATH="$HOME/.cargo/bin:$HOME/.nvm/versions/node/v22.23.5/bin:$PATH"
pnpm install          # once; also enables the git hooks
make models           # once; the embedder's weights, checked against the committed SHA256SUMS
```

## 1. The chain

```sh
deploy/scripts/up.sh sandbox
```

This starts a throwaway local node, deploys `musdc`, `clearing` and — because
`deploy/profiles/sandbox.toml` sets `simulated_rooms = true` — `keypolicy-sim` rather than the
real KeyPolicy. The real one verifies quotes through a verifier contract that only exists on
testnet, so on a local node no room could ever register. `simulated_rooms` is refused on any profile
whose network is not `sandbox`, by the profile validator and again in `deploy.ts`; the contract
carries the same belt and braces, since `sim-attestation` + `mainnet` is a `compile_error!`.

It then seeds everything a chain needs before it can do anything at all: the appraiser (without one
`create_listing` fails), the fee table, the Groth16 verifying key for sealed verdicts, the
measurement set and the platform the simulated room is admitted under, and the operator agent's
account. It finishes by writing `deploy/manifest.sandbox.json` and
`deploy/services/.env.sandbox`, and printing the compose command to run next.

Two things it will tell you it skipped, both expected:

- `issuer_key` **and** `compliance_key` **are absent** from the profile, so clearing verifies no identity
credential and no payout approval. There is no committed dev seed, so no value could be shipped
that matches the service you are about to start. See step 5 to fill them in.
- Nothing else should be skipped. If it logs `!!!` for anything more, read it: the deploy prints what
it did not do rather than leaving you to find out at the demo.

## 2. The host services

```sh
cd deploy/services
docker compose --env-file .env.sandbox up --build
```

Gateway on 8081, operator agent on 8082, compliance on 8083. None of them is trusted: every object
the gateway serves is checked against a hash the chain committed to, and every message the agent
relays is signed by the room.

`.env.sandbox` carries `MARGINAL_AGENT_ACCOUNT=agent.sandbox` and its key (from
`deploy/.keys/sandbox.json`, mode 0600, gitignored), plus `MARGINAL_SIM_MEASUREMENT` and
`MARGINAL_SIM_PPID` — the measurement and platform the deploy approved, which the agent claims on
the room's behalf when it registers it. The room cannot claim them itself: it has no quote to read
them from, which is exactly what makes the registration simulated.

## 3. The room

**Build it first, and run it the way the image does.** The supervisor forks a worker per job from
`WORKER_PATH`, which is `worker/main.js` relative to the module it is in. From source with `tsx`
that resolves to `src/worker/main.js`, which does not exist, and **every job dies with
`MODULE_NOT_FOUND`** while the room itself looks healthy — a screening job just sits at `Assigned`.
The module also exports `main()` without calling it, so `node dist/main.js` exits 0 having done
nothing; use the image's own invocation (`room/image/Dockerfile`'s CMD).

**Start it once.** A room generates fresh keys on every boot, so each restart registers a *new*
room and leaves the old one in the eligible pool until its attestation expires (24 hours). Two
eligible rooms is not a state this demo can publish in: `/sell` refuses, because nothing on chain
binds a RoomSealed listing to the room its `DEK_g` was sealed to, so it cannot tell which room would
get the job. If you have restarted the room, **redeploy** (step 1) and start it once.

```sh
pnpm --filter @marginal/room build
```

Then, with no dstack socket:

```sh
MARGINAL_SIMULATED_ATTESTATION=1 \
MARGINAL_RPC_URL=<rpc from the manifest> \
MARGINAL_CHAIN_ID=sandbox \
MARGINAL_CLEARING=clearing.sandbox \
MARGINAL_KEYPOLICY=keypolicy.sandbox \
MARGINAL_OPERATOR_URL=http://127.0.0.1:8082 \
MARGINAL_MPC_PUBLIC_KEY=<any valid BLS key; RoomSealed never calls MPC> \
  node -e "import('./dist/main.js').then((m) => m.main())"
```

Run it from `room/`. `MARGINAL_MPC_PUBLIC_KEY` is still required by the configuration even though
RoomSealed never calls MPC — `room/src/testing.ts`'s `MPC_PUBLIC_KEY` is a valid value to paste.

`MARGINAL_SIMULATED_ATTESTATION=1` makes the room skip dstack entirely and send a registration with
no quote. Without it the room asks `/var/run/dstack.sock` for a quote and fails, which is the
correct behaviour on a laptop. `MARGINAL_MPC_PUBLIC_KEY` is still required by the configuration even
though RoomSealed never uses it — `room/src/testing.ts`'s `MPC_PUBLIC_KEY` is a valid value to paste.

**Do not set** `MARGINAL_SIMULATED_ATTESTATION` **in** `room/image/docker-compose.tmpl.yaml`**.** That
compose file is measured, and a measured image claiming its attestation is simulated would be
nonsense.

## 4. The personas

Nothing in the repo seeds demo personas yet (it is still open under E15.1). Until it does, the walk
tool that does it lives outside the repo; it creates `seller.sandbox` and `buyer.sandbox`, mints
`musdc` from the faucet account and deposits the buyer's balance into clearing through
`ft_transfer_call`. What it does is four calls you can also make by hand:

1. create the two accounts as sub-accounts of the sandbox root, each with a full-access key;
2. `musdc.mint({account_id, amount})` as `faucet.sandbox` — `mint` registers the receiver's storage

   itself, so there is no `storage_deposit` step;
3. `musdc.ft_transfer_call` to clearing with `msg = {"Deposit":{"account":"buyer.sandbox"}}`;
4. check it landed with `clearing.get_balance({account, token})`.

## 5. The compliance keys

Start the compliance service once with your own seeds, read the public keys it derives, and paste
them into `deploy/profiles/sandbox.toml`:

```sh
cd deploy/services
MARGINAL_ISSUER_SEED=$(openssl rand -hex 32) MARGINAL_COMPLIANCE_SEED=$(openssl rand -hex 32) \
  docker compose up compliance
curl -s localhost:8083/v1/health      # issuer_key and compliance_key
```

Keep the seeds: changing one invalidates every credential issued under it. Until the keys are in the
profile, the identity and payout-approval paths cannot be shown — everything else can.

## 6. The web app

```sh
MARGINAL_MANIFEST=$PWD/deploy/manifest.sandbox.json \
MARGINAL_GATEWAY_URL=http://127.0.0.1:8081 \
MARGINAL_COMPLIANCE_URL=http://127.0.0.1:8083 \
  pnpm --filter @marginal/web dev
```

Reads render straight away. To **sign**, the app offers a sandbox dev key, because no browser wallet
knows a local node — MyNearWallet and Meteor know testnet and mainnet only. Paste an account and its
secret key from `deploy/.keys/sandbox.json` (or a persona's, from step 4) into the bar at the top.

That path is available only when three things are true at once: the network is not a public one, the
deployment has no wallet URL, and **the RPC is on loopback**. The third cannot be faked by a
manifest, because the transaction still has to reach a node on this machine. The key stays in the
browser, is never sent to a route handler and is never logged.

## 7. The walk

With all of the above up, the D1 walk is:

1. `/sell` — upload a memo, canonicalise it, set the parameters, and publish. Under RoomSealed

   the wizard is two calls rather than four: there is no listing key to provision and nothing to
    pin, so it goes `create_listing` → `publish_listing` straight from `Draft`, after sealing `DEK_g`
    to the room's `box_pk` and uploading it. The page shows §3.12.7's limitations before you sign and
    refuses to publish unless exactly one room is eligible — RoomSealed binds a listing to one room,
    and nothing on chain yet records which one (see the known gaps below).
2. `/listings` **and** `/listing/[id]` — the posted ask, the leakage meter as the contract counts it,

   and the teaser.
3. `/appraise/[id]` — the stated need, the budget, and the real debit shown before you sign.
4. `/jobs/[id]` — the state machine live. Under RoomSealed you will see `room_ack` move the job

   from `Assigned` to `Computing`; a `Ckd` job is moved by KeyPolicy's `authorize_release` instead,
    and the audit chain records the two as different kinds of event on purpose.
5. **Open and check** — decrypt the delivery with the buyer's key, in the browser, and check the good

   against the commitment the listing published.
6. `/verify` — re-check the settlement from four contract views with `marginal-core` itself.
7. `/rooms` — the room's record, which will say `Simulated` in the places a real quote would have

   filled in.

## Known gaps in the local path

Recorded here rather than discovered at a demo. The first is the only one that can bite a careful
run, and `/sell` refuses rather than letting it happen.

- **Nothing on chain binds a RoomSealed listing to the room its** `DEK_g` **was sealed to.**
`publish_listing` opens a screening job through `pick_room`, which draws from the eligible `K` and
`Kcpu` pools, so with two eligible rooms a listing can be handed to a room that physically cannot
open it, and it sticks in `Screening`. `/sell`'s "exactly one eligible room" rule is a client-side
mitigation; the real fix is a `sealed_to_room` field on the listing, which is a contract change.
- **DR-5's protection is absent under RoomSealed.** With CKD, receiving the key proves the job is
real. There is no such proof here, and §3.12.7's substitute — cross-checking job parameters on two
independent RPC providers — is not implemented. The room's own disclosure says so.
- **A room restart loses** `box_sk`, so every RoomSealed listing has to be re-sealed, and only the
same room can ever re-deliver.
- **Sealed verdicts are seeded but unproven on a deployed chain.** The verifying key is seeded and
the contract parses it; a sealed proof has been verified in native tests, not over RPC.
- **DRC-3 cannot pass locally**, as above.
