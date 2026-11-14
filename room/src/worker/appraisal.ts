/**
 * The appraisal pipeline (SDD §3.14.2; E8.4): one job, start to finish, inside one process.
 *
 * The order is the whole design. The job's own commitment is recomputed before anything is
 * decrypted, because a room that trusted job parameters read over RPC would be trusting the host
 * (DR-5). The context is checked **before** the good is touched, so a job with too little context
 * to measure against never decrypts the seller's document (T7). The restricted list is applied
 * next, so a buyer who said "not from this issuer" never has it read either (AC-62). Only then is
 * the good fetched, and only if it hashes to the commitment the listing published.
 *
 * Nothing here decides a price. The room publishes quantised components and clearing recomputes the
 * price from them (E6.1), so a room that lied about the arithmetic would be caught by the contract.
 */
import { call } from "@marginal/core-wasm";

import {
  snapshotRecord,
  type ClearingConfig,
  type JobRecord,
  type ListingRecord,
} from "../chain.js";
import { signCertificate } from "../cert/forget.js";
import { deliveryPayload } from "../crypto/delivery.js";
import { aeadOpen, memzero, randomBytes } from "../crypto/sodium.js";
import { MIN_CONTEXT_CLAIMS } from "../appraisers/knowledge/index.js";
import { SEALED_FORMULA, postedAsk, proveSealed, type SealedBody } from "../prove.js";
import { claims } from "../appraisers/knowledge/novelty.js";
import type { Appraiser, JudgeFactor } from "../appraisers/types.js";
import { loadJob, openGood, type JobData, type WorkerContext } from "./context.js";
import { jobKeyFor, type JobKey } from "./keys.js";
import { base64, certificateKey, commitmentOf } from "./report.js";

/** `"marginal/verdict"`, the verdict's 16-byte domain tag. */
export const VERDICT_DOMAIN = Buffer.from("marginal/verdict", "utf8").toString("hex");

/** `"marginal/ack"`, the ack's 16-byte domain tag. */
export const ACK_DOMAIN = Buffer.from("marginal/ack\0\0\0\0", "utf8").toString("hex");

/**
 * The room's own `Assigned → Computing` ack (SDD §3.5, §3.12.7; `clearing.room_ack`).
 *
 * Under Ckd the key release is the signal: KeyPolicy calls `authorize_release` and that call moves
 * the job. A RoomSealed listing has no key release for clearing to observe — the room opens the
 * seller's wrap with its own `box_sk` — so the room says so itself, over a message that binds this
 * chain, this contract, this job and this job's commitment. The operator agent relays it and pays
 * the gas; it cannot forge one, because the room's key signs all four together.
 */
async function ackJob(
  ctx: WorkerContext,
  job: JobRecord,
  clearing: ClearingConfig,
): Promise<void> {
  const ack = {
    domain: ACK_DOMAIN,
    chain_id: clearing.chain_id,
    clearing: ctx.config.clearing,
    job_id: job.id,
    room_key: ctx.roomKeyHex,
    job_commitment: job.job_commitment,
  };
  const signature = await ctx.channel.sign(call("room_ack_signing_bytes", ack) as string);
  await ctx.channel.submit("room_ack", {
    ack: base64(call("room_ack_encode", ack) as string),
    room_sig: base64(signature),
  });
}

/** Where a job's sealed context bundle lives. The buyer's SDK writes it (E12.1). */
export function contextKey(jobId: number): string {
  return `jobs/${jobId}/context`;
}

/** What the buyer sealed for this job: their context, what they need, and what they will not take. */
export interface Bundle {
  readonly context: string;
  readonly need: string;
  /** Issuers or protocols the buyer refuses to be sold (D8, AC-62). */
  readonly restricted: readonly string[];
}

/** Reads a bundle, refusing anything that is not one rather than guessing at defaults. */
export function parseBundle(json: string): Bundle {
  const parsed: unknown = JSON.parse(json);
  const bundle = parsed as Partial<Bundle>;
  if (typeof bundle.context !== "string" || typeof bundle.need !== "string") {
    throw new Error("the context bundle has no context and need");
  }
  // The list has to be there, even when it is empty: a bundle that simply omits it is one the
  // buyer's client did not write, and guessing `[]` would turn a malformed bundle into a job that
  // ignored a restriction.
  const restricted = bundle.restricted;
  if (!Array.isArray(restricted) || restricted.some((term) => typeof term !== "string")) {
    throw new Error("the restricted list is not a list of terms");
  }
  return { context: bundle.context, need: bundle.need, restricted: restricted.map(String) };
}

