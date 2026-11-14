import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { KeyPair } from "@near-js/crypto";
import { decodeSignedTransaction, encodeTransaction } from "@near-js/transactions";
import { baseEncode } from "@near-js/utils";

import type { Fetch } from "./chain";
import { errorCode } from "./chain";
import {
  DEFAULT_GAS,
  DEV_KEY_STORAGE_KEY,
  DEV_SIGNER_BANNER,
  DEV_SIGNER_NOTE,
  DEV_SIGNER_TITLE,
  type DevIdentity,
  type DevKeyStorage,
  type DevSignerConfig,
  checkDevKey,
  clearDevKey,
  devKeyStorage,
  devSignerAllowed,
  devSignerBanner,
  isLoopbackRpc,
  loadDevKey,
  parseAccountId,
  parseDevKey,
  rpcFailure,
  saveDevKey,
  sendWithDevKey,
  txFailureMessage,
  acceptDevKey,
} from "./devsigner";

// `near-sandbox`'s own genesis key: public, well known, and the one a local operator actually has.
const SECRET =
  "ed25519:3tgdk2wPraJzT4nsTuf86UX41xgPNk3MHnq8epARMdBNs29AFEztAuaQ7iHddDfXG9F2RzV1XNQYgJyAyoW51UBB";
const PUBLIC = "ed25519:5BGSaf6YjVm7565VzWQHNxoyEjwr3jUpRJSGjREvU9dB";
/** The same key as its bare 32-byte secret, which NEAR also writes. */
const SECRET_32 = "ed25519:AjUQF2dijcVMN5y8jWpkZyn7dPVRHys5r9RfK6ctZJY1";
/** 31 bytes: one character short of a key, which must be refused and never truncated. */
const SECRET_31 = "ed25519:3CtXBt7xg7EDmeq4Zk1Q1g9QhsQf8UPDt1YsNKVXG2F";
/** 32 base58 zeroes: a well-formed block hash. */
const BLOCK_HASH = "11111111111111111111111111111111";

const SANDBOX: DevSignerConfig = {
  network: "sandbox",
  rpcUrl: "http://127.0.0.1:3030",
  walletUrl: null,
};
const TESTNET: DevSignerConfig = {
  network: "testnet",
  rpcUrl: "https://test.rpc.fastnear.com",
  walletUrl: "https://testnet.mynearwallet.com",
};
const MAINNET: DevSignerConfig = {
  network: "mainnet",
  rpcUrl: "https://free.rpc.fastnear.com",
  walletUrl: "https://app.mynearwallet.com",
};

const IDENTITY: DevIdentity = { accountId: "gov.sandbox", secretKey: SECRET };

interface Sent {
  readonly url: string;
  readonly body: string;
}

/** A fetch that answers from a queue and records every byte it was asked to send. */
function stubFetch(replies: readonly unknown[]): { fetch: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  let next = 0;
  const fetch = (async (url: string, init?: { body?: string }) => {
    sent.push({ url: String(url), body: String(init?.body ?? "") });
    const reply = replies[next++];
    return {
      ok: true,
      status: 200,
      json: async () => reply,
    } as unknown as Response;
  }) as unknown as Fetch;
  return { fetch, sent };
}

const accessKeyReply = (nonce = 7) => ({ result: { nonce, block_hash: BLOCK_HASH } });
const sentOk = (id = "9kTxHash") => ({ result: { transaction_outcome: { id } } });

/** A storage backed by a Map, which is what a working browser gives. */
function memoryStorage(): DevKeyStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/**
 * The bytes a borsh-decoded ed25519 key or signature carries. Decoding gives the enum back as a
 * plain object, so neither comes back as a `PublicKey` or a `Signature`.
 */
function ed25519Bytes(value: unknown): Uint8Array {
  const enumerated = value as {
    ed25519Key?: { data: ArrayLike<number> };
    ed25519Signature?: { data: ArrayLike<number> };
  };
  const data = enumerated.ed25519Key?.data ?? enumerated.ed25519Signature?.data;
  return Uint8Array.from(data ?? []);
}

