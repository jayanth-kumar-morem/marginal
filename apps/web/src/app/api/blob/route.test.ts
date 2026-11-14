import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

import { POST } from "./route";

// `loadConfig` refuses a deployment with no contracts, and the route reads the gateway from it.
process.env.MARGINAL_CLEARING = "clearing.sandbox";
process.env.MARGINAL_KEYPOLICY = "keypolicy.sandbox";

/**
 * A stand-in gateway that speaks the real protocol (`services/gateway/src/blobs.ts`): a grant names
 * the key, the hash and the size, and the put is accepted only with that grant's token and only if
 * the bytes hash to what the grant said. The real service is not importable from here — it is
 * another workspace package — so this checks the wire, which is what the proxy has to get right.
 */
async function stubGateway(): Promise<{ server: Server; url: string; stored: Map<string, Buffer> }> {
  const stored = new Map<string, Buffer>();
  const grants = new Map<string, { sha256: string; size: number }>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = request.url ?? "";
      if (request.method === "POST" && url === "/v1/uploads") {
        const asked = JSON.parse(body.toString("utf8")) as { key: string; sha256: string; size: number };
        const token = `token-${grants.size}`;
        grants.set(token, { sha256: asked.sha256, size: asked.size });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ key: asked.key, token, expires: 1, max: 1 << 24 }));
        return;
      }
      if (request.method === "PUT" && url.startsWith("/v1/blob/")) {
        const grant = grants.get(String(request.headers["x-upload-token"]));
        if (grant === undefined) {
          response.writeHead(403).end("no grant");
          return;
        }
        const sha256 = createHash("sha256").update(body).digest("hex");
        if (sha256 !== grant.sha256 || body.length !== grant.size) {
          response.writeHead(400).end("not the bytes the grant named");
          return;
        }
        stored.set(url.slice("/v1/blob/".length), body);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ key: url, sha256 }));
        return;
      }
      response.writeHead(404).end("no such route");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}`, stored };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://app.invalid/api/blob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("the route uploads the sealed object to the gateway the manifest names", async () => {
  const gateway = await stubGateway();
  process.env.MARGINAL_GATEWAY_URL = gateway.url;
  try {
    const bytes = Buffer.from("a sealed listing object", "utf8");
    const response = await post({
      key: "listings/1/v1/good",
      bytesHex: bytes.toString("hex"),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: {
        key: "listings/1/v1/good",
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    // The bytes the gateway kept are the bytes the browser sent, and they are not the plaintext.
    assert.deepEqual(gateway.stored.get("listings/1/v1/good"), bytes);
  } finally {
    gateway.server.close();
  }
});

test("a gateway that is not running is reported, not thrown", async () => {
  const gateway = await stubGateway();
  const url = gateway.url;
  gateway.server.close();
  await once(gateway.server, "close");
  process.env.MARGINAL_GATEWAY_URL = url;

  const response = await post({ key: "listings/1/v1/dek", bytesHex: "00ff" });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /did not answer/);
});
