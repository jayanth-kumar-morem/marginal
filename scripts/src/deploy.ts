import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions, baseEncode, type KeyPairString } from "near-api-js";
import { call } from "@marginal/core-wasm";
import { issuerKey } from "@marginal/compliance";
import { NEAR, TERA, accountExists, borshBase64, view } from "./chain.js";
import { fullAccounts, simEnv, type FeeTableEntry, type MeasurementSetEntry, type PlatformEntry, type Profile } from "./profile.js";

export interface DeployContext {
  rpcUrl: string;
  /** Secret key of `profile.accounts.deployer`. */
  deployerKey: KeyPairString;
  /** Directory holding `<crate>/<crate>.wasm` (cargo-near output). */
  wasmDir: string;
  /** `circuits/`: the committed verifying key for sealed verdicts, and the SHA256SUMS that pins it. */
  circuitsDir: string;
  log?: (line: string) => void;
  /**
   * Called with every secret key as soon as its account exists on chain, so a deploy that fails
   * halfway never loses the keys of accounts it already created.
   */
  saveKeys?: (keys: DeployKeys) => void;
  /** Source revision recorded in the manifest. */
  git?: { commit: string; dirty: boolean };
}

export interface ContractRecord {
  account: string;
  wasm_sha256: string;
  /** On-chain code hash (base58); must equal the base58 of `wasm_sha256`. */
  code_hash: string;
}

/**
 * The methods the operator agent calls, from `services/operator-agent/src/index.ts`: the two it
 * drives itself on KeyPolicy and the room's relay allow-list (`ALLOWED` there). The record exists so
 * a reader can see exactly what the agent's key is for; it is not enforced by the key, because the
 * agent attaches storage deposits (`issue_nonce`, `register_room*` and `authorize` all charge a
 * fee) and the protocol refuses a deposit from a function-call access key.
 */
export const AGENT_METHODS = {
  keypolicy: ["issue_nonce", "register_room", "register_room_simulated", "authorize", "derive"],
  clearing: ["submit_verdict", "submit_delivery_receipt", "submit_provisioning", "submit_screening"],
} as const;

/** The operator agent's account, as the manifest records it. The secret key is never written here. */
export interface AgentRecord {
  account: string;
  public_key: string;
  /** `full` until a room's storage deposits are paid some other way: see [`AGENT_METHODS`]. */
  key: "full";
  calls: { keypolicy: readonly string[]; clearing: readonly string[] };
}

/** What the seed step put on chain (E14.4), so nobody has to be told twice what was approved. */
export interface SeededPolicy {
  measurement_sets: MeasurementSetEntry[];
  platforms: PlatformEntry[];
}

export interface Manifest {
  /** 2 adds `attestation` and `room_policy` (E14.4). */
  manifest_version: 2;
  profile: string;
  network: string;
  chain_id: string;
  rpc: string[];
  deployed_at: string;
  git: { commit: string; dirty: boolean } | null;
  accounts: { deployer: string; gov: string; faucet: string; agent: string };
  /** The operator agent's account and what its key may do (`MARGINAL_AGENT_ACCOUNT`). */
  agent: AgentRecord;
  contracts: { musdc: ContractRecord; clearing: ContractRecord; keypolicy: ContractRecord };
  /**
   * Which KeyPolicy this deployment runs. `simulated` means `keypolicy-sim`, which admits a room
   * that proves nothing (SDD §6.1); `contracts.keypolicy.wasm_sha256` differs accordingly, which is
   * the signal nobody can edit out of a record.
   */
  attestation: "simulated" | "real";
  /** The room policy the deploy seeded into clearing's registry. */
  room_policy: SeededPolicy;
  /** The verifying key sealed verdicts are checked against, or null when this deploy seeded none. */
  verifying_key: { file: string; sha256: string } | null;
  /** Access keys on the KeyPolicy account. Must be 0 (SDD §3.12.6): it is created keyless. */
  keypolicy_access_keys: number;
  config: { clearing: unknown; keypolicy: unknown };
  /** Public keys of the accounts we control; secret keys are never written here. */
  public_keys: Record<string, string>;
}

