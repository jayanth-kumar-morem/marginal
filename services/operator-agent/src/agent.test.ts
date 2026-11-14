import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serve as serveGateway } from "@marginal/gateway";
import {
  PCCS_URL,
  REGISTER_DEPOSIT,
  TICKET_DEPOSIT,
  agent,
  asNonce,
  contractOf,
  nearAiBaseFrom,
  fetchCollateral,
  serve,
  transactionValue,
} from "./index.js";
import type { Relay } from "./near.js";

const NONCE = "ab".repeat(32);
const QUOTE = "0011".repeat(8);

/** A chain that records what it was asked and answers from a table. */
function relay(answers: Record<string, unknown> = {}): Relay & {
  calls: { contract: string; method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint }[];
} {
  const calls: { contract: string; method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint }[] = [];
  return {
    calls,
    view: <T,>() => Promise.resolve(null as T),
    call(contract, method, args, gas, deposit) {
      calls.push({ contract, method, args, gas, deposit });
      return Promise.resolve(method in answers ? answers[method] : null);
    },
  };
}

/** A `dcap-qvl` that prints what the test wants. */
function fakeQvl(output: string, exitCode = 0): string {
  const path = join(mkdtempSync(join(tmpdir(), "marginal-qvl-")), "dcap-qvl");
  writeFileSync(path, `#!/bin/sh\ncat <<'JSON'\n${output}\nJSON\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
  return path;
}

async function up(
  options: Partial<Parameters<typeof agent>[0]> = {},
): Promise<{
  call: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
  relay: ReturnType<typeof relay>;
}> {
  const chain = (options.relay as ReturnType<typeof relay>) ?? relay();
  const { server, port } = await serve(
    {
      clearing: "clearing.test",
      keypolicy: "keypolicy.test",
      gatewayUrl: "http://gateway.test",
      nearAiBase: "http://nearai.test",
      fetchImpl: globalThis.fetch,
      ...options,
      relay: chain,
    },
    0,
  );
  return {
    call: (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    relay: chain,
  };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("a nonce comes from KeyPolicy, paid for by the agent", async () => {
  const a = await up({ relay: relay({ issue_nonce: NONCE }) });
  try {
    assert.deepEqual(await (await a.call("/v1/health")).json(), {
      ok: true,
      package: "@marginal/operator-agent",
    });
    assert.deepEqual(await (await a.call("/v1/nonce", postJson({}))).json(), { nonce: NONCE });
    const asked = a.relay.calls[0];
    assert.equal(asked?.contract, "keypolicy.test");
    assert.equal(asked?.method, "issue_nonce");
    assert.equal(asked?.deposit, TICKET_DEPOSIT, "the caller pays for the record");
  } finally {
    await a.close();
  }

  // Anything that is not a nonce is a 502: the room must not be handed a value it will sign over.
  for (const bad of [null, "nope", "AB".repeat(32)]) {
    const broken = await up({ relay: relay({ issue_nonce: bad }) });
    try {
      assert.equal((await broken.call("/v1/nonce", postJson({}))).status, 502, String(bad));
    } finally {
      await broken.close();
    }
  }
});

test("a registration gets its collateral and its deposit, and the room's bytes are untouched", async () => {
  const command = fakeQvl(JSON.stringify({ tcb_info: "{}", pck_crl: "" }));
  const a = await up({ collateral: { command }, relay: relay({ register_room: "ok" }) });
  try {
    const bundle = { quote: QUOTE, events: [], sign_pk: "aa", nonce: NONCE, class: "Kcpu", sign_sig: "bb" };
    const reply = await a.call("/v1/register", postJson(bundle));
    assert.deepEqual(await reply.json(), { registered: "ok" });
    const sent = a.relay.calls[0];
    assert.equal(sent?.method, "register_room");
    assert.equal(sent?.deposit, REGISTER_DEPOSIT);
    assert.ok((sent?.gas ?? 0n) >= 300n * 10n ** 12n, "the verifier call needs 200 TGas of it");
    // Every field the room signed is passed through, with only the collateral added.
    for (const [key, value] of Object.entries(bundle)) {
      assert.deepEqual(sent?.args[key], value, key);
    }
    assert.deepEqual(sent?.args.collateral, { tcb_info: "{}", pck_crl: "" });
  } finally {
    await a.close();
  }
});

test("a registration with no quote, or no collateral to be had, is refused", async () => {
  const a = await up({ collateral: { command: "/nonexistent/dcap-qvl" } });
  try {
    assert.equal((await a.call("/v1/register", postJson({}))).status, 400);
    assert.equal((await a.call("/v1/register", { method: "POST" })).status, 400);
    const noQvl = await a.call("/v1/register", postJson({ quote: QUOTE }));
    assert.equal(noQvl.status, 503);
    assert.match(((await noQvl.json()) as { error: string }).error, /could not fetch collateral/);
  } finally {
    await a.close();
  }

  const garbage = await up({ collateral: { command: fakeQvl("not json") } });
  try {
    assert.equal((await garbage.call("/v1/register", postJson({ quote: QUOTE }))).status, 503);
  } finally {
    await garbage.close();
  }
  const scalar = await up({ collateral: { command: fakeQvl("42") } });
  try {
    assert.equal((await scalar.call("/v1/register", postJson({ quote: QUOTE }))).status, 503);
  } finally {
    await scalar.close();
  }
  await assert.rejects(() => fetchCollateral("nothex"), /the quote is not hex/);
  assert.match(PCCS_URL, /^https:\/\/pccs\.phala\.network/);
});

test("only the methods a room is allowed to ask for are relayed", async () => {
  const a = await up({ relay: relay({ submit_verdict: { price: "7" }, authorize: "11" }) });
  try {
    const verdict = await a.call("/v1/submit", postJson({ method: "submit_verdict", args: { verdict: "aa" } }));
    assert.deepEqual(await verdict.json(), { price: "7" });
    assert.equal(a.relay.calls[0]?.contract, "clearing.test", "clearing unless asked otherwise");
    assert.equal(a.relay.calls[0]?.deposit, 0n);

    const ticket = await a.call(
      "/v1/submit",
      postJson({ contract: "keypolicy", method: "authorize", args: { request: "aa" } }),
    );
    assert.equal(await ticket.json(), "11");
    assert.equal(a.relay.calls[1]?.contract, "keypolicy.test");
    assert.equal(a.relay.calls[1]?.deposit, TICKET_DEPOSIT, "a ticket's storage is paid for");

    // Anything outside the allow-list, whichever contract it names.
    for (const body of [
      { method: "new", args: {} },
      { method: "set_fees", args: {} },
      { contract: "keypolicy", method: "register_room", args: {} },
      { contract: "clearing", method: "authorize", args: {} },
    ]) {
      const refused = await a.call("/v1/submit", postJson(body));
      assert.equal(refused.status, 403, JSON.stringify(body));
    }
    assert.equal((await a.call("/v1/submit", postJson({ method: "submit_verdict" }))).status, 400);
    assert.equal((await a.call("/v1/submit", postJson({ method: "submit_verdict", args: null }))).status, 400);
    assert.equal((await a.call("/v1/submit", postJson({}))).status, 400);
    // A request with no body at all, which is what a confused client sends.
    assert.equal((await a.call("/v1/submit", { method: "POST" })).status, 400);
    assert.equal(a.relay.calls.length, 2, "and nothing refused reached the chain");
  } finally {
    await a.close();
  }
});

test("blobs go through to the gateway, and come back", async () => {
  const store = await serveGateway(
    { directory: mkdtempSync(join(tmpdir(), "marginal-blobs-")), secret: Buffer.alloc(32, 7) },
    0,
  );
  const a = await up({ gatewayUrl: `http://127.0.0.1:${store.port}` });
  try {
    const bytes = "00112233";
    assert.deepEqual(await (await a.call("/v1/blob/put", postJson({ key: "certs/aa", bytes }))).json(), {
      key: "certs/aa",
    });
    assert.deepEqual(await (await a.call("/v1/blob/get", postJson({ key: "certs/aa" }))).json(), {
      bytes,
    });
    const missing = await a.call("/v1/blob/get", postJson({ key: "certs/bb" }));
    assert.equal(missing.status, 404);
    assert.equal((await a.call("/v1/blob/put", postJson({ bytes }))).status, 400);
    assert.equal((await a.call("/v1/blob/put", { method: "POST" })).status, 400);
    assert.equal((await a.call("/v1/blob/get", { method: "POST" })).status, 400);
    // A key the gateway refuses is the gateway's answer, not a 500.
    assert.equal((await a.call("/v1/blob/put", postJson({ key: "../x", bytes }))).status, 502);
  } finally {
    await a.close();
    await new Promise<void>((resolve) => store.server.close(() => resolve()));
  }
});

