import test from "node:test";
import assert from "node:assert/strict";

import {
  HttpError,
  MAX_BODY_BYTES,
  fromEnv,
  jsonServer,
  listFrom,
  listen,
  match,
  parseRoutes,
  portFrom,
  reporter,
  requestLine,
  required,
  stdout,
} from "./http.js";

/** Starts a server on a free port and gives back a `fetch` bound to it. */
async function serve(
  routes: Parameters<typeof jsonServer>[0],
  onError?: (error: Error) => void,
): Promise<{ call: (path: string, init?: RequestInit) => Promise<Response>; close: () => Promise<void> }> {
  const server = jsonServer(routes, onError);
  const port = await listen(server, 0);
  return {
    call: (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("a route gets its request, and an unknown one is a 404", async () => {
  const seen: unknown[] = [];
  const s = await serve({
    "POST /v1/echo": (request) => {
      seen.push(request.body);
      return { json: { path: request.path, query: request.query.get("q"), method: request.method } };
    },
    "GET /v1/blob/*": (request) => ({ json: { rest: request.rest } }),
  });
  try {
    const reply = await s.call("/v1/echo?q=7", json({ a: 1 }));
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { path: "/v1/echo", query: "7", method: "POST" });
    assert.deepEqual(seen, [{ a: 1 }]);

    // A tail route gets what matched it.
    assert.deepEqual(await (await s.call("/v1/blob/certs/aa")).json(), { rest: "certs/aa" });

    const missing = await s.call("/v1/nothing");
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "no such route" });
    // The method is part of the route, so the right path with the wrong method is also a 404.
    assert.equal((await s.call("/v1/echo")).status, 404);
  } finally {
    await s.close();
  }
});

test("a failure is a status, and an unexpected one tells the caller nothing", async () => {
  const errors: Error[] = [];
  const s = await serve(
    {
      "POST /v1/refuse": () => {
        throw new HttpError(409, "that listing is already published");
      },
      "POST /v1/break": () => {
        throw new Error("the database password is hunter2");
      },
      "POST /v1/need": (request) => ({ json: { got: required(request.body, "name") } }),
    },
    (error) => errors.push(error),
  );
  try {
    const refused = await s.call("/v1/refuse", json({}));
    assert.equal(refused.status, 409);
    assert.deepEqual(await refused.json(), { error: "that listing is already published" });

    const broken = await s.call("/v1/break", json({}));
    assert.equal(broken.status, 500);
    assert.deepEqual(await broken.json(), { error: "internal error" }, "and nothing of the cause");
    assert.deepEqual(
      errors.map((error) => error.message),
      ["the database password is hunter2"],
      "which the service itself still sees",
    );

    assert.deepEqual(await (await s.call("/v1/need", json({ name: "a" }))).json(), { got: "a" });
    const short = await s.call("/v1/need", json({}));
    assert.equal(short.status, 400);
    assert.deepEqual(await short.json(), { error: "name is required" });
    assert.equal((await s.call("/v1/need", json({ name: "" }))).status, 400);
    assert.equal((await s.call("/v1/need", json({ name: 7 }))).status, 400);
  } finally {
    await s.close();
  }
});

