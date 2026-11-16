import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentOf,
  amount,
  amountFlag,
  askOf,
  attempt,
  auditHead,
  auditSince,
  balanceOf,
  bits,
  boolFlag,
  buildRequest,
  configOf,
  delay,
  envOf,
  header,
  jobOf,
  leakageOf,
  listingOf,
  makeIdentity,
  numberFlag,
  parseArgs,
  printBuckets,
  printLeakage,
  printListing,
  privacyFlag,
  randomHex,
  requestAppraisal,
  suffix,
  verdict,
  waitForHeight,
  type DemoEnv,
  type ListingView,
} from "./demo.js";
import type { Manifest } from "./deploy.js";
import { fakeChain } from "./testing.js";

const MANIFEST = {
  profile: "sandbox",
  network: "sandbox",
  attestation: "simulated",
  accounts: { deployer: "sandbox", gov: "gov.sandbox", faucet: "faucet.sandbox", agent: "agent.sandbox" },
  contracts: { musdc: { account: "musdc.sandbox" }, clearing: { account: "clearing.sandbox" }, keypolicy: { account: "keypolicy.sandbox" } },
} as unknown as Manifest;

export const ENV: DemoEnv = envOf(MANIFEST);

export const LEAKAGE = { budget_mbits: 32000, reserved_mbits: 0, spent_mbits: 0, remaining_mbits: 32000, price_per_bit: "6250000" };

export const LISTING: ListingView = {
  id: 1,
  seller: "seller.sandbox",
  version: 1,
  status: "Active",
  appraiser: "knowledge@1",
  schema_hash: "72".repeat(32),
  token: "musdc.sandbox",
  rule: { Posted: { ask: "400000000" } },
  max_copies: 3,
  copies: 0,
  key_mode: "RoomSealed",
  delivery_deadline_blocks: 200,
  leakage: LEAKAGE,
};

test("the manifest names the accounts and contracts a demo addresses", () => {
  assert.deepEqual(ENV, {
    profile: "sandbox",
    network: "sandbox",
    clearing: "clearing.sandbox",
    token: "musdc.sandbox",
    faucet: "faucet.sandbox",
    deployer: "sandbox",
    attestation: "simulated",
  });
  assert.equal(agentOf("buyer.sandbox"), "buyer.sandbox#agent");
});

test("arguments: a command, --flag value, and a bare --flag", () => {
  assert.deepEqual(parseArgs(["drc4", "--listing", "1", "--privacy", "open"]), {
    command: "drc4",
    flags: { listing: "1", privacy: "open" },
  });
  // A bare flag at the end, a bare flag before another, and a second bare word that is not a command.
  assert.deepEqual(parseArgs(["drc11", "ignored", "--wait", "--job", "7"]), {
    command: "drc11",
    flags: { wait: "true", job: "7" },
  });
  assert.deepEqual(parseArgs(["drc5", "--snapshot"]), { command: "drc5", flags: { snapshot: "true" } });
  assert.deepEqual(parseArgs([]), { command: "", flags: {} });
});

test("flags are read as what they are, and refused when they are not", () => {
  const args = parseArgs(["drc4", "--identities", "4", "--budget", "500", "--wait", "false", "--privacy", "sealed"]);
  assert.equal(numberFlag(args, "identities", 9), 4);
  assert.equal(numberFlag(args, "missing", 9), 9);
  assert.equal(amountFlag(args, "budget"), "500");
  assert.equal(amountFlag(args, "missing"), null);
  assert.equal(boolFlag(args, "wait", true), false);
  assert.equal(boolFlag(args, "missing", true), true);
  assert.equal(boolFlag(parseArgs(["x", "--wait"]), "wait", false), true);
  assert.equal(privacyFlag(args, "Open"), "Sealed");
  assert.equal(privacyFlag(parseArgs(["x", "--privacy", "open"]), "Sealed"), "Open");
  assert.equal(privacyFlag(parseArgs(["x"]), "Open"), "Open");
  const bad = parseArgs(["x", "--identities", "two", "--budget", "4.5", "--privacy", "half"]);
  assert.throws(() => numberFlag(bad, "identities", 1), /--identities takes a whole number, not "two"/);
  assert.throws(() => amountFlag(bad, "budget"), /--budget takes base units/);
  assert.throws(() => privacyFlag(bad, "Open"), /--privacy takes open or sealed, not "half"/);
});

