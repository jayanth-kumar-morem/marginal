/**
 * DRC-5, the agent firewall: a buyer's agent, carrying a prompt injection, against its owner's caps
 * (SDD §3.21, §5.4, D5, AC-50).
 *
 * A buyer gives an agent a function-call key on their **own** account and registers it with caps.
 * This script registers one deliberately *over-permissive* key — its method list allows
 * `request_appraisal`, `approve_parked` **and** `register_agent_key` — because the point is that the
 * contract, not the key's method list, is what holds. The agent then makes five calls:
 *
 *   1. a request over `per_job_budget_max` — refused, no job created, and the attempt is on the
 *      audit chain where the buyer can see what their agent tried;
 *   2. a request above `human_above` — a job, parked in `PendingApproval` for a human;
 *   3. a request that would take the window over `window_max` — refused the same way;
 *   4. `approve_parked` on its own parked job, and
 *   5. `register_agent_key` to widen its own caps — both refused with `E_AGENT_CAP`, which is what
 *      stops an agent authorising itself.
 *
 * Then the human approves, with a key that is not an agent key, and the job moves on.
 *
 * **The injection.** `fixtures/demo/memo-injected.md`'s appendix is the payload (E14.2, D6): five
 * sentences telling the appraisal judge to award full marks. The agent carries it as the buyer's
 * own context — anchored with `anchor_snapshot`, so its content hash is on chain and the job
 * commitment binds it (SDD §3.4 check 3). What the injection then *does* is DRC-6's demonstration,
 * not this one: a judge factor can only ever take value off (AC-41), and `fixtures/demo/README.md`
 * records what it measured. This script shows the firewall and the audit trail.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { borshBase64 } from "./chain.js";
import {
  agentOf,
  amount,
  askOf,
  attempt,
  auditHead,
  auditSince,
  balanceOf,
  bits,
  boolFlag,
  buildRequest,
  configOf,
  jobOf,
  leakageOf,
  listingOf,
  makeIdentity,
  numberFlag,
  printLeakage,
  printListing,
  privacyFlag,
  randomHex,
  requestAppraisal,
  suffix,
  verdict,
  waitForHeight,
  type Args,
  type DemoChain,
  type DemoEnv,
  type ListingView,
  type Log,
  type Privacy,
} from "./demo.js";

/**
 * What the agent key's method list allows. `approve_parked` and `register_agent_key` are in it on
 * purpose: a key that is allowed to call them and is still refused is the demonstration.
 */
export const AGENT_METHOD_LIST = ["request_appraisal", "approve_parked", "register_agent_key"] as const;

/** The injected memo's appendix, which is the whole of its difference from `memo.md`. */
export const INJECTION_HEADING = "## Appendix A";

export interface Drc5Options {
  readonly listingId: number;
  readonly budget: string | null;
  readonly privacy: Privacy;
  /** Anchor the injection as the buyer's context, so the job commitment binds it. */
  readonly snapshot: boolean;
  readonly tag: string;
}

export function drc5Options(args: Args): Drc5Options {
  const listingId = numberFlag(args, "listing", 0);
  if (listingId === 0) throw new Error("drc5 needs --listing <id>: the listing the agent appraises");
  return {
    listingId,
    budget: args.flags["budget"] ?? null,
    // Sealed by default: a parked job still reserves leakage, and one bit is the cheapest way to
    // show the firewall without spending the listing's budget on it (SDD §3.17).
    privacy: privacyFlag(args, "Sealed"),
    snapshot: boolFlag(args, "snapshot", true),
    tag: args.flags["tag"] ?? suffix(),
  };
}

/** The injection out of the demo corpus: its appendix, and the sha256 of the whole file. */
export function injection(root: string): { readonly text: string; readonly sha256: string; readonly file: string } {
  const file = join(root, "fixtures", "demo", "memo-injected.md");
  const whole = readFileSync(file, "utf8");
  const at = whole.indexOf(INJECTION_HEADING);
  if (at === -1) {
    throw new Error(`${file} no longer carries "${INJECTION_HEADING}": the demo corpus changed under this script`);
  }
  return { text: whole.slice(at).trim(), sha256: createHash("sha256").update(whole).digest("hex"), file };
}

