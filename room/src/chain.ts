/**
 * Reading the chain from inside the room (SDD §3.22: "read state from contract views").
 *
 * Views only: a room never signs a transaction itself, it hands signed messages to the operator
 * agent (E11.3, `operator.ts`). This is plain JSON-RPC over `fetch` rather than `near-api-js`,
 * because a view call is one request and the room's dependencies are part of its measurement.
 */

/** A NEAR JSON-RPC `call_function` reply, as far as we read it. */
interface ViewResult {
  readonly result?: { readonly result?: number[] };
  readonly error?: { readonly message?: string; readonly data?: unknown };
}

export interface ChainPort {
  /** Calls a view method and parses its JSON answer. */
  view<T>(contract: string, method: string, args: unknown): Promise<T>;
}

/** One job the room has to answer, as `get_jobs_for_room` reports it (SDD issue 5). */
export interface RoomJob {
  readonly id: number;
  readonly kind: string;
  readonly listing_id: number;
  readonly listing_version: number;
  readonly state: string;
  readonly job_commitment: string;
  readonly deadline_height: number;
}

export type Fetch = typeof globalThis.fetch;

export function chainClient(rpcUrl: string, fetchImpl: Fetch = globalThis.fetch): ChainPort {
  return {
    async view<T>(contract: string, method: string, args: unknown): Promise<T> {
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "room",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: contract,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
          },
        }),
      });
      if (!response.ok) throw new Error(`rpc: HTTP ${response.status}`);
      const body = (await response.json()) as ViewResult;
      if (body.error) throw new Error(`rpc: ${body.error.message ?? "call failed"}`);
      const bytes = body.result?.result;
      if (bytes === undefined) throw new Error("rpc: no result");
      return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
    },
  };
}

/** The jobs this room still has to answer. Clearing drops one as soon as it is answered. */
export async function jobsForRoom(
  chain: ChainPort,
  clearing: string,
  roomKeyHex: string,
): Promise<readonly RoomJob[]> {
  return chain.view<RoomJob[]>(clearing, "get_jobs_for_room", { room_key: roomKeyHex });
}

/** Whether the registry still has this room, and until when (SDD §3.11). */
export interface RoomRecord {
  readonly expires_at: number;
  readonly current: boolean;
}

export async function roomRecord(
  chain: ChainPort,
  clearing: string,
  roomKeyHex: string,
): Promise<RoomRecord | null> {
  return chain.view<RoomRecord | null>(clearing, "get_room", { room_key: roomKeyHex });
}
