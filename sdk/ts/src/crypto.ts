/**
 * The SDK's browser crypto (SDD §3.23, §3.2; E12.1).
 *
 * This is the seller's and the buyer's side of the wire the room reads, so every format here is the
 * room's: a listing object is `nonce ‖ XChaCha20-Poly1305(good)`, the key that opens it travels in a
 * libsodium sealed box holding `DEK_g ‖ salt`, and the published commitment is
 * `SHA-256(salt ‖ canonical good)`. `room/src/crypto/sodium.ts` and `room/src/worker/context.ts`
 * are the other end of each one; this file follows them rather than inventing anything.
 *
 * It is **browser-safe on purpose**: no `node:crypto`, no `node:fs`, and nothing from
 * `@marginal/core-wasm`, which loads its wasm through `node:fs` and so cannot be bundled for a
 * page. SHA-256 comes from WebCrypto (`crypto.subtle`), which node and browsers both have, and the
 * commitment it produces is checked against `marginal-core`'s own `good_commitment` in the tests —
 * those two agreeing is what lets a seller publish a commitment a contract and a room will accept.
 *
 * Everything that needs libsodium is `async`, because libsodium is only usable after
 * `await sodium.ready`. Nothing here keeps a secret alive longer than the call that made it: the
 * caller holds the plaintext, and the plaintext never leaves the browser except sealed.
 */
import sodium from "libsodium-wrappers";

/** The only extensions a good can be canonicalised from in M1: text a person can read. */
export const CANONICAL_EXTENSIONS = [".md", ".txt"] as const;

/** `DEK_g` is a 32-byte XChaCha20-Poly1305 key, and the commitment salt is 32 bytes (SDD §3.19). */
export const DEK_BYTES = 32;
export const SALT_BYTES = 32;
/** XChaCha20-Poly1305's nonce, which is prepended to the ciphertext. */
export const AEAD_NONCE_BYTES = 24;
/** An X25519 public key: `pk_L` for a listing, `box_pk` for a room. */
export const PUBLIC_KEY_BYTES = 32;

/**
 * The bytes the commitment is taken over.
 *
 * A commitment is only worth something if the bytes behind it are reproducible, so this is written
 * out rather than left to a library, and the order of the steps is part of the definition:
 *
 * 1. the file must be `.md` or `.txt`, and valid UTF-8;
 * 2. a leading byte-order mark goes;
 * 3. `\r\n` and a lone `\r` become `\n`, so the same memo saved on Windows commits to the same hash;
 * 4. trailing spaces and tabs go from every line, because no reader can see them;
 * 5. three or more newlines in a row become one blank line;
 * 6. trailing whitespace at the end of the file goes, and exactly one newline is put back.
 *
 * Leading whitespace is kept: in Markdown it is structure, not noise. Nothing else is touched —
 * this normalises how the text was *typed*, never what it says.
 */
export function canonicalise(name: string, bytes: Uint8Array): string {
  const lower = name.toLowerCase();
  if (!CANONICAL_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new Error(
      `canonicalise: only ${CANONICAL_EXTENSIONS.join(" and ")} files can be canonicalised, not ${name}`,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`canonicalise: ${name} is not valid UTF-8 text`);
  }
  return `${text
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\s+$/u, "")}\n`;
}

/** The fewest words a sentence needs before the appraiser treats it as a claim. */
export const MIN_CLAIM_WORDS = 5;

/**
 * Splits the canonical text into the claims `knowledge@1` will score.
 *
 * This mirrors `claims` in `room/src/appraisers/knowledge/novelty.ts`, copied rather than imported:
 * the room is a measured image with its own dependency list (DR-9), and a page that imported from
 * it would pull an ONNX runtime into the browser. The copy is what makes the wizard's preview
 * honest — the seller sees the same split the room will make — so a test pins the two rules
 * together and fails if the room's drifts from this one.
 */