/**
 * Recomputes `job_commitment` from what the chain says and refuses the job unless it matches.
 *
 * `assigned_rooms` is empty and `formula_params` is the default because that is what clearing
 * commits to at request time (`clearing/src/job.rs`), before any room is assigned.
 */
export async function checkCommitment(ctx: WorkerContext, data: JobData): Promise<void> {
  const { job, listing } = data;
  const snapshot =
    job.snapshot_id === null
      ? null
      : await snapshotRecord(ctx.chain, ctx.config.clearing, job.snapshot_id);
  const recomputed = call("job_commitment", {
    chain_id: data.clearing.chain_id,
    clearing: ctx.config.clearing,
    job_id: job.id,
    kind: job.kind,
    listing_id: listing.id,
    listing_version: listing.version,
    snapshot_id: job.snapshot_id,
    snapshot_content_hash: snapshot === null ? null : snapshot.content_hash,
    budget: job.buckets.budget,
    rule: listing.rule,
    // Clearing commits to the default, because no M1 formula takes a parameter.
    formula_params: { delta_star_bps: 0 },
    mode: job.mode,
    privacy: job.privacy,
    disclosure_policy: listing.disclosure_policy,
    max_debit_mbits: job.max_debit_mbits,
    delivery_pk: job.delivery_pk,
    compliance_pk: job.compliance_pk,
    context_auth_pk: job.context_auth_pk,
    assigned_rooms: [],
    deadline_height: job.deadline_height,
  }) as string;
  if (recomputed !== job.job_commitment) {
    throw new Error(`job ${job.id}: the chain's parameters do not hash to its commitment`);
  }
}

/** A term from the restricted list that the good mentions, if any (D8). */
export function restrictedMatch(good: string, restricted: readonly string[]): string | undefined {
  const text = good.toLowerCase();
  return restricted.map((term) => term.toLowerCase()).find((term) => term !== "" && text.includes(term));
}

/** What the room ends up submitting, so a test can see the decision rather than infer it. */
export interface Appraised {
  readonly status: string;
  readonly components: readonly number[];
  readonly price: string | null;
  readonly deliveryHash: string | null;
}

interface Verdict {
  readonly status: string;
  readonly components: number[];
  /** What the judges said. Empty when none ran, which leaves the ceiling alone (§3.7). */
  readonly factors: JudgeFactor[];
  readonly delivery: string | null;
}

/** Runs one appraisal job. */
export async function runAppraisal(
  ctx: WorkerContext,
  jobId: number,
  make: (listing: ListingRecord) => Promise<Appraiser>,
): Promise<Appraised> {
  const started = ctx.now();
  const data = await loadJob(ctx, jobId);
  const { job, listing } = data;
  if (job.kind !== "Appraisal") throw new Error(`job ${jobId} is a ${job.kind} job`);
  await checkCommitment(ctx, data);

  const appraiser = await make(listing);
  const key = await jobKeyFor(ctx, job, listing, ctx.appKeySource);
  // A RoomSealed job acks before anything is computed, and a Ckd job never acks at all: clearing
  // refuses an ack for a Ckd listing, because KeyPolicy's `authorize_release` is what moves one.
  // It cannot wait until the good is open: a job refused at its context never opens the good, and
  // its verdict still has to be accepted, which needs the job in `Computing` (§3.5). A screening or
  // provisioning report is the other way round — it is accepted only while the job is `Assigned` —
  // so neither of those kinds acks.
  // Only while the job is still waiting for it. A worker that dies after acking is re-forked by the
  // supervisor, and a second ack is refused with `E_JOB_STATE` because the job has already moved —
  // which would make every retry fail for ever, on a job that is otherwise fine. Seen in a live
  // run: one worker acked, died later in the appraisal, and the job could never be picked up again.
  if (key.mode === "RoomSealed" && job.state === "Assigned") {
    await ackJob(ctx, job, data.clearing);
  }
  const decided = await decide(ctx, data, key, appraiser);
  try {
    return await submit(ctx, data, key, appraiser, decided, started);
  } finally {
    key.destroy();
  }
}

