import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseEncode } from "near-api-js";
import { loadVectors } from "@marginal/core-wasm";
import { issuerKey } from "@marginal/compliance";
import { NEAR } from "./chain.js";
import { assertCodeHash, balances, complianceKeyWarnings, deployAll, preparedVerifyingKey, requiredDeployerBalance, servicesEnv, verifyDeployment, type Manifest } from "./deploy.js";
import { loadProfile } from "./profile.js";
import { circuitsDir, profilePath, repoRoot } from "./paths.js";
import { SANDBOX_KEY } from "./testing.js";

test("the testnet deploy needs 19 NEAR in the deployer", () => {
  assert.equal(requiredDeployerBalance("testnet"), 19n * NEAR);
  assert.equal(requiredDeployerBalance("sandbox"), 86n * NEAR);
  const testnet = balances("testnet");
  // gov, faucet, token, clearing, keypolicy, agent.
  assert.deepEqual(Object.values(testnet).map((v) => v / NEAR), [1n, 1n, 3n, 8n, 4n, 1n]);
});

test("the code hash on chain must be the base58 of the wasm's SHA-256", () => {
  const sha = "ab".repeat(32);
  assertCodeHash("c.near", baseEncode(Buffer.from(sha, "hex")), sha);
  assert.throws(() => assertCodeHash("c.near", baseEncode(Buffer.from("cd".repeat(32), "hex")), sha), /c\.near: on-chain code hash .* != built wasm/);
});

const sandbox = () => loadProfile(profilePath(repoRoot, "sandbox"));

test("a deployment is verified from what the chain reports", () => {
  const ids = { gov: "gov.x", clearing: "clearing.x", keypolicy: "keypolicy.x" };
  const fees = sandbox().clearing.fees;
  const clearing = {
    gov: "gov.x",
    keypolicy: "keypolicy.x",
    chain_id: "sandbox",
    profile: sandbox().hdp as never,
    policy_version: 4,
    tokens: ["musdc.x"],
    fees,
  };
  const keypolicy = { registry: "clearing.x", clearing: "clearing.x", ckd_domain_id: 2 };
  const seeded = { writes: 4, fees, token: "musdc.x", escrowStorage: { total: "1250000000000000000000" } };
  verifyDeployment(ids, clearing, keypolicy, 0, seeded);
  assert.throws(() => verifyDeployment(ids, clearing, keypolicy, 1, seeded), /keypolicy has 1 access key\(s\); it must have none/);
  assert.throws(() => verifyDeployment(ids, { ...clearing, gov: "other.x" }, keypolicy, 0, seeded), /clearing\.gov mismatch/);
  assert.throws(() => verifyDeployment(ids, { ...clearing, keypolicy: "other.x" }, keypolicy, 0, seeded), /clearing\.keypolicy mismatch/);
  assert.throws(() => verifyDeployment(ids, clearing, { ...keypolicy, registry: "other.x" }, 0, seeded), /registry must equal clearing/);
  assert.throws(() => verifyDeployment(ids, clearing, { ...keypolicy, registry: "other.x", clearing: "other.x" }, 0, seeded), /registry must equal clearing/);
});

