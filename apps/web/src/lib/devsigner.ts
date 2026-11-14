/**
 * A sandbox-only dev signer (E14.4).
 *
 * MyNearWallet and Meteor know testnet and mainnet and nothing else, so on the local sandbox node
 * `config.walletUrl` is null, `components/wallet` stays unavailable, and a browser can read the
 * chain but sign nothing. That makes the demo — publish, appraise, settle, decrypt, verify —
 * unwalkable on a laptop. This is the way round it: the operator pastes an account and its secret
 * key out of `deploy/.keys/<profile>.json`, the key stays in that browser, and the same
 * `{contract, method, args, deposit, gas}` descriptor the wallet path takes is signed here and
 * broadcast to the sandbox node.
 *
 * It is a development aid and nothing else. SDD §1.6's bar — "'Ready' means the surface works end
 * to end on **testnet** from a fresh browser" — is not met by anything this file does, and the UI
 * says so (`DEV_SIGNER_BANNER`). Two things keep it honest:
 *
 * 1. **It is refused anywhere but a local sandbox.** `devSignerAllowed` demands a network that is
 *    not one of the public ones, a `walletUrl` of null (which `config.walletFor` only ever returns
 *    for a network no wallet knows) *and* an RPC URL on this machine's loopback interface. Naming a
 *    deployment "sandbox" does not make it one: the transaction still has to go to 127.0.0.1.
 * 2. **The server never sees the key.** Nothing here is a route handler and nothing here posts to
 *    one. The only thing that leaves the browser is the signed transaction's bytes, exactly as a
 *    wallet would send them, and the public key the nonce is read for.
 *
 * The transaction itself is built and signed by `@near-js/{crypto,signers,transactions,utils}`,
 * which `@near-wallet-selector/core` already pulls into this app's bundle; none of NEAR's encoding
 * is reimplemented here.
 */
import { KeyPair, type KeyPairString } from '@near-js/crypto';
import { KeyPairSigner } from '@near-js/signers';
import { actionCreators, createTransaction, encodeTransaction } from '@near-js/transactions';
import { baseDecode } from '@near-js/utils';

import type { Fetch } from './chain';

/** Gas a call gets when its descriptor names none: 100 TGas, which is what the wallet path uses. */
export const DEFAULT_GAS = '100000000000000';

/** Where this browser keeps the dev key. Versioned, so a layout change cannot be misread. */
export const DEV_KEY_STORAGE_KEY = 'marginal.devsigner.v1';

/** The marker's heading. It never says "wallet": this is not one. */
export const DEV_SIGNER_TITLE = 'Sandbox dev key';

/**
 * The line shown wherever the connect state shows, for as long as the dev signer is in use. Same
 * voice as `simulated.ts`: say plainly what is not real, and claim nothing about testnet.
 */
export const DEV_SIGNER_BANNER =
  'Signing with a local sandbox dev key, not a wallet. The key was pasted into this browser and ' +
  'stays in it; it signs for an account on a throwaway local node, which is not a testnet or ' +
  'mainnet account and holds no real value. A surface counts as ready only when it works from a ' +
  'browser wallet on testnet, and this is not that.';

/**
 * What the dialog says before a key is pasted. The last sentence is AC-29's rule: forgetting the
 * key is this browser dropping its copy, and nothing more — no revocation, no undoing.
 */
export const DEV_SIGNER_NOTE =
  'Paste an account and its secret key from deploy/.keys/<profile>.json, which only an operator ' +
  'running the local node has. The key is kept in this browser and is never sent to a server: the ' +
  'transaction is signed here, and only the signed bytes go to the local node. Forgetting the key ' +
  "drops this browser's copy of it. It does not revoke the key on the node, and the records of " +
  'anything already signed with it stay on the chain.';

/** A call the page wants signed. The SDK's builders return exactly this shape. */
export interface TxDescriptor {
  readonly contract: string;
  readonly method: string;
  readonly args: Record<string, unknown>;
  /** Yocto-NEAR, as a decimal string. */
  readonly deposit?: string;
  /** Gas, as a decimal string of gas units. */
  readonly gas?: string;
}

/**
 * What the dev signer needs of `WebConfig`. Declared here rather than imported so this file reads
 * only what `config.ts` already exposes, and `WebConfig` satisfies it structurally.
 */
export interface DevSignerConfig {
  readonly network: string;
  readonly rpcUrl: string;
  readonly walletUrl: string | null;
}

/** An account and the key that signs for it. Never leaves the browser. */
export interface DevIdentity {
  readonly accountId: string;
  readonly secretKey: KeyPairString;
}

/** The part of `localStorage` this uses. Every call to it is wrapped: a browser may refuse. */
export interface DevKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Networks a browser wallet knows. The dev signer is refused on every one of them. */
const PUBLIC_NETWORKS = new Set(['mainnet', 'testnet', 'betanet']);

/** Hosts that are this machine. `near-sandbox` serves `http://127.0.0.1:<port>`. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

/** Whether an RPC URL points at a node on this machine. Anything unparseable is not. */
export function isLoopbackRpc(rpcUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rpcUrl).hostname;
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(host.replace(/^\[|\]$/g, ''));
}

