import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { KeyPair, type KeyPairString } from "near-api-js";

import { DEFAULT_GAS, nearRelay, rpcProvider } from "./near.js";

/**
 * A JSON-RPC node, as far as near-api-js needs one: an access key with a nonce, a block hash to
 * build on, and an outcome for the transaction it sends. It is enough to exercise the real client
 * — the signing, the action encoding, the gas and the deposit — without a sandbox.
 */
async function node(outcome: unknown): Promise<{ url: string; seen: { method: string; params: unknown }[]; close: () => Promise<void> }> {
  const seen: { method: string; params: unknown }[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const call = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        id: string;
        method: string;
        params: Record<string, unknown>;
      };
      seen.push({ method: call.method, params: call.params });
      const answer = (result: unknown): void => {
        const body = JSON.stringify({ jsonrpc: "2.0", id: call.id, result });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(body);
      };
      if (call.method === "query" && call.params.request_type === "view_access_key") {
        answer({ nonce: 7, permission: "FullAccess", block_height: 1, block_hash: "11111111111111111111111111111111" });
        return;
      }
      if (call.method === "query") {
        // A view call: the contract's JSON answer, as bytes.
        answer({ result: [...Buffer.from('"viewed"', "utf8")], logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" });
        return;
      }
      if (call.method === "block") {
        answer({ header: { hash: "11111111111111111111111111111111", height: 1 } });
        return;
      }
      answer(outcome);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const KEY = KeyPair.fromRandom("ed25519").toString() as KeyPairString;

test("the relay views and calls through a real node client", async () => {
  const value = Buffer.from('{"ok":true}', "utf8").toString("base64");
  const n = await node({
    final_execution_status: "FINAL",
    status: { SuccessValue: value },
    transaction: {},
    transaction_outcome: { id: "t", outcome: { logs: [], receipt_ids: [], gas_burnt: 1, tokens_burnt: "0", executor_id: "a", status: { SuccessValue: value } } },
    receipts_outcome: [],
  });
  try {
    const relay = nearRelay(n.url, "agent.testnet", KEY);
    assert.equal(await relay.view("clearing.testnet", "config", {}), "viewed");

    const answered = await relay.call(
      "clearing.testnet",
      "submit_verdict",
      { verdict: "aa" },
      DEFAULT_GAS,
      0n,
    );
    assert.deepEqual(answered, { ok: true }, "the transaction's value comes back parsed");

    // It really went through a signed transaction, not a view.
    const sent = n.seen.filter((call) => call.method !== "query" && call.method !== "block");
    assert.equal(sent.length, 1);
    assert.match(String((sent[0]?.params as { signed_tx_base64?: string }).signed_tx_base64 ?? ""), /.+/);
  } finally {
    await n.close();
  }
});

test("a transaction that returns nothing is not reported as a value", async () => {
  const n = await node({
    final_execution_status: "FINAL",
    status: { SuccessValue: "" },
    transaction: {},
    transaction_outcome: { id: "t", outcome: { logs: [], receipt_ids: [], gas_burnt: 1, tokens_burnt: "0", executor_id: "a", status: { SuccessValue: "" } } },
    receipts_outcome: [],
  });
  try {
    const relay = nearRelay(n.url, "agent.testnet", KEY);
    assert.equal(await relay.call("clearing.testnet", "submit_delivery_receipt", {}, DEFAULT_GAS, 0n), null);
  } finally {
    await n.close();
  }
});

test("with several endpoints the relay moves on from one that refuses", async () => {
  // A public RPC that has had enough: every request is answered 429.
  const refused: string[] = [];
  const limited: Server = createServer((request, response) => {
    refused.push(request.method ?? "");
    request.resume();
    response.writeHead(429, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "rate limit" }));
  });
  await new Promise<void>((resolve) => limited.listen(0, "127.0.0.1", resolve));
  const address = limited.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  const value = Buffer.from('{"ok":true}', "utf8").toString("base64");
  const n = await node({
    final_execution_status: "FINAL",
    status: { SuccessValue: value },
    transaction: {},
    transaction_outcome: { id: "t", outcome: { logs: [], receipt_ids: [], gas_burnt: 1, tokens_burnt: "0", executor_id: "a", status: { SuccessValue: value } } },
    receipts_outcome: [],
  });
  try {
    // Spaces and an empty entry are forgiven: this is a variable people type by hand.
    const relay = nearRelay(`http://127.0.0.1:${port} , ,${n.url}`, "agent.testnet", KEY);
    assert.equal(await relay.view("clearing.testnet", "config", {}), "viewed");
    assert.deepEqual(await relay.call("clearing.testnet", "submit_verdict", { verdict: "aa" }, DEFAULT_GAS, 0n), { ok: true });
    assert.ok(refused.length > 0, "the first endpoint was asked, and refused");
    assert.ok(n.seen.some((call) => call.method === "query"), "and the second answered");
  } finally {
    await n.close();
    await new Promise<void>((resolve) => limited.close(() => resolve()));
  }

  assert.throws(() => rpcProvider(" , "), /MARGINAL_RPC_URL names no endpoint/);
});
