import test from "node:test";
import assert from "node:assert/strict";

import type { ChainPort } from "./chain";
import { buckets, jobActions, jobIds, loadJob, loadJobs, outcomeNote } from "./jobs";
import type { Job, Settlement } from "./records";

const job = (id: number, over: Partial<Job> = {}): Job => ({
  id,
  kind: "Appraisal",
  listing_id: 3,
  listing_version: 1,
  state: "Computing",
  token: "musdc.testnet",
  job_commitment: "ab".repeat(32),
  buyer: "buyer.testnet",
  privacy: "Open",
  mode: "Blind",
  snapshot_id: null,
  max_debit_mbits: 4_000,
  delivery_pk: "11".repeat(32),
  compliance_pk: null,
  context_auth_pk: "22".repeat(32),
  buckets: {
    budget: "500000000",
    compute: "1000000",
    comp_reserved: "25000000",
    fee_reserved: "0",
    storage: "0",
    held: "0",
    refund: "0",
  },
  assigned: ["33".repeat(32)],
  requested_height: 1_000,
  deadline_height: 1_600,
  delivery_deadline_height: null,
  ...over,
});

const settlement = (over: Partial<Settlement> = {}): Settlement => ({
  job_id: 1,
  outcome: "Deal",
  price: "400000000",
  refund: "75000000",
  held: "400000000",
  held_until: 1_794_000_600,
  fees: { treasury: "0" },
  leakage_debit_mbits: 4_000,
  leakage_comp: "25000000",
  components_commitment: null,
  delivery_commitment: "dd".repeat(32),
  delivery_receipt: null,
  cert_hashes: ["ce".repeat(32)],
  simulated_flags: 0,
  audit_seq: 12,
  payout: "Held",
  ...over,
});

function fakeChain(answers: Record<string, unknown>): ChainPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    view<T>(_contract: string, method: string, args?: unknown): Promise<T> {
      const key = `${method}:${JSON.stringify(args ?? {})}`;
      asked.push(key);
      return Promise.resolve(answers[key] as T);
    },
  };
}

test("jobs are listed newest first, from config", () => {
  assert.deepEqual(jobIds(4), [3, 2, 1]);
  assert.deepEqual(jobIds(1), []);
  assert.deepEqual(jobIds(10, 2), [9, 8]);
});

test("a job is read with its settlement, and a job that has none still reads", async () => {
  const chain = fakeChain({
    'get_job:{"job_id":"7"}': job(7),
    'get_settlement:{"job_id":"7"}': null,
  });
  const row = await loadJob(chain, "clearing.testnet", 7);
  assert.equal(row?.job.id, 7);
  assert.equal(row?.settlement, null);

  const missing = fakeChain({ 'get_job:{"job_id":"8"}': null });
  assert.equal(await loadJob(missing, "clearing.testnet", 8), null);
  assert.equal(missing.asked.length, 1, "a job that is not there is not asked about twice");
});

test("the list skips a gap", async () => {
  const chain = fakeChain({
    "config:{}": { next_job_id: 3 },
    'get_job:{"job_id":"2"}': job(2),
    'get_settlement:{"job_id":"2"}': settlement(),
    'get_job:{"job_id":"1"}': null,
  });
  const rows = await loadJobs(chain, "clearing.testnet");
  assert.deepEqual(
    rows.map((row) => row.job.id),
    [2],
  );
  assert.equal(rows[0]?.settlement?.outcome, "Deal");
});

test("what can be done to a job depends on its state and the height", () => {
  // Running, before the deadline: nothing to do but wait.
  assert.deepEqual(jobActions(job(1), 1_500), { approve: false, refund: false, live: true });
  // Past the deadline: anyone may refund the buyer (D11).
  assert.deepEqual(jobActions(job(1), 1_700), { approve: false, refund: true, live: true });
  // Parked by an agent cap: the buyer's own key approves it (D5).
  assert.deepEqual(jobActions(job(1, { state: "PendingApproval" }), 1_500), {
    approve: true,
    refund: false,
    live: true,
  });
  // A parked job past its deadline is not refundable by `refund_expired`'s rule set here.
  assert.equal(jobActions(job(1, { state: "PendingApproval" }), 1_700).refund, false);
  // Terminal: no actions, and the page stops polling.
  for (const state of ["Deal", "NoDeal", "Restricted", "InputRejected", "Timeout", "Final"]) {
    assert.deepEqual(
      jobActions(job(1, { state }), 9_999),
      { approve: false, refund: false, live: false },
      state,
    );
  }
  // Every state the room can be in before a verdict is refundable once late.
  for (const state of ["Requested", "Assigned", "Computing"]) {
    assert.equal(jobActions(job(1, { state }), 1_700).refund, true, state);
  }
});

test("every outcome reads as a sentence about the money", () => {
  assert.equal(outcomeNote(null), "No settlement yet.");
  assert.match(outcomeNote(settlement()), /reached the ask/);
  assert.match(outcomeNote(settlement({ outcome: "NoDeal" })), /budget came back/);
  assert.match(outcomeNote(settlement({ outcome: "Restricted" })), /one bit/);
  assert.match(outcomeNote(settlement({ outcome: "InputRejected" })), /nothing was debited/);
  assert.match(outcomeNote(settlement({ outcome: "Timeout" })), /refund the buyer in full/);
  assert.match(outcomeNote(settlement({ outcome: "Fault" })), /Outcome Fault/);
});

test("the buckets are shown in the order the deposit was split", () => {
  assert.deepEqual(
    buckets(job(1)).map((b) => b.label),
    ["budget", "compute", "leakage reserve", "fee reserve", "storage", "held", "refund"],
  );
  assert.equal(buckets(job(1))[0]?.amount, "500000000");
});