/**
 * Steps 2 to 8: the context, the restricted list, the good, the appraisal, and the branch. Each
 * refusal returns a verdict rather than throwing, because a refused job still has to be answered —
 * silence would leave the buyer's funds locked until the deadline.
 */
async function decide(
  ctx: WorkerContext,
  data: JobData,
  key: JobKey,
  appraiser: Appraiser,
): Promise<Verdict> {
  const { job, listing } = data;
  const sealedContextKey = await ctx.chain.view<string | null>(
    ctx.config.clearing,
    "get_context_key",
    { job_id: String(job.id) },
  );
  if (sealedContextKey === null) {
    return { status: "InputRejected", components: [0, 0], factors: [], delivery: null };
  }
  const dekC = new Uint8Array(
    Buffer.from(await ctx.channel.unseal(Buffer.from(sealedContextKey, "base64").toString("hex")), "hex"),
  );
  const object = new Uint8Array(Buffer.from(await ctx.channel.getBlob(contextKey(job.id)), "hex"));
  const bundle = parseBundle(
    Buffer.from(aeadOpen(dekC, object.subarray(0, 24), object.subarray(24), new Uint8Array(0))).toString("utf8"),
  );
  memzero(dekC);

  // Step 3: too little context to measure against, and the good is never decrypted.
  if (claims(bundle.context).length < MIN_CONTEXT_CLAIMS) {
    return { status: "InputRejected", components: [0, 0], factors: [], delivery: null };
  }

  const good = await openGood(ctx, listing, key.unwrap, aeadOpen);
  try {
    // Step 4: the buyer said they would not take this, so nothing else is computed.
    if (restrictedMatch(Buffer.from(good.plaintext).toString("utf8"), bundle.restricted) !== undefined) {
      return { status: "Restricted", components: [0, 0], factors: [], delivery: null };
    }
    const appraisal = await appraiser.appraise({
      good: Buffer.from(good.plaintext).toString("utf8"),
      context: bundle.context,
      need: bundle.need,
      requestId: `${ctx.config.clearing}/${job.id}`,
    });
    // On a deal the buyer needs the key, and the delivery is derived rather than drawn, so it can
    // be built now and re-derived later: by any room holding `K_L` under Ckd, and by this room
    // alone under the RoomSealed fallback (§3.19, §3.12.7).
    const delivery = await key.seal(
      new Uint8Array(Buffer.from(job.job_commitment, "hex")),
      deliveryPayload(good.dek, good.salt, listing.version),
      [
        new Uint8Array(Buffer.from(job.delivery_pk, "hex")),
        ...(job.compliance_pk === null ? [] : [new Uint8Array(Buffer.from(job.compliance_pk, "hex"))]),
      ],
    );
    return {
      status: "Ok",
      components: appraisal.components,
      factors: appraisal.factors,
      delivery: call("delivery_encode", delivery) as string,
    };
  } finally {
    memzero(good.plaintext);
    memzero(good.dek);
  }
}

/**
 * The Sealed body for this job. The verifying key on chain is for one formula and one rule, so an
 * appraiser or a listing the proof could not be checked against is refused here rather than
 * answered with a proof clearing will reject.
 */
function sealedBody(data: JobData, appraiser: Appraiser, decided: Verdict): Promise<SealedBody> {
  const { job, listing } = data;
  if (appraiser.formulaId !== SEALED_FORMULA) {
    throw new Error(`sealed mode is built for ${SEALED_FORMULA}, not ${appraiser.formulaId}`);
  }
  return proveSealed(
    {
      jobCommitment: job.job_commitment,
      budget: job.buckets.budget,
      ask: postedAsk(listing.rule),
      lFloorBps: listing.l_floor_bps,
    },
    { components: decided.components, factors: decided.factors.map((f) => f.factor_bps) },
  );
}

