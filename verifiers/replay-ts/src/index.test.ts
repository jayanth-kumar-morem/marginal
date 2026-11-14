import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { call } from "@marginal/core-wasm";

import {
  AUDIT_PAGE,
  chainClient,
  PACKAGE,
  auditCheck,
  bucketCheck,
  certificateCheck,
  compensationCheck,
  debitCheck,
  gapChecks,
  replayer,
  stateCheck,
  type ChainPort,
} from "./index.js";

const ZERO32 = "0".repeat(64);
const CERT = "ce".repeat(32);

/** A job as `get_job` reports it after settlement: the buckets are the ones settlement wrote. */
const job = (over: Partial<ReturnType<typeof baseJob>> = {}) => ({ ...baseJob(), ...over });
function baseJob() {
  return {
    id: 7,
    state: "Deal",
    listing_id: 3,
    privacy: "Open",
    max_debit_mbits: 4_000,
    buckets: {
      budget: "0",
      compute: "0",
      comp_reserved: "0",
      fee_reserved: "0",
      storage: "0",
      held: "400000000",
      refund: "75000000",
    },
  };
}

const settlement = (over: Partial<ReturnType<typeof baseSettlement>> = {}) => ({
  ...baseSettlement(),
  ...over,
});
function baseSettlement() {
  return {
    outcome: "Deal",
    price: "400000000",
    refund: "75000000",
    held: "400000000",
    leakage_debit_mbits: 4_000,
    leakage_comp: "25000000",
    cert_hashes: [CERT],
    components_commitment: null as string | null,
    audit_seq: 12,
  };
}

const listing = { leakage: { price_per_bit: "6250000" } };

/** A chain that answers from a table. An `Error` value is thrown, which is what an absent view does. */
function fakeChain(answers: Record<string, unknown>): ChainPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    view<T>(_contract: string, method: string, args?: unknown): Promise<T> {
      const key = `${method}:${JSON.stringify(args ?? {})}`;
      asked.push(key);
      const answer = answers[key];
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(answer as T);
    },
  };
}

/** The real audit head for a list of entries, computed the way the contract computes it. */
function headOf(entries: readonly Record<string, unknown>[]): string {
  let digest = ZERO32;
  for (const entry of entries) digest = call("audit_step", { prev_head: digest, entry }) as string;
  return digest;
}

const entry = (seq: number) => ({
  seq,
  height: 1_000 + seq,
  kind: "JobSettled",
  subject_id: 7,
  payload_hash: "ab".repeat(32),
});

test("the outcome table is core's: a deal must leave the job Deal", () => {
  assert.equal(stateCheck(job(), settlement()).ok, true);
  assert.equal(stateCheck(job({ state: "NoDeal" }), settlement()).ok, false);
  assert.match(stateCheck(job({ state: "NoDeal" }), settlement()).detail, /must leave the job Deal/);
  // An outcome that is not a first settlement has no end state, which core refuses outright.
  const revoked = stateCheck(job(), settlement({ outcome: "Revoked" }));
  assert.equal(revoked.ok, false);
  assert.match(revoked.detail, /core refuses this outcome/);
});

test("settlement empties the funded buckets and leaves exactly held and refund", () => {
  const good = bucketCheck(job(), settlement());
  assert.deepEqual(
    good.map((one) => one.ok),
    [true, true],
  );
  const stillFunded = bucketCheck(
    job({ buckets: { ...baseJob().buckets, budget: "1", fee_reserved: "2" } }),
    settlement(),
  );
  assert.equal(stillFunded[0]?.ok, false);
  assert.match(stillFunded[0]?.detail ?? "", /still funded: budget, fee_reserved/);
  // A record whose two copies of the same figure disagree has been edited.
  const drifted = bucketCheck(job(), settlement({ refund: "75000001" }));
  assert.equal(drifted[1]?.ok, false);
  assert.match(drifted[1]?.detail ?? "", /75000001/);
});

test("a priced outcome spends its whole reservation, and nothing may exceed it", () => {
  assert.equal(debitCheck(job(), settlement()).ok, true);
  assert.match(debitCheck(job(), settlement()).detail, /spends in full/);
  assert.equal(debitCheck(job(), settlement({ leakage_debit_mbits: 3_999 })).ok, false);
  // Restricted debits one bit of the reservation, which is within it.
  const restricted = debitCheck(
    job({ state: "Restricted" }),
    settlement({ outcome: "Restricted", leakage_debit_mbits: 1_000 }),
  );
  assert.equal(restricted.ok, true);
  assert.match(restricted.detail, /within the 4000 reserved/);
  // But not more than was reserved, whatever the outcome.
  assert.equal(
    debitCheck(job(), settlement({ outcome: "Restricted", leakage_debit_mbits: 5_000 })).ok,
    false,
  );
});

