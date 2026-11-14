/**
 * The gateway's entry point (E11.1). Configuration is the operator's, because the gateway is
 * untrusted: nothing here is a secret a room depends on, and the one key it holds — the HMAC that
 * signs upload grants — only binds an upload to the object it was granted for.
 */
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";

import { fromEnv, portFrom, reporter, stdout } from "@marginal/service-common";

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
  const started = await serve({ directory, secret, onError: reporter(log) }, portFrom(env, 8081));
  log(`gateway on ${started.port}, objects in ${directory}`);
  return started;
}
