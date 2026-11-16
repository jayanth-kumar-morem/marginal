#!/usr/bin/env node
/**
 * Entry point for `deploy/scripts/demo.sh`: the three adversarial demonstrations of E14.3.
 *
 *   demo.sh drc4  --listing <id> [--identities N] [--budget base] [--privacy open|sealed]
 *   demo.sh drc5  --listing <id> [--budget base] [--privacy open|sealed] [--snapshot false]
 *   demo.sh drc11 --listing <id> | --job <id> [--budget base] [--wait false]
 *
 * Every run reads `deploy/manifest.<profile>.json` and the keys of the accounts that deploy
 * created, exactly as the deploy tooling does. The logic of each demonstration is in `drc4.ts`,
 * `drc5.ts` and `drc11.ts`, each covered by its own tests against a fake chain; what is here is the
 * live {@link DemoChain} over near-api-js, which is the one piece that cannot be exercised without
 * a node — like `up.ts`, this file is the thin edge between the tested code and the network.
 */
import { readFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPair, actions, type KeyPairString } from "near-api-js";
import { DEFAULT_PRIVATE_KEY } from "near-sandbox";
import { TERA, view } from "./chain.js";
import { testnetDeployerKey } from "./cli.js";
import { agentOf, envOf, header, parseArgs, type DemoChain, type Log } from "./demo.js";
import type { Manifest } from "./deploy.js";
import { keysPath, manifestPath, repoRoot } from "./paths.js";
import { runDrc4 } from "./drc4.js";
import { runDrc5 } from "./drc5.js";
import { runDrc11 } from "./drc11.js";

/** 100 TGas: `request_appraisal` assigns a room and writes three audit entries. */
const GAS = 100n * TERA;

function liveChain(manifest: Manifest, keys: Record<string, string>, rpcUrl: string): DemoChain {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const deployer = manifest.accounts.deployer;
  const signers = new Map<string, string>(Object.entries(keys));
  signers.set(
    deployer,
    manifest.network === "sandbox" ? (DEFAULT_PRIVATE_KEY as string) : (testnetDeployerKey(deployer) as string),
  );
  const as = (name: string): Account => {
    const key = signers.get(name);
    if (key === undefined) throw new Error(`no key for ${name}`);
    // An agent key signs for the account it was added to, which is what makes it an agent key.
    return new Account(name.replace(/#agent$/, ""), provider, key as KeyPairString);
  };
  return {
    view: <T>(contract: string, method: string, args: Record<string, unknown> = {}) =>
      view<object>(provider, contract, method, args) as unknown as Promise<T>,
    height: async () => Number((await provider.viewBlock({ finality: "final" })).header.height),
    call: (name, contract, method, args, deposit = 0n) =>
      as(name).callFunction({ contractId: contract, methodName: method, args, deposit, gas: GAS, waitUntil: "FINAL" }),
    create: async (id, yocto) => {
      const kp = KeyPair.fromRandom("ed25519");
      await as(deployer).signAndSendTransaction({
        receiverId: id,
        actions: [actions.createAccount(), actions.transfer(yocto), actions.addFullAccessKey(kp.getPublicKey())],
        waitUntil: "FINAL",
      });
      signers.set(id, kp.toString());
    },
    addAgentKey: async (id, receiver, methods) => {
      const kp = KeyPair.fromRandom("ed25519");
      await as(id).signAndSendTransaction({
        receiverId: id,
        actions: [actions.addFunctionCallAccessKey(kp.getPublicKey(), receiver, [...methods])],
        waitUntil: "FINAL",
      });
      signers.set(agentOf(id), kp.toString());
      return Buffer.from(kp.getPublicKey().data).toString("hex");
    },
  };
}

const USAGE = [
  "usage: demo.sh <drc4|drc5|drc11> [--profile sandbox] [--rpc url] [flags]",
  "  drc4  --listing <id> [--identities N] [--budget base] [--privacy open|sealed] [--tag x]",
  "        the Sybil probe: N identities drain one listing's leakage budget until the wall",
  "  drc5  --listing <id> [--budget base] [--privacy open|sealed] [--snapshot false] [--tag x]",
  "        the injected buyer agent: over-cap requests blocked, one parked for a human",
  "  drc11 --listing <id> | --job <id> [--budget base] [--wait false] [--tag x]",
  "        the room kill: past the deadline anyone refunds the buyer, to the unit",
].join("\n");

/** A deploy's own file, or a message saying which deploy is missing rather than which path is. */
function read(file: string, what: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error(`no ${what}: ${file} is not there. Deploy it first with deploy/scripts/up.sh, or pass --profile.`);
  }
}

export async function main(argv: readonly string[], log: Log = console.log): Promise<boolean> {
  const args = parseArgs(argv);
  const profile = args.flags["profile"] ?? "sandbox";
  const manifestFile = manifestPath(repoRoot, profile);
  const manifest = JSON.parse(read(manifestFile, `manifest for profile ${profile}`)) as Manifest;
  const keys = JSON.parse(read(keysPath(repoRoot, profile), `keys for profile ${profile}`)) as Record<string, string>;
  const env = envOf(manifest);
  // A sandbox node picks a fresh port every time it starts, so a manifest can outlive the node it
  // was written for: --rpc points a run at the node that is actually up.
  const rpcUrl = args.flags["rpc"] ?? (manifest.rpc[0] as string);
  const chain = liveChain(manifest, keys, rpcUrl);
  header(log, args.command, env, manifestFile);
  log(`rpc           ${rpcUrl}`);
  log("");
  if (args.command === "drc4") return runDrc4(chain, env, args, log);
  if (args.command === "drc5") return runDrc5(chain, env, args, log, repoRoot);
  if (args.command === "drc11") return runDrc11(chain, env, args, log);
  throw new Error(USAGE);
}

main(process.argv.slice(2))
  .then((held) => process.exit(held ? 0 : 1))
  .catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
