import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { call } from "@marginal/core-wasm";
import { buildPoseidon } from "circomlibjs";
import { groth16, wtns } from "snarkjs";

import { readVerified } from "./measured.js";
import {
  CIRCUIT_DIR,
  postedAsk,
  SEALED_FORMULA,
  closeProver,
  fieldDecimal,
  judgeInputs,
  limbs,
  proveSealed,
} from "./prove.js";

// `groth16.verify` takes the pool out again, so the file puts it back when it is done.
after(closeProver);

/** The job the committed fixtures were proved for, so the two provers can be compared. */
const JOB = {
  jobCommitment: "62f7e87dc29e6c5bf157a3a90a2acc0d40c6bc5fc15525abbcff30c8e6b0f4ff",
  budget: "500000000",
  ask: "400000000",
  lFloorBps: 1000,
} as const;

const vectors = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/groth16-vectors.json", import.meta.url)), "utf8"),
) as {
  sealed: Record<string, { commitment: string; publicSignals: string[]; inputs: Record<string, string> }>;
};

const vkey = JSON.parse(
  readVerified(CIRCUIT_DIR, "formula_knowledge_v1.vkey.json").toString("utf8"),
) as unknown;

const witnessWasm = readVerified(CIRCUIT_DIR, "build/formula_knowledge_v1_js/formula_knowledge_v1.wasm");

/**
 * The room's prover and the committed fixture, from the same inputs. The proof bytes differ every
 * run — Groth16 proving is randomised — so what is compared is the commitment and the public
 * signals, and the proof is checked against the verifying key the contract holds.
 */
test("the prover agrees with the fixture the contract is tested against", async () => {
  for (const [name, scores] of [
    ["deal", { components: [9000, 10_000], factors: [10_000, 10_000] }],
    ["nodeal", { components: [8000, 10_000], factors: [9000, 10_000] }],
  ] as const) {
    const expected = vectors.sealed[name];
    assert.ok(expected);
    const salt = expected.inputs.salt as string;
    const body = await proveSealed(JOB, scores, salt);
    assert.equal(body.outcome, expected.inputs.outcome === "1" ? "Deal" : "NoDeal", name);
    assert.equal(body.price, expected.inputs.price, name);
    // The commitment the contract reads: the same field element, little-endian.
    assert.equal(
      body.commitment,
      call("groth16_inputs_encode", { signals: [expected.commitment] }),
      name,
    );
    // And the proof really proves those public inputs.
    const signals = [...expected.publicSignals];
    assert.ok(
      await groth16.verify(vkey, signals, decodeProof(body.proof)),
      `${name}: the proof verifies`,
    );
  }
});

/** The proof the room submits, back in the shape snarkjs verifies. */
function decodeProof(hex: string): unknown {
  const words = hex.match(/.{64}/g) as string[];
  const field = (index: number): string => fieldDecimal(words[index] as string);
  return {
    pi_a: [field(0), field(1), "1"],
    pi_b: [
      [field(2), field(3)],
      [field(4), field(5)],
      ["1", "0"],
    ],
    pi_c: [field(6), field(7), "1"],
    protocol: "groth16",
    curve: "bn128",
  };
}

test("a judge that did not run leaves the ceiling alone", () => {
  assert.deepEqual(judgeInputs([]), [10_000, 10_000]);
  assert.deepEqual(judgeInputs([7000]), [7000, 10_000]);
  assert.deepEqual(judgeInputs([7000, 8000]), [7000, 8000]);
  assert.throws(() => judgeInputs([1, 2, 3]), /at most two/);
});

test("only R1 has a verifying key, so only R1 can be proved", () => {
  assert.equal(postedAsk({ Posted: { ask: "7" } }), "7");
  for (const rule of [null, undefined, {}, { Posted: {} }, { ValueIndexed: { p_min: "1" } }]) {
    assert.throws(() => postedAsk(rule), /sealed mode is built for R1/);
  }
});

test("a field element reads the same forwards as the contract reads it backwards", () => {
  assert.equal(fieldDecimal("01" + "00".repeat(31)), "1");
  assert.equal(fieldDecimal("0100"), "1");
  assert.equal(fieldDecimal("ff00"), "255");
  assert.equal(fieldDecimal("0001"), "256");
});

test("the prover takes two components and nothing else", async () => {
  await assert.rejects(
    () => proveSealed(JOB, { components: [1], factors: [] }),
    /two components/,
  );
});

/**
 * E10.1's **Done:** line. The circuit's witness generator checks every `===` constraint, so a
 * witness it accepts is one the circuit agrees with. Each case is priced by `marginal-core` and the
 * answer handed to the circuit: 10³ cases, and then the same cases with the price moved by one,
 * which must fail.
 */
test("the circuit agrees with core on 10^3 vectors, and refuses a wrong one", async () => {
  const poseidon = await buildPoseidon();
  // A small xorshift, so the cases are the same on every machine and in every run.
  let state = 0x9e3779b9;
  const next = (bound: number): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.abs(state) % bound;
  };
  const budget = "500000000";
  let deals = 0;
  for (let round = 0; round < 1000; round += 1) {
    const c1 = next(10_001);
    const c2 = next(10_001);
    const factors = [next(10_001), next(10_001)];
    const lFloor = next(10_001);
    const ask = String(next(500_000_001));
    const m = call("measured_index", {
      formula: SEALED_FORMULA,
      components: [c1, c2],
      params: { delta_star_bps: 0 },
      l_floor: lFloor,
      factors,
    }) as number;
    const priced = call("apply_rule", { rule: { Posted: { ask } }, budget, m }) as
      | "NoDeal"
      | { Deal: { price: string } };
    const deal = priced !== "NoDeal";
    if (deal) deals += 1;
    const { jc_hi: jcHi, jc_lo: jcLo } = limbs(JOB.jobCommitment);
    const salt = String(round);
    const [l1, l2] = judgeInputs(factors);
    const input = {
      jc_hi: jcHi,
      jc_lo: jcLo,
      budget,
      ask,
      l_floor: String(lFloor),
      outcome: deal ? "1" : "0",
      price: deal ? priced.Deal.price : "0",
      commitment: poseidon.F.toObject(
        poseidon([jcHi, jcLo, c1, c2, l1, l2, salt]),
      ).toString(),
      c1: String(c1),
      c2: String(c2),
      l1: String(l1),
      l2: String(l2),
      salt,
    };
    await wtns.calculate(input, witnessWasm, { type: "mem" });
    // The same case with the other outcome: the circuit must refuse it.
    await assert.rejects(
      () => wtns.calculate({ ...input, outcome: deal ? "0" : "1" }, witnessWasm, { type: "mem" }),
      `round ${round}: the circuit accepted the wrong outcome`,
    );
  }
  // The cases are worth having only if both branches are in them.
  assert.ok(deals > 50 && deals < 950, `${deals} deals in 1000`);
});
