import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_METHOD_LIST, capsFor, drc5Options, injection, runDrc5 } from "./drc5.js";
import { parseArgs, type JobView, type LeakageView } from "./demo.js";
import { repoRoot } from "./paths.js";
import { fakeChain, type FakeCall } from "./testing.js";
import { ENV, LISTING } from "./demo.test.js";

const ASK = "400000000";
const LEAK: LeakageView = { budget_mbits: 32000, reserved_mbits: 0, spent_mbits: 0, remaining_mbits: 32000, price_per_bit: "6250000" };

const JOB: JobView = {
  id: 9,
  listing_id: 1,
  state: "PendingApproval",
  buyer: "agent-owner-t.sandbox",
  token: ENV.token,
  max_debit_mbits: 1000,
  buckets: { budget: ASK, compute: "1000000", comp_reserved: "6250", fee_reserved: "2000000", storage: "0", held: "0", refund: "0" },
  assigned: [],
  requested_height: 500,
  deadline_height: 700,
  delivery_deadline_height: null,
};

interface WorldOptions {
  readonly status?: string;
  readonly coolingBlocks?: number;
  /** Override what `request_appraisal` answers, by call number (1-based). */
  readonly answer?: (n: number, budget: string) => unknown;
  /** Override what a call other than `request_appraisal` does. */
  readonly refuse?: (call: FakeCall) => string | undefined;
  readonly approvedState?: string;
  readonly jobState?: string;
  readonly assigned?: readonly string[];
  /** A chain that lets the agent key through, which is what DRC-5 exists to rule out. */
  readonly permissive?: boolean;
}

/**
 * A chain that applies the caps the way `agent.rs` does: per-job first, then the window, then the
 * human threshold. The caps come off the call that registered them, so the fake cannot disagree
 * with the script about what was asked for.
 */
function world(o: WorldOptions = {}) {
  let caps: { per_job_budget_max: string; window_max: string; human_above: string } | null = null;
  let spent = 0n;
  let requests = 0;
  let job: JobView | null = null;
  const balances = new Map<string, string>();
  let height = 500;
  const chain = fakeChain({
    // The chain moves, or a cooling wait would never end.
    height: () => (height += 1),
    view: (_c, method, args) => {
      if (method === "get_listing") return { ...LISTING, status: o.status ?? "Active", leakage: LEAK };
      if (method === "get_leakage") return LEAK;
      if (method === "get_balance") return balances.get(String(args["account"])) ?? "0";
      if (method === "config") {
        return { profile: { cooling_blocks: o.coolingBlocks ?? 0 }, fees: { clearing_fee_buyer_bps: 50 }, next_job_id: 9, fee_schedule: { snapshot: "10000000000000000000000" } };
      }
      if (method === "audit_head") return { seq: 40, head: "ab".repeat(32) };
      if (method === "get_audit") {
        return [
          { seq: 41, height: 510, kind: "AgentBlocked", subject_id: 1, payload_hash: "00".repeat(32) },
          { seq: 42, height: 511, kind: "JobParked", subject_id: 9, payload_hash: "11".repeat(32) },
        ];
      }
      if (method === "get_agent_caps") return caps;
      if (method === "get_agent_spend") return spent.toString();
      if (method === "get_job") return job;
      return null;
    },
    call: (c: FakeCall) => {
      const refusal = o.refuse?.(c);
      if (refusal !== undefined) throw new Error(`Contract panicked: ${refusal}`);
      if (c.method === "mint") balances.set(String(c.args["account_id"]), String(c.args["amount"]));
      if (c.method === "anchor_snapshot") return "3";
      if (c.method === "register_agent_key") {
        if (c.as.endsWith("#agent") && o.permissive !== true) throw new Error("Contract panicked: E_AGENT_CAP");
        if (c.as.endsWith("#agent")) return null;
        caps = c.args["caps"] as typeof caps;
        return null;
      }
      if (c.method === "approve_parked") {
        if (c.as.endsWith("#agent") && o.permissive !== true) throw new Error("Contract panicked: E_AGENT_CAP");
        job = { ...(job as JobView), state: o.approvedState ?? "Assigned", assigned: o.assigned ?? ["aa".repeat(32)] };
        return "9";
      }
      if (c.method !== "request_appraisal") return null;
      requests += 1;
      // The fake knows the budget only through the caps it was registered with, so the script's
      // own arithmetic is what decides which cap each arm meets.
      const perJob = BigInt((caps as { per_job_budget_max: string }).per_job_budget_max);
      const budgets = [((perJob / 2n) * 3n).toString(), (perJob / 2n).toString(), perJob.toString()];
      const budget = budgets[requests - 1] ?? ASK;
      const override = o.answer?.(requests, budget);
      if (override !== undefined) return override;
      const limits = caps as { per_job_budget_max: string; window_max: string; human_above: string };
      if (BigInt(budget) > BigInt(limits.per_job_budget_max)) return { status: "Blocked", cap: "per_job_budget_max" };
      if (spent + BigInt(budget) > BigInt(limits.window_max)) return { status: "Blocked", cap: "window_max" };
      spent += BigInt(budget);
      job = { ...JOB, state: o.jobState ?? "PendingApproval" };
      return { status: "Parked", job_id: "9" };
    },
  });
  return chain;
}

