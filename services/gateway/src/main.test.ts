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
    // Without an RPC and a clearing account there is nothing to replay against, and it says so
    // rather than answering a replay with a guess.
    assert.match(lines[0] ?? "", /replay not configured/);
    const refused = await fetch(`http://127.0.0.1:${started.port}/v1/replay/1`);
    assert.equal(refused.status, 503);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }

  // Without a secret it generates one, which only costs grants in flight across a restart.
  const generated = await main({ MARGINAL_BLOB_DIR: directory, PORT: "0" }, () => {});
  await new Promise<void>((resolve) => generated.server.close(() => resolve()));

  // Told where the chain is, it serves the real verifier (E12.2) — here against an RPC that is
  // not there, which the report has to say rather than crash on.
  const configured = await main(
    {
      MARGINAL_BLOB_DIR: directory,
      PORT: "0",
      MARGINAL_RPC_URL: "http://127.0.0.1:1",
      MARGINAL_CLEARING: "clearing.sandbox",
    },
    (line) => lines.push(line),
  );
  try {
    assert.match(lines[1] ?? "", /replay against clearing\.sandbox/);
    const answer = await fetch(`http://127.0.0.1:${configured.port}/v1/replay/1`);
    assert.equal(answer.status, 500, "an unreachable chain is an error, not an OK report");
  } finally {
    await new Promise<void>((resolve) => configured.server.close(() => resolve()));
  }

  await assert.rejects(() => main({ PORT: "0" }, () => {}), /MARGINAL_BLOB_DIR is required/);
  await assert.rejects(() => main({ MARGINAL_BLOB_DIR: " ", PORT: "0" }, () => {}), /required/);
});