/**
 * Whether this deployment may use the dev signer at all. Three things must hold at once, and no
 * environment variable can make them hold on a real network: a public network name is refused
 * outright, `walletUrl` is non-null on exactly the networks a wallet knows, and the RPC the
 * transaction would go to has to be on this machine.
 */
export function devSignerAllowed(config: DevSignerConfig): boolean {
  if (PUBLIC_NETWORKS.has(config.network)) return false;
  if (config.walletUrl !== null) return false;
  return isLoopbackRpc(config.rpcUrl);
}

/** The banner for this deployment, or null when the dev signer is not in play. */
export function devSignerBanner(config: DevSignerConfig): string | null {
  return devSignerAllowed(config) ? DEV_SIGNER_BANNER : null;
}

/** NEAR's account id rule: lowercase parts of a-z, 0-9, `-` and `_`, separated by `.`. */
const ACCOUNT_ID = /^(?:[a-z\d]+(?:[-_][a-z\d]+)*\.)*[a-z\d]+(?:[-_][a-z\d]+)*$/;

/** An account id as the contracts would see it, or a refusal naming what is wrong with it. */
export function parseAccountId(text: string): string {
  const id = text.trim();
  if (id.length < 2 || id.length > 64 || !ACCOUNT_ID.test(id)) {
    throw new Error(
      `"${id}" is not a NEAR account id: 2 to 64 characters of a-z, 0-9, "-" and "_", in parts ` +
        'separated by ".", like gov.sandbox',
    );
  }
  return id;
}

/**
 * A secret key, checked before anything is done with it. Only `ed25519` is accepted, because that
 * is what `deploy/.keys/<profile>.json` and near-cli write, and a wrong length is refused rather
 * than truncated: `KeyPairEd25519` takes the first 32 bytes of whatever it is given, so a key
 * pasted one character short would otherwise sign as some other key.
 */
export function parseDevKey(text: string): KeyPairString {
  const key = text.trim();
  const prefix = 'ed25519:';
  if (!key.startsWith(prefix)) {
    throw new Error(
      'that is not a NEAR secret key: paste the whole "ed25519:<base58>" line from ' +
        'deploy/.keys/<profile>.json',
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = baseDecode(key.slice(prefix.length));
  } catch (cause) {
    throw new Error('that NEAR secret key is not base58: check the whole line was copied', {
      cause,
    });
  }
  if (bytes.length !== 32 && bytes.length !== 64) {
    throw new Error(
      `that NEAR secret key decodes to ${bytes.length} bytes, and an ed25519 secret key is 32 or 64`,
    );
  }
  return key as KeyPairString;
}

/**
 * This browser's storage, or null when there is none. Reading the property itself can throw — a
 * browser with site data blocked does exactly that — so even the lookup is wrapped.
 */
export function devKeyStorage(): DevKeyStorage | null {
  try {
    return (globalThis.localStorage as DevKeyStorage | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * The key this browser kept, or null. A storage that throws, has nothing, or holds something that
 * no longer validates all read as "no key": the person pastes one again, which always works.
 */
export function loadDevKey(
  config: DevSignerConfig,
  storage: DevKeyStorage | null,
): DevIdentity | null {
  if (!devSignerAllowed(config) || storage === null) return null;
  try {
    const raw = storage.getItem(DEV_KEY_STORAGE_KEY);
    if (raw === null) return null;
    const saved = JSON.parse(raw) as { accountId?: unknown; secretKey?: unknown };
    return {
      accountId: parseAccountId(String(saved.accountId)),
      secretKey: parseDevKey(String(saved.secretKey)),
    };
  } catch {
    return null;
  }
}

/**
 * Keeps the key in this browser, and nowhere else. Refused outright off a local sandbox, so a
 * testnet or mainnet page stores nothing even if it is asked to.
 */
export function saveDevKey(
  config: DevSignerConfig,
  storage: DevKeyStorage | null,
  identity: DevIdentity,
): void {
  if (!devSignerAllowed(config) || storage === null) return;
  try {
    storage.setItem(DEV_KEY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // A browser that refuses to store it still signs for the rest of this session.
  }
}

/** Drops this browser's copy of the key. It revokes nothing on the node (AC-29). */
export function clearDevKey(storage: DevKeyStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(DEV_KEY_STORAGE_KEY);
  } catch {
    // Nothing more can be done about it, and the session's own copy is already gone.
  }
}

/** The message an RPC reply carries when it refused, or null when it did not. */
export function rpcFailure(reply: unknown): string | null {
  const error = (reply as { error?: { message?: string; data?: unknown } } | null)?.error;
  if (error === undefined) return null;
  if (typeof error.data === 'string') return error.data;
  if (error.data !== undefined) return JSON.stringify(error.data);
  return error.message ?? 'the RPC refused the call';
}

/**
 * The contract's own words when a transaction executed and failed, or null when it did not fail.
 * `ExecutionError` is where a `require!` ends up, so an `E_*` code comes back as itself and
 * `chain.ts`'s `errorCode` can pick it out.
 */
export function txFailureMessage(outcome: unknown): string | null {
  const failure = (outcome as { status?: { Failure?: unknown } } | null)?.status?.Failure;
  if (failure === undefined) return null;
  const text = JSON.stringify(failure);
  return /"ExecutionError":"((?:[^"\\]|\\.)*)"/.exec(text)?.[1] ?? text;
}

interface AccessKeyView {
  readonly nonce?: number;
  readonly block_hash?: string;
}

interface TxOutcome {
  readonly status?: unknown;
  readonly transaction_outcome?: { readonly id?: string };
}

/** One JSON-RPC call against the sandbox node, with the node's own message on a refusal. */
async function rpcCall<T>(
  config: DevSignerConfig,
  fetchImpl: Fetch,
  method: string,
  params: unknown,
): Promise<T> {
  const response = await fetchImpl(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'marginal', method, params }),
  });
  if (!response.ok) throw new Error(`${method}: the RPC answered ${response.status}`);
  const reply = (await response.json()) as { result?: T };
  const refused = rpcFailure(reply);
  if (refused !== null) throw new Error(`${method}: ${refused}`);
  if (reply.result === undefined) throw new Error(`${method}: the RPC returned no result`);
  return reply.result;
}

