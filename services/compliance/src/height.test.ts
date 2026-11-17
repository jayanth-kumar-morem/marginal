import test from "node:test";
import assert from "node:assert/strict";

import { chainHeight } from "./height.js";

/** An RPC that answers `block` with whatever the test says the height is. */
function rpc(answers: unknown[]): { fetchImpl: typeof globalThis.fetch; asked: unknown[] } {
  const asked: unknown[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    asked.push(JSON.parse(String(init?.body)));
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next));
  }) as typeof globalThis.fetch;
  return { fetchImpl, asked };
}

const block = (height: unknown): unknown => ({ result: { header: { height } } });

test("the height is the final block's, and it never goes backwards", async () => {
  const { fetchImpl, asked } = rpc([block(278_000_000), block(277_999_990), block(278_000_050)]);
  const chain = chainHeight("http://rpc.test", { fetchImpl });
  try {
    assert.equal(chain.height(), 0, "nothing read yet");
    assert.equal(await chain.refresh(), 278_000_000);
    assert.deepEqual(asked[0], { jsonrpc: "2.0", id: "compliance", method: "block", params: { finality: "final" } });
    // An RPC that is behind does not shorten the next expiry.
    assert.equal(await chain.refresh(), 278_000_000);
    assert.equal(await chain.refresh(), 278_000_050);
    assert.equal(chain.height(), 278_000_050);
  } finally {
    chain.stop();
  }
});

test("an answer with no usable height is an error, and the last good height is kept", async () => {
  for (const bad of [{}, { result: {} }, block("7"), block(1.5), block(0), { error: { message: "busy" } }]) {
    const { fetchImpl } = rpc([block(9), bad]);
    const chain = chainHeight("http://rpc.test", { fetchImpl });
    try {
      await chain.refresh();
      await assert.rejects(() => chain.refresh(), /the RPC at http:\/\/rpc\.test returned no block height/);
      assert.equal(chain.height(), 9);
    } finally {
      chain.stop();
    }
  }
});

test("it keeps itself fresh on a timer, and reports a failed read instead of stopping", async () => {
  const { fetchImpl } = rpc([block(5), new Error("the RPC is down"), block(6)]);
  const errors: string[] = [];
  const chain = chainHeight("http://rpc.test", { fetchImpl, everyMs: 5, onError: (error) => errors.push(error.message) });
  try {
    for (let waited = 0; waited < 400 && chain.height() < 6; waited += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(chain.height(), 6);
    assert.deepEqual(errors, ["the RPC is down"]);
  } finally {
    chain.stop();
  }
  // With nobody listening for errors a failed read is simply tried again.
  const quiet = chainHeight("http://rpc.test", { fetchImpl: rpc([new Error("down")]).fetchImpl, everyMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  quiet.stop();
  assert.equal(quiet.height(), 0);
});

test("with no fetch of its own it uses the platform's", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = rpc([block(42)]).fetchImpl;
  try {
    const chain = chainHeight("http://rpc.test");
    assert.equal(await chain.refresh(), 42);
    chain.stop();
  } finally {
    globalThis.fetch = original;
  }
});