test("the seller's compensation is π · d, floored, or the reserve if that was smaller", () => {
  // 6,250,000 × 4,000 / 1,000 = 25,000,000.
  const exact = compensationCheck(settlement(), listing);
  assert.equal(exact.ok, true);
  assert.match(exact.detail, /π · d = 25000000/);
  // Paid less than owed: the buyer's reserve capped it, which the contract allows.
  const capped = compensationCheck(settlement({ leakage_comp: "10000000" }), listing);
  assert.equal(capped.ok, true);
  assert.match(capped.detail, /capped by the buyer's reserve/);
  // Paid more than owed is never allowed.
  assert.equal(compensationCheck(settlement({ leakage_comp: "25000001" }), listing).ok, false);
  // A π that is not a number is a refusal, not a pass.
  const broken = compensationCheck(settlement(), { leakage: { price_per_bit: "not a number" } });
  assert.equal(broken.ok, false);
  assert.match(broken.detail, /could not be recomputed/);
});

test("a settlement must name a certificate, and a zero hash names nothing", () => {
  assert.equal(certificateCheck(settlement()).ok, true);
  assert.match(certificateCheck(settlement()).detail, /1 certificate anchored/);
  assert.match(
    certificateCheck(settlement({ cert_hashes: [CERT, CERT] })).detail,
    /2 certificates anchored/,
  );
  assert.equal(certificateCheck(settlement({ cert_hashes: [] })).ok, false);
  assert.equal(certificateCheck(settlement({ cert_hashes: [ZERO32] })).ok, false);
});

test("the audit chain is walked in pages and recomputed with core's own step", async () => {
  const entries = Array.from({ length: 3 }, (_, index) => entry(index + 1));
  const chain = fakeChain({
    "audit_head:{}": { seq: 3, head: headOf(entries) },
    'get_audit:{"from":"1","limit":100}': entries,
  });
  const good = await auditCheck(chain, "clearing.testnet");
  assert.equal(good.ok, true, good.detail);
  assert.match(good.detail, /3 entries hash to the head/);

  // One flipped byte anywhere in the log fails it (DRC-2).
  const tampered = [entry(1), { ...entry(2), payload_hash: "cd".repeat(32) }, entry(3)];
  const bad = fakeChain({
    "audit_head:{}": { seq: 3, head: headOf(entries) },
    'get_audit:{"from":"1","limit":100}': tampered,
  });
  assert.equal((await auditCheck(bad, "clearing.testnet")).ok, false);

  // An empty log is consistent with an empty head.
  const empty = fakeChain({ "audit_head:{}": { seq: 0, head: ZERO32 } });
  assert.equal((await auditCheck(empty, "clearing.testnet")).ok, true);

  // A log longer than one page is paged through.
  const many = Array.from({ length: AUDIT_PAGE + 2 }, (_, index) => entry(index + 1));
  const paged = fakeChain({
    "audit_head:{}": { seq: many.length, head: headOf(many) },
    'get_audit:{"from":"1","limit":100}': many.slice(0, AUDIT_PAGE),
    'get_audit:{"from":"101","limit":100}': many.slice(AUDIT_PAGE),
  });
  const pagedCheck = await auditCheck(paged, "clearing.testnet");
  assert.equal(pagedCheck.ok, true, pagedCheck.detail);

  // A view that does not answer is a failed check, not a crash.
  const broken = fakeChain({ "audit_head:{}": new Error("rpc is down") });
  const refused = await auditCheck(broken, "clearing.testnet");
  assert.equal(refused.ok, false);
  assert.match(refused.detail, /could not be walked: rpc is down/);

  // And a client that rejects with something that is not an `Error` — a string from a transport,
  // say — still ends in a readable check rather than "[object Object]".
  const rude: ChainPort = { view: () => Promise.reject("the socket closed") };
  const rudely = await auditCheck(rude, "clearing.testnet");
  assert.equal(rudely.ok, false);
  assert.match(rudely.detail, /could not be walked: the socket closed/);
});

test("the checks a view cannot give are named, not implied", () => {
  const open = gapChecks(job(), settlement());
  assert.deepEqual(
    open.map((one) => one.name),
    ["room signature", "price rule"],
  );
  assert.ok(open.every((one) => one.unchecked === true && one.ok));
  const sealed = gapChecks(job({ privacy: "Sealed" }), settlement({ components_commitment: "ab" }));
  assert.equal(sealed[1]?.name, "sealed proof");
  assert.match(sealed[1]?.detail ?? "", /against the commitment ab/);
  const noCommitment = gapChecks(job({ privacy: "Sealed" }), settlement());
  assert.match(noCommitment[1]?.detail ?? "", /\(none recorded\)/);
});

test("a whole settlement replays from four views", async () => {
  const entries = [entry(1)];
  const chain = fakeChain({
    'get_job:{"job_id":"7"}': job(),
    'get_settlement:{"job_id":"7"}': settlement(),
    'get_listing:{"listing_id":"3"}': listing,
    "audit_head:{}": { seq: 1, head: headOf(entries) },
    'get_audit:{"from":"1","limit":100}': entries,
  });
  const report = await replayer(chain, "clearing.testnet")(7);
  assert.equal(report.job_id, 7);
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.ok)));
  assert.deepEqual(
    report.checks.map((one) => one.name),
    [
      "settlement",
      "outcome and state agree",
      "buckets emptied",
      "held and refund",
      "leakage debit",
      "seller compensation",
      "certificate anchor",
      "audit chain",
      "room signature",
      "price rule",
    ],
  );
});

