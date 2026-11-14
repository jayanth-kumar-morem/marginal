import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";

import { generateRoomKeys } from "./keys.js";

test("a room's keys are 32-byte raw keys, generated fresh every time", () => {
  const a = generateRoomKeys();
  const b = generateRoomKeys();
  assert.equal(a.signPk.length, 32);
  assert.equal(a.boxPk.length, 32);
  assert.notDeepEqual(a.signPk, b.signPk, "a restart always means new keys");
  assert.notDeepEqual(a.boxPk, b.boxPk);
  assert.notDeepEqual(a.signPk, a.boxPk);
});

test("what the room signs verifies against the key it publishes", () => {
  const keys = generateRoomKeys();
  const message = Buffer.from("marginal/verdict/v1 and then some bytes", "utf8");
  const signature = keys.sign(new Uint8Array(message));
  assert.equal(signature.length, 64);

  // Rebuild the public key from the raw 32 bytes the room publishes, the way a contract has it.
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(keys.signPk)]);
  const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
  assert.equal(verify(null, message, publicKey, signature), true);

  const tampered = Buffer.from(message);
  tampered.writeUInt8(tampered.readUInt8(0) ^ 1, 0);
  assert.equal(verify(null, tampered, publicKey, signature), false);
});

test("the box key is an X25519 key the room can decrypt with", () => {
  const keys = generateRoomKeys();
  const key = keys.boxPrivate();
  assert.equal(key.asymmetricKeyType, "x25519");
  const raw = createPublicKey(key).export({ type: "spki", format: "der" });
  assert.deepEqual(new Uint8Array(raw.subarray(raw.length - 32)), keys.boxPk);
});
