import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "./main.js";

test("the gateway starts from the environment and serves", async () => {
  const lines: string[] = [];
  const directory = mkdtempSync(join(tmpdir(), "marginal-blobs-"));
  const started = await main(
    { MARGINAL_BLOB_DIR: directory, PORT: "0", MARGINAL_UPLOAD_SECRET: "ab".repeat(32) },
    (line) => lines.push(line),
  );
  try {
    const health = await fetch(`http://127.0.0.1:${started.port}/v1/health`);
    assert.deepEqual(await health.json(), { ok: true, package: "@marginal/gateway" });
    assert.match(lines[0] ?? "", /^gateway on \d+/);
    assert.equal(lines[0]?.includes("ab".repeat(32)), false, "and never the secret");
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }

  // Without a secret it generates one, which only costs grants in flight across a restart.
  const generated = await main({ MARGINAL_BLOB_DIR: directory, PORT: "0" }, () => {});
  await new Promise<void>((resolve) => generated.server.close(() => resolve()));

  await assert.rejects(() => main({ PORT: "0" }, () => {}), /MARGINAL_BLOB_DIR is required/);
  await assert.rejects(() => main({ MARGINAL_BLOB_DIR: " ", PORT: "0" }, () => {}), /required/);
});
