import test from "node:test";
import assert from "node:assert/strict";

import { EMBED_DIMENSIONS, type Embedder } from "./embed.js";
import { KNOWN, MIN_CLAIM_WORDS, MIN_WEIGHT, UNSEEN, claimNovelty, claims, novelty } from "./novelty.js";

/**
 * An embedder that places each text on a named axis, so a test can say exactly how similar two
 * things are. The novelty arithmetic is worth testing without a 90 MB model in the way.
 */
function axes(placement: Record<string, readonly number[]>): Embedder {
  return {
    embed(texts: readonly string[]): Promise<Float32Array[]> {
      return Promise.resolve(
        texts.map((text) => {
          const coordinates = placement[text];
          if (coordinates === undefined) throw new Error(`no placement for ${JSON.stringify(text)}`);
          const vector = new Float32Array(EMBED_DIMENSIONS);
          coordinates.forEach((value, index) => {
            vector[index] = value;
          });
          return vector;
        }),
      );
    },
  };
}

test("claims are sentences of at least five words, without headings or list markers", () => {
  const text = [
    "# A heading that should not count at all",
    "- The first claim has quite enough words in it.",
    "2) The second claim also has enough words here.",
    "Too short.",
    "Another claim, split by a newline rather than a full stop",
    "Yes! And a third with an exclamation mark here.",
  ].join("\n");
  assert.deepEqual(claims(text), [
    "The first claim has quite enough words in it.",
    "The second claim also has enough words here.",
    "Another claim, split by a newline rather than a full stop",
    "And a third with an exclamation mark here.",
  ]);
  assert.deepEqual(claims(""), []);
  assert.deepEqual(claims("# only a heading"), []);
  assert.equal(MIN_CLAIM_WORDS, 5);
});

test("a claim's novelty is linear between the two thresholds", () => {
  assert.equal(claimNovelty(KNOWN), 0, "already known");
  assert.equal(claimNovelty(0.9), 0, "and more than known is still zero, not negative");
  assert.equal(claimNovelty(UNSEEN), 1, "entirely new");
  assert.equal(claimNovelty(0), 1);
  assert.equal(claimNovelty((KNOWN + UNSEEN) / 2).toFixed(6), (0.5).toFixed(6));
  assert.equal(KNOWN, 0.78, "τ_hi for MiniLM");
  assert.equal(UNSEEN, 0.45);
});

test("novelty is the need-weighted mean, and a document with nothing in it scores nothing", async () => {
  const good = "The first claim is about alpha and nothing else.\nThe second claim is about beta.";
  const [first, second] = claims(good);
  const embedder = axes({
    [first ?? ""]: [1, 0, 0],
    [second ?? ""]: [0, 1, 0],
    "alpha, which the buyer already knows all about.": [1, 0, 0],
    "I need to know about alpha.": [1, 0, 0],
  });

  // The buyer knows the first claim exactly and nothing of the second; the need is all alpha, so
  // the known claim carries the full weight and the new one carries the floor.
  const measured = await novelty(
    embedder,
    good,
    "alpha, which the buyer already knows all about.",
    "I need to know about alpha.",
  );
  assert.equal(measured.claims.length, 2);
  assert.equal(measured.claims[0]?.novelty, 0);
  assert.equal(measured.claims[1]?.novelty, 1);
  assert.equal(measured.claims[0]?.weight, 1);
  assert.equal(measured.claims[1]?.weight, MIN_WEIGHT);
  // 0·1 + 1·0.05 over 1.05.
  assert.equal(measured.bps, Math.round((MIN_WEIGHT / (1 + MIN_WEIGHT)) * 10_000));

  // AC-39: padding with fresh but irrelevant claims cannot push the score up much, because their
  // weight is the floor.
  assert.ok(measured.bps < 500, `padding bought only ${measured.bps} bps`);

  assert.deepEqual(await novelty(embedder, "", "", ""), { bps: 0, claims: [] });
});

test("with no context every claim is new, and with no need every claim weighs the same", async () => {
  const good = "A single claim with enough words in it.";
  const embedder = axes({ [good]: [1, 0, 0] });
  const nothingKnown = await novelty(embedder, good, "", "");
  assert.equal(nothingKnown.bps, 10_000);
  assert.equal(nothingKnown.claims[0]?.weight, 1, "no need means no weighting");
  assert.equal(nothingKnown.claims[0]?.maxSimilarity, 0);
});
