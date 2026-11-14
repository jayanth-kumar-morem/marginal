import test from "node:test";
import assert from "node:assert/strict";

import { base64, blockHeight, chainClient, errorCode, type Fetch } from "./chain";

/** An RPC that records what it was asked and answers with `reply`. */
function fakeRpc(reply: unknown, status = 200): { fetch: Fetch; seen: unknown[] } {
  const seen: unknown[] = [];
  const fetch = ((url: string, init?: { body?: string }) => {
    seen.push({ url, body: JSON.parse(init?.body ?? "{}") });
    return Promise.resolve({
      ok: status === 200,
      status,
      json: () => Promise.resolve(reply),
    } as Response);
  }) as unknown as Fetch;
  return { fetch, seen };
}

/** What the RPC wraps a view's JSON in: the bytes of the answer. */
function bytes(value: unknown): { result: { result: number[] } } {
  return { result: { result: [...new TextEncoder().encode(JSON.stringify(value))] } };
}

test("a view call is a call_function query at final finality, with base64 args", async () => {
  const rpc = fakeRpc(bytes({ id: 3, status: "Active" }));
  const chain = chainClient("https://rpc.example/", rpc.fetch);
  const listing = await chain.view<{ id: number }>("clearing.testnet", "get_listing", {
    listing_id: "3",
  });

  assert.deepEqual(listing, { id: 3, status: "Active" });
  const [call] = rpc.seen as [{ url: string; body: { params: Record<string, string> } }];
  assert.equal(call.url, "https://rpc.example/");
  assert.equal(call.body.params.request_type, "call_function");
  assert.equal(call.body.params.finality, "final");
  assert.equal(call.body.params.account_id, "clearing.testnet");
  assert.equal(call.body.params.method_name, "get_listing");
  assert.equal(call.body.params.args_base64, base64('{"listing_id":"3"}'));
});

test("a view with no arguments still sends an empty object", async () => {
  const rpc = fakeRpc(bytes({ chain_id: "testnet" }));
  await chainClient("https://rpc.example/", rpc.fetch).view("clearing.testnet", "config");
  const [call] = rpc.seen as [{ body: { params: { args_base64: string } } }];
  assert.equal(call.body.params.args_base64, base64("{}"));
});

test("base64 is the same as Buffer's, including beyond ASCII", () => {
  assert.equal(base64('{"a":1}'), Buffer.from('{"a":1}').toString("base64"));
  assert.equal(base64("naïve ∑"), Buffer.from("naïve ∑").toString("base64"));
});

test("every way a view can fail throws with what the chain said", async () => {
  const chain = (reply: unknown, status = 200) =>
    chainClient("https://rpc.example/", fakeRpc(reply, status).fetch);

  await assert.rejects(
    () => chain({}, 503).view("clearing.testnet", "config"),
    /config: the RPC answered 503/,
  );
  await assert.rejects(
    () => chain({ error: { message: "account does not exist" } }).view("c", "config"),
    /config: account does not exist/,
  );
  await assert.rejects(
    () => chain({ error: {} }).view("c", "config"),
    /config: the RPC refused the query/,
  );
  // A contract panic comes back inside the result, not as an RPC error.
  await assert.rejects(
    () => chain({ result: { error: "wasm execution failed: E_BUDGET_EXHAUSTED" } }).view("c", "x"),
    /E_BUDGET_EXHAUSTED/,
  );
  await assert.rejects(
    () => chain({ result: {} }).view("c", "config"),
    /config: the RPC returned no result/,
  );
});

test("a refusal is reduced to the contract's own code when it has one", () => {
  assert.equal(
    errorCode(new Error("x: wasm execution failed: Smart contract panicked: E_NULLIFIER_USED")),
    "E_NULLIFIER_USED",
  );
  assert.equal(errorCode(new Error("the RPC answered 503")), "the RPC answered 503");
  assert.equal(errorCode("a string, not an Error"), "a string, not an Error");
});

test("the block height comes from the final block, and a reply without one is refused", async () => {
  const good = fakeRpc({ result: { header: { height: 1_234 } } });
  assert.equal(await blockHeight("https://rpc.example/", good.fetch), 1_234);
  const [call] = good.seen as [{ body: { method: string; params: { finality: string } } }];
  assert.equal(call.body.method, "block");
  assert.equal(call.body.params.finality, "final");

  const bad = fakeRpc({ result: {} });
  await assert.rejects(
    () => blockHeight("https://rpc.example/", bad.fetch),
    /no block height/,
  );
});
