/**
 * The compliance service's entry point (E11.1).
 *
 * Its own deploy and its own container, because it holds the two keys that can grant something.
 * Both seeds come from the environment and neither is ever logged.
 */
import { fromEnv, listFrom, portFrom, reporter, stdout } from "@marginal/service-common";

import { serve, sdnUrlFrom, type Compliance } from "./index.js";

function seed(env: NodeJS.ProcessEnv, name: string): Uint8Array {
  const hex = fromEnv(env, name);
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`${name} must be 32 bytes of hex`);
  return new Uint8Array(Buffer.from(hex, "hex"));
}

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = stdout,
): Promise<Compliance & { port: number }> {
  const service = await serve(
    {
      chainId: fromEnv(env, "MARGINAL_CHAIN_ID"),
      clearing: fromEnv(env, "MARGINAL_CLEARING"),
      issuerSeed: seed(env, "MARGINAL_ISSUER_SEED"),
      complianceSeed: seed(env, "MARGINAL_COMPLIANCE_SEED"),
      allowed: listFrom(env, "MARGINAL_ALLOWED_IDENTITIES"),
      sdn: { url: sdnUrlFrom(env) },
      onError: reporter(log),
    },
    portFrom(env, 8083),
  );
  log(`compliance on ${service.port}, list ${service.list().entries} addresses`);
  return service;
}
