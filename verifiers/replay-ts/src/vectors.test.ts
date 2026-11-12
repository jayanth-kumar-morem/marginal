import { test } from "node:test";
import assert from "node:assert/strict";
import { reproduceVectors } from "@marginal/core-wasm";

// E2.4: this package runs marginal-core's own code as wasm, and gets the recorded answers byte for byte.
test("reproduces fixtures/vectors.json", () => {
  assert.deepEqual(reproduceVectors(), []);
});