/** A storage that throws on every call, which a browser with site data blocked gives. */
function hostileStorage(): DevKeyStorage {
  const refuse = (): never => {
    throw new Error("the operation is insecure");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

// ---------------------------------------------------------------------------- permission

test("only a loopback RPC is this machine", () => {
  assert.equal(isLoopbackRpc("http://127.0.0.1:3030"), true);
  assert.equal(isLoopbackRpc("http://localhost:3030"), true);
  assert.equal(isLoopbackRpc("http://[::1]:3030"), true);
  assert.equal(isLoopbackRpc("http://0.0.0.0:3030"), true);
  assert.equal(isLoopbackRpc("https://test.rpc.fastnear.com"), false);
  // A host that merely mentions loopback is not loopback.
  assert.equal(isLoopbackRpc("https://127.0.0.1.example.com"), false);
  assert.equal(isLoopbackRpc("not a url at all"), false);
});

test("the dev signer is permitted on a local sandbox and refused everywhere else", () => {
  assert.equal(devSignerAllowed(SANDBOX), true);
  assert.equal(devSignerAllowed(TESTNET), false);
  assert.equal(devSignerAllowed(MAINNET), false);
  // Naming a public network "sandbox" does not help: the RPC still has to be on this machine.
  assert.equal(devSignerAllowed({ ...TESTNET, network: "sandbox" }), false);
  assert.equal(devSignerAllowed({ ...TESTNET, network: "sandbox", walletUrl: null }), false);
  // Nor does pointing a testnet deployment at a local node: testnet has a wallet, so use it.
  assert.equal(devSignerAllowed({ ...SANDBOX, network: "testnet" }), false);
  assert.equal(
    devSignerAllowed({ ...SANDBOX, walletUrl: "https://testnet.mynearwallet.com" }),
    false,
  );
});

test("the banner says what this is, and appears only where the dev signer does", () => {
  assert.equal(devSignerBanner(SANDBOX), DEV_SIGNER_BANNER);
  assert.equal(devSignerBanner(TESTNET), null);
  // It never calls itself a wallet, and it never claims the testnet bar is met.
  assert.match(DEV_SIGNER_TITLE, /^Sandbox dev key$/);
  assert.match(DEV_SIGNER_BANNER, /not a wallet/);
  assert.match(DEV_SIGNER_BANNER, /not a testnet or mainnet account/);
  assert.match(DEV_SIGNER_BANNER, /ready only when it works from a browser wallet on testnet/);
  // AC-29: forgetting a key is this browser dropping a copy, not a deletion or a revocation.
  assert.match(DEV_SIGNER_NOTE, /never sent to a server/);
  assert.match(DEV_SIGNER_NOTE, /drops this browser's copy/);
  assert.match(DEV_SIGNER_NOTE, /does not revoke the key/);
  assert.doesNotMatch(DEV_SIGNER_NOTE + DEV_SIGNER_BANNER, /delet|erase|unlearn|forever/i);
});

// ---------------------------------------------------------------------------- what the person types

test("an account id is the contracts' account id, or a refusal naming the rule", () => {
  assert.equal(parseAccountId("  gov.sandbox "), "gov.sandbox");
  assert.equal(parseAccountId("a_b-1.c2.sandbox"), "a_b-1.c2.sandbox");
  assert.throws(() => parseAccountId("a"), /is not a NEAR account id/);
  assert.throws(() => parseAccountId(`${"a".repeat(62)}.near`), /is not a NEAR account id/);
  assert.throws(() => parseAccountId("GOV.sandbox"), /is not a NEAR account id/);
  assert.throws(() => parseAccountId("gov..sandbox"), /is not a NEAR account id/);
});

test("a secret key is checked for curve, base58 and length before anything uses it", () => {
  assert.equal(parseDevKey(` ${SECRET} `), SECRET);
  assert.equal(parseDevKey(SECRET_32), SECRET_32);
  assert.throws(() => parseDevKey(PUBLIC.replace("ed25519:", "")), /is not a NEAR secret key/);
  assert.throws(() => parseDevKey("secp256k1:abc"), /is not a NEAR secret key/);
  // 0, O, I and l are not in the base58 alphabet.
  assert.throws(() => parseDevKey("ed25519:0OIl"), /is not base58/);
  // One character short would otherwise be truncated to some other key by KeyPairEd25519.
  assert.throws(() => parseDevKey(SECRET_31), /decodes to 31 bytes/);
});

// ---------------------------------------------------------------------------- (d) storage

test("a localStorage that throws on read and on write does not break the page", () => {
  const hostile = hostileStorage();
  // Reading: no key, no throw.
  assert.equal(loadDevKey(SANDBOX, hostile), null);
  // Writing: accepted silently, so the session keeps signing.
  assert.doesNotThrow(() => saveDevKey(SANDBOX, hostile, IDENTITY));
  assert.doesNotThrow(() => clearDevKey(hostile));
  // No storage at all behaves the same way.
  assert.equal(loadDevKey(SANDBOX, null), null);
  assert.doesNotThrow(() => saveDevKey(SANDBOX, null, IDENTITY));
  assert.doesNotThrow(() => clearDevKey(null));
});

test("reading the storage property is itself wrapped, because a browser can refuse it", () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "localStorage");
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    // No storage in this runtime: null, not a throw.
    Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true });
    assert.equal(devKeyStorage(), null);
    // A browser with site data blocked throws on the lookup itself.
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("access to localStorage is denied");
      },
      configurable: true,
    });
    assert.equal(devKeyStorage(), null);
    // A working browser hands its storage back.
    const memory = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: memory, configurable: true });
    assert.equal(devKeyStorage(), memory);
  } finally {
    if (saved !== undefined && had) Object.defineProperty(globalThis, "localStorage", saved);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("a key kept in this browser comes back, and anything else reads as no key", () => {
  const storage = memoryStorage();
  assert.equal(loadDevKey(SANDBOX, storage), null);
  saveDevKey(SANDBOX, storage, IDENTITY);
  assert.deepEqual(loadDevKey(SANDBOX, storage), IDENTITY);

  // Corrupt, and no longer valid, both read as no key rather than as a usable identity.
  storage.setItem(DEV_KEY_STORAGE_KEY, "not json");
  assert.equal(loadDevKey(SANDBOX, storage), null);
  storage.setItem(DEV_KEY_STORAGE_KEY, JSON.stringify({ accountId: "GOV", secretKey: SECRET }));
  assert.equal(loadDevKey(SANDBOX, storage), null);

  saveDevKey(SANDBOX, storage, IDENTITY);
  clearDevKey(storage);
  assert.equal(storage.getItem(DEV_KEY_STORAGE_KEY), null);
});

// ---------------------------------------------------------------------------- (a) the hard refusal

test("a testnet or mainnet config refuses the dev signer outright, storing nothing and sending nothing", async () => {
  const storage = memoryStorage();
  for (const config of [TESTNET, MAINNET]) {
    const { fetch, sent } = stubFetch([accessKeyReply(), sentOk()]);
    await assert.rejects(
      () => sendWithDevKey(config, IDENTITY, { contract: "c", method: "m", args: {} }, fetch),
      /the dev signer is for a local sandbox node only/,
    );
    await assert.rejects(
      () => checkDevKey(config, IDENTITY, fetch),
      /the dev signer is for a local sandbox node only/,
    );
    await assert.rejects(
      () => acceptDevKey(config, storage, { account: "gov.near", key: SECRET }, fetch),
      /the dev signer is for a local sandbox node only/,
    );
    // Nothing was sent anywhere, and nothing was written down.
    assert.deepEqual(sent, []);
    assert.equal(storage.getItem(DEV_KEY_STORAGE_KEY), null);
    // Even asked directly, the store refuses off a sandbox.
    saveDevKey(config, storage, IDENTITY);
    assert.equal(storage.getItem(DEV_KEY_STORAGE_KEY), null);
    assert.equal(loadDevKey(config, storage), null);
  }
});

// ---------------------------------------------------------------------------- (b) a bad key

test("a malformed secret key is refused before any network call", async () => {
  const storage = memoryStorage();
  const { fetch, sent } = stubFetch([accessKeyReply(), sentOk()]);
  await assert.rejects(
    () => acceptDevKey(SANDBOX, storage, { account: "gov.sandbox", key: SECRET_31 }, fetch),
    /decodes to 31 bytes/,
  );
  await assert.rejects(
    () => acceptDevKey(SANDBOX, storage, { account: "gov.sandbox", key: "nope" }, fetch),
    /is not a NEAR secret key/,
  );
  // A bad account is refused the same way, before the key is even looked at.
  await assert.rejects(
    () => acceptDevKey(SANDBOX, storage, { account: "GOV", key: SECRET }, fetch),
    /is not a NEAR account id/,
  );
  assert.deepEqual(sent, []);
  assert.equal(storage.getItem(DEV_KEY_STORAGE_KEY), null);
});

// ---------------------------------------------------------------------------- (c) the key stays here

test("nothing sent to the node carries the secret key", async () => {
  const storage = memoryStorage();
  const { fetch, sent } = stubFetch([accessKeyReply(), accessKeyReply(9), sentOk()]);
  const identity = await acceptDevKey(
    SANDBOX,
    storage,
    { account: "gov.sandbox", key: SECRET },
    fetch,
  );
  assert.deepEqual(identity, IDENTITY);
  await sendWithDevKey(
    SANDBOX,
    identity,
    { contract: "clearing.sandbox", method: "approve_parked", args: { job_id: "3" } },
    fetch,
  );

  const body = SECRET.slice("ed25519:".length);
  assert.ok(sent.length >= 2);
  for (const one of sent) {
    // Every byte goes to the sandbox node's own RPC: there is no route handler in this path.
    assert.equal(one.url, SANDBOX.rpcUrl);
    assert.equal(one.body.includes(body), false, one.body);
    assert.equal(one.body.includes("secretKey"), false);
  }
  // The nonce is read for the *public* key, which is the only key that goes anywhere.
  assert.ok(sent[0]?.body.includes(PUBLIC));
  // The key does sit in this browser's storage — that is where it is meant to be.
  assert.equal(JSON.parse(storage.getItem(DEV_KEY_STORAGE_KEY) ?? "{}").secretKey, SECRET);

  // Nor does a refusal quote the key back, because a page shows refusals to the person.
  const refusals = await Promise.all(
    [SECRET_31, `${SECRET}x`, "ed25519:0OIl"].map((key) =>
      acceptDevKey(SANDBOX, storage, { account: "gov.sandbox", key }, fetch).then(
        () => "",
        (reason: unknown) => String(reason),
      ),
    ),
  );
  for (const refusal of refusals) {
    assert.notEqual(refusal, "");
    assert.equal(refusal.includes(body), false, refusal);
    assert.equal(refusal.includes(body.slice(0, 12)), false, refusal);
  }
});

// ---------------------------------------------------------------------------- (e) faithful descriptors

test("the descriptor is sent faithfully, deposit and gas included, and the signature is over it", async () => {
  const { fetch, sent } = stubFetch([accessKeyReply(41), sentOk("TxOne")]);
  const hash = await sendWithDevKey(
    SANDBOX,
    IDENTITY,
    {
      contract: "clearing.sandbox",
      method: "create_listing",
      args: { spec: "abc", price: "1000000" },
      deposit: "12340000000000000000000",
      gas: "250000000000000",
    },
    fetch,
  );
  assert.equal(hash, "TxOne");

  const params = JSON.parse(sent[1]?.body ?? "{}").params as string[];
  const bytes = Uint8Array.from(atob(params[0] ?? ""), (c) => c.charCodeAt(0));
  const signed = decodeSignedTransaction(bytes);
  assert.equal(signed.transaction.signerId, "gov.sandbox");
  assert.equal(signed.transaction.receiverId, "clearing.sandbox");
  // The nonce is the access key's, plus one.
  assert.equal(signed.transaction.nonce, 42n);
  // Borsh gives the key back as its enum, so compare the bytes it actually carries.
  assert.equal(`ed25519:${baseEncode(ed25519Bytes(signed.transaction.publicKey))}`, PUBLIC);
  const call = signed.transaction.actions[0]?.functionCall;
  assert.equal(call?.methodName, "create_listing");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(Uint8Array.from(call?.args ?? []))), {
    spec: "abc",
    price: "1000000",
  });
  assert.equal(call?.gas, 250000000000000n);
  assert.equal(call?.deposit, 12340000000000000000000n);

  // And the signature is this key's, over exactly those bytes — not over something else we built.
  const message = createHash("sha256").update(encodeTransaction(signed.transaction)).digest();
  assert.equal(
    KeyPair.fromString(SECRET).verify(new Uint8Array(message), ed25519Bytes(signed.signature)),
    true,
  );
});

