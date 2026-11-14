import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { call } from "@marginal/core-wasm";

import { appId, listingKeys } from "../crypto/ckd.js";
import { generateRoomKeys } from "../keys.js";
import {
  CLEARING,
  KEYPOLICY,
  MPC_PUBLIC_KEY,
  ckdNetwork,
  fakeOperator,
  httpJsonServer,
  job as jobFixture,
  jobRecordFixture,
  sealGood,
  supervisorHost,
  viewMethod,
  viewReply,
} from "../testing.js";
import { main } from "./main.js";
import type { ChannelProcess } from "./ipc.js";

const env = {
  MARGINAL_RPC_URL: "http://127.0.0.1:1",
  MARGINAL_CHAIN_ID: "sandbox",
  MARGINAL_CLEARING: CLEARING,
  MARGINAL_KEYPOLICY: KEYPOLICY,
  MARGINAL_OPERATOR_URL: "http://127.0.0.1:2",
  MARGINAL_MPC_PUBLIC_KEY: MPC_PUBLIC_KEY,
};

function host(): { process: ChannelProcess; give(kind: string): void } {
  const events = new EventEmitter();
  return {
    process: {
      on: (event, listener) => events.on(event, listener),
      send: () => true,
    },
    give(kind: string) {
      events.emit("message", {
        kind: "job",
        job: jobFixture(11, { kind }),
        room_key: "0b".repeat(32),
      });
    },
  };
}

test("the worker waits for its job, then runs the pipeline for its kind", async () => {
  const h = host();
  const running = main(h.process, env);
  h.give("Redelivery");
  // Re-delivery is v2: the worker says so rather than pretending to run it.
  await assert.rejects(() => running, /does not run Redelivery jobs/);
});

test("a worker started on a kind no room runs says so, and a bad configuration stops it", async () => {
  const h = host();
  const running = main(h.process, env);
  h.give("Session");
  await assert.rejects(() => running, /does not run Session jobs/);

  const broken = host();
  const failing = main(broken.process, { ...env, MARGINAL_RPC_URL: "" });
  broken.give("Provisioning");
  await assert.rejects(() => failing, /MARGINAL_RPC_URL is required/);
});

/**
 * The whole worker, driven through its entry point: a real `workerChannel` over a supervisor that
 * answers the three requests, a real NEAR RPC over HTTP, real CKD recovery, real sealed boxes and a
 * real signature. The only thing played rather than run is the MPC network and the chain's answers.
 */
test("a forked worker runs its job end to end through main", async () => {
  const keys = generateRoomKeys();
  const network = ckdNetwork();
  const path = call("listing_path", { seller: "alice.testnet", listing_id: 3, version: 1 }) as string;
  const id = appId(KEYPOLICY, path);
  const derived = listingKeys(network.sigma(id));
  const sealed = sealGood("A published note.", derived.publicKey);

  const operator = fakeOperator();
  operator.blobs.set("listings/3/v1/good", sealed.object);
  operator.blobs.set("listings/3/v1/dek", sealed.wrapped);
  // The network answers for whatever app key the room actually drew, which it reads out of the
  // request the room signed — exactly the information the real network has.
  let pk1 = new Uint8Array(48);
  const base = operator.submit.bind(operator);
  operator.submit = (method, args, contract) => {
    void base(method, args, contract);
    if (method === "authorize") {
      const decoded = call("key_request_decode", {
        bytes: Buffer.from(args.request as string, "base64").toString("hex"),
      }) as { app_key: { pk1: string } };
      pk1 = new Uint8Array(Buffer.from(decoded.app_key.pk1, "hex"));
      return Promise.resolve("7");
    }
    if (method === "derive") return Promise.resolve(network.answer(id, pk1));
    return Promise.resolve(null);
  };

  const record = jobFixture(11, { kind: "Provisioning", listing_id: 3, listing_version: 1 });
  const rpc = await httpJsonServer((_path, body) => {
    const method = viewMethod(body);
    if (method === "config") {
      return { json: viewReply({ chain_id: "sandbox", keypolicy: KEYPOLICY, policy_version: 4 }) };
    }
    if (method === "get_job") {
      return {
        json: viewReply(
          jobRecordFixture({ kind: "Provisioning", listing_id: 3, job_commitment: record.job_commitment }),
        ),
      };
    }
    if (method === "get_attestation") {
      return {
        json: viewReply({
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
          expires_at: 2_000_000_000,
        }),
      };
    }
    return {
      json: viewReply({
        id: 3,
        seller: "alice.testnet",
        version: 1,
        status: "Draft",
        good_commitment: sealed.good_commitment,
        ciphertext: { uri_hash: "0a".repeat(32), sha256: sealed.sha256, size_class: 12 },
        key_mode: "Ckd",
        pk_l: null,
        appraiser: "knowledge@1",
        value_class: "M",
      }),
    };
  });

  const supervisor = supervisorHost(keys, operator);
  try {
    const running = main(supervisor.process, {
      ...env,
      MARGINAL_RPC_URL: rpc.url,
      MARGINAL_MPC_PUBLIC_KEY: network.publicKey,
    });
    supervisor.give(record);
    await running;
  } finally {
    await rpc.close();
  }

  // It reported the key it derived, and stored the certificate beside it.
  assert.deepEqual(
    operator.submitted.map((s) => `${s.contract}.${s.method}`),
    ["keypolicy.authorize", "keypolicy.derive", "clearing.submit_provisioning"],
  );
  const reported = call("key_request_decode", {
    bytes: Buffer.from(operator.submitted[0]?.args.request as string, "base64").toString("hex"),
  }) as { job_id: number; path: string; room_key: string };
  assert.equal(reported.job_id, 11);
  assert.equal(reported.path, path);
  assert.equal(reported.room_key, Buffer.from(keys.signPk).toString("hex"));
  const certKey = [...operator.blobs.keys()].find((k) => k.startsWith("certs/"));
  assert.ok(certKey, "the certificate was stored");
  const certificate = call("certificate_decode", {
    bytes: operator.blobs.get(certKey) ?? "",
  }) as { t_start: number; t_end: number };
  // A real clock, not a fixture: the window is now, and it does not run backwards.
  const now = Math.floor(Date.now() / 1_000);
  assert.ok(certificate.t_start <= certificate.t_end, "the window does not run backwards");
  assert.ok(now - certificate.t_start < 60, `t_start was ${certificate.t_start}`);
  // And the key it reported is the one CKD gave it, not one it made up.
  const report = Buffer.from(operator.submitted[2]?.args.report as string, "base64").toString("hex");
  assert.ok(report.includes(Buffer.from(derived.publicKey).toString("hex")), "pk_L is in the report");
});
