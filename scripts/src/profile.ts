import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

export type Network = "sandbox" | "testnet";
export const RULES = ["R1"] as const;
export const ASSET_CLASSES = ["Knowledge", "Dataset"] as const;

/** Mirrors `marginal_core::attest::PPID_LEN`: a platform id is exactly 16 bytes (SDD §3.13). */
export const PPID_LEN = 16;
/** Mirrors `marginal_core::pricing::BPS`: one whole in basis points. */
export const BPS = 10_000;
/** Mirrors `marginal_core::FormulaId`'s variants: `set_appraiser` parses the name into one. */
export const FORMULAS = ["KnowledgeV1", "DatasetLiteV0", "DatasetV1"] as const;

/** An appraiser version governance registers: `id@version`, its formula and its compute fee class. */
export interface AppraiserEntry {
  id: string;
  version: number;
  formula: (typeof FORMULAS)[number];
  compute_fee: string;
  enabled: boolean;
}

/** Clearing's `FeeTable` (SDD §3.9.1): the fee, and how it is split. */
export interface FeeTableEntry {
  clearing_fee_buyer_bps: number;
  clearing_fee_seller_bps: number;
  treasury_bps: number;
  operator_pool_bps: number;
  assurance_pool_bps: number;
}

/** What the host services run with (`deploy/services/docker-compose.yaml`). */
export interface ServicesPolicy {
  /**
   * Who the compliance service may issue an identity credential to (SDD §3.20). An empty list is a
   * service that refuses every request with 403, which is safe but no use for a walk.
   */
  allowed_identities: string[];
}

/** A NEAR AI signer (SDD §3.16). `ttl_secs` becomes `expires_at` at deploy time. */
export interface AiSignerEntry {
  address: string;
  model: string;
  ttl_secs: number;
}

/**
 * What governance sets on clearing right after init (E14.4). Without the appraisers and the fee
 * table no listing can be created and nothing can settle, so a deploy that skipped them would
 * produce a chain that looks deployed and is unusable.
 */
export interface ClearingPolicy {
  appraisers: AppraiserEntry[];
  fees: FeeTableEntry;
  /**
   * Seed the committed circuit's verifying key, so sealed verdicts (SDD §3.17) can be proved on
   * chain. Off means every sealed verdict is refused with `E_PROOF_DISABLED`; the artefact is
   * committed, so there is no per-profile value to get wrong.
   */
  sealed_verdicts: boolean;
  /** The compliance service's issuer key, or null when this deployment has not got one yet. */
  issuer_key: string | null;
  /** The compliance service's reviewer key, or null. */
  compliance_key: string | null;
  ai_signer: AiSignerEntry | null;
}

/**
 * One TDX measurement, in the JSON model `marginal_core`'s `Measurement` serialises to: every field
 * lower-case hex of a fixed length, and `gpu_policy_hash` null for a CPU room. The profile writes
 * `gpu_policy_hash = ""` for null, because TOML has no null.
 */
export interface MeasurementEntry {
  mrtd: string;
  rtmr0: string;
  rtmr1: string;
  rtmr2: string;
  compose_hash: string;
  key_provider_digest: string;
  gpu_policy_hash: string | null;
}

/** A set of measurements that are the same program: `marginal_core::attest::MeasurementSet`. */
export interface MeasurementSetEntry {
  id: string;
  source_tag: string;
  members: MeasurementEntry[];
}

/** A platform governance admits: its PPID, the operator that runs it, and its per-epoch cap. */
export interface PlatformEntry {
  ppid: string;
  operator: string;
  cap_per_epoch: string;
}

export interface Profile {
  profile: string;
  network: Network;
  chain_id: string;
  rpc: string[];
  accounts: { deployer: string; gov: string; faucet: string; token: string; clearing: string; keypolicy: string; agent: string };
  hdp: {
    gov_profile: string;
    cooling_blocks: number;
    challenge_window_secs: number;
    rules_enabled: (typeof RULES)[number][];
    asset_classes_enabled: (typeof ASSET_CLASSES)[number][];
  };
  clearing: ClearingPolicy;
  services: ServicesPolicy;
  keypolicy: {
    mpc: string;
    ckd_domain_id: number;
    dcap_verifier: string;
    /**
     * Deploy `keypolicy-sim` instead of KeyPolicy, so a room can register with no quote at all
     * (SDD §6.1). Allowed on the sandbox network only, and refused everywhere else.
     */
    simulated_rooms: boolean;
  };
  room_policy: { platforms: PlatformEntry[]; measurement_sets: MeasurementSetEntry[] };
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
/** A string that may be empty, unlike [`str`]: a source tag is free text. */
function text(o: Record<string, unknown>, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== "string") fail(`${path}.${k} must be a string`);
  return v;
}
function bool(o: Record<string, unknown>, k: string, path: string): boolean {
  const v = o[k];
  if (typeof v !== "boolean") fail(`${path}.${k} must be true or false`);
  return v;
}
/** An optional boolean switch. Absent means false; anything but a boolean is a mistake, not a default. */
function flag(o: Record<string, unknown>, k: string, path: string): boolean {
  return o[k] === undefined ? false : bool(o, k, path);
}
/** Exactly `bytes` bytes of lower-case hex. Measurement fields and PPIDs are fixed-width. */
function hex(o: Record<string, unknown>, k: string, path: string, bytes: number): string {
  const v = o[k];
  if (typeof v !== "string" || v.length !== bytes * 2 || !/^[0-9a-f]+$/.test(v))
    fail(`${path}.${k} must be ${bytes * 2} lower-case hex characters (${bytes} bytes), got ${JSON.stringify(v)}`);
  return v;
}
/** A u128 amount as a canonical decimal string, the way every amount crosses this interface. */
function amount(o: Record<string, unknown>, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== "string" || !/^(0|[1-9]\d*)$/.test(v)) fail(`${path}.${k} must be a decimal amount in a string, got ${JSON.stringify(v)}`);
  if (BigInt(v) >= 2n ** 128n) fail(`${path}.${k} does not fit in u128: ${v}`);
  return v;
}
function list(o: Record<string, unknown>, k: string, path: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) fail(`${path}.${k} must be a list`);
  return v;
}

