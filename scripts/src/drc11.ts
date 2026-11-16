/**
 * DRC-11, the timeout refund: the room is killed mid-job and the buyer is made whole (SDD §3.4,
 * §5.4, D11, AC-9, AC-34).
 *
 * A job's money sits in its own buckets from the moment it is opened (AC-4), so a room that dies
 * holding the only key cannot strand it. Past the deadline **anyone** may call `refund_expired` —
 * no operator, no governance, no key of the buyer's — and every bucket goes back to the buyer's
 * escrow balance while the leakage reservation is released. This script proves that with an account
 * it creates for the purpose, which holds no tokens, is not the buyer and has never been near the
 * job.
 *
 * What it checks, all from the contract's own views and `marginal-core`'s own arithmetic:
 *
 *   - the buyer's escrow balance rose by exactly what the job's buckets held beforehand, checked
 *     with core's `check_conservation` rather than a sum written out here (AC-4);
 *   - the job ends in `Timeout` with everything in `refund` and nothing anywhere else;
 *   - the listing's leakage reservation is released by exactly the job's `max_debit_mbits`;
 *   - the room's open-job queue no longer holds it.
 *
 * It cannot kill the room itself: the room is a process on the operator's machine. It prints the
 * room key and the deadline, waits, and says plainly if the room answered before the deadline —
 * because a refund on a job the room finished would demonstrate nothing.
 */
import { CoreError, call } from "@marginal/core-wasm";
import { NEAR } from "./chain.js";
import {
  amount,
  askOf,
  attempt,
  balanceOf,
  bits,
  boolFlag,
  buildRequest,
  jobOf,
  leakageOf,
  listingOf,
  makeIdentity,
  numberFlag,
  printBuckets,
  printLeakage,
  printListing,
  privacyFlag,
  requestAppraisal,
  suffix,
  verdict,
  waitForHeight,
  type Args,
  type BucketsView,
  type DemoChain,
  type DemoEnv,
  type JobView,
  type LeakageView,
  type Log,
  type Privacy,
} from "./demo.js";

/** The job states a refund before a verdict is allowed from (SDD §3.5, `is_terminal` in reverse). */
export const REFUNDABLE = ["PendingApproval", "Requested", "Assigned", "Computing"] as const;

export interface Drc11Options {
  /** Open a fresh job on this listing. Ignored when `--job` names one already in flight. */
  readonly listingId: number;
  readonly jobId: number;
  readonly budget: string | null;
  readonly privacy: Privacy;
  /** Wait for the deadline. `--wait false` stops after printing what to kill and when. */
  readonly wait: boolean;
  readonly tag: string;
}

export function drc11Options(args: Args): Drc11Options {
  const listingId = numberFlag(args, "listing", 0);
  const jobId = numberFlag(args, "job", 0);
  if (listingId === 0 && jobId === 0) {
    throw new Error("drc11 needs --listing <id> to open a job, or --job <id> for one already in flight");
  }
  return {
    listingId,
    jobId,
    budget: args.flags["budget"] ?? null,
    // Sealed by default: the job is never going to be answered, so one bit is the cheapest claim
    // this demonstration can make on the listing's leakage budget (SDD §3.17).
    privacy: privacyFlag(args, "Sealed"),
    wait: boolFlag(args, "wait", true),
    tag: args.flags["tag"] ?? suffix(),
  };
}

/**
 * core's own conservation check (AC-4): `deposit` has to equal the buckets plus what moved out.
 *
 * The arithmetic is `marginal_core::conservation`'s, not this script's. A refusal — the amounts not
 * adding up, or a negative movement that is not an amount at all — is the answer "no", which is
 * what the line above the verdict reports; anything that is not the core refusing is re-thrown.
 */
export function conserves(
  deposit: bigint,
  buckets: BucketsView,
  movedOut: bigint,
  core: (op: string, input: unknown) => unknown = call,
): boolean {
  try {
    core("check_conservation", { deposit: deposit.toString(), buckets, moved_out: movedOut.toString() });
    return true;
  } catch (e) {
    if (e instanceof CoreError) return false;
    throw e;
  }
}

