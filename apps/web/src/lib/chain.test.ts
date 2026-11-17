import test from "node:test";
import assert from "node:assert/strict";

import {
  PAGE_VIEW_TTL_MS,
  base64,
  blockHeight,
  cached,
  chainClient,
  endpoints,
  errorCode,
  type Fetch,
  pageChain,
  settled,
} from "./chain";

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

/** Several endpoints behind one fetch: each URL answers with its own reply, or throws. */
function manyRpcs(replies: Record<string, { reply?: unknown; status?: number; down?: boolean }>): {
  fetch: Fetch;
  asked: string[];
} {
  const asked: string[] = [];
  const fetch = ((url: string) => {
    asked.push(url);
    const at = replies[url] ?? { down: true };
    if (at.down === true) return Promise.reject(new Error("fetch failed"));
    const status = at.status ?? 200;
    return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(at.reply) } as Response);
  }) as unknown as Fetch;
  return { fetch, asked };
}

test("an RPC setting names one endpoint or several", () => {
  assert.deepEqual(endpoints("https://a.example"), ["https://a.example"]);
  assert.deepEqual(endpoints(" https://a.example , https://b.example,"), ["https://a.example", "https://b.example"]);
  assert.throws(() => endpoints(" , "), /no RPC endpoint is configured/);
  assert.throws(() => chainClient(""), /no RPC endpoint is configured/);
});

test("a view moves on from an endpoint that does not answer, and spreads its calls", async () => {
  const rpcs = manyRpcs({
    "https://limited.example": { status: 429 },
    "https://down.example": { down: true },
    "https://good.example": { reply: bytes({ ok: 1 }) },
  });
  const chain = chainClient("https://limited.example,https://down.example,https://good.example", rpcs.fetch);

  // The first call starts at the first endpoint and is passed along until one answers.
  assert.deepEqual(await chain.view("c", "config"), { ok: 1 });
  assert.deepEqual(rpcs.asked, ["https://limited.example", "https://down.example", "https://good.example"]);
  // The second starts at the second: the load is spread, not piled on whichever is listed first.
  rpcs.asked.length = 0;
  await chain.view("c", "config");
  assert.deepEqual(rpcs.asked, ["https://down.example", "https://good.example"]);
  // The third starts at the third, and the fourth is back at the first.
  rpcs.asked.length = 0;
  await chain.view("c", "config");
  await chain.view("c", "config");
  assert.deepEqual(rpcs.asked, ["https://good.example", "https://limited.example", "https://down.example", "https://good.example"]);
});

test("when no endpoint answers, the last one's reason is what is thrown", async () => {
  const rpcs = manyRpcs({ "https://a.example": { status: 429 }, "https://b.example": { status: 503 } });
  const chain = chainClient("https://a.example,https://b.example", rpcs.fetch);
  await assert.rejects(() => chain.view("c", "config"), /config: the RPC answered 503/);
  assert.deepEqual(rpcs.asked, ["https://a.example", "https://b.example"]);
});

test("what the contract refused is not asked of another endpoint", async () => {
  const rpcs = manyRpcs({
    "https://a.example": { reply: { result: { error: "wasm execution failed: E_BUDGET_EXHAUSTED" } } },
    "https://b.example": { reply: bytes({ never: "asked" }) },
  });
  const chain = chainClient("https://a.example,https://b.example", rpcs.fetch);
  await assert.rejects(() => chain.view("c", "request_appraisal"), /request_appraisal: .*E_BUDGET_EXHAUSTED/);
  assert.deepEqual(rpcs.asked, ["https://a.example"], "the contract's answer is the answer everywhere");
});

test("the block height is asked of the next endpoint when the first refuses", async () => {
  const rpcs = manyRpcs({
    "https://a.example": { status: 429 },
    "https://b.example": { reply: { result: { header: { height: 99 } } } },
  });
  assert.equal(await blockHeight("https://a.example, https://b.example", rpcs.fetch), 99);
  assert.deepEqual(rpcs.asked, ["https://a.example", "https://b.example"]);
});

/** A port that counts its calls and answers with the call's number, or refuses when told to. */
function countingPort(): { port: { view<T>(c: string, m: string, a?: unknown): Promise<T> }; calls: string[]; refuse: { next: boolean } } {
  const calls: string[] = [];
  const refuse = { next: false };
  return {
    calls,
    refuse,
    port: {
      view<T>(contract: string, method: string, args: unknown = {}): Promise<T> {
        calls.push(`${contract}.${method}(${JSON.stringify(args)})`);
        if (refuse.next) {
          refuse.next = false;
          return Promise.reject(new Error(`${method}: the RPC answered 429`));
        }
        return Promise.resolve(calls.length as T);
      },
    },
  };
}

