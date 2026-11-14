import test from "node:test";
import assert from "node:assert/strict";

import { main, WORKER_PATH } from "./main.js";
import {
  CHAIN_ID,
  CLEARING,
  KEYPOLICY,
  dstackSocketServer,
  fakeQuote,
  goodEventLog,
  httpJsonServer,
  viewMethod,
  viewReply,
} from "./testing.js";

/**
 * Everything the supervisor talks to, as the real thing: a guest agent on a unix socket, the
 * operator agent over HTTP and a NEAR RPC over HTTP. Nothing here is a double of the room's own
 * code, so this is what proves `main` is wired to the right clients.
 */
async function world(options: { jobs?: unknown; rpcFails?: boolean } = {}): Promise<{
  env: NodeJS.ProcessEnv;
  operatorPaths: string[];
  close(): Promise<void>;
}> {
  const agent = await dstackSocketServer((reportDataHex) => ({
    body: JSON.stringify({
      quote: Buffer.from(fakeQuote(new Uint8Array(Buffer.from(reportDataHex, "hex")))).toString("hex"),
      event_log: JSON.stringify(goodEventLog()),
    }),
  }));
  const operator = await httpJsonServer((path) =>
    path === "/v1/nonce" ? { json: { nonce: "33".repeat(32) } } : { json: {} },
  );
  const rpc = await httpJsonServer((_path, body) => {
    if (options.rpcFails === true) return { json: { jsonrpc: "2.0", id: "room", error: { message: "boom" } } };
    return {
      json: viewReply(
        viewMethod(body) === "get_room"
          ? { expires_at: Math.floor(Date.now() / 1_000) + 86_400, current: true }
          : (options.jobs ?? []),
      ),
    };
  });
  return {
    env: {
      MARGINAL_RPC_URL: rpc.url,
      MARGINAL_CHAIN_ID: CHAIN_ID,
      MARGINAL_CLEARING: CLEARING,
      MARGINAL_KEYPOLICY: KEYPOLICY,
      MARGINAL_OPERATOR_URL: operator.url,
      MARGINAL_DSTACK_SOCKET: agent.socketPath,
      MARGINAL_POLL_MS: "5",
    },
    operatorPaths: operator.paths,
    async close(): Promise<void> {
      await agent.close();
      await operator.close();
      await rpc.close();
    },
  };
}

test("the supervisor reads its configuration, registers, and polls for its own jobs", async () => {
  const w = await world();
  const lines: string[] = [];
  const room = await main(w.env, (line) => lines.push(line));
  try {
    assert.deepEqual(w.operatorPaths, ["/v1/nonce", "/v1/register"], "a nonce, then the relay");
    assert.match(lines[0] ?? "", new RegExp(`^room ${room.roomKeyHex} registered, polling ${CLEARING}`));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(await room.isCurrent(), true, "and it can see itself in the registry");
    assert.deepEqual(lines.slice(1), [], "nothing went wrong");
  } finally {
    room.stop();
    await w.close();
  }
});

test("a chain that will not answer is logged, and the room keeps polling", async () => {
  const w = await world({ rpcFails: true });
  const lines: string[] = [];
  const room = await main(w.env, (line) => lines.push(line));
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(
      lines.some((line) => line === "error rpc: boom"),
      `logged ${JSON.stringify(lines)}`,
    );
  } finally {
    room.stop();
    await w.close();
  }
});

test("with no arguments it takes the environment and writes to stdout", async () => {
  const w = await world();
  const saved = { ...process.env };
  Object.assign(process.env, w.env);
  try {
    const room = await main();
    room.stop();
  } finally {
    for (const key of Object.keys(w.env)) delete process.env[key];
    Object.assign(process.env, saved);
    await w.close();
  }
});

test("the worker it forks is the one built beside it", () => {
  assert.ok(WORKER_PATH.endsWith("/worker/main.js"), WORKER_PATH);
});
