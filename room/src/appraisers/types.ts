/**
 * What an appraiser is (SDD §3.15; E8.6).
 *
 * All appraisers follow SPEC §4.8's four rules: deterministic first, judgement only as a downward
 * factor, aggregate outputs only, and no network call carrying anything derived from the good. The
 * interface is therefore narrow on purpose — a module gets text and gives back numbers.
 */

/** A judge's downward factor, in bps of a whole, with whatever proof the judge offers (§3.16). */
export interface JudgeFactor {
  readonly model_id: string;
  readonly factor_bps: number;
  readonly proof: unknown;
}

export interface AppraisalInput {
  /** The seller's good, as canonical text. */
  readonly good: string;
  /** The buyer's own context. */
  readonly context: string;
  /** What the buyer said they need. */
  readonly need: string;
}

export interface Appraisal {
  /** Already quantised, in bps, one per component the formula takes. */
  readonly components: number[];
  /** Empty when no judge ran: `judgement_factor([])` is a whole, so nothing is taken off. */
  readonly factors: JudgeFactor[];
  /** M1 is blind: no field is shown, and clearing rejects a verdict that shows one (E6.1). */
  readonly shown: never[];
  /** Counters for the job log only. Never per-claim values, and never on chain (§3.14.4). */
  readonly datasheet: Record<string, number>;
}

export interface Appraiser {
  readonly id: string;
  readonly version: number;
  readonly formulaId: string;
  /** Quantisation levels, one per component. */
  readonly componentAlphabets: readonly number[];
  appraise(input: AppraisalInput): Promise<Appraisal>;
}

/**
 * Rounds a bps value onto an alphabet of `levels` evenly spaced steps, which is what "quantised"
 * means in §3.15. With 21 levels the steps are 5% apart, so a component carries about 4.4 bits
 * however precisely it was measured — the whole point of quantising before publishing.
 */
export function quantise(bps: number, levels: number): number {
  if (levels < 2) throw new Error("appraiser: an alphabet needs at least two levels");
  const step = 10_000 / (levels - 1);
  const index = Math.round(Math.min(10_000, Math.max(0, bps)) / step);
  return Math.round(index * step);
}
