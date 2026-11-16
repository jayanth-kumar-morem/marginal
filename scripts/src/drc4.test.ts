import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_IDENTITIES, drc4Options, runDrc4 } from "./drc4.js";
import { parseArgs, type LeakageView } from "./demo.js";
import { fakeChain, type FakeCall } from "./testing.js";
import { ENV, LISTING } from "./demo.test.js";

/** The debit `knowledge@1`'s schema produces for an Open, Blind job with no judges (E13.4). */
const DEBIT = 16706;

interface WorldOptions {
  /** The listing's leakage budget in millibits. */
  readonly budget?: number;
  /** What each job reports as its reservation, by probe number (1-based). */
  readonly debit?: (n: number) => number;
  /** What the listing's remaining budget falls by, by probe number. */
  readonly falls?: (n: number) => number;
  /** A refusal to raise instead of opening the nth job. */
  readonly refuse?: (n: number) => string | undefined;
  readonly status?: string;
  /** An answer other than `Created`, to show a script that refuses to guess. */
  readonly answer?: Record<string, unknown>;
}

/** A chain that keeps one listing's leakage ledger, which is the only state DRC-4 depends on. */
function world(o: WorldOptions) {
  const debit = o.debit ?? (() => DEBIT);
  const falls = o.falls ?? debit;
  const budget = o.budget ?? 32000;
  let leakage: LeakageView = { budget_mbits: budget, reserved_mbits: 0, spent_mbits: 0, remaining_mbits: budget, price_per_bit: "6250000" };
  const jobs = new Map<number, unknown>();
  let probes = 0;
  const balances = new Map<string, string>();
  const chain = fakeChain({
    view: (_c, method, args) => {
      if (method === "get_listing") return { ...LISTING, status: o.status ?? "Active", leakage };
      if (method === "get_leakage") return leakage;
      if (method === "get_balance") return balances.get(String(args["account"])) ?? "0";
      if (method === "get_job") return jobs.get(Number(args["job_id"]));
      return null;
    },
    call: (c: FakeCall) => {
      if (c.method === "mint") balances.set(String(c.args["account_id"]), String(c.args["amount"]));
      if (c.method !== "request_appraisal") return null;
      probes += 1;
      const refusal = o.refuse?.(probes);
      if (refusal !== undefined) throw new Error(`Contract panicked: ${refusal}`);
      if (leakage.remaining_mbits < debit(probes)) throw new Error("Contract panicked: E_BUDGET_EXHAUSTED");
      if (o.answer !== undefined) return o.answer;
      const id = probes;
      jobs.set(id, {
        id,
        listing_id: 1,
        state: "Assigned",
        buyer: c.as,
        token: ENV.token,
        max_debit_mbits: debit(probes),
        buckets: { budget: "400000000", compute: "1000000", comp_reserved: "104413", fee_reserved: "2000000", storage: "0", held: "0", refund: "0" },
        assigned: ["aa".repeat(32)],
        requested_height: 500,
        deadline_height: 700,
        delivery_deadline_height: null,
      });
      leakage = {
        ...leakage,
        reserved_mbits: leakage.reserved_mbits + falls(probes),
        remaining_mbits: leakage.remaining_mbits - falls(probes),
      };
      return { status: "Created", job_id: String(id) };
    },
  });
  return chain;
}

const args = (...argv: string[]) => parseArgs(["drc4", ...argv]);

test("drc4 needs a listing, and more than one identity to show a wall with", () => {
  assert.throws(() => drc4Options(args()), /drc4 needs --listing <id>/);
  assert.throws(() => drc4Options(args("--listing", "1", "--identities", "1")), /at least 2/);
  assert.throws(() => drc4Options(args("--listing", "1", "--identities", "99")), new RegExp(`capped at ${MAX_IDENTITIES}`));
  assert.deepEqual(drc4Options(args("--listing", "1", "--budget", "500", "--tag", "zz", "--privacy", "sealed")), {
    listingId: 1,
    identities: MAX_IDENTITIES,
    budget: "500",
    privacy: "Sealed",
    tag: "zz",
  });
  const defaults = drc4Options(args("--listing", "2"));
  assert.equal(defaults.budget, null);
  assert.equal(defaults.privacy, "Open");
  assert.match(defaults.tag, /^[0-9a-z]{6}$/);
});