export function claims(canonical: string): string[] {
  return canonical
    .replace(/^#.*$/gmu, "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.replace(/^[-*\d.)\s]+/u, "").trim())
    .filter((sentence) => sentence.split(/\s+/u).length >= MIN_CLAIM_WORDS);
}

/** libsodium, once it is usable. Every call below starts here, which is why they are all async. */
async function ready(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

function expect(what: string, value: Uint8Array, length: number): void {
  if (value.length !== length) {
    throw new Error(`crypto: ${what} must be ${length} bytes, got ${value.length}`);
  }
}

/** A fresh `DEK_g`. It exists only in this tab: see {@link putDeliveryKey} on what that costs. */
export async function dek(): Promise<Uint8Array> {
  return (await ready()).randombytes_buf(DEK_BYTES);
}

/** A fresh commitment salt, so the commitment does not reveal whether two goods are equal. */
export async function salt(): Promise<Uint8Array> {
  return (await ready()).randombytes_buf(SALT_BYTES);
}

/**
 * XChaCha20-Poly1305 (IETF) with the nonce **prepended**, which is exactly how the room opens a
 * listing object: `openGood` in `room/src/worker/context.ts` reads the first 24 bytes as the nonce
 * and decrypts the rest. `aad` is authenticated but not encrypted; a listing object uses none, and
 * the empty array says so rather than leaving it implicit.
 */
export async function aeadSeal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const lib = await ready();
  expect("an AEAD key", key, DEK_BYTES);
  const nonce = lib.randombytes_buf(AEAD_NONCE_BYTES);
  const ciphertext = lib.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad,
    null,
    nonce,
    key,
  );
  const object = new Uint8Array(nonce.length + ciphertext.length);
  object.set(nonce);
  object.set(ciphertext, nonce.length);
  return object;
}

/**
 * A libsodium sealed box (`crypto_box_seal`) to an X25519 public key: the sender is anonymous and
 * the ephemeral key is destroyed, so not even the sender can open it again. It is what the room's
 * `unseal` reads — a seller wraps `DEK_g` to `pk_L` this way, and a buyer wraps `DEK_c` to the
 * room's `box_pk` (SDD §3.12.4).
 */
export async function sealTo(publicKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const lib = await ready();
  expect("a public key", publicKey, PUBLIC_KEY_BYTES);
  return lib.crypto_box_seal(message, publicKey);
}

/**
 * The listing's wrapped key: a sealed box to `pk_L` over `DEK_g ‖ salt`, the 64 bytes the room
 * insists on (`openGood`: "the wrapped key is not DEK_g and a salt"). The salt travels with the key
 * because the room has to re-derive `SHA-256(salt ‖ good)` to prove it appraised what was sold.
 */
export async function wrapKey(
  publicKey: Uint8Array,
  key: Uint8Array,
  saltBytes: Uint8Array,
): Promise<Uint8Array> {
  expect("a DEK", key, DEK_BYTES);
  expect("a salt", saltBytes, SALT_BYTES);
  const bundle = new Uint8Array(DEK_BYTES + SALT_BYTES);
  bundle.set(key);
  bundle.set(saltBytes, DEK_BYTES);
  return sealTo(publicKey, bundle);
}

/** Lower-case hex, the form every hash and key crosses the wire in (`marginal_core::json`). */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Bytes from lower-case hex. It refuses anything else rather than guessing at a typo.
 *
 * The return type names the buffer it allocates: TypeScript 5.9 distinguishes a view onto a real
 * `ArrayBuffer` from one onto `ArrayBufferLike`, and only the former is a `BodyInit` or a
 * `BufferSource` — so a caller can put these bytes straight into a `fetch` or into WebCrypto.
 */
export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) {
    throw new Error("crypto: that is not an even number of lower-case hex digits");
  }
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let at = 0; at < bytes.length; at += 1) {
    bytes[at] = Number.parseInt(hex.slice(at * 2, at * 2 + 2), 16);
  }
  return bytes;
}

/**
 * The parts, in one buffer WebCrypto will take.
 *
 * The allocation is not incidental: TypeScript 5.9's `BufferSource` requires a view onto a real
 * `ArrayBuffer`, and a `Uint8Array` handed in from elsewhere (a `File`'s bytes, a `subarray`) is
 * only `ArrayBufferLike`. Copying into a buffer owned here keeps that honest without a cast, and it
 * is also where `salt ‖ good` is concatenated, so the hash is taken over one contiguous input.
 */