test("a descriptor with no gas and no deposit gets the wallet path's defaults", async () => {
  const { fetch, sent } = stubFetch([accessKeyReply(0), sentOk()]);
  await sendWithDevKey(SANDBOX, IDENTITY, { contract: "c.sandbox", method: "m", args: {} }, fetch);
  const params = JSON.parse(sent[1]?.body ?? "{}").params as string[];
  const signed = decodeSignedTransaction(
    Uint8Array.from(atob(params[0] ?? ""), (c) => c.charCodeAt(0)),
  );
  assert.equal(signed.transaction.nonce, 1n);
  assert.equal(signed.transaction.actions[0]?.functionCall?.gas, BigInt(DEFAULT_GAS));
  assert.equal(signed.transaction.actions[0]?.functionCall?.deposit, 0n);
});

test("a contract panic comes back with its E_ code intact", async () => {
  const panic = {
    result: {
      status: {
        Failure: {
          ActionError: {
            index: 0,
            kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: E_BUDGET_EXHAUSTED" } },
          },
        },
      },
    },
  };
  const { fetch } = stubFetch([accessKeyReply(), panic]);
  const error = await sendWithDevKey(
    SANDBOX,
    IDENTITY,
    { contract: "c.sandbox", method: "fund_job", args: {} },
    fetch,
  ).then(
    () => null,
    (reason: unknown) => reason,
  );
  assert.match(String(error), /fund_job: Smart contract panicked: E_BUDGET_EXHAUSTED/);
  assert.equal(errorCode(error), "E_BUDGET_EXHAUSTED");
});

