/**
 * What the three adversarial demo scripts share (E14.3: DRC-4, DRC-5, DRC-11).
 *
 * These scripts are not product code. They are the demonstrations the submission is judged on, and
 * each one has the same shape: read a deployed manifest, say what it is about to do, do it against a
 * real chain, print the contract's **own** numbers at every step, and end with one line saying
 * whether the property held. Nothing here computes a price, a debit or a hash: every figure printed
 * is read back from a contract view or produced by `marginal-core` through `@marginal/core-wasm`.
 *
 * The chain is behind {@link DemoChain}, five operations wide. The live implementation over
 * near-api-js lives in `demo-run.ts`, the entry point; the tests drive the scripts through a fake,
 * which is how every refusal path here is exercised without a node.
 */
import { NEAR, borshBase64, errorCode } from "./chain.js";
import type { Manifest } from "./deploy.js";

export type Log = (line: string) => void;

/** musdc has six decimals (`contracts/test-tokens/musdc`), as does every M1 settlement token. */
export const DECIMALS = 6;

/** What a demo script needs of a chain. */
export interface DemoChain {
  /** A view call. Rejects with the contract's own message when the view refuses. */
  view<T>(contract: string, method: string, args?: Record<string, unknown>): Promise<T>;
  /** The latest final block height: a deadline is a height, not a time. */
  height(): Promise<number>;
  /**
   * A signed function call, as `as` — an account the chain holds a key for, or {@link agentOf} of
   * one for the function-call key DRC-5 adds. Rejects with the contract's own message.
   */
  call(as: string, contract: string, method: string, args: Record<string, unknown>, deposit?: bigint): Promise<unknown>;
  /** Creates `id` as a sub-account of the manifest's deployer, funded with `yocto` and keyed. */
  create(id: string, yocto: bigint): Promise<void>;
  /**
   * Adds a **function-call** access key to `id`, restricted to `methods` on `receiver`, and keeps
   * it under {@link agentOf}`(id)`. Returns its 32 bytes as hex, which is how clearing names an
   * agent key (`contracts/clearing/src/agent.rs`, `parse_agent_key`).
   */
  addAgentKey(id: string, receiver: string, methods: readonly string[]): Promise<string>;
}

/** The signer name of the agent key on `id`. */
export const agentOf = (id: string) => `${id}#agent`;

/** The accounts and contracts a demo script addresses, out of the manifest. */
export interface DemoEnv {
  readonly profile: string;
  readonly network: string;
  readonly clearing: string;
  readonly token: string;
  readonly faucet: string;
  readonly deployer: string;
  readonly attestation: "simulated" | "real";
}

export function envOf(m: Manifest): DemoEnv {
  return {
    profile: m.profile,
    network: m.network,
    clearing: m.contracts.clearing.account,
    token: m.contracts.musdc.account,
    faucet: m.accounts.faucet,
    deployer: m.accounts.deployer,
    attestation: m.attestation,
  };
}

/** The fields of `get_listing` these scripts read (SDD §3.4). */
export interface ListingView {
  readonly id: number;
  readonly seller: string;
  readonly version: number;
  readonly status: string;
  readonly appraiser: string;
  readonly schema_hash: string;
  readonly token: string;
  readonly rule: { readonly Posted?: { readonly ask: string } };
  readonly max_copies: number;
  readonly copies: number;
  readonly key_mode: string;
  readonly delivery_deadline_blocks: number;
  readonly leakage: LeakageView;
}

/** `get_leakage`: the listing's budget and what is left of it (SDD §3.8). */
export interface LeakageView {
  readonly budget_mbits: number;
  readonly reserved_mbits: number;
  readonly spent_mbits: number;
  readonly remaining_mbits: number;
  readonly price_per_bit: string;
}

/** A job's seven buckets, as `get_job` prints them: decimal strings of base units. */
export interface BucketsView {
  readonly budget: string;
  readonly compute: string;
  readonly comp_reserved: string;
  readonly fee_reserved: string;
  readonly storage: string;
  readonly held: string;
  readonly refund: string;
}

/** The fields of `get_job` these scripts read. */
export interface JobView {
  readonly id: number;
  readonly listing_id: number;
  readonly state: string;
  readonly buyer: string | null;
  readonly token: string;
  readonly max_debit_mbits: number;
  readonly buckets: BucketsView;
  readonly assigned: readonly string[];
  readonly requested_height: number;
  readonly deadline_height: number;
  readonly delivery_deadline_height: number | null;
}

