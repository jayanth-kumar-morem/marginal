import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKAGE } from "./index.js";

test("package identity", () => {
  assert.equal(PACKAGE, "@marginal/web");
});