/** The caps the buyer registers, derived from what the listing asks (SDD §3.21). */
export interface Caps {
  readonly per_job_budget_max: string;
  readonly window_max: string;
  readonly window_secs: number;
  readonly max_jobs_per_window: number;
  readonly human_above: string;
}

export function capsFor(budget: string): Caps {
  const b = BigInt(budget);
  if (b < 2n) throw new Error(`a budget of ${budget} base units is too small to derive caps from`);
  return {
    // Two budgets per job and two per window: one job at twice the budget fits, a second does not.
    // `human_above` is one unit below the ask, so the ask itself needs a human.
    per_job_budget_max: (b * 2n).toString(),
    window_max: (b * 2n).toString(),
    window_secs: 3600,
    max_jobs_per_window: 5,
    human_above: (b - 1n).toString(),
  };
}

/** One check of the run: what was asked, what the contract answered, and what had to come back. */
interface Arm {
  readonly what: string;
  readonly got: string;
  readonly want: string;
}

const arm = (what: string, got: string, want: string): Arm => ({ what, got, want });

const ok = (a: Arm) => a.got === a.want;

/** The answer or the refusal, as one short string a reader can compare against what was wanted. */
function answerOf(result: { ok: unknown } | { code: string }): string {
  return "code" in result ? result.code : JSON.stringify(result.ok);
}

async function decide(chain: DemoChain, env: DemoEnv, log: Log, found: readonly Arm[], seqBefore: number): Promise<boolean> {
  log("");
  log("the audit chain, from just before the agent's first call:");
  for (const entry of await auditSince(chain, env, seqBefore + 1)) {
    log(`      #${entry.seq} at block ${entry.height}: ${entry.kind} on ${entry.subject_id}`);
  }
  log("");
  for (const a of found) {
    log(`${ok(a) ? "  ok  " : " FAIL "} ${a.what.padEnd(36)} ${a.got}${ok(a) ? "" : `   (wanted ${a.want})`}`);
  }
  const failed = found.filter((a) => !ok(a));
  if (failed.length > 0) {
    return verdict(log, false, `${failed.length} of ${found.length} checks did not hold: ${failed.map((a) => a.what).join("; ")}`);
  }
  return verdict(
    log,
    true,
    "the firewall held: the agent's over-cap requests were refused and created nothing, the one above the human threshold was parked, the agent could neither approve it nor widen its own caps, and every attempt is on the audit chain",
  );
}

interface ArmsInput {
  readonly buyer: string;
  readonly agentKey: string;
  readonly budget: string;
  readonly caps: Caps;
  readonly listing: ListingView;
  readonly snapshotId: number | null;
  readonly privacy: Privacy;
  /** `config().next_job_id` before the agent's first call: a blocked request must not move it. */
  readonly nextJobId: number;
}

