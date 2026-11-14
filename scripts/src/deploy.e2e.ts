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
import { call, loadVectors } from "@marginal/core-wasm";
import { NEAR, accountExists, view } from "./chain.js";
import { readEnv } from "./cli.js";
import { complianceKeyWarnings, deployAll, type Manifest } from "./deploy.js";
import { circuitsDir, keysPath, manifestPath, profilePath, repoRoot, servicesEnvPath, wasmDir } from "./paths.js";
import { loadProfile, simEnv } from "./profile.js";
import { SANDBOX_KEY, withSandbox } from "./testing.js";

const profile = () => loadProfile(profilePath(repoRoot, "sandbox"));
const wasm = wasmDir(repoRoot);
const circuits = circuitsDir(repoRoot);

const MILLINEAR = NEAR / 1000n;
/** `contracts/keypolicy/src/fees.rs`: NONCE_FEE and ATTESTATION_FEE. */
const NONCE_FEE = 2n * MILLINEAR;
const ATTESTATION_FEE = 10n * MILLINEAR;
/** `contracts/clearing/src/fees.rs`: LISTING_FEE. */
const LISTING_FEE = 30n * MILLINEAR;

/** Borsh of one of core's types, as the base64 the contracts take. */
const b64 = (op: string, value: unknown): string => Buffer.from(call(op, value) as string, "hex").toString("base64");

test("up.sh sandbox --once deploys everything and writes a correct manifest", () => {
  const manifestFile = manifestPath(repoRoot, "sandbox");
  // What the host services' environment holds now: the compliance seeds must survive a re-deploy.
  const before = readEnv(servicesEnvPath(repoRoot, "sandbox"));
  rmSync(manifestFile, { force: true });
  const r = spawnSync("bash", [join(repoRoot, "deploy", "scripts", "up.sh"), "sandbox", "--once"], { encoding: "utf8", timeout: 240_000 });
  assert.equal(r.status, 0, `up.sh failed:\n${r.stdout}\n${r.stderr}`);
  // Steps ran in the order the task lists them.
  const order = [
    "[1/6] deploying musdc",
    "[2/6] deploying clearing",
    "[3/6] deploying keypolicy",
    "[4/6] seeding policy as gov",
    "room policy:",
    "[5/6] reading keypolicy's access keys",
    "[6/6] verifying the deployment",
  ];
  let at = -1;
  for (const s of order) {
    const i = r.stdout.indexOf(s);
    assert.ok(i > at, `step "${s}" missing or out of order:\n${r.stdout}`);
    at = i;
  }

  const m = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  assert.equal(m.profile, "sandbox");
  assert.equal(m.manifest_version, 2);
  // The sandbox is the simulated profile, and the manifest says so where nobody can edit it out.
  assert.equal(m.attestation, "simulated");
  assert.ok(r.stdout.includes("SIMULATED ATTESTATION: deploying keypolicy-sim"), r.stdout);
  // What was seeded is recorded, so the agent and the app read it rather than being told twice.
  assert.deepEqual(m.room_policy, profile().room_policy);
  // The verifying key sealed verdicts need, named and hashed: clearing parsed these bytes itself.
  assert.deepEqual(m.verifying_key, { file: "formula_knowledge_v1.vkey.json", sha256: "8ab8e644d4376665c8394427e8c09265fb87936a3beed76a9eb22ccfd82cbf8a" });
  assert.equal(m.agent.account, `${profile().accounts.agent}.sandbox`);
  assert.equal(m.agent.key, "full");
  assert.ok(m.agent.public_key.startsWith("ed25519:"));
  assert.ok(m.agent.calls.keypolicy.includes("register_room_simulated"));
  assert.match(m.git?.commit ?? "", /^[0-9a-f]{40}$/, "manifest records the git commit");
  // The keys file holds exactly the keyed accounts, is private, and never includes KeyPolicy.
  assert.equal(statSync(keysPath(repoRoot, "sandbox")).mode & 0o777, 0o600);
  const keys = JSON.parse(readFileSync(keysPath(repoRoot, "sandbox"), "utf8")) as Record<string, string>;
  assert.deepEqual(Object.keys(keys).sort(), Object.keys(m.public_keys).sort());
  assert.ok(!(m.contracts.keypolicy.account in keys), "KeyPolicy never had a key");
  assert.equal(m.keypolicy_access_keys, 0);
  // The host services' whole environment, so the command the deploy prints is true: every `${…}`
  // the compose interpolates is in the file, it is private, and the two compliance seeds that were
  // there before this deploy are still there (fresh ones would reject every credential on chain).
  const envFile = servicesEnvPath(repoRoot, "sandbox");
  const env = readEnv(envFile);
  const compose = readFileSync(join(repoRoot, "deploy", "services", "docker-compose.yaml"), "utf8");
  const wanted = [...new Set([...compose.matchAll(/\$\{([A-Z_]+)[^}]*\}/g)].map((hit) => hit[1] as string))];
  assert.deepEqual(wanted.sort(), Object.keys(env).sort());
  assert.equal(statSync(envFile).mode & 0o777, 0o600, "it holds the agent's key and the seeds");
  assert.equal(env["MARGINAL_ISSUER_SEED"], before["MARGINAL_ISSUER_SEED"]);
  assert.equal(env["MARGINAL_COMPLIANCE_SEED"], before["MARGINAL_COMPLIANCE_SEED"]);
  assert.deepEqual({ MARGINAL_SIM_MEASUREMENT: env["MARGINAL_SIM_MEASUREMENT"], MARGINAL_SIM_PPID: env["MARGINAL_SIM_PPID"] }, simEnv(profile()));
  assert.equal(env["MARGINAL_AGENT_ACCOUNT"], m.agent.account);
  assert.equal(env["MARGINAL_AGENT_KEY"], keys[m.agent.account]);
  // Those are secrets: the deploy names the file and prints nothing out of it.
  for (const secret of [env["MARGINAL_AGENT_KEY"], env["MARGINAL_ISSUER_SEED"], env["MARGINAL_COMPLIANCE_SEED"], env["MARGINAL_UPLOAD_SECRET"]]) {
    assert.ok(!r.stdout.includes(secret as string), "a secret reached the log");
  }
  // The committed profile's keys are the ones the services will sign with, so nothing to warn about.
  assert.deepEqual(complianceKeyWarnings(profile(), env, "deploy/profiles/sandbox.toml"), []);
  for (const c of Object.values(m.contracts)) {
    assert.equal(c.code_hash, baseEncode(Buffer.from(c.wasm_sha256, "hex")), `${c.account} code hash`);
  }
  // The deployed wasm is the one on disk — and for KeyPolicy that is `keypolicy-sim`'s build, whose
  // directory is named for the feature and whose file inside is still keypolicy.wasm.
  for (const [name, c] of Object.entries(m.contracts)) {
    const dir = name === "keypolicy" ? "keypolicy-sim" : name;
    const disk = createHash("sha256").update(readFileSync(join(wasm, dir, `${name}.wasm`))).digest("hex");
    assert.equal(c.wasm_sha256, disk, `${name} wasm on disk`);
  }
  // …and it is not the real KeyPolicy's, which is what makes `attestation` honest.
  const real = createHash("sha256").update(readFileSync(join(wasm, "keypolicy", "keypolicy.wasm"))).digest("hex");
  assert.notEqual(m.contracts.keypolicy.wasm_sha256, real, "keypolicy-sim differs from the deployable KeyPolicy");
  // Secrets never reach the manifest.
  assert.ok(Object.values(m.public_keys).every((k) => k.startsWith("ed25519:")));
  assert.ok(!/secret|private/i.test(JSON.stringify(m)));
});

