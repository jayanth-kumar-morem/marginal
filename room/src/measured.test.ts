import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MODEL_DIR } from "./appraisers/knowledge/embed.js";
import { readVerified } from "./measured.js";

test("a file that is not the one the image was measured with is refused", () => {
  const dir = `${mkdtempSync(join(tmpdir(), "marginal-measured-"))}/`;
  mkdirSync(`${dir}onnx`);
  copyFileSync(`${MODEL_DIR}SHA256SUMS`, `${dir}SHA256SUMS`);
  copyFileSync(`${MODEL_DIR}config.json`, `${dir}config.json`);
  assert.deepEqual(readVerified(dir, "config.json"), readFileSync(`${MODEL_DIR}config.json`));

  writeFileSync(`${dir}config.json`, "{}");
  assert.throws(() => readVerified(dir, "config.json"), /config\.json is [0-9a-f]{64}, not/);
  assert.throws(() => readVerified(dir, "nothing.json"), /nothing\.json is not in SHA256SUMS/);
});
