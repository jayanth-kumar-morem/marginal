import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions, baseEncode, type KeyPairString } from "near-api-js";
import { NEAR, TERA, accountExists, view } from "./chain.js";
import { fullAccounts, type Profile } from "./profile.js";

export interface DeployContext {
  rpcUrl: string;
  /** Secret key of `profile.accounts.deployer`. */
  deployerKey: KeyPairString;
  /** Directory holding `<crate>/<crate>.wasm` (cargo-near output). */
  wasmDir: string;
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

export interface Manifest {
  manifest_version: 1;
  profile: string;
  network: string;
  chain_id: string;
  rpc: string[];
  deployed_at: string;
  git: { commit: string; dirty: boolean } | null;
  accounts: { deployer: string; gov: string; faucet: string };
  contracts: { musdc: ContractRecord; clearing: ContractRecord; keypolicy: ContractRecord };
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

const WASM = { musdc: "musdc", clearing: "clearing", keypolicy: "keypolicy" } as const;

/**
 * Initial balances. Testnet is sized to storage (about 1 NEAR per 100 KB of code and state) plus
 * headroom, so one faucet top-up covers a deploy. Top accounts up later as contracts grow.
 */
export function balances(network: string) {
  return network === "sandbox"
    ? { gov: 5n * NEAR, faucet: 5n * NEAR, token: 10n * NEAR, clearing: 50n * NEAR, keypolicy: 10n * NEAR }
    : { gov: 1n * NEAR, faucet: 1n * NEAR, token: 3n * NEAR, clearing: 8n * NEAR, keypolicy: 4n * NEAR };
}

/** Gas and rounding headroom the deployer keeps on top of the balances it hands out. */
const DEPLOY_GAS_HEADROOM = 1n * NEAR;

export function requiredDeployerBalance(network: string): bigint {
  return Object.values(balances(network)).reduce((a, b) => a + b, 0n) + DEPLOY_GAS_HEADROOM;
}

const fmtNear = (y: bigint) => `${y / NEAR}.${((y % NEAR) * 100n / NEAR).toString().padStart(2, "0")} NEAR`;

function readWasm(dir: string, crate: string): { bytes: Uint8Array; sha256: string } {
  const path = join(dir, crate, `${crate}.wasm`);
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
  profile: Profile["hdp"] & { profile: string };
}
export interface KeyPolicyConfig {
  registry: string;
  clearing: string;
  ckd_domain_id: number;
}

/**
 * What must hold after a deploy, read back from the chain. KeyPolicy has no access keys (SDD §3.12.6),
 * and in M1 its registry is clearing itself.
 */
export function verifyDeployment(
  ids: { gov: string; clearing: string },
  clearing: ClearingConfig,
  keypolicy: KeyPolicyConfig,
  keypolicyAccessKeys: number,
): void {
  if (keypolicyAccessKeys !== 0) throw new Error(`keypolicy has ${keypolicyAccessKeys} access key(s); it must have none`);
  if (clearing.gov !== ids.gov) throw new Error("clearing.gov mismatch");
  if (keypolicy.registry !== keypolicy.clearing || keypolicy.clearing !== ids.clearing) throw new Error("keypolicy.registry must equal clearing in M1");
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

  const wasms = {
    musdc: readWasm(ctx.wasmDir, WASM.musdc),
    clearing: readWasm(ctx.wasmDir, WASM.clearing),
    keypolicy: readWasm(ctx.wasmDir, WASM.keypolicy),
  };

  // Fresh deploys only: refuse to touch accounts that already exist.
  for (const id of [ids.gov, ids.faucet, ids.token, ids.clearing, ids.keypolicy]) {
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

  log(`[0/6] creating gov (${ids.gov}) and faucet (${ids.faucet}) accounts`);
  await create(ids.gov, bal.gov);
  await create(ids.faucet, bal.faucet);

  log(`[1/6] deploying musdc to ${ids.token}`);
  await create(ids.token, bal.token, { wasm: wasms.musdc, init: { faucet: ids.faucet } });

  log(`[2/6] deploying clearing to ${ids.clearing}`);
  await create(ids.clearing, bal.clearing, {
    wasm: wasms.clearing,
    init: {
      gov: ids.gov,
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

  log("[4/6] seeding room policy");
  const entries = p.room_policy.platforms.length + p.room_policy.measurement_sets.length;
  if (entries > 0) {
    // The registry module inside clearing arrives with E4.3. Fail loudly instead of silently skipping policy.
    throw new Error(`profile lists ${entries} room-policy entries but clearing has no room-policy module yet (E4.3)`);
  }
  log("      0 entries in the profile; nothing to seed");

  log("[5/6] reading keypolicy's access keys");
  const left = (await provider.viewAccessKeyList({ accountId: ids.keypolicy })).keys.length;

  log("[6/6] verifying the deployment and building the manifest");
  const clearingCfg = await view<ClearingConfig>(provider, ids.clearing, "config");
  const keypolicyCfg = await view<KeyPolicyConfig>(provider, ids.keypolicy, "config");
  verifyDeployment(ids, clearingCfg, keypolicyCfg, left);

  const rec = async (account: string, w: { sha256: string }): Promise<ContractRecord> => ({
    account,
    wasm_sha256: w.sha256,
    code_hash: (await provider.viewAccount({ accountId: account })).code_hash,
  });
  const manifest: Manifest = {
    manifest_version: 1,
    profile: p.profile,
    network: p.network,
    chain_id: p.chain_id,
    rpc: [ctx.rpcUrl],
    deployed_at: new Date().toISOString(),
    git: ctx.git ?? null,
    accounts: { deployer: ids.deployer, gov: ids.gov, faucet: ids.faucet },
    contracts: {
      musdc: await rec(ids.token, wasms.musdc),
      clearing: await rec(ids.clearing, wasms.clearing),
      keypolicy: await rec(ids.keypolicy, wasms.keypolicy),
    },
    keypolicy_access_keys: left,
    config: { clearing: clearingCfg, keypolicy: keypolicyCfg },
    public_keys: pub,
  };
  return { manifest, keys };
}
