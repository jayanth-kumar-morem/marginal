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
RUN pnpm --filter @marginal/core-wasm --filter @marginal/service-common --filter @marginal/gateway \
         --filter @marginal/operator-agent --filter @marginal/compliance build

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime

WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/crates/marginal-core-wasm ./crates/marginal-core-wasm
COPY --from=build /src/services ./services
USER node

# Which service runs is the compose file's choice: `node -e "import(...).then(m => m.main())"`.
CMD ["node", "-e", "console.error('set the command: see docker-compose.yaml'); process.exit(1)"]
