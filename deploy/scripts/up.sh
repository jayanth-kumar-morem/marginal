#!/usr/bin/env bash
# One command deploys a profile: ./deploy/scripts/up.sh <sandbox|testnet-demo> [--once]
# Order: token -> clearing -> KeyPolicy -> seed room policy -> delete KeyPolicy keys -> write manifest.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
if [ -s "$HOME/.nvm/nvm.sh" ] && [ -f .nvmrc ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null && nvm use >/dev/null
fi
profile="${1:-}"
if [ ! -f "deploy/profiles/$profile.toml" ]; then
  echo "usage: up.sh <profile> [--once]   profiles: $(ls deploy/profiles | sed 's/\.toml$//' | tr '\n' ' ')" >&2
  exit 1
fi
if [ "$profile" != "sandbox" ]; then
  # Real networks get exactly the committed source: a reproducible build, every time.
  echo "reproducible contract build for $profile (make wasm)"
  make wasm
elif [ ! -f target/near/musdc/musdc.wasm ] || [ ! -f target/near/clearing/clearing.wasm ] || [ ! -f target/near/keypolicy/keypolicy.wasm ]; then
  echo "no contract wasm yet; dev build for the sandbox (make wasm-dev)"
  make wasm-dev
fi
exec pnpm --silent --filter @marginal/scripts exec tsx src/up.ts "$@"
