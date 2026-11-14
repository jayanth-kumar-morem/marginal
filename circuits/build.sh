#!/usr/bin/env bash
# Builds the pricing circuit and its keys (SDD §3.17; E10.1).
#
#   build.sh circuit    compiles the circuit and prints its constraint counts
#   build.sh ceremony   runs the trusted setup and writes the verifying key
#
# **This is a `dev` setup, and the label is not decoration.** §3.17 calls for phase 1 from the PSE
# perpetual powers of tau (`ppot_0080_13.ptau`) and a phase 2 with at least ten contributions,
# three of them external, finished with a beacon from a pre-announced NEAR block hash. What this
# script does instead is generate phase 1 locally and contribute once, from this machine. Anyone who
# held the toxic waste of either phase could forge a proof. That is acceptable only because every
# M1 deployment is labelled `Simulated`/`dev` on chain, and it must be redone for v1 (tasks.md E19).
#
# Phase 1 is local because Hermez's host for `ppot_0080_13.ptau` now answers 403 (2026-11-14) and
# PSE's own mirror is a torrent of the 2^28 file; see tasks.md SDD issue 37.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
snarkjs="$here/../node_modules/.bin/snarkjs"
build="$here/build"
ceremony="$here/ceremony"
name=formula_knowledge_v1
# 2^13 as §3.17 specifies, which is four times what the circuit needs: the keys stay valid if the
# circuit grows.
power=13

cmd_circuit() {
  mkdir -p "$build"
  circom "$here/$name.circom" --r1cs --wasm --sym -o "$build"
  "$snarkjs" r1cs info "$build/$name.r1cs"
}

cmd_ceremony() {
  mkdir -p "$build" "$ceremony"
  [ -f "$build/$name.r1cs" ] || cmd_circuit

  # Phase 1, locally. Deterministic entropy, because a `dev` setup that pretended otherwise would
  # be worse than one that says what it is.
  if [ ! -f "$ceremony/pot${power}_final.ptau" ]; then
    "$snarkjs" powersoftau new bn128 "$power" "$ceremony/pot${power}_0000.ptau" -v
    "$snarkjs" powersoftau contribute "$ceremony/pot${power}_0000.ptau" "$ceremony/pot${power}_0001.ptau" \
      --name="marginal dev phase 1" -e="marginal dev phase 1, not a ceremony"
    "$snarkjs" powersoftau prepare phase2 "$ceremony/pot${power}_0001.ptau" "$ceremony/pot${power}_final.ptau" -v
  fi

  # Phase 2: one contribution, labelled for what it is.
  "$snarkjs" groth16 setup "$build/$name.r1cs" "$ceremony/pot${power}_final.ptau" "$build/${name}_0000.zkey"
  "$snarkjs" zkey contribute "$build/${name}_0000.zkey" "$build/${name}.zkey" \
    --name="marginal dev phase 2" -e="marginal dev phase 2, not a ceremony"
  "$snarkjs" zkey export verificationkey "$build/${name}.zkey" "$build/${name}.vkey.json"

  # The verifying key is committed, because the contract has to hold it and anyone checking a proof
  # has to have the same one.
  cp "$build/${name}.vkey.json" "$here/${name}.vkey.json"
  # The proving key and the witness generator are committed too, and pinned here: the room reads
  # both through `readVerified`, so a swapped file is refused rather than used (DR-9).
  ( cd "$here" && shasum -a 256 \
      "${name}.vkey.json" \
      "build/${name}.zkey" \
      "build/${name}_js/${name}.wasm" > SHA256SUMS )
  echo "verifying key: $here/${name}.vkey.json"
  cat "$here/SHA256SUMS"
}

case "${1:-}" in
  circuit) cmd_circuit ;;
  ceremony) cmd_ceremony ;;
  *) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
