/**
 * The worker's entry point: one process, one job (SDD §3.14.1; E7.5 forks it).
 *
 * It takes the job from the supervisor over IPC, runs the pipeline for its kind, and exits. The
 * exit is load-bearing: it is what makes the forget certificate's `process-exit` basis true, so
 * there is no path here that finishes a job and keeps running.
 */
import { loadConfig } from "../config.js";
import { chainClient, type ListingRecord } from "../chain.js";
import { embedder } from "../appraisers/knowledge/embed.js";
import { knowledgeAppraiser } from "../appraisers/knowledge/index.js";
import type { Appraiser } from "../appraisers/types.js";
import { judgesFor } from "../judges/index.js";
import { runAppraisal } from "./appraisal.js";
import { runProvisioning } from "./provisioning.js";
import { runScreening } from "./screening.js";
import { workerChannel, type ChannelProcess } from "./ipc.js";
import type { WorkerContext } from "./context.js";

/**
 * The appraiser for a listing. M1 has one, and loading it means reading 90 MB of weights, so it is
 * built only for the job kind that needs it.
 */
export async function appraiserFor(
  listing: ListingRecord,
  fetchImpl?: typeof globalThis.fetch,
): Promise<Appraiser> {
  if (listing.appraiser !== "knowledge@1") {
    throw new Error(`this room does not run ${listing.appraiser}`);
  }
  const model = await embedder();
  // External judges are opt-in per listing, and need a route out of the room (§3.16). Without one
  // the simulated judge stands in, flagged on chain.
  const judges = judgesFor({
    externalAllowed: listing.external_judges_allowed,
    embedder: model,
    fetchImpl,
  });
  return knowledgeAppraiser(model, judges);
}

/** Runs one job and returns, leaving nothing behind. */
export async function runJob(
  ctx: WorkerContext,
  kind: string,
  jobId: number,
  appraiser: (listing: ListingRecord) => Promise<Appraiser> = (listing) => appraiserFor(listing),
): Promise<void> {
  if (kind === "Provisioning") {
    await runProvisioning(ctx, jobId);
    return;
  }
  if (kind === "Screening") {
    await runScreening(ctx, jobId);
    return;
  }
  if (kind === "Appraisal") {
    await runAppraisal(ctx, jobId, appraiser);
    return;
  }
  // The other kinds are v2 (§3.5).
  throw new Error(`job ${jobId}: this room does not run ${kind} jobs`);
}

/**
 * What the forked process does. The room key comes from the supervisor with the job, because a
 * worker holds no key of its own.
 */
export async function main(
  host: ChannelProcess = process,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const channel = workerChannel(host);
  const { job, roomKey } = await channel.job();
  const config = loadConfig(env);
  await runJob(
    {
      channel,
      chain: chainClient(config.rpcUrl),
      config,
      roomKeyHex: roomKey,
      now: () => Math.floor(Date.now() / 1_000),
    },
    job.kind,
    job.id,
  );
}
