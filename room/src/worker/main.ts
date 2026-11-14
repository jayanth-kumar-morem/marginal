/**
 * The worker's entry point: one process, one job (SDD §3.14.1; E7.5 forks it).
 *
 * It takes the job from the supervisor over IPC, runs the pipeline for its kind, and exits. The
 * exit is load-bearing: it is what makes the forget certificate's `process-exit` basis true, so
 * there is no path here that finishes a job and keeps running.
 */
import { loadConfig } from "../config.js";
import { chainClient } from "../chain.js";
import { runProvisioning } from "./provisioning.js";
import { runScreening } from "./screening.js";
import { workerChannel, type ChannelProcess } from "./ipc.js";
import type { WorkerContext } from "./context.js";

/** Runs one job and returns, leaving nothing behind. */
export async function runJob(ctx: WorkerContext, kind: string, jobId: number): Promise<void> {
  if (kind === "Provisioning") {
    await runProvisioning(ctx, jobId);
    return;
  }
  if (kind === "Screening") {
    await runScreening(ctx, jobId);
    return;
  }
  // Appraisal is E8.4; the other kinds are v2 (§3.5).
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
