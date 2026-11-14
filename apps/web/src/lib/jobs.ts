/**
 * What `/jobs` and `/jobs/[id]` read (E13.5, D1, D5, D6, D11).
 *
 * A job is a state record with a deadline (SPEC §4.3.5), so the page polls rather than holds a
 * socket open: there is no indexer and no stream in M1, and a job never depends on a transaction
 * staying open. Everything on the page is `get_job` plus `get_settlement` once it exists.
 */
import type { ChainPort } from "./chain";
import type { ClearingConfig, Job, Settlement } from "./records";

/** A job and its settlement, if it has settled. */
export interface JobRow {
  readonly job: Job;
  readonly settlement: Settlement | null;
}

/** The ids to show, newest first. */
export function jobIds(nextJobId: number, limit = 50): readonly number[] {
  const ids: number[] = [];
  for (let id = nextJobId - 1; id >= 1 && ids.length < limit; id -= 1) ids.push(id);
  return ids;
}

/** One job, with its settlement if there is one. */
export async function loadJob(
  chain: ChainPort,
  clearing: string,
  id: number,
): Promise<JobRow | null> {
  const job = await chain.view<Job | null>(clearing, "get_job", { job_id: String(id) });
  if (job === null) return null;
  const settlement = await chain.view<Settlement | null>(clearing, "get_settlement", {
    job_id: String(id),
  });
  return { job, settlement };
}

/** Every job this deployment has, newest first. */
export async function loadJobs(
  chain: ChainPort,
  clearing: string,
  limit = 50,
): Promise<readonly JobRow[]> {
  const config = await chain.view<ClearingConfig>(clearing, "config");
  const rows = await Promise.all(
    jobIds(config.next_job_id, limit).map((id) => loadJob(chain, clearing, id)),
  );
  return rows.filter((row): row is JobRow => row !== null);
}

/** Terminal states: a job in one of these will not change again (§3.5). */
const TERMINAL = new Set([
  "Deal",
  "NoDeal",
  "Restricted",
  "InputRejected",
  "Timeout",
  "Revoked",
  "Final",
  "DeliveryFailure",
  "Fault",
]);

/** What can be done to a job right now, and by whom. */
export interface JobActions {
  /** `approve_parked`: the buyer's own full-access key, on a job the agent cap parked (D5). */
  readonly approve: boolean;
  /** `refund_expired`: anyone, once the deadline has passed (D11). */
  readonly refund: boolean;
  /** Whether the page should keep polling. */
  readonly live: boolean;
}

export function jobActions(job: Job, blockHeight: number): JobActions {
  const expired = blockHeight > job.deadline_height;
  const running = !TERMINAL.has(job.state);
  return {
    approve: job.state === "PendingApproval",
    refund:
      running &&
      expired &&
      (job.state === "Requested" || job.state === "Assigned" || job.state === "Computing"),
    live: running,
  };
}

/**
 * The outcome in the words the demo uses, with what it meant for the money. `price` and `refund`
 * are the contract's own figures: nothing here recomputes them (AC-1).
 */
export function outcomeNote(settlement: Settlement | null): string {
  if (settlement === null) return "No settlement yet.";
  switch (settlement.outcome) {
    case "Deal":
      return "The buyer's valuation reached the ask, so the good was delivered and the price was held for the seller.";
    case "NoDeal":
      return "The buyer's valuation did not reach the ask. The budget came back; the room was still paid for what it read.";
    case "Restricted":
      return "The buyer's restricted list matched before anything was measured, so only one bit was revealed (D8).";
    case "InputRejected":
      return "The input could not be measured, so nothing was revealed and nothing was debited.";
    case "Timeout":
      return "No verdict arrived before the deadline, so anyone could refund the buyer in full (D11).";
    default:
      return `Outcome ${settlement.outcome}.`;
  }
}

/** The buckets a buyer's deposit was split into, in display order (§3.9.1). */
export function buckets(job: Job): readonly { label: string; amount: string }[] {
  return [
    { label: "budget", amount: job.buckets.budget },
    { label: "compute", amount: job.buckets.compute },
    { label: "leakage reserve", amount: job.buckets.comp_reserved },
    { label: "fee reserve", amount: job.buckets.fee_reserved },
    { label: "storage", amount: job.buckets.storage },
    { label: "held", amount: job.buckets.held },
    { label: "refund", amount: job.buckets.refund },
  ];
}