// ---------------------------------------------------------------------------- failures as themselves

test("a failure is the node's own words, whichever shape the RPC puts them in", () => {
  assert.equal(rpcFailure({ result: {} }), null);
  assert.equal(rpcFailure(null), null);
  assert.equal(rpcFailure({ error: { data: "account gov.sandbox does not exist" } }), "account gov.sandbox does not exist");
  assert.equal(
    rpcFailure({ error: { data: { InvalidTxError: "InvalidNonce" } } }),
    '{"InvalidTxError":"InvalidNonce"}',
  );
  assert.equal(rpcFailure({ error: { message: "Parse error" } }), "Parse error");
  assert.equal(rpcFailure({ error: {} }), "the RPC refused the call");
});

test("an executed failure is reduced to the contract's message, and anything else kept whole", () => {
  assert.equal(txFailureMessage({ status: { SuccessValue: "" } }), null);
  assert.equal(txFailureMessage(null), null);
  assert.equal(
    txFailureMessage({ status: { Failure: { kind: { FunctionCallError: { ExecutionError: "E_X" } } } } }),
    "E_X",
  );
  // A failure with no ExecutionError in it is reported as it came, rather than swallowed.
  assert.equal(
    txFailureMessage({ status: { Failure: { ActionError: { kind: "AccountDoesNotExist" } } } }),
    '{"ActionError":{"kind":"AccountDoesNotExist"}}',
  );
});

