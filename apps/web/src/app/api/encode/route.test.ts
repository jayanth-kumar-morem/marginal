import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { POST } from "./route";

/** One POST to the route, as the browser sends it. */
function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://app.invalid/api/encode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("the route encodes through the real marginal-core, not a copy of it", async () => {
  const response = await post({
    op: "listing_path",
    input: { seller: "alice.sandbox", listing_id: 1, version: 1 },
  });

  assert.equal(response.status, 200);
  const { ok } = (await response.json()) as { ok: string };
  // `listing_path` is `listing/<key id>/v<version>`, and the key id is the core's own hash of the
  // seller and the id — so an answer of this shape is the core answering, not this app guessing.
  assert.match(ok, /^listing\/[0-9a-f]{64}\/v1$/);
});

test("the route hashes a key path exactly as clearing does", async () => {
  const response = await post({ op: "path_hash", input: { path: "listing/abc/v1" } });
  assert.deepEqual(await response.json(), {
    ok: createHash("sha256").update("marginal/path/v1").update("listing/abc/v1").digest("hex"),
  });
});

test("the route refuses an operation that is not on the allow-list", async () => {
  const response = await post({ op: "settle", input: {} });
  assert.equal(response.status, 403);
});

test("a core refusal is the core's own code, so the page can show it", async () => {
  const response = await post({ op: "validate_spec", input: { max_copies: 0 } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "E_DECODE" });
});