test("a deploy that was asked to seed and seeded nothing is refused, not shipped", () => {
  const ids = { gov: "gov.x", clearing: "clearing.x", keypolicy: "keypolicy.x" };
  const fees = sandbox().clearing.fees;
  const keypolicy = { registry: "clearing.x", clearing: "clearing.x", ckd_domain_id: 2 };
  const chain = { gov: "gov.x", keypolicy: "keypolicy.x", chain_id: "sandbox", profile: sandbox().hdp as never, policy_version: 6, tokens: ["musdc.x"], fees };
  const registered = { total: "1250000000000000000000" };
  const seeded = { writes: 6, fees, token: "musdc.x", escrowStorage: registered };
  // The seed step made six calls and the chain shows six policy writes: that is the good case.
  verifyDeployment(ids, chain, keypolicy, 0, seeded);
  // An escrow with no storage entry on the token: every deposit would be refused.
  assert.throws(
    () => verifyDeployment(ids, chain, keypolicy, 0, { ...seeded, escrowStorage: null }),
    /clearing\.x holds no storage entry on musdc\.x; every deposit into escrow would be refused/,
  );
  assert.throws(
    () => verifyDeployment(ids, { ...chain, policy_version: 0 }, keypolicy, 0, seeded),
    /6 policy calls were made but clearing's policy_version is 0; without an appraiser/,
  );
  // A settlement token that is not this deploy's own token: nothing could be listed in it.
  assert.throws(() => verifyDeployment(ids, { ...chain, tokens: [] }, keypolicy, 0, seeded), /settlement tokens are \[\]/);
  assert.throws(
    () => verifyDeployment(ids, { ...chain, tokens: ["other.x"] }, keypolicy, 0, seeded),
    /settlement tokens are \["other.x"\]; this deploy's token is musdc.x/,
  );
  // A fee table that is not the one the profile asked for, field by field.
  assert.throws(
    () => verifyDeployment(ids, { ...chain, fees: { ...fees, treasury_bps: 1 } }, keypolicy, 0, seeded),
    /clearing.fees.treasury_bps is 1 on chain, the profile says 6000/,
  );
});

test("simulated rooms are refused on any network but the sandbox, before a single byte is sent", async () => {
  const p = sandbox();
  const onTestnet = { ...p, network: "testnet" as const, profile: "pretend-testnet" };
  // The rpc URL is a closed port on purpose: reaching the network at all would be a failure.
  await assert.rejects(
    deployAll(onTestnet, { rpcUrl: "http://127.0.0.1:9", deployerKey: SANDBOX_KEY, wasmDir: "/nonexistent", circuitsDir: circuitsDir(repoRoot) }),
    /profile pretend-testnet asks for simulated rooms on testnet: simulated rooms must never reach testnet or mainnet/,
  );
});

/** A manifest's worth of deploy results, for the pure environment tests. */
const deployed = () =>
  ({
    rpc: ["http://127.0.0.1:3030"],
    chain_id: "sandbox",
    contracts: { clearing: { account: "clearing.sandbox" }, keypolicy: { account: "keypolicy.sandbox" } },
    agent: { account: "agent.sandbox" },
  }) as unknown as Manifest;

