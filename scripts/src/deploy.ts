import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, baseEncode, type KeyPairString } from "near-api-js";
import { fullAccounts, type Profile } from "./profile.js";

export interface DeployContext {
  rpcUrl: string;
  /** Secret key of `profile.accounts.deployer`. */
  deployerKey: KeyPairString;
  /** Directory holding `<crate>/<crate>.wasm` (cargo-near output). */
  wasmDir: string;
  log?: (line: string) => void;
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
  accounts: { deployer: string; gov: string; faucet: string };
  contracts: { musdc: ContractRecord; clearing: ContractRecord; keypolicy: ContractRecord };
  /** Number of access keys left on the KeyPolicy account. Must be 0 (SDD §3.12.6). */
  keypolicy_access_keys: number;
  config: { clearing: unknown; keypolicy: unknown };
  /** Public keys of the accounts we control; secret keys are never written here. */
  public_keys: Record<string, string>;
}

/** Secrets for the accounts created by a deploy. Written to a gitignored file, never to the manifest. */
export interface DeployKeys {
  [accountId: string]: string;
}

const TERA = 10n ** 12n;
const NEAR = 10n ** 24n;
const GAS_INIT = 30n * TERA;

const WASM = { musdc: "musdc", clearing: "clearing", keypolicy: "keypolicy" } as const;

function balances(network: string) {
  return network === "sandbox"
    ? { gov: 5n * NEAR, faucet: 5n * NEAR, token: 10n * NEAR, clearing: 50n * NEAR, keypolicy: 10n * NEAR }
    : { gov: 2n * NEAR, faucet: 2n * NEAR, token: 5n * NEAR, clearing: 15n * NEAR, keypolicy: 5n * NEAR };
}

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
    const exists = await new Account(id, provider).getState().then(
      () => true,
      () => false,
    );
    if (exists) throw new Error(`account ${id} already exists; up.sh only does fresh deploys`);
  }

  const keys: DeployKeys = {};
  const pub: Record<string, string> = {};
  const accounts = new Map<string, Account>();
  async function create(id: string, balance: bigint): Promise<Account> {
    const kp = KeyPair.fromRandom("ed25519");
    await deployer.createAccount({ newAccountId: id, publicKey: kp.getPublicKey().toString(), nearToTransfer: balance });
    keys[id] = kp.toString();
    pub[id] = kp.getPublicKey().toString();
    const acc = new Account(id, provider, new KeyPairSigner(kp));
    accounts.set(id, acc);
    return acc;
  }

  const view = <T>(contractId: string, method: string, args: Record<string, unknown> = {}) =>
    provider.callFunction<T>({ contractId, method, args }) as Promise<T>;

  async function deployContract(id: string, balance: bigint, wasm: { bytes: Uint8Array; sha256: string }): Promise<Account> {
    const acc = await create(id, balance);
    await acc.deployContract(wasm.bytes);
    const onChain = (await acc.getState()).code_hash;
    const expected = baseEncode(Buffer.from(wasm.sha256, "hex"));
    if (onChain !== expected) throw new Error(`${id}: on-chain code hash ${onChain} != built wasm ${expected}`);
    return acc;
  }

  log(`[0/6] creating gov (${ids.gov}) and faucet (${ids.faucet}) accounts`);
  await create(ids.gov, bal.gov);
  await create(ids.faucet, bal.faucet);

  log(`[1/6] deploying musdc to ${ids.token}`);
  const token = await deployContract(ids.token, bal.token, wasms.musdc);
  await token.callFunction({ contractId: ids.token, methodName: "new", args: { faucet: ids.faucet }, gas: GAS_INIT });

  log(`[2/6] deploying clearing to ${ids.clearing}`);
  const clearing = await deployContract(ids.clearing, bal.clearing, wasms.clearing);
  await clearing.callFunction({
    contractId: ids.clearing,
    methodName: "new",
    args: {
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
    gas: GAS_INIT,
  });

  log(`[3/6] deploying keypolicy to ${ids.keypolicy} (registry = clearing)`);
  const keypolicy = await deployContract(ids.keypolicy, bal.keypolicy, wasms.keypolicy);
  await keypolicy.callFunction({
    contractId: ids.keypolicy,
    methodName: "new",
    args: {
      chain_id: p.chain_id,
      registry: ids.clearing,
      clearing: ids.clearing,
      mpc: p.keypolicy.mpc,
      ckd_domain_id: p.keypolicy.ckd_domain_id,
      dcap_verifier: p.keypolicy.dcap_verifier,
    },
    gas: GAS_INIT,
  });

  log("[4/6] seeding room policy");
  const entries = p.room_policy.platforms.length + p.room_policy.measurement_sets.length;
  if (entries > 0) {
    // The registry module inside clearing arrives with E4.3. Fail loudly instead of silently skipping policy.
    throw new Error(`profile lists ${entries} room-policy entries but clearing has no room-policy module yet (E4.3)`);
  }
  log("      0 entries in the profile; nothing to seed");

  log("[5/6] deleting every access key on keypolicy");
  await keypolicy.deleteKey(pub[ids.keypolicy] as string);
  const left = (await new Account(ids.keypolicy, provider).getAccessKeyList()).keys.length;
  if (left !== 0) throw new Error(`keypolicy still has ${left} access key(s)`);
  // After this point KeyPolicy can only be called by others; its own key no longer exists.
  delete keys[ids.keypolicy];
  delete pub[ids.keypolicy];

  log("[6/6] reading back configuration and building the manifest");
  const clearingCfg = await view<{ gov: string; profile: Profile["hdp"] & { profile: string } }>(ids.clearing, "config");
  const keypolicyCfg = await view<{ registry: string; clearing: string; ckd_domain_id: number }>(ids.keypolicy, "config");
  if (clearingCfg.gov !== ids.gov) throw new Error("clearing.gov mismatch");
  if (keypolicyCfg.registry !== keypolicyCfg.clearing || keypolicyCfg.clearing !== ids.clearing)
    throw new Error("keypolicy.registry must equal clearing in M1");

  const rec = async (account: string, w: { sha256: string }): Promise<ContractRecord> => ({
    account,
    wasm_sha256: w.sha256,
    code_hash: (await new Account(account, provider).getState()).code_hash,
  });
  const manifest: Manifest = {
    manifest_version: 1,
    profile: p.profile,
    network: p.network,
    chain_id: p.chain_id,
    rpc: [ctx.rpcUrl],
    deployed_at: new Date().toISOString(),
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

export function writeJson(path: string, value: unknown, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", mode ? { mode } : undefined);
}
