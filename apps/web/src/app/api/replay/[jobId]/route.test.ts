import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

import { GET } from "./route";

/**
 * A chain that answers every view with `null`, so the route's successful path can be taken: the
 * verifier then reports, correctly, that there is no such job. What is under test here is the route,
 * not the verifier — `verifiers/replay-ts` has its own tests.
 */
function nullChain(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "marginal",
            result: { result: [...Buffer.from("null", "utf8")] },
          }),
        );
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/** The route reads its configuration from the environment, like every server component does. */
function withConfig<T>(f: () => Promise<T>): Promise<T> {
  process.env.MARGINAL_CLEARING = "clearing.sandbox";
  process.env.MARGINAL_KEYPOLICY = "keypolicy.sandbox";
  // Port 1 is never listening, so the verifier's chain call fails rather than hanging.
  process.env.MARGINAL_RPC_URL = "http://127.0.0.1:1";
  return f().finally(() => {
    delete process.env.MARGINAL_CLEARING;
    delete process.env.MARGINAL_KEYPOLICY;
    delete process.env.MARGINAL_RPC_URL;
  });
}

const params = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

test("a job id that is not one is refused before any chain call", async () => {
  for (const bad of ["abc", "0", "-1", "1.5", ""]) {
    const response = await GET(new Request("http://localhost/api/replay"), params(bad));
    assert.equal(response.status, 400, bad);
    assert.match(((await response.json()) as { error: string }).error, /is not a job id/);
  }
});

test("a chain that does not answer is a gateway error, not a failed verification", async () => {
  await withConfig(async () => {
    const response = await GET(new Request("http://localhost/api/replay/1"), params("1"));
    assert.equal(response.status, 502);
    const body = (await response.json()) as { error: string };
    assert.ok(body.error.length > 0);
  });
});

test("a configuration with no clearing account refuses rather than guessing", async () => {
  const response = await GET(new Request("http://localhost/api/replay/1"), params("1"));
  assert.equal(response.status, 502);
  assert.match(((await response.json()) as { error: string }).error, /no clearing or keypolicy/);
});

test("a chain that answers gives the verifier's report back as it is", async () => {
  const chain = await nullChain();
  process.env.MARGINAL_CLEARING = "clearing.sandbox";
  process.env.MARGINAL_KEYPOLICY = "keypolicy.sandbox";
  process.env.MARGINAL_RPC_URL = chain.url;
  try {
    const response = await GET(new Request("http://localhost/api/replay/1"), params("1"));
    assert.equal(response.status, 200);
    const report = (await response.json()) as { job_id: number; ok: boolean; checks: unknown[] };
    assert.equal(report.job_id, 1);
    assert.equal(report.ok, false, "there is no such job, which is a finding, not an error");
    assert.deepEqual(report.checks, [
      { name: "job", ok: false, detail: "there is no such job" },
    ]);
  } finally {
    delete process.env.MARGINAL_CLEARING;
    delete process.env.MARGINAL_KEYPOLICY;
    delete process.env.MARGINAL_RPC_URL;
    await new Promise<void>((resolve) => chain.server.close(() => resolve()));
  }
});
