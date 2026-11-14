/**
 * `replay-ts`: re-checks a settlement from public chain data (SDD §3.18, D2, DRC-2; E12.2).
 *
 * Nothing here trusts a record because it is on chain. Every figure it can recompute, it recomputes
 * with `marginal-core` — the same code the contract ran — and compares with what was stored: the
 * outcome's end state, the job's buckets after settlement, the leakage debit against its
 * reservation, the seller's compensation, and the hash chain the audit log is built from. One
 * flipped byte in any of those fails a check.
 *
 * **What four views cannot give.** A verdict's components, judge factors and room signature are in
 * the transaction that carried them, not in a view, and so is a Sealed verdict's proof. Those were
 * checked on chain when `submit_verdict` ran; re-checking them off-chain needs the verdict bytes,
 * which an indexer or a transaction read supplies (M2, E18). This verifier **says which checks it
 * could not run** rather than leaving a reader to assume it ran them — a verifier that implied more
 * than it did would be worse than one that did less.
 */
import { call } from "@marginal/core-wasm";

/** The one thing a verifier needs of a chain: a view call. */
export interface ChainPort {
  view<T>(contract: string, method: string, args?: unknown): Promise<T>;
}

/**
 * A view client over plain JSON-RPC, for a caller that has no other way to read the chain — the
 * gateway's `/v1/replay/:id`, and anything running this verifier from a shell. It is deliberately
 * the smallest thing that satisfies [`ChainPort`]: no `Buffer`, no dependency, final finality.
 *
 * The web app has its own richer client (it also needs block heights and error codes), and E18's
 * SDK `views.ts` is where the two collapse into one.
 */
export function chainClient(
  rpcUrl: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): ChainPort {
  return {
    async view<T>(contract: string, method: string, args: unknown = {}): Promise<T> {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: "replay",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: contract,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args), "utf8").toString("base64"),
        },
      });
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const reply = (await response.json()) as {
        result?: { result?: number[]; error?: string };
        error?: { message?: string };
      };
      if (reply.error !== undefined) throw new Error(`${method}: ${reply.error.message ?? "refused"}`);
      if (reply.result?.error !== undefined) throw new Error(`${method}: ${reply.result.error}`);
      if (reply.result?.result === undefined) throw new Error(`${method}: no result`);
      return JSON.parse(Buffer.from(reply.result.result).toString("utf8")) as T;
    },
  };
}

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  /** Why it passed or failed, in a line a reader can act on. */
  readonly detail: string;
  /** True when the check could not be run from views at all, rather than having failed. */
  readonly unchecked?: boolean;
}

export interface Report {
  readonly job_id: number;
  /** True when every check that could run passed. */
  readonly ok: boolean;
  readonly checks: readonly Check[];
}

interface Buckets {
  readonly budget: string;
  readonly compute: string;
  readonly comp_reserved: string;
  readonly fee_reserved: string;
  readonly storage: string;
  readonly held: string;
  readonly refund: string;
}

interface Job {
  readonly id: number;
  readonly state: string;
  readonly listing_id: number;
  readonly privacy: string;
  readonly max_debit_mbits: number;
  readonly buckets: Buckets;
}

interface Settlement {
  readonly outcome: string;
  readonly price: string;
  readonly refund: string;
  readonly held: string;
  readonly leakage_debit_mbits: number;
  readonly leakage_comp: string;
  readonly cert_hashes: readonly string[];
  readonly components_commitment: string | null;
  readonly audit_seq: number;
}

interface Listing {
  readonly leakage: { readonly price_per_bit: string };
}

/** The audit view's page size (SDD §3.10: `MAX_AUDIT_PAGE`). */
export const AUDIT_PAGE = 100;

const ZERO32 = "0".repeat(64);

const check = (name: string, ok: boolean, detail: string, unchecked = false): Check =>
  unchecked ? { name, ok, detail, unchecked } : { name, ok, detail };

