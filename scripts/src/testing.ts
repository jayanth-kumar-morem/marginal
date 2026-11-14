// Test support shared by the unit and end-to-end tests. Not product code, so not in the coverage gate.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { KeyPairString } from "near-api-js";
import { DEFAULT_PRIVATE_KEY, Sandbox } from "near-sandbox";
import { parse, stringify } from "smol-toml";
import { circuitsDir, profilePath, repoRoot, wasmDir } from "./paths.js";

export const SANDBOX_KEY = DEFAULT_PRIVATE_KEY as KeyPairString;

/** The committed sandbox profile as a plain object, for tests to adjust. */
export function sandboxProfile(): Record<string, unknown> {
  return parse(readFileSync(profilePath(repoRoot, "sandbox"), "utf8"));
}

/** A copy of `obj` with the value at a dotted path replaced, for example `setPath(p, "hdp.cooling_blocks", 3)`. */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const copy = structuredClone(obj);
  const keys = path.split(".");
  const last = keys.pop() as string;
  let at = copy;
  for (const key of keys) at = at[key] as Record<string, unknown>;
  at[last] = value;
  return copy;
}

/** Runs `fn` against a fresh local node and always tears it down. */
export async function withSandbox<T>(fn: (sandbox: Sandbox) => Promise<T>): Promise<T> {
  const sandbox = await Sandbox.start({});
  try {
    return await fn(sandbox);
  } finally {
    await sandbox.tearDown();
  }
}

/**
 * A throwaway repo root: the given profiles, a link to the real built wasm, and one clean git
 * commit. Removed when the test ends.
 */
export function makeRoot(t: TestContext, profiles: Record<string, Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), "marginal-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "deploy", "profiles"), { recursive: true });
  for (const [name, profile] of Object.entries(profiles)) writeFileSync(profilePath(root, name), stringify(profile));
  mkdirSync(join(root, "target"));
  symlinkSync(wasmDir(repoRoot), wasmDir(root));
  // The circuit's committed verifying key, which the deploy seeds for sealed verdicts.
  symlinkSync(circuitsDir(repoRoot), circuitsDir(root));
  // The same ignores as the real repository: a deploy writes a manifest, the created accounts' keys
  // and the host services' environment, and none of the three is ever committed.
  writeFileSync(join(root, ".gitignore"), "target\ndeploy/manifest.*\ndeploy/.keys/\n.env\n.env.*\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: root });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "test root");
  return root;
}

/** Runs `fn` with an environment variable set, then restores it. */
export async function withEnv<T>(name: string, value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}
