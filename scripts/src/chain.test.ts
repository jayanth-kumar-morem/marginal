import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonRpcProvider } from "near-api-js";
import { NEAR, TERA, accountExists, borshBase64, errorCode } from "./chain.js";

test("units", () => {
  assert.equal(NEAR, 1_000_000_000_000_000_000_000_000n);
  assert.equal(TERA, 1_000_000_000_000n);
});

test("borshBase64 is marginal-core's own encoding, as base64", () => {
  // A BlobRef is 32 + 32 + 1 bytes, so its base64 is 88 characters with one pad.
  const blob = { uri_hash: "11".repeat(32), sha256: "22".repeat(32), size_class: 13 };
  const base64 = borshBase64("blob_ref_encode", blob);
  assert.equal(Buffer.from(base64, "base64").length, 65);
  assert.equal(Buffer.from(base64, "base64").subarray(0, 32).toString("hex"), "11".repeat(32));
  assert.equal(Buffer.from(base64, "base64")[64], 13);
  // The core refuses what it cannot encode, in its own codes.
  assert.throws(() => borshBase64("blob_ref_encode", { uri_hash: "zz" }), /E_DECODE/);
});

test("errorCode is the contract's own code, and everything else is left whole", () => {
  assert.equal(errorCode(new Error("Contract panicked: E_BUDGET_EXHAUSTED")), "E_BUDGET_EXHAUSTED");
  assert.equal(errorCode(new Error("Smart contract panicked: E_AGENT_CAP")), "E_AGENT_CAP");
  assert.equal(errorCode("E_JOB_STATE_INVALID"), "E_JOB_STATE_INVALID");
  assert.equal(errorCode(new Error("connect ECONNREFUSED")), "connect ECONNREFUSED");
});

// "Does it exist?" is answered with a node in deploy.e2e.ts. Here: a dead node is an error, never "no".
test("an unreachable node is an error, not 'the account does not exist'", async () => {
  const dead = new JsonRpcProvider({ url: "http://127.0.0.1:9" }, { retries: 1 });
  await assert.rejects(accountExists(dead, "anyone.near"));
});
