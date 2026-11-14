/**
 * Buyer-relative novelty (SDD §3.15.1, AC-39; E8.6), ported from LETHE's `enclave/lib/novelty.js`
 * with its τ values (0.78 / 0.45) and its padding-resistant need weighting.
 *
 * The seller's good is split into claims; each claim is compared with every sentence of the buyer's
 * own context. A claim the buyer already knows contributes nothing, an unseen one contributes
 * fully, and claims are weighted by how close they are to the buyer's stated need — so padding the
 * document with fresh but irrelevant sentences cannot inflate the score.
 *
 * No language model is involved, which is the point: nothing written inside the good can argue its
 * own novelty up (SPEC §4.8, "deterministic first").
 */
import { similarity, type Embedder } from "./embed.js";

/** A claim at or above this similarity to something the buyer has counts as already known. */
export const KNOWN = 0.78;
/** At or below this, it counts as entirely new. Linear in between. */
export const UNSEEN = 0.45;
/** The floor on a claim's weight, so an off-need claim still counts for something. */
export const MIN_WEIGHT = 0.05;
/** The fewest words a sentence needs before it is treated as a claim. */
export const MIN_CLAIM_WORDS = 5;
/** Basis points in a whole. */
const BPS = 10_000;

/**
 * Splits text into claims: LETHE's deterministic splitter. Markdown headings go, sentences split on
 * terminal punctuation or a line break, list markers are stripped, and anything shorter than five
 * words is not a claim.
 */
export function claims(text: string): string[] {
  return text
    .replace(/^#.*$/gmu, "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.replace(/^[-*\d.)\s]+/u, "").trim())
    .filter((sentence) => sentence.split(/\s+/u).length >= MIN_CLAIM_WORDS);
}

/** How novel one claim is, given the closest thing the buyer already has. */
export function claimNovelty(maxSimilarity: number): number {
  return Math.max(0, Math.min(1, (KNOWN - maxSimilarity) / (KNOWN - UNSEEN)));
}

/** What the appraiser reports per claim; it goes to the job log, never on chain (§3.14.4). */
export interface ClaimScore {
  readonly maxSimilarity: number;
  readonly novelty: number;
  readonly weight: number;
}

export interface Novelty {
  /** `N_b` in basis points: the need-weighted mean of the per-claim novelties. */
  readonly bps: number;
  readonly claims: readonly ClaimScore[];
}

/**
 * Measures the good against the buyer's context and need.
 *
 * A good with no claims at all scores zero rather than failing: it is a document with nothing in
 * it, which is a real answer and not an error.
 */
export async function novelty(
  embedder: Embedder,
  good: string,
  context: string,
  need: string,
): Promise<Novelty> {
  const goodClaims = claims(good);
  if (goodClaims.length === 0) return { bps: 0, claims: [] };
  const contextClaims = claims(context);

  const goodVectors = await embedder.embed(goodClaims);
  const contextVectors = contextClaims.length > 0 ? await embedder.embed(contextClaims) : [];
  const needVector = need.trim() === "" ? undefined : (await embedder.embed([need]))[0];

  const scored = goodVectors.map((vector) => {
    let best = 0;
    for (const known of contextVectors) best = Math.max(best, similarity(vector, known));
    return {
      maxSimilarity: best,
      novelty: claimNovelty(best),
      weight: needVector === undefined ? 1 : Math.max(MIN_WEIGHT, similarity(vector, needVector)),
    };
  });

  const weight = scored.reduce((sum, claim) => sum + claim.weight, 0);
  const mean = scored.reduce((sum, claim) => sum + claim.novelty * claim.weight, 0) / weight;
  return { bps: Math.round(mean * BPS), claims: scored };
}
