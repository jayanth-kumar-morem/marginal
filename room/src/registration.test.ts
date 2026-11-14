import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { call } from "@marginal/core-wasm";

import { generateRoomKeys } from "./keys.js";
import {
  buildRegistration,
  proofOfPossession,
  register,
  reportData,
  roomBinding,
  rtmr3Events,
  simulatedBundle,
  toHex,
} from "./registration.js";
import { fakeDstack, fakeOperator, goodEventLog, testConfig } from "./testing.js";

const NONCE = "11".repeat(32);

test("the binding is what KeyPolicy will check, and the report data is core's", () => {
  const config = testConfig();
  const keys = generateRoomKeys();
  const binding = roomBinding(config, keys, NONCE);
  assert.deepEqual(binding, {
    chain_id: config.chainId,
    keypolicy: config.keypolicy,
    sign_pk: toHex(keys.signPk),
    box_pk: toHex(keys.boxPk),
    nonce: NONCE,
  });
  assert.equal(toHex(reportData(binding)), call("room_report_data", binding));
  assert.equal(reportData(binding).length, 64);
});

test("the proof of possession is the room's signature over its own report data", () => {
  const keys = generateRoomKeys();
  const binding = roomBinding(testConfig(), keys, NONCE);
  const signature = proofOfPossession(keys, binding);
  assert.equal(signature.length, 64);
  // The same bytes KeyPolicy verifies, signed by the key the binding names.
  const expected = keys.sign(
    new Uint8Array(Buffer.from(call("room_pop_signing_bytes", binding) as string, "hex")),
  );
  assert.deepEqual(signature, expected);
});

test("only the RTMR3 entries are kept, in order, with their payload bytes", () => {
  const events = rtmr3Events(goodEventLog());
  assert.equal(events.length, goodEventLog().length - 1, "the imr-1 entry is dropped");
  assert.deepEqual(events[0], { event_type: 0x08000001, name: "system-preparing", payload: "" });
  assert.equal(events[1]?.name, "app-id");
  // The events go to core exactly as they are, and replay there.
  assert.match(call("rtmr3_replay", { events }) as string, /^[0-9a-f]{96}$/);
});

test("a registration carries the signed parts, and not the collateral", async () => {
  const config = testConfig();
  const keys = generateRoomKeys();
  const dstack = fakeDstack();
  const bundle = await buildRegistration(config, keys, dstack, NONCE);

  assert.equal(dstack.calls, 1);
  assert.equal(bundle.sign_pk, toHex(keys.signPk));
  assert.equal(bundle.box_pk, toHex(keys.boxPk));
  assert.equal(bundle.nonce, NONCE);
  assert.equal(bundle.class, "Kcpu");
  assert.match(bundle.quote, /^[0-9a-f]+$/);
  // It has to be the room's own signature over the pop bytes, because that is what KeyPolicy
  // checks: a quote proves what software runs, not who holds the key (E3.2).
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(keys.signPk),
  ]);
  const popBytes = Buffer.from(
    call("room_pop_signing_bytes", roomBinding(config, keys, NONCE)) as string,
    "hex",
  );
  assert.equal(
    verify(null, popBytes, createPublicKey({ key: der, format: "der", type: "spki" }), Buffer.from(bundle.sign_sig, "hex")),
    true,
    "sign_sig is the room's signature over its own proof-of-possession bytes",
  );
  assert.equal(bundle.events.length, 9);
  assert.equal("collateral" in bundle, false, "the agent fetches that");

  // The agent can assemble the call from exactly these parts.
  const encoded = call("register_room_encode", {
    ...bundle,
    collateral: {
      pck_crl_issuer_chain: "",
      root_ca_crl: "",
      pck_crl: "",
      tcb_info_issuer_chain: "",
      tcb_info: "",
      tcb_info_signature: "",
      qe_identity_issuer_chain: "",
      qe_identity: "",
      qe_identity_signature: "",
      pck_certificate_chain: null,
    },
  });
  assert.match(encoded as string, /^[0-9a-f]+$/);
});

test("the room refuses its own registration before anyone pays for it", async () => {
  const config = testConfig();
  const keys = generateRoomKeys();

  // A nonce that is not a nonce.
  await assert.rejects(
    () => buildRegistration(config, keys, fakeDstack(), "nope"),
    /32 bytes of hex/,
  );

  // A quote that reports something else: the 200 TGas verifier call would fail on report data.
  const liar = {
    calls: 0,
    getQuote(): Promise<{ quote: Uint8Array; eventLog: ReturnType<typeof goodEventLog> }> {
      const quote = new Uint8Array(48 + 584);
      quote.set(new Uint8Array(64).fill(9), 48 + 520);
      return Promise.resolve({ quote, eventLog: goodEventLog() });
    },
  };
  await assert.rejects(() => buildRegistration(config, keys, liar, NONCE), /does not report/);

  // An event log of a room this policy does not admit: a KMS key provider.
  const kms = goodEventLog().map((entry) =>
    entry.event === "key-provider"
      ? { ...entry, event_payload: Buffer.from('{"name":"kms","id":"ab"}').toString("hex") }
      : entry,
  );
  await assert.rejects(() => buildRegistration(config, keys, fakeDstack(kms), NONCE), /E_RTMR3_EVENTS/);

  // A log with an event from another register in it cannot replay.
  const foreign = goodEventLog().map((entry) => ({ ...entry, event_type: 1, imr: 3 }));
  await assert.rejects(() => buildRegistration(config, keys, fakeDstack(foreign), NONCE), /E_RTMR3_EVENTS/);
});

test("registering asks the agent for a nonce and hands it the bundle", async () => {
  const keys = generateRoomKeys();
  const operator = fakeOperator();
  const bundle = await register(testConfig(), keys, fakeDstack(), operator);
  assert.equal(operator.registered.length, 1);
  assert.deepEqual(operator.registered[0], bundle);
  // A real bundle says nothing about being simulated, so the agent's check cannot be fooled by it.
  assert.equal("simulated" in bundle, false);
});

test("a simulated registration claims nothing a quote would have proved", () => {
  const config = testConfig({ simulatedAttestation: true });
  const keys = generateRoomKeys();
  const bundle = simulatedBundle(config, keys, NONCE);
  assert.deepEqual(bundle, {
    sign_pk: toHex(keys.signPk),
    box_pk: toHex(keys.boxPk),
    nonce: NONCE,
    class: "Kcpu",
    simulated: true,
  });
  // The measurement is the host's claim, not the room's: the room has no event log to read it from.
  for (const field of ["quote", "events", "sign_sig", "measurement", "ppid_hash"]) {
    assert.equal(field in bundle, false, field);
  }
  // The nonce still has to be one KeyPolicy issued, because the contract spends it either way.
  assert.throws(() => simulatedBundle(config, keys, "nope"), /32 bytes of hex/);
});

test("a simulated run never asks dstack for a quote", async () => {
  // There is no /var/run/dstack.sock on a laptop, so this is not a degraded path but the only one.
  const noDstack = {
    getQuote(): Promise<never> {
      throw new Error("there is no dstack socket here");
    },
  };
  const keys = generateRoomKeys();
  const operator = fakeOperator();
  const bundle = await register(testConfig({ simulatedAttestation: true }), keys, noDstack, operator);
  assert.deepEqual(bundle, simulatedBundle(testConfig({ simulatedAttestation: true }), keys, NONCE));
  assert.deepEqual(operator.registered[0], bundle);

  // And the same room with the flag off does reach dstack, which is what breaks here.
  await assert.rejects(
    () => register(testConfig(), keys, noDstack, fakeOperator()),
    /no dstack socket/,
  );
});
