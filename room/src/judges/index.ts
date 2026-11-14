/**
 * Which judges a room uses (SDD §3.16; E9.1).
 *
 * External judges are **opt-in per listing** and off unless the deployment has a key: NEAR AI's
 * engines are launched at run time from a public repository and a signer address alone does not pin
 * the code, so a seller has to choose to let one near their good (T35). Without a key the room
 * falls back to the simulated judge, which is flagged on chain and cannot be mistaken for a
 * receipt.
 *
 * Self-hosted judges, with weights hashes in the room's measurement, are v1 production (§3.16) and
 * not built here.
 */
import type { Embedder } from "../appraisers/knowledge/embed.js";
import { JUDGE_MODELS, nearAiJudge } from "./near-ai-cloud.js";
import { simJudge } from "./sim.js";
import type { JudgeFactor, JudgePort, JudgeTask } from "./types.js";

export interface JudgeChoice {
  /** Whether this listing lets an external judge see the good (§3.16, opt-in per listing). */
  readonly externalAllowed: boolean;
  readonly embedder: Embedder;
  /**
   * The room's only route to NEAR AI: the supervisor's proxy, which holds the API key. Absent
   * means there is no route, so there are no external judges.
   */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * The judges for one job: the two §3.16 names, or one simulated stand-in.
 *
 * A deployment with no key needs no configuration here. The proxy answers such a call with an
 * error, the judge turns that into a factor of zero, and zero resolves to the listing's floor — so
 * a missing key costs the seller their floor price and nothing else.
 */
export function judgesFor(choice: JudgeChoice): JudgePort[] {
  if (!choice.externalAllowed || choice.fetchImpl === undefined) {
    return [simJudge(choice.embedder)];
  }
  return JUDGE_MODELS.map((model) => nearAiJudge({ model, fetchImpl: choice.fetchImpl }));
}

/**
 * Scores a task with every judge. One judge failing does not fail the job: its factor is zero,
 * which resolves to the floor, and `judgement_factor` takes the minimum of what came back.
 */
export async function scoreAll(judges: readonly JudgePort[], task: JudgeTask): Promise<JudgeFactor[]> {
  return Promise.all(judges.map((judge) => judge.score(task)));
}
