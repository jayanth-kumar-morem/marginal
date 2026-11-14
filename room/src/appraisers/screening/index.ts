/**
 * `screening@1` (SDD §3.15.2, E8.6's screening half; run as a job by E8.3).
 *
 * It runs once per listing version, before publication, and says only `Pass` or `Flag(reason)` with
 * a certificate. It debits no leakage budget, because the only thing it reveals is the flag itself
 * — `log₂(#codes)` bits to the seller, who owns the good anyway (SPEC §4.3.3).
 *
 * It never auto-clears: a `Pass` means nothing fired, not that the document is clean. The listing
 * goes to a consented review either way when something does fire (§3.4).
 */
import { EVENT_TERMS, INSIDER_PHRASES, ISSUER_LEXICON } from "./lexicon.js";

/** M1's only reason code: material non-public information (`marginal_core::reports::FLAG_MNPI`). */
export const FLAG_MNPI = 1;

/** `ScreeningResult` as clearing's interface spells it. */
export type ScreeningResult = "Pass" | { readonly Flag: { readonly reason: number } };

export interface Screening {
  readonly result: ScreeningResult;
  /**
   * Which terms fired, for the job log only. The log never holds the document, and this never
   * reaches the chain: what clearing gets is the reason code (§3.14.4).
   */
  readonly hits: readonly string[];
}

/**
 * Lower-cases and collapses whitespace, so a line break or a double space inside a phrase does not
 * hide it. Nothing else is normalised: the good was canonicalised to NFC on the client (§3.15.1).
 */
function flatten(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ");
}

function matches(haystack: string, needles: readonly string[]): string[] {
  return needles.filter((needle) => haystack.includes(needle));
}

/**
 * Screens a document's plaintext.
 *
 * Two ways to fire, and both are deliberate:
 *
 * - an **insider phrase** on its own, because a document that says it is not public is not public;
 * - an **event term together with a named issuer or protocol**, because "earnings" in a published
 *   market commentary is not MNPI, while "Acme Corp earnings" in an unpublished memo may be.
 */
export function screen(plaintext: string): Screening {
  const text = flatten(plaintext);
  const insider = matches(text, INSIDER_PHRASES);
  const events = matches(text, EVENT_TERMS);
  const issuers = matches(text, ISSUER_LEXICON);

  const hits = [...insider, ...(issuers.length > 0 ? events : []), ...(events.length > 0 ? issuers : [])];
  const flagged = insider.length > 0 || (events.length > 0 && issuers.length > 0);
  return {
    result: flagged ? { Flag: { reason: FLAG_MNPI } } : "Pass",
    hits,
  };
}
