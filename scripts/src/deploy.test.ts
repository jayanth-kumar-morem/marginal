import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEncode } from "near-api-js";
import { NEAR } from "./chain.js";
import { assertCodeHash, balances, deployAll, requiredDeployerBalance, verifyDeployment } from "./deploy.js";
import { loadProfile } from "./profile.js";
import { profilePath, repoRoot } from "./paths.js";
import { SANDBOX_KEY } from "./testing.js";

test("the testnet deploy needs 16 NEAR in the deployer", () => {
  assert.equal(requiredDeployerBalance("testnet"), 16n * NEAR);
  assert.equal(requiredDeployerBalance("sandbox"), 81n * NEAR);
  const testnet = balances("testnet");
  assert.deepEqual(Object.values(testnet).map((v) => v / NEAR), [1n, 1n, 3n, 8n, 2n]);
});

test("the code hash on chain must be the base58 of the wasm's SHA-256", () => {
  const sha = "ab".repeat(32);
  assertCodeHash("c.near", baseEncode(Buffer.from(sha, "hex")), sha);
  assert.throws(() => assertCodeHash("c.near", baseEncode(Buffer.from("cd".repeat(32), "hex")), sha), /c\.near: on-chain code hash .* != built wasm/);
});

test("a deployment is verified from what the chain reports", () => {
  const ids = { gov: "gov.x", clearing: "clearing.x" };
  const clearing = { gov: "gov.x", profile: loadProfile(profilePath(repoRoot, "sandbox")).hdp as never };
  const keypolicy = { registry: "clearing.x", clearing: "clearing.x", ckd_domain_id: 2 };
  verifyDeployment(ids, clearing, keypolicy, 0);
  assert.throws(() => verifyDeployment(ids, clearing, keypolicy, 1), /keypolicy has 1 access key\(s\); it must have none/);
  assert.throws(() => verifyDeployment(ids, { ...clearing, gov: "other.x" }, keypolicy, 0), /clearing\.gov mismatch/);
  assert.throws(() => verifyDeployment(ids, clearing, { ...keypolicy, registry: "other.x" }, 0), /registry must equal clearing/);
  assert.throws(() => verifyDeployment(ids, clearing, { ...keypolicy, registry: "other.x", clearing: "other.x" }, 0), /registry must equal clearing/);
});

test("a deploy with no built wasm fails before touching the network", async () => {
  const p = loadProfile(profilePath(repoRoot, "sandbox"));
  await assert.rejects(
    deployAll(p, { rpcUrl: "http://127.0.0.1:9", deployerKey: SANDBOX_KEY, wasmDir: "/nonexistent" }),
    /missing \/nonexistent\/musdc\/musdc\.wasm: build the contracts first \(make wasm\)/,
  );
});