test("the wall holds: identities drain the budget and the next one is refused", async () => {
  const w = world({});
  assert.equal(await runDrc4(w.chain, ENV, args("--listing", "1", "--tag", "t1"), w.log), true);
  const out = w.lines.join("\n");
  // One probe fits a 32,000 mbit budget at 16,706 a job, and the second meets the ledger.
  assert.ok(out.includes("job 1 is Assigned: it reserved 16706 mbits (16.706 bits)"));
  assert.ok(out.includes("this budget has room for 0 more"));
  assert.ok(out.includes("request_appraisal refused: E_BUDGET_EXHAUSTED"));
  assert.ok(out.includes("the seller is owed 0.104413 musdc.sandbox"));
  assert.ok(out.includes("every job's debit the same:   true"));
  assert.ok(out.includes("budget fell by exactly that:  true"));
  assert.ok(out.includes("HELD: the leakage wall held: 1 identities drained the budget to 15294 mbits"));
  // Each identity is its own account, and each one deposited three times its budget.
  assert.deepEqual(w.created, ["sybil-1-t1.sandbox", "sybil-2-t1.sandbox"]);
  assert.equal((w.calls.find((c) => c.method === "mint")?.args["amount"]), "1200000000");
});

test("a budget that outlasts the identities is not a wall", async () => {
  const w = world({ budget: 10_000_000 });
  assert.equal(await runDrc4(w.chain, ENV, args("--listing", "1", "--identities", "2", "--budget", "500"), w.log), false);
  const out = w.lines.join("\n");
  assert.ok(out.includes("the next request:             was never made — the run ran out of identities first"));
  assert.ok(out.includes("DID NOT HOLD: the budget outlasted 2 identities"));
});

test("a refusal that is not the leakage ledger is reported as itself", async () => {
  const w = world({ refuse: (n) => (n === 2 ? "E_BALANCE_LOW" : undefined) });
  assert.equal(await runDrc4(w.chain, ENV, args("--listing", "1"), w.log), false);
  assert.ok(w.lines.join("\n").includes("DID NOT HOLD: the wall was not the leakage ledger: the next request was refused with E_BALANCE_LOW"));
});

test("a first identity that never probes anything proves nothing", async () => {
  const w = world({ refuse: () => "E_LISTING_NOT_ACTIVE" });
  assert.equal(await runDrc4(w.chain, ENV, args("--listing", "1"), w.log), false);
  assert.ok(w.lines.join("\n").includes("the first identity was refused with E_LISTING_NOT_ACTIVE before it probed anything"));
});

test("jobs that do not all debit the same, or a budget that does not fall by it, fail the run", async () => {
  const uneven = world({ budget: 60000, debit: (n) => (n === 2 ? 1000 : DEBIT) });
  assert.equal(await runDrc4(uneven.chain, ENV, args("--listing", "1", "--identities", "3"), uneven.log), false);
  assert.ok(uneven.lines.join("\n").includes("every job's debit the same:   false"));

  const slipping = world({ budget: 60000, falls: () => 1 });
  assert.equal(await runDrc4(slipping.chain, ENV, args("--listing", "1", "--identities", "3"), slipping.log), false);
  assert.ok(slipping.lines.join("\n").includes("budget fell by exactly that:  false"));
  assert.ok(slipping.lines.join("\n").includes("DID NOT HOLD: the debits or the budget did not add up"));
});

test("a refusal while the budget still had room for another probe fails the run", async () => {
  // The ledger still has room for two more probes and the contract refuses anyway: not the wall.
  const w = world({ budget: 60000, refuse: (n) => (n === 2 ? "E_BUDGET_EXHAUSTED" : undefined) });
  assert.equal(await runDrc4(w.chain, ENV, args("--listing", "1", "--identities", "2"), w.log), false);
  assert.ok(w.lines.join("\n").includes("DID NOT HOLD: the budget still had 43294 mbits, enough for another 16706-mbit probe"));
});

test("a listing that cannot be appraised, and an answer that is not a plain job, stop the run", async () => {
  const draft = world({ status: "Draft" });
  await assert.rejects(runDrc4(draft.chain, ENV, args("--listing", "1"), draft.log), /listing 1 is Draft, not Active/);
  const parked = world({ answer: { status: "Parked", job_id: "4" } });
  await assert.rejects(
    runDrc4(parked.chain, ENV, args("--listing", "1"), parked.log),
    /request_appraisal answered \{"status":"Parked","job_id":"4"\}; this listing is not a plain appraisal/,
  );
});
