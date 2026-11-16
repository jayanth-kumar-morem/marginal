/**
 * The worker's entry point: one process, one job (SDD §3.14.1; E7.5 forks it).
 *
 * It takes the job from the supervisor over IPC, runs the pipeline for its kind, and exits. The
 * exit is load-bearing: it is what makes the forget certificate's `process-exit` basis true, so
 * there is no path here that finishes a job and keeps running.
 */
import { loadConfig, type RoomConfig } from "../config.js";
import { chainClient, type ListingRecord } from "../chain.js";
import { embedder } from "../appraisers/knowledge/embed.js";
import { knowledgeAppraiser } from "../appraisers/knowledge/index.js";
import type { Appraiser } from "../appraisers/types.js";
import { judgesFor } from "../judges/index.js";
import { runAppraisal } from "./appraisal.js";
import { runProvisioning } from "./provisioning.js";
import { runScreening } from "./screening.js";
import { pathToFileURL } from "node:url";

import { workerChannel, type ChannelProcess } from "./ipc.js";
import type { WorkerContext } from "./context.js";

/**
 * A `fetch` that goes to the operator agent's judge proxy instead of to NEAR AI. The room keeps no
 * API key — one in the compose file would be published with the measurement — so the agent adds it
 * on the way out and the room never learns it (§3.14.3).
 */
export function judgeFetch(operatorUrl: string): typeof globalThis.fetch {
  const base = operatorUrl.replace(/\/$/, "");
  return ((url: string | URL, init?: RequestInit) => {
    const target = new URL(String(url));
    return globalThis.fetch(`${base}/v1/judge${target.pathname}${target.search}`, init);
  }) as typeof globalThis.fetch;
}

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

/**
 * How this room builds an appraiser: with the judge proxy pointed at the operator agent, which is
 * the only route out of the room a judge can be reached by (§3.14.3, E11.3).
 */
export function appraiserVia(config: RoomConfig): (listing: ListingRecord) => Promise<Appraiser> {
  return (listing) => appraiserFor(listing, judgeFetch(config.operatorUrl));
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
    appraiserVia(config),
  );
}

/**
 * Whether this module is the process, rather than something a test imported.
 *
 * `fork(workerPath)` runs the file as the entry point and sends it a job over IPC. A module that
 * only *exports* `main` does nothing then: the process exits 0 having read no message, and the
 * supervisor sees a clean exit and starts another one. The room looked healthy and could not
 * complete a single job — which is what a live run showed, with jobs sitting at `Assigned` and not
 * one line in the log.
 */
export function isEntryPoint(moduleUrl: string, argv: readonly string[] = process.argv): boolean {
  const entry = argv[1];
  if (entry === undefined || entry === "") return false;
  // No try/catch: `pathToFileURL` takes any non-empty string, and a `catch` here would be a branch
  // nothing can reach — dead code dressed as caution.
  return moduleUrl === pathToFileURL(entry).href;
}

/**
 * Runs the worker when this module is the process. Separated from the `if` it replaces so both
 * answers can be tested: an entry-point guard at the top level only ever takes its false branch
 * under a test runner, and the true branch — the one that was missing entirely — would never be
 * exercised again.
 */
export function startIfEntryPoint(
  moduleUrl: string,
  run: () => Promise<void> = main,
  argv: readonly string[] = process.argv,
  // `process.exit` itself, not a wrapper around it: a default that is only ever created and never
  // called is a function the coverage gate can never see, and wrapping a built-in to get one is
  // exactly the dead code that rule is there to catch.
  exit: (code: number) => void = process.exit,
): boolean {
  if (!isEntryPoint(moduleUrl, argv)) return false;
  // **It has to exit.** The supervisor counts a job as finished when its worker's process ends, so
  // a worker that merely stops working holds its slot for ever: after `maxWorkers` jobs the room
  // takes no more work and every later job sits at `Assigned` until it times out. The IPC channel
  // to the supervisor keeps the event loop alive on its own, so draining is not enough — seen on a
  // live chain, where the third job was never picked up and the room looked perfectly healthy.
  void run().then(
    () => exit(0),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      exit(1);
    },
  );
  return true;
}

startIfEntryPoint(import.meta.url);
