import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { call } from "@marginal/core-wasm";

import {
  deliveryPayload,
  ephemeralKey,
  openDelivery,
  sealDelivery,
} from "./delivery.js";
import { boxKeys, boxPublicKey, hkdf, randomBytes } from "./sodium.js";

const JOB = new Uint8Array(32).fill(7);

test("the payload is DEK_g, the salt and the listing version, in that order", () => {
  const dek = randomBytes(32);
  const salt = randomBytes(32);
  const payload = deliveryPayload(dek, salt, 258);
  assert.equal(payload.length, 68);
  assert.deepEqual(payload.subarray(0, 32), dek);
  assert.deepEqual(payload.subarray(32, 64), salt);
  assert.deepEqual(payload.subarray(64), new Uint8Array([2, 1, 0, 0]), "u32, little-endian");
  assert.throws(() => deliveryPayload(new Uint8Array(31), salt, 1), /DEK_g is 32 bytes/);
  assert.throws(() => deliveryPayload(dek, new Uint8Array(31), 1), /salt is 32 bytes/);
});

test("the ephemeral key is derived, so it is the same in every room", () => {
  const listing = randomBytes(32);
  const first = ephemeralKey(listing, JOB);
  assert.deepEqual(ephemeralKey(listing, JOB), first);
  assert.equal(first.publicKey.length, 32);
  assert.deepEqual(first.publicKey, boxPublicKey(first.secretKey));
  // A different job, or a different listing key, is a different ephemeral key.
  assert.notDeepEqual(ephemeralKey(listing, new Uint8Array(32).fill(8)).secretKey, first.secretKey);
  assert.notDeepEqual(ephemeralKey(randomBytes(32), JOB).secretKey, first.secretKey);
  // And it is exactly §3.19's derivation, not something else of the same shape.
  assert.deepEqual(
    first.secretKey,
    hkdf(listing, JOB, new Uint8Array(Buffer.from("marginal/delivery/v1", "utf8")), 32),
  );
  assert.throws(() => ephemeralKey(listing, new Uint8Array(31)), /job commitment is 32 bytes/);
});

test("a delivery is byte-identical across runs, and h_D with it (AC-31)", () => {
  const listing = randomBytes(32);
  const buyer = boxKeys();
  const payload = deliveryPayload(randomBytes(32), randomBytes(32), 1);
  const first = sealDelivery(listing, JOB, payload, [buyer.publicKey]);
  const second = sealDelivery(listing, JOB, payload, [buyer.publicKey]);
  assert.deepEqual(second, first, "no randomness anywhere in it");
  assert.equal(
    call("delivery_hash", first),
    call("delivery_hash", second),
    "so h_D is the same, which is what the verdict committed to",
  );
  // It is a DeliveryV1 as core defines it, not merely a lookalike.
  const bytes = call("delivery_encode", first) as string;
  assert.deepEqual(call("delivery_decode", { bytes }), first);
  assert.equal(
    call("delivery_hash", first),
    createHash("sha256").update(Buffer.from(bytes, "hex")).digest("hex"),
  );
});

test("the buyer opens their entry, and only theirs", () => {
  const listing = randomBytes(32);
  const buyer = boxKeys();
  const compliance = boxKeys();
  const stranger = boxKeys();
  const payload = deliveryPayload(randomBytes(32), randomBytes(32), 3);

  const delivery = sealDelivery(listing, JOB, payload, [buyer.publicKey, compliance.publicKey]);
  assert.equal(delivery.entries.length, 2, "the compliance copy is a second entry (AC-55)");
  assert.deepEqual(openDelivery(delivery, buyer.secretKey, JOB), payload);
  assert.deepEqual(openDelivery(delivery, compliance.secretKey, JOB), payload);
  assert.throws(() => openDelivery(delivery, stranger.secretKey, JOB), /no entry for this key/);

  // Each entry has its own key and nonce, so two recipients never share a keystream.
  assert.notEqual(delivery.entries[0]?.ciphertext, delivery.entries[1]?.ciphertext);
});

test("a delivery is bound to its job: another commitment does not open it", () => {
  const listing = randomBytes(32);
  const buyer = boxKeys();
  const payload = deliveryPayload(randomBytes(32), randomBytes(32), 1);
  const delivery = sealDelivery(listing, JOB, payload, [buyer.publicKey]);
  assert.throws(
    () => openDelivery(delivery, buyer.secretKey, new Uint8Array(32).fill(9)),
    /does not authenticate/,
  );
  // A delivery for another job is a different object even to the same buyer.
  const other = sealDelivery(listing, new Uint8Array(32).fill(9), payload, [buyer.publicKey]);
  assert.notEqual(other.eph_pk, delivery.eph_pk);
});

test("a malformed delivery is refused rather than half-read", () => {
  const buyer = boxKeys();
  assert.throws(
    () => openDelivery({ eph_pk: "aabb", entries: [{ recipient: Buffer.from(buyer.publicKey).toString("hex"), ciphertext: "00" }] }, buyer.secretKey, JOB),
    /ephemeral key is not 32 bytes/,
  );
  assert.throws(
    () => sealDelivery(randomBytes(32), JOB, deliveryPayload(randomBytes(32), randomBytes(32), 1), []),
    /nobody to deliver to/,
  );
});