/** Secrets for the accounts created by a deploy. Written to a gitignored file, never to the manifest. */
export interface DeployKeys {
  [accountId: string]: string;
}

const GAS_INIT = 30n * TERA;
/** One registry write and its audit entry. `admit_platform` and `approve_measurement_set` do no calls. */
const GAS_SEED = 30n * TERA;

const WASM = { musdc: "musdc", clearing: "clearing", keypolicy: "keypolicy", keypolicySim: "keypolicy-sim" } as const;

const MILLINEAR = NEAR / 1000n;
/**
 * Clearing's storage fees, mirrored from `contracts/clearing/src/fees.rs`: `SET_FEE` is 20 and
 * `PLATFORM_FEE` 10 millinear. `charge()` refuses anything **below** the fee and keeps what is
 * attached, so a caller attaches exactly it.
 */
const SET_FEE = 20n * MILLINEAR;
const PLATFORM_FEE = 10n * MILLINEAR;

/** 32 bytes of hex: what a compliance seed and the upload HMAC key are. */
const SECRET = /^[0-9a-f]{64}$/;

/**
 * Everything `deploy/services/docker-compose.yaml` interpolates, so the command the deploy prints
 * is true and the compose warns about nothing. The compose file is the authority for this list.
 *
 * Two of these must **survive a re-deploy**: the compliance service's seeds are what its issuer and
 * compliance keys are derived from, and clearing was seeded with those public keys from the profile,
 * so fresh seeds would silently invalidate every credential and payout approval. They are kept when
 * the file already holds valid ones and generated only when it does not. The upload secret is an
 * HMAC key for short-lived upload grants and is fresh every deploy; a NEAR AI key is the operator's
 * and is kept if it is there.
 */
export function servicesEnv(
  p: Profile,
  manifest: Manifest,
  keys: DeployKeys,
  existing: Record<string, string>,
  random: () => string = () => randomBytes(32).toString("hex"),
): { env: Record<string, string>; generated: string[] } {
  const generated: string[] = [];
  const kept = (name: string): string => {
    const was = existing[name];
    if (was !== undefined && SECRET.test(was)) return was;
    generated.push(name);
    return random();
  };
  const sim = simEnv(p);
  return {
    generated,
    env: {
      MARGINAL_RPC_URL: manifest.rpc[0] as string,
      MARGINAL_CHAIN_ID: manifest.chain_id,
      MARGINAL_CLEARING: manifest.contracts.clearing.account,
      MARGINAL_KEYPOLICY: manifest.contracts.keypolicy.account,
      MARGINAL_AGENT_ACCOUNT: manifest.agent.account,
      MARGINAL_AGENT_KEY: keys[manifest.agent.account] as string,
      MARGINAL_UPLOAD_SECRET: random(),
      MARGINAL_ISSUER_SEED: kept("MARGINAL_ISSUER_SEED"),
      MARGINAL_COMPLIANCE_SEED: kept("MARGINAL_COMPLIANCE_SEED"),
      MARGINAL_ALLOWED_IDENTITIES: p.services.allowed_identities.join(","),
      // Optional for the compose (`${…:-}`), written anyway so the file is the whole environment.
      MARGINAL_NEARAI_KEY: existing["MARGINAL_NEARAI_KEY"] ?? "",
      MARGINAL_SIM_MEASUREMENT: sim["MARGINAL_SIM_MEASUREMENT"] ?? "",
      MARGINAL_SIM_PPID: sim["MARGINAL_SIM_PPID"] ?? "",
    },
  };
}

/**
 * Whether the keys clearing was seeded with are the ones the host services will actually sign with.
 * One line per mismatch, naming the public key to paste into the profile — never a seed.
 *
 * This is the one way a careless re-deploy breaks identity and payouts silently: the seeds live in a
 * gitignored file and the public keys are committed, so the two can drift apart without any error.
 */
