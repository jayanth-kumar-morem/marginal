# The three host services, from one image (SDD §2.7; E11.1).
#
# One image rather than three, because they are the same TypeScript workspace and the difference is
# which entry point runs. This is **not** the room's image: nothing here is measured, nothing here
# is attested, and these services are untrusted by design — the room's Dockerfile
# (`room/image/Dockerfile`) is the one with pinned digests and a reproducible build, because that
# one is part of what a seller pins.

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
WORKDIR /src
COPY . .
RUN corepack enable && corepack install
RUN pnpm install --frozen-lockfile --ignore-scripts
# Every workspace package the three services import, which is what `grep -rh 'from "@marginal/'`
# over `services/*/src` reports: core-wasm, service-common, replay-ts (the gateway's `/v1/replay/:id`
# serves it, E12.2) and the three services themselves. A package missing here fails as
# `TS2307: Cannot find module`, because its `dist/` and its type declarations are never built.
RUN pnpm --filter @marginal/core-wasm --filter @marginal/service-common --filter @marginal/replay-ts \
         --filter @marginal/gateway --filter @marginal/operator-agent --filter @marginal/compliance build

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime

WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/crates/marginal-core-wasm ./crates/marginal-core-wasm
# `node_modules` holds symlinks into the workspace, so a package's real directory has to come too or
# the import fails at run time rather than at build time.
COPY --from=build /src/verifiers ./verifiers
COPY --from=build /src/services ./services
USER node

# Which service runs is the compose file's choice: `node -e "import(...).then(m => m.main())"`.
CMD ["node", "-e", "console.error('set the command: see docker-compose.yaml'); process.exit(1)"]
