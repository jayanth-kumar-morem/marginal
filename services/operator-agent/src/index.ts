/**
 * The operator agent (SDD §3.13, §2.7, §3.14.3; E11.3): the host-side half of a room.
 *
 * It exists because the room cannot hold a funded NEAR key — anything it signed with one would be a
 * key the host could use after a restart, and the room has no durable storage anyway. So the room
 * produces **signed messages** and the agent pays the gas.
 *
 * The agent is untrusted and the design makes that cheap. Every message it relays is signed by the
 * room and bound to this chain, this contract and this job, so it cannot alter one; the collateral
 * it adds is checked by the verifier; and the only secret it holds that the room does not is the
 * NEAR AI key, which is exactly why the judge call goes through here rather than into the measured
 * image.
 */
import { createHash } from "node:crypto";
import type { Server } from "node:http";

import { HttpError, jsonServer, listen, required, type Routes } from "@marginal/service-common";

import { fetchCollateral, type Collateral, type CollateralOptions } from "./collateral.js";
import { DEFAULT_GAS, REGISTER_GAS, type Relay } from "./near.js";

export const PACKAGE = "@marginal/operator-agent";

export { nearRelay, transactionValue, DEFAULT_GAS, REGISTER_GAS, type Relay } from "./near.js";
export { fetchCollateral, PCCS_URL, type Collateral, type CollateralOptions } from "./collateral.js";

/** Storage for a registration record, paid by the caller (KeyPolicy has no owner to top it up). */
export const REGISTER_DEPOSIT = 10_000_000_000_000_000_000_000n;
/** A ticket's storage, the same way. */
export const TICKET_DEPOSIT = 1_000_000_000_000_000_000_000n;

/** The two contracts a room may ask the agent to call, and nothing else. */
type Contract = "clearing" | "keypolicy";
/** The methods a room may ask for, per contract. An allow-list, not a filter. */
const ALLOWED: Record<Contract, readonly string[]> = {
  keypolicy: ["authorize", "derive"],
  clearing: ["submit_verdict", "submit_delivery_receipt", "submit_provisioning", "submit_screening"],
};

export interface AgentOptions {
  readonly relay: Relay;
  readonly clearing: string;
  readonly keypolicy: string;
  /** Where the room's objects are kept (the gateway). */
  readonly gatewayUrl: string;
  /** NEAR AI's key. It lives here, never in the measured image (§3.14.3). */
  readonly nearAiKey?: string;
  /** NEAR AI's API. Explicit, so a deployment or a test says where it is going. */
  readonly nearAiBase: string;
  readonly collateral?: CollateralOptions;
  /** How the agent reaches the gateway and NEAR AI. Explicit for the same reason. */
  readonly fetchImpl: typeof globalThis.fetch;
  readonly onError?: (error: Error) => void;
}

/** NEAR AI's API, which the agent forwards to. */
export const NEAR_AI_BASE = "https://cloud-api.near.ai";
/** Where NEAR AI is: the environment's choice, or its own API. */
export function nearAiBaseFrom(env: NodeJS.ProcessEnv): string {
  const given = env.MARGINAL_NEARAI_BASE;
  if (given === undefined || given.trim() === "") return NEAR_AI_BASE;
  return given.trim();
}

/** Which of the two contracts a room asked for. Anything else is clearing, its usual business. */
export function contractOf(value: unknown): Contract {
  if (value === "keypolicy") return "keypolicy";
  return "clearing";
}

/** A nonce KeyPolicy issued, or nothing: the room signs over it, so it is checked here. */
export function asNonce(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(502, "KeyPolicy did not return a nonce");
  if (!/^[0-9a-f]{64}$/.test(value)) throw new HttpError(502, "KeyPolicy did not return a nonce");
  return value;
}

/** Only these two paths: the room's one route to a judge (§3.14.3). */
const JUDGE_PATH = /^\/v1\/(chat\/completions|signature\/[A-Za-z0-9_-]+)$/;