test("a blob the gateway will not serve is not a 500 either", async () => {
  const broken = ((url: string) =>
    Promise.resolve(
      new Response("no", { status: String(url).includes("/uploads") ? 200 : 500 }),
    )) as typeof globalThis.fetch;
  const a = await up({
    fetchImpl: ((url: string) =>
      String(url).includes("/uploads")
        ? Promise.resolve(new Response(JSON.stringify({ token: "t" }), { status: 200 }))
        : broken(url)) as typeof globalThis.fetch,
  });
  try {
    assert.equal((await a.call("/v1/blob/put", postJson({ key: "certs/aa", bytes: "00" }))).status, 502);
    assert.equal((await a.call("/v1/blob/get", postJson({ key: "certs/aa" }))).status, 502);
  } finally {
    await a.close();
  }
});

test("the judge proxy adds the key, forwards the body untouched, and allows two paths only", async () => {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    seen.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: init?.body === undefined ? "" : Buffer.from(init.body as Uint8Array).toString("utf8"),
    });
    return Promise.resolve(new Response(JSON.stringify({ id: "chat-1" }), { status: 200 }));
  }) as typeof globalThis.fetch;

  const a = await up({ nearAiKey: "secret", fetchImpl });
  try {
    const body = JSON.stringify({ model: "m", temperature: 0 });
    const reply = await a.call("/v1/judge/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-no-aliasing": "true" },
      body,
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { id: "chat-1" });
    assert.equal(seen[0]?.url, "http://nearai.test/v1/chat/completions");
    assert.equal(seen[0]?.headers.authorization, "Bearer secret", "the agent adds the key");
    assert.equal(seen[0]?.headers["x-no-aliasing"], "true", "and keeps what the room sent");
    assert.equal(seen[0]?.body, body, "the body is exactly what the TEE will sign over");

    await a.call("/v1/judge/v1/signature/chat-1?model=m&signing_algo=ecdsa");
    assert.equal(seen[1]?.url, "http://nearai.test/v1/signature/chat-1?model=m&signing_algo=ecdsa");

    // Anything else on that host is not the room's business.
    for (const path of ["/v1/judge/v1/models", "/v1/judge/admin", "/v1/judge/v1/chat/completions/x"]) {
      assert.equal((await a.call(path, postJson({}))).status, 403, path);
    }
  } finally {
    await a.close();
  }

  const keyless = await up({ fetchImpl });
  try {
    const reply = await keyless.call("/v1/judge/v1/chat/completions", postJson({}));
    assert.equal(reply.status, 503);
    assert.deepEqual(await reply.json(), { error: "this deployment has no judge key" });
  } finally {
    await keyless.close();
  }
});