export function complianceKeyWarnings(p: Profile, env: Record<string, string>, profileFile: string): string[] {
  const pairs = [
    ["issuer_key", p.clearing.issuer_key, env["MARGINAL_ISSUER_SEED"]],
    ["compliance_key", p.clearing.compliance_key, env["MARGINAL_COMPLIANCE_SEED"]],
  ] as const;
  const lines: string[] = [];
  for (const [field, onChain, seed] of pairs) {
    const derived = issuerKey(new Uint8Array(Buffer.from(seed as string, "hex"))).publicKey;
    if (onChain !== derived)
      lines.push(
        `!!! clearing.${field} is ${onChain ?? "unset"} but the host services will sign with ${derived}: ` +
          `set clearing.${field} = "${derived}" in ${profileFile} and deploy again, or every credential it signs is rejected on chain`,
      );
  }
  return lines;
}

/** The committed circuit's verifying key (E10.1) and the file that pins it. */
const VKEY_FILE = "formula_knowledge_v1.vkey.json";
const SHA256SUMS = "SHA256SUMS";

/**
 * The verifying key sealed verdicts are checked against (SDD §3.17), from the committed artefact in
 * `circuits/`.
 *
 * Two things make it trustworthy. The file is checked against the `SHA256SUMS` beside it, so a
 * swapped key fails here rather than failing every sealed verdict on chain for no visible reason;
 * and the bytes are **prepared by `marginal-core`** (`groth16_vkey_prepare`), because clearing
 * stores the key already in the form the `alt_bn128` host functions take and decoding a key on
 * chain would cost more gas than the verification it enables.
 */
export function preparedVerifyingKey(dir: string): { key: string; sha256: string; file: string } {
  const path = join(dir, VKEY_FILE);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`missing ${path}: the circuit's verifying key is committed in circuits/`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sums = readFileSync(join(dir, SHA256SUMS), "utf8");
  const pinned = sums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1] === VKEY_FILE);
  if (pinned === undefined) throw new Error(`${join(dir, SHA256SUMS)} does not pin ${VKEY_FILE}`);
  if (pinned[0] !== sha256) throw new Error(`${path}: sha256 ${sha256} is not the committed ${pinned[0]}`);
  const prepared = call("groth16_vkey_prepare", JSON.parse(bytes.toString("utf8"))) as string;
  return { key: Buffer.from(prepared, "hex").toString("base64"), sha256, file: VKEY_FILE };
}

/**
 * Initial balances. Testnet is sized to storage (about 1 NEAR per 100 KB of code and state) plus
 * headroom, so one faucet top-up covers a deploy. Top accounts up later as contracts grow.
 *
 * The agent holds no state: its balance is gas and the storage deposits it attaches for the room
 * (a registration is 10 millinear, a ticket 5), so 1 NEAR is thousands of jobs on testnet.
 */
export function balances(network: string) {
  return network === "sandbox"
    ? { gov: 5n * NEAR, faucet: 5n * NEAR, token: 10n * NEAR, clearing: 50n * NEAR, keypolicy: 10n * NEAR, agent: 5n * NEAR }
    : { gov: 1n * NEAR, faucet: 1n * NEAR, token: 3n * NEAR, clearing: 8n * NEAR, keypolicy: 4n * NEAR, agent: 1n * NEAR };
}

/** Gas and rounding headroom the deployer keeps on top of the balances it hands out. */
const DEPLOY_GAS_HEADROOM = 1n * NEAR;

export function requiredDeployerBalance(network: string): bigint {
  return Object.values(balances(network)).reduce((a, b) => a + b, 0n) + DEPLOY_GAS_HEADROOM;
}

const fmtNear = (y: bigint) => `${y / NEAR}.${((y % NEAR) * 100n / NEAR).toString().padStart(2, "0")} NEAR`;

/**
 * Reads `dir/<crate>/<file>.wasm`. `file` defaults to the crate, because that is what `cargo near
 * build` writes — except for `keypolicy-sim`, which is the keypolicy crate built with a feature into
 * its own directory, so the file inside is still `keypolicy.wasm` (Makefile, `wasm-dev`).
 */
function readWasm(dir: string, crate: string, file: string = crate): { bytes: Uint8Array; sha256: string } {
  const path = join(dir, crate, `${file}.wasm`);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`missing ${path}: build the contracts first (make wasm)`);
  }
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export interface ClearingConfig {
  gov: string;
  keypolicy: string;
  chain_id: string;
  profile: Profile["hdp"] & { profile: string };
  /** Bumped once by every policy write, so it counts what the seed step landed. */
  policy_version: number;
  /** The settlement token allow-list; `create_listing` refuses a listing in any other token. */
  tokens: string[];
  fees: FeeTableEntry;
}
export interface KeyPolicyConfig {
  registry: string;
  clearing: string;
  ckd_domain_id: number;
}

