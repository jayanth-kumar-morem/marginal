/**
 * The chain's height, which is what an expiry is counted from (SDD §3.20).
 *
 * A credential and a payout approval both carry `expiry_height`, and clearing refuses either once
 * the chain has passed it. So the service has to know where the chain is: an expiry counted from
 * anything else — zero, or a clock — is already in the past on a network that has run for a day.
 * This reads the final block's height from the RPC and keeps it fresh. A reading that is half a
 * minute old is fine, because what is issued is valid for an hour of blocks.
 */

/** How often the height is read again. */
export const HEIGHT_REFRESH_MS = 30_000;

export interface ChainHeight {
  /** The last height read, or zero if none has been. */
  height(): number;
  /** Reads it again. Called at start and then on a timer. */
  refresh(): Promise<number>;
  stop(): void;
}

export interface ChainHeightOptions {
  readonly fetchImpl?: typeof globalThis.fetch;
  /** Overridable so a test does not have to wait half a minute. */
  readonly everyMs?: number;
  readonly onError?: (error: Error) => void;
}

export function chainHeight(rpcUrl: string, options: ChainHeightOptions = {}): ChainHeight {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let last = 0;
  const refresh = async (): Promise<number> => {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "compliance", method: "block", params: { finality: "final" } }),
    });
    const reply = (await response.json()) as { result?: { header?: { height?: unknown } } };
    const height = reply.result?.header?.height;
    if (typeof height !== "number" || !Number.isInteger(height) || height <= 0) {
      throw new Error(`the RPC at ${rpcUrl} returned no block height`);
    }
    // A height never goes backwards: an RPC that is behind must not shorten what is issued next.
    last = Math.max(last, height);
    return last;
  };
  const timer = setInterval(() => {
    void refresh().catch((error: unknown) => options.onError?.(error as Error));
  }, options.everyMs ?? HEIGHT_REFRESH_MS);
  timer.unref();
  return { height: () => last, refresh, stop: () => clearInterval(timer) };
}
