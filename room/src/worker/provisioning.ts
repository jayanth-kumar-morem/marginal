/**
 * The provisioning job (SDD §3.12.1, SPEC §4.5.2 option A; E8.3).
 *
 * A seller cannot seal `DEK_g` to a listing key that does not exist yet, so the first job on a new
 * listing version derives it: the room recovers σ through CKD, derives `K_L` and the X25519 pair
 * under it, and reports `pk_L`. It never sees the good — there is nothing to see yet — so its
 * forget certificate has an empty scope and names the key it destroyed instead.
 */
import { call } from "@marginal/core-wasm";

import { signCertificate } from "../cert/forget.js";
import { memzero } from "../crypto/sodium.js";
import { loadJob, type WorkerContext } from "./context.js";
import { keyMode, listingKeyFor } from "./keys.js";
import { base64, certificateKey, hashOf } from "./report.js";

/** `"marginal/provis\0"`, the report's 16-byte domain tag. */
export const PROVISIONING_DOMAIN = Buffer.from("marginal/provis\0", "utf8").toString("hex");

/** Derives the listing key and reports `pk_L` with its certificate. */
export async function runProvisioning(ctx: WorkerContext, jobId: number): Promise<string> {
  const started = ctx.now();
  const { job, listing, attestation, clearing } = await loadJob(ctx, jobId);
  if (job.kind !== "Provisioning") throw new Error(`job ${jobId} is a ${job.kind} job`);
  // There is nothing to provision under the RoomSealed fallback: the seller seals `DEK_g` to the
  // room's own `box_pk`, so no listing key exists to derive. Clearing refuses `begin_provisioning`
  // for such a listing (`clearing/src/listing.rs`), so this job cannot legitimately exist — and a
  // room that was handed one anyway says so rather than deriving a key nothing will ever use.
  const mode = keyMode(listing);
  if (mode !== "Ckd") {
    throw new Error(`job ${jobId}: listing ${listing.id} is ${mode}, so it has no key to provision`);
  }

  const keys = await listingKeyFor(ctx, job, listing, ctx.appKeySource);
  const pkL = Buffer.from(keys.publicKey).toString("hex");
  try {
    const certificate = await signCertificate(ctx.channel.sign.bind(ctx.channel), {
      job,
      attestation,
      config: clearing,
      clearing: ctx.config.clearing,
      roomKeyHex: ctx.roomKeyHex,
      // Nothing was read, so nothing is committed to; the key is what the room held.
      inputCommitments: [],
      keyIdsDestroyed: [hashOf(keys.publicKey)],
      egress: [],
      tStart: started,
      tEnd: ctx.now(),
      // No value changed hands: a provisioning job has no outcome in §3.9.2's table
      // (tasks.md SDD issue 36).
      outcome: "NoDeal",
    });
    await ctx.channel.putBlob(certificateKey(certificate.hash), certificate.bytes);

    const report = {
      domain: PROVISIONING_DOMAIN,
      chain_id: clearing.chain_id,
      clearing: ctx.config.clearing,
      job_id: job.id,
      listing_id: listing.id,
      listing_version: listing.version,
      room_key: ctx.roomKeyHex,
      pk_l: pkL,
      cert_hash: certificate.hash,
    };
    const signature = await ctx.channel.sign(
      call("provisioning_signing_bytes", report) as string,
    );
    await ctx.channel.submit("submit_provisioning", {
      report: base64(call("provisioning_encode", report) as string),
      sig: base64(signature),
    });
    return pkL;
  } finally {
    // The listing key does not outlive the job that derived it; the seller's wrap is what persists.
    memzero(keys.root);
    memzero(keys.secretKey);
  }
}