/**
 * What must hold after a deploy, read back from the chain. KeyPolicy has no access keys (SDD §3.12.6),
 * and in M1 its registry is clearing itself.
 *
 * `seeded` is the seed step's own check, read back from clearing's own config: `writes` is how many
 * gov calls the profile asked for and `policy_version` starts at 0 and rises by one per policy
 * write, so a deploy that was asked to seed and did not fails here instead of leaving a chain that
 * looks deployed and is dead — no appraiser means no listing, and no approved measurement set and
 * platform means `admit_room` refuses every room.
 */
export function verifyDeployment(
  ids: { gov: string; clearing: string; keypolicy: string },
  clearing: ClearingConfig,
  keypolicy: KeyPolicyConfig,
  keypolicyAccessKeys: number,
  seeded: { writes: number; fees: FeeTableEntry; token: string; escrowStorage: { total: string } | null },
): void {
  if (keypolicyAccessKeys !== 0) throw new Error(`keypolicy has ${keypolicyAccessKeys} access key(s); it must have none`);
  if (clearing.gov !== ids.gov) throw new Error("clearing.gov mismatch");
  if (clearing.keypolicy !== ids.keypolicy) throw new Error("clearing.keypolicy mismatch: only keypolicy may admit rooms");
  if (keypolicy.registry !== keypolicy.clearing || keypolicy.clearing !== ids.clearing) throw new Error("keypolicy.registry must equal clearing in M1");
  if (clearing.policy_version < seeded.writes)
    throw new Error(
      `seeding: ${seeded.writes} policy calls were made but clearing's policy_version is ${clearing.policy_version}; ` +
        "without an appraiser, a fee table and an approved measurement set and platform this chain cannot list or register anything",
    );
  if (clearing.tokens.length !== 1 || clearing.tokens[0] !== seeded.token)
    throw new Error(`clearing's settlement tokens are ${JSON.stringify(clearing.tokens)}; this deploy's token is ${seeded.token}`);
  // NEP-141 again, read back off the token: an unregistered escrow refuses every deposit.
  if (seeded.escrowStorage === null)
    throw new Error(`${ids.clearing} holds no storage entry on ${seeded.token}; every deposit into escrow would be refused as "not registered"`);
  for (const key of Object.keys(seeded.fees) as (keyof FeeTableEntry)[]) {
    if (clearing.fees[key] !== seeded.fees[key])
      throw new Error(`clearing.fees.${key} is ${clearing.fees[key]} on chain, the profile says ${seeded.fees[key]}`);
  }
}

/** The chain must hold exactly the wasm we built: its code hash is the base58 of the wasm's SHA-256. */
export function assertCodeHash(id: string, onChain: string, wasmSha256: string): void {
  const expected = baseEncode(Buffer.from(wasmSha256, "hex"));
  if (onChain !== expected) throw new Error(`${id}: on-chain code hash ${onChain} != built wasm ${expected}`);
}

