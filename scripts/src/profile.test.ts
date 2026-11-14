import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fullAccounts, loadProfile, simEnv, validateProfile } from "./profile.js";
import { profilePath, repoRoot } from "./paths.js";
import { sandboxProfile, setPath } from "./testing.js";

const dir = join(repoRoot, "deploy", "profiles");
const files = readdirSync(dir).filter((f) => f.endsWith(".toml"));

test("every committed profile validates", () => {
  assert.ok(files.length >= 2);
  for (const f of files) loadProfile(join(dir, f));
});

test("HDP values from tasks.md E1.3 hold in every profile", () => {
  for (const f of files) {
    const p = loadProfile(join(dir, f));
    assert.equal(p.hdp.cooling_blocks, 0, f);
    assert.equal(p.hdp.challenge_window_secs, 600, f);
    assert.deepEqual(p.hdp.rules_enabled, ["R1"], f);
    assert.deepEqual(p.hdp.asset_classes_enabled, ["Knowledge", "Dataset"], f);
    assert.equal(p.hdp.gov_profile, "demo", f);
    assert.equal(p.keypolicy.ckd_domain_id, 2, f);
  }
});

const rejected: [string, (raw: Record<string, unknown>) => unknown, RegExp][] = [
  ["a profile that is not a table", () => "text", /profile must be a table/],
  ["a section that is not a table", (r) => setPath(r, "accounts", []), /accounts must be a table/],
  ["an empty name", (r) => setPath(r, "profile", ""), /profile.profile must be a non-empty string/],
  ["a name that is not a string", (r) => setPath(r, "chain_id", 7), /profile.chain_id must be a non-empty string/],
  ["an unknown network", (r) => setPath(r, "network", "mainnet"), /network must be sandbox or testnet, got mainnet/],
  ["a negative integer", (r) => setPath(r, "hdp.cooling_blocks", -1), /cooling_blocks must be a non-negative integer/],
  ["a fractional integer", (r) => setPath(r, "hdp.cooling_blocks", 1.5), /cooling_blocks must be a non-negative integer/],
  ["a zero challenge window", (r) => setPath(r, "hdp.challenge_window_secs", 0), /must be positive/],
  ["an unknown rule", (r) => setPath(r, "hdp.rules_enabled", ["R9"]), /unknown value R9/],
  ["rules that are not a list", (r) => setPath(r, "hdp.rules_enabled", "R1"), /rules_enabled must be a non-empty list/],
  ["no rules", (r) => setPath(r, "hdp.rules_enabled", []), /rules_enabled must be a non-empty list/],
  ["a testnet profile without rpc", (r) => setPath(r, "network", "testnet"), /at least one endpoint/],
  ["rpc that is not a list", (r) => setPath(r, "rpc", "http://x"), /rpc must be a list of http\(s\) URLs/],
  ["rpc that is not a URL", (r) => setPath(r, "rpc", ["not a url"]), /http\(s\) URLs/],
  ["a bad MPC account id", (r) => setPath(r, "keypolicy.mpc", "Not A Valid Account"), /not a valid NEAR account id/],
  ["a one-character deployer", (r) => setPath(r, "accounts.deployer", "a"), /not a valid NEAR account id/],
  ["an over-long deployer", (r) => setPath(r, "accounts.deployer", "a".repeat(65)), /not a valid NEAR account id/],
  ["a dotted sub-account name", (r) => setPath(r, "accounts.gov", "a.b"), /single account-id segment/],
  ["duplicate sub-account names", (r) => setPath(r, "accounts.faucet", "gov"), /must all differ/],
  ["an over-long sub-account", (r) => setPath(r, "accounts.clearing", "c".repeat(60)), /longer than 64/],
  ["room policy that is not a list", (r) => setPath(r, "room_policy.platforms", "x"), /room_policy.platforms must be a list/],
  // Simulated rooms: the one rule this profile section exists for.
  ["simulated rooms on a testnet profile", (r) => setPath(setPath(r, "network", "testnet"), "rpc", ["https://x.example"]), /simulated rooms must never reach testnet or mainnet/],
  ["simulated rooms with no measurement set", (r) => setPath(r, "room_policy.measurement_sets", []), /simulated_rooms needs one room_policy.measurement_sets entry/],
  ["simulated rooms with no platform", (r) => setPath(r, "room_policy.platforms", []), /simulated_rooms needs one room_policy.measurement_sets entry/],
  ["simulated_rooms that is not a boolean", (r) => setPath(r, "keypolicy.simulated_rooms", "yes"), /keypolicy.simulated_rooms must be true or false/],
  // Platforms. A PPID is exactly 16 bytes (SDD §3.13): Phala's published list has an empty entry.
  ["a 15-byte PPID", (r) => setPath(r, "room_policy.platforms.0.ppid", "aa".repeat(15)), /ppid must be 32 lower-case hex characters \(16 bytes\)/],
  ["a 17-byte PPID", (r) => setPath(r, "room_policy.platforms.0.ppid", "aa".repeat(17)), /ppid must be 32 lower-case hex characters \(16 bytes\)/],
  ["an upper-case PPID", (r) => setPath(r, "room_policy.platforms.0.ppid", "AA".repeat(16)), /ppid must be 32 lower-case hex characters/],
  ["a PPID that is not hex", (r) => setPath(r, "room_policy.platforms.0.ppid", "zz".repeat(16)), /ppid must be 32 lower-case hex characters/],
  ["a platform operator that is not an account", (r) => setPath(r, "room_policy.platforms.0.operator", "Not An Account"), /operator is not a valid NEAR account id/],
  ["a cap that is not a decimal string", (r) => setPath(r, "room_policy.platforms.0.cap_per_epoch", 1000), /cap_per_epoch must be a decimal amount in a string/],
  ["a cap with a leading zero", (r) => setPath(r, "room_policy.platforms.0.cap_per_epoch", "0100"), /cap_per_epoch must be a decimal amount in a string/],
  ["a cap that does not fit in u128", (r) => setPath(r, "room_policy.platforms.0.cap_per_epoch", (2n ** 128n).toString()), /cap_per_epoch does not fit in u128/],
  ["a platform that is not a table", (r) => setPath(r, "room_policy.platforms", ["x"]), /room_policy.platforms\[0\] must be a table/],
  // Measurement sets.
  ["an empty measurement-set id", (r) => setPath(r, "room_policy.measurement_sets.0.id", ""), /measurement_sets\[0\].id must be a non-empty string/],
  ["a source tag that is not a string", (r) => setPath(r, "room_policy.measurement_sets.0.source_tag", 7), /source_tag must be a string/],
  ["a set with no members", (r) => setPath(r, "room_policy.measurement_sets.0.members", []), /members must list at least one measurement/],
  ["members that are not a list", (r) => setPath(r, "room_policy.measurement_sets.0.members", "x"), /members must be a list/],
  ["a 94-character mrtd", (r) => setPath(r, "room_policy.measurement_sets.0.members.0.mrtd", "ab".repeat(47)), /mrtd must be 96 lower-case hex characters \(48 bytes\)/],
  ["a 98-character rtmr0", (r) => setPath(r, "room_policy.measurement_sets.0.members.0.rtmr0", "ab".repeat(49)), /rtmr0 must be 96 lower-case hex characters/],
  ["a 48-byte compose hash", (r) => setPath(r, "room_policy.measurement_sets.0.members.0.compose_hash", "ab".repeat(48)), /compose_hash must be 64 lower-case hex characters/],
  ["a short key-provider digest", (r) => setPath(r, "room_policy.measurement_sets.0.members.0.key_provider_digest", "ab".repeat(32)), /key_provider_digest must be 96 lower-case hex/],
  ["a GPU policy hash that is not a string", (r) => setPath(r, "room_policy.measurement_sets.0.members.0.gpu_policy_hash", 0), /gpu_policy_hash must be a string \(""/],
  ["a short GPU policy hash", (r) => setPath(r, "room_policy.measurement_sets.0.members.0.gpu_policy_hash", "ab"), /gpu_policy_hash must be 64 lower-case hex/],
  // Clearing's policy: without it the chain cannot list or settle anything.
  ["no appraisers", (r) => setPath(r, "clearing.appraisers", []), /clearing.appraisers must list at least one appraiser/],
  ["an unknown formula", (r) => setPath(r, "clearing.appraisers.0.formula", "KnowledgeV2"), /formula is not a marginal-core formula: KnowledgeV2/],
  ["an empty appraiser id", (r) => setPath(r, "clearing.appraisers.0.id", ""), /appraisers\[0\].id must be a non-empty string/],
  ["an appraiser with no enabled flag", (r) => setPath(r, "clearing.appraisers.0.enabled", "true"), /enabled must be true or false/],
  ["a compute fee that is not an amount", (r) => setPath(r, "clearing.appraisers.0.compute_fee", 1), /compute_fee must be a decimal amount in a string/],
  ["fee shares that do not add up", (r) => setPath(r, "clearing.fees.treasury_bps", 5999), /must add up to 10000, got 9999/],
  ["a clearing fee over 100%", (r) => setPath(r, "clearing.fees.clearing_fee_buyer_bps", 10001), /a clearing fee over 100% \(10000 bps\)/],
  ["a missing fee table", (r) => setPath(r, "clearing.fees", undefined), /clearing.fees must be a table/],
  ["an issuer key of the wrong length", (r) => setPath(r, "clearing.issuer_key", "ab"), /issuer_key must be 64 lower-case hex characters/],
  ["a compliance key that is not hex", (r) => setPath(r, "clearing.compliance_key", "zz".repeat(32)), /compliance_key must be 64 lower-case hex/],
  ["an AI signer with a zero TTL", (r) => setPath(r, "clearing.ai_signer", { address: "ab".repeat(20), model: "m", ttl_secs: 0 }), /ai_signer.ttl_secs must be positive/],
  ["an AI signer with a 32-byte address", (r) => setPath(r, "clearing.ai_signer", { address: "ab".repeat(32), model: "m", ttl_secs: 10 }), /address must be 40 lower-case hex characters \(20 bytes\)/],
  ["an AI signer with no model", (r) => setPath(r, "clearing.ai_signer", { address: "ab".repeat(20), model: "", ttl_secs: 10 }), /ai_signer.model must be a non-empty string/],
  ["a missing clearing section", (r) => setPath(r, "clearing", undefined), /clearing must be a table/],
  // The host services' only decision: who may be issued a credential.
  ["a services section that is not a table", (r) => setPath(r, "services", 7), /services must be a table/],
  ["allowed identities that are not a list", (r) => setPath(r, "services.allowed_identities", "buyer.sandbox"), /services.allowed_identities must be a list/],
  ["an allowed identity that is not an account", (r) => setPath(r, "services.allowed_identities", ["Not An Account"]), /allowed_identities\[0\].id is not a valid NEAR account id/],
];

for (const [name, mutate, message] of rejected) {
  test(`rejects ${name}`, () => assert.throws(() => validateProfile(mutate(sandboxProfile())), message));
}

test("sub-account ids are qualified with the deployer", () => {
  const a = fullAccounts(loadProfile(profilePath(repoRoot, "sandbox")));
  assert.equal(a.token, "musdc.sandbox");
  assert.equal(a.keypolicy, "keypolicy.sandbox");
  assert.equal(a.agent, "agent.sandbox");
});

test("only the sandbox profile runs simulated rooms, and it is the only one with room policy", () => {
  const sandbox = loadProfile(profilePath(repoRoot, "sandbox"));
  assert.equal(sandbox.keypolicy.simulated_rooms, true);
  assert.equal(sandbox.room_policy.measurement_sets.length, 1);
  assert.equal(sandbox.room_policy.platforms.length, 1);
  // Obviously fake, and a CPU room: `gpu_policy_hash = ""` is null in core's JSON model.
  assert.equal(sandbox.room_policy.measurement_sets[0]?.members[0]?.gpu_policy_hash, null);
  assert.equal(sandbox.room_policy.platforms[0]?.ppid.length, 32);

  const testnet = loadProfile(profilePath(repoRoot, "testnet-demo"));
  assert.equal(testnet.keypolicy.simulated_rooms, false);
  assert.deepEqual(testnet.room_policy, { platforms: [], measurement_sets: [] });
});

test("every profile registers the knowledge appraiser and a fee split that adds up", () => {
  for (const f of files) {
    const p = loadProfile(join(dir, f));
    assert.deepEqual(
      p.clearing.appraisers,
      [{ id: "knowledge", version: 1, formula: "KnowledgeV1", compute_fee: "1000000", enabled: true }],
      f,
    );
    // Sealed verdicts are a demo surface on both profiles, and the artefact is committed.
    assert.equal(p.clearing.sealed_verdicts, true, f);
    const fees = p.clearing.fees;
    assert.equal(fees.treasury_bps + fees.operator_pool_bps + fees.assurance_pool_bps, 10_000, f);
    // Both keys are the compliance service's own public keys, 32 bytes of hex each; the seeds that
    // produce them live in the gitignored `deploy/services/.env.<profile>`.
    assert.match(p.clearing.issuer_key ?? "", /^[0-9a-f]{64}$/, f);
    assert.match(p.clearing.compliance_key ?? "", /^[0-9a-f]{64}$/, f);
    // Nobody has a NEAR AI key yet ([P-2]), so no profile registers a signer.
    assert.equal(p.clearing.ai_signer, null, f);
  }
});

test("the optional clearing keys are read when they are there, and an empty string is still none", () => {
  const raw = sandboxProfile();
  const key = "ab".repeat(32);
  const withKeys = setPath(setPath(setPath(raw, "clearing.issuer_key", key), "clearing.compliance_key", key), "clearing.ai_signer", {
    address: "cd".repeat(20),
    model: "Qwen/Qwen3.8-27B",
    ttl_secs: 3600,
  });
  const p = validateProfile(withKeys);
  assert.equal(p.clearing.issuer_key, key);
  assert.equal(p.clearing.compliance_key, key);
  assert.deepEqual(p.clearing.ai_signer, { address: "cd".repeat(20), model: "Qwen/Qwen3.8-27B", ttl_secs: 3600 });
  assert.equal(validateProfile(setPath(raw, "clearing.issuer_key", "")).clearing.issuer_key, null);
});

test("a GPU room's policy hash is kept as hex, a CPU room's is null", () => {
  const gpu = "ef".repeat(32);
  const p = validateProfile(setPath(sandboxProfile(), "room_policy.measurement_sets.0.members.0.gpu_policy_hash", gpu));
  assert.equal(p.room_policy.measurement_sets[0]?.members[0]?.gpu_policy_hash, gpu);
});

test("the services section is optional, and the sandbox lists who may be issued a credential", () => {
  assert.deepEqual(loadProfile(profilePath(repoRoot, "sandbox")).services.allowed_identities, ["gov.sandbox", "buyer.sandbox"]);
  assert.deepEqual(loadProfile(profilePath(repoRoot, "testnet-demo")).services.allowed_identities, []);
  // A deployment that runs no host services needs no section at all.
  const raw = sandboxProfile();
  delete raw["services"];
  assert.deepEqual(validateProfile(raw).services, { allowed_identities: [] });
});

test("simEnv gives the host services exactly what a simulated room may claim", () => {
  const p = loadProfile(profilePath(repoRoot, "sandbox"));
  const env = simEnv(p);
  assert.equal(env["MARGINAL_SIM_PPID"], p.room_policy.platforms[0]?.ppid);
  // The agent parses it as a `Measurement`, so it must be the JSON model: hex fields and a null GPU hash.
  assert.deepEqual(JSON.parse(env["MARGINAL_SIM_MEASUREMENT"] as string), p.room_policy.measurement_sets[0]?.members[0]);
  // Nothing at all on a real profile: a simulated claim must not be reachable there.
  assert.deepEqual(simEnv(loadProfile(profilePath(repoRoot, "testnet-demo"))), {});
});