/** A timeout releases the reservation and spends none of it (SDD §3.8, E5.3). */
export function released(before: LeakageView, after: LeakageView, mbits: number): boolean {
  return (
    after.reserved_mbits === before.reserved_mbits - mbits &&
    after.spent_mbits === before.spent_mbits &&
    after.remaining_mbits === before.remaining_mbits + mbits
  );
}

/** Every bucket but `refund` has to be empty once a job has timed out. */
export function onlyRefund(buckets: BucketsView): boolean {
  const { refund, ...rest } = buckets;
  return refund !== "0" && Object.values(rest).every((value) => value === "0");
}

interface Check {
  readonly what: string;
  readonly held: boolean;
  readonly detail: string;
}

function decide(log: Log, checks: readonly Check[]): boolean {
  log("");
  for (const c of checks) log(`${c.held ? "  ok  " : " FAIL "} ${c.what.padEnd(44)} ${c.detail}`);
  const failed = checks.filter((c) => !c.held);
  return failed.length === 0
    ? verdict(
        log,
        true,
        "the timeout refund held: past the deadline an account with no tokens, no relationship to the job and nobody's permission made the buyer whole to the unit, and the leakage reservation was released",
      )
    : verdict(log, false, `${failed.length} of ${checks.length} checks did not hold: ${failed.map((c) => c.what).join("; ")}`);
}

/** The job this run refunds: a fresh one on `--listing`, or the one `--job` names. */
async function target(chain: DemoChain, env: DemoEnv, o: Drc11Options, log: Log): Promise<JobView> {
  if (o.jobId !== 0) {
    const job = await jobOf(chain, env, o.jobId);
    log(`job ${job.id} was already in flight`);
    return job;
  }
  const listing = await listingOf(chain, env, o.listingId);
  printListing(log, listing);
  if (listing.status !== "Active") {
    throw new Error(`listing ${listing.id} is ${listing.status}, not Active: nothing can be appraised on it`);
  }
  const budget = o.budget ?? askOf(listing);
  const funding = (BigInt(budget) * 3n).toString();
  const buyer = `killbuyer-${o.tag}.${env.deployer}`;
  log("");
  log(`the buyer: ${buyer}, offering ${amount(budget)} ${listing.token} for a ${o.privacy} verdict`);
  await makeIdentity(chain, env, buyer, funding, log);
  const answer = await requestAppraisal(chain, env, buyer, buildRequest(listing, { budget, privacy: o.privacy }));
  if (answer.status !== "Created" || answer.job_id === undefined) {
    throw new Error(`request_appraisal answered ${JSON.stringify(answer)}; expected a plain Created job`);
  }
  return jobOf(chain, env, Number(answer.job_id));
}

