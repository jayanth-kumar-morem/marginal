import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { call } from "@marginal/core-wasm";
import { canonicalise, salt, toHex } from "@marginal/sdk";

import { APPRAISER_SCHEMAS } from "./appraise";
import type { ChainPort, Fetch } from "./chain";
import type { Listing } from "./records";
import {
  DEFAULT_FORM,
  ENCODE_OPS,
  KNOWLEDGE_APPRAISER,
  KNOWLEDGE_SCHEMA,
  MAX_OBJECT_BYTES,
  baseUnits,
  blobRefJson,
  checkBlobKey,
  dryQuote,
  encode,
  encodeArg,
  goodKey,
  handleBlob,
  handleEncode,
  listingSpecJson,
  newestListing,
  payoutRouteJson,
  percentBps,
  pinsFee,
  provisioned,
  publishSpecJson,
  quoteAmount,
  quoteRequest,
  sizeClass,
  uploadBlob,
  whole,
  wrappedKeyKey,
  type SellForm,
} from "./sell";

const TOKEN = "musdc.sandbox";

/** A request whose body is already parsed, which is all these handlers read. */
function asRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

/** A request whose body is not JSON. */
function badRequest(): Request {
  return { json: () => Promise.reject(new Error("not JSON")) } as unknown as Request;
}

/** A fetch that answers from a table of URL fragments, and records what it was asked. */
function fakeFetch(
  answers: readonly { readonly match: string; readonly status?: number; readonly body?: unknown }[],
): { fetch: Fetch; seen: { url: string; init?: RequestInit }[] } {
  const seen: { url: string; init?: RequestInit }[] = [];
  const fetch = ((url: string, init?: RequestInit) => {
    seen.push({ url, init });
    const answer = answers.find((candidate) => url.includes(candidate.match));
    if (answer === undefined) return Promise.reject(new Error("nothing is listening"));
    const status = answer.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(answer.body),
    } as Response);
  }) as unknown as Fetch;
  return { fetch, seen };
}

const listing = (over: Partial<Listing> = {}): Listing =>
  ({
    id: 1,
    seller: "alice.sandbox",
    version: 1,
    status: "Draft",
    pk_l: null,
    ...over,
  }) as Listing;