async function arms(chain: DemoChain, env: DemoEnv, log: Log, i: ArmsInput): Promise<boolean> {
  const seqBefore = (await auditHead(chain, env)).seq;
  const agent = agentOf(i.buyer);
  const request = (budget: string) => buildRequest(i.listing, { budget, privacy: i.privacy, snapshotId: i.snapshotId });
  const triple = (BigInt(i.budget) * 3n).toString();
  const found: Arm[] = [];

  const balanceBefore = await balanceOf(chain, env, i.buyer);
  log("");
  log(`[1/6] the agent asks for ${amount(triple)} — over per_job_budget_max (${amount(i.caps.per_job_budget_max)})`);
  const over = await attempt(() => requestAppraisal(chain, env, agent, request(triple)));
  log(`      answered ${answerOf(over)}`);
  found.push(arm("over per_job_budget_max", answerOf(over), '{"status":"Blocked","cap":"per_job_budget_max"}'));
  const afterBlock = await configOf(chain, env);
  const balanceAfter = await balanceOf(chain, env, i.buyer);
  log(`      next_job_id is still ${afterBlock.next_job_id}, and the escrow balance is still ${amount(balanceAfter)}`);
  log("      so a blocked request creates no job and spends nothing: it is a refusal, not a cost");
  found.push(arm("no job was created", String(afterBlock.next_job_id), String(i.nextJobId)));
  found.push(arm("and nothing was spent", balanceAfter, balanceBefore));

  log("");
  log(`[2/6] the agent asks for ${amount(i.budget)} — inside the caps, above human_above (${amount(i.caps.human_above)})`);
  const parked = await attempt(() => requestAppraisal(chain, env, agent, request(i.budget)));
  log(`      answered ${answerOf(parked)}`);
  found.push(arm("parked for a human", "ok" in parked ? parked.ok.status : answerOf(parked), "Parked"));
  const jobId = "ok" in parked ? Number(parked.ok.job_id ?? "0") : 0;
  if (jobId === 0) {
    // Without a parked job the four arms below cannot be shown at all, so this run has not
    // demonstrated the firewall whatever the first two arms did.
    log("      no job to approve, so the rest of the run cannot be shown");
    found.push(arm("a parked job to approve", answerOf(parked), "a job id"));
    return decide(chain, env, log, found, seqBefore);
  }
  const job = await jobOf(chain, env, jobId);
  log(`      job ${job.id} is ${job.state}, reserving ${bits(job.max_debit_mbits)}`);
  printLeakage(log, "leakage", await leakageOf(chain, env, i.listing.id));
  found.push(arm("the job is PendingApproval", job.state, "PendingApproval"));

  log("");
  log(`[3/6] the agent asks for ${amount(i.caps.per_job_budget_max)} — inside per_job_budget_max, over window_max with what it has spent`);
  const window = await attempt(() => requestAppraisal(chain, env, agent, request(i.caps.per_job_budget_max)));
  log(`      answered ${answerOf(window)}`);
  found.push(arm("over window_max", answerOf(window), '{"status":"Blocked","cap":"window_max"}'));
  const spend = await chain.view<unknown>(env.clearing, "get_agent_spend", { account: i.buyer, public_key: i.agentKey });
  log(`      get_agent_spend    ${JSON.stringify(spend)} of ${i.caps.window_max} this window`);

  log("");
  log(`[4/6] the agent approves its own parked job ${jobId}`);
  const selfApprove = await attempt(() => chain.call(agent, env.clearing, "approve_parked", { job_id: String(jobId) }));
  log(`      answered ${answerOf(selfApprove)}`);
  found.push(arm("the agent cannot approve its own job", answerOf(selfApprove), "E_AGENT_CAP"));

  log("");
  log("[5/6] the agent widens its own caps with register_agent_key");
  const wide = "1" + "0".repeat(30);
  const selfRegister = await attempt(() =>
    chain.call(agent, env.clearing, "register_agent_key", {
      public_key: i.agentKey,
      caps: { per_job_budget_max: wide, window_max: wide, window_secs: 1, max_jobs_per_window: 65535, human_above: wide },
    }),
  );
  log(`      answered ${answerOf(selfRegister)}`);
  found.push(arm("the agent cannot widen its own caps", answerOf(selfRegister), "E_AGENT_CAP"));

  log("");
  log(`[6/6] the buyer approves job ${jobId} with their own key, which is not an agent key`);
  const approved = await attempt(() => chain.call(i.buyer, env.clearing, "approve_parked", { job_id: String(jobId) }));
  log(`      answered ${answerOf(approved)}`);
  const after = await jobOf(chain, env, jobId);
  log(`      job ${after.id} is now ${after.state}, assigned to ${after.assigned.join(", ") || "no room"}`);
  found.push(arm("a human can release it", after.state, "Assigned"));

  return decide(chain, env, log, found, seqBefore);
}