/** What `request_appraisal` answers (SDD §3.4, §3.21). */
export interface RequestAnswer {
  readonly status: string;
  readonly job_id?: string;
  readonly cap?: string;
}

/** `marginal_core::request::AppraisalRequest` in the core's JSON model. */
export interface AppraisalRequestJson {
  readonly listing_id: number;
  readonly listing_version: number;
  readonly snapshot_id: number | null;
  readonly budget: string;
  readonly mode: "Blind";
  readonly privacy: Privacy;
  readonly n_judges: number;
  readonly delivery_pk: string;
  readonly compliance_pk: null;
  readonly context_auth_pk: string;
  readonly sealed_context_key: string;
  readonly refund_to: "Balance";
  readonly nullifier: null;
  readonly nullifier_sig: null;
}

export type Privacy = "Open" | "Sealed";

/** The command and `--flag value` pairs of an argument list. A bare `--flag` reads as "true". */
export interface Args {
  readonly command: string;
  readonly flags: Readonly<Record<string, string>>;
}

export function parseArgs(argv: readonly string[]): Args {
  const flags: Record<string, string> = {};
  let command = "";
  for (let at = 0; at < argv.length; at += 1) {
    const token = argv[at] as string;
    if (!token.startsWith("--")) {
      if (command === "") command = token;
      continue;
    }
    const next = argv[at + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[token.slice(2)] = "true";
      continue;
    }
    flags[token.slice(2)] = next;
    at += 1;
  }
  return { command, flags };
}

/** A whole number flag, or `fallback` when it was not given. A value that is not one is refused. */
export function numberFlag(args: Args, name: string, fallback: number): number {
  const value = args.flags[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`--${name} takes a whole number, not ${JSON.stringify(value)}`);
  return Number(value);
}

/** A flag that is present (`--x` or `--x true`) and not `--x false`. */
export function boolFlag(args: Args, name: string, fallback: boolean): boolean {
  const value = args.flags[name];
  if (value === undefined) return fallback;
  return value !== "false";
}

/** A base-units amount flag, or `null` when it was not given. */
export function amountFlag(args: Args, name: string): string | null {
  const value = args.flags[name];
  if (value === undefined) return null;
  if (!/^\d+$/.test(value)) throw new Error(`--${name} takes base units (a whole number), not ${JSON.stringify(value)}`);
  return value;
}

/** A privacy flag. Open publishes the verdict's numbers; Sealed debits one bit (SDD §3.17). */
export function privacyFlag(args: Args, fallback: Privacy): Privacy {
  const value = args.flags["privacy"];
  if (value === undefined) return fallback;
  if (value === "open") return "Open";
  if (value === "sealed") return "Sealed";
  throw new Error(`--privacy takes open or sealed, not ${JSON.stringify(value)}`);
}

/**
 * The least a buyer may offer for this listing, which is the floor `request_appraisal` checks the
 * budget against (`E_RULE_PARAMS`). M1 enables R1 only (`rules_enabled = ["R1"]`), whose minimum is
 * the posted ask; anything else has no demo price and the script says so rather than guessing.
 */
export function askOf(listing: ListingView): string {
  const ask = listing.rule.Posted?.ask;
  if (ask === undefined) {
    throw new Error(`listing ${listing.id} is not posted under R1 (${JSON.stringify(listing.rule)}); pass --budget`);
  }
  return ask;
}

/** Base units as the token's own decimals, for a line somebody has to read on a screen. */
export function amount(base: string): string {
  const padded = base.padStart(DECIMALS + 1, "0");
  return `${padded.slice(0, -DECIMALS)}.${padded.slice(-DECIMALS)}`;
}

/** Millibits as bits, the unit the leakage budget is quoted in (1,000 mbits is one bit). */
export function bits(mbits: number): string {
  return `${mbits} mbits (${(mbits / 1000).toFixed(3)} bits)`;
}

export async function listingOf(chain: DemoChain, env: DemoEnv, id: number): Promise<ListingView> {
  const listing = await chain.view<ListingView | null>(env.clearing, "get_listing", { listing_id: String(id) });
  if (listing === null) throw new Error(`${env.clearing} has no listing ${id}`);
  return listing;
}

export async function jobOf(chain: DemoChain, env: DemoEnv, id: number): Promise<JobView> {
  const job = await chain.view<JobView | null>(env.clearing, "get_job", { job_id: String(id) });
  if (job === null) throw new Error(`${env.clearing} has no job ${id}`);
  return job;
}

