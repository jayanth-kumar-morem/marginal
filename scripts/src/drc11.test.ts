import { test } from "node:test";
import assert from "node:assert/strict";
import { conserves, drc11Options, onlyRefund, released, runDrc11 } from "./drc11.js";
import { parseArgs, type BucketsView, type JobView, type LeakageView } from "./demo.js";
import { fakeChain, type FakeCall } from "./testing.js";
import { ENV, LISTING } from "./demo.test.js";

const FUNDED: BucketsView = {
  budget: "400000000",
  compute: "1000000",
  comp_reserved: "6250",
  fee_reserved: "2000000",
  storage: "0",
  held: "0",
  refund: "0",
};

/** What the buckets become once `refund_expired` has moved everything into `refund`. */
const REFUNDED: BucketsView = { ...FUNDED, budget: "0", compute: "0", comp_reserved: "0", fee_reserved: "0", refund: "403006250" };

const LEAK: LeakageView = { budget_mbits: 32000, reserved_mbits: 1000, spent_mbits: 0, remaining_mbits: 31000, price_per_bit: "6250000" };

const JOB: JobView = {
  id: 7,
  listing_id: 1,
  state: "Assigned",
  buyer: "killbuyer-t.sandbox",
  token: ENV.token,
  max_debit_mbits: 1000,
  buckets: FUNDED,
  assigned: ["aa".repeat(32)],
  requested_height: 500,
  deadline_height: 700,
  delivery_deadline_height: null,
};

interface WorldOptions {
  readonly job?: Partial<JobView>;
  /** The state the job is in once the chain is past the deadline. */
  readonly after?: Partial<JobView>;
  /** A state the room reached before the deadline, which makes the refund moot. */
  readonly answersAt?: number;
  /** The height the chain starts at. The default is already past the deadline. */
  readonly from?: number;
  readonly refuse?: string;
  readonly balanceAfter?: string;
  readonly leakageAfter?: LeakageView;
  /** Jobs the room still has open after the refund. */
  readonly queue?: readonly { id: number }[];
  readonly status?: string;
  readonly answer?: Record<string, unknown>;
}

function world(o: WorldOptions = {}) {
  // Past the deadline from the start, so no test waits a second for a block it does not need; the
  // one that watches the room answer starts before it.
  let height = o.from ?? (o.answersAt === undefined ? 700 : 690);
  let refunded = false;
  // The buyer's escrow, which a deposit fills, a job takes its buckets out of, and a refund fills
  // again: the only thing DRC-11 measures is the difference the refund makes to it.
  let escrow = 0n;
  const job = { ...JOB, ...o.job };
  const chain = fakeChain({
    height: () => (height += 5),
    view: (_c, method, args) => {
      if (method === "get_listing") return { ...LISTING, status: o.status ?? "Active" };
      if (method === "get_leakage") return refunded ? (o.leakageAfter ?? { ...LEAK, reserved_mbits: 0, remaining_mbits: 32000 }) : LEAK;
      if (method === "get_balance") {
        if (String(args["account"]) !== job.buyer) return "0";
        return refunded && o.balanceAfter !== undefined ? o.balanceAfter : escrow.toString();
      }
      if (method === "get_jobs_for_room") return o.queue ?? [];
      if (method === "get_job") {
        if (refunded) return { ...job, state: "Timeout", buckets: REFUNDED, ...o.after };
        if (o.answersAt !== undefined && height >= o.answersAt) return { ...job, state: "Deal" };
        return job;
      }
      return null;
    },
    call: (c: FakeCall) => {
      if (c.method === "ft_transfer_call") escrow += BigInt(String(c.args["amount"]));
      if (c.method === "request_appraisal") {
        if (o.answer !== undefined) return o.answer;
        escrow -= BigInt(REFUNDED.refund);
        return { status: "Created", job_id: "7" };
      }
      if (c.method === "refund_expired") {
        if (o.refuse !== undefined) throw new Error(`Contract panicked: ${o.refuse}`);
        refunded = true;
        escrow += BigInt(REFUNDED.refund);
        return { status: "Timeout", refund: REFUNDED.refund };
      }
      return null;
    },
  });
  return chain;
}

