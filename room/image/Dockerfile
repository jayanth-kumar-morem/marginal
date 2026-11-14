# The room's container image (SDD §3.13, §3.14; E7.2).
#
# Everything in here is measured. The image digest goes into `docker-compose.yaml`, that file goes
# into `app-compose.json`, and the SHA-256 of `app-compose.json` is the compose hash dstack records
# in RTMR3 and KeyPolicy checks (§3.13 step 7). So this file is pinned end to end: a digest for the
# base image, a frozen lockfile, no install scripts, and nothing in the runtime stage but the built
# supervisor and the wasm build of `marginal-core`.
#
# The build context is assembled by `build.sh` from `git archive HEAD` plus `core.wasm`, so an
# uncommitted file cannot end up in the image and neither can `deploy/.keys/`.

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
WORKDIR /src
COPY . .

# pnpm comes from the version `package.json` pins, and no package's install scripts run.
RUN corepack enable && corepack install
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @marginal/core-wasm build && pnpm --filter @marginal/room build

# What the room actually needs at runtime: its own `dist/`, and `@marginal/core-wasm` with the wasm
# beside it (`crates/marginal-core-wasm/src/wasm.ts` loads `../core.wasm` from the package root).
RUN set -eu; \
    mkdir -p /out/node_modules/@marginal/core-wasm; \
    cp -r room/dist /out/dist; \
    cp room/package.json /out/package.json; \
    cp -r crates/marginal-core-wasm/dist /out/node_modules/@marginal/core-wasm/dist; \
    cp crates/marginal-core-wasm/package.json crates/marginal-core-wasm/core.wasm \
       /out/node_modules/@marginal/core-wasm/

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime

COPY --from=build /out /app
# The Sealed-mode prover's artefacts: the verifying key, the proving key and the witness generator,
# at the path `dist/prove.js` resolves (`../../circuits/` from `/app/dist/`). They are committed and
# pinned by `circuits/SHA256SUMS`, which `readVerified` checks before either is used (DR-9).
COPY --from=build /src/circuits /circuits
WORKDIR /app
USER node

# `main()` brings the room up (keys, registration, renewal, the job loop). If it rejects — no
# configuration, no guest agent, a registration the registry refuses — the process exits non-zero
# and dstack restarts it, which is the only sensible answer: a restart means new keys and a new
# attestation (§3.13 step 9).
CMD ["node", "-e", "import('/app/dist/main.js').then((m) => m.main()).catch((error) => { console.error(String(error)); process.exit(1); })"]