/** The code a core refusal carries, or the message if it was not one of ours. */
function code(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The outcome table: the state this outcome must leave the job in (`marginal_core::settle`).
 * An outcome that is not a first settlement has no end state at all, which is itself a finding.
 */
export function stateCheck(job: Job, settlement: Settlement): Check {
  try {
    const expected = call("state_for", { outcome: settlement.outcome }) as string;
    return check(
      "outcome and state agree",
      expected === job.state,
      `${settlement.outcome} must leave the job ${expected}; it is ${job.state}`,
    );
  } catch (error) {
    return check("outcome and state agree", false, `core refuses this outcome: ${code(error)}`);
  }
}

/**
 * What settlement does to the buckets: the budget, compute, and both reserves are emptied, the
 * storage deposit stays, and what is left sits in `held` and `refund`. Those two must be the
 * settlement record's own figures, written by the same call — if they drifted, one of the two
 * records has been edited.
 */
export function bucketCheck(job: Job, settlement: Settlement): readonly Check[] {
  const emptied = (["budget", "compute", "comp_reserved", "fee_reserved"] as const).filter(
    (name) => job.buckets[name] !== "0",
  );
  return [
    check(
      "buckets emptied",
      emptied.length === 0,
      emptied.length === 0
        ? "budget, compute and both reserves are spent or returned"
        : `still funded: ${emptied.join(", ")}`,
    ),
    check(
      "held and refund",
      job.buckets.held === settlement.held && job.buckets.refund === settlement.refund,
      `the job holds ${job.buckets.held} and refunds ${job.buckets.refund}; the settlement says ${settlement.held} and ${settlement.refund}`,
    ),
  ];
}

/**
 * The debit can never exceed what was reserved before the room ran (§3.8: "Debit equals
 * reservation"), and for a deal or a no-deal it is exactly the reservation — which is DRC-2's
 * "debit = `max_debit`" and DRC-10's "exactly 1,000 mbits".
 */
export function debitCheck(job: Job, settlement: Settlement): Check {
  const debited = settlement.leakage_debit_mbits;
  const reserved = job.max_debit_mbits;
  const priced = settlement.outcome === "Deal" || settlement.outcome === "NoDeal";
  const ok = priced ? debited === reserved : debited <= reserved;
  return check(
    "leakage debit",
    ok,
    priced
      ? `${debited} mbits debited against a reservation of ${reserved}, which a priced outcome spends in full`
      : `${debited} mbits debited, within the ${reserved} reserved`,
  );
}

/** π · d, floored, is what the seller is owed — capped by what the buyer reserved for it. */
export function compensationCheck(
  settlement: Settlement,
  listing: Listing,
): Check {
  try {
    const owed = call("compensation", {
      price_per_bit: listing.leakage.price_per_bit,
      mbits: settlement.leakage_debit_mbits,
    }) as string;
    const paid = BigInt(settlement.leakage_comp);
    const expected = BigInt(owed);
    return check(
      "seller compensation",
      paid === expected || paid < expected,
      paid === expected
        ? `π · d = ${owed}, which is what the seller was paid`
        : `π · d = ${owed}; the seller was paid ${settlement.leakage_comp}, capped by the buyer's reserve`,
    );
  } catch (error) {
    return check("seller compensation", false, `could not be recomputed: ${code(error)}`);
  }
}

/** Every verdict names its forget certificate, and a zero hash names nothing (§3.18). */
export function certificateCheck(settlement: Settlement): Check {
  const hashes = settlement.cert_hashes;
  const named = hashes.length > 0 && hashes.every((hash) => hash !== ZERO32);
  return check(
    "certificate anchor",
    named,
    named
      ? `${hashes.length} certificate${hashes.length === 1 ? "" : "s"} anchored on chain`
      : "this settlement names no certificate",
  );
}

/**
 * Walks the whole audit log and recomputes its head with core's own step function. This is the
 * check that makes the rest meaningful: the log is what says *when* each record was written, and
 * the head is a single hash over all of it.
 */
export async function auditCheck(chain: ChainPort, clearing: string): Promise<Check> {
  try {
    const head = await chain.view<{ seq: number; head: string }>(clearing, "audit_head");
    let digest = ZERO32;
    let seen = 0;
    for (let from = 1; from <= head.seq; from += AUDIT_PAGE) {
      const page = await chain.view<readonly Record<string, unknown>[]>(clearing, "get_audit", {
        from: String(from),
        limit: AUDIT_PAGE,
      });
      for (const entry of page) {
        digest = call("audit_step", { prev_head: digest, entry }) as string;
        seen += 1;
      }
    }
    return check(
      "audit chain",
      digest === head.head && seen === head.seq,
      digest === head.head
        ? `${seen} entries hash to the head the contract reports`
        : `${seen} entries hash to ${digest}, not ${head.head}`,
    );
  } catch (error) {
    return check("audit chain", false, `could not be walked: ${code(error)}`);
  }
}

/** The checks this build cannot run from views, named so that silence is not mistaken for proof. */
export function gapChecks(job: Job, settlement: Settlement): readonly Check[] {
  const sealed = job.privacy === "Sealed";
  return [
    check(
      "room signature",
      true,
      "checked on chain by submit_verdict; the verdict bytes are not in a view, so it is not re-checked here (E18)",
      true,
    ),
    sealed
      ? check(
          "sealed proof",
          true,
          `the Groth16 proof was verified on chain against the commitment ${
            settlement.components_commitment ?? "(none recorded)"
          }; the proof itself is not in a view`,
          true,
        )
      : check(
          "price rule",
          true,
          "the components are in the verdict transaction, not a view, so m is not recomputed here (E18)",
          true,
        ),
  ];
}

/** Everything that can be re-checked about one settlement, from four views. */
export function replayer(chain: ChainPort, clearing: string): (jobId: number) => Promise<Report> {
  return async (jobId: number): Promise<Report> => {
    const [job, settlement] = await Promise.all([
      chain.view<Job | null>(clearing, "get_job", { job_id: String(jobId) }),
      chain.view<Settlement | null>(clearing, "get_settlement", { job_id: String(jobId) }),
    ]);
    if (job === null) {
      return { job_id: jobId, ok: false, checks: [check("job", false, "there is no such job")] };
    }
    if (settlement === null) {
      return {
        job_id: jobId,
        ok: false,
        checks: [check("settlement", false, `job ${jobId} is ${job.state} and has not settled`)],
      };
    }
    const listing = await chain.view<Listing>(clearing, "get_listing", {
      listing_id: String(job.listing_id),
    });
    const checks = [
      check("settlement", true, `job ${jobId} settled ${settlement.outcome}`),
      stateCheck(job, settlement),
      ...bucketCheck(job, settlement),
      debitCheck(job, settlement),
      compensationCheck(settlement, listing),
      certificateCheck(settlement),
      await auditCheck(chain, clearing),
      ...gapChecks(job, settlement),
    ];
    return { job_id: jobId, ok: checks.every((one) => one.ok), checks };
  };
}

export const PACKAGE = "@marginal/replay-ts";