const args = (...argv: string[]) => parseArgs(["drc11", ...argv]);

test("drc11 needs a job to end, whether it opens one or is given one", () => {
  assert.throws(() => drc11Options(args()), /needs --listing <id> to open a job, or --job <id>/);
  assert.deepEqual(drc11Options(args("--job", "7", "--wait", "false", "--privacy", "open", "--tag", "zz")), {
    listingId: 0,
    jobId: 7,
    budget: null,
    privacy: "Open",
    wait: false,
    tag: "zz",
  });
  const fresh = drc11Options(args("--listing", "1", "--budget", "500"));
  assert.equal(fresh.privacy, "Sealed");
  assert.equal(fresh.wait, true);
  assert.equal(fresh.budget, "500");
});

test("conservation and the shape of a timed-out job are core's arithmetic, not this script's", () => {
  // 400.000000 + 1.000000 + 0.006250 + 2.000000 is what was funded, and what came back.
  assert.equal(conserves(403006250n, FUNDED, 0n), true);
  assert.equal(conserves(403006250n, REFUNDED, 0n), true);
  assert.equal(conserves(403006249n, FUNDED, 0n), false);
  // A balance that went *down* is not an amount at all, and core refuses it rather than wrapping.
  assert.equal(conserves(-1n, FUNDED, 0n), false);
  // The core refusing is the answer "no"; anything else is a bug in this script and is re-thrown.
  assert.equal(conserves(1n, { ...FUNDED, budget: "oops" }, 0n), false);
  assert.throws(
    () => conserves(1n, FUNDED, 0n, () => { throw new TypeError("the wasm is not loaded"); }),
    /the wasm is not loaded/,
  );

  assert.equal(onlyRefund(REFUNDED), true);
  assert.equal(onlyRefund(FUNDED), false);
  assert.equal(onlyRefund({ ...REFUNDED, held: "1" }), false);

  assert.equal(released(LEAK, { ...LEAK, reserved_mbits: 0, remaining_mbits: 32000 }, 1000), true);
  assert.equal(released(LEAK, LEAK, 1000), false);
  assert.equal(released(LEAK, { ...LEAK, reserved_mbits: 0, spent_mbits: 1000, remaining_mbits: 31000 }, 1000), false);
  assert.equal(released(LEAK, { ...LEAK, reserved_mbits: 0, remaining_mbits: 31500 }, 1000), false);
});

test("the refund holds: a stranger ends the job and the buyer is whole to the unit", async () => {
  const w = world();
  assert.equal(await runDrc11(w.chain, ENV, args("--listing", "1", "--tag", "t"), w.log), true);
  const out = w.lines.join("\n");
  assert.ok(out.includes("KILL THE ROOM NOW"));
  assert.ok(out.includes("deadline    block 700"));
  assert.ok(out.includes("anyone-t.sandbox calls refund_expired(7)"));
  assert.ok(out.includes("job 7 is now Timeout"));
  assert.ok(out.includes("the buyer got back what was funded"));
  assert.ok(out.includes("HELD: the timeout refund held"));
  // The call came from an account this run created, which holds no tokens and is not the buyer.
  const refund = w.calls.find((c) => c.method === "refund_expired");
  assert.equal(refund?.as, "anyone-t.sandbox");
  assert.ok(w.created.includes("anyone-t.sandbox"));
  assert.equal(w.calls.filter((c) => c.as === "anyone-t.sandbox").length, 1);
});

test("a budget the operator names is what the fresh job offers", async () => {
  const w = world();
  assert.equal(await runDrc11(w.chain, ENV, args("--listing", "1", "--budget", "500000000", "--tag", "t"), w.log), true);
  assert.ok(w.lines.join("\n").includes("offering 500.000000 musdc.sandbox for a Sealed verdict"));
  // Three times the budget is minted, so the compute fee no view publishes cannot refuse the job.
  assert.equal(w.calls.find((c) => c.method === "mint")?.args["amount"], "1500000000");
});

