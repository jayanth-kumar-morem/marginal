#!/usr/bin/env bash
# The room's reproducible build (SDD §3.13, E7.3).
#
# Two steps, because they are verified differently:
#
#   build.sh image                 builds the container image from the committed tree and prints
#                                  its digest.
#   build.sh compose --image REF   assembles docker-compose.yaml and app-compose.json from the
#                                  committed templates and the deployment pins, and prints the
#                                  compose hash and the app id.
#
# The compose step needs nothing but node and the committed files, so anyone can reproduce the
# compose hash from a git tag and the pins recorded in MEASUREMENTS.md — which is what DRC-3 asks
# for. It is also what KeyPolicy checks: dstack hashes app-compose.json's bytes
# (`dstack-util/src/system_setup.rs`, `sha256_file(app_compose_file)`) and measures the first 20
# bytes as the app id, and the room's registration is refused unless the two agree (§3.13 step 7).
#
# The output is written to out/, which is not committed.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_SUMS="room/models/all-MiniLM-L6-v2/SHA256SUMS"
repo="$(cd "$here/../.." && pwd)"
out="$here/out"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

require_clean_tree() {
  if [ -n "$(cd "$repo" && git status --porcelain)" ]; then
    echo "build.sh: the tree is dirty; the image is built from 'git archive HEAD'" >&2
    exit 1
  fi
}

cmd_image() {
  require_clean_tree
  local commit epoch ctx
  commit="$(cd "$repo" && git rev-parse HEAD)"
  epoch="$(cd "$repo" && git log -1 --pretty=%ct)"
  ctx="$out/context"
  rm -rf "$ctx" && mkdir -p "$ctx"
  # Only committed files, so nothing uncommitted and no key material can reach the image.
  (cd "$repo" && git archive --format=tar HEAD) | tar -x -C "$ctx"
  # ... plus the two generated things the image needs: the wasm build of marginal-core, and the
  # embedder's weights, which are fetched and checked against their committed SHA-256s.
  make -C "$repo" wasm-core models >&2
  cp "$repo/crates/marginal-core-wasm/core.wasm" "$ctx/crates/marginal-core-wasm/core.wasm"
  mkdir -p "$ctx/room/models/all-MiniLM-L6-v2/onnx"
  (cd "$repo/room/models/all-MiniLM-L6-v2" && tar -cf - .) | tar -xf - -C "$ctx/room/models/all-MiniLM-L6-v2"

  SOURCE_DATE_EPOCH="$epoch" docker buildx build \
    --platform linux/amd64 \
    --provenance=false \
    --sbom=false \
    --file "$here/Dockerfile" \
    --metadata-file "$out/image-metadata.json" \
    --output "type=oci,dest=$out/room-image.tar,rewrite-timestamp=true,name=marginal-room:$commit" \
    "$ctx" >&2

  echo "core_wasm_sha256=$(shasum -a 256 "$repo/crates/marginal-core-wasm/core.wasm" | cut -d' ' -f1)"
  echo "models_sha256=$(shasum -a 256 "$repo/$MODEL_SUMS" | cut -d' ' -f1)"
  echo "commit=$commit"
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`image_digest=${m["containerimage.digest"]}`)' \
    "$out/image-metadata.json"
}

cmd_compose() {
  local image="" rpc="" operator="" clearing="" keypolicy="" mpc="" chain="testnet"
  while [ $# -gt 0 ]; do
    case "$1" in
      --image) image="${2:-}"; shift 2 ;;
      --rpc-url) rpc="${2:-}"; shift 2 ;;
      --operator-url) operator="${2:-}"; shift 2 ;;
      --clearing) clearing="${2:-}"; shift 2 ;;
      --keypolicy) keypolicy="${2:-}"; shift 2 ;;
      --mpc-public-key) mpc="${2:-}"; shift 2 ;;
      --chain-id) chain="${2:-}"; shift 2 ;;
      *) echo "build.sh: unknown argument $1" >&2; usage ;;
    esac
  done
  for pair in image:"$image" rpc-url:"$rpc" operator-url:"$operator" clearing:"$clearing" keypolicy:"$keypolicy" mpc-public-key:"$mpc" chain-id:"$chain"; do
    if [ -z "${pair#*:}" ]; then
      echo "build.sh: --${pair%%:*} is required" >&2
      exit 1
    fi
  done
  mkdir -p "$out"
  IMAGE_DIR="$here" OUT_DIR="$out" ROOM_IMAGE="$image" RPC_URL="$rpc" OPERATOR_URL="$operator" \
    CLEARING="$clearing" KEYPOLICY="$keypolicy" CHAIN_ID="$chain" MPC_PUBLIC_KEY="$mpc" \
    node --input-type=module - <<'JS'
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.IMAGE_DIR;
const out = process.env.OUT_DIR;
const pins = {
  ROOM_IMAGE: process.env.ROOM_IMAGE,
  RPC_URL: process.env.RPC_URL,
  OPERATOR_URL: process.env.OPERATOR_URL,
  CHAIN_ID: process.env.CHAIN_ID,
  CLEARING: process.env.CLEARING,
  KEYPOLICY: process.env.KEYPOLICY,
  MPC_PUBLIC_KEY: process.env.MPC_PUBLIC_KEY,
};

let compose = readFileSync(join(dir, "docker-compose.tmpl.yaml"), "utf8");
for (const [name, value] of Object.entries(pins)) compose = compose.split(`@@${name}@@`).join(value);
const left = compose.match(/@@[A-Z_]+@@/);
if (left) throw new Error(`docker-compose.tmpl.yaml still has ${left[0]}`);
if (/[\r\t]/.test(compose)) throw new Error("docker-compose.tmpl.yaml must not contain tabs or CR");

const template = JSON.parse(readFileSync(join(dir, "app-compose.json"), "utf8"));
if (template.docker_compose_file !== "") throw new Error("app-compose.json's docker_compose_file must be the empty placeholder");
for (const forbidden of ["init_script", "event_log_version", "pre_launch_script"]) {
  if (forbidden in template) throw new Error(`app-compose.json must not set ${forbidden} (§3.13)`);
}
if (template.no_instance_id !== true) throw new Error("app-compose.json must set no_instance_id (§3.13)");

// dstack hashes the file's bytes, and its SDKs predict the hash from recursively key-sorted,
// compact JSON. Writing the canonical form makes both answers the same number.
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;
const appCompose = JSON.stringify(canonical({ ...template, docker_compose_file: compose }));

writeFileSync(join(out, "docker-compose.yaml"), compose);
writeFileSync(join(out, "app-compose.json"), appCompose);
const hash = createHash("sha256").update(Buffer.from(appCompose, "utf8")).digest("hex");
process.stdout.write(`compose_hash=${hash}\napp_id=${hash.slice(0, 40)}\n`);
JS
}

case "${1:-}" in
  image) shift; cmd_image "$@" ;;
  compose) shift; cmd_compose "$@" ;;
  -h|--help) usage 0 ;;
  *) usage ;;
esac
