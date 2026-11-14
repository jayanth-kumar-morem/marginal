import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { call } from "@marginal/core-wasm";
import sodium from "libsodium-wrappers";

import {
  AEAD_NONCE_BYTES,
  CANONICAL_EXTENSIONS,
  DEK_BYTES,
  DELIVERY_PAYLOAD_BYTES,
  MIN_CLAIM_WORDS,
  SALT_BYTES,
  aeadSeal,
  boxPublicKey,
  canonicalise,
  claims,
  dek,
  fromHex,
  getDeliveryKey,
  goodCommitment,
  hkdf,
  openDelivery,
  openGood,
  putDeliveryKey,
  salt,
  sealTo,
  sha256Hex,
  toHex,
  wrapKey,
  type IdbFactory,
} from "./crypto.js";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

// ---------------------------------------------------------------------------------------------
// canonicalise

test("canonicalisation normalises how the text was typed, and nothing else", () => {
  const source = "﻿# Title\r\n\r\nFirst line.   \r\n\r\n\r\n\r\n  indented\ttail  \n\n\n";
  assert.equal(canonicalise("memo.md", utf8(source)), "# Title\n\nFirst line.\n\n  indented\ttail\n");
});

test("canonicalisation is idempotent, which is what makes a commitment reproducible", () => {
  const once = canonicalise("memo.txt", utf8("a  \r\nb\r\n\r\n\r\nc"));
  assert.equal(once, "a\nb\n\nc\n");
  assert.equal(canonicalise("memo.txt", utf8(once)), once);
});

test("an empty file canonicalises to one newline rather than failing", () => {
  assert.equal(canonicalise("empty.md", new Uint8Array(0)), "\n");
  assert.equal(canonicalise("blank.md", utf8("   \n\t\n")), "\n");
});

test("the extension check is case-insensitive and covers both extensions", () => {
  assert.equal(canonicalise("MEMO.MD", utf8("x")), "x\n");
  assert.equal(canonicalise("notes.TXT", utf8("x")), "x\n");
  assert.deepEqual([...CANONICAL_EXTENSIONS], [".md", ".txt"]);
});

test("any other extension is refused by name", () => {
  assert.throws(
    () => canonicalise("deck.pdf", utf8("x")),
    /only \.md and \.txt files can be canonicalised, not deck\.pdf/,
  );
});

test("bytes that are not UTF-8 are refused rather than silently replaced", () => {
  assert.throws(
    () => canonicalise("memo.md", new Uint8Array([0xff, 0xfe, 0x00])),
    /memo\.md is not valid UTF-8 text/,
  );
});

// ---------------------------------------------------------------------------------------------
// claims

/** The fixture both splitters are run on: headings, list markers, short lines, two sentences. */
const FIXTURE = [
  "# A memo on fee markets",
  "",
  "- The base fee adjusts by at most one eighth per block.",
  "Short line.",
  "2) Validators cannot bid the base fee down without burning it. And so a spam burst costs more.",
  "",
  "too short",
].join("\n");

test("the claim split is the room's own rule, run from the room's own source", () => {
  // The rule is copied, not imported (see `claims`), so this runs the room's body as it stands
  // today against ours. If the room's splitter changes, this fails and the copy has to be redone.
  const source = readFileSync(
    new URL("../../../room/src/appraisers/knowledge/novelty.ts", import.meta.url),
    "utf8",
  );
  const body = /export function claims\(text: string\): string\[\] \{\n([\s\S]*?)\n\}/u.exec(source);
  assert.ok(body?.[1] !== undefined, "the room still has a `claims(text)` function to compare with");
  const roomClaims = new Function("text", "MIN_CLAIM_WORDS", body[1]) as (
    text: string,
    minimum: number,
  ) => string[];

  assert.deepEqual(claims(FIXTURE), roomClaims(FIXTURE, MIN_CLAIM_WORDS));
  assert.deepEqual(claims(FIXTURE), [
    "The base fee adjusts by at most one eighth per block.",
    "Validators cannot bid the base fee down without burning it.",
    "And so a spam burst costs more.",
  ]);
  assert.equal(MIN_CLAIM_WORDS, 5);
});