function measurement(raw: unknown, path: string): MeasurementEntry {
  const m = obj(raw, path);
  // `""` is how the profile spells null: a CPU room has no GPU policy (`hex_opt` in core's JSON model).
  const gpu = m["gpu_policy_hash"];
  if (typeof gpu !== "string") fail(`${path}.gpu_policy_hash must be a string ("" for a CPU room)`);
  return {
    mrtd: hex(m, "mrtd", path, 48),
    rtmr0: hex(m, "rtmr0", path, 48),
    rtmr1: hex(m, "rtmr1", path, 48),
    rtmr2: hex(m, "rtmr2", path, 48),
    compose_hash: hex(m, "compose_hash", path, 32),
    key_provider_digest: hex(m, "key_provider_digest", path, 48),
    gpu_policy_hash: gpu === "" ? null : hex(m, "gpu_policy_hash", path, 32),
  };
}

function measurementSet(raw: unknown, path: string): MeasurementSetEntry {
  const s = obj(raw, path);
  // Both checks are clearing's own (`require!("measurement set id")` and `"measurement set members"`);
  // making them here means a bad profile costs no gas.
  const members = list(s, "members", path);
  if (members.length === 0) fail(`${path}.members must list at least one measurement`);
  return {
    id: str(s, "id", path),
    source_tag: text(s, "source_tag", path),
    members: members.map((m, i) => measurement(m, `${path}.members[${i}]`)),
  };
}

function platformEntry(raw: unknown, path: string): PlatformEntry {
  const p = obj(raw, path);
  return {
    // `admit_platform` refuses a PPID that is not exactly PPID_LEN bytes; refuse it here too.
    ppid: hex(p, "ppid", path, PPID_LEN),
    operator: account(p, "operator", path),
    cap_per_epoch: amount(p, "cap_per_epoch", path),
  };
}

/** An optional 32-byte hex key. Absent or `""` means this deployment has not got one yet. */
function optionalKey(o: Record<string, unknown>, k: string, path: string): string | null {
  const v = o[k];
  if (v === undefined || v === "") return null;
  return hex(o, k, path, 32);
}

function appraiserEntry(raw: unknown, path: string): AppraiserEntry {
  const a = obj(raw, path);
  const formula = str(a, "formula", path);
  if (!FORMULAS.includes(formula as (typeof FORMULAS)[number]))
    fail(`${path}.formula is not a marginal-core formula: ${formula} (allowed: ${FORMULAS.join(", ")})`);
  return {
    // Clearing requires a non-empty id; its formula name is parsed into a `FormulaId`, so a typo
    // would be `E_DECODE` after the gas was spent.
    id: str(a, "id", path),
    version: int(a, "version", path),
    formula: formula as (typeof FORMULAS)[number],
    compute_fee: amount(a, "compute_fee", path),
    enabled: bool(a, "enabled", path),
  };
}

function feeTable(raw: unknown, path: string): FeeTableEntry {
  const f = obj(raw, path);
  const table: FeeTableEntry = {
    clearing_fee_buyer_bps: int(f, "clearing_fee_buyer_bps", path),
    clearing_fee_seller_bps: int(f, "clearing_fee_seller_bps", path),
    treasury_bps: int(f, "treasury_bps", path),
    operator_pool_bps: int(f, "operator_pool_bps", path),
    assurance_pool_bps: int(f, "assurance_pool_bps", path),
  };
  // Both checks are `FeeTable::validate`'s in `contracts/clearing/src/gov.rs` ("fee over 100%" and
  // "fee shares must add up to 100%"): the last three are shares *of the fee* and must be one whole.
  if (table.clearing_fee_buyer_bps > BPS || table.clearing_fee_seller_bps > BPS) fail(`${path}: a clearing fee over 100% (${BPS} bps)`);
  const shares = table.treasury_bps + table.operator_pool_bps + table.assurance_pool_bps;
  if (shares !== BPS) fail(`${path}: treasury_bps + operator_pool_bps + assurance_pool_bps must add up to ${BPS}, got ${shares}`);
  return table;
}

