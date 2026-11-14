/**
 * The room's cryptographic primitives (SDD §3.12.4, §3.19; E8.1).
 *
 * One place, so the room has exactly one implementation of each primitive and the same bytes the
 * SDK produces. Everything here is libsodium's, because the formats are not ours to choose: a
 * seller's `DEK_g` arrives in a libsodium sealed box, a delivery is XChaCha20-Poly1305 as §3.19
 * writes it, and both have to interoperate with a browser doing the same thing.
 *
 * Secrets stay in `Uint8Array`s and are wiped with `memzero` when the room is finished with them
 * (§3.14.2 step 13). That is defence in depth, not a guarantee: V8 can copy a buffer during garbage
 * collection, so the non-persistence claim rests on the worker process exiting, on the CVM having
 * no persistent storage and no swap, and on TDX memory protection. The forget certificate says so.
 */
import { hkdfSync } from "node:crypto";
import sodium from "libsodium-wrappers";

// Top-level await, so importing this module is enough: there is no "did you initialise it" state
// for a caller to get wrong, and no branch pretending to handle one.
await sodium.ready;

/** An X25519 key pair, raw 32-byte keys, as everything on the wire uses. */
export interface BoxKeys {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

/** 32-byte key, 24-byte nonce, 16-byte tag (XChaCha20-Poly1305). */
export const AEAD_KEY_BYTES = 32;
export const AEAD_NONCE_BYTES = 24;
export const AEAD_TAG_BYTES = 16;
/** A sealed box costs an ephemeral public key plus a tag. */
export const SEAL_OVERHEAD_BYTES = 48;

function expect(name: string, value: Uint8Array, length: number): void {
  if (value.length !== length) {
    throw new Error(`crypto: ${name} must be ${length} bytes, got ${value.length}`);
  }
}

export function randomBytes(length: number): Uint8Array {
  return sodium.randombytes_buf(length);
}

export function boxKeys(): BoxKeys {
  const pair = sodium.crypto_box_keypair();
  return { publicKey: pair.publicKey, secretKey: pair.privateKey };
}

/** The X25519 public key of a secret key. */
export function boxPublicKey(secretKey: Uint8Array): Uint8Array {
  expect("a secret key", secretKey, 32);
  return sodium.crypto_scalarmult_base(secretKey);
}

/** Raw X25519: the shared point, not a hashed key. Callers run it through `hkdf` (§3.19). */
export function sharedSecret(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  expect("a secret key", secretKey, 32);
  expect("a public key", publicKey, 32);
  return sodium.crypto_scalarmult(secretKey, publicKey);
}

/**
 * A sealed box to an X25519 public key (`crypto_box_seal`): the sender is anonymous, and the
 * ephemeral key is destroyed, so not even the sender can open it again. This is how a seller
 * wraps `DEK_g` to the listing key and how a buyer wraps `DEK_c` to the room's `box_pk` (§3.12.4).
 */
export function seal(plaintext: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  expect("a public key", recipientPublicKey, 32);
  return sodium.crypto_box_seal(plaintext, recipientPublicKey);
}

/** Opens a sealed box. Throws rather than returning a value a caller might forget to check. */
export function unseal(ciphertext: Uint8Array, keys: BoxKeys): Uint8Array {
  if (ciphertext.length <= SEAL_OVERHEAD_BYTES) {
    throw new Error("crypto: the sealed box is too short");
  }
  try {
    return sodium.crypto_box_seal_open(ciphertext, keys.publicKey, keys.secretKey);
  } catch {
    // libsodium says only "incorrect key pair for the given ciphertext"; the cause is the same
    // either way, and saying more would be guessing.
    throw new Error("crypto: the sealed box does not open with this key");
  }
}

/** XChaCha20-Poly1305 (§3.19). `aad` is bound into the tag but not encrypted. */
export function aeadSeal(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  expect("an AEAD key", key, AEAD_KEY_BYTES);
  expect("an AEAD nonce", nonce, AEAD_NONCE_BYTES);
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key);
}

export function aeadOpen(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  expect("an AEAD key", key, AEAD_KEY_BYTES);
  expect("an AEAD nonce", nonce, AEAD_NONCE_BYTES);
  if (ciphertext.length < AEAD_TAG_BYTES) throw new Error("crypto: the ciphertext is too short");
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key);
  } catch {
    throw new Error("crypto: the ciphertext does not authenticate");
  }
}

/**
 * HKDF-SHA256, from node rather than libsodium: libsodium's own KDF is not HKDF, and §3.19's
 * delivery sealing is specified as HKDF-SHA256 with a salt and an info string.
 */
export function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Uint8Array {
  if (length < 1) throw new Error("crypto: an HKDF output must be at least one byte");
  return new Uint8Array(hkdfSync("sha256", ikm, salt, info, length));
}

/**
 * Wipes a secret in place. Call it on every key, plaintext and intermediate the moment it is no
 * longer needed; see the honesty note at the top of this file for what it does and does not buy.
 */
export function memzero(secret: Uint8Array): void {
  sodium.memzero(secret);
}
