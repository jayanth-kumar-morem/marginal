// The `up` command end to end: the testnet code path (against a local node standing in for testnet),
// the sandbox's wait-for-Ctrl-C, and the two entry points. Needs built wasm: `make wasm-dev`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runUp } from "./cli.js";
import type { Manifest } from "./deploy.js";
import { keysPath, manifestPath, repoRoot } from "./paths.js";
import { SANDBOX_KEY, makeRoot, sandboxProfile, setPath, withEnv, withSandbox } from "./testing.js";

const scriptsDir = join(repoRoot, "scripts");
const upSh = join(repoRoot, "deploy", "scripts", "up.sh");

/** The testnet profile's shape (network = "testnet", an rpc list) pointed at a local node. */
const testnetLike = (rpc: string) =>
  setPath(setPath(setPath(setPath(sandboxProfile(), "profile", "e2e"), "network", "testnet"), "rpc", [rpc]), "accounts.deployer", "sandbox");

test("a testnet-network deploy: key from the environment, clean tree, keys saved, no second run", async (t) => {
  await withSandbox(async (sandbox) => {
    const root = makeRoot(t, { e2e: testnetLike(sandbox.rpcUrl) });
    const lines: string[] = [];
    await withEnv("NEAR_DEPLOYER_KEY", SANDBOX_KEY, () => runUp(["e2e"], { root, log: (l) => lines.push(l) }));

    assert.ok(lines.some((l) => l.includes("profile e2e on testnet")));
    assert.ok(!lines.some((l) => l.includes("sandbox node at")), "no node of its own was started");
    const manifest = JSON.parse(readFileSync(manifestPath(root, "e2e"), "utf8")) as Manifest;
    assert.equal(manifest.network, "testnet");
    assert.equal(manifest.rpc[0], sandbox.rpcUrl);
    assert.equal(manifest.git?.dirty, false, "deployed from a clean tree");
    assert.equal(manifest.keypolicy_access_keys, 0);
    assert.equal(statSync(keysPath(root, "e2e")).mode & 0o777, 0o600);

    await withEnv("NEAR_DEPLOYER_KEY", SANDBOX_KEY, () =>
      assert.rejects(runUp(["e2e"], { root }), /e2e\.json exists; move it aside before a fresh deploy/),
    );
  });
});

test("a sandbox deploy without --once keeps running until Ctrl-C, then stops cleanly", async (t) => {
  const root = makeRoot(t, { sandbox: sandboxProfile() });
  const lines: string[] = [];
  const stopped = runUp(["sandbox"], {
    root,
    log: (line) => {
      lines.push(line);
      if (line.includes("Ctrl-C")) setImmediate(() => process.emit("SIGINT"));
    },
  });
  await stopped;
  assert.ok(lines.some((l) => l.includes("sandbox is running at")));
  assert.ok(existsSync(manifestPath(root, "sandbox")));
});

test("up.sh refuses an unknown profile at once, before any build", () => {
  const r = spawnSync("bash", [upSh, "nope"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: up\.sh <profile> \[--once\]\s+profiles: .*sandbox/);
  assert.equal(spawnSync("bash", [upSh], { encoding: "utf8", timeout: 30_000 }).status, 1);
});

test("the entry point prints the error and exits 1", () => {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/up.ts"], { cwd: scriptsDir, encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: up\.sh <profile> \[--once\]/);
  assert.equal(r.stdout, "");
});
