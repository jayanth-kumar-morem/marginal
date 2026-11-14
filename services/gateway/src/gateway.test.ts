import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GRANT_TTL_SECONDS, MAX_OBJECT_BYTES, checkKey, gateway, grantToken, blobStore, serve } from "./index.js";
import { ONE_CLICK_BASE, dryQuote } from "./quote.js";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** The gateway on a free port, with a temporary store. */
async function up(
  options: Partial<Parameters<typeof gateway>[0]> = {},
): Promise<{
  call: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
  errors: Error[];
}> {
  const errors: Error[] = [];
  const { server, port } = await serve(
    {
      directory: mkdtempSync(join(tmpdir(), "marginal-blobs-")),
      secret: randomBytes(32),
      onError: (error) => errors.push(error),
      ...options,
    },
    0,
  );
  return {
    call: (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    errors,
  };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Asks for a grant and uploads, which is the whole client-side flow. */
async function upload(
  call: (path: string, init?: RequestInit) => Promise<Response>,
  key: string,
  bytes: Buffer,
): Promise<Response> {
  const granted = (await (
    await call("/v1/uploads", postJson({ key, sha256: sha256(bytes), size: bytes.length }))
  ).json()) as { token: string };
  return call(`/v1/blob/${key}`, {
    method: "PUT",
    headers: { "x-upload-token": granted.token },
    body: new Uint8Array(bytes),
  });
}

test("an object can be uploaded against a grant and read back", async () => {
  const g = await up();
  try {
    assert.deepEqual(await (await g.call("/v1/health")).json(), { ok: true, package: "@marginal/gateway" });

    const bytes = Buffer.from("a sealed delivery", "utf8");
    const put = await upload(g.call, "deliveries/11", bytes);
    assert.equal(put.status, 200);
    assert.deepEqual(await put.json(), { key: "deliveries/11", sha256: sha256(bytes) });

    const got = await g.call("/v1/blob/deliveries/11");
    assert.equal(got.status, 200);
    assert.deepEqual(Buffer.from(await got.arrayBuffer()), bytes);
    assert.equal((await g.call("/v1/blob/deliveries/12")).status, 404);
    assert.deepEqual(g.errors, [], "nothing unexpected happened");
  } finally {
    await g.close();
  }
});

test("an upload is refused unless it is the object the grant named", async () => {
  const g = await up();
  try {
    const bytes = Buffer.from("the right bytes", "utf8");
    const granted = (await (
      await g.call("/v1/uploads", postJson({ key: "certs/aa", sha256: sha256(bytes), size: bytes.length }))
    ).json()) as { token: string };
    const token = { "x-upload-token": granted.token };

    // Different bytes of the same length, the wrong length, another key, and no token at all.
    const swapped = await g.call("/v1/blob/certs/aa", { method: "PUT", headers: token, body: Buffer.from("the wrong bytes", "utf8") });
    assert.equal(swapped.status, 400);
    assert.deepEqual(await swapped.json(), { error: "those bytes are not the ones the grant named" });

    const longer = await g.call("/v1/blob/certs/aa", { method: "PUT", headers: token, body: Buffer.concat([bytes, Buffer.from("!")]) });
    assert.equal(longer.status, 400);
    assert.deepEqual(await longer.json(), { error: "that is not the size the grant named" });

    const elsewhere = await g.call("/v1/blob/certs/bb", { method: "PUT", headers: token, body: bytes });
    assert.equal(elsewhere.status, 403);
    assert.deepEqual(await elsewhere.json(), { error: "that upload token is not for this object" });

    const bare = await g.call("/v1/blob/certs/aa", { method: "PUT", body: bytes });
    assert.equal(bare.status, 401);
    const nonsense = await g.call("/v1/blob/certs/aa", { method: "PUT", headers: { "x-upload-token": "nope" }, body: bytes });
    assert.equal(nonsense.status, 400);
  } finally {
    await g.close();
  }
});

test("a grant expires, and the clock is the gateway's", async () => {
  let now = 1_000;
  const g = await up({ now: () => now });
  try {
    const bytes = Buffer.from("x", "utf8");
    const granted = (await (
      await g.call("/v1/uploads", postJson({ key: "certs/aa", sha256: sha256(bytes), size: 1 }))
    ).json()) as { token: string; expires: number };
    assert.equal(granted.expires, 1_000 + GRANT_TTL_SECONDS);
    now += GRANT_TTL_SECONDS + 1;
    const late = await g.call("/v1/blob/certs/aa", {
      method: "PUT",
      headers: { "x-upload-token": granted.token },
      body: bytes,
    });
    assert.equal(late.status, 403);
    assert.deepEqual(await late.json(), { error: "that upload token has expired" });
  } finally {
    await g.close();
  }
});

test("a grant request is checked before any upload happens", async () => {
  const g = await up();
  try {
    const cases: [unknown, number, RegExp][] = [
      [{ sha256: "aa".repeat(32), size: 1 }, 400, /not a blob key/],
      [{ key: "../etc/passwd", sha256: "aa".repeat(32), size: 1 }, 400, /not a blob key/],
      [{ key: "a/../b", sha256: "aa".repeat(32), size: 1 }, 400, /not a blob key/],
      [{ key: "certs/aa", sha256: "zz", size: 1 }, 400, /sha256 must be/],
      [{ key: "certs/aa", sha256: "aa".repeat(32), size: 0 }, 400, /size must be/],
      [{ key: "certs/aa", sha256: "aa".repeat(32), size: 1.5 }, 400, /size must be/],
      [{ key: "certs/aa", sha256: "aa".repeat(32), size: MAX_OBJECT_BYTES + 1 }, 413, /too large/],
    ];
    for (const [body, status, expected] of cases) {
      const reply = await g.call("/v1/uploads", postJson(body));
      assert.equal(reply.status, status, JSON.stringify(body));
      assert.match(((await reply.json()) as { error: string }).error, expected);
    }
    assert.equal(checkKey("listings/3/v1/good"), "listings/3/v1/good");
    assert.equal((await g.call("/v1/blob/..%2Fetc")).status, 404, "nor by a path that escapes");
  } finally {
    await g.close();
  }
});

test("replay says so when it is not configured, and otherwise answers for one job", async () => {
  const bare = await up();
  try {
    const reply = await bare.call("/v1/replay/11");
    assert.equal(reply.status, 503);
    assert.deepEqual(await reply.json(), { error: "the verifier is not configured" });
  } finally {
    await bare.close();
  }

  const seen: number[] = [];
  const wired = await up({
    replay: (jobId) => {
      seen.push(jobId);
      return Promise.resolve({ jobId, ok: true });
    },
  });
  try {
    assert.deepEqual(await (await wired.call("/v1/replay/11")).json(), { jobId: 11, ok: true });
    assert.deepEqual(seen, [11]);
    assert.equal((await wired.call("/v1/replay/abc")).status, 400);
    assert.equal((await wired.call("/v1/replay/-1")).status, 400);
  } finally {
    await wired.close();
  }
});

test("a dry quote is forwarded, forced dry, and nothing is kept", async () => {
  const seen: { url: string; body: unknown }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ amountOut: "123" }), { status: 200 }));
  }) as typeof globalThis.fetch;

  const g = await up({ quote: { fetchImpl, baseUrl: "http://1click.test" } });
  try {
    const reply = await g.call("/v1/quote", postJson({ originAsset: "near", dry: false }));
    assert.deepEqual(await reply.json(), { amountOut: "123" });
    assert.equal(seen[0]?.url, "http://1click.test/v0/quote");
    assert.deepEqual(seen[0]?.body, { originAsset: "near", dry: true }, "dry is forced");
    assert.equal(ONE_CLICK_BASE, "https://1click.chaindefuser.com");
  } finally {
    await g.close();
  }
});

