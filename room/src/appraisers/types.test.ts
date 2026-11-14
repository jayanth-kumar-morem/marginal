import test from "node:test";
import assert from "node:assert/strict";

import { quantise } from "./types.js";

test("quantising puts a measurement on its alphabet, and only there", () => {
  // 21 levels means 5% steps: 0, 500, 1000, … 10000.
  for (const [bps, expected] of [
    [0, 0],
    [1, 0],
    [249, 0],
    [250, 500],
    [7_777, 8_000],
    [9_999, 10_000],
    [10_000, 10_000],
  ] as const) {
    assert.equal(quantise(bps, 21), expected, String(bps));
  }
  for (const bps of [0, 137, 4_321, 10_000]) {
    assert.equal(quantise(bps, 21) % 500, 0, String(bps));
  }
  // Out of range is clamped, not wrapped: a component is never above a whole (core would refuse).
  assert.equal(quantise(-5, 21), 0);
  assert.equal(quantise(20_000, 21), 10_000);
  // Two levels is a bit; eleven is the shown-field alphabet.
  assert.deepEqual([quantise(4_000, 2), quantise(6_000, 2)], [0, 10_000]);
  assert.equal(quantise(4_500, 11) % 1_000, 0);
  assert.throws(() => quantise(0, 1), /at least two levels/);
});