test("a document with nothing in it has no claims", () => {
  assert.deepEqual(claims("# Just a heading\n\ntoo short\n"), []);
});

// ---------------------------------------------------------------------------------------------
// Keys, AEAD and sealed boxes

test("a DEK and a salt are the lengths the room insists on, and are not reused", async () => {
  const [one, two, pinch] = [await dek(), await dek(), await salt()];
  assert.equal(one.length, DEK_BYTES);
  assert.equal(pinch.length, SALT_BYTES);
  assert.notDeepEqual(one, two);
});

test("an AEAD object is the nonce followed by the ciphertext, as the room reads it", async () => {
  await sodium.ready;
  const key = await dek();
  const plaintext = utf8("# memo\n\nthe good itself\n");
  const object = await aeadSeal(key, plaintext, new Uint8Array(0));

  assert.equal(object.length, AEAD_NONCE_BYTES + plaintext.length + 16);
  const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    object.subarray(AEAD_NONCE_BYTES),
    new Uint8Array(0),
    object.subarray(0, AEAD_NONCE_BYTES),
    key,
  );
  assert.deepEqual(opened, plaintext);
});

test("the additional data is authenticated, so a changed aad refuses to open", async () => {
  await sodium.ready;
  const key = await dek();
  const object = await aeadSeal(key, utf8("payload"), utf8("job-7"));
  assert.throws(() =>
    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      object.subarray(AEAD_NONCE_BYTES),
      utf8("job-8"),
      object.subarray(0, AEAD_NONCE_BYTES),
      key,
    ),
  );
});

test("a key of the wrong length is refused before anything is encrypted", async () => {
  await assert.rejects(
    () => aeadSeal(new Uint8Array(16), utf8("x"), new Uint8Array(0)),
    /an AEAD key must be 32 bytes, got 16/,
  );
});

test("a sealed box opens with the recipient's key pair and nothing else", async () => {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  const sealed = await sealTo(pair.publicKey, utf8("DEK"));
  assert.deepEqual(
    sodium.crypto_box_seal_open(sealed, pair.publicKey, pair.privateKey),
    utf8("DEK"),
  );
  await assert.rejects(
    () => sealTo(new Uint8Array(31), utf8("DEK")),
    /a public key must be 32 bytes, got 31/,
  );
});

test("the wrapped key is a sealed box over DEK_g and the salt, in that order", async () => {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  const key = await dek();
  const pinch = await salt();
  const wrapped = await wrapKey(pair.publicKey, key, pinch);

  // 48 bytes of sealed-box overhead over the 64 the room expects.
  assert.equal(wrapped.length, 64 + 48);
  const opened = sodium.crypto_box_seal_open(wrapped, pair.publicKey, pair.privateKey);
  assert.deepEqual(opened.subarray(0, DEK_BYTES), key);
  assert.deepEqual(opened.subarray(DEK_BYTES), pinch);
});

test("wrapping refuses a DEK or a salt of the wrong length", async () => {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  await assert.rejects(
    () => wrapKey(pair.publicKey, new Uint8Array(31), new Uint8Array(32)),
    /a DEK must be 32 bytes, got 31/,
  );
  await assert.rejects(
    () => wrapKey(pair.publicKey, new Uint8Array(32), new Uint8Array(1)),
    /a salt must be 32 bytes, got 1/,
  );
});

// ---------------------------------------------------------------------------------------------
// Hex and hashes

test("hex round-trips, and anything that is not hex is refused", () => {
  const bytes = new Uint8Array([0x00, 0x0f, 0xa0, 0xff]);
  assert.equal(toHex(bytes), "000fa0ff");
  assert.deepEqual(fromHex("000fa0ff"), bytes);
  assert.deepEqual(fromHex(""), new Uint8Array(0));
  assert.throws(() => fromHex("00F"), /not an even number of lower-case hex digits/);
  assert.throws(() => fromHex("00FF"), /not an even number of lower-case hex digits/);
});

