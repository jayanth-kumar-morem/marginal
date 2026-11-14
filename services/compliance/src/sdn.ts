/**
 * OFAC screening (SDD §3.20, D8; E11.4).
 *
 * The SDN list names digital-currency addresses in the remarks of each entry. The service keeps the
 * set of those addresses and the hash of the file it read them from, so a decision can be tied to a
 * list version: a payout blocked today was blocked against a list anyone can re-download and check.
 *
 * Screening is **deny-only** and it is not a judgement about a person. A match means the room will
 * not pay out to that address and the money stays claimable; it is not a seizure and not a report.
 */
import { createHash } from "node:crypto";

/** Where Treasury publishes the list. */
export const SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
/** How often to re-read it. */
export const REFRESH_SECONDS = 86_400;

export interface SdnList {
  /** Lower-cased addresses. */
  readonly addresses: ReadonlySet<string>;
  /** `SHA-256` of the file, which is the version a decision cites. */
  readonly version: string;
  readonly entries: number;
}

/**
 * Reads the addresses out of an SDN file. Entries look like
 * `Digital Currency Address - XBT 1abc...;` inside a remarks field, with one line per entry and
 * several addresses per line, so the parse is a scan for that marker rather than a CSV parse: the
 * remarks field is quoted, comma-bearing and not worth modelling.
 */
export function parseSdn(text: string): SdnList {
  const addresses = new Set<string>();
  for (const match of text.matchAll(/Digital Currency Address - [A-Z0-9]+\s+([A-Za-z0-9]+)/gu)) {
    const address = match[1];
    if (address !== undefined) addresses.add(address.toLowerCase());
  }
  return {
    addresses,
    version: createHash("sha256").update(text).digest("hex"),
    entries: addresses.size,
  };
}

/** An empty list, with a version of its own: "we have read nothing" is not "nothing is listed". */
export function emptySdn(): SdnList {
  return { addresses: new Set(), version: "0".repeat(64), entries: 0 };
}

/** Where to read the list from: a deployment may point at a mirror, else Treasury's own file. */
export function sdnUrlFrom(env: NodeJS.ProcessEnv): string {
  const given = env.MARGINAL_SDN_URL;
  return given === undefined || given.trim() === "" ? SDN_URL : given.trim();
}

export interface SdnOptions {
  readonly url?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/** Fetches and parses the list. Throws rather than returning an empty one: that distinction matters. */
export async function fetchSdn(options: SdnOptions = {}): Promise<SdnList> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(options.url ?? SDN_URL, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });
  if (!response.ok) throw new Error(`the SDN list answered ${response.status}`);
  return parseSdn(await response.text());
}

/** Whether an address is on the list. Case-insensitive, because chains spell them differently. */
export function isListed(list: SdnList, address: string): boolean {
  return list.addresses.has(address.toLowerCase());
}