export const leakageOf = (chain: DemoChain, env: DemoEnv, id: number) =>
  chain.view<LeakageView>(env.clearing, "get_leakage", { listing_id: String(id) });

export const balanceOf = (chain: DemoChain, env: DemoEnv, account: string) =>
  chain.view<string>(env.clearing, "get_balance", { account, token: env.token });

/** What the chain was deployed with, which a demo prints before it does anything (SDD §6.2). */
export interface ConfigView {
  readonly profile: { readonly cooling_blocks: number };
  readonly fees: { readonly clearing_fee_buyer_bps: number };
  readonly next_job_id: number;
  readonly fee_schedule: { readonly snapshot: string };
}

export const configOf = (chain: DemoChain, env: DemoEnv) => chain.view<ConfigView>(env.clearing, "config");

/** The head of the audit chain: a demo shows the attempt is on it, before and after (SDD §3.10). */
export interface AuditHead {
  readonly seq: number;
  readonly head: string;
}

export const auditHead = (chain: DemoChain, env: DemoEnv) => chain.view<AuditHead>(env.clearing, "audit_head");

export interface AuditEntryView {
  readonly seq: number;
  readonly height: number;
  readonly kind: string;
  readonly subject_id: number;
  readonly payload_hash: string;
}

/** The audit entries from `from` up to the head, which is where an attempt has to show up. */
export async function auditSince(chain: DemoChain, env: DemoEnv, from: number): Promise<readonly AuditEntryView[]> {
  if (from < 1) throw new Error(`the audit chain starts at 1, not ${from}`);
  return chain.view<AuditEntryView[]>(env.clearing, "get_audit", { from: String(from), limit: 100 });
}

/** A short, unique account-name suffix, so the same script can be run twice on one chain. */
export const suffix = (now: number = Date.now()) => now.toString(36).slice(-6);

/**
 * A call that is expected to be refused, as a value the script can branch on: either what it
 * answered, or the contract's own error code. A demo that cannot tell `E_BUDGET_EXHAUSTED` from a
 * dead RPC is no demonstration of anything.
 */
export async function attempt<T>(run: () => Promise<T>): Promise<{ ok: T } | { code: string }> {
  try {
    return { ok: await run() };
  } catch (e) {
    return { code: errorCode(e) };
  }
}

/** Sleeps, which only {@link waitForHeight} needs and only against a live chain. */
export const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Waits until the chain is past `target`, printing where it is on the way. Returns the height it
 * saw, and `check` is given every height so a caller can stop early (DRC-11 stops if the room
 * answers before the deadline).
 */
export async function waitForHeight(
  chain: DemoChain,
  target: number,
  log: Log,
  opts: { check?: (height: number) => Promise<boolean>; sleep?: (ms: number) => Promise<void>; every?: number } = {},
): Promise<number> {
  const sleep = opts.sleep ?? delay;
  const every = opts.every ?? 10;
  let height = await chain.height();
  let said = 0;
  while (height <= target) {
    if (opts.check !== undefined && !(await opts.check(height))) return height;
    if (height - said >= every) {
      log(`      block ${height} of ${target + 1} (${target + 1 - height} to go)`);
      said = height;
    }
    await sleep(1000);
    height = await chain.height();
  }
  return height;
}

const TITLES: Readonly<Record<string, string>> = {
  drc4: "DRC-4 — the leakage wall: buying the same information twice under different names",
  drc5: "DRC-5 — the agent firewall: an injected buyer agent against its owner's caps",
  drc11: "DRC-11 — the timeout refund: the room is killed and anyone can make the buyer whole",
};

/** What every run prints first: which demo, against which deployment, and what is simulated. */
export function header(log: Log, command: string, env: DemoEnv, manifestFile: string): void {
  log("");
  log(TITLES[command] ?? command);
  log("=".repeat(78));
  log(`profile       ${env.profile} on ${env.network}`);
  log(`manifest      ${manifestFile}`);
  log(`clearing      ${env.clearing}`);
  log(`token         ${env.token}`);
  log(`attestation   ${env.attestation}${env.attestation === "simulated" ? "  (keypolicy-sim: a room here proves nothing, SDD §6.1)" : ""}`);
  log("");
}

export function printListing(log: Log, listing: ListingView): void {
  log(`listing ${listing.id} v${listing.version} by ${listing.seller}: ${listing.status}, ${listing.appraiser}, ${listing.key_mode}`);
  log(`      rule        ${JSON.stringify(listing.rule)}  (${amount(askOf(listing))} ${listing.token})`);
  log(`      copies      ${listing.copies} of ${listing.max_copies}`);
  printLeakage(log, "leakage", listing.leakage);
}

