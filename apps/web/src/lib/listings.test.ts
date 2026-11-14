import test from "node:test";
import assert from "node:assert/strict";

import type { ChainPort } from "./chain";
import {
  listingIds,
  loadListing,
  loadListings,
  loadPins,
  pinNote,
  priceLine,
  statusNote,
  teaser,
} from "./listings";
import type { Leakage, Listing } from "./records";
import { postedAsk, ruleName } from "./records";

const listing = (id: number, over: Partial<Listing> = {}): Listing => ({
  id,
  seller: "alice.testnet",
  version: 1,
  status: "Active",
  asset_class: "Knowledge",
  category: 1,
  licence_class: 1,
  good_commitment: "ab".repeat(32),
  ciphertext: { uri_hash: "cd".repeat(32), sha256: "ef".repeat(32), size_class: 12 },
  key_mode: "Ckd",
  key_path_hash: "11".repeat(32),
  pk_l: "22".repeat(32),
  appraiser: "knowledge@1",
  schema_hash: "33".repeat(32),
  rule: { Posted: { ask: "400000000" } },
  l_floor_bps: 1_000,
  disclosure_policy: "DisputeOnly",
  external_judges_allowed: false,
  token: "musdc.testnet",
  max_copies: 3,
  copies: 0,
  value_class: "M",
  challenge_window_blocks: 600,
  delivery_deadline_blocks: 600,
  publish_height: 1_000,
  ...over,
});

const leakage: Leakage = {
  budget_mbits: 32_000,
  reserved_mbits: 0,
  spent_mbits: 4_000,
  remaining_mbits: 28_000,
  price_per_bit: "6250000",
};

/** A chain that answers from a table, and records what it was asked. */
function fakeChain(answers: Record<string, unknown>): ChainPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    view<T>(_contract: string, method: string, args?: unknown): Promise<T> {
      const key = `${method}:${JSON.stringify(args ?? {})}`;
      asked.push(key);
      return Promise.resolve(answers[key] as T);
    },
  };
}

test("the market is enumerated newest first, from config's next id", () => {
  assert.deepEqual(listingIds(5), [4, 3, 2, 1]);
  assert.deepEqual(listingIds(1), [], "a deployment with no listing has nothing to show");
  assert.deepEqual(listingIds(0), []);
  assert.deepEqual(listingIds(100, 3), [99, 98, 97], "the limit holds");
});

test("a listing is read with its leakage account, because they are shown together", async () => {
  const chain = fakeChain({
    'get_listing:{"listing_id":"3"}': listing(3),
    'get_leakage:{"listing_id":"3"}': leakage,
  });
  const row = await loadListing(chain, "clearing.testnet", 3);
  assert.equal(row?.listing.id, 3);
  assert.equal(row?.leakage?.remaining_mbits, 28_000);
  assert.deepEqual(chain.asked, [
    'get_listing:{"listing_id":"3"}',
    'get_leakage:{"listing_id":"3"}',
  ]);
});

test("a listing that is not there is absent, not an error", async () => {
  const chain = fakeChain({ 'get_listing:{"listing_id":"9"}': null });
  assert.equal(await loadListing(chain, "clearing.testnet", 9), null);
  assert.equal(chain.asked.length, 1, "and its leakage is never asked for");
});

test("the market skips a gap and keeps the order", async () => {
  const chain = fakeChain({
    "config:{}": { next_listing_id: 4 },
    'get_listing:{"listing_id":"3"}': listing(3),
    'get_leakage:{"listing_id":"3"}': leakage,
    'get_listing:{"listing_id":"2"}': null,
    'get_listing:{"listing_id":"1"}': listing(1),
    'get_leakage:{"listing_id":"1"}': null,
  });
  const rows = await loadListings(chain, "clearing.testnet");
  assert.deepEqual(
    rows.map((row) => row.listing.id),
    [3, 1],
  );
  assert.equal(rows[1]?.leakage, null, "a listing with no leakage account still shows");
});

test("every status says whether a buyer can appraise, and why not", () => {
  assert.equal(statusNote("Active").appraisable, true);
  for (const status of ["Draft", "Provisioning", "Screening", "Held", "Exhausted", "SoldOut"]) {
    const note = statusNote(status);
    assert.equal(note.appraisable, false, status);
    assert.ok(note.note.length > 10, status);
  }
  assert.match(statusNote("Held").note, /compliance/);
  assert.match(statusNote("Exhausted").note, /leakage budget/);
  // A state this build does not know about is refused rather than assumed open.
  const unknown = statusNote("Paused");
  assert.equal(unknown.appraisable, false);
  assert.match(unknown.note, /Paused/);
});

test("the teaser is public metadata only, and the price line names the rule", () => {
  assert.equal(teaser(listing(1)), "Knowledge · category 1 · large · class M");
  assert.equal(
    teaser(listing(1, { ciphertext: { uri_hash: "", sha256: "", size_class: 0 } })),
    "Knowledge · category 1 · tiny · class M",
  );
  assert.equal(
    teaser(listing(1, { ciphertext: { uri_hash: "", sha256: "", size_class: 99 } })),
    "Knowledge · category 1 · very large · class M",
  );

  assert.deepEqual(priceLine(listing(1)), { rule: "Posted", ask: "400000000" });
  const indexed = listing(1, { rule: { ValueIndexed: { p_min: "1", p_full: "2" } } });
  assert.deepEqual(priceLine(indexed), { rule: "ValueIndexed", ask: null });
});

test("the rule helpers read exactly what the contract stored", () => {
  assert.equal(postedAsk({ Posted: { ask: "7" } }), "7");
  assert.equal(postedAsk({ Posted: {} }), null);
  assert.equal(postedAsk({ SealedRound: { floor: "1" } }), null);
  assert.equal(ruleName({ Posted: { ask: "7" } }), "Posted");
  assert.equal(ruleName({}), "Unknown");
});

test("pins say which measurements may open the good, or that governance decides", async () => {
  assert.deepEqual(pinNote(null), { follows: true, hashes: [] });
  assert.deepEqual(pinNote({ key_id: "ab", mode: "FollowGovernance" }), {
    follows: true,
    hashes: [],
  });
  assert.deepEqual(pinNote({ key_id: "ab", mode: { Explicit: ["cd", "ef"] } }), {
    follows: false,
    hashes: ["cd", "ef"],
  });

  const chain = fakeChain({
    'get_pins:{"seller":"alice.testnet","listing_id":"3","version":1}': {
      key_id: "11",
      mode: "FollowGovernance",
    },
  });
  assert.deepEqual(await loadPins(chain, "keypolicy.testnet", listing(3)), {
    key_id: "11",
    mode: "FollowGovernance",
  });
  // A RoomSealed listing never went through KeyPolicy, so it is not asked about.
  assert.equal(await loadPins(chain, "keypolicy.testnet", listing(3, { key_mode: "RoomSealed" })), null);
  assert.equal(chain.asked.length, 1);
});