/** Steps 10 to 12: the certificate, the verdict, and the delivery receipt on a deal. */
async function submit(
  ctx: WorkerContext,
  data: JobData,
  key: JobKey,
  appraiser: Appraiser,
  decided: Verdict,
  started: number,
): Promise<Appraised> {
  const { job, listing, attestation, clearing } = data;
  const outcome = decided.status === "Ok" ? "NoDeal" : decided.status;
  const delivery =
    decided.delivery === null
      ? null
      : {
          bytes: decided.delivery,
          hash: call("delivery_hash", call("delivery_decode", { bytes: decided.delivery })) as string,
        };
  const deliveryHash = delivery === null ? null : delivery.hash;

  const certificate = await signCertificate(ctx.channel.sign.bind(ctx.channel), {
    job,
    attestation,
    config: clearing,
    clearing: ctx.config.clearing,
    roomKeyHex: ctx.roomKeyHex,
    inputCommitments: [commitmentOf(new Uint8Array(Buffer.from(job.job_commitment, "hex"))).commitment],
    keyIdsDestroyed: key.keyIds,
    egress: deliveryHash === null ? [] : [deliveryHash],
    tStart: started,
    tEnd: ctx.now(),
    outcome,
  });
  await ctx.channel.putBlob(certificateKey(certificate.hash), certificate.bytes);

  // Sealed mode: the components stay in the room and a proof says the price follows from them
  // (§3.17, E10.3). A status with no price has nothing to prove, so it is sent as it is.
  const sealed =
    job.privacy === "Sealed" && decided.status === "Ok"
      ? await sealedBody(data, appraiser, decided)
      : null;
  const verdict = {
    domain: VERDICT_DOMAIN,
    chain_id: clearing.chain_id,
    clearing: ctx.config.clearing,
    job_id: job.id,
    job_commitment: job.job_commitment,
    listing_id: listing.id,
    listing_version: listing.version,
    appraiser: { id: appraiser.id, version: appraiser.version, formula_id: appraiser.formulaId },
    status: decided.status,
    privacy: job.privacy,
    // Blind either way: no field is shown (E6.1). In Open mode the components are published and
    // clearing recomputes the price from them; **in Sealed mode there is no open body at all**,
    // whether or not there was anything to prove. Deciding that by `sealed === null` attached one
    // to every unpriced Sealed verdict — a restricted good or an input the appraiser cannot read —
    // and clearing refused each with `E_SCHEMA`, leaving the job to time out with the buyer's
    // funds locked (`clearing/src/verdict.rs`: "the room sends the status alone").
    open:
      job.privacy === "Sealed"
        ? null
        : { components: decided.components, factors: decided.factors, shown: [] },
    sealed,
    delivery_commitment: deliveryHash,
    cert_hash: certificate.hash,
    room_key: ctx.roomKeyHex,
    nonce: Buffer.from(randomBytes(16)).toString("hex"),
    t_start: started,
    t_end: ctx.now(),
  };
  const signature = await ctx.channel.sign(call("verdict_signing_bytes", verdict) as string);
  const answered = (await ctx.channel.submit("submit_verdict", {
    verdict: base64(call("verdict_encode", verdict) as string),
    sig: base64(signature),
  })) as { status?: unknown; reason?: unknown; price?: unknown } | null;
  // Clearing refuses a verdict it cannot check by **returning** the reason and leaving the job
  // open, so the room can fix it and try again before the deadline (`clearing/src/verdict.rs`).
  // That only works if the room looks: taking any answer for acceptance made a refused verdict
  // indistinguishable from an accepted one, and the job sat in `Computing` until it timed out
  // while the room reported success and forgot about it.
  if (answered?.status === "Rejected") {
    throw new Error(`job ${job.id}: clearing refused the verdict (${String(answered.reason)})`);
  }

  // The good itself goes to the blob store and the receipt to clearing, so the seller can be paid
  // (§3.19; clearing refuses a receipt whose hash is not the one the verdict committed to).
  if (delivery !== null) {
    await ctx.channel.putBlob(`deliveries/${job.id}`, delivery.bytes);
    await ctx.channel.submit("submit_delivery_receipt", {
      job_id: String(job.id),
      delivery_hash: delivery.hash,
    });
  }
  return {
    status: decided.status,
    // A Sealed verdict publishes no components, so neither does what the room reports back.
    components: sealed === null ? decided.components : [],
    price: typeof answered?.price === "string" ? answered.price : null,
    deliveryHash,
  };
}
