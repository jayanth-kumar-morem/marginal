import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fullAccounts, loadProfile, validateProfile } from "./profile.js";
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
  ["room policy that is not a list", (r) => setPath(r, "room_policy.platforms", "x"), /must be lists/],
];

for (const [name, mutate, message] of rejected) {
  test(`rejects ${name}`, () => assert.throws(() => validateProfile(mutate(sandboxProfile())), message));
}

test("sub-account ids are qualified with the deployer", () => {
  const a = fullAccounts(loadProfile(profilePath(repoRoot, "sandbox")));
  assert.equal(a.token, "musdc.sandbox");
  assert.equal(a.keypolicy, "keypolicy.sandbox");
});
