/**
 * The operator agent (E11.3), which runs on the host, outside the TEE.
 *
 * The room cannot hold a funded NEAR key: anything it signed with one would be a key the host could
 * use after a restart, and the room has no durable storage anyway. So the room produces **signed
 * messages** and the operator agent pays the gas to relay them. The agent is untrusted: every
 * message it relays is signed by the room's key and bound to this chain, this contract and this
 * job, so the worst it can do is not relay one (SDD §2.7, §3.22).
 */
import type { Fetch } from "./chain.js";

/** What the room asks of the host. */
export interface OperatorPort {
  /** A fresh registration nonce from KeyPolicy, issued to the agent's own account (E3.3). */
  issueNonce(): Promise<string>;
  /** Relay a registration: the agent adds the collateral and encodes the call (E11.3). */
  register(bundle: unknown): Promise<void>;
  /**
   * Relay one of the room's signed calls and give back what it returned. `contract` says which of
   * the two the agent should call; most calls go to clearing, but the key-release pair
   * (`authorize`, `derive`) is KeyPolicy's. The return value matters for those two: one is a ticket
   * id and the other is the MPC network's answer (SDD §3.12.3).
   */
  submit(
    method: string,
    args: Record<string, unknown>,
    contract?: "clearing" | "keypolicy",
  ): Promise<unknown>;
  /**
   * Stores an object the room emitted — a certificate, a delivery, a job log — at `key`, with its
   * bytes as hex. The room has no route to the blob store itself, and nothing here is secret: each
   * object is either public or already sealed (SDD §3.18, §3.19).
   */
  putBlob(key: string, bytes: string): Promise<void>;
  /** Fetches an object by key, as hex. A worker has no network, so every read comes through here. */
  getBlob(key: string): Promise<string>;
}

async function post(
  fetchImpl: Fetch,
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`operator: HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return text === "" ? null : (JSON.parse(text) as unknown);
}

export function operatorClient(baseUrl: string, fetchImpl: Fetch = globalThis.fetch): OperatorPort {
  return {
    async issueNonce(): Promise<string> {
      const reply = (await post(fetchImpl, baseUrl, "/v1/nonce", {})) as { nonce?: unknown };
      const nonce = reply?.nonce;
      if (typeof nonce !== "string" || !/^[0-9a-f]{64}$/.test(nonce)) {
        throw new Error("operator: the nonce is not 32 bytes of hex");
      }
      return nonce;
    },
    async register(bundle: unknown): Promise<void> {
      await post(fetchImpl, baseUrl, "/v1/register", bundle);
    },
    async putBlob(key: string, bytes: string): Promise<void> {
      await post(fetchImpl, baseUrl, "/v1/blob/put", { key, bytes });
    },
    async getBlob(key: string): Promise<string> {
      const reply = (await post(fetchImpl, baseUrl, "/v1/blob/get", { key })) as {
        bytes?: unknown;
      } | null;
      const bytes = reply?.bytes;
      if (typeof bytes !== "string" || !/^([0-9a-f]{2})*$/.test(bytes)) {
        throw new Error(`operator: ${key} did not come back as hex`);
      }
      return bytes;
    },
    async submit(
      method: string,
      args: Record<string, unknown>,
      contract: "clearing" | "keypolicy" = "clearing",
    ): Promise<unknown> {
      return post(fetchImpl, baseUrl, "/v1/submit", { contract, method, args });
    },
  };
}