/** A chain that answers `config`, `get_listing` and `get_leakage` from a table. */
function fakeChain(listings: readonly Listing[], nextId: number): ChainPort {
  return {
    view<T>(_contract: string, method: string, args?: unknown): Promise<T> {
      if (method === "config") {
        return Promise.resolve({ next_listing_id: nextId, pins_fee: "10000000000000000000000" } as T);
      }
      if (method === "get_leakage") return Promise.resolve(null as T);
      const id = Number((args as { listing_id: string }).listing_id);
      return Promise.resolve((listings.find((one) => one.id === id) ?? null) as T);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// POST /api/encode

test("the encode handler runs an allow-listed operation through the real core", async () => {
  const response = await handleEncode(call, asRequest({ op: "path_hash", input: { path: "a/b" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: createHash("sha256").update("marginal/path/v1").update("a/b").digest("hex"),
  });
});

test("a core refusal comes back as its stable code, with 400", async () => {
  const response = await handleEncode(call, asRequest({ op: "validate_spec", input: { nonsense: 1 } }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "E_DECODE" });
});

test("an operation that is not on the list is refused with 403, whatever the input", async () => {
  for (const op of [undefined, 7, "settle", "verdict_encode"]) {
    const response = await handleEncode(call, asRequest({ op, input: {} }));
    assert.equal(response.status, 403, `${String(op)} must be refused`);
    assert.match((await response.json()).error, /not an operation this app may ask the core for/);
  }
  assert.ok(!ENCODE_OPS.includes("settle" as never), "the list stays short on purpose");
});

test("a body that is not JSON is E_DECODE rather than a crash", async () => {
  const response = await handleEncode(call, badRequest());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "E_DECODE" });
});

test("the browser side of encode unwraps ok and throws the code on a refusal", async () => {
  const good = fakeFetch([{ match: "/api/encode", body: { ok: "deadbeef" } }]);
  assert.equal(await encode<string>("listing_spec_encode", { a: 1 }, good.fetch), "deadbeef");
  assert.deepEqual(JSON.parse(String(good.seen[0]?.init?.body)), {
    op: "listing_spec_encode",
    input: { a: 1 },
  });

  const refused = fakeFetch([{ match: "/api/encode", status: 400, body: { error: "E_RULE_PARAMS" } }]);
  await assert.rejects(
    () => encode("validate_spec", {}, refused.fetch),
    /E_RULE_PARAMS/,
  );
  const silent = fakeFetch([{ match: "/api/encode", status: 400, body: {} }]);
  await assert.rejects(() => encode("validate_spec", {}, silent.fetch), /E_DECODE/);
});

test("encodeArg hands the contract base64 of the core's own Borsh bytes", async () => {
  const fetchImpl = fakeFetch([{ match: "/api/encode", body: { ok: "00ff" } }]).fetch;
  assert.equal(await encodeArg("publish_spec_encode", {}, fetchImpl), Buffer.from("00ff", "hex").toString("base64"));
});

// ---------------------------------------------------------------------------------------------
// Blob keys and POST /api/blob

test("the blob keys are the ones the room reads", () => {
  assert.equal(goodKey(7, 2), "listings/7/v2/good");
  assert.equal(wrappedKeyKey(7, 2), "listings/7/v2/dek");
});

test("a key the gateway would refuse is refused here first", () => {
  assert.equal(checkBlobKey("listings/1/v1/good"), "listings/1/v1/good");
  assert.throws(() => checkBlobKey("Listings/1"), /is not a blob key/);
  assert.throws(() => checkBlobKey("/listings/1"), /is not a blob key/);
  assert.throws(() => checkBlobKey("listings/../secrets"), /is not a blob key/);
  assert.throws(() => checkBlobKey(`a/${"b".repeat(200)}`), /is not a blob key/);
});

test("the size class is the power-of-two bucket the object falls in", () => {
  assert.equal(sizeClass(0), 0);
  assert.equal(sizeClass(1), 0);
  assert.equal(sizeClass(4_096), 12);
  assert.equal(sizeClass(4_097), 13);
  assert.equal(sizeClass(Number.MAX_SAFE_INTEGER), 53);
  assert.equal(sizeClass(Number.POSITIVE_INFINITY), 255);
});

test("an upload is a grant and then exactly the bytes the grant named", async () => {
  const gateway = fakeFetch([
    { match: "/v1/uploads", body: { key: "listings/1/v1/good", token: "t.1.2.3" } },
    { match: "/v1/blob/", body: { key: "listings/1/v1/good" } },
  ]);
  const response = await handleBlob(
    asRequest({ key: "listings/1/v1/good", bytesHex: "00ff" }),
    "http://gateway.invalid",
    gateway.fetch,
  );

  assert.equal(response.status, 200);
  const sha256 = createHash("sha256").update(Buffer.from("00ff", "hex")).digest("hex");
  assert.deepEqual(await response.json(), { ok: { key: "listings/1/v1/good", sha256 } });
  assert.deepEqual(JSON.parse(String(gateway.seen[0]?.init?.body)), {
    key: "listings/1/v1/good",
    sha256,
    size: 2,
  });
  const put = gateway.seen[1];
  assert.equal(put?.url, "http://gateway.invalid/v1/blob/listings/1/v1/good");
  assert.equal(put?.init?.method, "PUT");
  assert.deepEqual(
    (put?.init?.headers as Record<string, string>)["x-upload-token"],
    "t.1.2.3",
  );
  assert.deepEqual(put?.init?.body, new Uint8Array([0x00, 0xff]));
});

test("an upload body this app cannot read is refused before the gateway is called", async () => {
  const cases: readonly [unknown, number, RegExp][] = [
    [null, 400, /needs a key and bytesHex/],
    [{ key: 1, bytesHex: "00" }, 400, /needs a key and bytesHex/],
    [{ key: "a", bytesHex: 1 }, 400, /needs a key and bytesHex/],
    [{ key: "NO", bytesHex: "00" }, 400, /is not a blob key/],
    [{ key: "a", bytesHex: "xyz" }, 400, /lower-case hex/],
    [{ key: "a", bytesHex: "" }, 400, /nothing to upload/],
  ];
  for (const [body, status, message] of cases) {
    const response = await handleBlob(asRequest(body), "http://gateway.invalid", fakeFetch([]).fetch);
    assert.equal(response.status, status, JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
  const broken = await handleBlob(badRequest(), "http://gateway.invalid", fakeFetch([]).fetch);
  assert.equal(broken.status, 400);
});

test("an object over the gateway's cap is refused with 413, not sent", async () => {
  const gateway = fakeFetch([]);
  const response = await handleBlob(
    asRequest({ key: "a", bytesHex: "00".repeat(MAX_OBJECT_BYTES + 1) }),
    "http://gateway.invalid",
    gateway.fetch,
  );
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /larger than 16777216 bytes/);
  assert.equal(gateway.seen.length, 0);
});

test("a gateway that is not running is a clear 502, not a crash", async () => {
  const response = await handleBlob(
    asRequest({ key: "a", bytesHex: "00" }),
    "http://127.0.0.1:1",
    fakeFetch([]).fetch,
  );
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /the gateway at http:\/\/127\.0\.0\.1:1 did not answer/);
});

test("a gateway that refuses the grant, the put, or issues no token says which", async () => {
  const refusedGrant = await handleBlob(
    asRequest({ key: "a", bytesHex: "00" }),
    "http://gateway.invalid",
    fakeFetch([{ match: "/v1/uploads", status: 413, body: {} }]).fetch,
  );
  assert.match((await refusedGrant.json()).error, /answered 413 for \/v1\/uploads/);

  const noToken = await handleBlob(
    asRequest({ key: "a", bytesHex: "00" }),
    "http://gateway.invalid",
    fakeFetch([{ match: "/v1/uploads", body: { key: "a" } }]).fetch,
  );
  assert.match((await noToken.json()).error, /issued no upload token/);

  const refusedPut = await handleBlob(
    asRequest({ key: "a", bytesHex: "00" }),
    "http://gateway.invalid",
    fakeFetch([
      { match: "/v1/uploads", body: { token: "t" } },
      { match: "/v1/blob/", status: 403, body: {} },
    ]).fetch,
  );
  assert.match((await refusedPut.json()).error, /answered 403 for \/v1\/blob\/a/);
});

test("the browser side of an upload unwraps ok and reports a refusal", async () => {
  const ok = fakeFetch([{ match: "/api/blob", body: { ok: { key: "a", sha256: "ab" } } }]);
  assert.deepEqual(await uploadBlob("a", "00", ok.fetch), { key: "a", sha256: "ab" });
  await assert.rejects(
    () => uploadBlob("a", "00", fakeFetch([{ match: "/api/blob", status: 502, body: { error: "no gateway" } }]).fetch),
    /no gateway/,
  );
  await assert.rejects(
    () => uploadBlob("a", "00", fakeFetch([{ match: "/api/blob", status: 502, body: {} }]).fetch),
    /the upload failed/,
  );
});

// ---------------------------------------------------------------------------------------------
// The parameters

test("a decimal amount becomes base units without floating point", () => {
  assert.equal(baseUnits("400", "the ask"), "400000000");
  assert.equal(baseUnits(" 6.25 ", "pi"), "6250000");
  assert.equal(baseUnits("0.000001", "pi"), "1");
  assert.equal(baseUnits("0400", "the ask"), "400000000");
  assert.equal(baseUnits("1.5", "a NEAR amount", 24), "1500000000000000000000000");
  assert.throws(() => baseUnits("", "the ask"), /must be a decimal amount, not ""/);
  assert.throws(() => baseUnits("4e2", "the ask"), /must be a decimal amount/);
  assert.throws(() => baseUnits("0.0000001", "pi"), /more than 6 decimal places/);
  assert.throws(() => baseUnits("0", "the ask"), /must be more than zero/);
  assert.throws(() => baseUnits("0.0", "the ask"), /must be more than zero/);
});

test("a whole number is refused rather than clamped", () => {
  assert.equal(whole("32", "the budget", 1, 1_000), 32);
  assert.throws(() => whole("3.5", "the budget", 1, 1_000), /must be a whole number, not "3.5"/);
  assert.throws(() => whole("0", "the budget", 1, 1_000), /between 1 and 1000/);
  assert.throws(() => whole("1001", "the budget", 1, 1_000), /between 1 and 1000/);
});

test("a percentage becomes basis points exactly", () => {
  assert.equal(percentBps("10", "the floor"), 1_000);
  assert.equal(percentBps("62.5", "the floor"), 6_250);
  assert.equal(percentBps("0.01", "the floor"), 1);
  assert.equal(percentBps("0", "the floor"), 0);
  assert.equal(percentBps("100", "the floor"), 10_000);
  assert.throws(() => percentBps("100.5", "the floor"), /cannot be more than 100%/);
  assert.throws(() => percentBps("ten", "the floor"), /must be a percentage, not "ten"/);
  assert.throws(() => percentBps("1.234", "the floor"), /must be a percentage/);
});

test("the spec is the sandbox listing's, field for field, from the default form", () => {
  const spec = listingSpecJson(DEFAULT_FORM, TOKEN);
  assert.deepEqual(spec.rule, { Posted: { ask: "400000000" } });
  assert.equal(spec.leakage.budget_mbits, 32_000);
  assert.equal(spec.leakage.price_per_bit, "6250000");
  assert.equal(spec.l_floor_bps, 1_000);
  assert.equal(spec.max_copies, 3);
  assert.equal(spec.category, 1);
  assert.equal(spec.token, TOKEN);
  assert.equal(spec.key_mode, "Ckd");
  assert.equal(spec.privacy_default, "Sealed");
  assert.equal(spec.disclosure_policy, "DisputeOnly");
  assert.equal(spec.eligibility.min_tier, "Id1");
  assert.equal(spec.leakage.verified_reserve_bps, 0);
  assert.equal(spec.dossier_hash, null);
});

test("the core accepts the default spec, and its schema hash is the appraiser's", () => {
  // The whole point of running `validate_spec` in the wizard: what the core accepts here is what
  // the contract will accept, so a seller never pays gas to be told about a bad field.
  const spec = listingSpecJson(DEFAULT_FORM, TOKEN);
  assert.equal(call("validate_spec", spec), true);
  assert.match(call("listing_spec_encode", spec) as string, /^[0-9a-f]+$/);

  // And the schema really is `knowledge@1`'s, as `/appraise` reads it back off the chain.
  assert.deepEqual(KNOWLEDGE_SCHEMA, APPRAISER_SCHEMAS[KNOWLEDGE_APPRAISER]?.schema);
});

test("the core refuses a spec the form could produce, with the code the page shows", () => {
  const form: SellForm = { ...DEFAULT_FORM, lFloorPercent: "100", maxCopies: "1" };
  assert.equal(call("validate_spec", listingSpecJson(form, TOKEN)), true);
  assert.throws(
    () => call("validate_spec", { ...listingSpecJson(DEFAULT_FORM, TOKEN), max_copies: 0 }),
    /E_RULE_PARAMS/,
  );
});

test("a deployment with no token configured cannot list anything", () => {
  assert.throws(() => listingSpecJson(DEFAULT_FORM, ""), /no settlement token/);
});

// ---------------------------------------------------------------------------------------------
// Publishing

test("the publish spec carries the commitment, the object and the route", async () => {
  const canonical = canonicalise("memo.md", new TextEncoder().encode("A claim worth paying for.\n"));
  const pinch = await salt();
  const commitment = call("good_commitment", {
    salt: toHex(pinch),
    good: toHex(new TextEncoder().encode(canonical)),
  }) as string;
  const ciphertext = await blobRefJson(goodKey(1, 1), "ab".repeat(32), 4_096);
  const publish = publishSpecJson(commitment, ciphertext, {
    route: "DryQuote",
    chain: "solana",
    asset: "USDC",
    address: "7xK…",
  });

  assert.equal(
    publish.ciphertext.uri_hash,
    createHash("sha256").update("listings/1/v1/good").digest("hex"),
  );
  assert.equal(publish.ciphertext.size_class, 12);
  assert.deepEqual(publish.payout, { DryQuote: { chain: "solana", asset: "USDC", address: "7xK…" } });
  assert.match(call("publish_spec_encode", publish) as string, /^[0-9a-f]+$/);
});

test("both payout routes encode, and neither accepts an empty destination", () => {
  assert.deepEqual(payoutRouteJson({ route: "NearAccount", account: "alice.sandbox" }), {
    NearAccount: "alice.sandbox",
  });
  assert.throws(() => payoutRouteJson({ route: "NearAccount", account: "" }), /needs an account/);
  assert.throws(
    () => payoutRouteJson({ route: "DryQuote", chain: "solana", asset: "USDC", address: "" }),
    /needs a destination address/,
  );
});

// ---------------------------------------------------------------------------------------------
// Reading back

test("the new listing is found by walking down from next_listing_id", async () => {
  const chain = fakeChain(
    [listing({ id: 1, seller: "bob.sandbox" }), listing({ id: 2, seller: "alice.sandbox" })],
    3,
  );
  assert.equal((await newestListing(chain, "clearing.sandbox", "alice.sandbox"))?.id, 2);
  assert.equal((await newestListing(chain, "clearing.sandbox", "bob.sandbox"))?.id, 1);
  assert.equal(await newestListing(chain, "clearing.sandbox", "carol.sandbox"), null);
  assert.equal(await newestListing(chain, "clearing.sandbox", "alice.sandbox", 0), null);
});

test("the pins fee comes from KeyPolicy, never from a constant in the app", async () => {
  assert.equal(await pinsFee(fakeChain([], 1), "keypolicy.sandbox"), "10000000000000000000000");
});

test("a listing can only be sealed to once provisioning has given it a pk_L", () => {
  assert.equal(provisioned(null), false);
  assert.equal(provisioned(listing({ pk_l: null })), false);
  assert.equal(provisioned(listing({ pk_l: "11".repeat(32) })), true);
});

// ---------------------------------------------------------------------------------------------
// The payout quote

test("a quote is always dry, and names the assets on both sides", () => {
  const request = quoteRequest({
    token: TOKEN,
    amount: "400000000",
    refundTo: "alice.sandbox",
    recipient: "7xK…",
    destinationAsset: "nep141:sol-usdc.omft.near",
  });
  assert.equal(request.dry, true);
  assert.equal(request.originAsset, `nep141:${TOKEN}`);
  assert.equal(request.destinationAsset, "nep141:sol-usdc.omft.near");
  assert.equal(request.amount, "400000000");
  assert.equal(request.recipientType, "DESTINATION_CHAIN");
});

test("no destination asset means no quote, rather than a quote for the wrong token", () => {
  assert.throws(
    () =>
      quoteRequest({
        token: TOKEN,
        amount: "1",
        refundTo: "alice.sandbox",
        recipient: "7xK…",
        destinationAsset: "",
      }),
    /needs the destination asset's id/,
  );
});

test("the quote is read through the gateway, and a failure says so", async () => {
  const gateway = fakeFetch([{ match: "/v1/quote", body: { quote: { amountOutFormatted: "398.4" } } }]);
  const reply = await dryQuote("http://gateway.invalid", { dry: true }, gateway.fetch);
  assert.equal(quoteAmount(reply), "398.4");
  assert.equal(gateway.seen[0]?.url, "http://gateway.invalid/v1/quote");

  await assert.rejects(
    () => dryQuote("http://127.0.0.1:1", { dry: true }, fakeFetch([]).fetch),
    /did not answer/,
  );
  await assert.rejects(
    () => dryQuote("http://gateway.invalid", { dry: true }, fakeFetch([{ match: "/v1/quote", status: 502 }]).fetch),
    /answered 502 for \/v1\/quote/,
  );
});

test("a quote this app cannot read is shown as no number at all", () => {
  assert.equal(quoteAmount({ quote: { amountOut: "398400000" } }), "398400000");
  assert.equal(quoteAmount({ quote: {} }), null);
  assert.equal(quoteAmount({}), null);
  assert.equal(quoteAmount(null), null);
});
