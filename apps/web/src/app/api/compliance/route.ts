/**
 * `/api/compliance` (E13.7, D8).
 *
 * Next allows a route file to export nothing but its verbs, so everything this does lives in
 * `@/lib/compliance` and is tested there; what is left here is the wiring that cannot be: the
 * manifest, the chain client, `marginal-core`'s wasm and the clock.
 *
 * It exists because the browser cannot reach any of those directly. The compliance service sends no
 * CORS headers, `@marginal/core-wasm` loads `core.wasm` through `node:fs`, and the app's CSP opens
 * `connect-src` to its own origin only (plus the RPC the build was configured with, which is not a
 * sandbox's loopback port). Same-origin through here works on every profile.
 */
import { call } from "@marginal/core-wasm";

// Relative, not `@/`: these are the only imports in the app that both Next and a bare `node --test`
// have to resolve. `pnpm cov` runs the tests from the repository root, where tsx finds no tsconfig
// to read the alias from, so an aliased import here makes this route untestable and ungated.
import { chainClient } from "../../../lib/chain";
import {
  handleRequest,
  type AuditStep,
  type ComplianceDeps,
  type SealedDelivery,
} from "../../../lib/compliance";
import { loadConfig } from "../../../lib/config.server";

/** The audit chain's step, from the one implementation the contract itself uses (§3.10). */
const step: AuditStep = (prevHead, entry) =>
  call("audit_step", { prev_head: prevHead, entry }) as string;

/** Read per request: the deploy manifest is written per run and is not importable. */
function deps(): ComplianceDeps {
  const config = loadConfig();
  return {
    config,
    chain: chainClient(config.rpcUrl),
    step,
    fetchImpl: globalThis.fetch,
    decodeDelivery: (bytes) => call("delivery_decode", { bytes }) as SealedDelivery,
    now: Date.now,
  };
}

/** Never cached: an audit answer that is a minute old is an audit answer that is wrong. */
export const dynamic = "force-dynamic";

export const GET = (request: Request): Promise<Response> => handleRequest(request, deps());

export const POST = (request: Request): Promise<Response> => handleRequest(request, deps());