test("deployed state: profile values, KeyPolicy immutability, token wiring", async () => {
  const p = profile();
  await withSandbox(async (sandbox) => {
    const ctx = { rpcUrl: sandbox.rpcUrl, deployerKey: SANDBOX_KEY, wasmDir: wasm, circuitsDir: circuits };
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

/**
 * The seed step, read back off the chain it wrote to. Nothing here is mocked: the registry really
 * refuses an unapproved room (`E_PLATFORM_NOT_ADMITTED`, `E_MEASUREMENT_NOT_APPROVED`) and
 * `create_listing` really refuses a listing whose appraiser is not registered, so a room that
 * registers and a listing that is created are proof that both halves landed.
 */
test("the seeded chain can admit a room, create a listing and take a buyer's deposit", async () => {
  const p = profile();
  const set = p.room_policy.measurement_sets[0];
  const platform = p.room_policy.platforms[0];
  assert.ok(set && platform, "the sandbox profile seeds a set and a platform");
  await withSandbox(async (sandbox) => {
    const { manifest, keys } = await deployAll(p, { rpcUrl: sandbox.rpcUrl, deployerKey: SANDBOX_KEY, wasmDir: wasm, circuitsDir: circuits });
    const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
    const clearingId = manifest.contracts.clearing.account;

    // Every seeded call bumped policy_version: one appraiser, the fee table, the set, the platform.
    const config = await view<{ policy_version: number; fees: Record<string, number> }>(provider, clearingId, "config");
    // One appraiser, the fee table, the verifying key, the issuer key, the compliance key, the
    // measurement set, the platform: every gov call the profile asked for, and no more.
    assert.equal(config.policy_version, 7);
    assert.equal(config.fees["treasury_bps"], p.clearing.fees.treasury_bps);

    // The agent registers the room, which is the only account the demo gives that job to.
    const agent = new Account(manifest.agent.account, provider, keys[manifest.agent.account] as KeyPairString);
    const keypolicyId = manifest.contracts.keypolicy.account;
    const nonce = await agent.callFunction<string>({ contractId: keypolicyId, methodName: "issue_nonce", args: {}, deposit: NONCE_FEE });
    const roomKey = "7a".repeat(32);
    await agent.callFunction({
      contractId: keypolicyId,
      methodName: "register_room_simulated",
      args: {
        request: b64("sim_room_encode", {
          sign_pk: roomKey,
          box_pk: "0b".repeat(32),
          nonce,
          class: "Kcpu",
          measurement: set.members[0],
          ppid_hash: call("ppid_hash", { ppid: platform.ppid }) as string,
        }),
      },
      deposit: ATTESTATION_FEE,
      gas: 100n * 10n ** 12n,
      waitUntil: "FINAL",
    });
    // The registry admitted it against the approved set: that is the seed step, read back.
    const room = await view<{ measurement_set: string; mode: string }>(provider, clearingId, "get_room", { room_key: roomKey });
    assert.equal(room.measurement_set, set.id);
    assert.equal(room.mode, "Simulated");
    assert.deepEqual(await view<string[]>(provider, clearingId, "eligible", { class: "Kcpu" }), [roomKey]);

    // A listing needs the appraiser, the token, the rule and the asset class the seed step set.
    const spec = loadVectors().cases.find((c) => c.op === "listing_spec_encode")?.input as Record<string, unknown>;
    assert.ok(spec, "the vectors carry a listing spec");
    const gov = new Account(manifest.accounts.gov, provider, keys[manifest.accounts.gov] as KeyPairString);
    const listingId = await gov.callFunction<string>({
      contractId: clearingId,
      methodName: "create_listing",
      args: { spec: b64("listing_spec_encode", { ...spec, token: manifest.contracts.musdc.account }) },
      deposit: LISTING_FEE,
      gas: 100n * 10n ** 12n,
      waitUntil: "FINAL",
    });
    const listing = await view<{ appraiser: string; token: string }>(provider, clearingId, "get_listing", { listing_id: listingId });
    assert.equal(listing.appraiser, "knowledge@1");
    assert.equal(listing.token, manifest.contracts.musdc.account);

    // A buyer's first deposit. NEP-141 refuses a transfer to an account with no storage entry on
    // the token, and clearing is the escrow, so without the seed step's `storage_deposit` this is
    // where a fresh chain dies: "The account clearing.sandbox is not registered".
    const tokenId = manifest.contracts.musdc.account;
    const buyerKey = KeyPair.fromRandom("ed25519");
    await new Account("sandbox", provider, SANDBOX_KEY).createAccount({
      newAccountId: "buyer.sandbox",
      publicKey: buyerKey.getPublicKey().toString(),
      nearToTransfer: 5n * NEAR,
    });
    const buyer = new Account("buyer.sandbox", provider, buyerKey.toString() as KeyPairString);
    const faucet = new Account(manifest.accounts.faucet, provider, keys[manifest.accounts.faucet] as KeyPairString);
    // `mint` registers whoever it mints to, which is why only clearing needs the deploy's help.
    await faucet.callFunction({ contractId: tokenId, methodName: "mint", args: { account_id: "buyer.sandbox", amount: "5000000" }, waitUntil: "FINAL" });
    await buyer.callFunction({
      contractId: tokenId,
      methodName: "ft_transfer_call",
      args: { receiver_id: clearingId, amount: "4000000", msg: JSON.stringify({ Deposit: { account: "buyer.sandbox" } }) },
      deposit: 1n,
      gas: 100n * 10n ** 12n,
      waitUntil: "FINAL",
    });
    // The balance, not the receipt: `ft_on_transfer` refunds the whole amount when it does not like
    // the token or the message, and a refund is a successful transaction that credited nothing.
    assert.equal(await view<string>(provider, clearingId, "get_balance", { account: "buyer.sandbox", token: tokenId }), "4000000");
    assert.equal(await view<string>(provider, tokenId, "ft_balance_of", { account_id: "buyer.sandbox" }), "1000000");
  });
});
