/**
 * The gateway (SDD §3.22, §2.7; E11.2): the one host service a browser talks to.
 *
 * It is **untrusted**, and the design leans on that. It holds no key that can move money, signs
 * nothing a contract believes, and stores only objects that are public or already sealed. A
 * compromised gateway can refuse to serve, or serve something stale — which is why every object it
 * serves is checked against a hash the chain already committed to, by whoever reads it.
 *
 * Three jobs: content-addressed uploads, a replay endpoint that re-verifies a settlement, and a
 * dry-quote proxy that keeps nothing.
 */
import type { Server } from "node:http";

import { HttpError, jsonServer, listen, type Routes } from "@marginal/service-common";

import { blobStore, grantToken, MAX_OBJECT_BYTES } from "./blobs.js";
import { dryQuote, type QuoteOptions } from "./quote.js";

export const PACKAGE = "@marginal/gateway";

export { blobStore, grantToken, checkKey, GRANT_TTL_SECONDS, MAX_OBJECT_BYTES } from "./blobs.js";
export { dryQuote, ONE_CLICK_BASE, type QuoteOptions } from "./quote.js";

/** What a settlement's replay says. `replay-ts` (E12.2) produces it; the gateway only serves it. */
export type Replay = (jobId: number) => Promise<unknown>;

export interface GatewayOptions {
  /** Where objects are kept. */
  readonly directory: string;
  /** The HMAC key upload grants are signed with. Per deployment, never shared with a client. */
  readonly secret: Uint8Array;
  /** E12.2's verifier. Absent means `/v1/replay` is not configured, and says so. */
  readonly replay?: Replay;
  readonly quote?: QuoteOptions;
  readonly onError?: (error: Error) => void;
  readonly now?: () => number;
}

export function gateway(options: GatewayOptions): Server {
  const store = blobStore(options.directory, options.secret, options.now);
  const routes: Routes = {
    "GET /v1/health": () => ({ json: { ok: true, package: PACKAGE } }),

    // An upload is two steps: say what you are about to put, then put exactly that.
    "POST /v1/uploads": (request) => {
      const granted = store.grant(request.body);
      return { json: { key: granted.key, token: grantToken(granted), expires: granted.expires, max: MAX_OBJECT_BYTES } };
    },
    "PUT /v1/blob/*": (request) => {
      const token = request.headers["x-upload-token"];
      if (typeof token !== "string") throw new HttpError(401, "an upload needs its token");
      return { json: store.put(request.rest, token, request.bytes) };
    },
    "GET /v1/blob/*": (request) => ({
      bytes: store.get(request.rest),
      contentType: "application/octet-stream",
    }),

    // Re-verification, for anyone: the verifier reads the chain and the objects and says what it
    // found. The gateway is not trusted to answer it, which is why the answer is reproducible.
    "GET /v1/replay/*": async (request) => {
      if (options.replay === undefined) throw new HttpError(503, "the verifier is not configured");
      const jobId = Number(request.rest);
      if (!Number.isInteger(jobId) || jobId < 0) throw new HttpError(400, "that is not a job id");
      return { json: await options.replay(jobId) };
    },

    "POST /v1/quote": async (request) => ({ json: await dryQuote(request.body, options.quote) }),
  };
  return jsonServer(routes, options.onError);
}

/** Starts the gateway. Returns the port, so a test can ask for a free one. */
export async function serve(options: GatewayOptions, port: number): Promise<{ server: Server; port: number }> {
  const server = gateway(options);
  return { server, port: await listen(server, port) };
}
