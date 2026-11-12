// End-to-end check of E1.3 against a real local node. Needs built wasm: `make wasm-dev` (or `make wasm`).
// Run with `pnpm --filter @marginal/scripts test:e2e`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, baseEncode } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { NEAR, accountExists, view } from "./chain.js";
import { deployAll, type Manifest } from "./deploy.js";
import { keysPath, manifestPath, profilePath, repoRoot, wasmDir } from "./paths.js";
import { loadProfile } from "./profile.js";
import { SANDBOX_KEY, withSandbox } from "./testing.js";

const profile = () => loadProfile(profilePath(repoRoot, "sandbox"));
const wasm = wasmDir(repoRoot);

test("up.sh sandbox --once deploys everything and writes a correct manifest", () => {
  const manifestFile = manifestPath(repoRoot, "sandbox");
  rmSync(manifestFile, { force: true });
  const r = spawnSync("bash", [join(repoRoot, "deploy", "scripts", "up.sh"), "sandbox", "--once"], { encoding: "utf8", timeout: 240_000 });
  assert.equal(r.status, 0, `up.sh failed:\n${r.stdout}\n${r.stderr}`);
  // Steps ran in the order the task lists them.
  const order = ["deploying musdc", "deploying clearing", "deploying keypolicy", "seeding room policy", "reading keypolicy's access keys", "verifying the deployment"];
  let at = -1;
  for (const s of order) {
    const i = r.stdout.indexOf(s);
    assert.ok(i > at, `step "${s}" missing or out of order:\n${r.stdout}`);
    at = i;
  }

  const m = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  assert.equal(m.profile, "sandbox");
  assert.match(m.git?.commit ?? "", /^[0-9a-f]{40}$/, "manifest records the git commit");
  // The keys file holds exactly the keyed accounts, is private, and never includes KeyPolicy.
  assert.equal(statSync(keysPath(repoRoot, "sandbox")).mode & 0o777, 0o600);
  const keys = JSON.parse(readFileSync(keysPath(repoRoot, "sandbox"), "utf8")) as Record<string, string>;
  assert.deepEqual(Object.keys(keys).sort(), Object.keys(m.public_keys).sort());
  assert.ok(!(m.contracts.keypolicy.account in keys), "KeyPolicy never had a key");
  assert.equal(m.keypolicy_access_keys, 0);
  for (const c of Object.values(m.contracts)) {
    assert.equal(c.code_hash, baseEncode(Buffer.from(c.wasm_sha256, "hex")), `${c.account} code hash`);
  }
  // The deployed wasm is the one on disk.
  for (const [name, c] of Object.entries(m.contracts)) {
    const disk = createHash("sha256").update(readFileSync(join(wasm, name, `${name}.wasm`))).digest("hex");
    assert.equal(c.wasm_sha256, disk, `${name} wasm on disk`);
  }
  // Secrets never reach the manifest.
  assert.ok(Object.values(m.public_keys).every((k) => k.startsWith("ed25519:")));
  assert.ok(!/secret|private/i.test(JSON.stringify(m)));
});

test("deployed state: profile values, KeyPolicy immutability, token wiring", async () => {
  const p = profile();
  await withSandbox(async (sandbox) => {
    const ctx = { rpcUrl: sandbox.rpcUrl, deployerKey: SANDBOX_KEY, wasmDir: wasm };
    const saved: Record<string, string>[] = [];
    const { manifest, keys } = await deployAll(p, { ...ctx, saveKeys: (k) => saved.push(k) });
    // Keys are saved after every keyed account, not only at the end.
    assert.equal(saved.length, Object.keys(keys).length);
    assert.deepEqual(saved.at(-1), keys);

    const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
    const clearing = await view<{ gov: string; tokens: string[]; profile: Record<string, unknown> }>(provider, manifest.contracts.clearing.account, "config");
    assert.equal(clearing.gov, manifest.accounts.gov);
    assert.deepEqual(clearing.tokens, [manifest.contracts.musdc.account]);
    assert.equal(clearing.profile["cooling_blocks"], 0);
    assert.equal(clearing.profile["challenge_window_secs"], 600);
    assert.deepEqual(clearing.profile["rules_enabled"], ["R1"]);
    assert.deepEqual(clearing.profile["asset_classes_enabled"], ["Knowledge", "Dataset"]);
    assert.equal(clearing.profile["gov_profile"], "demo");

    const kp = await view<{ registry: string; clearing: string; ckd_domain_id: number }>(provider, manifest.contracts.keypolicy.account, "config");
    assert.equal(kp.registry, manifest.contracts.clearing.account, "registry = clearing");
    assert.equal(kp.ckd_domain_id, 2);
    assert.equal((await new Account(manifest.contracts.keypolicy.account, provider).getAccessKeyList()).keys.length, 0, "KeyPolicy has no access keys");

    const meta = await view<{ decimals: number }>(provider, manifest.contracts.musdc.account, "ft_metadata");
    assert.equal(meta.decimals, 6);
    assert.equal(await view<string>(provider, manifest.contracts.musdc.account, "faucet"), manifest.accounts.faucet);

    // Init ran in the creating transaction, so nobody can call `new` again.
    const gov = new Account(manifest.accounts.gov, provider, keys[manifest.accounts.gov] as KeyPairString);
    const again = { chain_id: "x", registry: "x.sandbox", clearing: "x.sandbox", mpc: "x.sandbox", ckd_domain_id: 0, dcap_verifier: "x.sandbox" };
    await assert.rejects(
      gov.callFunction({ contractId: manifest.contracts.keypolicy.account, methodName: "new", args: again }),
      /already initialized|state already exists|The contract has already been initialized/i,
    );

    // An underfunded deployer is refused before any account is created.
    const poorKey = KeyPair.fromRandom("ed25519");
    await new Account("sandbox", provider, SANDBOX_KEY).createAccount({ newAccountId: "poor.sandbox", publicKey: poorKey.getPublicKey().toString(), nearToTransfer: 2n * NEAR });
    const poor = { ...p, accounts: { ...p.accounts, deployer: "poor.sandbox" } };
    await assert.rejects(deployAll(poor, { ...ctx, deployerKey: poorKey.toString() as KeyPairString }), /needs .* NEAR\. Top it up first/);
    assert.equal(await accountExists(provider, "gov.poor.sandbox"), false, "nothing was created");

    // A second run into the same chain must refuse rather than overwrite.
    await assert.rejects(deployAll(p, ctx), /already exists/);
  });
});

test("a profile that lists room-policy entries is refused until clearing has the module (E4.3)", async () => {
  const p = { ...profile(), room_policy: { platforms: ["ppid-1"], measurement_sets: [] } };
  await withSandbox((sandbox) =>
    assert.rejects(deployAll(p, { rpcUrl: sandbox.rpcUrl, deployerKey: SANDBOX_KEY, wasmDir: wasm }), /profile lists 1 room-policy entries but clearing has no room-policy module yet/),
  );
});
