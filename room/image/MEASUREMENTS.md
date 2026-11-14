# The room's measurement

What a seller pins when they pin a room, and how to reproduce every number in it (SDD §3.13,
§3.14.3; tasks.md E7.2, E7.3; DRC-3).

A room is admitted by KeyPolicy only if its TDX quote and its RTMR3 event log say it is **this**
software, configured **this** way. Nothing in that chain is a claim the operator makes: it is a
hash of files, and the files are in git.

## What is measured, and by whom

| Register | Covers | Who produces it |
| --- | --- | --- |
| MRTD, RTMR0–RTMR2 | Firmware, kernel, boot configuration | The dstack guest OS image Phala boots (`phala os-images --prod --json`). Not ours; it is pinned by using a published image and recorded in the registration |
| RTMR3 | The app's own events: `app-id`, `compose-hash`, `instance-id`, `key-provider`, `storage-encrypted`, `system-ready` | dstack, from `app-compose.json` |
| `compose-hash` | `app-compose.json`, byte for byte — and so the compose file inside it, and so the room image digest, and so every configuration value | **This directory** |

`app-id` is the first 20 bytes of the compose hash. dstack only *defaults* it to that (a deployment
may pin its own since 0.6.x), so KeyPolicy requires the default: an app id that outlives a compose
hash is exactly what that check stops (tasks.md SDD issue 22). E7.1 must therefore deploy the room
as a **new app** with no pinned `app_id`.

## The pins

| Pin | Value | Where |
| --- | --- | --- |
| Base image | `node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee` (linux/amd64 manifest `sha256:47725aca53d3295ec2d3be8f62726599b3033cc262edc2c7e429909b3ac599fc`) | `Dockerfile` |
| pnpm | `pnpm@9.15.4`, through `corepack install` | root `package.json` |
| JS dependencies | `pnpm install --frozen-lockfile --ignore-scripts` | `pnpm-lock.yaml` |
| `core.wasm` | printed as `core_wasm_sha256` by `build.sh image`; `d2f68f50a7beeb2e41ac0448c26968f731b0351c89514d5ef1b0fbc60e68123a` at commit `7d96482` | built by `make wasm-core`, not committed |
| Room image | the digest `build.sh image` prints for the commit being deployed; published, then referenced by digest. It is a function of the commit, not only of the room's code: `SOURCE_DATE_EPOCH` is the commit's timestamp, so every commit gives a new digest and the same commit always gives the same one | `--image` |
| RPC URL, operator agent URL, chain id, clearing and KeyPolicy accounts | written literally into the compose file | `--rpc-url`, `--operator-url`, `--chain-id`, `--clearing`, `--keypolicy` |
| The MPC network's CKD public key | written literally into the compose file. It is a **pin**, not configuration: every derived key is checked against it (§3.12.3 step 4), so a host that could choose it could hand the room a key it made itself and the pairing check would still pass | `--mpc-public-key` |

Every one of those changes the compose hash, which is the point: a room cannot be pointed at another
clearing contract, another RPC or another image without becoming a different room (DR-9).

## Reproducing it

```sh
# 1. The image, from the committed tree (refuses a dirty tree).
room/image/build.sh image

# 2. The compose hash, from the templates and the pins.
room/image/build.sh compose \
  --image      ghcr.io/<owner>/marginal-room@sha256:<digest from step 1> \
  --rpc-url    https://test.rpc.fastnear.com \
  --operator-url http://<the operator agent, on the CVM host> \
  --chain-id   testnet \
  --clearing   clearing.marginal-demo.testnet \
  --keypolicy  keypolicy.marginal-demo.testnet \
  --mpc-public-key bls12381g2:<the CKD key of the signer contract's domain>
```

Step 2 needs nothing but node and this repository, so two builders can reproduce the compose hash
from a git tag and this table without trusting each other or the image registry (AC-52). The
output goes to `out/`, which is not committed: `out/app-compose.json` is what is deployed, and its
SHA-256 is the compose hash, because that is exactly what dstack measures
(`dstack-util/src/system_setup.rs`: `sha256_file(app_compose_file)`). The file is written as
canonical JSON — recursively key-sorted and compact — so dstack's own SDKs, which predict the hash
from canonical JSON rather than from the file, get the same answer.

`room/src/image.test.ts` checks all of this on every `make check`: the hash is stable across runs,
it changes when any pin changes, it equals the SHA-256 of the deployed file, the file is canonical,
and `app-compose.json` still says what §3.13 requires.

## The event policy a room must satisfy

Checked on-chain by `marginal-core`'s `room_events` (`crates/marginal-core/src/verifier.rs`), and
locally by the room itself before it asks anyone to pay for a verification
(`room/src/registration.ts`). Exactly one each of:

- `compose-hash`, equal to the SHA-256 of the deployed `app-compose.json`;
- `app-id`, equal to its first 20 bytes;
- `key-provider`, payload exactly `{"name":"none","id":""}` — no KMS, so no Marginal key derives
  from dstack and the disk is fresh at every boot;
- `instance-id`, **empty** — which happens only because `app-compose.json` sets
  `"no_instance_id": true`;
- `storage-encrypted`, payload `1` — an event that exists only from dstack **0.6.0**, which is why
  E7.1 checks the image version before paying for a CVM;
- `system-ready`.

And **none** of `os-image-hash` (it appears only on the KMS path) or `init-script-hash` (an
`init_script` of `""` still emits one, so `app-compose.json` has no `init_script` key at all).
A CPU-only room on dstack 0.6.x also gets one `gpu-policy-hash` (`sha256("{}")`); the policy allows
it. `event_log_version` is left unset, because the replay implements V1 digests only.

## What is not pinned here yet

- **The room image is not published.** The compose file has to name it by digest, and a dstack CVM
  cannot hold registry credentials (`allowed_envs: []`), so the image has to be public. That is the
  user's call, not this repository's: see [P-5](../../tasks.md#paid-and-account-gated-steps-jay).
- **Model weights and onnxruntime.** `room/models/`, pinned by SHA-256 and loaded with no runtime
  download, arrive with the appraisers (E8.6). They will change this measurement.
- **Egress.** `nftables.conf` and the supervisor's egress proxy are E17.1; M1 does not enforce
  egress (tasks.md, "What M1 cuts").
- **Whether Phala Cloud deploys our bytes.** The compose hash is the hash of the uploaded
  `app-compose.json`. If Phala's CLI assembles its own file instead of taking `out/app-compose.json`
  verbatim, the hash is its file's, not ours. E7.1 confirms this on the live CVM and records the
  deployed file beside the quote in `fixtures/quotes/`.
- **Cross-machine image reproducibility.** Two `--no-cache` builds of the same commit on the same
  host give the same digest (checked on 2026-11-14 at commit `7d96482`:
  `sha256:f0bacb3b0da4f4774bea1edb747052dac1f81c4165bf3dc81d3f54d7d3d5af08` twice), which is what
  the pins above are for: the base image by digest, the lockfile frozen, no install scripts, and
  `SOURCE_DATE_EPOCH` with buildkit rewriting layer timestamps. Two things are not established.
  **A second builder on another machine has not been tried.** And `core.wasm` is built on the host
  rather than inside the image, so two builders must also compare `core_wasm_sha256`; a Rust stage
  inside the image build would close that gap (M2).