test("a body that is not JSON, and one that is too large, are refused", async () => {
  const s = await serve({ "POST /v1/x": (request) => ({ json: { size: request.bytes.length } }) });
  try {
    const bad = await s.call("/v1/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: "the body is not JSON" });

    // Without a JSON content type the bytes come through untouched, which is what an upload needs.
    const raw = await s.call("/v1/x", { method: "POST", body: Buffer.from([1, 2, 3]) });
    assert.deepEqual(await raw.json(), { size: 3 });
    assert.deepEqual(await (await s.call("/v1/x", { method: "POST" })).json(), { size: 0 });

    const huge = await s.call("/v1/x", {
      method: "POST",
      body: Buffer.alloc(MAX_BODY_BYTES + 1024),
    });
    assert.equal(huge.status, 413);
  } finally {
    await s.close();
  }
});

test("bytes come back as bytes, with the type the handler chose", async () => {
  const s = await serve({
    "GET /v1/raw": () => ({ bytes: Buffer.from([7, 8]), contentType: "application/wasm" }),
    "GET /v1/default": () => ({ bytes: Buffer.from([1]) }),
    "GET /v1/empty": () => ({ status: 204 }),
  });
  try {
    const raw = await s.call("/v1/raw");
    assert.equal(raw.headers.get("content-type"), "application/wasm");
    assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), new Uint8Array([7, 8]));
    assert.equal((await s.call("/v1/default")).headers.get("content-type"), "application/octet-stream");
    const empty = await s.call("/v1/empty");
    assert.equal(empty.status, 204);
  } finally {
    await s.close();
  }
});

test("a server can be told which port to use", async () => {
  const server = jsonServer({});
  const port = await listen(server, 0);
  assert.ok(port > 0);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a request with nothing in its line still has one", () => {
  assert.deepEqual(
    { ...requestLine(undefined, undefined), query: undefined },
    { method: "GET", path: "/", query: undefined },
  );
  const line = requestLine("POST", "/v1/x?a=1");
  assert.equal(line.path, "/v1/x");
  assert.equal(line.query.get("a"), "1");
});

test("a route key without a method is left out of the table", () => {
  const handler = (): { json: unknown } => ({ json: null });
  assert.deepEqual(
    parseRoutes({ "GET /v1/a": handler, "/v1/b": handler, "": handler }).map((route) => route.pattern),
    ["/v1/a"],
  );
  const parsed = parseRoutes({ "GET /v1/a": handler, "GET /v1/b/*": handler });
  assert.equal(match(parsed, "GET", "/v1/a")?.rest, "");
  assert.equal(match(parsed, "GET", "/v1/b/c/d")?.rest, "c/d");
  assert.equal(match(parsed, "POST", "/v1/a"), undefined);
  assert.equal(match(parsed, "GET", "/v1/c"), undefined);
});

test("a service that passes no error handler still answers 500", async () => {
  const server = jsonServer({
    "GET /v1/break": () => {
      throw new Error("something");
    },
  });
  const port = await listen(server, 0);
  try {
    const reply = await fetch(`http://127.0.0.1:${port}/v1/break`);
    assert.equal(reply.status, 500);
    assert.deepEqual(await reply.json(), { error: "internal error" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("the small helpers every service shares", () => {
  const lines: string[] = [];
  reporter((line) => lines.push(line))(new Error("the disk is full"));
  assert.deepEqual(lines, ["error the disk is full"]);

  assert.equal(portFrom({}, 8081), 8081);
  assert.equal(portFrom({ PORT: "" }, 8081), 8081);
  assert.equal(portFrom({ PORT: "0" }, 8081), 0);
  assert.equal(portFrom({ PORT: "9000" }, 8081), 9000);
  for (const bad of ["nine", "-1", "70000", "1.5"]) {
    assert.throws(() => portFrom({ PORT: bad }, 8081), /PORT is not a port/, bad);
  }

  assert.deepEqual(listFrom({}, "L"), []);
  assert.deepEqual(listFrom({ L: "" }, "L"), []);
  assert.deepEqual(listFrom({ L: "a, b ,,c" }, "L"), ["a", "b", "c"]);

  assert.equal(fromEnv({ A: " x " }, "A"), "x");
  assert.throws(() => fromEnv({}, "A"), /A is required/);
  assert.throws(() => fromEnv({ A: "  " }, "A"), /A is required/);

  // `stdout` is what a service logs with when nobody passes a logger.
  const written: string[] = [];
  const real = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    stdout("a line");
  } finally {
    process.stdout.write = real;
  }
  assert.deepEqual(written, ["a line\n"]);
});
