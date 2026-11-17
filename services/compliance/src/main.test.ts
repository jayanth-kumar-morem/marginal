import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "node:http";

import { main } from "./main.js";

/** A local stand-in for an RPC node: it answers every request with one block height. */
async function rpcAt(height: unknown): Promise<{ url: string; close: () => Promise<void> }> {
  const node = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ result: { header: { height } } }));
  });
  await new Promise<void>((resolve) => node.listen(0, "127.0.0.1", resolve));
  const address = node.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => node.close(() => resolve())) };
}

const env = {
  MARGINAL_CHAIN_ID: "sandbox",
  MARGINAL_CLEARING: "clearing.testnet",
  MARGINAL_ISSUER_SEED: "01".repeat(32),
  MARGINAL_COMPLIANCE_SEED: "02".repeat(32),
  MARGINAL_ALLOWED_IDENTITIES: "buyer.testnet,agent.testnet",
  // A closed port: every test that gets as far as reading the chain names its own stand-in.
  MARGINAL_RPC_URL: "http://127.0.0.1:9",
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

  const rpc = await rpcAt(278_000_000);
  const lines: string[] = [];
  const service = await main(
    { ...env, MARGINAL_RPC_URL: rpc.url, MARGINAL_SDN_URL: `http://127.0.0.1:${port}/sdn.csv` },
    (line) => lines.push(line),
  );
  try {
    const health = await fetch(`http://127.0.0.1:${service.port}/v1/health`);
    const body = (await health.json()) as { label: string; list_entries: number };
    assert.equal(body.label, "demo");
    assert.equal(body.list_entries, 1, "it read the list before it listened");
    assert.match(lines[0] ?? "", /^compliance on \d+, list 1 addresses, chain at 278000000$/);
    assert.equal(lines.join("\n").includes("01".repeat(32)), false, "never a seed");

    // What it signs expires an hour of blocks after the chain's height, not after zero: clearing
    // refuses an approval the chain has already passed, which on testnet was every one of them.
    const approved = await fetch(`http://127.0.0.1:${service.port}/v1/payout-approvals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "seller.testnet", route_hash: "ab".repeat(32), address: "1Clean" }),
    });
    const { approval } = (await approved.json()) as { approval: { expiry_height: number } };
    assert.equal(approval.expiry_height, 278_000_000 + 3_600);
  } finally {
    service.stop();
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
  }

  // Without a list it refuses to start: an approval needs one, and "nothing read" must not read as
  // "nothing listed".
  await assert.rejects(
    // A closed port, not `port + 1`: the next port up may be the stand-in RPC's.
    () => main({ ...env, MARGINAL_RPC_URL: rpc.url, MARGINAL_SDN_URL: "http://127.0.0.1:9/none" }, () => {}),
    /./,
  );
  await rpc.close();

  // And without the chain's height it refuses to start too, for the same reason.
  const silent = await rpcAt(null);
  try {
    await assert.rejects(
      () => main({ ...env, MARGINAL_RPC_URL: silent.url, MARGINAL_SDN_URL: `http://127.0.0.1:${port}/sdn.csv` }, () => {}),
      /returned no block height/,
    );
  } finally {
    await silent.close();
    await new Promise<void>((resolve) => sdn.close(() => resolve()));
  }
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
  const rpc = await rpcAt(1_000);
  const service = await main({ ...rest, MARGINAL_RPC_URL: rpc.url, MARGINAL_SDN_URL: `http://127.0.0.1:${port}/sdn.csv` }, () => {});
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
    await rpc.close();
  }
});

test("a malformed seed stops it before it listens", async () => {
  await assert.rejects(
    () => main({ ...env, MARGINAL_ISSUER_SEED: "short" }, () => {}),
    /MARGINAL_ISSUER_SEED must be 32 bytes of hex/,
  );
  for (const missing of ["MARGINAL_CHAIN_ID", "MARGINAL_CLEARING", "MARGINAL_COMPLIANCE_SEED", "MARGINAL_RPC_URL"]) {
    await assert.rejects(() => main({ ...env, [missing]: "" }, () => {}), new RegExp(`${missing}`), missing);
  }
});
