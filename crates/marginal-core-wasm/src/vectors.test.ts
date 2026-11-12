import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadVectors, reproduceVectors, type Vectors } from "./index.js";

test("the wasm build reproduces every vector in fixtures/vectors.json", () => {
  const vectors = loadVectors();
  assert.equal(vectors.format, 1);
  assert.ok(vectors.cases.length >= 40);
  assert.deepEqual(reproduceVectors(vectors), []);
  assert.deepEqual(reproduceVectors(), [], "the default is the committed file");
});

const answer = (v: Vectors, name: string) => {
  const found = v.cases.find((c) => c.name === name);
  assert.ok(found, name);
  return (found.expect as { ok: string }).ok;
};

// The hashes are checked here again with node's own SHA-256, independently of the Rust code.
test("hashes in the vectors are SHA-256 of the recorded bytes", () => {
  const v = loadVectors();
  const sha = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
  assert.equal(answer(v, "certificate: hash"), sha(answer(v, "certificate: encode")));
  assert.equal(answer(v, "delivery: hash (h_D)"), sha(answer(v, "delivery: encode")));
  const signing = answer(v, "verdict: signing bytes");
  assert.ok(signing.startsWith(Buffer.from("marginal/verdict/v1").toString("hex")), "the signing domain comes first");
  assert.equal(signing, Buffer.from("marginal/verdict/v1").toString("hex") + answer(v, "verdict: Open, with judge proofs"));
});

test("a vector that does not reproduce is reported by name", () => {
  const v = loadVectors();
  const broken: Vectors = { ...v, cases: v.cases.map((c, i) => (i === 0 ? { ...c, expect: { ok: "tampered" } } : c)) };
  const problems = reproduceVectors(broken);
  assert.equal(problems.length, 1);
  assert.match(problems[0] as string, /^judgement: the lowest factor wins: expected {"ok":"tampered"}, got {"ok":9000}$/);
});

test("a failure that is not a refusal from the core is not swallowed", () => {
  const unserialisable: Vectors = { format: 1, cases: [{ name: "x", op: "mbits", input: 1n, expect: { ok: 1 } }] };
  assert.throws(() => reproduceVectors(unserialisable), TypeError);
});
