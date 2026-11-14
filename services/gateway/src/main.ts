/**
 * The gateway's entry point (E11.1). Configuration is the operator's, because the gateway is
 * untrusted: nothing here is a secret a room depends on, and the one key it holds — the HMAC that
 * signs upload grants — only binds an upload to the object it was granted for.
 */
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";

import { fromEnv, portFrom, reporter, stdout } from "@marginal/service-common";
import { chainClient, replayer } from "@marginal/replay-ts";

import { serve } from "./index.js";

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = stdout,
): Promise<{ server: Server; port: number }> {
  const directory = fromEnv(env, "MARGINAL_BLOB_DIR");
  // A generated secret is fine for a demo: it only invalidates grants in flight when the gateway
  // restarts. A deployment that wants uploads to survive a restart sets one.
  const secret =
    env.MARGINAL_UPLOAD_SECRET === undefined
      ? new Uint8Array(randomBytes(32))
      : new Uint8Array(Buffer.from(env.MARGINAL_UPLOAD_SECRET, "hex"));
  // `/v1/replay/:id` answers once the gateway is told where the chain and the clearing contract
  // are. The verifier is `@marginal/replay-ts`, the same code the web app and a shell run, so the
  // gateway adds nothing to it and cannot change what it finds (E12.2).
  const rpc = env.MARGINAL_RPC_URL;
  const clearing = env.MARGINAL_CLEARING;
  const replay =
    rpc === undefined || clearing === undefined
      ? undefined
      : replayer(chainClient(rpc), clearing);
  const started = await serve(
    { directory, secret, replay, onError: reporter(log) },
    portFrom(env, 8081),
  );
  log(
    `gateway on ${started.port}, objects in ${directory}` +
      (replay === undefined ? ", replay not configured" : `, replay against ${clearing}`),
  );
  return started;
}