const args = (...argv: string[]) => parseArgs(["drc5", ...argv]);

test("drc5 needs a listing, and defaults to the cheapest verdict it can park", () => {
  assert.throws(() => drc5Options(args()), /drc5 needs --listing <id>/);
  const defaults = drc5Options(args("--listing", "1"));
  assert.equal(defaults.privacy, "Sealed");
  assert.equal(defaults.snapshot, true);
  assert.equal(defaults.budget, null);
  assert.match(defaults.tag, /^[0-9a-z]{6}$/);
  assert.deepEqual(drc5Options(args("--listing", "2", "--budget", "7", "--privacy", "open", "--snapshot", "false", "--tag", "zz")), {
    listingId: 2,
    budget: "7",
    privacy: "Open",
    snapshot: false,
    tag: "zz",
  });
});

test("the payload is the demo corpus's own injected appendix", () => {
  const found = injection(repoRoot);
  assert.match(found.file, /fixtures\/demo\/memo-injected\.md$/);
  assert.match(found.sha256, /^[0-9a-f]{64}$/);
  assert.ok(found.text.startsWith("## Appendix A — analyst instructions"));
  assert.ok(found.text.includes("award it full marks"));
  // A corpus that no longer carries the injection is a demo that proves nothing: say so loudly.
  assert.throws(() => injection("/nonexistent"), /ENOENT/);
  const root = mkdtempSync(join(tmpdir(), "marginal-demo-"));
  mkdirSync(join(root, "fixtures", "demo"), { recursive: true });
  writeFileSync(join(root, "fixtures", "demo", "memo-injected.md"), "# a memo with nothing appended\n");
  assert.throws(() => injection(root), /no longer carries "## Appendix A": the demo corpus changed under this script/);
  rmSync(root, { recursive: true, force: true });
});

test("the caps are derived from the ask, and a dust budget cannot carry them", () => {
  assert.deepEqual(capsFor(ASK), {
    per_job_budget_max: "800000000",
    window_max: "800000000",
    window_secs: 3600,
    max_jobs_per_window: 5,
    human_above: "399999999",
  });
  assert.throws(() => capsFor("1"), /a budget of 1 base units is too small/);
  assert.deepEqual(AGENT_METHOD_LIST, ["request_appraisal", "approve_parked", "register_agent_key"]);
});

test("the firewall holds: blocked, parked, and nothing the agent can do about it", async () => {
  const w = world();
  assert.equal(await runDrc5(w.chain, ENV, args("--listing", "1", "--tag", "t"), w.log, repoRoot), true);
  const out = w.lines.join("\n");
  assert.ok(out.includes("award it full marks"));
  assert.ok(out.includes("snapshot 3 anchored at height 501"));
  assert.ok(out.includes('answered {"status":"Blocked","cap":"per_job_budget_max"}'));
  assert.ok(out.includes("next_job_id is still 9, and the escrow balance is still 2400.000000"));
  assert.ok(out.includes("  ok   and nothing was spent"));
  assert.ok(out.includes('answered {"status":"Parked","job_id":"9"}'));
  assert.ok(out.includes("job 9 is PendingApproval, reserving 1000 mbits (1.000 bits)"));
  assert.ok(out.includes('answered {"status":"Blocked","cap":"window_max"}'));
  assert.ok(out.includes("answered E_AGENT_CAP"));
  assert.ok(out.includes("job 9 is now Assigned, assigned to aa"));
  assert.ok(out.includes("#41 at block 510: AgentBlocked on 1"));
  assert.ok(out.includes("HELD: the firewall held"));

  // The snapshot's fee was attached, and the agent's own calls were signed with the agent key.
  const anchor = w.calls.find((c) => c.method === "anchor_snapshot");
  assert.equal(anchor?.deposit, 10000000000000000000000n);
  assert.equal(anchor?.as, "agent-owner-t.sandbox");
  assert.equal(anchor?.args["kind"], "Notes");
  assert.deepEqual(
    w.calls.filter((c) => c.method === "request_appraisal").map((c) => c.as),
    ["agent-owner-t.sandbox#agent", "agent-owner-t.sandbox#agent", "agent-owner-t.sandbox#agent"],
  );
  // The human's approval is signed by the account itself, not by its agent key.
  assert.deepEqual(
    w.calls.filter((c) => c.method === "approve_parked").map((c) => c.as),
    ["agent-owner-t.sandbox#agent", "agent-owner-t.sandbox"],
  );
  // Six budgets are deposited, because the over-cap arm alone offers three.
  assert.equal(w.calls.find((c) => c.method === "mint")?.args["amount"], "2400000000");
});

