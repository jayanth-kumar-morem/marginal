// The `up` command: deploys a profile. Usage: up.sh <profile> [--once]
//   sandbox:      starts a local node, deploys, keeps running until Ctrl-C (or tears down with --once)
//   testnet-demo: deploys to testnet with the deployer key from $NEAR_DEPLOYER_KEY or ~/.near-credentials
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_PRIVATE_KEY, Sandbox } from "near-sandbox";
import type { KeyPairString } from "near-api-js";
import { deployAll } from "./deploy.js";
import { keysPath, manifestPath, profilePath, repoRoot, wasmDir } from "./paths.js";
import { loadProfile } from "./profile.js";

/** The deployer's secret key: `$NEAR_DEPLOYER_KEY`, else the near-cli credentials file. */
export function testnetDeployerKey(account: string): KeyPairString {
  const fromEnv = process.env["NEAR_DEPLOYER_KEY"];
  if (fromEnv) return fromEnv as KeyPairString;
  const file = join(homedir(), ".near-credentials", "testnet", `${account}.json`);
  if (!existsSync(file)) throw new Error(`no deployer key: set NEAR_DEPLOYER_KEY or create ${file}`);
  const { private_key } = JSON.parse(readFileSync(file, "utf8")) as { private_key?: string };
  if (!private_key) throw new Error(`${file} has no private_key`);
  return private_key as KeyPairString;
}

export function gitRevision(root: string): { commit: string; dirty: boolean } {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain") !== "" };
}

/** Writes JSON and sets the file's mode, which `writeFileSync` applies only when it creates the file. */
export function writeJson(path: string, value: unknown, mode: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  chmodSync(path, mode);
}

export async function runUp(argv: string[], opts: { root?: string; log?: (line: string) => void } = {}): Promise<void> {
  const root = opts.root ?? repoRoot;
  const log = opts.log ?? console.log;
  const name = argv.find((a) => !a.startsWith("--"));
  if (!name) throw new Error("usage: up.sh <profile> [--once]");
  const p = loadProfile(profilePath(root, name));
  if (p.profile !== name) throw new Error(`profile file ${name}.toml declares profile = "${p.profile}"`);

  const git = gitRevision(root);
  const keysFile = keysPath(root, p.profile);
  if (p.network !== "sandbox") {
    if (git.dirty) throw new Error("refusing a non-sandbox deploy from a dirty git tree: commit first");
    // The keys file is the only copy of the created accounts' keys: never overwrite it.
    if (existsSync(keysFile)) throw new Error(`${keysFile} exists; move it aside before a fresh deploy`);
  }
  log(`profile ${p.profile} on ${p.network}`);

  const sandbox = p.network === "sandbox" ? await Sandbox.start({}) : undefined;
  try {
    const rpcUrl = sandbox ? sandbox.rpcUrl : (p.rpc[0] as string);
    const deployerKey = sandbox ? (DEFAULT_PRIVATE_KEY as KeyPairString) : testnetDeployerKey(p.accounts.deployer);
    if (sandbox) log(`sandbox node at ${rpcUrl}`);

    const { manifest } = await deployAll(p, {
      rpcUrl,
      deployerKey,
      wasmDir: wasmDir(root),
      log,
      git,
      saveKeys: (keys) => writeJson(keysFile, keys, 0o600),
    });
    const manifestFile = manifestPath(root, p.profile);
    writeJson(manifestFile, manifest, 0o644);
    log(`manifest written: ${manifestFile}`);
    log(`keys for the accounts we created: deploy/.keys/${p.profile}.json (gitignored)`);

    if (sandbox && !argv.includes("--once")) {
      log(`sandbox is running at ${rpcUrl}. Ctrl-C to stop.`);
      await new Promise<void>((done) => {
        const stop = () => {
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
          done();
        };
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
      });
    }
  } finally {
    if (sandbox) await sandbox.tearDown();
  }
}