test("SHA-256 from WebCrypto is SHA-256", async () => {
  assert.equal(
    await sha256Hex(utf8("marginal")),
    createHash("sha256").update("marginal").digest("hex"),
  );
});

/** The shared point, the way `openDelivery` derives it. */
async function sodiumSharedSecret(secretKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_scalarmult(secretKey, publicKey);
}

/** Bytes end to end, in a buffer this file owns. */
function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** XChaCha20-Poly1305 with a nonce of our choosing, which is how a delivery entry is sealed. */
async function sealWithNonce(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key);
}

test("the good commitment is the one marginal-core computes", async () => {
  // The seller's commitment and the room's check have to be the same function, or the room would
  // refuse the good it was sold. This is that equality, against core itself.
  const canonical = canonicalise("memo.md", utf8("# memo\r\n\r\nA claim worth paying for.   \n"));
  const pinch = await salt();
  const ours = await goodCommitment(pinch, canonical);
  const theirs = call("good_commitment", {
    salt: toHex(pinch),
    good: toHex(utf8(canonical)),
  });

  assert.equal(ours, theirs);
  assert.match(ours, /^[0-9a-f]{64}$/u);
  await assert.rejects(
    () => goodCommitment(new Uint8Array(16), canonical),
    /a salt must be 32 bytes, got 16/,
  );
});

// ---------------------------------------------------------------------------------------------
// Delivery keys