/** Says, on the line above the buyer, whether the injection is only shown or actually bound. */
function buyerLine(snapshot: boolean): string {
  return snapshot
    ? "it anchors the injected memo as its own context, then hands its agent a key"
    : "--snapshot false: the injection is shown but not anchored, so no job commitment binds it";
}

export async function runDrc5(chain: DemoChain, env: DemoEnv, args: Args, log: Log, root: string): Promise<boolean> {
  const o = drc5Options(args);
  const listing = await listingOf(chain, env, o.listingId);
  printListing(log, listing);
  if (listing.status !== "Active") {
    throw new Error(`listing ${listing.id} is ${listing.status}, not Active: nothing can be appraised on it`);
  }
  const config = await configOf(chain, env);
  const budget = o.budget ?? askOf(listing);
  const caps = capsFor(budget);
  // Six budgets: the over-cap arm alone offers three, and clearing checks the balance before it
  // checks the caps, so a thin balance would refuse with E_BALANCE_LOW and prove nothing.
  const funding = (BigInt(budget) * 6n).toString();

  const payload = injection(root);
  log("");
  log(`the payload: ${payload.file}`);
  log(`      sha256 of the file   ${payload.sha256}`);
  for (const line of payload.text.split("\n")) log(`      │ ${line}`);

  log("");
  log(`the buyer: ${buyerLine(o.snapshot)}`);
  const buyer = `agent-owner-${o.tag}.${env.deployer}`;
  await makeIdentity(chain, env, buyer, funding, log);

  // The context the agent's request carries. Anchored by the buyer's own full-access key, because
  // `anchor_snapshot` charges a storage fee and the protocol refuses a deposit from a function-call
  // key — itself part of why an agent key can only spend what its owner prefunded (SDD §3.21).
  let snapshotId: number | null = null;
  if (o.snapshot) {
    const blob = borshBase64("blob_ref_encode", { uri_hash: randomHex(), sha256: payload.sha256, size_class: 13 });
    const answer = await chain.call(
      buyer,
      env.clearing,
      "anchor_snapshot",
      { kind: "Notes", content_hash: payload.sha256, blob, standing: false },
      BigInt(config.fee_schedule.snapshot),
    );
    snapshotId = Number(answer as string);
    const height = await chain.height();
    log(`      snapshot ${snapshotId} anchored at height ${height}, content_hash ${payload.sha256}`);
    log("      the job commitment binds that hash, so the context cannot be swapped after the fact");
    if (config.profile.cooling_blocks > 0) {
      log(`      waiting ${config.profile.cooling_blocks} cooling blocks before it may be used (AC-6)`);
      await waitForHeight(chain, height + config.profile.cooling_blocks, log);
    }
  }

  const agentKey = await chain.addAgentKey(buyer, env.clearing, [...AGENT_METHOD_LIST]);
  log("");
  log(`the agent's key on ${buyer}: ${agentKey}`);
  log(`      a function-call key for ${env.clearing}, allowed to call ${AGENT_METHOD_LIST.join(", ")}`);
  log("      the last two are allowed on purpose: the contract, not the key, is what refuses them");
  log("");
  log("the caps the buyer registers on it:");
  for (const [key, value] of Object.entries(caps)) log(`      ${key.padEnd(20)} ${value}`);
  await chain.call(buyer, env.clearing, "register_agent_key", { public_key: agentKey, caps });
  const stored = await chain.view<unknown>(env.clearing, "get_agent_caps", { account: buyer, public_key: agentKey });
  log(`      get_agent_caps     ${JSON.stringify(stored)}`);

  return arms(chain, env, log, {
    buyer,
    agentKey,
    budget,
    caps,
    listing,
    snapshotId,
    privacy: o.privacy,
    nextJobId: config.next_job_id,
  });
}