test("a kept view is asked once within its lifetime and again after it", async () => {
  const { port, calls } = countingPort();
  let clock = 1_000;
  const chain = cached(port, 15_000, new Map(), () => clock);

  assert.equal(await chain.view("c", "get_listing", { listing_id: "1" }), 1);
  // The same question, a moment later and at the last instant of its lifetime: one call.
  clock += 5_000;
  assert.equal(await chain.view("c", "get_listing", { listing_id: "1" }), 1);
  clock += 9_999;
  assert.equal(await chain.view("c", "get_listing", { listing_id: "1" }), 1);
  assert.equal(calls.length, 1);
  // A different question is a different entry, and no arguments is its own question too.
  assert.equal(await chain.view("c", "get_listing", { listing_id: "2" }), 2);
  assert.equal(await chain.view("c", "config"), 3);
  assert.equal(await chain.view("c", "config"), 3);
  // Once the lifetime has passed the chain is asked again.
  clock += 1;
  assert.equal(await chain.view("c", "get_listing", { listing_id: "1" }), 4);
  assert.equal(calls.length, 4);
});

test("readers who ask while a call is in flight share it, and a failed call is not kept", async () => {
  const { port, calls, refuse } = countingPort();
  const chain = cached(port, 15_000);

  const [first, second] = await Promise.all([chain.view("c", "config"), chain.view("c", "config")]);
  assert.deepEqual([first, second, calls.length], [1, 1, 1]);

  // A refusal reaches whoever asked, and the next reader asks the chain again.
  refuse.next = true;
  await assert.rejects(() => chain.view("c", "audit_head"), /429/);
  assert.equal(await chain.view("c", "audit_head"), 3);
  assert.equal(calls.length, 3);
});

test("a refusal that arrives late does not evict the answer that replaced it", async () => {
  // The first call hangs past its lifetime and then fails; by then a second call has answered.
  let failFirst: (error: Error) => void = () => {};
  let asked = 0;
  const port = {
    view<T>(): Promise<T> {
      asked += 1;
      if (asked === 1) return new Promise<T>((_, reject) => (failFirst = reject));
      return Promise.resolve("fresh" as T);
    },
  };
  let clock = 0;
  const kept = new Map();
  const chain = cached(port, 10, kept, () => clock);
  const slow = chain.view("c", "config");
  clock = 11;
  assert.equal(await chain.view("c", "config"), "fresh");
  failFirst(new Error("config: the RPC answered 503"));
  await assert.rejects(() => slow, /503/);
  assert.equal(await chain.view("c", "config"), "fresh", "the newer answer is still the kept one");
  assert.equal(asked, 2);
});

test("a server's pages share one store per RPC setting", async () => {
  const rpc = fakeRpc(bytes({ next_listing_id: 5 }));
  const url = "https://shared.example/";
  // Two requests, two ports — as two page renders make — and the chain is asked once.
  assert.deepEqual(await pageChain(url, rpc.fetch).view("clearing.testnet", "config"), { next_listing_id: 5 });
  assert.deepEqual(await pageChain(url, rpc.fetch).view("clearing.testnet", "config"), { next_listing_id: 5 });
  assert.equal(rpc.seen.length, 1);
  // Another RPC setting is another deployment's chain, and never answers for this one.
  await pageChain("https://other.example/", rpc.fetch).view("clearing.testnet", "config");
  assert.equal(rpc.seen.length, 2);
  assert.equal(PAGE_VIEW_TTL_MS, 15_000);
});

test("a read-back waits for the chain to catch up with the write", async () => {
  // The signer returns when a transaction has executed; a view asks for final state, which trails
  // it. A single look therefore misses what was just created — which is what made the wizard say
  // "the chain has no listing for this account yet" about a listing that was already on chain.
  const waits: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    waits.push(ms);
    return Promise.resolve();
  };

  let look = 0;
  const late = await settled<string>(
    () => {
      look += 1;
      return Promise.resolve({ ok: look < 3 ? null : "listing 2" });
    },
    8,
    750,
    sleep,
  );
  assert.deepEqual(late, { ok: "listing 2" }, "it keeps asking until the chain agrees");
  assert.equal(look, 3);
  assert.deepEqual(waits, [750, 750], "it waits between looks, not before the first");

  // Something that is genuinely absent is still absent, and says so rather than hanging.
  let tries = 0;
  const missing = await settled<string>(
    () => {
      tries += 1;
      return Promise.resolve({ ok: null });
    },
    4,
    10,
    sleep,
  );
  assert.deepEqual(missing, { ok: null });
  assert.equal(tries, 4, "it gives up after the attempts it was given");

  // The default wait is a real timer, and it is what runs in a browser — so it is exercised here
  // rather than always being replaced by a stub.
  let real = 0;
  const waited = await settled<string>(() => {
    real += 1;
    return Promise.resolve({ ok: real < 2 ? null : "arrived" });
  }, 3, 1);
  assert.deepEqual(waited, { ok: "arrived" });
  assert.equal(real, 2);

  // An error is not emptiness: it comes back at once, because retrying would only repeat it.
  let asked = 0;
  const failed = await settled<string>(
    () => {
      asked += 1;
      return Promise.resolve({ error: "E_DECODE" });
    },
    5,
    10,
    sleep,
  );
  assert.deepEqual(failed, { error: "E_DECODE" });
  assert.equal(asked, 1, "an error is returned without retrying");
});
