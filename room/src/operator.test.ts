import test from "node:test";
import assert from "node:assert/strict";

import { operatorClient } from "./operator.js";

interface Seen {
  url: string;
  body: unknown;
}

function agent(
  answer: (path: string) => { status?: number; body: string },
): { fetch: typeof globalThis.fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    seen.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    const reply = answer(String(url));
    return Promise.resolve(new Response(reply.body, { status: reply.status ?? 200 }));
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, seen };
}

const NONCE = "ab".repeat(32);

test("the room asks the agent for a nonce, and gets 32 bytes of hex or an error", async () => {
  const good = agent(() => ({ body: JSON.stringify({ nonce: NONCE }) }));
  const client = operatorClient("http://agent.test/", good.fetch);
  assert.equal(await client.issueNonce(), NONCE);
  assert.equal(good.seen[0]?.url, "http://agent.test/v1/nonce", "the trailing slash is not doubled");

  for (const bad of [{ nonce: "nope" }, { nonce: 7 }, {}, { nonce: "ab" }]) {
    const wrong = agent(() => ({ body: JSON.stringify(bad) }));
    await assert.rejects(
      () => operatorClient("http://agent.test", wrong.fetch).issueNonce(),
      /32 bytes of hex/,
      JSON.stringify(bad),
    );
  }
});

test("a registration and a submission are posted, and an empty answer is fine", async () => {
  const seen = agent(() => ({ body: "" }));
  const client = operatorClient("http://agent.test", seen.fetch);
  await client.register({ quote: "ab", nonce: NONCE });
  await client.submit("submit_verdict", { verdict: "bb", sig: "cc" });
  assert.deepEqual(
    seen.seen.map((call) => call.url),
    ["http://agent.test/v1/register", "http://agent.test/v1/submit"],
  );
  assert.deepEqual(seen.seen[0]?.body, { quote: "ab", nonce: NONCE });
  assert.deepEqual(seen.seen[1]?.body, {
    contract: "clearing",
    method: "submit_verdict",
    args: { verdict: "bb", sig: "cc" },
  });
});

test("the key-release pair goes to KeyPolicy, and blobs go to the blob store", async () => {
  const seen = agent((url) =>
    url.endsWith("/v1/blob/get") ? { body: JSON.stringify({ bytes: "abcd" }) } : { body: "" },
  );
  const client = operatorClient("http://agent.test", seen.fetch);
  await client.submit("authorize", { request: "ab" }, "keypolicy");
  assert.deepEqual(seen.seen[0]?.body, {
    contract: "keypolicy",
    method: "authorize",
    args: { request: "ab" },
  });

  await client.putBlob("certs/aa", "0011");
  assert.equal(seen.seen[1]?.url, "http://agent.test/v1/blob/put");
  assert.deepEqual(seen.seen[1]?.body, { key: "certs/aa", bytes: "0011" });

  assert.equal(await client.getBlob("certs/aa"), "abcd");
  assert.equal(seen.seen[2]?.url, "http://agent.test/v1/blob/get");
});

test("a blob that does not come back as hex is an error, not a half-read object", async () => {
  for (const body of ["{}", JSON.stringify({ bytes: 7 }), JSON.stringify({ bytes: "0a0" }), ""]) {
    const seen = agent(() => ({ body }));
    const client = operatorClient("http://agent.test", seen.fetch);
    await assert.rejects(() => client.getBlob("certs/aa"), /did not come back as hex/, body);
  }
});

test("an agent that refuses says so, with what it said", async () => {
  const broken = agent(() => ({ status: 500, body: "relayer out of gas" }));
  const client = operatorClient("http://agent.test", broken.fetch);
  await assert.rejects(() => client.issueNonce(), /HTTP 500: relayer out of gas/);
  await assert.rejects(() => client.register({}), /HTTP 500/);
  await assert.rejects(() => client.submit("x", {}), /HTTP 500/);
});