test("a job that is not there, and one that has not settled, each say so", async () => {
  const missing = fakeChain({ 'get_job:{"job_id":"9"}': null, 'get_settlement:{"job_id":"9"}': null });
  const none = await replayer(missing, "clearing.testnet")(9);
  assert.equal(none.ok, false);
  assert.deepEqual(none.checks, [
    { name: "job", ok: false, detail: "there is no such job" },
  ]);

  const running = fakeChain({
    'get_job:{"job_id":"7"}': job({ state: "Computing" }),
    'get_settlement:{"job_id":"7"}': null,
  });
  const unsettled = await replayer(running, "clearing.testnet")(7);
  assert.equal(unsettled.ok, false);
  assert.match(unsettled.checks[0]?.detail ?? "", /is Computing and has not settled/);
});

test("one failed check fails the report", async () => {
  const entries = [entry(1)];
  const chain = fakeChain({
    'get_job:{"job_id":"7"}': job(),
    'get_settlement:{"job_id":"7"}': settlement({ cert_hashes: [] }),
    'get_listing:{"listing_id":"3"}': listing,
    "audit_head:{}": { seq: 1, head: headOf(entries) },
    'get_audit:{"from":"1","limit":100}': entries,
  });
  const report = await replayer(chain, "clearing.testnet")(7);
  assert.equal(report.ok, false);
  assert.equal(report.checks.find((one) => one.name === "certificate anchor")?.ok, false);
});

test("the package names itself", () => {
  assert.equal(PACKAGE, "@marginal/replay-ts");
});

test("the verifier's own view client speaks the RPC the contracts answer on", async () => {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const reply = (value: unknown) => ({
    json: () =>
      Promise.resolve({ result: { result: [...Buffer.from(JSON.stringify(value), "utf8")] } }),
  });
  const fetchImpl = ((url: string, init?: { body?: string }) => {
    seen.push({ url, body: JSON.parse(init?.body ?? "{}") as Record<string, unknown> });
    return Promise.resolve(reply({ seq: 1 }) as unknown as Response);
  }) as unknown as typeof globalThis.fetch;

  const chain = chainClient("http://127.0.0.1:3030", fetchImpl);
  assert.deepEqual(await chain.view("clearing.testnet", "audit_head"), { seq: 1 });
  const params = (seen[0]?.body.params ?? {}) as Record<string, string>;
  assert.equal(params.request_type, "call_function");
  assert.equal(params.finality, "final");
  assert.equal(params.method_name, "audit_head");
  assert.equal(params.args_base64, Buffer.from("{}").toString("base64"));

  // Every way the RPC can refuse becomes an Error with what it said.
  const failing = (value: unknown) =>
    chainClient("http://x", (() => Promise.resolve({ json: () => Promise.resolve(value) } as unknown as Response)) as unknown as typeof globalThis.fetch);
  await assert.rejects(() => failing({ error: { message: "no such account" } }).view("c", "m"), /no such account/);
  await assert.rejects(() => failing({ error: {} }).view("c", "m"), /refused/);
  await assert.rejects(() => failing({ result: { error: "E_X" } }).view("c", "m"), /E_X/);
  await assert.rejects(() => failing({ result: {} }).view("c", "m"), /no result/);
  // And an argument object is sent as given.
  const withArgs = chainClient("http://x", fetchImpl);
  await withArgs.view("c", "get_job", { job_id: "7" });
  const second = (seen[1]?.body.params ?? {}) as Record<string, string>;
  assert.equal(second.args_base64, Buffer.from('{"job_id":"7"}').toString("base64"));
});

test("with no fetch of its own the client uses the runtime's, over a real socket", async () => {
  // The default argument is the one a caller actually uses — the gateway passes nothing — so it is
  // exercised here against a real server rather than left to a stub.
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "replay",
          result: { result: [...Buffer.from(JSON.stringify({ seq: 2, head: "ab" }), "utf8")] },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    const chain = chainClient(`http://127.0.0.1:${port}`);
    assert.deepEqual(await chain.view("clearing.sandbox", "audit_head"), { seq: 2, head: "ab" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