test("the host services' environment is everything the compose interpolates", () => {
  const { env, generated } = servicesEnv(sandbox(), deployed(), { "agent.sandbox": "ed25519:agentsecret" }, {}, () => "ab".repeat(32));
  // The compose file is the authority for this list: every `${…}` in it, and nothing else.
  const compose = readFileSync(join(repoRoot, "deploy", "services", "docker-compose.yaml"), "utf8");
  const wanted = [...compose.matchAll(/\$\{([A-Z_]+)[^}]*\}/g)].map((m) => m[1] as string);
  assert.deepEqual([...new Set(wanted)].sort(), Object.keys(env).sort(), "the file covers the compose, exactly");
  assert.equal(env["MARGINAL_RPC_URL"], "http://127.0.0.1:3030");
  assert.equal(env["MARGINAL_CHAIN_ID"], "sandbox");
  assert.equal(env["MARGINAL_CLEARING"], "clearing.sandbox");
  assert.equal(env["MARGINAL_KEYPOLICY"], "keypolicy.sandbox");
  assert.equal(env["MARGINAL_AGENT_ACCOUNT"], "agent.sandbox");
  assert.equal(env["MARGINAL_AGENT_KEY"], "ed25519:agentsecret");
  assert.equal(env["MARGINAL_ALLOWED_IDENTITIES"], "gov.sandbox,buyer.sandbox");
  assert.equal(env["MARGINAL_NEARAI_KEY"], "", "nobody has a NEAR AI key to keep");
  // The sandbox is the simulated profile, so the room's claim travels with the rest.
  assert.equal(env["MARGINAL_SIM_PPID"], sandbox().room_policy.platforms[0]?.ppid);
  assert.match(env["MARGINAL_SIM_MEASUREMENT"] as string, /^\{"mrtd":"deadbeef/);
  // Nothing was there to keep, so both seeds and the upload secret were made here.
  assert.deepEqual(generated, ["MARGINAL_ISSUER_SEED", "MARGINAL_COMPLIANCE_SEED"]);
  assert.equal(env["MARGINAL_UPLOAD_SECRET"], "ab".repeat(32));
  // A real profile claims nothing: the two sim values are written empty, not left out.
  const real = servicesEnv({ ...sandbox(), keypolicy: { ...sandbox().keypolicy, simulated_rooms: false } }, deployed(), {}, {}, () => "cd".repeat(32));
  assert.equal(real.env["MARGINAL_SIM_MEASUREMENT"], "");
  assert.equal(real.env["MARGINAL_SIM_PPID"], "");
});

test("a re-deploy keeps the compliance seeds and only the compliance seeds", () => {
  const was = {
    MARGINAL_ISSUER_SEED: "11".repeat(32),
    MARGINAL_COMPLIANCE_SEED: "22".repeat(32),
    MARGINAL_UPLOAD_SECRET: "33".repeat(32),
    MARGINAL_NEARAI_KEY: "sk-nearai-whatever",
  };
  const { env, generated } = servicesEnv(sandbox(), deployed(), {}, was, () => "ff".repeat(32));
  // The seeds are what clearing's committed issuer_key and compliance_key were derived from: fresh
  // ones would reject every credential the service signs.
  assert.equal(env["MARGINAL_ISSUER_SEED"], was.MARGINAL_ISSUER_SEED);
  assert.equal(env["MARGINAL_COMPLIANCE_SEED"], was.MARGINAL_COMPLIANCE_SEED);
  assert.deepEqual(generated, [], "nothing was generated");
  // The upload secret is an HMAC key for short-lived grants: a new one every deploy.
  assert.equal(env["MARGINAL_UPLOAD_SECRET"], "ff".repeat(32));
  // The operator's NEAR AI key is theirs, and it survives.
  assert.equal(env["MARGINAL_NEARAI_KEY"], was.MARGINAL_NEARAI_KEY);
  // A seed that is not 32 bytes of hex is not a seed: it is replaced and reported.
  const broken = servicesEnv(sandbox(), deployed(), {}, { ...was, MARGINAL_ISSUER_SEED: "nonsense" }, () => "ff".repeat(32));
  assert.deepEqual(broken.generated, ["MARGINAL_ISSUER_SEED"]);
  assert.equal(broken.env["MARGINAL_ISSUER_SEED"], "ff".repeat(32));
});

test("the compliance keys clearing was seeded with must be the ones the services will sign with", () => {
  const seeds = { MARGINAL_ISSUER_SEED: "11".repeat(32), MARGINAL_COMPLIANCE_SEED: "22".repeat(32) };
  const derived = (hex: string) => issuerKey(new Uint8Array(Buffer.from(hex, "hex"))).publicKey;
  const p = sandbox();
  // Matching: silence. This is the committed sandbox profile against its own seeds.
  const matching = { ...p, clearing: { ...p.clearing, issuer_key: derived(seeds.MARGINAL_ISSUER_SEED), compliance_key: derived(seeds.MARGINAL_COMPLIANCE_SEED) } };
  assert.deepEqual(complianceKeyWarnings(matching, seeds, "deploy/profiles/sandbox.toml"), []);
  // The committed profile against someone else's seeds: both keys are named, with what to paste.
  const lines = complianceKeyWarnings(p, seeds, "deploy/profiles/sandbox.toml");
  assert.equal(lines.length, 2);
  assert.match(lines[0] as string, new RegExp(`clearing.issuer_key is ${p.clearing.issuer_key} but the host services will sign with ${derived(seeds.MARGINAL_ISSUER_SEED)}`));
  assert.match(lines[0] as string, /set clearing.issuer_key = ".*" in deploy\/profiles\/sandbox.toml and deploy again/);
  assert.match(lines[1] as string, /clearing.compliance_key is [0-9a-f]{64} but the host services will sign with/);
  // A profile that carries no key at all says so rather than printing "null".
  const unset = { ...p, clearing: { ...p.clearing, issuer_key: null, compliance_key: null } };
  assert.match(complianceKeyWarnings(unset, seeds, "x.toml")[0] as string, /clearing.issuer_key is unset but the host services will sign with/);
  // Nothing in a warning is ever a seed.
  for (const line of [...lines, ...complianceKeyWarnings(unset, seeds, "x.toml")]) {
    assert.ok(!line.includes(seeds.MARGINAL_ISSUER_SEED) && !line.includes(seeds.MARGINAL_COMPLIANCE_SEED), line);
  }
});

test("the verifying key the deploy seeds is the committed artefact, prepared by marginal-core", () => {
  const vkey = preparedVerifyingKey(circuitsDir(repoRoot));
  assert.equal(vkey.file, "formula_knowledge_v1.vkey.json");
  // The same bytes the vectors pin: `fixtures/vectors.json`'s `groth16_vkey_prepare` case is
  // `fixtures/groth16-vectors.json`'s vkey, which is this very artefact.
  const pinned = loadVectors().cases.find((c) => c.op === "groth16_vkey_prepare" && c.name.includes("prepared for the host functions"));
  const expected = (pinned?.expect as { ok: string }).ok;
  assert.equal(vkey.key, Buffer.from(expected, "hex").toString("base64"));
  // And it is the file circuits/SHA256SUMS pins, byte for byte.
  const sums = readFileSync(join(circuitsDir(repoRoot), "SHA256SUMS"), "utf8");
  assert.ok(sums.includes(`${vkey.sha256}  formula_knowledge_v1.vkey.json`), sums);
});

test("a verifying key that is not the committed one is refused rather than deployed", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "marginal-vkey-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const real = join(circuitsDir(repoRoot), "formula_knowledge_v1.vkey.json");
  assert.throws(() => preparedVerifyingKey(dir), /missing .*formula_knowledge_v1\.vkey\.json: the circuit's verifying key is committed/);

  copyFileSync(real, join(dir, "formula_knowledge_v1.vkey.json"));
  writeFileSync(join(dir, "SHA256SUMS"), "abc  something-else.json\n");
  assert.throws(() => preparedVerifyingKey(dir), /SHA256SUMS does not pin formula_knowledge_v1\.vkey\.json/);

  // The pin is what makes the artefact trustworthy: a key that does not match it never ships.
  const good = preparedVerifyingKey(circuitsDir(repoRoot));
  writeFileSync(join(dir, "SHA256SUMS"), `${"00".repeat(32)}  formula_knowledge_v1.vkey.json\n`);
  assert.throws(() => preparedVerifyingKey(dir), new RegExp(`sha256 ${good.sha256} is not the committed 0{64}`));

  writeFileSync(join(dir, "SHA256SUMS"), `${good.sha256}  formula_knowledge_v1.vkey.json\n`);
  assert.equal(preparedVerifyingKey(dir).key, good.key);
});

test("a deploy with no built wasm fails before touching the network", async () => {
  const p = loadProfile(profilePath(repoRoot, "sandbox"));
  await assert.rejects(
    deployAll(p, { rpcUrl: "http://127.0.0.1:9", deployerKey: SANDBOX_KEY, wasmDir: "/nonexistent", circuitsDir: circuitsDir(repoRoot) }),
    /missing \/nonexistent\/musdc\/musdc\.wasm: build the contracts first \(make wasm\)/,
  );
});