test("a budget floor comes off the rule, and an unpriceable rule says so", () => {
  assert.equal(askOf(LISTING), "400000000");
  assert.throws(
    () => askOf({ ...LISTING, rule: {} }),
    /listing 1 is not posted under R1 \(\{\}\); pass --budget/,
  );
});

test("amounts and bits are printed in the units a reader thinks in", () => {
  assert.equal(amount("400000000"), "400.000000");
  assert.equal(amount("1"), "0.000001");
  assert.equal(amount("0"), "0.000000");
  assert.equal(bits(16706), "16706 mbits (16.706 bits)");
});

test("suffix is short, and the same clock gives the same one", () => {
  assert.equal(suffix(1_700_000_000_000), suffix(1_700_000_000_000));
  assert.match(suffix(), /^[0-9a-z]{6}$/);
});

test("the views a demo reads, and what it does when there is nothing there", async () => {
  const views = (_c: string, method: string) => {
    if (method === "get_listing") return LISTING;
    if (method === "get_job") return { id: 7, state: "Assigned" };
    if (method === "get_leakage") return LEAKAGE;
    if (method === "get_balance") return "400000000";
    if (method === "config") return { next_job_id: 5 };
    if (method === "audit_head") return { seq: 12, head: "ab".repeat(32) };
    if (method === "get_audit") return [{ seq: 13, height: 500, kind: "AgentBlocked", subject_id: 1, payload_hash: "00" }];
    return null;
  };
  const { chain } = fakeChain({ view: views });
  assert.equal((await listingOf(chain, ENV, 1)).id, 1);
  assert.equal((await jobOf(chain, ENV, 7)).state, "Assigned");
  assert.equal((await leakageOf(chain, ENV, 1)).remaining_mbits, 32000);
  assert.equal(await balanceOf(chain, ENV, "buyer.sandbox"), "400000000");
  assert.equal((await configOf(chain, ENV)).next_job_id, 5);
  assert.equal((await auditHead(chain, ENV)).seq, 12);
  assert.equal((await auditSince(chain, ENV, 13))[0]?.kind, "AgentBlocked");
  await assert.rejects(auditSince(chain, ENV, 0), /the audit chain starts at 1, not 0/);

  const empty = fakeChain({ view: () => null });
  await assert.rejects(listingOf(empty.chain, ENV, 9), /clearing\.sandbox has no listing 9/);
  await assert.rejects(jobOf(empty.chain, ENV, 9), /clearing\.sandbox has no job 9/);
});

test("attempt turns a refusal into the contract's own code", async () => {
  assert.deepEqual(await attempt(() => Promise.resolve(42)), { ok: 42 });
  assert.deepEqual(
    await attempt(() => Promise.reject(new Error("Contract panicked: E_BUDGET_EXHAUSTED"))),
    { code: "E_BUDGET_EXHAUSTED" },
  );
});

test("waiting for a height prints the way there, and stops when told to", async () => {
  let at = 100;
  const slept: number[] = [];
  const { chain, lines, log } = fakeChain({ view: () => null, height: () => (at += 5) });
  // 105 … 205: the progress line is printed every ten blocks, not every block.
  assert.equal(await waitForHeight(chain, 200, log, { sleep: async (ms) => void slept.push(ms) }), 205);
  assert.equal(slept.length, 20);
  assert.ok(lines.some((l) => l.includes("block 115 of 201")));
  assert.ok(!lines.some((l) => l.includes("block 110 of 201")));

  // A check that says "stop" ends the wait where it is, with no sleep at all.
  at = 100;
  const early = fakeChain({ view: () => null, height: () => (at += 5) });
  assert.equal(
    await waitForHeight(early.chain, 500, early.log, { check: () => Promise.resolve(false), sleep: () => Promise.reject(new Error("never")) }),
    105,
  );

  // Already past it: the default sleep is never reached, so this is the one call that omits it.
  at = 1000;
  assert.equal(await waitForHeight(chain, 200, log), 1005);
  await delay(0);
});

test("the header says which demo, against which deployment, and what is simulated", () => {
  const { lines, log } = fakeChain({ view: () => null });
  header(log, "drc4", ENV, "/tmp/manifest.sandbox.json");
  assert.ok(lines.some((l) => l.startsWith("DRC-4 — the leakage wall")));
  assert.ok(lines.some((l) => l.includes("keypolicy-sim")));
  header(log, "drc5", { ...ENV, attestation: "real" }, "x");
  header(log, "drc11", ENV, "x");
  header(log, "nonsense", ENV, "x");
  assert.ok(lines.some((l) => l === "nonsense"));
  assert.ok(lines.some((l) => l.includes("attestation   real") && !l.includes("keypolicy-sim")));
});

