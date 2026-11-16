/**
 * DRC-4, the leakage wall: buying the same information twice under different names buys no more of
 * it (SDD §3.8, §5.4, D4, SC-10, AC-12).
 *
 * N fresh identities appraise one listing. Every job reserves what it could possibly reveal before
 * it runs, the listing's budget pays for all of them together, and the moment the budget can no
 * longer cover another job the contract refuses to open one — `E_BUDGET_EXHAUSTED`. Nothing about
 * the refusal depends on who is asking: a sybil's hundredth account meets the same ledger as its
 * first.
 *
 * Every number printed is the contract's own. The debit is not predicted from a schema this script
 * holds a copy of — `get_listing` publishes only the schema's hash (SDD issue 39 in the task list) — it is
 * read off the first job the contract created (`max_debit_mbits`) and then *checked* against every
 * later one and against the fall in `remaining_mbits`. So the claim "every job debits exactly the
 * same, and the budget falls by exactly that" is tested here rather than asserted.
 */
import {
  amount,
  buildRequest,
  askOf,
  attempt,
  bits,
  jobOf,
  leakageOf,
  listingOf,
  makeIdentity,
  numberFlag,
  printLeakage,
  printListing,
  privacyFlag,
  requestAppraisal,
  suffix,
  verdict,
  type Args,
  type DemoChain,
  type DemoEnv,
  type JobView,
  type Log,
  type Privacy,
} from "./demo.js";

/** The most identities one run will create, so a large budget cannot spend a demo's whole evening. */
export const MAX_IDENTITIES = 12;

export interface Drc4Options {
  readonly listingId: number;
  /** The most identities to try. The last one is the one expected to meet the wall. */
  readonly identities: number;
  /** The budget each identity offers, or `null` for the listing's own ask. */
  readonly budget: string | null;
  readonly privacy: Privacy;
  /** Appended to every account this run creates, so a second run does not collide with the first. */
  readonly tag: string;
}

export function drc4Options(args: Args): Drc4Options {
  const listingId = numberFlag(args, "listing", 0);
  if (listingId === 0) throw new Error("drc4 needs --listing <id>: the listing the sybil probes");
  const identities = numberFlag(args, "identities", MAX_IDENTITIES);
  if (identities < 2) throw new Error("--identities must be at least 2: one probe and the one that meets the wall");
  if (identities > MAX_IDENTITIES) throw new Error(`--identities is capped at ${MAX_IDENTITIES}; each one is an account and a deposit`);
  return {
    listingId,
    identities,
    budget: args.flags["budget"] ?? null,
    privacy: privacyFlag(args, "Open"),
    tag: args.flags["tag"] ?? suffix(),
  };
}

/** What one probe did, as the contract reported it. */
interface Probe {
  readonly identity: string;
  readonly job: JobView;
  readonly remainingBefore: number;
  readonly remainingAfter: number;
}

