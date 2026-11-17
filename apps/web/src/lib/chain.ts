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
 * The endpoints an RPC setting names. `MARGINAL_RPC_URL` may be one URL or several separated by
 * commas, and a hand-typed list is forgiven its spaces and its trailing comma.
 */
export function endpoints(rpcUrl: string): readonly string[] {
  const urls = rpcUrl
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url !== "");
  if (urls.length === 0) throw new Error("no RPC endpoint is configured");
  return urls;
}

/** What the contract itself said no to: an answer, so no other endpoint is asked the same thing. */
class ViewRefused extends Error {}

async function post(url: string, fetchImpl: Fetch, method: string, params: unknown): Promise<RpcReply> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "marginal", method, params }),
  });
  if (!response.ok) throw new Error(`the RPC answered ${response.status}`);
  return (await response.json()) as RpcReply;
}

async function viewAt<T>(
  url: string,
  fetchImpl: Fetch,
  contract: string,
  method: string,
  args: unknown,
): Promise<T> {
  const reply = await post(url, fetchImpl, "query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: base64(JSON.stringify(args)),
  });
  if (reply.error !== undefined) {
    throw new Error(reply.error.message ?? "the RPC refused the query");
  }
  const inner = reply.result;
  if (inner?.error !== undefined) throw new ViewRefused(inner.error);
  if (inner?.result === undefined) throw new Error("the RPC returned no result");
  return JSON.parse(new TextDecoder().decode(new Uint8Array(inner.result))) as T;
}

/**
 * Asks each endpoint in turn, starting at `first`, until one answers. Only an endpoint's own
 * failure moves on — it is down, or it has had enough of this host (a free public RPC answers 429
 * after a few hundred calls a minute, and one page here makes a hundred). What the contract said is
 * the answer wherever it is asked, so a refusal from the contract is thrown at once.
 */
async function firstAnswer<T>(
  urls: readonly string[],
  first: number,
  what: string,
  ask: (url: string) => Promise<T>,
): Promise<T> {
  let failure = "";
  for (let turn = 0; turn < urls.length; turn += 1) {
    try {
      return await ask(urls[(first + turn) % urls.length] as string);
    } catch (error: unknown) {
      failure = (error as Error).message;
      if (error instanceof ViewRefused) break;
    }
  }
  throw new Error(`${what}: ${failure}`);
}

/**
 * A view client. A view that refuses (a panic, a missing contract) throws with the chain's own
 * message, so a page can show `E_BUDGET_EXHAUSTED` as itself rather than "failed".
 *
 * `rpcUrl` may name several endpoints ({@link endpoints}). Each call starts at the next one, so the
 * load is spread across them, and moves on from one that does not answer.
 */
export function chainClient(rpcUrl: string, fetchImpl: Fetch = globalThis.fetch): ChainPort {
  const urls = endpoints(rpcUrl);
  let next = 0;
  return {
    view<T>(contract: string, method: string, args: unknown = {}): Promise<T> {
      const first = next;
      next = (next + 1) % urls.length;
      return firstAnswer(urls, first, method, (url) => viewAt<T>(url, fetchImpl, contract, method, args));
    },
  };
}

/** How long a server-rendered page may reuse a view's answer: a few blocks. */
export const PAGE_VIEW_TTL_MS = 15_000;

interface Kept {
  readonly at: number;
  readonly answer: Promise<unknown>;
}

/**
 * A port that asks the chain once for what several readers ask within `ttlMs`.
 *
 * There is no indexer, so a page enumerates the market one view at a time: `/listings` is a hundred
 * calls and `/compliance` more than two hundred. Without this, two people opening the site in the
 * same minute spend a free RPC's whole allowance and the third sees an error. Readers who ask while
 * a call is in flight share it; a failed call is not kept, so the next reader asks again.
 *
 * It is for pages a server renders, where a few seconds' age is invisible. A browser that has just
 * signed something reads through {@link chainClient} directly, because it is waiting for exactly
 * the change a kept answer would hide.
 */
export function cached(
  port: ChainPort,
  ttlMs: number,
  kept: Map<string, Kept> = new Map(),
  now: () => number = Date.now,
): ChainPort {
  return {
    view<T>(contract: string, method: string, args: unknown = {}): Promise<T> {
      const key = `${contract}\n${method}\n${JSON.stringify(args)}`;
      const hit = kept.get(key);
      if (hit !== undefined && now() - hit.at < ttlMs) return hit.answer as Promise<T>;
      const answer = port.view<T>(contract, method, args);
      kept.set(key, { at: now(), answer });
      answer.catch(() => {
        if (kept.get(key)?.answer === answer) kept.delete(key);
      });
      return answer;
    },
  };
}

/** One store per RPC setting, shared by every request this server process renders. */
const PAGE_STORES = new Map<string, Map<string, Kept>>();

/** The port a server-rendered page reads through: {@link chainClient} behind {@link cached}. */
export function pageChain(rpcUrl: string, fetchImpl: Fetch = globalThis.fetch): ChainPort {
  let kept = PAGE_STORES.get(rpcUrl);
  if (kept === undefined) {
    kept = new Map();
    PAGE_STORES.set(rpcUrl, kept);
  }
  return cached(chainClient(rpcUrl, fetchImpl), PAGE_VIEW_TTL_MS, kept);
}

/**
 * The latest final block height. Pages that offer `refund_expired` need it: a deadline is a height,
 * not a time, so "has this job expired" cannot be answered from the clock.
 */
export function blockHeight(rpcUrl: string, fetchImpl: Fetch = globalThis.fetch): Promise<number> {
  return firstAnswer(endpoints(rpcUrl), 0, "block", async (url) => {
    const reply = (await post(url, fetchImpl, "block", { finality: "final" })) as {
      result?: { header?: { height?: number } };
    };
    const height = reply.result?.header?.height;
    if (typeof height !== "number") throw new Error("the RPC returned no block height");
    return height;
  });
}

/** The error message a view threw, reduced to the contract's own code when it carries one. */
export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(E_[A-Z0-9_]+)\b/.exec(message)?.[1] ?? message;
}

/**
 * Reads back what a signed call just created, asking again while the answer is still empty.
 *
 * A write and a read do not see the same chain at the same moment. The signer broadcasts with
 * `broadcast_tx_commit`, which returns once the transaction has **executed**; a view call asks for
 * **final** state, which trails execution by a block or two. So a single read-back misses what was
 * just made, and the page says it is not there — observed on a live sandbox, where the wizard
 * reported "the chain has no listing for this account yet" about a listing that was already on
 * chain and about to be screened.
 *
 * Retrying is the honest fix: nothing is assumed about what the write did, the chain is simply
 * asked again until it agrees or the attempts run out. An error is returned at once — only
 * emptiness is worth waiting through.
 */
export async function settled<T>(
  read: () => Promise<{ ok: T | null } | { error: string }>,
  attempts = 8,
  waitMs = 750,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ ok: T | null } | { error: string }> {
  let last: { ok: T | null } | { error: string } = { ok: null };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(waitMs);
    last = await read();
    if ("error" in last || last.ok !== null) return last;
  }
  return last;
}
