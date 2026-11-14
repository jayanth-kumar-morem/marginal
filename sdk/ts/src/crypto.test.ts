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
  MIN_CLAIM_WORDS,
  SALT_BYTES,
  aeadSeal,
  canonicalise,
  claims,
  dek,
  fromHex,
  getDeliveryKey,
  goodCommitment,
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
