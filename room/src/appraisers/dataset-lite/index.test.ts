import test from "node:test";
import assert from "node:assert/strict";

import { EMBED_DIMENSIONS, type Embedder } from "../knowledge/embed.js";
import {
  BOOTSTRAP,
  MAX_EVAL_ROWS,
  MAX_SELLER_ROWS,
  OVERLAP_SIMILARITY,
  checkIntegrity,
  datasetLiteAppraiser,
  lift,
  parseRows,
  type Row,
} from "./index.js";
import { choleskySolve, normalEquations, percentile, predict, seededRandom } from "./linear.js";

const JOB = new Uint8Array(32).fill(3);

/**
 * An embedder that reads the text as its own coordinates (`"1,0,0"`), so a test can place rows
 * exactly and say what the probe should learn. The real embedder is tested in `knowledge/`.
 */
const coordinates: Embedder = {
  embed(texts: readonly string[]): Promise<Float32Array[]> {
    return Promise.resolve(
      texts.map((text) => {
        const vector = new Float32Array(EMBED_DIMENSIONS);
        text
          .split("|")[0]
          ?.split(",")
          .forEach((value, index) => {
            vector[index] = Number(value);
          });
        return vector;
      }),
    );
  },
};

const row = (text: string, label: string): Row => ({ text, label });

test("rows are JSONL of {text, label}, and anything else is refused", () => {
  assert.deepEqual(parseRows('{"text":"a","label":"x"}\n\n{"text":"b","label":"y"}\n', 10), [
    row("a", "x"),
    row("b", "y"),
  ]);
  for (const bad of ['{"text":"a"}', '{"label":"x"}', '{"text":1,"label":"x"}', '{"text":" ","label":"x"}']) {
    assert.throws(() => parseRows(bad, 10), /is not \{text, label\}|has no text/, bad);
  }
  assert.throws(() => parseRows("", 10), /there are no rows/);
  assert.throws(() => parseRows('{"text":"a","label":"x"}\n'.repeat(3), 2), /more than 2 rows/);
  assert.equal(MAX_SELLER_ROWS, 20_000);
  assert.equal(MAX_EVAL_ROWS, 5_000);
});

test("integrity: the buyer's labels only, and no row twice", () => {
  const kept = checkIntegrity([row("a", "x"), row("a", "x"), row("b", "y")], ["x", "y"]);
  assert.deepEqual(kept, [row("a", "x"), row("b", "y")], "the repeat is dropped");
  assert.throws(() => checkIntegrity([row("a", "z")], ["x", "y"]), /label z is not one the buyer uses/);
});

test("a probe trained on separable rows learns them, and a degenerate fit is refused", () => {
  const rows = [Float32Array.from([1, 0]), Float32Array.from([0, 1])];
  const targets = [Float64Array.from([1, -1]), Float64Array.from([-1, 1])];
  const { gram, moments } = normalEquations(rows, targets);
  const weights = choleskySolve(gram, moments);
  assert.ok(weights);
  assert.equal(predict(weights, Float32Array.from([1, 0])), 0);
  assert.equal(predict(weights, Float32Array.from([0, 1])), 1);
  // λ makes the system solvable even with one row, so only a non-positive-definite matrix fails.
  assert.equal(choleskySolve([Float64Array.from([-4])], [Float64Array.from([1])], 1), undefined);
  assert.throws(() => normalEquations([], []), /no rows to fit/);
});

test("the bootstrap is seeded by the job, so two rooms get the same interval", () => {
  const first = seededRandom(JOB);
  const second = seededRandom(JOB);
  const a = Array.from({ length: 5 }, () => first());
  assert.deepEqual(Array.from({ length: 5 }, () => second()), a);
  assert.notDeepEqual(
    Array.from({ length: 5 }, seededRandom(new Uint8Array(32).fill(4))),
    a,
  );
  for (const value of a) assert.ok(value >= 0 && value < 1, String(value));
  assert.throws(() => seededRandom(new Uint8Array(32)), /bootstrap seed is zero/);
  assert.equal(percentile([1, 2, 3, 4, 5], 10), 1);
  assert.equal(percentile([5, 4, 3, 2, 1], 50), 3);
  assert.equal(percentile([1], 90), 1);
  assert.equal(BOOTSTRAP, 200);
});

test("rows the buyer already has count as overlap, not as lift", async () => {
  const buyer = {
    train: [row("1,0,0", "x"), row("0,1,0", "y")],
    eval: [row("1,0,0", "x"), row("0,1,0", "y")],
  };
  // Both seller rows are the buyer's own training rows: nothing new, and no lift.
  const same = await lift(coordinates, [row("1,0,0", "x"), row("0,1,0", "y")], buyer, JOB);
  assert.equal(same.overlapBps, 10_000, "entirely overlapping");
  assert.equal(same.lowerBps, 0, "and worth nothing");
  assert.equal(same.kept, 2);
  assert.equal(OVERLAP_SIMILARITY, 0.95);

  // A seller row on an axis the buyer has never trained on is novel.
  const novel = await lift(coordinates, [row("0,0,1", "x")], buyer, JOB);
  assert.equal(novel.overlapBps, 0);
});

test("a dataset that teaches the buyer's eval set shows lift, and the appraiser quantises it", async () => {
  // The buyer can only tell x from y; the eval set is half z, which they always get wrong.
  const buyer = {
    train: [row("1,0,0", "x"), row("0,1,0", "y")],
    eval: [row("1,0,0", "x"), row("0,0,1", "z"), row("0,0,1|b", "z"), row("0,1,0", "y")],
  };
  const seller = [row("0,0,1|s1", "z"), row("0,0,1|s2", "z")];
  const measured = await lift(coordinates, seller, buyer, JOB);
  assert.ok(measured.augmentedBps > measured.baselineBps, `${measured.baselineBps} -> ${measured.augmentedBps}`);
  assert.ok(measured.lowerBps > 0, `the lower bound is ${measured.lowerBps} bps`);

  const appraiser = datasetLiteAppraiser(coordinates, JOB);
  assert.equal(appraiser.id, "dataset-lite");
  assert.equal(appraiser.formulaId, "DatasetLiteV0");
  const input = {
    good: seller.map((r) => JSON.stringify(r)).join("\n"),
    context: JSON.stringify(buyer),
    need: "ignored",
    requestId: "job-1",
  };
  const appraised = await appraiser.appraise(input);
  assert.equal(appraised.components.length, 2);
  for (const component of appraised.components) assert.equal(component % 500, 0);
  assert.deepEqual(appraised.shown, []);
  assert.equal(appraised.datasheet.rows, 2);
  // The same job measured twice gives the same answer, bootstrap and all (AC-38).
  assert.deepEqual(
    await datasetLiteAppraiser(coordinates, JOB).appraise(input),
    appraised,
  );
});

test("a context that is not a train and eval split is refused", async () => {
  const appraiser = datasetLiteAppraiser(coordinates, JOB);
  const good = JSON.stringify(row("1,0,0", "x"));
  await assert.rejects(
    () => appraiser.appraise({ good, context: JSON.stringify({ train: [] }), need: "", requestId: "j" }),
    /not a train and eval split/,
  );
  await assert.rejects(
    () =>
      appraiser.appraise({
        good,
        context: JSON.stringify({
          train: [row("1,0,0", "x")],
          eval: Array.from({ length: MAX_EVAL_ROWS + 1 }, () => row("1,0,0", "x")),
        }),
        need: "",
        requestId: "j",
      }),
    /more than 5000 evaluation rows/,
  );
});
