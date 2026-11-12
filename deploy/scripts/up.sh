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
if [ ! -f target/near/musdc/musdc.wasm ] || [ ! -f target/near/clearing/clearing.wasm ] || [ ! -f target/near/keypolicy/keypolicy.wasm ]; then
  echo "building contracts first (make wasm)"
  make wasm
fi
exec pnpm --silent --filter @marginal/scripts exec tsx src/up.ts "$@"
