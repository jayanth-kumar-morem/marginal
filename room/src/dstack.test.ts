import test from "node:test";
import assert from "node:assert/strict";

import { dstackClient, isHttpError } from "./dstack.js";
import { dstackSocketServer, fakeQuote, goodEventLog, silentSocketServer } from "./testing.js";

const reportData = new Uint8Array(64).fill(7);

function quoteReply(reportDataHex: string): { body: string } {
  return {
    body: JSON.stringify({
      quote: Buffer.from(fakeQuote(new Uint8Array(Buffer.from(reportDataHex, "hex")))).toString("hex"),
      event_log: JSON.stringify(goodEventLog()),
      report_data: reportDataHex,
      vm_config: "{}",
    }),
  };
}

test("the client asks the guest agent over its socket and decodes the answer", async () => {
  let asked = "";
  const agent = await dstackSocketServer((report) => {
    asked = report;
    return quoteReply(report);
  });
  try {
    const client = dstackClient({ socketPath: agent.socketPath });
    const quote = await client.getQuote(reportData);
    assert.equal(asked, Buffer.from(reportData).toString("hex"), "the report data goes as hex");
    assert.equal(quote.quote.length, 48 + 584);
    assert.deepEqual(quote.quote.subarray(48 + 520), reportData, "the quote reports what was asked");
    assert.equal(quote.eventLog.length, goodEventLog().length);
    assert.equal(quote.eventLog[1]?.event, "system-preparing");
  } finally {
    await agent.close();
  }
});

test("report data is 64 bytes, or the agent is never called", async () => {
  const client = dstackClient({ socketPath: "/nonexistent.sock" });
  await assert.rejects(() => client.getQuote(new Uint8Array(32)), /64 bytes/);
});

test("a quote with an 0x prefix decodes, and the socket path can be pointed elsewhere", async () => {
  const agent = await dstackSocketServer(() => ({
    body: JSON.stringify({ quote: "0xabcdef", event_log: "[]" }),
  }));
  try {
    const client = dstackClient({ socketPath: agent.socketPath, path: "/prpc/Tappd.GetQuote" });
    const quote = await client.getQuote(reportData);
    assert.deepEqual(quote.quote, new Uint8Array([0xab, 0xcd, 0xef]));
    assert.deepEqual(quote.eventLog, []);
  } finally {
    await agent.close();
  }
});

test("every way the agent can answer badly is its own error", async () => {
  const cases: [string, { status?: number; body: string }, RegExp][] = [
    ["an error field", { body: JSON.stringify({ error: "GetQuote is Intel TDX only" }) }, /Intel TDX only/],
    ["no quote", { body: JSON.stringify({ event_log: "[]" }) }, /no quote/],
    ["an empty quote", { body: JSON.stringify({ quote: "", event_log: "[]" }) }, /no quote/],
    ["no event log", { body: JSON.stringify({ quote: "ab" }) }, /no event log/],
    ["an event log that is not a list", { body: JSON.stringify({ quote: "ab", event_log: "{}" }) }, /not a list/],
    ["not an object", { body: "42" }, /not an object/],
    ["not JSON at all", { body: "<html>" }, /Unexpected token|JSON/],
    ["an HTTP error", { status: 404, body: "not found" }, /HTTP 404/],
  ];
  for (const [name, reply, expected] of cases) {
    const agent = await dstackSocketServer(() => reply);
    try {
      const client = dstackClient({ socketPath: agent.socketPath });
      await assert.rejects(() => client.getQuote(reportData), expected, name);
    } finally {
      await agent.close();
    }
  }
});

test("a socket nobody is listening on, and an agent that never answers", async () => {
  const client = dstackClient({ socketPath: "/tmp/marginal-no-such-agent.sock" });
  await assert.rejects(() => client.getQuote(reportData), /ENOENT|ECONNREFUSED/);

  // Accepts the connection and says nothing: only the client's own timeout ends the call.
  const silent = await silentSocketServer();
  try {
    const impatient = dstackClient({ socketPath: silent.socketPath, timeoutMs: 30 });
    await assert.rejects(() => impatient.getQuote(reportData), /timed out/);
  } finally {
    await silent.close();
  }
});

test("only a 2xx is an answer", () => {
  assert.equal(isHttpError(200), false);
  assert.equal(isHttpError(204), false);
  assert.equal(isHttpError(299), false);
  assert.equal(isHttpError(199), true, "an informational reply is not an answer");
  assert.equal(isHttpError(300), true);
  assert.equal(isHttpError(500), true);
  assert.equal(isHttpError(undefined), true, "nor is a reply with no status line");
});
