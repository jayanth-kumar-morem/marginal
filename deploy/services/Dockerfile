# The three host services and the web app, from one image (SDD §2.7; E11.1, E13).
#
# One image rather than four, because they are the same TypeScript workspace and the difference is
# which entry point runs. This is **not** the room's image: nothing here is measured, nothing here
# is attested, and these services are untrusted by design — the room's Dockerfile
# (`room/image/Dockerfile`) is the one with pinned digests and a reproducible build, because that
# one is part of what a seller pins.

# `core.wasm` is gitignored (`make wasm-core` builds it), so a host that builds this image from a
# git checkout has none, and every service that imports `@marginal/core-wasm` would die at start
# with ENOENT. Build it here, with the toolchain `rust-toolchain.toml` names, so the image does not
# depend on what happens to be in the working tree. The base image's version matches that file only
# to save a download: the file is what decides.
FROM rust:1.99.1-slim-bookworm@sha256:f2c004e3d2d8b547e8cf7ffbc29205385f4e71d23e53e4e383065db5e9f822cd AS core

WORKDIR /src
# Cargo resolves the whole workspace before it builds one member, so every member's manifest has to
# be present: that is `crates/` and `contracts/`.
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates crates
COPY contracts contracts
# The same command as the Makefile's `wasm-core`.
RUN cargo build -p marginal-core-wasm --target wasm32-unknown-unknown --release --locked

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1 NEXT_TELEMETRY_DISABLED=1
# The same directory as the runtime stage, and it has to be: the Next build bundles
# `@marginal/core-wasm` into each route handler and freezes that module's own location into it, so
# a handler built under one path looks for `core.wasm` under that path forever. Built in `/src` and
# run from `/app`, every route that touches the core answers 500 with ENOENT.
WORKDIR /app
COPY . .
COPY --from=core /src/target/wasm32-unknown-unknown/release/marginal_core_wasm.wasm crates/marginal-core-wasm/core.wasm
RUN corepack enable && corepack install
RUN pnpm install --frozen-lockfile --ignore-scripts
# Every workspace package the three services import, which is what `grep -rh 'from "@marginal/'`
# over `services/*/src` reports: core-wasm, service-common, replay-ts (the gateway's `/v1/replay/:id`
# serves it, E12.2) and the three services themselves. A package missing here fails as
# `TS2307: Cannot find module`, because its `dist/` and its type declarations are never built.
RUN pnpm --filter @marginal/core-wasm --filter @marginal/service-common --filter @marginal/replay-ts \
         --filter @marginal/gateway --filter @marginal/operator-agent --filter @marginal/compliance build
# The web app, as the Makefile's `web` builds it: the SDK it bundles for the browser, then the real
# Next build. The build fetches the fonts, so it needs the network.
RUN pnpm --filter @marginal/sdk build && pnpm --filter @marginal/web build:next

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/crates/marginal-core-wasm ./crates/marginal-core-wasm
# `node_modules` holds symlinks into the workspace, so a package's real directory has to come too or
# the import fails at run time rather than at build time.
COPY --from=build /app/verifiers ./verifiers
COPY --from=build /app/services ./services
COPY --from=build /app/sdk ./sdk
COPY --from=build /app/apps ./apps
USER node

# Which process runs is the caller's choice. A service: `node -e "import(...).then(m => m.main())"`
# (docker-compose.yaml). The web app: `node apps/web/node_modules/next/dist/bin/next start apps/web`,
# which listens on PORT (render.yaml).
CMD ["node", "-e", "console.error('set the command: see docker-compose.yaml'); process.exit(1)"]
