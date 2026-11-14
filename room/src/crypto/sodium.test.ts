import test from "node:test";
import assert from "node:assert/strict";

import {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  SEAL_OVERHEAD_BYTES,
  aeadOpen,
  aeadSeal,
  boxKeys,
  boxPublicKey,
  hkdf,
  memzero,
  randomBytes,
  seal,
  sharedSecret,
  unseal,
} from "./sodium.js";

const bytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, "hex"));

/** A copy of `data` with one byte flipped: what an attacker, or a bad disk, would do to it. */
function flip(data: Uint8Array, index: number): Uint8Array {
  const copy = Uint8Array.from(data);
  copy[index] = (copy.at(index) ?? 0) ^ 1;
  return copy;
}

test("random bytes are the length asked for and not the same twice", () => {
  assert.equal(randomBytes(32).length, 32);
  assert.notDeepEqual(randomBytes(32), randomBytes(32));
});

test("a sealed box opens only with its own key pair", () => {
  const recipient = boxKeys();
  const other = boxKeys();
  const message = Buffer.from("DEK_g, wrapped to the listing key", "utf8");
  const sealed = seal(new Uint8Array(message), recipient.publicKey);
  assert.equal(sealed.length, message.length + SEAL_OVERHEAD_BYTES);

  assert.deepEqual(unseal(sealed, recipient), new Uint8Array(message));
  assert.throws(() => unseal(sealed, other), /does not open with this key/);

  // Anonymous: sealing the same message twice gives different bytes, because the ephemeral key is
  // fresh and then thrown away — not even the sender can open it again.
  assert.notDeepEqual(seal(new Uint8Array(message), recipient.publicKey), sealed);

  assert.throws(() => unseal(flip(sealed, sealed.length - 1), recipient), /does not open with this key/);
  assert.throws(() => unseal(sealed.subarray(0, SEAL_OVERHEAD_BYTES), recipient), /too short/);
  assert.throws(() => seal(new Uint8Array(message), new Uint8Array(31)), /must be 32 bytes, got 31/);
});

test("an X25519 secret key has one public key, and two parties agree on one secret", () => {
  const a = boxKeys();
  const b = boxKeys();
  assert.deepEqual(boxPublicKey(a.secretKey), a.publicKey);
  assert.deepEqual(sharedSecret(a.secretKey, b.publicKey), sharedSecret(b.secretKey, a.publicKey));
  assert.notDeepEqual(sharedSecret(a.secretKey, b.publicKey), sharedSecret(a.secretKey, a.publicKey));
  assert.throws(() => boxPublicKey(new Uint8Array(16)), /a secret key must be 32 bytes/);
  assert.throws(() => sharedSecret(a.secretKey, new Uint8Array(16)), /a public key must be 32 bytes/);
  assert.throws(() => sharedSecret(new Uint8Array(1), b.publicKey), /a secret key must be 32 bytes/);
});

/**
 * The known answer from libsodium's own XChaCha20-Poly1305 test (`test/default/aead_xchacha20poly1305.c`
 * — the first IETF vector). A format the room shares with every buyer's browser is not something to
 * check only by round-tripping it against itself.
 */
test("XChaCha20-Poly1305 matches libsodium's published vector", () => {
  const key = bytes("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
  const nonce = bytes("404142434445464748494a4b4c4d4e4f5051525354555657");
  const aad = bytes("50515253c0c1c2c3c4c5c6c7");
  const plaintext = new Uint8Array(
    Buffer.from(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
      "utf8",
    ),
  );
  const sealed = aeadSeal(key, nonce, plaintext, aad);
  assert.equal(
    Buffer.from(sealed).toString("hex"),
    "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49",
  );
  assert.deepEqual(aeadOpen(key, nonce, sealed, aad), plaintext);
});

test("an AEAD ciphertext authenticates its key, nonce and associated data or it does not open", () => {
  const key = randomBytes(AEAD_KEY_BYTES);
  const nonce = randomBytes(AEAD_NONCE_BYTES);
  const plaintext = new Uint8Array(Buffer.from("the delivery payload", "utf8"));
  const aad = new Uint8Array(32).fill(9);
  const sealed = aeadSeal(key, nonce, plaintext, aad);
  assert.equal(sealed.length, plaintext.length + AEAD_TAG_BYTES);
  assert.deepEqual(aeadOpen(key, nonce, sealed, aad), plaintext);

  assert.throws(() => aeadOpen(key, nonce, sealed, flip(aad, 0)), /does not authenticate/);
  assert.throws(() => aeadOpen(key, flip(nonce, 0), sealed, aad), /does not authenticate/);
  assert.throws(() => aeadOpen(flip(key, 0), nonce, sealed, aad), /does not authenticate/);
  assert.throws(() => aeadOpen(key, nonce, flip(sealed, 0), aad), /does not authenticate/);

  assert.throws(() => aeadOpen(key, nonce, new Uint8Array(15), aad), /ciphertext is too short/);
  assert.throws(() => aeadSeal(new Uint8Array(31), nonce, plaintext, aad), /an AEAD key must be 32/);
  assert.throws(() => aeadSeal(key, new Uint8Array(12), plaintext, aad), /an AEAD nonce must be 24/);
  assert.throws(() => aeadOpen(new Uint8Array(31), nonce, sealed, aad), /an AEAD key must be 32/);
  assert.throws(() => aeadOpen(key, new Uint8Array(12), sealed, aad), /an AEAD nonce must be 24/);
});

/** RFC 5869 test case 1, so the delivery KDF is the one §3.19 names and not merely self-consistent. */
test("HKDF-SHA256 matches RFC 5869", () => {
  const okm = hkdf(bytes("0b".repeat(22)), bytes("000102030405060708090a0b0c"), bytes("f0f1f2f3f4f5f6f7f8f9"), 42);
  assert.equal(
    Buffer.from(okm).toString("hex"),
    "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
  );
  // A different info is a different key: this is what separates the two §3.19 derivations.
  assert.notDeepEqual(hkdf(bytes("0b".repeat(22)), new Uint8Array(0), bytes("00"), 32), okm.subarray(0, 32));
  assert.equal(hkdf(new Uint8Array(32), new Uint8Array(0), new Uint8Array(0), 1).length, 1);
  assert.throws(() => hkdf(new Uint8Array(32), new Uint8Array(0), new Uint8Array(0), 0), /at least one byte/);
});

test("a wiped secret is zero", () => {
  const secret = randomBytes(32);
  assert.notDeepEqual(secret, new Uint8Array(32));
  memzero(secret);
  assert.deepEqual(secret, new Uint8Array(32));
});
