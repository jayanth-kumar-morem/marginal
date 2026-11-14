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

import { snapshotRecord, type ListingRecord } from "../chain.js";
import { signCertificate } from "../cert/forget.js";
import { sealDelivery, deliveryPayload } from "../crypto/delivery.js";
import { aeadOpen, memzero, randomBytes } from "../crypto/sodium.js";
import { MIN_CONTEXT_CLAIMS } from "../appraisers/knowledge/index.js";
import { claims } from "../appraisers/knowledge/novelty.js";
import type { Appraiser, JudgeFactor } from "../appraisers/types.js";
import { loadJob, openGood, type JobData, type WorkerContext } from "./context.js";
import { listingKeyFor, type DerivedKey } from "./keys.js";
import { base64, certificateKey, commitmentOf, hashOf } from "./report.js";

/** `"marginal/verdict"`, the verdict's 16-byte domain tag. */
export const VERDICT_DOMAIN = Buffer.from("marginal/verdict", "utf8").toString("hex");

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
  const keys = await listingKeyFor({ ...ctx }, job, listing, ctx.appKeySource);
  const decided = await decide(ctx, data, keys, appraiser);
  try {
    return await submit(ctx, data, keys, appraiser, decided, started);
  } finally {
    memzero(keys.root);
    memzero(keys.secretKey);
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
  keys: DerivedKey,
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

  const good = await openGood(ctx, listing, keys, aeadOpen);
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
    // On a deal the buyer needs the key, and the delivery is derived, so it can be built now and
    // reproduced by any room later (§3.19).
    const delivery = sealDelivery(
      keys.secretKey,
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

/** Steps 10 to 12: the certificate, the verdict, and the delivery receipt on a deal. */
async function submit(
  ctx: WorkerContext,
  data: JobData,
  keys: DerivedKey,
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
    keyIdsDestroyed: [hashOf(keys.publicKey)],
    egress: deliveryHash === null ? [] : [deliveryHash],
    tStart: started,
    tEnd: ctx.now(),
    outcome,
  });
  await ctx.channel.putBlob(certificateKey(certificate.hash), certificate.bytes);

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
    // M1 is Open and blind: the components are published and no field is shown (E6.1).
    open: { components: decided.components, factors: decided.factors, shown: [] },
    sealed: null,
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
  })) as { price?: unknown } | null;

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
    components: decided.components,
    price: typeof answered?.price === "string" ? answered.price : null,
    deliveryHash,
  };
}
