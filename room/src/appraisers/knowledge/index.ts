/**
 * `knowledge@1` (SDD §3.15.1; E8.6): what a document is worth to one buyer, measured.
 *
 * `D = N_b · N_pub / 10⁴`, where `N_b` is buyer-relative novelty and `N_pub` is novelty against the
 * public corpus. M1 has no in-room corpus, so `N_pub` is a whole — the price is then entirely about
 * what this buyer does not already know, which is the thing the exchange claims to price.
 *
 * Both components are quantised to 21 levels before they leave, so what gets published is about
 * 4.4 bits each rather than a precise measurement of the buyer's private context (§3.8).
 */
import type { Embedder } from "./embed.js";
import { novelty } from "./novelty.js";
import { scoreAll } from "../../judges/index.js";
import type { JudgePort } from "../../judges/types.js";
import { quantise, type Appraisal, type AppraisalInput, type Appraiser } from "../types.js";

/** 5% steps, as §3.15.1's component table says. */
export const COMPONENT_LEVELS = 21;
/** `N_pub` when there is no public corpus to measure against (§3.15.1). */
export const N_PUB_WITHOUT_CORPUS = 10_000;
/**
 * The fewest context sentences a job needs before the good is touched (§3.15.1, T7). The pipeline
 * enforces it: too little context and the job is `InputRejected`, with the good never decrypted.
 */
export const MIN_CONTEXT_CLAIMS = 30;

/**
 * Builds the appraiser. The embedder is loaded once per worker and reused for every claim, and the
 * judges — if the listing allows any — can only take value off what the measurement found (§3.7).
 */
export function knowledgeAppraiser(embedder: Embedder, judges: readonly JudgePort[] = []): Appraiser {
  return {
    id: "knowledge",
    version: 1,
    formulaId: "KnowledgeV1",
    componentAlphabets: [COMPONENT_LEVELS, COMPONENT_LEVELS],
    async appraise(input: AppraisalInput): Promise<Appraisal> {
      const measured = await novelty(embedder, input.good, input.context, input.need);
      const factors = await scoreAll(judges, {
        need: input.need,
        good: input.good,
        requestId: input.requestId,
      });
      return {
        components: [
          quantise(measured.bps, COMPONENT_LEVELS),
          quantise(N_PUB_WITHOUT_CORPUS, COMPONENT_LEVELS),
        ],
        factors,
        shown: [],
        // Counts, never values: how much there was to measure, not what any of it was.
        datasheet: {
          claims: measured.claims.length,
          claims_known: measured.claims.filter((claim) => claim.novelty === 0).length,
          claims_new: measured.claims.filter((claim) => claim.novelty === 1).length,
        },
      };
    },
  };
}
