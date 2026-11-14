/**
 * What a judge is (SDD §3.16; E9.1).
 *
 * A judge can only ever take value **off**: `L = max(ℓ_floor, min(ℓ₁, ℓ₂))`, so the worst a bad or
 * hostile answer can do is drop the price to the listing's floor (AC-41). That is why a judge is
 * allowed to be a remote model at all, and why `score` never throws on model output: an answer that
 * does not parse is a factor of zero, which resolves to the floor.
 */

/** The proof a factor carries, in the shape `marginal_core::verdict::ModelProof` takes. */
export type ModelProof =
  | { readonly WeightsInMeasurement: { readonly model_hash: string } }
  | { readonly NearAiReceipt: { readonly text: string; readonly sig65: string; readonly response_body: string } }
  | { readonly Simulated: { readonly signer: string } };

/** One judge's answer, as the verdict publishes it. */
export interface JudgeFactor {
  readonly model_id: string;
  /** 0..10000. Zero means the answer did not parse, which resolves to the floor. */
  readonly factor_bps: number;
  readonly proof: ModelProof;
}

export interface JudgeTask {
  /** The buyer's stated need. */
  readonly need: string;
  /** The good's plaintext. Untrusted data: the prompt says so, and says to ignore it. */
  readonly good: string;
  /** Binds the request to one job, so a cached answer cannot be reused (§3.16's replay set). */
  readonly requestId: string;
}

export interface JudgePort {
  /** Scores a task. Never throws on what the model said; a parse failure is a factor of zero. */
  score(task: JudgeTask): Promise<JudgeFactor>;
}