export function agent(options: AgentOptions): Server {
  const fetchImpl = options.fetchImpl;
  const account = (contract: Contract): string =>
    contract === "clearing" ? options.clearing : options.keypolicy;

  /**
   * The room's only route to NEAR AI, on both methods it needs: the completion is a POST and the
   * signature a GET.
   */
  function judge(request: Parameters<Routes[string]>[0]): Promise<{
    status: number;
    bytes: Buffer;
    contentType: string;
  }> {
    if (options.nearAiKey === undefined) throw new HttpError(503, "this deployment has no judge key");
    const path = `/${request.rest}`;
    if (!JUDGE_PATH.test(path)) throw new HttpError(403, "that is not a judge path");
    const query = request.query.size > 0 ? `?${request.query.toString()}` : "";
    return fetchImpl(`${options.nearAiBase}${path}${query}`, {
      method: request.bytes.length > 0 ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.nearAiKey}`,
        // Forced, not forwarded: aliasing would change the signed model id and make the signature
        // the gateway's rather than the model's TEE, which is not the room's choice to make (§3.16).
        "x-no-aliasing": "true",
        "accept-encoding": "identity",
      },
      body: request.bytes.length > 0 ? new Uint8Array(request.bytes) : undefined,
    }).then((forwarded) =>
      // The body is passed through untouched, and never logged: it is the thing the provider's TEE
      // signed over, and in Open mode it ends up on chain.
      forwarded.arrayBuffer().then((bytes) => ({
        status: forwarded.status,
        bytes: Buffer.from(bytes),
        contentType: "application/json",
      })),
    );
  }

  const routes: Routes = {
    "GET /v1/health": () => ({ json: { ok: true, package: PACKAGE } }),

    /** A nonce for a registration. It is bound to this account, so the same key must spend it. */
    "POST /v1/nonce": () =>
      options.relay
        .call(options.keypolicy, "issue_nonce", {}, DEFAULT_GAS, TICKET_DEPOSIT)
        .then((nonce) => ({ json: { nonce: asNonce(nonce) } })),

    /**
     * Relays a registration. The agent adds the collateral and the deposit; everything the
     * verifier checks is in the room's own bytes.
     */
    "POST /v1/register": async (request) => {
      const bundle = request.body as { quote?: unknown } | null;
      const quote = required(bundle, "quote");
      return fetchCollateral(quote, options.collateral).then((collateral: Collateral) =>
        options.relay
          .call(
            options.keypolicy,
            "register_room",
            { ...(bundle as Record<string, unknown>), collateral },
            REGISTER_GAS,
            REGISTER_DEPOSIT,
          )
          .then((registered) => ({ json: { registered } })),
      );
    },

    /** Relays one of the room's signed calls, and only a method the room is allowed to ask for. */
    "POST /v1/submit": async (request) => {
      const asked = request.body as { contract?: unknown; method?: unknown; args?: unknown } | null;
      const contract = contractOf(asked?.contract);
      const method = required(asked, "method");
      if (!(ALLOWED[contract] as readonly string[]).includes(method)) {
        throw new HttpError(403, `the room may not call ${method} on ${contract}`);
      }
      if (typeof asked?.args !== "object" || asked.args === null) {
        throw new HttpError(400, "args is required");
      }
      const deposit = method === "authorize" ? TICKET_DEPOSIT : 0n;
      return {
        json: await options.relay.call(
          account(contract),
          method,
          asked.args as Record<string, unknown>,
          DEFAULT_GAS,
          deposit,
        ),
      };
    },

    /** The room has no network, so its objects go to and come from the gateway through here. */
    "POST /v1/blob/put": (request) => {
      const key = required(request.body, "key");
      const bytes = new Uint8Array(Buffer.from(required(request.body, "bytes"), "hex"));
      const grant = fetchImpl(`${options.gatewayUrl}/v1/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          size: bytes.length,
        }),
      });
      return grant
        .then((granted) => {
          if (!granted.ok) throw new HttpError(502, "the gateway refused the upload");
          return granted.json() as Promise<{ token: string }>;
        })
        .then(({ token }) =>
          fetchImpl(`${options.gatewayUrl}/v1/blob/${key}`, {
            method: "PUT",
            headers: { "x-upload-token": token },
            body: bytes,
          }),
        )
        .then((put) => {
          if (!put.ok) throw new HttpError(502, "the gateway refused the object");
          return { json: { key } };
        });
    },
    "POST /v1/blob/get": (request) => {
      const key = required(request.body, "key");
      return fetchImpl(`${options.gatewayUrl}/v1/blob/${key}`).then((got) => {
        if (!got.ok) throw new HttpError(got.status === 404 ? 404 : 502, "no such object");
        return got.arrayBuffer().then((bytes) => ({ json: { bytes: Buffer.from(bytes).toString("hex") } }));
      });
    },

    /**
     * The room's only route to NEAR AI. The agent adds the key and nothing else: the body, the
     * model and the `x-no-aliasing` header are the room's, because they are what the provider's
     * TEE signs over (§3.16).
     */
    "POST /v1/judge/*": judge,
    "GET /v1/judge/*": judge,
  };
  return jsonServer(routes, options.onError);
}

export async function serve(options: AgentOptions, port: number): Promise<{ server: Server; port: number }> {
  const server = agent(options);
  return { server, port: await listen(server, port) };
}
