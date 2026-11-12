import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonRpcProvider } from "near-api-js";
import { NEAR, TERA, accountExists } from "./chain.js";

test("units", () => {
  assert.equal(NEAR, 1_000_000_000_000_000_000_000_000n);
  assert.equal(TERA, 1_000_000_000_000n);
});

// "Does it exist?" is answered with a node in deploy.e2e.ts. Here: a dead node is an error, never "no".
test("an unreachable node is an error, not 'the account does not exist'", async () => {
  const dead = new JsonRpcProvider({ url: "http://127.0.0.1:9" }, { retries: 1 });
  await assert.rejects(accountExists(dead, "anyone.near"));
});