test("a job with no room assigned is still refundable", async () => {
  const w = world({ job: { assigned: [] } });
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7"), w.log), true);
  assert.ok(w.lines.join("\n").includes("assigned    no room"));
});

test("the run waits for the deadline while the job is still unanswered", async () => {
  const w = world({ from: 688 });
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7"), w.log), true);
  const out = w.lines.join("\n");
  assert.ok(out.includes("waiting for block 701"));
  assert.ok(out.includes("HELD: the timeout refund held"));
});

test("a job already in flight is refunded without opening another", async () => {
  const w = world();
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7", "--tag", "t"), w.log), true);
  assert.ok(w.lines.join("\n").includes("job 7 was already in flight"));
  assert.ok(!w.calls.some((c) => c.method === "request_appraisal"));
});

test("--wait false prints what to kill and stops, claiming nothing", async () => {
  const w = world();
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7", "--wait", "false"), w.log), false);
  const out = w.lines.join("\n");
  assert.ok(out.includes("--wait false: stopping here. Rerun with --job 7"));
  assert.ok(out.includes("DID NOT HOLD: nothing was refunded"));
  assert.ok(!w.calls.some((c) => c.method === "refund_expired"));
});

test("a room that answers before the deadline leaves nothing to refund", async () => {
  const w = world({ answersAt: 700 });
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7"), w.log), false);
  const out = w.lines.join("\n");
  assert.ok(out.includes("the room answered at block"));
  assert.ok(out.includes("DID NOT HOLD: the room answered before the deadline (the job is Deal)"));
});

test("a refund the contract refuses is reported in the contract's own code", async () => {
  const w = world({ refuse: "E_JOB_STATE_INVALID" });
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7"), w.log), false);
  assert.ok(w.lines.join("\n").includes("DID NOT HOLD: refund_expired was refused with E_JOB_STATE_INVALID"));
});

test("every check is weighed, and one that fails fails the run", async () => {
  const w = world({
    after: { state: "DeliveryFailure", buckets: { ...REFUNDED, held: "1" } },
    balanceAfter: "1",
    leakageAfter: LEAK,
    queue: [{ id: 7 }],
  });
  assert.equal(await runDrc11(w.chain, ENV, args("--job", "7"), w.log), false);
  const out = w.lines.join("\n");
  assert.ok(out.includes(" FAIL  the buyer got back what was funded"));
  assert.ok(out.includes(" FAIL  nothing is left in any other bucket"));
  assert.ok(out.includes(" FAIL  the job ends in Timeout"));
  assert.ok(out.includes(" FAIL  the leakage reservation is released"));
  assert.ok(out.includes(" FAIL  the room's queue no longer holds the job"));
  assert.ok(out.includes("DID NOT HOLD: 6 of 7 checks did not hold"));
});

test("what the run refuses to start on", async () => {
  const noBuyer = world({ job: { buyer: null } });
  await assert.rejects(runDrc11(noBuyer.chain, ENV, args("--job", "7"), noBuyer.log), /job 7 has no buyer/);
  const settled = world({ job: { state: "Final" } });
  await assert.rejects(
    runDrc11(settled.chain, ENV, args("--job", "7"), settled.log),
    /job 7 is Final; a refund before a verdict needs one of PendingApproval, Requested, Assigned, Computing/,
  );
  const draft = world({ status: "Draft" });
  await assert.rejects(runDrc11(draft.chain, ENV, args("--listing", "1", "--tag", "t"), draft.log), /listing 1 is Draft, not Active/);
  const blocked = world({ answer: { status: "Blocked", cap: "window_max" } });
  await assert.rejects(
    runDrc11(blocked.chain, ENV, args("--listing", "1", "--tag", "t"), blocked.log),
    /request_appraisal answered \{"status":"Blocked","cap":"window_max"\}; expected a plain Created job/,
  );
});