export function printLeakage(log: Log, label: string, l: LeakageView): void {
  log(`      ${label.padEnd(11)} budget ${l.budget_mbits} mbits, reserved ${l.reserved_mbits}, spent ${l.spent_mbits}, remaining ${l.remaining_mbits}; π = ${amount(l.price_per_bit)} per bit`);
}

export function printBuckets(log: Log, label: string, b: BucketsView): void {
  log(`      ${label.padEnd(11)} budget ${amount(b.budget)}, compute ${amount(b.compute)}, comp_reserved ${amount(b.comp_reserved)}, fee_reserved ${amount(b.fee_reserved)}, storage ${amount(b.storage)}, held ${amount(b.held)}, refund ${amount(b.refund)}`);
}

/** The one line a demo ends with. Returns what it was given, so a run can `return verdict(...)`. */
export function verdict(log: Log, held: boolean, line: string): boolean {
  log("");
  log("=".repeat(78));
  log(`${held ? "HELD" : "DID NOT HOLD"}: ${line}`);
  return held;
}

/**
 * The request a demo buyer signs.
 *
 * `mode` is `Blind` because clearing refuses `DisplayMode::Fields` in M1, and `refund_to` is
 * `Balance` so a refund lands back in escrow. `delivery_pk` and `context_auth_pk` are random bytes:
 * no delivery is ever opened by these scripts, and the job commitment binds whatever is sent, so a
 * placeholder is honest here in a way it would not be on a buyer's real appraisal (E12.1).
 */
export function buildRequest(
  listing: ListingView,
  opts: { budget: string; privacy: Privacy; nJudges?: number; snapshotId?: number | null; randomHex?: () => string },
): AppraisalRequestJson {
  const random = opts.randomHex ?? randomHex;
  return {
    listing_id: listing.id,
    listing_version: listing.version,
    snapshot_id: opts.snapshotId ?? null,
    budget: opts.budget,
    mode: "Blind",
    privacy: opts.privacy,
    n_judges: opts.nJudges ?? 0,
    delivery_pk: random(),
    compliance_pk: null,
    context_auth_pk: random(),
    sealed_context_key: "",
    refund_to: "Balance",
    nullifier: null,
    nullifier_sig: null,
  };
}

/** Thirty-two bytes of hex from the platform's CSPRNG. */
export function randomHex(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `request_appraisal`, signed by `as`. The argument is the core's Borsh, as the contract takes it. */
export async function requestAppraisal(
  chain: DemoChain,
  env: DemoEnv,
  as: string,
  request: AppraisalRequestJson,
): Promise<RequestAnswer> {
  const answer = await chain.call(as, env.clearing, "request_appraisal", {
    request: borshBase64("appraisal_request_encode", request),
  });
  return answer as RequestAnswer;
}

/** What one demo identity is created with: enough NEAR for its own gas, and nothing else. */
export const IDENTITY_NEAR = NEAR;

/**
 * One funded buyer identity: a fresh account, musdc minted to it by the faucet, and the whole lot
 * deposited into clearing's escrow. Returns the account id.
 *
 * `mint` registers the receiver's storage itself, so there is no `storage_deposit` step; the
 * deposit is `ft_transfer_call` with clearing's own `msg`, which is the only way money enters
 * escrow (SDD §3.9.1). The escrow balance is read back rather than assumed, because
 * `ft_on_transfer` refunds the whole amount when it does not like the token or the message, and a
 * refund is a successful transaction that credited nothing.
 */
export async function makeIdentity(
  chain: DemoChain,
  env: DemoEnv,
  id: string,
  tokens: string,
  log: Log,
): Promise<string> {
  await chain.create(id, IDENTITY_NEAR);
  await chain.call(env.faucet, env.token, "mint", { account_id: id, amount: tokens });
  await chain.call(id, env.token, "ft_transfer_call", {
    receiver_id: env.clearing,
    amount: tokens,
    msg: JSON.stringify({ Deposit: { account: id } }),
  }, 1n);
  const balance = await balanceOf(chain, env, id);
  if (balance !== tokens) throw new Error(`${id} deposited ${tokens} but its escrow balance is ${balance}`);
  log(`      ${id}: created, ${amount(tokens)} ${env.token} minted and deposited into escrow`);
  return id;
}
