/**
 * `dataset-lite@0` (SDD §3.15.3; E8.7): a CPU proxy for the v2 lift test.
 *
 * It answers one question: if the buyer added the seller's rows to their own training set, how much
 * more of their evaluation set would a linear probe get right? That is measured, not asserted —
 * baseline, augmented, and a bootstrap interval over the evaluation rows, with the lower bound
 * taken so that noise cannot be sold as lift.
 *
 * **What this is not.** A linear probe on frozen embeddings is not predictive of what fine-tuning a
 * model on the same rows would buy. The datasheet says so, and the v2 G-room lift test replaces it.
 */
import type { Embedder } from "../knowledge/embed.js";
import { similarity } from "../knowledge/embed.js";
import { quantise, type Appraisal, type AppraisalInput, type Appraiser } from "../types.js";
import {
  choleskySolve,
  normalEquations,
  percentile,
  predict,
  seededRandom,
} from "./linear.js";

/** Components are quantised to these alphabets (§3.15.3's shown fields use 8 and 11). */
export const COMPONENT_LEVELS = 21;
/** A seller row this close to a buyer training row is already theirs (§3.15.3). */
export const OVERLAP_SIMILARITY = 0.95;
/** Bootstrap draws. */
export const BOOTSTRAP = 200;
/** The percentile taken as the lower bound of the lift. */
export const LOWER_PERCENTILE = 10;
/** Caps from §3.15.3, so one job cannot take the room for an afternoon. */
export const MAX_SELLER_ROWS = 20_000;
export const MAX_EVAL_ROWS = 5_000;

/** One labelled row. */
export interface Row {
  readonly text: string;
  readonly label: string;
}

/** The buyer's own data: what they train on and what they measure on. */
export interface EvalSet {
  readonly train: readonly Row[];
  readonly eval: readonly Row[];
}

/** Reads JSONL, refusing a row that is not `{text, label}` rather than skipping it. */
export function parseRows(jsonl: string, limit: number): Row[] {
  const rows: Row[] = [];
  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = JSON.parse(line) as Partial<Row>;
    if (typeof parsed.text !== "string" || typeof parsed.label !== "string") {
      throw new Error("dataset-lite: a row is not {text, label}");
    }
    if (parsed.text.trim() === "") throw new Error("dataset-lite: a row has no text");
    rows.push({ text: parsed.text, label: parsed.label });
    if (rows.length > limit) throw new Error(`dataset-lite: more than ${limit} rows`);
  }
  if (rows.length === 0) throw new Error("dataset-lite: there are no rows");
  return rows;
}

/** Step 1: the seller's rows must use the buyer's labels, and must not repeat themselves. */
export function checkIntegrity(seller: readonly Row[], labels: readonly string[]): Row[] {
  const allowed = new Set(labels);
  const seen = new Set<string>();
  const kept: Row[] = [];
  for (const row of seller) {
    if (!allowed.has(row.label)) {
      throw new Error(`dataset-lite: the label ${row.label} is not one the buyer uses`);
    }
    if (seen.has(row.text)) continue;
    seen.add(row.text);
    kept.push(row);
  }
  return kept;
}

function oneHot(rows: readonly Row[], labels: readonly string[]): Float64Array[] {
  return labels.map((label) =>
    Float64Array.from(rows, (row) => (row.label === label ? 1 : -1)),
  );
}