test("a missing account, a refused view and a silent RPC each surface as themselves", async () => {
  const missing = stubFetch([
    { error: { data: "account gov.sandbox does not exist while viewing" } },
  ]);
  await assert.rejects(
    () => checkDevKey(SANDBOX, IDENTITY, missing.fetch),
    /query: account gov.sandbox does not exist while viewing/,
  );

  // A reply with neither error nor result.
  const empty = stubFetch([{}]);
  await assert.rejects(
    () => checkDevKey(SANDBOX, IDENTITY, empty.fetch),
    /query: the RPC returned no result/,
  );

  // A result that is not an access key view at all.
  const nonsense = stubFetch([{ result: { block_hash: BLOCK_HASH } }]);
  await assert.rejects(
    () => checkDevKey(SANDBOX, IDENTITY, nonsense.fetch),
    new RegExp(`gov.sandbox: the RPC returned no nonce for ${PUBLIC}`),
  );
});

test("an RPC that answers with an HTTP error says so", async () => {
  const fetch = (async () => ({ ok: false, status: 502 }) as unknown as Response) as unknown as Fetch;
  await assert.rejects(
    () => checkDevKey(SANDBOX, IDENTITY, fetch),
    /query: the RPC answered 502/,
  );
});

test("the browser's own fetch is the default, so a page passes nothing", async () => {
  const saved = globalThis.fetch;
  const { fetch, sent } = stubFetch([
    accessKeyReply(),
    accessKeyReply(),
    accessKeyReply(),
    sentOk("Hash"),
  ]);
  globalThis.fetch = fetch;
  try {
    await checkDevKey(SANDBOX, IDENTITY);
    await acceptDevKey(SANDBOX, null, { account: "gov.sandbox", key: SECRET_32 });
    assert.equal(
      await sendWithDevKey(SANDBOX, IDENTITY, { contract: "c.sandbox", method: "m", args: {} }),
      "Hash",
    );
  } finally {
    globalThis.fetch = saved;
  }
  assert.equal(sent.length, 4);
  for (const one of sent) assert.equal(one.url, SANDBOX.rpcUrl);
});

test("a send whose outcome carries no hash still resolves, as the wallet path does", async () => {
  const { fetch } = stubFetch([accessKeyReply(), { result: {} }]);
  assert.equal(
    await sendWithDevKey(SANDBOX, IDENTITY, { contract: "c.sandbox", method: "m", args: {} }, fetch),
    "",
  );
});