test("the lines a demo prints about a listing, its budget and a job's money", () => {
  const { lines, log } = fakeChain({ view: () => null });
  printListing(log, LISTING);
  printLeakage(log, "leakage", LEAKAGE);
  printBuckets(log, "buckets", {
    budget: "400000000",
    compute: "1000000",
    comp_reserved: "6250",
    fee_reserved: "2000000",
    storage: "0",
    held: "0",
    refund: "0",
  });
  assert.ok(lines.some((l) => l.includes("listing 1 v1 by seller.sandbox: Active, knowledge@1, RoomSealed")));
  assert.ok(lines.some((l) => l.includes("400.000000 musdc.sandbox")));
  assert.ok(lines.some((l) => l.includes("budget 32000 mbits, reserved 0, spent 0, remaining 32000")));
  assert.ok(lines.some((l) => l.includes("comp_reserved 0.006250")));
});

test("the verdict is one line, and it says which way it went", () => {
  const { lines, log } = fakeChain({ view: () => null });
  assert.equal(verdict(log, true, "the wall held"), true);
  assert.equal(verdict(log, false, "it did not"), false);
  assert.ok(lines.includes("HELD: the wall held"));
  assert.ok(lines.includes("DID NOT HOLD: it did not"));
});

test("the request is the core's own Borsh, and M1's only shape", async () => {
  const request = buildRequest(LISTING, { budget: "400000000", privacy: "Open", randomHex: () => "11".repeat(32) });
  assert.deepEqual(request, {
    listing_id: 1,
    listing_version: 1,
    snapshot_id: null,
    budget: "400000000",
    mode: "Blind",
    privacy: "Open",
    n_judges: 0,
    delivery_pk: "11".repeat(32),
    compliance_pk: null,
    context_auth_pk: "11".repeat(32),
    sealed_context_key: "",
    refund_to: "Balance",
    nullifier: null,
    nullifier_sig: null,
  });
  const withContext = buildRequest(LISTING, { budget: "1", privacy: "Sealed", nJudges: 2, snapshotId: 4 });
  assert.equal(withContext.snapshot_id, 4);
  assert.equal(withContext.n_judges, 2);
  assert.match(withContext.delivery_pk, /^[0-9a-f]{64}$/);
  assert.notEqual(withContext.delivery_pk, withContext.context_auth_pk);
  assert.match(randomHex(), /^[0-9a-f]{64}$/);

  // The contract takes the Borsh as base64, and the core is what produces it.
  const { chain, calls } = fakeChain({ view: () => null, call: () => ({ status: "Created", job_id: "9" }) });
  assert.deepEqual(await requestAppraisal(chain, ENV, "buyer.sandbox", request), { status: "Created", job_id: "9" });
  assert.equal(calls[0]?.method, "request_appraisal");
  assert.match(String((calls[0]?.args as { request: string }).request), /^[A-Za-z0-9+/]+=*$/);
});

test("an identity is created, minted to and deposited, and the balance is read back", async () => {
  let balance = "0";
  const { chain, calls, created, lines, log } = fakeChain({
    view: (_c, method) => (method === "get_balance" ? balance : null),
    call: (c) => {
      if (c.method === "mint") balance = String(c.args["amount"]);
      return null;
    },
  });
  assert.equal(await makeIdentity(chain, ENV, "sybil-1.sandbox", "1200000000", log), "sybil-1.sandbox");
  assert.deepEqual(created, ["sybil-1.sandbox"]);
  assert.deepEqual(
    calls.map((c) => [c.as, c.contract, c.method, c.deposit]),
    [
      ["faucet.sandbox", "musdc.sandbox", "mint", 0n],
      ["sybil-1.sandbox", "musdc.sandbox", "ft_transfer_call", 1n],
    ],
  );
  // The deposit goes to clearing with clearing's own message: nothing else credits escrow.
  assert.equal((calls[1]?.args as { msg: string }).msg, '{"Deposit":{"account":"sybil-1.sandbox"}}');
  assert.ok(lines.some((l) => l.includes("1200.000000 musdc.sandbox minted and deposited")));

  // A transfer the token refunded is a successful transaction that credited nothing.
  const refunded = fakeChain({ view: (_c, method) => (method === "get_balance" ? "0" : null) });
  await assert.rejects(
    makeIdentity(refunded.chain, ENV, "sybil-2.sandbox", "5", refunded.log),
    /sybil-2\.sandbox deposited 5 but its escrow balance is 0/,
  );
});
