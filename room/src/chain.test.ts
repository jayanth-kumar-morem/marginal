import test from "node:test";
import assert from "node:assert/strict";

import { chainClient, jobsForRoom, roomRecord } from "./chain.js";
import { CLEARING, job } from "./testing.js";

const ROOM = "ea".repeat(32);

/** A fetch that answers one JSON-RPC call and records what it was asked. */
function rpc(answer: unknown, status = 200): { fetch: typeof globalThis.fetch; seen: unknown[] } {
  const seen: unknown[] = [];
  const fetchImpl = ((_url: string, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)));
    return Promise.resolve(
      new Response(typeof answer === "string" ? answer : JSON.stringify(answer), { status }),
    );
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, seen };
}

function viewReply(value: unknown): unknown {
  return { result: { result: Array.from(Buffer.from(JSON.stringify(value), "utf8")) } };
}

test("a view call is a call_function query at final finality", async () => {
  const { fetch, seen } = rpc(viewReply([job(7)]));
  const jobs = await jobsForRoom(chainClient("http://rpc.test", fetch), CLEARING, ROOM);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.id, 7);

  const sent = seen[0] as { params: Record<string, string> };
  assert.equal(sent.params.request_type, "call_function");
  assert.equal(sent.params.finality, "final");
  assert.equal(sent.params.account_id, CLEARING);
  assert.equal(sent.params.method_name, "get_jobs_for_room");
  assert.deepEqual(JSON.parse(Buffer.from(sent.params.args_base64 ?? "", "base64").toString()), {
    room_key: ROOM,
  });
});

test("the registry's record comes back, or null when it has none", async () => {
  const live = rpc(viewReply({ expires_at: 100, current: true }));
  assert.deepEqual(await roomRecord(chainClient("http://rpc.test", live.fetch), CLEARING, ROOM), {
    expires_at: 100,
    current: true,
  });
  const none = rpc(viewReply(null));
  assert.equal(await roomRecord(chainClient("http://rpc.test", none.fetch), CLEARING, ROOM), null);
});

test("every way the RPC can fail is its own error", async () => {
  const cases: [string, unknown, number, RegExp][] = [
    ["an HTTP error", "", 502, /HTTP 502/],
    ["a JSON-RPC error", { error: { message: "no such contract" } }, 200, /no such contract/],
    ["an error with no message", { error: {} }, 200, /call failed/],
    ["no result", { result: {} }, 200, /no result/],
  ];
  for (const [name, answer, status, expected] of cases) {
    const { fetch } = rpc(answer, status);
    const chain = chainClient("http://rpc.test", fetch);
    await assert.rejects(() => chain.view(CLEARING, "config", {}), expected, name);
  }
});
