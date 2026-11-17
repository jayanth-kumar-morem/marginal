/**
 * The chain's height, which is what an expiry is counted from (SDD §3.20).
 *
 * A credential and a payout approval both carry `expiry_height`, and clearing refuses either once
 * the chain has passed it. So the service has to know where the chain is: an expiry counted from
 * anything else — zero, or a clock — is already in the past on a network that has run for a day.
 * This reads the final block's height from the RPC and keeps it fresh. A reading that is half a
 * minute old is fine, because what is issued is valid for an hour of blocks.
 *
 * `rpcUrl` may name several endpoints separated by commas, as it may for the agent and the web app:
 * a free public RPC refuses a shared host without warning, and one refusal at start must not keep
 * the service down.
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
  const urls = rpcUrl
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url !== "");
  if (urls.length === 0) throw new Error("MARGINAL_RPC_URL names no endpoint");
  let last = 0;
  const read = async (url: string): Promise<number> => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "compliance", method: "block", params: { finality: "final" } }),
    });
    const reply = (await response.json()) as { result?: { header?: { height?: unknown } } };
    const height = reply.result?.header?.height;
    if (typeof height !== "number" || !Number.isInteger(height) || height <= 0) {
      throw new Error(`the RPC at ${url} returned no block height`);
    }
    return height;
  };
  const refresh = async (): Promise<number> => {
    let failure: unknown;
    for (const url of urls) {
      try {
        // A height never goes backwards: an RPC that is behind must not shorten what is issued next.
        last = Math.max(last, await read(url));
        return last;
      } catch (error: unknown) {
        failure = error;
      }
    }
    throw failure;
  };
  const timer = setInterval(() => {
    void refresh().catch((error: unknown) => options.onError?.(error as Error));
  }, options.everyMs ?? HEIGHT_REFRESH_MS);
  timer.unref();
  return { height: () => last, refresh, stop: () => clearInterval(timer) };
}