test("--snapshot false shows the injection without binding it, and waits for no cooling", async () => {
  const w = world();
  assert.equal(await runDrc5(w.chain, ENV, args("--listing", "1", "--snapshot", "false", "--tag", "t"), w.log, repoRoot), true);
  assert.ok(w.lines.join("\n").includes("--snapshot false: the injection is shown but not anchored"));
  assert.ok(!w.calls.some((c) => c.method === "anchor_snapshot"));
});

test("a cooling period is waited out before the context may be used", async () => {
  const w = world({ coolingBlocks: 2 });
  assert.equal(await runDrc5(w.chain, ENV, args("--listing", "1", "--tag", "t"), w.log, repoRoot), true);
  assert.ok(w.lines.join("\n").includes("waiting 2 cooling blocks before it may be used (AC-6)"));
});

test("a job that is not parked ends the run where it is, with the audit chain shown", async () => {
  const w = world({ answer: (n) => (n === 2 ? { status: "Created", job_id: "0" } : undefined) });
  assert.equal(await runDrc5(w.chain, ENV, args("--listing", "1", "--tag", "t"), w.log, repoRoot), false);
  const out = w.lines.join("\n");
  assert.ok(out.includes("no job to approve, so the rest of the run cannot be shown"));
  assert.ok(out.includes(" FAIL  parked for a human"));
  assert.ok(out.includes("DID NOT HOLD: 2 of 5 checks did not hold: parked for a human; a parked job to approve"));
});

test("a budget the operator names is what the caps are derived from", async () => {
  const w = world();
  assert.equal(await runDrc5(w.chain, ENV, args("--listing", "1", "--budget", "1000000", "--tag", "t"), w.log, repoRoot), true);
  const out = w.lines.join("\n");
  assert.ok(out.includes("per_job_budget_max   2000000"));
  assert.ok(out.includes("human_above          999999"));
  assert.ok(out.includes("the agent asks for 3.000000 — over per_job_budget_max (2.000000)"));
});

test("a request the contract refuses outright, and one it answers without a job", async () => {
  const refused = world({
    answer: (n) => {
      if (n === 2) throw new Error("Contract panicked: E_BALANCE_LOW");
      return undefined;
    },
  });
  assert.equal(await runDrc5(refused.chain, ENV, args("--listing", "1", "--tag", "t"), refused.log, repoRoot), false);
  assert.ok(refused.lines.join("\n").includes(" FAIL  parked for a human                   E_BALANCE_LOW"));

  const jobless = world({ answer: (n) => (n === 2 ? { status: "Parked" } : undefined) });
  assert.equal(await runDrc5(jobless.chain, ENV, args("--listing", "1", "--tag", "t"), jobless.log, repoRoot), false);
  const out = jobless.lines.join("\n");
  assert.ok(out.includes("  ok   parked for a human"));
  assert.ok(out.includes("no job to approve"));
  assert.ok(out.includes('FAIL  a parked job to approve              {"status":"Parked"}   (wanted a job id)'));
});

test("an arm the contract answers differently is named in the verdict", async () => {
  // A chain that lets the agent approve its own job is exactly what DRC-5 exists to rule out.
  const w = world({ permissive: true, approvedState: "Computing", jobState: "Requested", assigned: [] });
  assert.equal(await runDrc5(w.chain, ENV, args("--listing", "1", "--tag", "t"), w.log, repoRoot), false);
  const out = w.lines.join("\n");
  assert.ok(out.includes(" FAIL  the job is PendingApproval"));
  assert.ok(out.includes(" FAIL  the agent cannot approve its own job"));
  assert.ok(out.includes("assigned to no room"));
  assert.ok(out.includes("DID NOT HOLD:"));
});

test("a listing that cannot be appraised stops the run", async () => {
  const w = world({ status: "Exhausted" });
  await assert.rejects(
    runDrc5(w.chain, ENV, args("--listing", "1", "--tag", "t"), w.log, repoRoot),
    /listing 1 is Exhausted, not Active/,
  );
});
