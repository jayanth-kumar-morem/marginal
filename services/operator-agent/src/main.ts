/**
 * The operator agent's entry point (E11.1).
 *
 * It holds the two things a room must not: a funded NEAR key and the NEAR AI key. Both come from
 * the environment, because the agent runs on the host — the room's own configuration is baked into
 * its measurement precisely so that the host cannot choose it, and this is the other side of that
 * line.
 */
import type { Server } from "node:http";
import type { KeyPairString } from "near-api-js";

import { fromEnv, portFrom, reporter, stdout } from "@marginal/service-common";

import { nearRelay } from "./near.js";
import { nearAiBaseFrom, serve } from "./index.js";

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = stdout,
): Promise<{ server: Server; port: number }> {
  const started = await serve(
    {
      relay: nearRelay(
        fromEnv(env, "MARGINAL_RPC_URL"),
        fromEnv(env, "MARGINAL_AGENT_ACCOUNT"),
        fromEnv(env, "MARGINAL_AGENT_KEY") as KeyPairString,
      ),
      clearing: fromEnv(env, "MARGINAL_CLEARING"),
      keypolicy: fromEnv(env, "MARGINAL_KEYPOLICY"),
      gatewayUrl: fromEnv(env, "MARGINAL_GATEWAY_URL"),
      nearAiKey: env.MARGINAL_NEARAI_KEY,
      nearAiBase: nearAiBaseFrom(env),
      fetchImpl: globalThis.fetch,
      onError: reporter(log),
    },
    portFrom(env, 8082),
  );
  // Never the key, and never which key: an operator reading logs should not learn one.
  log(
    `operator agent on ${started.port}, judges ${env.MARGINAL_NEARAI_KEY === undefined ? "simulated" : "live"}`,
  );
  return started;
}
