/**
 * The simulated judge (SDD §3.16; E9.1), for the sandbox and for a deployment with no API key.
 *
 * It exists so that every surface downstream of a judge can be exercised without a paid account,
 * and so that a room without a key still produces a complete verdict rather than failing. It is
 * **not** a judge: its factor is the buyer's own need similarity, computed in the room, and its
 * proof is `Simulated`, which clearing records and the web app shows as a simulated element
 * (DRC-12). Nothing about it can be mistaken for a provider's receipt.
 */
import { similarity, type Embedder } from "../appraisers/knowledge/embed.js";
import { claims } from "../appraisers/knowledge/novelty.js";
import type { JudgeFactor, JudgePort, JudgeTask } from "./types.js";

/** What the sandbox calls its signer, so a simulated factor is obvious on chain. */
export const SIM_SIGNER = "sim";
/** The factor is quantised to the same eleven levels a real judge's 0..10 gives. */
export const JUDGE_SCALE = 11;

/**
 * Below this need-similarity the document is irrelevant (factor 0, so the floor); above the upper
 * bound it is wholly relevant. The band between them is what makes the simulated factor vary at
 * all, and the numbers are LETHE's.
 */
export const SIM_LOW = 0.15;
export const SIM_HIGH = 0.6;

/** Maps a similarity onto one of the eleven integer levels, then to bps. */
export function simFactor(similarityScore: number): number {
  const scaled = (similarityScore - SIM_LOW) / (SIM_HIGH - SIM_LOW);
  const level = Math.round(Math.min(1, Math.max(0, scaled)) * (JUDGE_SCALE - 1));
  return level * 1_000;
}

export function simJudge(embedder: Embedder, model = "sim/need-similarity"): JudgePort {
  return {
    async score(task: JudgeTask): Promise<JudgeFactor> {
      const sentences = claims(task.good);
      if (sentences.length === 0 || task.need.trim() === "") {
        return { model_id: model, factor_bps: 0, proof: { Simulated: { signer: SIM_SIGNER } } };
      }
      const [need, ...good] = await embedder.embed([task.need, ...sentences]);
      // The three closest claims, as LETHE's stand-in did: one lucky sentence should not carry it.
      const top = good
        .map((vector) => similarity(need as Float32Array, vector))
        .sort((a, b) => b - a)
        .slice(0, 3);
      const mean = top.reduce((sum, value) => sum + value, 0) / top.length;
      return {
        model_id: model,
        factor_bps: simFactor(mean),
        proof: { Simulated: { signer: SIM_SIGNER } },
      };
    },
  };
}
