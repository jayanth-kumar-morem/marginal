import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { configFrom, keyModeFor, walletFor, type Manifest } from "./config";
import { loadConfig, readManifest } from "./config.server";

/** A manifest shaped like the one `up.sh testnet-demo` writes. */
const manifest: Manifest = {
  profile: "testnet-demo",
  network: "testnet",
  chain_id: "testnet",
  rpc: ["https://test.rpc.fastnear.com"],
  accounts: { gov: "gov.marginal-demo.testnet", faucet: "faucet.marginal-demo.testnet" },
  contracts: {
    clearing: { account: "clearing.marginal-demo.testnet" },
    keypolicy: { account: "keypolicy.marginal-demo.testnet" },
    musdc: { account: "musdc.marginal-demo.testnet" },
  },
  config: { clearing: { policy_version: 4, profile: { profile: "hdp", gov_profile: "demo" } } },
};

test("the manifest is the source of every account the app talks to", () => {
  const config = configFrom({}, manifest);
  assert.equal(config.clearing, "clearing.marginal-demo.testnet");
  assert.equal(config.keypolicy, "keypolicy.marginal-demo.testnet");
  assert.equal(config.token, "musdc.marginal-demo.testnet");
  assert.equal(config.gov, "gov.marginal-demo.testnet");
  assert.equal(config.faucet, "faucet.marginal-demo.testnet");
  assert.equal(config.rpcUrl, "https://test.rpc.fastnear.com");
  assert.equal(config.chainId, "testnet");
  assert.equal(config.profile, "hdp");
  assert.equal(config.policyVersion, 4);
  assert.equal(config.walletUrl, "https://testnet.mynearwallet.com");
  // The services are not in the manifest, so they fall back to the compose file's ports.
  assert.equal(config.gateway, "http://127.0.0.1:8081");
  assert.equal(config.compliance, "http://127.0.0.1:8083");
  // `gov.profile = demo`, so every page carries the banner (§6.3 rule 2, DRC-12).
  assert.equal(config.simulatedProfile, true);
});

test("the environment overrides the manifest, field by field", () => {
  const config = configFrom(
    {
      MARGINAL_RPC_URL: "http://127.0.0.1:3030",
      MARGINAL_CLEARING: "clearing.test.near",
      MARGINAL_KEYPOLICY: "keypolicy.test.near",
      MARGINAL_TOKEN: "musdc.test.near",
      MARGINAL_GOV: "gov.test.near",
      MARGINAL_FAUCET: "faucet.test.near",
      MARGINAL_NETWORK: "sandbox",
      MARGINAL_CHAIN_ID: "sandbox",
      MARGINAL_PROFILE: "sandbox",
      MARGINAL_GATEWAY_URL: "http://gateway:8081",
      MARGINAL_COMPLIANCE_URL: "http://compliance:8083",
    },
    manifest,
  );
  assert.equal(config.rpcUrl, "http://127.0.0.1:3030");
  assert.equal(config.clearing, "clearing.test.near");
  assert.equal(config.keypolicy, "keypolicy.test.near");
  assert.equal(config.token, "musdc.test.near");
  assert.equal(config.gov, "gov.test.near");
  assert.equal(config.faucet, "faucet.test.near");
  assert.equal(config.profile, "sandbox");
  assert.equal(config.gateway, "http://gateway:8081");
  assert.equal(config.compliance, "http://compliance:8083");
  // No browser wallet knows a sandbox, so there is none to offer.
  assert.equal(config.walletUrl, null);
});

test("an environment with no manifest is enough, and an empty one is refused", () => {
  const config = configFrom({
    MARGINAL_CLEARING: "clearing.test.near",
    MARGINAL_KEYPOLICY: "keypolicy.test.near",
  });
  assert.equal(config.network, "testnet", "the default network");
  assert.equal(config.policyVersion, 0);
  assert.equal(config.token, "");
  assert.equal(config.simulatedProfile, true, "nothing says production, so assume it is not");

  assert.throws(() => configFrom({}), /no clearing or keypolicy account/);
  assert.throws(() => configFrom({ MARGINAL_CLEARING: "c.near" }), /no clearing or keypolicy/);
  assert.throws(() => configFrom({}, { ...manifest, contracts: {} }), /no clearing or keypolicy/);
});

test("a production profile carries no banner", () => {
  const config = configFrom({}, {
    ...manifest,
    config: { clearing: { profile: { gov_profile: "production" } } },
  });
  assert.equal(config.simulatedProfile, false);
  assert.equal(walletFor("mainnet"), "https://app.mynearwallet.com");
});

test("the key-release mode is the profile's, with one environment override", () => {
  // SDD §2.7's profile table: CKD everywhere a signer contract exists, which is every profile the
  // app will ever see but the two local ones.
  assert.equal(keyModeFor("testnet-demo"), "Ckd");
  assert.equal(keyModeFor("hdp"), "Ckd");
  assert.equal(keyModeFor("mainnet-canary"), "Ckd");
  assert.equal(keyModeFor("sandbox"), "RoomSealed");
  assert.equal(keyModeFor("local"), "RoomSealed");
  // The showcase has the MPC network but no attested room to release a key to (SDD §2.7).
  assert.equal(keyModeFor("testnet-sim"), "RoomSealed");

  // A manifest that says nothing about a mode — every manifest today — still works, and a
  // deployment nobody named is CKD rather than the weaker fallback.
  assert.equal(configFrom({}, manifest).keyMode, "Ckd");
  assert.equal(
    configFrom({ MARGINAL_CLEARING: "c.near", MARGINAL_KEYPOLICY: "k.near" }).keyMode,
    "Ckd",
  );
  assert.equal(configFrom({ MARGINAL_PROFILE: "sandbox" }, manifest).keyMode, "RoomSealed");

  // The override, and a typo in it, which is refused rather than quietly ignored.
  assert.equal(configFrom({ MARGINAL_KEY_MODE: "RoomSealed" }, manifest).keyMode, "RoomSealed");
  assert.equal(
    configFrom({ MARGINAL_KEY_MODE: "Ckd", MARGINAL_PROFILE: "sandbox" }, manifest).keyMode,
    "Ckd",
  );
  assert.equal(configFrom({ MARGINAL_KEY_MODE: "" }, manifest).keyMode, "Ckd");
  assert.throws(
    () => configFrom({ MARGINAL_KEY_MODE: "roomsealed" }, manifest),
    /neither Ckd nor RoomSealed/,
  );
});

test("the manifest is read from disk, and a missing one is not fatal", () => {
  const dir = mkdtempSync(join(tmpdir(), "marginal-web-"));
  const file = join(dir, "manifest.testnet-demo.json");
  writeFileSync(file, JSON.stringify(manifest));
  assert.deepEqual(readManifest(file)?.contracts?.clearing?.account, manifest.contracts?.clearing?.account);
  assert.equal(readManifest(join(dir, "nothing.json")), undefined);
  assert.equal(readManifest(undefined), undefined);
  assert.equal(readManifest(""), undefined);

  const loaded = loadConfig({ MARGINAL_MANIFEST: file });
  assert.equal(loaded.clearing, "clearing.marginal-demo.testnet");
  // And it defaults to this process's own environment.
  process.env.MARGINAL_CLEARING = "clearing.env.near";
  process.env.MARGINAL_KEYPOLICY = "keypolicy.env.near";
  assert.equal(loadConfig().clearing, "clearing.env.near");
  delete process.env.MARGINAL_CLEARING;
  delete process.env.MARGINAL_KEYPOLICY;
});
