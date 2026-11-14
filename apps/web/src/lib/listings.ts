/**
 * What `/listings` and `/listing/[id]` read (E13.3, D1 and D4).
 *
 * There is no indexer in M1, so the market is enumerated the only way a contract view allows:
 * `config()` says how many listings exist, and each one is read by id. That is fine at demo scale
 * and it is honest — every number on the page came from a view, not from a cache nobody can audit.
 */
import type { ChainPort } from "./chain";
import type { ClearingConfig, Leakage, Listing } from "./records";
import { postedAsk, ruleName } from "./records";

/** The ids a deployment has, newest first, because that is the order a market is read in. */
export function listingIds(nextListingId: number, limit = 50): readonly number[] {
  const ids: number[] = [];
  for (let id = nextListingId - 1; id >= 1 && ids.length < limit; id -= 1) ids.push(id);
  return ids;
}

/** What a seller pinned: either the governance set, or named measurement hashes (SDD §3.12.2). */
export interface Pins {
  readonly key_id: string;
  readonly mode: "FollowGovernance" | { readonly Explicit: readonly string[] };
}

/** The measurements a listing's key may be released to, in words a page can show. */
export function pinNote(pins: Pins | null): { follows: boolean; hashes: readonly string[] } {
  if (pins === null || pins.mode === "FollowGovernance") {
    return { follows: true, hashes: [] };
  }
  return { follows: false, hashes: pins.mode.Explicit };
}

/** A listing and its leakage account, which are always shown together. */
export interface ListingRow {
  readonly listing: Listing;
  readonly leakage: Leakage | null;
}

/** One row of the market. */
export async function loadListing(
  chain: ChainPort,
  clearing: string,
  id: number,
): Promise<ListingRow | null> {
  const listing = await chain.view<Listing | null>(clearing, "get_listing", {
    listing_id: String(id),
  });
  if (listing === null) return null;
  const leakage = await chain.view<Leakage | null>(clearing, "get_leakage", {
    listing_id: String(id),
  });
  return { listing, leakage };
}

/**
 * The seller's pins for one listing version. Only a `Ckd` listing has any: a `RoomSealed` listing
 * never went through KeyPolicy (§3.12.7).
 */
export async function loadPins(
  chain: ChainPort,
  keypolicy: string,
  listing: Listing,
): Promise<Pins | null> {
  if (listing.key_mode !== "Ckd") return null;
  return chain.view<Pins | null>(keypolicy, "get_pins", {
    seller: listing.seller,
    listing_id: String(listing.id),
    version: listing.version,
  });
}

/** The market, as far back as `limit` goes. A gap (a withdrawn id) is skipped, not an error. */
export async function loadListings(
  chain: ChainPort,
  clearing: string,
  limit = 50,
): Promise<readonly ListingRow[]> {
  const config = await chain.view<ClearingConfig>(clearing, "config");
  const rows = await Promise.all(
    listingIds(config.next_listing_id, limit).map((id) => loadListing(chain, clearing, id)),
  );
  return rows.filter((row): row is ListingRow => row !== null);
}

/**
 * What a listing's status means for a buyer, in the words §3.5's state machine uses. The point of
 * saying it here is that a page never invents a status: `Held` is a compliance hold (D8), and
 * `Exhausted` is the leakage wall (D4), and both are reasons a buyer cannot appraise right now.
 */
export function statusNote(status: string): { appraisable: boolean; note: string } {
  switch (status) {
    case "Active":
      return { appraisable: true, note: "Open for appraisal." };
    case "Draft":
      return { appraisable: false, note: "Not published yet: the seller is still provisioning it." };
    case "Provisioning":
      return { appraisable: false, note: "The key is being provisioned through MPC CKD." };
    case "Screening":
      return { appraisable: false, note: "Waiting on the room's screening report." };
    case "Held":
      return {
        appraisable: false,
        note: "Held by compliance before any appraisal could run (D8).",
      };
    case "Exhausted":
      return {
        appraisable: false,
        note: "The leakage budget is spent, so the contract refuses new appraisals (D4).",
      };
    case "SoldOut":
      return { appraisable: false, note: "Every copy of this listing has been sold." };
    default:
      return { appraisable: false, note: `Not appraisable in state ${status}.` };
  }
}

/** A one-line description of the good, from the public metadata only — the teaser (§3.23). */
export function teaser(listing: Listing): string {
  const size = ["tiny", "small", "medium", "large", "very large"][
    Math.min(4, Math.floor(listing.ciphertext.size_class / 4))
  ];
  // The category is an id: governance holds the table that names it, and M1 has no view for it.
  return `${listing.asset_class} · category ${listing.category} · ${size} · class ${listing.value_class}`;
}

/** The price a buyer would pay, and under which rule. */
export function priceLine(listing: Listing): { rule: string; ask: string | null } {
  return { rule: ruleName(listing.rule), ask: postedAsk(listing.rule) };
}
