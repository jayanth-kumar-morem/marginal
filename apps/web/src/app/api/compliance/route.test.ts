/**
 * The wiring in `route.ts`, driven the only way it can be: a real `Request`, a stubbed
 * `globalThis.fetch` (which is what `chainClient` and the proxies pick up), and the real
 * `marginal-core` wasm behind the audit step and the delivery decode.
 *
 * The audit fixture below is a real sandbox chain's first two entries and its real
 * `audit_head()`, so this file also checks that `audit_step` is being called with the arguments
 * `marginal-core` expects — a renamed field would still typecheck and would still fold to
 * *something*, just not to the head the contract published.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { call } from "@marginal/core-wasm";

import { exportFiles, type AuditExport } from "../../../lib/compliance";

// Set before `route.ts` is imported for the first time, because `loadConfig` reads the environment.
process.env.MARGINAL_CLEARING = "clearing.sandbox";
process.env.MARGINAL_KEYPOLICY = "keypolicy.sandbox";
process.env.MARGINAL_CHAIN_ID = "sandbox";
process.env.MARGINAL_RPC_URL = "http://rpc.test";
process.env.MARGINAL_GATEWAY_URL = "http://gateway.test";
process.env.MARGINAL_COMPLIANCE_URL = "http://compliance.test";

const { GET, POST, dynamic } = await import("./route");

/** Audit entries 1 and 2 of a local sandbox deploy, and the head the contract published for them. */
const ENTRIES = [
  {
    seq: 1,
    height: 2_240,
    kind: "PolicyExecuted",
    subject_id: 1,
    payload_hash: "b844053c13c41f2597470f45aacd1ccf7c32302b0f6012c56d93deddb95de3d0",
  },
  {
    seq: 2,
    height: 2_246,
    kind: "ListingCreated",
    subject_id: 1,
    payload_hash: "2e840048b3dbda1c67ee46fcf163d7f945b501622403becfd54510fceafbac3d",
  },
];
const HEAD = "0f6f02da0e60d032fe7fde9c0290d742e5173d48c905329637aceb0172151b75";

/** A delivery with a buyer entry and a compliance copy, in `marginal-core`'s own Borsh bytes. */
const DELIVERY = {
  eph_pk: "99".repeat(32),
  entries: [
    { recipient: "11".repeat(32), ciphertext: "dead" },
    { recipient: "22".repeat(32), ciphertext: "beef" },
  ],
};
const DELIVERY_BYTES = call("delivery_encode", DELIVERY) as string;

/** A NEAR view reply: the JSON of `value`, as the byte array the RPC returns. */
const viewReply = (value: unknown): unknown => ({
  result: { result: Array.from(new TextEncoder().encode(JSON.stringify(value))) },
});

function stubFetch(): void {
  globalThis.fetch = ((input: unknown, init?: { body?: string }): Promise<Response> => {
    const url = String(input);
    if (url === "http://rpc.test") {
      const body = JSON.parse(init?.body ?? "{}") as {
        params: { method_name: string };
      };
      const method = body.params.method_name;
      const answer =
        method === "audit_head"
          ? { seq: ENTRIES.length, head: HEAD }
          : method === "get_audit"
            ? ENTRIES
            : { next_job_id: 1, next_listing_id: 1 };
      return Promise.resolve(new Response(JSON.stringify(viewReply(answer))));
    }
    if (url === "http://gateway.test/v1/blob/deliveries/4") {
      return Promise.resolve(
        new Response(Uint8Array.from(Buffer.from(DELIVERY_BYTES, "hex"))),
      );
    }
    return Promise.reject(new Error(`nothing stubs ${url}`));
  }) as unknown as typeof globalThis.fetch;
}

test("the route is never cached", () => {
  assert.equal(dynamic, "force-dynamic");
});

test("a GET with no operation is refused without touching anything", async () => {
  const response = await GET(new Request("http://web.test/api/compliance"));
  assert.equal(response.status, 400);
});

test("the export's recomputed head is the head the contract published", async () => {
  stubFetch();
  const response = await GET(new Request("http://web.test/api/compliance?op=export"));
  const body = (await response.json()) as { export: AuditExport };
  assert.equal(body.export.manifest.head, HEAD);
  assert.equal(body.export.manifest.recomputed_head, HEAD);
  assert.equal(body.export.manifest.chain_id, "sandbox");
  assert.equal(body.export.manifest.clearing, "clearing.sandbox");
  assert.equal(body.export.entries.length, 2);
});

test("that same export, posted back, re-verifies against the chain", async () => {
  stubFetch();
  const taken = (await (
    await GET(new Request("http://web.test/api/compliance?op=export"))
  ).json()) as { export: AuditExport };
  const files = Object.fromEntries(
    exportFiles(taken.export).map((file) => [file.name, file.text]),
  );
  const response = await POST(
    new Request("http://web.test/api/compliance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files }),
    }),
  );
  const body = (await response.json()) as {
    report: { holds: boolean; advanced: boolean; mismatches: readonly unknown[] };
  };
  assert.equal(body.report.holds, true);
  assert.equal(body.report.advanced, false);
  assert.deepEqual(body.report.mismatches, []);
});

test("a sealed delivery is decoded by marginal-core, not by this app", async () => {
  stubFetch();
  const response = await GET(new Request("http://web.test/api/compliance?op=delivery&job=4"));
  assert.deepEqual(await response.json(), { reachable: true, delivery: DELIVERY });
});
