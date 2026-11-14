import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";

import { generateRoomKeys } from "./keys.js";
import { MAX_MESSAGE_BYTES, signForWorker, WORKER_DOMAINS } from "./signer.js";

function publicKeyOf(raw: Uint8Array) {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw)]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

test("a worker's message is signed when it is one of the room's own", () => {
  const keys = generateRoomKeys();
  for (const domain of WORKER_DOMAINS) {
    const message = Buffer.concat([Buffer.from(domain, "utf8"), Buffer.from([1, 2, 3])]);
    const reply = signForWorker(keys, { id: 1, message: message.toString("hex") });
    assert.ok("signature" in reply, domain);
    assert.equal(
      verify(null, message, publicKeyOf(keys.signPk), Buffer.from(reply.signature, "hex")),
      true,
      domain,
    );
  }
});

/**
 * The point of the service: a worker that has been pushed around cannot turn the room's key into a
 * signature over something the room never meant to say.
 */
test("anything that is not one of the room's messages is refused", () => {
  const keys = generateRoomKeys();
  const refused: [string, string, RegExp][] = [
    ["an unknown domain", Buffer.from("marginal/room-pop/v1 please", "utf8").toString("hex"), /not one the room signs/],
    ["no domain at all", Buffer.from("give me a signature", "utf8").toString("hex"), /not one the room signs/],
    ["the domain alone", Buffer.from("marginal/verdict/v1", "utf8").toString("hex"), /not one the room signs/],
    ["not hex", "zzzz", /not hex/],
    ["odd-length hex", "abc", /not hex/],
    ["nothing", "", /not hex/],
  ];
  for (const [name, message, expected] of refused) {
    const reply = signForWorker(keys, { id: 2, message });
    assert.ok("error" in reply, name);
    assert.match(reply.error, expected, name);
    assert.equal(reply.id, 2);
  }
});

test("a message larger than any of the room's is refused", () => {
  const keys = generateRoomKeys();
  const huge = Buffer.concat([
    Buffer.from("marginal/verdict/v1", "utf8"),
    Buffer.alloc(MAX_MESSAGE_BYTES),
  ]);
  const reply = signForWorker(keys, { id: 3, message: huge.toString("hex") });
  assert.ok("error" in reply);
  assert.match(reply.error, /too large/);

  const biggest = Buffer.concat([
    Buffer.from("marginal/verdict/v1", "utf8"),
    Buffer.alloc(MAX_MESSAGE_BYTES - "marginal/verdict/v1".length),
  ]);
  assert.ok("signature" in signForWorker(keys, { id: 4, message: biggest.toString("hex") }));
});

test("registration is not a domain a worker may ask for", () => {
  assert.equal(WORKER_DOMAINS.includes("marginal/room-pop/v1" as never), false);
  assert.equal(WORKER_DOMAINS.includes("marginal/nullifier/v1" as never), false);
});