/** What has to be true, each of it checked against what the contract itself said. */
function report(log: Log, env: DemoEnv, probes: readonly Probe[], refusal: string | null, remaining: number): boolean {
  log("");
  // The loop below either opened a job or stopped at a refusal, so an empty run is a first
  // identity that was refused before it ever probed — a precondition, not the wall.
  if (probes.length === 0) {
    return verdict(log, false, `the first identity was refused with ${refusal} before it probed anything, so the wall was never reached`);
  }
  const debit = (probes[0] as Probe).job.max_debit_mbits;
  const sameDebit = probes.every((p) => p.job.max_debit_mbits === debit);
  const fellBy = probes.every((p) => p.remainingBefore - p.remainingAfter === debit);
  const owed = probes.reduce((sum, p) => sum + BigInt(p.job.buckets.comp_reserved), 0n);
  log(`${probes.length} identities were served, each reserving ${bits(debit)}, and the budget has ${remaining} mbits left`);
  log(`the seller is owed ${amount(owed.toString())} ${env.token} for those bits (Σ π·d, held in each job's comp_reserved until it settles)`);
  log(`every job's debit the same:   ${sameDebit}`);
  log(`budget fell by exactly that:  ${fellBy}`);
  log(`the next request:             ${refusal ?? "was never made — the run ran out of identities first"}`);
  if (!sameDebit || !fellBy) {
    return verdict(
      log,
      false,
      "the debits or the budget did not add up; the figures above are the contract's own, so check whether another job on this listing settled between two probes — a verdict moves millibits from reserved to spent, and a timeout releases them",
    );
  }
  if (refusal === null) {
    return verdict(log, false, `the budget outlasted ${probes.length} identities: ${remaining} mbits are left, so raise --identities or list a smaller budget`);
  }
  if (refusal !== "E_BUDGET_EXHAUSTED") {
    return verdict(log, false, `the wall was not the leakage ledger: the next request was refused with ${refusal}`);
  }
  if (remaining >= debit) {
    return verdict(log, false, `the budget still had ${remaining} mbits, enough for another ${debit}-mbit probe, and the request was refused anyway`);
  }
  return verdict(
    log,
    true,
    `the leakage wall held: ${probes.length} identities drained the budget to ${remaining} mbits, below the ${debit} a probe costs, and the next identity was refused with E_BUDGET_EXHAUSTED`,
  );
}

export async function runDrc4(chain: DemoChain, env: DemoEnv, args: Args, log: Log): Promise<boolean> {
  const o = drc4Options(args);
  const listing = await listingOf(chain, env, o.listingId);
  printListing(log, listing);
  if (listing.status !== "Active") {
    throw new Error(`listing ${listing.id} is ${listing.status}, not Active: nothing can be appraised on it`);
  }
  const budget = o.budget ?? askOf(listing);
  // Each identity is funded with three times what it offers. The budget, π·d and the buyer's share
  // of the clearing fee all come out of this, and so does the appraiser's compute fee — which no
  // view publishes (SDD issue 40 in the task list), so the balance is generous on purpose and what the job
  // really cost is printed from its own buckets below.
  const funding = (BigInt(budget) * 3n).toString();
  log("");
  log(`${o.identities} identities, ${o.privacy} verdicts, each offering ${amount(budget)} ${listing.token}`);
  log(`each is funded with ${amount(funding)} ${listing.token} — three times its budget, since the appraiser's compute fee has no view`);
  log("the listing's leakage budget is the only thing that bounds them all, and it is shared");
  log("");

  const probes: Probe[] = [];
  let refusal: string | null = null;
  let remaining = listing.leakage.remaining_mbits;
  for (let n = 1; n <= o.identities; n += 1) {
    const identity = `sybil-${n}-${o.tag}.${env.deployer}`;
    log(`[${n}/${o.identities}] ${identity}`);
    await makeIdentity(chain, env, identity, funding, log);
    const request = buildRequest(listing, { budget, privacy: o.privacy });
    const answer = await attempt(() => requestAppraisal(chain, env, identity, request));
    if ("code" in answer) {
      log(`      request_appraisal refused: ${answer.code}`);
      refusal = answer.code;
      break;
    }
    if (answer.ok.status !== "Created" || answer.ok.job_id === undefined) {
      throw new Error(`request_appraisal answered ${JSON.stringify(answer.ok)}; this listing is not a plain appraisal`);
    }
    const job = await jobOf(chain, env, Number(answer.ok.job_id));
    const after = await leakageOf(chain, env, o.listingId);
    log(`      job ${job.id} is ${job.state}: it reserved ${bits(job.max_debit_mbits)} and ${amount(job.buckets.comp_reserved)} ${listing.token} for the seller's bits`);
    printLeakage(log, "leakage", after);
    probes.push({ identity, job, remainingBefore: remaining, remainingAfter: after.remaining_mbits });
    remaining = after.remaining_mbits;
    if (n === 1) {
      log(`      at ${job.max_debit_mbits} mbits a probe, this budget has room for ${Math.floor(remaining / job.max_debit_mbits)} more`);
    }
  }

  return report(log, env, probes, refusal, remaining);
}
