/**
 * The screening job (SDD §3.15.2, SPEC §4.3.3; E8.3).
 *
 * It runs once per listing version, before publication: the room opens the good, runs
 * `screening@1`, and reports `Pass` or `Flag(reason)` with a certificate. It debits no leakage
 * budget, because the only thing the result reveals is the flag itself, to the seller, who owns the
 * document anyway.
 *
 * What fired is not reported. Clearing gets a reason code; the matched terms go only to the job
 * log, which is sealed to the governance audit key (§3.14.4).
 */
import { call } from "@marginal/core-wasm";

import { screen, type Screening } from "../appraisers/screening/index.js";
import { signCertificate } from "../cert/forget.js";
import { aeadOpen, memzero } from "../crypto/sodium.js";
import { loadJob, openGood, type WorkerContext } from "./context.js";
import { jobKeyFor } from "./keys.js";
import { base64, certificateKey, commitmentOf } from "./report.js";

/** `"marginal/screen\0"`, the report's 16-byte domain tag. */
export const SCREENING_DOMAIN = Buffer.from("marginal/screen\0", "utf8").toString("hex");

export async function runScreening(ctx: WorkerContext, jobId: number): Promise<Screening> {
  const started = ctx.now();
  const { job, listing, attestation, clearing } = await loadJob(ctx, jobId);
  if (job.kind !== "Screening") throw new Error(`job ${jobId} is a ${job.kind} job`);

  const key = await jobKeyFor(ctx, job, listing, ctx.appKeySource);
  const good = await openGood(ctx, listing, key.unwrap, aeadOpen);
  try {
    const screening = screen(Buffer.from(good.plaintext).toString("utf8"));
    const { commitment } = commitmentOf(good.plaintext);
    const certificate = await signCertificate(ctx.channel.sign.bind(ctx.channel), {
      job,
      attestation,
      config: clearing,
      clearing: ctx.config.clearing,
      roomKeyHex: ctx.roomKeyHex,
      inputCommitments: [commitment],
      keyIdsDestroyed: key.keyIds,
      egress: [],
      tStart: started,
      tEnd: ctx.now(),
      // Nothing was priced or sold (tasks.md SDD issue 36).
      outcome: "NoDeal",
    });
    await ctx.channel.putBlob(certificateKey(certificate.hash), certificate.bytes);

    const report = {
      domain: SCREENING_DOMAIN,
      chain_id: clearing.chain_id,
      clearing: ctx.config.clearing,
      job_id: job.id,
      listing_id: listing.id,
      listing_version: listing.version,
      room_key: ctx.roomKeyHex,
      result: screening.result,
      cert_hash: certificate.hash,
    };
    const signature = await ctx.channel.sign(call("screening_signing_bytes", report) as string);
    await ctx.channel.submit("submit_screening", {
      report: base64(call("screening_encode", report) as string),
      sig: base64(signature),
    });
    return screening;
  } finally {
    memzero(good.plaintext);
    memzero(good.dek);
    key.destroy();
  }
}
