import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { EMBED_DIMENSIONS, asFloats, embedder, meanPool, similarity } from "./embed.js";
import { knowledgeAppraiser, N_PUB_WITHOUT_CORPUS } from "./index.js";
import { novelty } from "./novelty.js";

const vectors = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../fixtures/minilm-vectors.json", import.meta.url)), "utf8"),
) as { cases: { text: string; embedding: number[] }[] };

/** One session for the file: loading 90 MB of weights per test would be the whole runtime. */
const loaded = embedder();

/**
 * The reference implementation's own vectors. This is what says the room measures the same thing
 * `@huggingface/transformers` does, with a tokenizer and a runtime of its own.
 */
test("every fixture's embedding is the reference implementation's", async () => {
  const model = await loaded;
  for (const vector of vectors.cases) {
    const [mine] = await model.embed([vector.text]);
    assert.ok(mine, vector.text);
    assert.equal(mine.length, EMBED_DIMENSIONS);
    const cosine = similarity(mine, Float32Array.from(vector.embedding));
    assert.ok(cosine > 0.99999, `cosine ${cosine} for ${JSON.stringify(vector.text.slice(0, 40))}`);
    // And it really is a unit vector, which is what makes a dot product a cosine.
    assert.ok(Math.abs(similarity(mine, mine) - 1) < 1e-5);
  }
});

test("the same text gives the same bytes twice (AC-38)", async () => {
  const model = await loaded;
  const text = "Determinism is the whole point of a signed measurement.";
  const [first] = await model.embed([text]);
  const [second] = await model.embed([text]);
  assert.deepEqual(second, first);
  // And a batch is the same as one at a time: nothing depends on the shape of the call.
  const [a, b] = await model.embed([text, "Something else entirely, for contrast."]);
  assert.deepEqual(a, first);
  assert.ok(b);
  assert.ok(similarity(a as Float32Array, b) < 0.9, "two different sentences are not the same point");
});

/**
 * E8.6's **Done:** line, on two documents rather than the demo corpus (E14.2 brings that): the
 * buyer's own notes are about one of them, so it is worth little, and the other is new.
 */
test("a document the buyer already has scores far below one they do not", async () => {
  const model = await loaded;
  const context = [
    "Japanese small-cap exposure rose through the third quarter of the year.",
    "The fund added to its position in regional banks during October.",
    "Currency hedging was reduced after the yen stabilised in September.",
  ].join("\n");
  const need = "I need to know how the fund's Japanese small-cap exposure changed.";

  const known = [
    "Japanese small-cap exposure rose over the third quarter of the year.",
    "The fund increased its holding in regional banks through October.",
    "Hedging on the currency was cut once the yen steadied in September.",
  ].join("\n");
  const fresh = [
    "The fund has quietly begun unwinding its position in Brazilian utilities.",
    "A second share class launches in March with a lower management fee.",
    "The portfolio manager is leaving at the end of the first quarter.",
  ].join("\n");

  const alreadyHas = await novelty(model, known, context, need);
  const doesNot = await novelty(model, fresh, context, need);
  assert.ok(
    alreadyHas.bps < doesNot.bps,
    `known ${alreadyHas.bps} bps should be under fresh ${doesNot.bps} bps`,
  );
  assert.ok(alreadyHas.bps < 3_000, `the buyer's own notes back scored ${alreadyHas.bps} bps`);
  assert.ok(doesNot.bps > 6_000, `news to the buyer scored ${doesNot.bps} bps`);

  // And the appraiser publishes those as quantised components, with counts but no values.
  const appraised = await knowledgeAppraiser(model).appraise({ good: fresh, context, need, requestId: "job-1" });
  assert.equal(appraised.components.length, 2);
  assert.equal(appraised.components[0] ?? -1, Math.round(doesNot.bps / 500) * 500);
  assert.equal(appraised.components[1], N_PUB_WITHOUT_CORPUS);
  assert.deepEqual(appraised.factors, [], "no judge ran, so nothing is taken off");
  assert.deepEqual(appraised.shown, []);
  assert.equal(appraised.datasheet.claims, 3);
  assert.equal(JSON.stringify(appraised).includes("Brazilian"), false, "no text in the output");
});

test("pooling and comparing refuse a tensor that is not the shape the model declares", () => {
  const hidden = new Float32Array(EMBED_DIMENSIONS * 2).fill(1);
  // Two tokens of ones, pooled and scaled: every unit is the same, and the vector is unit length.
  const pooled = meanPool(hidden, [1, 1]);
  assert.equal(pooled.length, EMBED_DIMENSIONS);
  assert.ok(Math.abs(similarity(pooled, pooled) - 1) < 1e-6);
  // A masked token is not pooled, so a mask of one token over two tokens' worth of output is fine.
  assert.deepEqual(meanPool(hidden, [1, 0]), meanPool(hidden.subarray(0, EMBED_DIMENSIONS), [1]));

  assert.throws(() => meanPool(hidden, [0, 0]), /covers no token/);
  assert.throws(() => meanPool(hidden, [1, 1, 1]), /shorter than the mask/);
  assert.throws(() => similarity(pooled, new Float32Array(8)), /different widths/);
  assert.throws(() => asFloats(new Int32Array(4)), /did not return a float tensor/);
  assert.throws(() => asFloats(undefined), /did not return a float tensor/);
  assert.equal(asFloats(pooled), pooled);
});
