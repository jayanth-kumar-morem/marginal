#!/usr/bin/env node
// Usage: tsx src/up.ts <profile> [--once]
//   sandbox:      starts a local node, deploys, keeps running until Ctrl-C (or tears down with --once)
//   testnet-demo: deploys to testnet with the deployer key from $NEAR_DEPLOYER_KEY or ~/.near-credentials
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PRIVATE_KEY, Sandbox } from "near-sandbox";
import type { KeyPairString } from "near-api-js";
import { deployAll, writeJson } from "./deploy.js";
import { loadProfile } from "./profile.js";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function testnetDeployerKey(account: string): KeyPairString {
  const env = process.env["NEAR_DEPLOYER_KEY"];
  if (env) return env as KeyPairString;
  const file = join(homedir(), ".near-credentials", "testnet", `${account}.json`);
  if (!existsSync(file)) throw new Error(`no deployer key: set NEAR_DEPLOYER_KEY or create ${file}`);
  const j = JSON.parse(readFileSync(file, "utf8")) as { private_key?: string };
  if (!j.private_key) throw new Error(`${file} has no private_key`);
  return j.private_key as KeyPairString;
}

async function main() {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith("--"));
  const once = args.includes("--once");
  if (!name) throw new Error("usage: up.sh <sandbox|testnet-demo> [--once]");
  const p = loadProfile(join(root, "deploy", "profiles", `${name}.toml`));
  const log = (l: string) => console.log(l);
  log(`profile ${p.profile} on ${p.network}`);

  let sandbox: Sandbox | undefined;
  let rpcUrl: string;
  let deployerKey: KeyPairString;
  if (p.network === "sandbox") {
    sandbox = await Sandbox.start({});
    rpcUrl = sandbox.rpcUrl;
    deployerKey = DEFAULT_PRIVATE_KEY as KeyPairString;
    log(`sandbox node at ${rpcUrl}`);
  } else {
    rpcUrl = p.rpc[0] as string;
    deployerKey = testnetDeployerKey(p.accounts.deployer);
  }

  try {
    const { manifest, keys } = await deployAll(p, { rpcUrl, deployerKey, wasmDir: join(root, "target", "near"), log });
    const manifestPath = join(root, "deploy", `manifest.${p.profile}.json`);
    writeJson(manifestPath, manifest);
    writeJson(join(root, "deploy", ".keys", `${p.profile}.json`), keys, 0o600);
    log(`manifest written: ${manifestPath}`);
    log(`keys for the accounts we created: deploy/.keys/${p.profile}.json (gitignored)`);
    if (sandbox && !once) {
      log(`sandbox is running at ${rpcUrl}. Ctrl-C to stop.`);
      await new Promise<void>((done) => {
        process.once("SIGINT", () => done());
        process.once("SIGTERM", () => done());
      });
    }
  } finally {
    if (sandbox) await sandbox.tearDown();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
