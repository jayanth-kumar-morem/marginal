#!/usr/bin/env bash
# The three adversarial demonstrations of E14.3, against a chain `up.sh` already deployed:
#   ./deploy/scripts/demo.sh drc4  --listing <id> [--identities N] [--privacy open|sealed]
#   ./deploy/scripts/demo.sh drc5  --listing <id> [--snapshot false]
#   ./deploy/scripts/demo.sh drc11 --listing <id> | --job <id> [--wait false]
# It reads deploy/manifest.<profile>.json and deploy/.keys/<profile>.json (--profile, default
# sandbox) and deploys nothing. --rpc <url> overrides the manifest's endpoint, which a sandbox
# outlives: a fresh node picks a fresh port. Exit status 0 means the property held.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
if [ -s "$HOME/.nvm/nvm.sh" ] && [ -f .nvmrc ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null && nvm use >/dev/null
fi
case "${1:-}" in
  drc4 | drc5 | drc11) ;;
  *)
    echo "usage: demo.sh <drc4|drc5|drc11> [--profile <name>] [--rpc <url>] [flags]" >&2
    echo "  drc4  the Sybil probe (DRC-4): identities drain a listing's leakage budget to the wall" >&2
    echo "  drc5  the injected buyer agent (DRC-5): over-cap requests blocked, one parked for a human" >&2
    echo "  drc11 the room kill (DRC-11): past the deadline anyone refunds the buyer, to the unit" >&2
    exit 1
    ;;
esac
exec pnpm --silent --filter @marginal/scripts exec tsx src/demo-run.ts "$@"