test("every way the quote service can fail is a 502, not a leak", async () => {
  const cases: [string, typeof globalThis.fetch, RegExp][] = [
    [
      "a refusal",
      (() => Promise.resolve(new Response("nope", { status: 429 }))) as typeof globalThis.fetch,
      /refused with 429/,
    ],
    [
      "something that is not JSON",
      (() => Promise.resolve(new Response("<html>", { status: 200 }))) as typeof globalThis.fetch,
      /did not answer with JSON/,
    ],
    [
      "no answer at all",
      (() => Promise.reject(new Error("ENOTFOUND"))) as typeof globalThis.fetch,
      /did not answer/,
    ],
  ];
  for (const [name, fetchImpl, expected] of cases) {
    const g = await up({ quote: { fetchImpl, baseUrl: "http://1click.test" } });
    try {
      const reply = await g.call("/v1/quote", postJson({}));
      assert.equal(reply.status, 502, name);
      assert.match(((await reply.json()) as { error: string }).error, expected, name);
    } finally {
      await g.close();
    }
  }
  await assert.rejects(() => dryQuote("not an object"), /a quote needs a request/);
  // The default transport is the real 1Click API, which a test never calls.
  assert.ok(dryQuote);
});

test("the store can be used directly, and refuses a token it did not make", () => {
  const store = blobStore(mkdtempSync(join(tmpdir(), "marginal-blobs-")), randomBytes(32));
  const bytes = Buffer.from("direct", "utf8");
  const granted = store.grant({ key: "certs/aa", sha256: sha256(bytes), size: bytes.length });
  assert.deepEqual(store.put("certs/aa", grantToken(granted), bytes), {
    key: "certs/aa",
    sha256: sha256(bytes),
  });
  assert.deepEqual(store.get("certs/aa"), bytes);
  // A token from another deployment's key does not open this one.
  const other = blobStore(mkdtempSync(join(tmpdir(), "marginal-blobs-")), randomBytes(32));
  assert.throws(
    () => store.put("certs/aa", grantToken(other.grant({ key: "certs/aa", sha256: sha256(bytes), size: bytes.length })), bytes),
    /not for this object/,
  );
  assert.throws(() => store.put("certs/aa", "1.2.3", bytes), /not an upload token/);
});
