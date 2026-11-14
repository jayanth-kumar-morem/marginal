import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "./route";

/** The route reads its configuration from the environment, like every server component does. */
async function withConfig<T>(f: () => Promise<T>): Promise<T> {
  process.env.MARGINAL_CLEARING = "clearing.sandbox";
  process.env.MARGINAL_KEYPOLICY = "keypolicy.sandbox";
  // Port 1 is never listening, so the gateway fetch fails rather than hanging.
  process.env.MARGINAL_GATEWAY_URL = "http://127.0.0.1:1";
  try {
    return await f();
  } finally {
    delete process.env.MARGINAL_CLEARING;
    delete process.env.MARGINAL_KEYPOLICY;
    delete process.env.MARGINAL_GATEWAY_URL;
  }
}

test("a request without a job, a listing and a version is refused before any fetch", async () => {
  await withConfig(async () => {
    const response = await GET(new Request("http://localhost/api/delivery?job=11"));
    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /positive integers/);
  });
});

test("a gateway that is not there is a 502 naming what did not answer", async () => {
  await withConfig(async () => {
    const response = await GET(
      new Request("http://localhost/api/delivery?job=11&listing=3&version=1"),
    );
    assert.equal(response.status, 502);
    assert.ok(((await response.json()) as { error: string }).error.length > 0);
  });
});