export async function runDrc11(chain: DemoChain, env: DemoEnv, args: Args, log: Log): Promise<boolean> {
  const o = drc11Options(args);
  const job = await target(chain, env, o, log);
  const buyer = job.buyer;
  if (buyer === null) {
    throw new Error(`job ${job.id} has no buyer (it is an internal provisioning or screening job): there is nobody to refund`);
  }
  if (!(REFUNDABLE as readonly string[]).includes(job.state)) {
    throw new Error(`job ${job.id} is ${job.state}; a refund before a verdict needs one of ${REFUNDABLE.join(", ")}`);
  }
  const bucketsBefore = job.buckets;
  const leakageBefore = await leakageOf(chain, env, job.listing_id);
  const balanceBefore = await balanceOf(chain, env, buyer);
  const height = await chain.height();

  log("");
  log(`job ${job.id} on listing ${job.listing_id}: ${job.state}, buyer ${buyer}`);
  log(`      assigned    ${job.assigned.join(", ") || "no room"}`);
  log(`      requested   block ${job.requested_height}`);
  log(`      deadline    block ${job.deadline_height} (the chain is at ${height}: ${job.deadline_height + 1 - height} blocks to go)`);
  log(`      reserved    ${bits(job.max_debit_mbits)}`);
  printBuckets(log, "buckets", bucketsBefore);
  printLeakage(log, "leakage", leakageBefore);
  log(`      the buyer's escrow balance is ${amount(balanceBefore)} ${env.token}`);
  log("");
  log("KILL THE ROOM NOW — stop the room process while the job is still unanswered.");
  log(`Past block ${job.deadline_height} anyone can end this job; nothing below needs the operator, the`);
  log("seller, governance or the buyer, and no key of theirs is used.");
  log("(A room that is already down is the same demonstration without the race: this run then just");
  log("waits out the deadline. A room that answers first is reported as exactly that, and nothing");
  log("is refunded, because a job the room finished proves nothing about timeouts.)");

  if (!o.wait) {
    log("");
    log(`--wait false: stopping here. Rerun with --job ${job.id} once the room is down.`);
    return verdict(log, false, `nothing was refunded: rerun with --job ${job.id} to wait for block ${job.deadline_height} and claim it`);
  }

  log("");
  log(`waiting for block ${job.deadline_height + 1}…`);
  const answered: string[] = [];
  await waitForHeight(chain, job.deadline_height, log, {
    check: async (at) => {
      const now = await jobOf(chain, env, job.id);
      if ((REFUNDABLE as readonly string[]).includes(now.state)) return true;
      log(`      the room answered at block ${at}: job ${job.id} is ${now.state}`);
      answered.push(now.state);
      return false;
    },
  });
  if (answered.length > 0) {
    return verdict(
      log,
      false,
      `the room answered before the deadline (the job is ${answered[0]}), so no timeout refund was due; kill the room sooner and rerun`,
    );
  }

  // An account with nothing to do with the job: no tokens, not the buyer, created for this call.
  const anyone = `anyone-${o.tag}.${env.deployer}`;
  await chain.create(anyone, NEAR);
  log("");
  log(`${anyone} calls refund_expired(${job.id}). It holds no ${env.token}, and it is not the buyer.`);
  const refunded = await attempt(() => chain.call(anyone, env.clearing, "refund_expired", { job_id: String(job.id) }));
  if ("code" in refunded) {
    log(`      refused: ${refunded.code}`);
    return verdict(log, false, `refund_expired was refused with ${refunded.code} after the deadline had passed`);
  }
  log(`      answered ${JSON.stringify(refunded.ok)}`);

  const after = await jobOf(chain, env, job.id);
  const leakageAfter = await leakageOf(chain, env, job.listing_id);
  const balanceAfter = await balanceOf(chain, env, buyer);
  const queue = await chain.view<readonly { id: number }[]>(env.clearing, "get_jobs_for_room", { room_key: job.assigned[0] ?? "" });
  log(`      job ${after.id} is now ${after.state}`);
  printBuckets(log, "buckets", after.buckets);
  printLeakage(log, "leakage", leakageAfter);
  log(`      the buyer's escrow balance is ${amount(balanceAfter)} ${env.token}`);

  const moved = BigInt(balanceAfter) - BigInt(balanceBefore);
  return decide(log, [
    {
      what: "the buyer got back what was funded",
      held: conserves(moved, bucketsBefore, 0n),
      detail: `${amount(moved.toString())} ${env.token} moved, and core's check_conservation says that is exactly what the buckets held`,
    },
    {
      what: "and exactly what the job records as refunded",
      held: conserves(moved, after.buckets, 0n),
      detail: `refund is ${amount(after.buckets.refund)}`,
    },
    { what: "nothing is left in any other bucket", held: onlyRefund(after.buckets), detail: JSON.stringify(after.buckets) },
    { what: "the job ends in Timeout", held: after.state === "Timeout", detail: after.state },
    {
      what: "the leakage reservation is released",
      held: released(leakageBefore, leakageAfter, job.max_debit_mbits),
      detail: `reserved ${leakageBefore.reserved_mbits} → ${leakageAfter.reserved_mbits}, spent ${leakageBefore.spent_mbits} → ${leakageAfter.spent_mbits}, remaining ${leakageBefore.remaining_mbits} → ${leakageAfter.remaining_mbits}`,
    },
    {
      what: "the room's queue no longer holds the job",
      held: !queue.some((j) => j.id === job.id),
      detail: `${queue.length} open job(s) left for that room`,
    },
    {
      what: "nobody but a stranger was involved",
      held: anyone !== buyer,
      detail: `${anyone} is not ${buyer}`,
    },
  ]);
}
