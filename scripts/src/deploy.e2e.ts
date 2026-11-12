// End-to-end check of E1.3: one command deploys a fresh sandbox, and the result matches the task's definition of done.
// Needs built wasm: `make wasm`. Run with `pnpm --filter @marginal/scripts test:e2e`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { Account, JsonRpcProvider, baseEncode } from "near-api-js";
import { Sandbox, DEFAULT_PRIVATE_KEY } from "near-sandbox";
import type { KeyPairString } from "near-api-js";
import { deployAll, type Manifest } from "./deploy.js";
import { loadProfile } from "./profile.js";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const profile = () => loadProfile(join(root, "deploy", "profiles", "sandbox.toml"));
const wasmDir = join(root, "target", "near");

test("up.sh sandbox --once deploys everything and writes a correct manifest", () => {
  const manifestPath = join(root, "deploy", "manifest.sandbox.json");
  rmSync(manifestPath, { force: true });
  const r = spawnSync("bash", [join(root, "deploy", "scripts", "up.sh"), "sandbox", "--once"], { encoding: "utf8", timeout: 240_000 });
  assert.equal(r.status, 0, `up.sh failed:\n${r.stdout}\n${r.stderr}`);
  // Steps ran in the order the task lists them.
  const order = ["deploying musdc", "deploying clearing", "deploying keypolicy", "seeding room policy", "deleting every access key", "building the manifest"];
  let at = -1;
  for (const s of order) {
    const i = r.stdout.indexOf(s);
    assert.ok(i > at, `step "${s}" missing or out of order:\n${r.stdout}`);
    at = i;
  }

  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  assert.equal(m.profile, "sandbox");
  assert.equal(m.keypolicy_access_keys, 0);
  for (const c of Object.values(m.contracts)) {
    assert.equal(c.code_hash, baseEncode(Buffer.from(c.wasm_sha256, "hex")), `${c.account} code hash`);
  }
  // The deployed wasm is the one on disk.
  for (const [name, c] of Object.entries(m.contracts)) {
    const crate = name;
    const disk = createHash("sha256").update(readFileSync(join(wasmDir, crate, `${crate}.wasm`))).digest("hex");
    assert.equal(c.wasm_sha256, disk, `${name} wasm on disk`);
  }
  // Secrets never reach the manifest.
  assert.ok(!JSON.stringify(m).includes("ed25519:") || Object.values(m.public_keys).every((k) => k.startsWith("ed25519:")));
  assert.ok(!/secret|private/i.test(JSON.stringify(m)));
});

test("deployed state: profile values, KeyPolicy immutability, token wiring", async () => {
  const p = profile();
  const sandbox = await Sandbox.start({});
  try {
    const { manifest } = await deployAll(p, { rpcUrl: sandbox.rpcUrl, deployerKey: DEFAULT_PRIVATE_KEY as KeyPairString, wasmDir });
    const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
    const view = <T>(c: string, method: string, args: Record<string, unknown> = {}) => provider.callFunction<T>({ contractId: c, method, args }) as Promise<T>;

    const clearing = await view<{ gov: string; tokens: string[]; profile: Record<string, unknown> }>(manifest.contracts.clearing.account, "config");
    assert.equal(clearing.gov, manifest.accounts.gov);
    assert.deepEqual(clearing.tokens, [manifest.contracts.musdc.account]);
    assert.equal(clearing.profile["cooling_blocks"], 0);
    assert.equal(clearing.profile["challenge_window_secs"], 600);
    assert.deepEqual(clearing.profile["rules_enabled"], ["R1"]);
    assert.deepEqual(clearing.profile["asset_classes_enabled"], ["Knowledge", "Dataset"]);
    assert.equal(clearing.profile["gov_profile"], "demo");

    const kp = await view<{ registry: string; clearing: string; ckd_domain_id: number }>(manifest.contracts.keypolicy.account, "config");
    assert.equal(kp.registry, manifest.contracts.clearing.account, "registry = clearing");
    assert.equal(kp.ckd_domain_id, 2);
    const keys = await new Account(manifest.contracts.keypolicy.account, provider).getAccessKeyList();
    assert.equal(keys.keys.length, 0, "KeyPolicy has no access keys");

    const meta = await view<{ decimals: number }>(manifest.contracts.musdc.account, "ft_metadata");
    assert.equal(meta.decimals, 6);
    assert.equal(await view<string>(manifest.contracts.musdc.account, "faucet"), manifest.accounts.faucet);

    // A second run into the same chain must refuse rather than overwrite.
    await assert.rejects(deployAll(p, { rpcUrl: sandbox.rpcUrl, deployerKey: DEFAULT_PRIVATE_KEY as KeyPairString, wasmDir }), /already exists/);
  } finally {
    await sandbox.tearDown();
  }
});
