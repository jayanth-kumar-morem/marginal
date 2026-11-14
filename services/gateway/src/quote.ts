/**
 * The 1Click dry-quote proxy (SDD §3.22, D7; E11.2).
 *
 * A seller's payout route is priced by NEAR Intents' 1Click API. The quote is shown and then
 * thrown away: it is **indicative**, it is not stored, and the response body is never logged,
 * because it describes where one named person's money is going. The gateway is untrusted, so the
 * less it keeps the better — and a dry quote is the one call where keeping nothing is also correct,
 * since a stale quote shown as current would misprice a payout.
 */
import { HttpError } from "@marginal/service-common";

/** NEAR Intents' 1Click API. */
export const ONE_CLICK_BASE = "https://1click.chaindefuser.com";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface QuoteOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/**
 * Forwards a dry quote and returns what came back. `dry: true` is forced: this proxy can never
 * commit anyone to a swap, whatever the caller asked for.
 */
export async function dryQuote(request: unknown, options: QuoteOptions = {}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const base = options.baseUrl ?? ONE_CLICK_BASE;
  if (typeof request !== "object" || request === null) throw new HttpError(400, "a quote needs a request");
  let response: Response;
  try {
    response = await fetchImpl(`${base}/v0/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(request as Record<string, unknown>), dry: true }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, "the quote service did not answer");
  }
  const text = await response.text();
  if (!response.ok) throw new HttpError(502, `the quote service refused with ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "the quote service did not answer with JSON");
  }
}
