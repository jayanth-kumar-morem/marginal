import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

export type Network = "sandbox" | "testnet";
export const RULES = ["R1"] as const;
export const ASSET_CLASSES = ["Knowledge", "Dataset"] as const;

export interface Profile {
  profile: string;
  network: Network;
  chain_id: string;
  rpc: string[];
  accounts: { deployer: string; gov: string; faucet: string; token: string; clearing: string; keypolicy: string };
  hdp: {
    gov_profile: string;
    cooling_blocks: number;
    challenge_window_secs: number;
    rules_enabled: (typeof RULES)[number][];
    asset_classes_enabled: (typeof ASSET_CLASSES)[number][];
  };
  keypolicy: { mpc: string; ckd_domain_id: number; dcap_verifier: string };
  room_policy: { platforms: unknown[]; measurement_sets: unknown[] };
}

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
/** One account-id segment: what goes in front of `.<deployer>`. */
const SUB_NAME = /^([a-z\d]+[-_])*[a-z\d]+$/;

function fail(msg: string): never {
  throw new Error(`invalid profile: ${msg}`);
}
function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${path} must be a table`);
  return v as Record<string, unknown>;
}
function str(o: Record<string, unknown>, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== "string" || v === "") fail(`${path}.${k} must be a non-empty string`);
  return v;
}
function int(o: Record<string, unknown>, k: string, path: string): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) fail(`${path}.${k} must be a non-negative integer`);
  return v;
}
function account(o: Record<string, unknown>, k: string, path: string): string {
  const v = str(o, k, path);
  if (v.length < 2 || v.length > 64 || !ACCOUNT_ID.test(v)) fail(`${path}.${k} is not a valid NEAR account id: ${v}`);
  return v;
}
function subName(o: Record<string, unknown>, k: string, path: string): string {
  const v = str(o, k, path);
  if (!SUB_NAME.test(v)) fail(`${path}.${k} must be a single account-id segment (no dots): ${v}`);
  return v;
}
function enumList<T extends string>(o: Record<string, unknown>, k: string, path: string, allowed: readonly T[]): T[] {
  const v = o[k];
  if (!Array.isArray(v) || v.length === 0) fail(`${path}.${k} must be a non-empty list`);
  for (const x of v) if (!allowed.includes(x as T)) fail(`${path}.${k} has unknown value ${String(x)} (allowed: ${allowed.join(", ")})`);
  return v as T[];
}

export function validateProfile(raw: unknown): Profile {
  const r = obj(raw, "profile");
  const network = str(r, "network", "profile");
  if (network !== "sandbox" && network !== "testnet") fail(`network must be sandbox or testnet, got ${network}`);
  const rpc = r["rpc"];
  if (!Array.isArray(rpc) || !rpc.every((x) => typeof x === "string" && /^https?:\/\/\S+$/.test(x)))
    fail("rpc must be a list of http(s) URLs");
  if (network !== "sandbox" && rpc.length === 0) fail("rpc must list at least one endpoint for non-sandbox networks");
  const a = obj(r["accounts"], "accounts");
  const h = obj(r["hdp"], "hdp");
  const k = obj(r["keypolicy"], "keypolicy");
  const rp = obj(r["room_policy"], "room_policy");
  const platforms = rp["platforms"];
  const sets = rp["measurement_sets"];
  if (!Array.isArray(platforms) || !Array.isArray(sets)) fail("room_policy.platforms and .measurement_sets must be lists");
  const challenge = int(h, "challenge_window_secs", "hdp");
  if (challenge === 0) fail("hdp.challenge_window_secs must be positive");
  const domain = int(k, "ckd_domain_id", "keypolicy");
  const deployer = account(a, "deployer", "accounts");
  const subs = (["gov", "faucet", "token", "clearing", "keypolicy"] as const).map((n) => [n, subName(a, n, "accounts")] as const);
  const names = new Set(subs.map(([, v]) => v));
  if (names.size !== subs.length) fail("accounts: gov, faucet, token, clearing and keypolicy must all differ");
  for (const [n, v] of subs) if (`${v}.${deployer}`.length > 64) fail(`accounts.${n}: ${v}.${deployer} is longer than 64 characters`);
  const sub = Object.fromEntries(subs) as Record<(typeof subs)[number][0], string>;
  return {
    profile: str(r, "profile", "profile"),
    network,
    chain_id: str(r, "chain_id", "profile"),
    rpc: rpc as string[],
    accounts: { deployer, ...sub },
    hdp: {
      gov_profile: str(h, "gov_profile", "hdp"),
      cooling_blocks: int(h, "cooling_blocks", "hdp"),
      challenge_window_secs: challenge,
      rules_enabled: enumList(h, "rules_enabled", "hdp", RULES),
      asset_classes_enabled: enumList(h, "asset_classes_enabled", "hdp", ASSET_CLASSES),
    },
    keypolicy: { mpc: account(k, "mpc", "keypolicy"), ckd_domain_id: domain, dcap_verifier: account(k, "dcap_verifier", "keypolicy") },
    room_policy: { platforms, measurement_sets: sets },
  };
}

export function loadProfile(path: string): Profile {
  return validateProfile(parse(readFileSync(path, "utf8")));
}

/** Sub-account ids are `<name>.<deployer>`; every short name in `accounts` is a sub-account. */
export function fullAccounts(p: Profile) {
  const d = p.accounts.deployer;
  const f = (n: string) => `${n}.${d}`;
  return {
    deployer: d,
    gov: f(p.accounts.gov),
    faucet: f(p.accounts.faucet),
    token: f(p.accounts.token),
    clearing: f(p.accounts.clearing),
    keypolicy: f(p.accounts.keypolicy),
  };
}
