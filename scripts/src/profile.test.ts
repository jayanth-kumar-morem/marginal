import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse } from "smol-toml";
import { readFileSync } from "node:fs";
import { fullAccounts, loadProfile, validateProfile } from "./profile.js";

const dir = fileURLToPath(new URL("../../deploy/profiles/", import.meta.url));
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

function raw(): Record<string, unknown> {
  return parse(readFileSync(join(dir, "sandbox.toml"), "utf8"));
}

test("rejects an unknown rule", () => {
  const r = raw();
  (r["hdp"] as Record<string, unknown>)["rules_enabled"] = ["R9"];
  assert.throws(() => validateProfile(r), /unknown value R9/);
});

test("rejects a testnet profile without rpc", () => {
  const r = raw();
  r["network"] = "testnet";
  assert.throws(() => validateProfile(r), /at least one endpoint/);
});

test("rejects a bad account id and a zero challenge window", () => {
  const r = raw();
  (r["keypolicy"] as Record<string, unknown>)["mpc"] = "Not A Valid Account";
  assert.throws(() => validateProfile(r), /not a valid NEAR account id/);
  const r2 = raw();
  (r2["hdp"] as Record<string, unknown>)["challenge_window_secs"] = 0;
  assert.throws(() => validateProfile(r2), /must be positive/);
});

test("rejects dotted, duplicate or over-long sub-account names and non-URL rpc", () => {
  const set = (k: string, v: string) => {
    const r = raw();
    (r["accounts"] as Record<string, unknown>)[k] = v;
    return r;
  };
  assert.throws(() => validateProfile(set("gov", "a.b")), /single account-id segment/);
  assert.throws(() => validateProfile(set("faucet", "gov")), /must all differ/);
  assert.throws(() => validateProfile(set("clearing", "c".repeat(60))), /longer than 64/);
  const r = raw();
  r["rpc"] = ["not a url"];
  assert.throws(() => validateProfile(r), /http\(s\) URLs/);
});

test("sub-account ids are qualified with the deployer", () => {
  const a = fullAccounts(loadProfile(join(dir, "sandbox.toml")));
  assert.equal(a.token, "musdc.sandbox");
  assert.equal(a.keypolicy, "keypolicy.sandbox");
});
