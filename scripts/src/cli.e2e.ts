// The `up` command end to end: the testnet code path (against a local node standing in for testnet),
// the sandbox's wait-for-Ctrl-C, and the two entry points. Needs built wasm: `make wasm-dev`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { issuerKey } from "@marginal/compliance";
import { readEnv, runUp, writeEnv } from "./cli.js";
import type { Manifest } from "./deploy.js";
import { keysPath, manifestPath, repoRoot, servicesEnvPath } from "./paths.js";
import { SANDBOX_KEY, makeRoot, sandboxProfile, setPath, withEnv, withSandbox } from "./testing.js";

const scriptsDir = join(repoRoot, "scripts");
const upSh = join(repoRoot, "deploy", "scripts", "up.sh");

/**
 * The testnet profile's shape (network = "testnet", an rpc list) pointed at a local node: the real
 * KeyPolicy, no room policy (a real one is pasted in by hand, never committed), and the optional
 * gov keys set, so the deploy's non-sandbox paths all run against a real node.
 */
const testnetLike = (rpc: string) => {
  const edits: [string, unknown][] = [
    ["profile", "e2e"],
    ["network", "testnet"],
    ["rpc", [rpc]],
    ["accounts.deployer", "sandbox"],
    ["keypolicy.simulated_rooms", false],
    ["room_policy.platforms", []],
    ["room_policy.measurement_sets", []],
    ["clearing.sealed_verdicts", false],
    ["clearing.issuer_key", ""],
    ["clearing.compliance_key", ""],
    ["clearing.ai_signer", { address: "33".repeat(20), model: "test/model", ttl_secs: 3600 }],
  ];
  return edits.reduce((p, [path, value]) => setPath(p, path, value), sandboxProfile());
};

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
    // A real network gets the real KeyPolicy, and the manifest says so.
    assert.equal(manifest.attestation, "real");
    assert.ok(lines.some((l) => l.includes("the real keypolicy")), lines.join("\n"));
    // A profile with no room policy says plainly that no room can register on it yet.
    assert.ok(lines.some((l) => l.includes("no room can register until gov approves both")), lines.join("\n"));
    assert.deepEqual(manifest.room_policy, { measurement_sets: [], platforms: [] });
    // Sealed verdicts turned off: no key was seeded, and the deploy says what that costs.
    assert.equal(manifest.verifying_key, null);
    assert.ok(lines.some((l) => l.includes("E_PROOF_DISABLED")), lines.join("\n"));
    // A profile with no compliance keys says plainly what cannot be verified until gov sets them.
    const config = manifest.config.clearing as { issuer_key: string | null; compliance_key: string | null };
    assert.equal(config.issuer_key, null);
    assert.equal(config.compliance_key, null);
    assert.ok(lines.some((l) => l.includes("no clearing.issuer_key in the profile")), lines.join("\n"));
    assert.ok(lines.some((l) => l.includes("no clearing.compliance_key in the profile")), lines.join("\n"));

    // The host services' environment was written for this deploy: fresh seeds, because there was no
    // file to keep them from, and a loud line saying the profile's keys now have to match them.
    const envFile = servicesEnvPath(root, "e2e");
    assert.equal(statSync(envFile).mode & 0o777, 0o600, "it holds the agent's key");
    const env = readEnv(envFile);
    assert.equal(env["MARGINAL_AGENT_ACCOUNT"], manifest.agent.account);
    assert.equal(env["MARGINAL_AGENT_KEY"], JSON.parse(readFileSync(keysPath(root, "e2e"), "utf8"))[manifest.agent.account]);
    assert.equal(env["MARGINAL_CLEARING"], manifest.contracts.clearing.account);
    assert.equal(env["MARGINAL_RPC_URL"], manifest.rpc[0]);
    assert.match(env["MARGINAL_UPLOAD_SECRET"] as string, /^[0-9a-f]{64}$/);
    assert.ok(lines.some((l) => l.includes("generated a fresh MARGINAL_ISSUER_SEED and MARGINAL_COMPLIANCE_SEED")), lines.join("\n"));
    const derived = (hex: string) => issuerKey(new Uint8Array(Buffer.from(hex, "hex"))).publicKey;
    assert.ok(
      lines.some((l) => l.includes(`set clearing.issuer_key = "${derived(env["MARGINAL_ISSUER_SEED"] as string)}"`)),
      lines.join("\n"),
    );
    // A secret never goes to the log, whatever else does.
    for (const line of lines) assert.ok(!line.includes(env["MARGINAL_AGENT_KEY"] as string) && !line.includes(env["MARGINAL_ISSUER_SEED"] as string), line);
    assert.equal(statSync(keysPath(root, "e2e")).mode & 0o777, 0o600);

    await withEnv("NEAR_DEPLOYER_KEY", SANDBOX_KEY, () =>
      assert.rejects(runUp(["e2e"], { root }), /e2e\.json exists; move it aside before a fresh deploy/),
    );
  });
});

test("a sandbox deploy without --once keeps running until Ctrl-C, then stops cleanly", async (t) => {
  const root = makeRoot(t, { sandbox: sandboxProfile() });
  // Seeds that are already on disk are what clearing's committed keys were derived from, so a
  // re-deploy must leave them exactly as they are.
  const envFile = servicesEnvPath(root, "sandbox");
  const seeds = { MARGINAL_ISSUER_SEED: "7a".repeat(32), MARGINAL_COMPLIANCE_SEED: "7b".repeat(32), MARGINAL_NEARAI_KEY: "sk-kept" };
  writeEnv(envFile, seeds, 0o600);
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
  const env = readEnv(envFile);
  assert.equal(env["MARGINAL_ISSUER_SEED"], seeds.MARGINAL_ISSUER_SEED, "the seeds survived the deploy");
  assert.equal(env["MARGINAL_COMPLIANCE_SEED"], seeds.MARGINAL_COMPLIANCE_SEED);
  assert.equal(env["MARGINAL_NEARAI_KEY"], "sk-kept", "and so did the operator's own key");
  assert.ok(!lines.some((l) => l.includes("generated a fresh")), "nothing was generated");
  // These seeds are not the committed profile's, so the deploy says which keys to put in it.
  assert.ok(lines.some((l) => l.includes("but the host services will sign with")), lines.join("\n"));
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
