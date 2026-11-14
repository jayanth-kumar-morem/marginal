/**
 * Reading the chain from the browser (E13.1).
 *
 * There is no indexer in M1 (`tasks.md`, "What M1 cuts"): every page reads contract views over
 * plain JSON-RPC, exactly as the room does in `room/src/chain.ts`. This is the same client without
 * `Buffer`, so it runs in a browser and in `node:test` alike.
 *
 * Two conventions come from the contracts and are easy to get wrong: `u64` ids cross the wire as
 * **decimal strings** (they are `U64` in the interface), and `u128` amounts come back as decimal
 * strings too, so nothing here ever turns an amount into a `number`.
 */

export type Fetch = typeof globalThis.fetch;

/** What a page needs of the chain: one view call. */
export interface ChainPort {
  view<T>(contract: string, method: string, args?: unknown): Promise<T>;
}

/** Base64 of a UTF-8 string, without `Buffer`. */
export function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface RpcReply {
  result?: { result?: number[]; error?: string };
  error?: { message?: string; data?: unknown };
}

/**
 * A view client for one RPC endpoint. A view that refuses (a panic, a missing contract) throws with
 * the chain's own message, so a page can show `E_BUDGET_EXHAUSTED` as itself rather than "failed".
 */
export function chainClient(rpcUrl: string, fetchImpl: Fetch = globalThis.fetch): ChainPort {
  return {
    async view<T>(contract: string, method: string, args: unknown = {}): Promise<T> {
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "marginal",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: contract,
            method_name: method,
            args_base64: base64(JSON.stringify(args)),
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`${method}: the RPC answered ${response.status}`);
      }
      const reply = (await response.json()) as RpcReply;
      if (reply.error !== undefined) {
        throw new Error(`${method}: ${reply.error.message ?? "the RPC refused the query"}`);
      }
      const inner = reply.result;
      if (inner?.error !== undefined) {
        throw new Error(`${method}: ${inner.error}`);
      }
      if (inner?.result === undefined) {
        throw new Error(`${method}: the RPC returned no result`);
      }
      return JSON.parse(new TextDecoder().decode(new Uint8Array(inner.result))) as T;
    },
  };
}

/**
 * The latest final block height. Pages that offer `refund_expired` need it: a deadline is a height,
 * not a time, so "has this job expired" cannot be answered from the clock.
 */
export async function blockHeight(
  rpcUrl: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<number> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "marginal",
      method: "block",
      params: { finality: "final" },
    }),
  });
  const reply = (await response.json()) as { result?: { header?: { height?: number } } };
  const height = reply.result?.header?.height;
  if (typeof height !== "number") throw new Error("the RPC returned no block height");
  return height;
}

/** The error message a view threw, reduced to the contract's own code when it carries one. */
export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(E_[A-Z0-9_]+)\b/.exec(message)?.[1] ?? message;
}