function owned(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const buffer = new Uint8Array(new ArrayBuffer(total));
  let at = 0;
  for (const part of parts) {
    buffer.set(part, at);
    at += part.length;
  }
  return buffer;
}

async function digest(message: Uint8Array<ArrayBuffer>): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", message)));
}

/** SHA-256, from WebCrypto: the one hash in the browser, and the one the chain commits to. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return digest(owned([bytes]));
}

/**
 * `SHA-256(salt ‖ canonical)` as hex: the `good_commitment` a listing publishes.
 *
 * This must equal `marginal-core`'s `good_commitment` op to the last bit, or the room would refuse
 * the good it was sold ("the good does not match its commitment"). A test calls that op and
 * compares, which is the only check worth having here.
 */
export async function goodCommitment(saltBytes: Uint8Array, canonical: string): Promise<string> {
  expect("a salt", saltBytes, SALT_BYTES);
  return digest(owned([saltBytes, new TextEncoder().encode(canonical)]));
}

// -----------------------------------------------------------------------------------------------
// Delivery keys
//
// A buyer's delivery key is generated in the browser and kept in IndexedDB. **Losing it means
// losing the delivery**: there is no escrow of buyer keys (SDD §3.23), nobody can re-issue one, and
// the room cannot deliver again to a key it has never seen. The store is per origin and per
// browser, so a buyer who clears site data or moves machine has to export it first.
//
// Only the slice of IndexedDB this needs is typed, because `sdk/ts` compiles without the DOM
// library — and because a small named surface is what lets a test drive every path of this code
// without a browser.

const DB_NAME = "marginal";
const DB_VERSION = 1;
const STORE = "delivery-keys";

type Handler = (() => void) | null;

interface IdbRequest<T> {
  result: T;
  onsuccess: Handler;
  onerror: Handler;
}

interface IdbOpenRequest extends IdbRequest<IdbDatabase> {
  onupgradeneeded: Handler;
}

interface IdbStore {
  put(value: Uint8Array, key: number): IdbRequest<unknown>;
  get(key: number): IdbRequest<Uint8Array | undefined>;
}

interface IdbDatabase {
  createObjectStore(name: string): unknown;
  transaction(name: string, mode: string): { objectStore(name: string): IdbStore };
  close(): void;
}

/** What `globalThis.indexedDB` provides, as far as the key store is concerned. */
export interface IdbFactory {
  open(name: string, version: number): IdbOpenRequest;
}

/** The browser's IndexedDB, or undefined where there is none (node, and `node:test`). */
function browserIdb(): IdbFactory | undefined {
  return (globalThis as { indexedDB?: IdbFactory }).indexedDB;
}

/** The fallback when there is no IndexedDB. It lives as long as the process, and no longer. */
const memory = new Map<number, Uint8Array>();

function settle<T>(request: IdbRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("delivery keys: IndexedDB refused the request"));
  });
}

async function open(factory: IdbFactory): Promise<IdbDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  // Fires before `onsuccess`, and only when the store is not there yet.
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE);
  };
  return settle(request);
}

async function withStore<T>(
  factory: IdbFactory,
  mode: "readonly" | "readwrite",
  use: (store: IdbStore) => IdbRequest<T>,
): Promise<T> {
  const db = await open(factory);
  try {
    return await settle(use(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

/**
 * Keeps the key that will open job `jobId`'s delivery. Call it before the request is signed: a key
 * that is not stored when the room delivers is a delivery nobody can open.
 */
export async function putDeliveryKey(
  jobId: number,
  key: Uint8Array,
  factory: IdbFactory | undefined = browserIdb(),
): Promise<void> {
  if (factory === undefined) {
    memory.set(jobId, key);
    return;
  }
  await withStore(factory, "readwrite", (store) => store.put(key, jobId));
}

/** The key for a job, or null if this browser has none — in which case the delivery stays sealed. */
export async function getDeliveryKey(
  jobId: number,
  factory: IdbFactory | undefined = browserIdb(),
): Promise<Uint8Array | null> {
  if (factory === undefined) return memory.get(jobId) ?? null;
  return (await withStore(factory, "readonly", (store) => store.get(jobId))) ?? null;
}