export async function deployAll(p: Profile, ctx: DeployContext): Promise<{ manifest: Manifest; keys: DeployKeys }> {
  const log = ctx.log ?? (() => {});
  const ids = fullAccounts(p);
  const bal = balances(p.network);
  const provider = new JsonRpcProvider({ url: ctx.rpcUrl });
  const deployer = new Account(ids.deployer, provider, ctx.deployerKey);

  // The validator refuses this already; so does this, because a hand-edited profile, a caller that
  // builds a Profile itself or a future refactor must not be able to put a KeyPolicy that admits
  // unproven rooms on a real network.
  const simulated = p.keypolicy.simulated_rooms;
  if (simulated && p.network !== "sandbox")
    throw new Error(`profile ${p.profile} asks for simulated rooms on ${p.network}: simulated rooms must never reach testnet or mainnet`);

  const wasms = {
    musdc: readWasm(ctx.wasmDir, WASM.musdc),
    clearing: readWasm(ctx.wasmDir, WASM.clearing),
    // `keypolicy-sim` is the keypolicy crate built with `sim-attestation`; the file inside its
    // directory is still `keypolicy.wasm`.
    keypolicy: simulated ? readWasm(ctx.wasmDir, WASM.keypolicySim, WASM.keypolicy) : readWasm(ctx.wasmDir, WASM.keypolicy),
  };
  log(
    simulated
      ? `!!! SIMULATED ATTESTATION: deploying ${WASM.keypolicySim}, which admits rooms that prove nothing (sandbox only, SDD §6.1)`
      : "attestation: the real keypolicy, which admits a room only against a verified TDX quote",
  );

  // Fresh deploys only: refuse to touch accounts that already exist.
  for (const id of [ids.gov, ids.faucet, ids.token, ids.clearing, ids.keypolicy, ids.agent]) {
    if (await accountExists(provider, id)) throw new Error(`account ${id} already exists; up.sh only does fresh deploys`);
  }

  // Fail before creating anything if the deployer cannot fund the whole deploy.
  const need = requiredDeployerBalance(p.network);
  const have = BigInt((await provider.viewAccount({ accountId: ids.deployer })).amount);
  if (have < need) throw new Error(`deployer ${ids.deployer} has ${fmtNear(have)}; this deploy needs ${fmtNear(need)}. Top it up first.`);

  const keys: DeployKeys = {};
  const pub: Record<string, string> = {};

  /**
   * One transaction from the deployer: create the sub-account, fund it, add its key (unless
   * keyless), deploy the code and call `new`. Nothing can call `new` before we do, and a failed
   * init rolls back the whole account.
   */
  async function create(
    id: string,
    balance: bigint,
    opts: { keyless?: boolean; wasm?: { bytes: Uint8Array; sha256: string }; init?: Record<string, unknown> } = {},
  ): Promise<void> {
    const kp = opts.keyless ? undefined : KeyPair.fromRandom("ed25519");
    const acts = [actions.createAccount(), actions.transfer(balance)];
    if (kp) acts.push(actions.addFullAccessKey(kp.getPublicKey()));
    if (opts.wasm) acts.push(actions.deployContract(opts.wasm.bytes));
    if (opts.init) acts.push(actions.functionCall("new", opts.init, GAS_INIT, 0n));
    await deployer.signAndSendTransaction({ receiverId: id, actions: acts, waitUntil: "FINAL" });
    if (kp) {
      keys[id] = kp.toString();
      pub[id] = kp.getPublicKey().toString();
      ctx.saveKeys?.({ ...keys });
    }
    if (opts.wasm) {
      assertCodeHash(id, (await provider.viewAccount({ accountId: id })).code_hash, opts.wasm.sha256);
    }
  }

  log(`[0/6] creating gov (${ids.gov}), faucet (${ids.faucet}) and agent (${ids.agent}) accounts`);
  await create(ids.gov, bal.gov);
  await create(ids.faucet, bal.faucet);
  // The operator agent signs with this account (`MARGINAL_AGENT_ACCOUNT`). Its key is full access,
  // not the restricted function-call key `deploy/services/docker-compose.yaml` asks for, because
  // every call the agent makes for a room attaches a storage deposit and the protocol refuses a
  // deposit from a function-call key. [`AGENT_METHODS`] records what it is actually for.
  await create(ids.agent, bal.agent);
  log(`      agent key: full access, limited by nothing but ${ids.agent}'s own balance (see AGENT_METHODS)`);

  log(`[1/6] deploying musdc to ${ids.token}`);
  await create(ids.token, bal.token, { wasm: wasms.musdc, init: { faucet: ids.faucet } });

  log(`[2/6] deploying clearing to ${ids.clearing}`);
  await create(ids.clearing, bal.clearing, {
    wasm: wasms.clearing,
    init: {
      gov: ids.gov,
      keypolicy: ids.keypolicy,
      chain_id: p.chain_id,
      tokens: [ids.token],
      profile: {
        profile: p.profile,
        gov_profile: p.hdp.gov_profile,
        cooling_blocks: p.hdp.cooling_blocks,
        challenge_window_secs: p.hdp.challenge_window_secs,
        rules_enabled: p.hdp.rules_enabled,
        asset_classes_enabled: p.hdp.asset_classes_enabled,
      },
    },
  });

  // KeyPolicy is created keyless: no access key ever exists on it, which is stronger than
  // deleting one after init (SDD §3.12.6) and leaves no window in which a key could be used.
  log(`[3/6] deploying keypolicy to ${ids.keypolicy} (registry = clearing, keyless)`);
  await create(ids.keypolicy, bal.keypolicy, {
    keyless: true,
    wasm: wasms.keypolicy,
    init: {
      chain_id: p.chain_id,
      registry: ids.clearing,
      clearing: ids.clearing,
      mpc: p.keypolicy.mpc,
      ckd_domain_id: p.keypolicy.ckd_domain_id,
      dcap_verifier: p.keypolicy.dcap_verifier,
    },
  });

  // Everything governance has to set before the chain can be used, in one step and in order: the
  // appraisers and the fee table first, because `create_listing` refuses a listing without a
  // registered appraiser and a settlement token; then the keys; then the room policy, without which
  // `admit_room` refuses every room (`E_PLATFORM_NOT_ADMITTED`, `E_MEASUREMENT_NOT_APPROVED`).
  log("[4/6] seeding policy as gov");
  const gov = new Account(ids.gov, provider, keys[ids.gov] as KeyPairString);
  let writes = 0;
  const asGov = async (method: string, args: Record<string, unknown>, deposit: bigint, line: string): Promise<void> => {
    await gov.callFunction({ contractId: ids.clearing, methodName: method, args, deposit, gas: GAS_SEED, waitUntil: "FINAL" });
    writes += 1;
    log(`      ${line}`);
  };

  // NEP-141: nothing can be transferred to an account that holds no storage entry on the token, and
  // clearing is the escrow every deposit goes to (`ft_on_transfer`). It is also the only account
  // here that cannot do this for itself — a person or the operator calls `storage_deposit` from
  // their own wallet before claiming, and tokens only ever leave clearing to the caller of `claim`
  // or `withdraw_balance`, both of which need a key and one yocto. Without this line a buyer's very
  // first deposit fails with "The account <clearing> is not registered".
  const bounds = await view<{ min: string }>(provider, ids.token, "storage_balance_bounds");
  await gov.callFunction({
    contractId: ids.token,
    methodName: "storage_deposit",
    args: { account_id: ids.clearing },
    deposit: BigInt(bounds.min),
    gas: GAS_SEED,
    waitUntil: "FINAL",
  });
  log(`      ${ids.token} storage for the escrow ${ids.clearing}: ${bounds.min} yocto (storage_balance_bounds.min)`);

  for (const a of p.clearing.appraisers) {
    await asGov(
      "set_appraiser",
      { id: a.id, version: a.version, formula: a.formula, compute_fee: a.compute_fee, enabled: a.enabled },
      0n,
      `appraiser ${a.id}@${a.version} = ${a.formula}, compute fee ${a.compute_fee}, enabled ${a.enabled}`,
    );
  }
  const f = p.clearing.fees;
  await asGov(
    "set_fees",
    { fees: f },
    0n,
    `fees: buyer ${f.clearing_fee_buyer_bps} bps, seller ${f.clearing_fee_seller_bps} bps, split ` +
      `${f.treasury_bps}/${f.operator_pool_bps}/${f.assurance_pool_bps} treasury/operator/assurance`,
  );
  // Sealed verdicts (SDD §3.17, D10): without this key every sealed verdict is refused with
  // `E_PROOF_DISABLED`. The artefact is committed, so both profiles use the same one.
  let vkey: { key: string; sha256: string; file: string } | null = null;
  if (p.clearing.sealed_verdicts) {
    vkey = preparedVerifyingKey(ctx.circuitsDir);
    await asGov("set_verifying_key", { key: vkey.key }, 0n, `verifying key for sealed verdicts: ${vkey.file}, sha256 ${vkey.sha256}`);
  } else log("      !!! clearing.sealed_verdicts is off: a sealed verdict will be refused with E_PROOF_DISABLED");
  if (p.clearing.issuer_key !== null) await asGov("set_issuer_key", { key: p.clearing.issuer_key }, 0n, `issuer key ${p.clearing.issuer_key}`);
  else log("      !!! no clearing.issuer_key in the profile: identity credentials cannot be verified until gov sets one");
  if (p.clearing.compliance_key !== null)
    await asGov("set_compliance_key", { key: p.clearing.compliance_key }, 0n, `compliance key ${p.clearing.compliance_key}`);
  else log("      !!! no clearing.compliance_key in the profile: payout approvals cannot be verified until gov sets one");
  const signer = p.clearing.ai_signer;
  if (signer !== null) {
    // The contract takes an absolute expiry; the profile carries a TTL so a committed value cannot
    // go stale into the past, where `set_ai_signer` would remove the entry instead of adding it.
    const expires = Math.floor(Date.now() / 1000) + signer.ttl_secs;
    await asGov(
      "set_ai_signer",
      { address: signer.address, model: signer.model, expires_at: expires },
      0n,
      `NEAR AI signer ${signer.address} for ${signer.model}, expires at ${expires}`,
    );
  } else log("      no clearing.ai_signer in the profile: judge factors will be simulated and flagged on chain");

  log("      room policy:");
  for (const set of p.room_policy.measurement_sets) {
    await asGov(
      "approve_measurement_set",
      { set: borshBase64("measurement_set_encode", set) },
      SET_FEE,
      `measurement set ${set.id}: ${set.members.length} member(s), built from ${set.source_tag}`,
    );
  }
  for (const platform of p.room_policy.platforms) {
    await asGov(
      "admit_platform",
      { ppid: platform.ppid, operator: platform.operator, cap_per_epoch: platform.cap_per_epoch },
      PLATFORM_FEE,
      `platform ${platform.ppid} run by ${platform.operator}, cap ${platform.cap_per_epoch} per epoch`,
    );
  }
  if (p.room_policy.measurement_sets.length === 0 || p.room_policy.platforms.length === 0)
    log("      !!! this profile approves no measurement set or no platform: no room can register until gov approves both");

  log("[5/6] reading keypolicy's access keys");
  const left = (await provider.viewAccessKeyList({ accountId: ids.keypolicy })).keys.length;

  log("[6/6] verifying the deployment and building the manifest");
  const clearingCfg = await view<ClearingConfig>(provider, ids.clearing, "config");
  const keypolicyCfg = await view<KeyPolicyConfig>(provider, ids.keypolicy, "config");
  // `storage_balance_of` answers JSON null for an account the token does not know, which the view
  // helper's return type cannot express.
  const escrowStorage = (await view<object>(provider, ids.token, "storage_balance_of", { account_id: ids.clearing })) as { total: string } | null;
  verifyDeployment(ids, clearingCfg, keypolicyCfg, left, { writes, fees: p.clearing.fees, token: ids.token, escrowStorage });

  const rec = async (account: string, w: { sha256: string }): Promise<ContractRecord> => ({
    account,
    wasm_sha256: w.sha256,
    code_hash: (await provider.viewAccount({ accountId: account })).code_hash,
  });
  const manifest: Manifest = {
    manifest_version: 2,
    profile: p.profile,
    network: p.network,
    chain_id: p.chain_id,
    rpc: [ctx.rpcUrl],
    deployed_at: new Date().toISOString(),
    git: ctx.git ?? null,
    accounts: { deployer: ids.deployer, gov: ids.gov, faucet: ids.faucet, agent: ids.agent },
    agent: { account: ids.agent, public_key: pub[ids.agent] as string, key: "full", calls: AGENT_METHODS },
    contracts: {
      musdc: await rec(ids.token, wasms.musdc),
      clearing: await rec(ids.clearing, wasms.clearing),
      keypolicy: await rec(ids.keypolicy, wasms.keypolicy),
    },
    attestation: simulated ? "simulated" : "real",
    room_policy: { measurement_sets: p.room_policy.measurement_sets, platforms: p.room_policy.platforms },
    verifying_key: vkey === null ? null : { file: vkey.file, sha256: vkey.sha256 },
    keypolicy_access_keys: left,
    config: { clearing: clearingCfg, keypolicy: keypolicyCfg },
    public_keys: pub,
  };
  return { manifest, keys };
}