test("aliasing is forced off, whatever the room asked for", async () => {
  const seen: Record<string, string>[] = [];
  const a = await up({
    nearAiKey: "k",
    fetchImpl: ((_url: string, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof globalThis.fetch,
  });
  try {
    // A room that asked for aliasing does not get it: that would make the signature the gateway's.
    await a.call("/v1/judge/v1/chat/completions", {
      method: "POST",
      headers: { "x-no-aliasing": "false" },
      body: "{}",
    });
    assert.equal(seen[0]?.["x-no-aliasing"], "true");
  } finally {
    await a.close();
  }

  // The agent's own transport failing is the service's problem, not something a caller is told.
  const bare = await up({ gatewayUrl: "http://127.0.0.1:1" });
  try {
    assert.equal((await bare.call("/v1/blob/get", postJson({ key: "certs/aa" }))).status, 500);
  } finally {
    await bare.close();
  }
});

test("where NEAR AI is comes from the environment, or is its own API", () => {
  assert.equal(nearAiBaseFrom({ MARGINAL_NEARAI_BASE: "http://mirror.test" }), "http://mirror.test");
  assert.equal(nearAiBaseFrom({}), "https://cloud-api.near.ai");
  assert.equal(nearAiBaseFrom({ MARGINAL_NEARAI_BASE: " " }), "https://cloud-api.near.ai");
});

test("what a room asks for is read strictly", () => {
  assert.equal(contractOf("keypolicy"), "keypolicy");
  for (const value of ["clearing", undefined, null, 7, "mpc"]) {
    assert.equal(contractOf(value), "clearing", JSON.stringify(value));
  }
  assert.equal(asNonce("ab".repeat(32)), "ab".repeat(32));
  for (const value of [undefined, null, 7, "short", "AB".repeat(32)]) {
    assert.throws(() => asNonce(value), /did not return a nonce/, JSON.stringify(value));
  }
});

test("a transaction's value is read from its outcome, however it answered", () => {
  const encode = (value: string): string => Buffer.from(value, "utf8").toString("base64");
  assert.deepEqual(transactionValue({ status: { SuccessValue: encode('{"a":1}') } }), { a: 1 });
  assert.equal(transactionValue({ status: { SuccessValue: encode('"7"') } }), "7");
  assert.equal(transactionValue({ status: { SuccessValue: encode("plain") } }), "plain");
  assert.equal(transactionValue({ status: { SuccessValue: "" } }), null);
  assert.equal(transactionValue({ status: {} }), null);
});