/** Only the shape `crypto.ts` uses, so the fake can stand in for a browser's IndexedDB. */
interface FakeRequest<T> {
  result: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

interface FakeOpenRequest<T> extends FakeRequest<T> {
  onupgradeneeded: (() => void) | null;
}

/**
 * An IndexedDB that answers on a microtask, as the real one answers on a task: the handlers are
 * assigned synchronously after `open`, so this fires them once that turn is over.
 */
function fakeIdb(fail: "none" | "open" | "request" = "none"): {
  factory: IdbFactory;
  data: Map<number, Uint8Array>;
  created: string[];
  closes(): number;
} {
  const data = new Map<number, Uint8Array>();
  const created: string[] = [];
  let closes = 0;
  const answer = <T>(result: T): FakeRequest<T> => {
    const request: FakeRequest<T> = { result, onsuccess: null, onerror: null };
    queueMicrotask(() => (fail === "request" ? request.onerror?.() : request.onsuccess?.()));
    return request;
  };
  const db = {
    createObjectStore(name: string) {
      created.push(name);
      return null;
    },
    transaction(name: string, mode: string) {
      assert.equal(name, "delivery-keys");
      return {
        objectStore: (store: string) => {
          assert.equal(store, "delivery-keys");
          return {
            put(value: Uint8Array, key: number) {
              assert.equal(mode, "readwrite");
              data.set(key, value);
              return answer(null);
            },
            get(key: number) {
              assert.equal(mode, "readonly");
              return answer(data.get(key));
            },
          };
        },
      };
    },
    close() {
      closes += 1;
    },
  };
  const factory: IdbFactory = {
    open(name: string, version: number) {
      assert.equal(name, "marginal");
      assert.equal(version, 1);
      const request: FakeOpenRequest<typeof db> = {
        result: db,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if (fail === "open") {
          request.onerror?.();
          return;
        }
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { factory, data, created, closes: () => closes };
}

test("a delivery key goes into IndexedDB and comes back out", async () => {
  const idb = fakeIdb();
  const key = await dek();
  await putDeliveryKey(7, key, idb.factory);

  assert.deepEqual(await getDeliveryKey(7, idb.factory), key);
  assert.deepEqual(idb.created, ["delivery-keys", "delivery-keys"], "the store is created on open");
  assert.equal(idb.closes(), 2, "every connection is closed again");
});

test("a job this browser has no key for answers null, not an empty buffer", async () => {
  assert.equal(await getDeliveryKey(99, fakeIdb().factory), null);
});

test("the browser's own IndexedDB is used when no factory is passed", async () => {
  const idb = fakeIdb();
  const global = globalThis as { indexedDB?: IdbFactory };
  global.indexedDB = idb.factory;
  try {
    await putDeliveryKey(11, new Uint8Array([1, 2, 3]));
    assert.deepEqual(await getDeliveryKey(11), new Uint8Array([1, 2, 3]));
  } finally {
    delete global.indexedDB;
  }
});

test("without IndexedDB the key stays in memory, so node:test can exercise the same calls", async () => {
  const key = await dek();
  await putDeliveryKey(3, key);
  assert.deepEqual(await getDeliveryKey(3), key);
  assert.equal(await getDeliveryKey(4), null);
});

test("an IndexedDB that refuses says so instead of losing the key quietly", async () => {
  await assert.rejects(
    () => putDeliveryKey(1, new Uint8Array(32), fakeIdb("open").factory),
    /IndexedDB refused the request/,
  );
  await assert.rejects(
    () => getDeliveryKey(1, fakeIdb("request").factory),
    /IndexedDB refused the request/,
  );
});

// -----------------------------------------------------------------------------------------------
// Opening a delivery (SDD §3.19)
//
// The delivery's keys and nonces are **derived**, not drawn, so this side has to agree with the
// room's to the bit. The vector below was produced by the room's own `sealDelivery`
// (`room/src/crypto/delivery.ts`) with the keys named in it — regenerate it from that function if
// the format ever changes, and never by editing the bytes by hand.

const VECTOR = {
  listingSk: new Uint8Array(32).fill(7),
  buyerSk: new Uint8Array(32).fill(9),
  complianceSk: new Uint8Array(32).fill(11),
  jobCommitment: new Uint8Array(32).fill(3),
  dek: new Uint8Array(32).fill(5),
  salt: new Uint8Array(32).fill(6),
  listingVersion: 1,
  delivery: {
    eph_pk: "8dd8107471eddbd0decc577075e0c5348a3a1b45ac760102dd9f610ba8d55a72",
    entries: [
      {
        recipient: "57db4b359f23ae5e146e4e2512056704722506348c150c14753d0c933d04d421",
        ciphertext:
          "d0cf5423f25ddf85536b8f3e84509e75afa817041da973cacd15e43a2d62763fe2774c71fee3e38d7f7280391457e0a44fd5e6ef1e4fe59caeccf04da8ec2da7f0ca5202f210dca7e4104269381440b91f176260",
      },
      {
        recipient: "73b2d8b76aa9b53660032bc8f5d8bee3a3ae4e3b3a7fd49ade81f7347a34aa68",
        ciphertext:
          "461ea0fef0e5819e5059511688a67ebf78607d1b3e90ebafc4f4078864407aeaecb11e92c2e8cd108839a8eacd76e435bd7436692628a18e26c097cde72bee00d24763f868033e58473c73713446cba99da858ad",
      },
    ],
  },
};

test("the buyer opens the entry the room sealed for them, and gets DEK_g and the salt", async () => {
  const opened = await openDelivery(VECTOR.delivery, VECTOR.buyerSk, VECTOR.jobCommitment);
  assert.deepEqual(opened.dek, VECTOR.dek);
  assert.deepEqual(opened.salt, VECTOR.salt);
  assert.equal(opened.listingVersion, VECTOR.listingVersion);
  assert.equal(DELIVERY_PAYLOAD_BYTES, 68);
});

test("a secret key that is not 32 bytes has no public key", async () => {
  await assert.rejects(() => boxPublicKey(new Uint8Array(31)), /a secret key is 32 bytes/);
  // And a real one is the X25519 point the room addresses an entry to.
  assert.equal((await boxPublicKey(new Uint8Array(32).fill(9))).length, 32);
});

test("HKDF refuses an empty output, which would be a key that is not one", async () => {
  await assert.rejects(() => hkdf(new Uint8Array(32), new Uint8Array(0), new Uint8Array(0), 0), /at least one byte/);
  // And a real derivation is 32 bytes of key material, deterministic for the same inputs.
  const once = await hkdf(new Uint8Array(32).fill(1), new Uint8Array(0), new TextEncoder().encode("i"), 32);
  const twice = await hkdf(new Uint8Array(32).fill(1), new Uint8Array(0), new TextEncoder().encode("i"), 32);
  assert.equal(once.length, 32);
  assert.deepEqual(twice, once);
});

test("a compliance copy is just the second recipient of the same delivery (AC-55)", async () => {
  const opened = await openDelivery(VECTOR.delivery, VECTOR.complianceSk, VECTOR.jobCommitment);
  assert.deepEqual(opened.dek, VECTOR.dek, "the same key, sealed again to another recipient");
});

test("a delivery is bound to its job and to its recipient, and says which failed", async () => {
  // The right key, the wrong job: the commitment is the AEAD's additional data.
  await assert.rejects(
    () => openDelivery(VECTOR.delivery, VECTOR.buyerSk, new Uint8Array(32).fill(4)),
    /does not authenticate/,
  );
  // A key the delivery was never sealed to.
  await assert.rejects(
    () => openDelivery(VECTOR.delivery, new Uint8Array(32).fill(13), VECTOR.jobCommitment),
    /holds no entry for this key/,
  );
  // A commitment that is not 32 bytes, and an ephemeral key that is not.
  await assert.rejects(
    () => openDelivery(VECTOR.delivery, VECTOR.buyerSk, new Uint8Array(31)),
    /a job commitment is 32 bytes/,
  );
  await assert.rejects(
    () =>
      openDelivery(
        { ...VECTOR.delivery, eph_pk: "abcd" },
        VECTOR.buyerSk,
        VECTOR.jobCommitment,
      ),
    /ephemeral key is not 32 bytes/,
  );
  // A ciphertext that opens but is not 68 bytes could not be a payload. Sealed here exactly the
  // way the room seals one, so what is being tested is the length check and nothing else.
  const recipient = await boxPublicKey(VECTOR.buyerSk);
  const ephPk = fromHex(VECTOR.delivery.eph_pk);
  const entryKey = await hkdf(
    await sodiumSharedSecret(VECTOR.buyerSk, ephPk),
    new Uint8Array(0),
    concatBytes(new TextEncoder().encode("marginal/delivery-key/v1"), ephPk, recipient),
    32,
  );
  const entryNonce = fromHex(await sha256Hex(concatBytes(ephPk, recipient))).subarray(0, 24);
  const stunted = {
    eph_pk: VECTOR.delivery.eph_pk,
    entries: [
      {
        recipient: toHex(recipient),
        ciphertext: toHex(
          await sealWithNonce(entryKey, entryNonce, new Uint8Array(4), VECTOR.jobCommitment),
        ),
      },
    ],
  };
  await assert.rejects(
    () => openDelivery(stunted, VECTOR.buyerSk, VECTOR.jobCommitment),
    /a delivery payload is 68 bytes/,
  );
});

test("the good opens with the delivered key and is checked against its commitment (§3.19)", async () => {
  const text = "# Memo\n\nOne claim, and then another.\n";
  const key = await dek();
  const saltBytes = await salt();
  // The good is sealed with no additional data, which is how the room opens it.
  const object = await aeadSeal(key, new TextEncoder().encode(text), new Uint8Array(0));
  const commitment = await goodCommitment(saltBytes, text);
  const payload = { dek: key, salt: saltBytes, listingVersion: 1 };

  assert.equal(await openGood(object, payload, commitment), text);

  // The commitment is what makes this a check rather than a decryption: a good that opens but
  // commits to something else is not the good that was appraised and sold.
  await assert.rejects(
    () => openGood(object, payload, "00".repeat(32)),
    /commits to [0-9a-f]{64}, not the 0{64} this listing published/,
  );
  // A wrong key does not authenticate, and an object with no room for a nonce is refused.
  const otherKey = await dek();
  await assert.rejects(
    () => openGood(object, { ...payload, dek: otherKey }, commitment),
    /does not authenticate/,
  );
  await assert.rejects(
    () => openGood(new Uint8Array(10), payload, commitment),
    /too short to hold a nonce/,
  );
});