/**
 * The nonce the next transaction must carry and a recent block hash, read in one call. A missing
 * account, or a key that is not on the account, surfaces as the node's own message.
 *
 * Only the *public* key is sent.
 */
async function accessKeyOf(
  config: DevSignerConfig,
  identity: DevIdentity,
  fetchImpl: Fetch,
): Promise<{ nonce: bigint; blockHash: Uint8Array }> {
  const publicKey = KeyPair.fromString(identity.secretKey).getPublicKey().toString();
  const view = await rpcCall<AccessKeyView>(config, fetchImpl, 'query', {
    request_type: 'view_access_key',
    finality: 'optimistic',
    account_id: identity.accountId,
    public_key: publicKey,
  });
  if (typeof view.nonce !== 'number' || typeof view.block_hash !== 'string') {
    throw new Error(`${identity.accountId}: the RPC returned no nonce for ${publicKey}`);
  }
  return { nonce: BigInt(view.nonce) + 1n, blockHash: baseDecode(view.block_hash) };
}

/** The refusal that makes this a sandbox-only aid. It happens before any network call. */
function refuseUnlessSandbox(config: DevSignerConfig): void {
  if (!devSignerAllowed(config)) {
    throw new Error(
      `the dev signer is for a local sandbox node only, and ${config.network} at ${config.rpcUrl} ` +
        'is not one: sign with a browser wallet there',
    );
  }
}

/** Base64 of raw bytes, without `Buffer`, which no browser has. */
function base64Bytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Proves the key is a live access key of the account before anything is signed with it, so a typo
 * is a sentence from the node rather than a transaction that silently never lands.
 */
export async function checkDevKey(
  config: DevSignerConfig,
  identity: DevIdentity,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<void> {
  refuseUnlessSandbox(config);
  await accessKeyOf(config, identity, fetchImpl);
}

/**
 * What the person typed, turned into a usable identity: validated, proved against the node, and
 * kept in this browser. Nothing touches the network until both fields have parsed.
 */
export async function acceptDevKey(
  config: DevSignerConfig,
  storage: DevKeyStorage | null,
  typed: { account: string; key: string },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<DevIdentity> {
  const identity: DevIdentity = {
    accountId: parseAccountId(typed.account),
    secretKey: parseDevKey(typed.key),
  };
  await checkDevKey(config, identity, fetchImpl);
  saveDevKey(config, storage, identity);
  return identity;
}

/**
 * Signs one descriptor with the dev key and sends it to the sandbox node, returning the
 * transaction hash — the same thing `useWallet().send` returns on the wallet path.
 *
 * A contract panic comes back as the contract's own message, so `E_*` reaches the page intact.
 */
export async function sendWithDevKey(
  config: DevSignerConfig,
  identity: DevIdentity,
  request: TxDescriptor,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<string> {
  refuseUnlessSandbox(config);
  const { nonce, blockHash } = await accessKeyOf(config, identity, fetchImpl);
  const signer = KeyPairSigner.fromSecretKey(identity.secretKey);
  const action = actionCreators.functionCall(
    request.method,
    // Bytes, not an object: `stringifyJsonOrBytes` would reach for `Buffer` on an object, and a
    // browser has none. The contracts take JSON, so this is the same bytes a wallet would send.
    new TextEncoder().encode(JSON.stringify(request.args)),
    BigInt(request.gas ?? DEFAULT_GAS),
    BigInt(request.deposit ?? '0'),
  );
  const [, signed] = await signer.signTransaction(
    createTransaction(
      identity.accountId,
      await signer.getPublicKey(),
      request.contract,
      nonce,
      [action],
      blockHash,
    ),
  );
  const outcome = await rpcCall<TxOutcome>(config, fetchImpl, 'broadcast_tx_commit', [
    base64Bytes(encodeTransaction(signed)),
  ]);
  const failed = txFailureMessage(outcome);
  if (failed !== null) throw new Error(`${request.method}: ${failed}`);
  return outcome.transaction_outcome?.id ?? '';
}
