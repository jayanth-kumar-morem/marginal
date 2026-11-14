import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "node:http";

import { main } from "./main.js";

const env = {
  MARGINAL_CHAIN_ID: "sandbox",
  MARGINAL_CLEARING: "clearing.testnet",
  MARGINAL_ISSUER_SEED: "01".repeat(32),
  MARGINAL_COMPLIANCE_SEED: "02".repeat(32),
  MARGINAL_ALLOWED_IDENTITIES: "buyer.testnet,agent.testnet",
  PORT: "0",
};

test("the compliance service starts, reads the list, and logs neither seed", async () => {
  // A local stand-in for Treasury's file: a test must never fetch 10 MB from the real one.
  const sdn = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/csv" });
    response.end('1,"X","-0- ","Digital Currency Address - XBT 1Listed"');
  });
  await new Promise<void>((resolve) => sdn.listen(0, "127.0.0.1", resolve));
  const address = sdn.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  const lines: string[] = [];
  const service = await main(
    { ...env, MARGINAL_SDN_URL: `http://127.0.0.1:${port}/sdn.csv` },
    (line) => lines.push(line),
  );
  try {
    const health = await fetch(`http://127.0.0.1:${service.port}/v1/health`);
    const body = (await health.json()) as { label: string; list_entries: number };
    assert.equal(body.label, "demo");
    assert.equal(body.list_entries, 1, "it read the list before it listened");
    assert.match(lines[0] ?? "", /^compliance on \d+, list 1 addresses$/);
    assert.equal(lines.join("\n").includes("01".repeat(32)), false, "never a seed");
  } finally {
    service.stop();
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
    await new Promise<void>((resolve) => sdn.close(() => resolve()));
  }

  // Without a list it refuses to start: an approval needs one, and "nothing read" must not read as
  // "nothing listed".
  await assert.rejects(
    () => main({ ...env, MARGINAL_SDN_URL: `http://127.0.0.1:${port + 1}/none` }, () => {}),
    /./,
  );
});

test("with no allow-list nobody is issued a credential", async () => {
  const sdn = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/csv" });
    response.end('1,"X","-0- ","Digital Currency Address - XBT 1Listed"');
  });
  await new Promise<void>((resolve) => sdn.listen(0, "127.0.0.1", resolve));
  const address = sdn.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const rest = { ...env };
  delete (rest as Record<string, string | undefined>).MARGINAL_ALLOWED_IDENTITIES;
  const service = await main({ ...rest, MARGINAL_SDN_URL: `http://127.0.0.1:${port}/sdn.csv` }, () => {});
  try {
    const reply = await fetch(`http://127.0.0.1:${service.port}/v1/nullifiers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "buyer.testnet", listing_id: 1, epoch: 1 }),
    });
    assert.equal(reply.status, 403);
  } finally {
    service.stop();
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
    await new Promise<void>((resolve) => sdn.close(() => resolve()));
  }
});

test("a malformed seed stops it before it listens", async () => {
  await assert.rejects(
    () => main({ ...env, MARGINAL_ISSUER_SEED: "short" }, () => {}),
    /MARGINAL_ISSUER_SEED must be 32 bytes of hex/,
  );
  for (const missing of ["MARGINAL_CHAIN_ID", "MARGINAL_CLEARING", "MARGINAL_COMPLIANCE_SEED"]) {
    await assert.rejects(() => main({ ...env, [missing]: "" }, () => {}), new RegExp(`${missing}`), missing);
  }
});
