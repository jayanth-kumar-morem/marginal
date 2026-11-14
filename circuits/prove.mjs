// Produces a Sealed-mode proof for the pricing circuit (SDD §3.17; E10.1's vectors, E10.3's prover).
//
// It takes the private scores and the public job values on stdin as JSON and prints the commitment,
// the proof and the public signals. The room does the same thing through `@marginal/room`'s own
// prover; this is the one that generates the committed test vectors, so the two can be compared.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const input = JSON.parse(readFileSync(0, "utf8"));
const poseidon = await buildPoseidon();

const field = (value) => poseidon.F.toObject(value).toString();
const commitment = field(
  poseidon([input.jc_hi, input.jc_lo, input.c1, input.c2, input.l1, input.l2, input.salt]),
);

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { ...input, commitment },
  `${here}build/formula_knowledge_v1_js/formula_knowledge_v1.wasm`,
  `${here}build/formula_knowledge_v1.zkey`,
);
const vkey = JSON.parse(readFileSync(`${here}formula_knowledge_v1.vkey.json`, "utf8"));
const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
process.stdout.write(JSON.stringify({ commitment, proof, publicSignals, verified: ok }, null, 1));
// snarkjs leaves its worker threads running, so the process would never exit on its own.
process.exit(ok ? 0 : 1);