function aiSigner(raw: unknown, path: string): AiSignerEntry {
  const s = obj(raw, path);
  const ttl = int(s, "ttl_secs", path);
  // `set_ai_signer` *removes* the entry when `expires_at` is not in the future, so a zero TTL would
  // silently register nothing.
  if (ttl === 0) fail(`${path}.ttl_secs must be positive`);
  return { address: hex(s, "address", path, 20), model: str(s, "model", path), ttl_secs: ttl };
}

function servicesPolicy(raw: unknown): ServicesPolicy {
  // The whole section is optional: a deployment that runs no host services needs none of it.
  if (raw === undefined) return { allowed_identities: [] };
  const s = obj(raw, "services");
  return {
    // The compliance service reads this as a comma-separated list, so every entry is an account id.
    allowed_identities: list(s, "allowed_identities", "services").map((id, i) => account({ id }, "id", `services.allowed_identities[${i}]`)),
  };
}

function clearingPolicy(raw: unknown): ClearingPolicy {
  const c = obj(raw, "clearing");
  const appraisers = list(c, "appraisers", "clearing");
  if (appraisers.length === 0)
    fail("clearing.appraisers must list at least one appraiser: create_listing refuses a listing whose appraiser version is not registered and enabled");
  const signer = c["ai_signer"];
  return {
    appraisers: appraisers.map((a, i) => appraiserEntry(a, `clearing.appraisers[${i}]`)),
    fees: feeTable(c["fees"], "clearing.fees"),
    sealed_verdicts: flag(c, "sealed_verdicts", "clearing"),
    issuer_key: optionalKey(c, "issuer_key", "clearing"),
    compliance_key: optionalKey(c, "compliance_key", "clearing"),
    ai_signer: signer === undefined ? null : aiSigner(signer, "clearing.ai_signer"),
  };
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
  const platforms = list(rp, "platforms", "room_policy").map((x, i) => platformEntry(x, `room_policy.platforms[${i}]`));
  const sets = list(rp, "measurement_sets", "room_policy").map((x, i) => measurementSet(x, `room_policy.measurement_sets[${i}]`));
  // A room that proves nothing must never reach a real network. `deploy.ts` refuses it a second
  // time where it picks the wasm, and the contract a third: `sim-attestation` + `mainnet` is a
  // `compile_error!`. This is the first and cheapest of the three.
  const simulated = flag(k, "simulated_rooms", "keypolicy");
  if (simulated && network !== "sandbox")
    fail(`keypolicy.simulated_rooms is allowed on the sandbox network only, not ${network}: simulated rooms must never reach testnet or mainnet`);
  // A simulated room claims a measurement and a platform rather than proving them, so the profile
  // has to say which. Without both, `register_room_simulated` would be refused by the registry.
  if (simulated && (sets.length === 0 || platforms.length === 0))
    fail("keypolicy.simulated_rooms needs one room_policy.measurement_sets entry and one room_policy.platforms entry: a simulated room has nothing to claim otherwise");
  const challenge = int(h, "challenge_window_secs", "hdp");
  if (challenge === 0) fail("hdp.challenge_window_secs must be positive");
  const domain = int(k, "ckd_domain_id", "keypolicy");
  const deployer = account(a, "deployer", "accounts");
  const subs = (["gov", "faucet", "token", "clearing", "keypolicy", "agent"] as const).map((n) => [n, subName(a, n, "accounts")] as const);
  const names = new Set(subs.map(([, v]) => v));
  if (names.size !== subs.length) fail("accounts: gov, faucet, token, clearing, keypolicy and agent must all differ");
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
    clearing: clearingPolicy(r["clearing"]),
    services: servicesPolicy(r["services"]),
    keypolicy: {
      mpc: account(k, "mpc", "keypolicy"),
      ckd_domain_id: domain,
      dcap_verifier: account(k, "dcap_verifier", "keypolicy"),
      simulated_rooms: simulated,
    },
    room_policy: { platforms, measurement_sets: sets },
  };
}

/**
 * The `MARGINAL_SIM_*` environment the host services' compose needs when the deployment runs
 * simulated rooms (E14.4): what the room claims instead of proving it. Empty on a real profile, so
 * nothing can leak a simulated claim into one.
 *
 * The values come from the same validated profile the deploy seeds the registry from, so the room's
 * claim and the approved policy cannot drift apart.
 */
export function simEnv(p: Profile): Record<string, string> {
  if (!p.keypolicy.simulated_rooms) return {};
  // The validator guarantees one of each, and a set with at least one member.
  const set = p.room_policy.measurement_sets[0] as MeasurementSetEntry;
  const platform = p.room_policy.platforms[0] as PlatformEntry;
  return {
    MARGINAL_SIM_MEASUREMENT: JSON.stringify(set.members[0] as MeasurementEntry),
    MARGINAL_SIM_PPID: platform.ppid,
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
    agent: f(p.accounts.agent),
  };
}