/** Trains a one-vs-rest probe and returns the share of `evalRows` it gets right, per row. */
function correctness(
  trainVectors: readonly Float32Array[],
  trainRows: readonly Row[],
  evalVectors: readonly Float32Array[],
  evalRows: readonly Row[],
  labels: readonly string[],
): number[] {
  const { gram, moments } = normalEquations(trainVectors, oneHot(trainRows, labels));
  // A Gram matrix is positive semi-definite and λ > 0, so `gram + λI` is positive definite and the
  // solve cannot fail here. `choleskySolve`'s own refusal is tested directly.
  const weights = choleskySolve(gram, moments) as Float64Array[];
  return evalVectors.map((vector, index) =>
    labels[predict(weights, vector)] === (evalRows[index] as Row).label ? 1 : 0,
  );
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export interface Lift {
  /** The 10th-percentile improvement in accuracy, in bps, floored at zero. */
  readonly lowerBps: number;
  /** The share of the seller's rows the buyer already had, in bps. */
  readonly overlapBps: number;
  readonly baselineBps: number;
  readonly augmentedBps: number;
  readonly kept: number;
}

/**
 * Measures the lift. `jobCommitment` seeds the bootstrap, so the interval is a property of the job
 * rather than of the run.
 */
export async function lift(
  embedder: Embedder,
  seller: readonly Row[],
  buyer: EvalSet,
  jobCommitment: Uint8Array,
): Promise<Lift> {
  // The buyer's label set is their whole dataset's, not just what they happen to have trained on:
  // a class they can measure but cannot yet predict is exactly what a seller might be able to fix.
  const labels = [
    ...new Set([...buyer.train, ...buyer.eval].map((row) => row.label)),
  ].sort();
  const kept = checkIntegrity(seller, labels);
  const [sellerVectors, trainVectors, evalVectors] = await Promise.all([
    embedder.embed(kept.map((row) => row.text)),
    embedder.embed(buyer.train.map((row) => row.text)),
    embedder.embed(buyer.eval.map((row) => row.text)),
  ]);

  // Step 2: overlap. A seller row close to anything the buyer trains on is not new data.
  const novel: number[] = [];
  for (const [index, vector] of sellerVectors.entries()) {
    const known = trainVectors.some((train) => similarity(vector, train) >= OVERLAP_SIMILARITY);
    if (!known) novel.push(index);
  }
  const overlapBps = Math.round(((kept.length - novel.length) / kept.length) * 10_000);

  // Steps 3 and 4: the same probe, trained with and without the seller's novel rows.
  const baseline = correctness(trainVectors, buyer.train, evalVectors, buyer.eval, labels);
  const augmentedRows = [...buyer.train, ...novel.map((index) => kept[index] as Row)];
  const augmented = correctness(
    [...trainVectors, ...novel.map((index) => sellerVectors[index] as Float32Array)],
    augmentedRows,
    evalVectors,
    buyer.eval,
    labels,
  );

  // Step 5: a bootstrap over the evaluation rows, and the 10th percentile of the difference.
  const draw = seededRandom(jobCommitment);
  const deltas: number[] = [];
  for (let round = 0; round < BOOTSTRAP; round += 1) {
    let sum = 0;
    for (let pick = 0; pick < baseline.length; pick += 1) {
      const index = Math.min(baseline.length - 1, Math.floor(draw() * baseline.length));
      sum += (augmented[index] as number) - (baseline[index] as number);
    }
    deltas.push(sum / baseline.length);
  }
  return {
    lowerBps: Math.max(0, Math.round(percentile(deltas, LOWER_PERCENTILE) * 10_000)),
    overlapBps,
    baselineBps: Math.round(mean(baseline) * 10_000),
    augmentedBps: Math.round(mean(augmented) * 10_000),
    kept: kept.length,
  };
}

/**
 * The appraiser. The good is the seller's JSONL; the context is the buyer's `EvalSet` as JSON.
 * `need` is not used: a dataset's value is what it adds to the buyer's own measurement, not what
 * they say they want.
 */
export function datasetLiteAppraiser(embedder: Embedder, jobCommitment: Uint8Array): Appraiser {
  return {
    id: "dataset-lite",
    version: 0,
    formulaId: "DatasetLiteV0",
    componentAlphabets: [COMPONENT_LEVELS, COMPONENT_LEVELS],
    async appraise(input: AppraisalInput): Promise<Appraisal> {
      const seller = parseRows(input.good, MAX_SELLER_ROWS);
      const parsed = JSON.parse(input.context) as Partial<EvalSet>;
      if (!Array.isArray(parsed.train) || !Array.isArray(parsed.eval)) {
        throw new Error("dataset-lite: the buyer's context is not a train and eval split");
      }
      if (parsed.eval.length > MAX_EVAL_ROWS) {
        throw new Error(`dataset-lite: more than ${MAX_EVAL_ROWS} evaluation rows`);
      }
      const measured = await lift(
        embedder,
        seller,
        { train: parsed.train, eval: parsed.eval },
        jobCommitment,
      );
      return {
        components: [
          quantise(measured.lowerBps, COMPONENT_LEVELS),
          quantise(measured.overlapBps, COMPONENT_LEVELS),
        ],
        factors: [],
        shown: [],
        datasheet: {
          rows: measured.kept,
          baseline_bps: measured.baselineBps,
          augmented_bps: measured.augmentedBps,
        },
      };
    },
  };
}
