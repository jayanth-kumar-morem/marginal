import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitRevision, runUp, testnetDeployerKey, writeJson } from "./cli.js";
import { keysPath } from "./paths.js";
import { makeRoot, sandboxProfile, setPath, withEnv } from "./testing.js";

const testnetProfile = (extra: Record<string, unknown> = {}) => ({
  ...setPath(setPath(setPath(sandboxProfile(), "profile", "e2e"), "network", "testnet"), "rpc", ["http://127.0.0.1:9"]),
  ...extra,
});

test("the deployer key comes from the environment first", async () => {
  await withEnv("NEAR_DEPLOYER_KEY", "ed25519:fromenv", () => assert.equal(testnetDeployerKey("a.testnet"), "ed25519:fromenv"));
});

test("otherwise from the near-cli credentials file", async () => {
  const home = mkdtempSync(join(tmpdir(), "marginal-home-"));
  const creds = join(home, ".near-credentials", "testnet");
  mkdirSync(creds, { recursive: true });
  writeFileSync(join(creds, "a.testnet.json"), JSON.stringify({ private_key: "ed25519:fromfile" }));
  writeFileSync(join(creds, "b.testnet.json"), JSON.stringify({ public_key: "ed25519:only-public" }));
  await withEnv("NEAR_DEPLOYER_KEY", undefined, () =>
    withEnv("HOME", home, () => {
      assert.equal(testnetDeployerKey("a.testnet"), "ed25519:fromfile");
      assert.throws(() => testnetDeployerKey("b.testnet"), /b\.testnet\.json has no private_key/);
      assert.throws(() => testnetDeployerKey("c.testnet"), /no deployer key: set NEAR_DEPLOYER_KEY or create .*c\.testnet\.json/);
    }),
  );
});

test("writeJson sets the mode even when the file already exists", (t) => {
  const root = makeRoot(t, {});
  const file = join(root, "nested", "x.json");
  writeJson(file, { a: 1 }, 0o644);
  writeJson(file, { a: 2 }, 0o600);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { a: 2 });
});

test("gitRevision reports the commit and whether the tree is dirty", (t) => {
  const root = makeRoot(t, {});
  const clean = gitRevision(root);
  assert.match(clean.commit, /^[0-9a-f]{40}$/);
  assert.equal(clean.dirty, false);
  writeFileSync(join(root, "stray.txt"), "x");
  assert.deepEqual(gitRevision(root), { commit: clean.commit, dirty: true });
});

test("up needs a profile name", async () => {
  await assert.rejects(runUp([]), /usage: up\.sh <profile> \[--once\]/);
  await assert.rejects(runUp(["--once"]), /usage/);
});

test("a profile file must declare its own name", async (t) => {
  const root = makeRoot(t, { alias: sandboxProfile() });
  await assert.rejects(runUp(["alias"], { root }), /alias\.toml declares profile = "sandbox"/);
});

test("a non-sandbox deploy refuses a dirty git tree", async (t) => {
  const root = makeRoot(t, { e2e: testnetProfile() });
  writeFileSync(join(root, "stray.txt"), "x");
  await assert.rejects(runUp(["e2e"], { root }), /dirty git tree: commit first/);
});

test("a non-sandbox deploy never overwrites an existing keys file", async (t) => {
  const root = makeRoot(t, { e2e: testnetProfile() });
  writeJson(keysPath(root, "e2e"), { "gov.x": "ed25519:secret" }, 0o600);
  await assert.rejects(runUp(["e2e"], { root }), /e2e\.json exists; move it aside before a fresh deploy/);
});
