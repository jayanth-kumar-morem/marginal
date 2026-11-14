import test from "node:test";
import assert from "node:assert/strict";
import { call } from "@marginal/core-wasm";

import { generateRoomKeys } from "../keys.js";
import {
  NP_NO_PERSISTENT_STORAGE,
  NP_NO_SWAP,
  NP_PROCESS_EXIT,
  NP_TEE_MEMORY,
  buildCertificate,
  nonPersistenceBasis,
  scopeFor,
  signCertificate,
} from "./forget.js";

const attestation = {
  measurement: {
    mrtd: "01".repeat(48),
    rtmr0: "02".repeat(48),
    rtmr1: "03".repeat(48),
    rtmr2: "04".repeat(48),
    compose_hash: "05".repeat(32),
    key_provider_digest: "06".repeat(48),
    gpu_policy_hash: null,
  },
  ppid_hash: "07".repeat(32),
  quote_hash: "08".repeat(32),
  collateral_hash: "09".repeat(32),
  mode: "OnChainDcap",
  expires_at: 1,
};

const job = {
  id: 11,
  kind: "Appraisal",
  listing_id: 3,
  listing_version: 2,
  state: "Computing",
  job_commitment: "0a".repeat(32),
  privacy: "Blind",
  deadline_height: 99,
};

const inputs = {
  job,
  attestation,
  config: { chain_id: "sandbox", keypolicy: "keypolicy.test", policy_version: 4 },
  clearing: "clearing.test",
  roomKeyHex: "0b".repeat(32),
  inputCommitments: ["0c".repeat(32)],
  keyIdsDestroyed: ["0d".repeat(32)],
  egress: ["0e".repeat(32)],
  tStart: 100,
  tEnd: 200,
  outcome: "Deal",
};

test("the scope says what the room actually held, and nothing more", () => {
  assert.deepEqual(scopeFor("Appraisal", "Deal"), ["BuyerContext", "GoodPlaintext"]);
  assert.deepEqual(scopeFor("Appraisal", "NoDeal"), ["BuyerContext", "GoodPlaintext"]);
  // The good was never decrypted in these two (§3.14.2 steps 3 and 4).
  assert.deepEqual(scopeFor("Appraisal", "InputRejected"), []);
  assert.deepEqual(scopeFor("Appraisal", "Restricted"), ["BuyerContext"]);
  assert.deepEqual(scopeFor("Screening", "NoDeal"), ["GoodPlaintext"]);
  assert.deepEqual(scopeFor("Provisioning", "NoDeal"), [], "it only ever held a key");
});

test("a simulated room does not claim TDX", () => {
  assert.equal(
    nonPersistenceBasis("OnChainDcap"),
    NP_PROCESS_EXIT | NP_NO_PERSISTENT_STORAGE | NP_NO_SWAP | NP_TEE_MEMORY,
  );
  assert.equal(nonPersistenceBasis("AttesterQuorum"), 15);
  assert.equal(
    nonPersistenceBasis("Simulated"),
    NP_PROCESS_EXIT | NP_NO_PERSISTENT_STORAGE | NP_NO_SWAP,
    "a certificate must be weaker when the room is",
  );
});

test("the certificate quotes the attestation record, not the room's belief about itself", () => {
  const certificate = buildCertificate(inputs);
  assert.equal(certificate.measurement, attestation.measurement);
  assert.equal(certificate.ppid_hash, attestation.ppid_hash);
  assert.equal(certificate.policy_version, 4);
  assert.equal(
    certificate.attestation_ref,
    call("attestation_ref", { quote_hash: "08".repeat(32), collateral_hash: "09".repeat(32) }),
  );
  // It round-trips through core, which is what pins the layout a verifier will read.
  const bytes = call("certificate_encode", certificate) as string;
  assert.deepEqual(call("certificate_decode", { bytes }), certificate);
});

test("the signature is the supervisor's, over the bytes core builds", async () => {
  const keys = generateRoomKeys();
  const signed = await signCertificate(
    (message) =>
      Promise.resolve(
        Buffer.from(keys.sign(new Uint8Array(Buffer.from(message, "hex")))).toString("hex"),
      ),
    inputs,
  );
  assert.equal(signed.hash, call("certificate_hash", signed.certificate));
  assert.equal(signed.bytes, call("certificate_encode", signed.certificate));

  const { createPublicKey, verify } = await import("node:crypto");
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(keys.signPk),
  ]);
  assert.equal(
    verify(
      null,
      Buffer.from(call("certificate_signing_bytes", signed.certificate) as string, "hex"),
      createPublicKey({ key: der, format: "der", type: "spki" }),
      Buffer.from(signed.signature, "hex"),
    ),
    true,
  );
});
