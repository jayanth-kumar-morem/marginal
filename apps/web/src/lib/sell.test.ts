import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import sodium from "libsodium-wrappers";

import { call } from "@marginal/core-wasm";
import { canonicalise, fromHex, goodCommitment, openGood, salt, toHex } from "@marginal/sdk";

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
  beginProvisioningTx,
  blobRefJson,
  checkBlobKey,
  createListingTx,
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
  publishListingTx,
  publishSpecJson,
  quoteAmount,
  quoteNote,
  quoteRequest,
  roomSealTarget,
  roomSealedDisclosure,
  sealAndUpload,
  sealPublicKey,
  sellMethods,
  sellSteps,
  sendSellCall,
  setPinsTx,
  sizeClass,
  uploadBlob,
  whole,
  wrappedKeyKey,
  type SealTarget,
  type SellForm,
  type SellTx,
  type Signer,
  type Uploaded,
  settled,
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
  const spec = listingSpecJson(DEFAULT_FORM, TOKEN, "Ckd");
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
  const spec = listingSpecJson(DEFAULT_FORM, TOKEN, "Ckd");
  assert.equal(call("validate_spec", spec), true);
  assert.match(call("listing_spec_encode", spec) as string, /^[0-9a-f]+$/);

  // And the schema really is `knowledge@1`'s, as `/appraise` reads it back off the chain.
  assert.deepEqual(KNOWLEDGE_SCHEMA, APPRAISER_SCHEMAS[KNOWLEDGE_APPRAISER]?.schema);
});

test("the core refuses a spec the form could produce, with the code the page shows", () => {
  const form: SellForm = { ...DEFAULT_FORM, lFloorPercent: "100", maxCopies: "1" };
  assert.equal(call("validate_spec", listingSpecJson(form, TOKEN, "Ckd")), true);
  assert.throws(
    () => call("validate_spec", { ...listingSpecJson(DEFAULT_FORM, TOKEN, "Ckd"), max_copies: 0 }),
    /E_RULE_PARAMS/,
  );
});

test("a deployment with no token configured cannot list anything", () => {
  assert.throws(() => listingSpecJson(DEFAULT_FORM, "", "Ckd"), /no settlement token/);
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

test("a listing can only be sealed to once something has given it a key", () => {
  // Ckd: the listing's own `pk_L`, which a room reports.
  assert.equal(sealPublicKey("Ckd", null, null), null);
  assert.equal(sealPublicKey("Ckd", listing({ pk_l: null }), null), null);
  assert.equal(sealPublicKey("Ckd", listing({ pk_l: PK_L }), null), PK_L);
  // RoomSealed: the room's attested `box_pk`, and never the listing's `pk_L`, which stays null.
  assert.equal(sealPublicKey("RoomSealed", listing({ pk_l: PK_L }), null), null);
  assert.equal(sealPublicKey("RoomSealed", listing({ pk_l: null }), target()), BOX_PK);
  assert.equal(sealPublicKey("RoomSealed", null, target()), BOX_PK);
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

// ---------------------------------------------------------------------------------------------
// The two key-release modes (SDD §3.12.7)

const CLEARING = "clearing.sandbox";
const KEYPOLICY = "keypolicy.sandbox";
const ROOM = "cc".repeat(32);
const OTHER_ROOM = "dd".repeat(32);
const BOX_PK = "ee".repeat(32);
const PK_L = "11".repeat(32);
const QUOTE = "ab".repeat(32);
const MEASUREMENT = "cd".repeat(32);
const LISTING_FEE = "30000000000000000000000";
const PUBLISH_FEE = "20000000000000000000000";
const PINS_FEE = "10000000000000000000000";
const NOW = 1_800_000_000;

const target = (over: Partial<SealTarget> = {}): SealTarget => ({
  publicKey: BOX_PK,
  roomKey: ROOM,
  quoteHash: QUOTE,
  measurementHash: MEASUREMENT,
  attestationMode: "Simulated",
  expiresAt: NOW + 3_600,
  ...over,
});

/** A chain that answers the four room views `roomSealTarget` reads, and records what it was asked. */
function roomsChain(answers: Record<string, unknown>): ChainPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    view<T>(_contract: string, method: string, args?: unknown): Promise<T> {
      const key = `${method}:${JSON.stringify(args ?? {})}`;
      asked.push(key);
      const answer = answers[key];
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve((answer ?? null) as T);
    },
  };
}

/** One eligible room, with a record in both contracts and nothing against it. */
function oneGoodRoom(
  over: { attestation?: Record<string, unknown>; room?: Record<string, unknown>; deny?: string[] } = {},
): Record<string, unknown> {
  return {
    'eligible:{"class":"K"}': [],
    'eligible:{"class":"Kcpu"}': [ROOM],
    [`get_room:{"room_key":"${ROOM}"}`]: { room_key: ROOM, box_pk: BOX_PK, ...over.room },
    [`get_attestation:{"room_key":"${ROOM}"}`]: {
      room_key: ROOM,
      box_pk: BOX_PK,
      quote_hash: QUOTE,
      measurement_hash: MEASUREMENT,
      mode: "Simulated",
      expires_at: NOW + 3_600,
      ...over.attestation,
    },
    [`check_room:{"room_key":"${ROOM}"}`]: { ok: true, deny_reasons: over.deny ?? [] },
  };
}

/** A wallet that records what it signed, and refuses the methods a mode must never send. */
function fakeSigner(forbidden: readonly string[] = []): Signer & { sent: SellTx[] } {
  const sent: SellTx[] = [];
  return {
    sent,
    send(tx: SellTx): Promise<string> {
      if (forbidden.includes(tx.method)) {
        throw new Error(`the wallet was asked to sign ${tx.method}, which this mode must not send`);
      }
      sent.push(tx);
      return Promise.resolve(`hash-${sent.length}`);
    },
  };
}

/** An upload that keeps the bytes instead of sending them. */
function fakeUpload(): {
  put: (key: string, bytesHex: string) => Promise<Uploaded>;
  objects: { key: string; bytesHex: string }[];
} {
  const objects: { key: string; bytesHex: string }[] = [];
  return {
    objects,
    put(key: string, bytesHex: string): Promise<Uploaded> {
      objects.push({ key, bytesHex });
      return Promise.resolve({ key, sha256: createHash("sha256").update(bytesHex).digest("hex") });
    },
  };
}

/**
 * The seller's whole RoomSealed run, in the order the wizard does it: the room is checked **first**,
 * then the listing is created, then the good is sealed and uploaded, then it is published. Written
 * once here so a test can prove that a refusal anywhere in it leaves the chain and the gateway
 * untouched.
 */
async function runRoomSealed(
  chain: ChainPort,
  signer: Signer,
  upload: (key: string, bytesHex: string) => Promise<Uploaded>,
  canonical = "A claim worth paying for in both modes.\n",
): Promise<{ target: SealTarget; saltHex: string }> {
  const found = await roomSealTarget(chain, CLEARING, KEYPOLICY, NOW);
  await sendSellCall(
    signer,
    "RoomSealed",
    createListingTx(CLEARING, "spec64", LISTING_FEE, "RoomSealed", found),
  );
  const saltHex = toHex(await salt());
  await sealAndUpload(
    { canonical, saltHex, sealTo: found.publicKey, listingId: 7, version: 1 },
    upload,
  );
  await sendSellCall(
    signer,
    "RoomSealed",
    publishListingTx(CLEARING, 7, "publish64", PUBLISH_FEE),
  );
  return { target: found, saltHex };
}

test("the plan is four calls under Ckd and two under RoomSealed", () => {
  assert.deepEqual(sellMethods("Ckd"), [
    "create_listing",
    "begin_provisioning",
    "set_pins",
    "publish_listing",
  ]);
  assert.deepEqual(sellMethods("RoomSealed"), ["create_listing", "publish_listing"]);
  // Same seven steps either way, so the page's gating does not depend on the mode.
  assert.deepEqual(
    sellSteps("Ckd").map((step) => step.step),
    sellSteps("RoomSealed").map((step) => step.step),
  );
  assert.equal(sellSteps("Ckd")[5]?.title, "Pins");
  assert.equal(sellSteps("RoomSealed")[5]?.title, "Key release");
  assert.deepEqual(sellSteps("RoomSealed")[5]?.methods, []);
});

test("a RoomSealed listing is created and published, and never provisioned or pinned", async () => {
  // The wallet double throws if either call is even attempted, so this fails loudly rather than
  // quietly sending something the contract refuses with E_RULE_DISABLED.
  const signer = fakeSigner(["begin_provisioning", "set_pins"]);
  const upload = fakeUpload();
  await runRoomSealed(roomsChain(oneGoodRoom()), signer, upload.put);
  assert.deepEqual(
    signer.sent.map((tx) => tx.method),
    ["create_listing", "publish_listing"],
  );
  assert.deepEqual(
    upload.objects.map((object) => object.key),
    ["listings/7/v1/good", "listings/7/v1/dek"],
  );

  // And the guard is the reason, not the step list: the call is refused before the wallet sees it.
  const blocked = fakeSigner();
  await assert.rejects(
    () => sendSellCall(blocked, "RoomSealed", beginProvisioningTx(CLEARING, 7)),
    /a RoomSealed listing never calls begin_provisioning/,
  );
  await assert.rejects(
    () => sendSellCall(blocked, "RoomSealed", setPinsTx(KEYPOLICY, 7, 1, null, PINS_FEE)),
    /never calls set_pins/,
  );
  assert.deepEqual(blocked.sent, [], "nothing reached the wallet");

  // And a RoomSealed listing cannot even be built before its room is known, so the storage
  // deposit is never paid for a listing whose good nothing could open.
  assert.throws(
    () => createListingTx(CLEARING, "spec64", LISTING_FEE, "RoomSealed", null),
    /cannot be created before the one room it binds to is known/,
  );
});

test("the Ckd path still sends the same four calls, in order, with the same arguments", async () => {
  const signer = fakeSigner();
  await sendSellCall(signer, "Ckd", createListingTx(CLEARING, "spec64", LISTING_FEE, "Ckd", null));
  await sendSellCall(signer, "Ckd", beginProvisioningTx(CLEARING, 7));
  await sendSellCall(signer, "Ckd", setPinsTx(KEYPOLICY, 7, 1, null, PINS_FEE));
  await sendSellCall(signer, "Ckd", publishListingTx(CLEARING, 7, "publish64", PUBLISH_FEE));
  assert.deepEqual(signer.sent, [
    {
      contract: CLEARING,
      method: "create_listing",
      args: { spec: "spec64" },
      deposit: LISTING_FEE,
      gas: "100000000000000",
    },
    {
      contract: CLEARING,
      method: "begin_provisioning",
      args: { listing_id: "7" },
      gas: "100000000000000",
    },
    {
      contract: KEYPOLICY,
      method: "set_pins",
      args: { listing_id: "7", version: 1, pins: null },
      deposit: PINS_FEE,
      gas: "100000000000000",
    },
    {
      contract: CLEARING,
      method: "publish_listing",
      args: { listing_id: "7", publish: "publish64" },
      deposit: PUBLISH_FEE,
      gas: "100000000000000",
    },
  ]);
  // Explicit pins are the seller's own list, unchanged.
  assert.deepEqual(setPinsTx(KEYPOLICY, 7, 2, [MEASUREMENT], PINS_FEE).args, {
    listing_id: "7",
    version: 2,
    pins: [MEASUREMENT],
  });
});

test("RoomSealed refuses a pool that is not exactly one room, before anything is created", async () => {
  for (const [keys, reason] of [
    [[], /has 0 eligible: nothing can open a good sealed now/],
    [[ROOM, OTHER_ROOM], /has 2 eligible: cc/],
  ] as const) {
    const signer = fakeSigner();
    const upload = fakeUpload();
    const chain = roomsChain({
      'eligible:{"class":"K"}': keys,
      'eligible:{"class":"Kcpu"}': [],
    });
    await assert.rejects(() => runRoomSealed(chain, signer, upload.put), reason);
    assert.deepEqual(signer.sent, [], "nothing was signed");
    assert.deepEqual(upload.objects, [], "nothing was uploaded");
  }

  // A room that is eligible in both classes is one room, not two.
  const both = await roomSealTarget(
    roomsChain({ ...oneGoodRoom(), 'eligible:{"class":"K"}': [ROOM] }),
    CLEARING,
    KEYPOLICY,
    NOW,
  );
  assert.equal(both.roomKey, ROOM);
});

test("an attestation that is missing, disagreed with, denied, expired or malformed is refused", async () => {
  const cases: readonly { readonly answers: Record<string, unknown>; readonly reason: RegExp }[] = [
    {
      answers: { ...oneGoodRoom(), [`get_attestation:{"room_key":"${ROOM}"}`]: null },
      reason: /keypolicy.sandbox has no attestation record for room cc/,
    },
    {
      answers: oneGoodRoom({ room: { box_pk: "ff".repeat(32) } }),
      reason: /do not agree on room cc.*box_pk/s,
    },
    {
      answers: { ...oneGoodRoom(), [`get_room:{"room_key":"${ROOM}"}`]: null },
      reason: /do not agree on room cc/,
    },
    {
      answers: oneGoodRoom({ deny: ["expired", "platform_not_admitted"] }),
      reason: /would give room cc.* no work: expired, platform_not_admitted/s,
    },
    {
      answers: oneGoodRoom({ attestation: { expires_at: NOW } }),
      reason: /attestation expired at 1800000000 \(it is now 1800000000\)/,
    },
    {
      answers: oneGoodRoom({ attestation: { box_pk: "ee" }, room: { box_pk: "ee" } }),
      reason: /box_pk is not a 32-byte key: "ee"/,
    },
    {
      answers: oneGoodRoom({ attestation: { box_pk: "0".repeat(64) }, room: { box_pk: "0".repeat(64) } }),
      reason: /box_pk is not a 32-byte key: "0{64}"/,
    },
    {
      answers: oneGoodRoom({ attestation: { quote_hash: "" } }),
      reason: /carries no quote hash: ""/,
    },
  ];
  for (const one of cases) {
    const signer = fakeSigner();
    const upload = fakeUpload();
    await assert.rejects(() => runRoomSealed(roomsChain(one.answers), signer, upload.put), one.reason);
    assert.deepEqual(signer.sent, [], "nothing was signed");
    assert.deepEqual(upload.objects, [], "nothing was uploaded");
  }

  // An RPC that does not answer is a failure, never an empty pool: a seller must not read
  // "this deployment has no rooms" off a request that never arrived.
  await assert.rejects(
    () =>
      roomSealTarget(
        roomsChain({ 'eligible:{"class":"K"}': new Error("the RPC answered 503") }),
        CLEARING,
        KEYPOLICY,
        NOW,
      ),
    /the RPC answered 503/,
  );
});

test("the wrap is the SDK's sealed box to the room's box_pk, at the key the room reads", async () => {
  await sodium.ready;
  const room = sodium.crypto_box_keypair();
  const canonical = canonicalise(
    "memo.md",
    new TextEncoder().encode("A claim worth paying for, sealed to one room.\n"),
  );
  const upload = fakeUpload();
  const chain = roomsChain(
    oneGoodRoom({
      attestation: { box_pk: toHex(room.publicKey) },
      room: { box_pk: toHex(room.publicKey) },
    }),
  );
  const signer = fakeSigner(["begin_provisioning", "set_pins"]);
  const { target: sealedTo, saltHex } = await runRoomSealed(chain, signer, upload.put, canonical);
  assert.equal(sealedTo.publicKey, toHex(room.publicKey));

  const [good, dek] = upload.objects;
  assert.equal(good?.key, "listings/7/v1/good");
  assert.equal(dek?.key, "listings/7/v1/dek");

  // Only the room's secret key opens the wrap, and what is inside is exactly `DEK_g ‖ salt`.
  const payload = sodium.crypto_box_seal_open(
    fromHex(dek?.bytesHex ?? ""),
    room.publicKey,
    room.privateKey,
  );
  assert.equal(payload.length, 64, "a DEK and a salt, which is what the room insists on");
  assert.equal(toHex(payload.subarray(32)), saltHex);

  // And that key opens the ciphertext the listing published, against the commitment the seller
  // committed to: the room's own decrypt-and-check, done here from the uploaded bytes alone.
  const commitment = await goodCommitment(fromHex(saltHex), canonical);
  assert.equal(
    await openGood(
      fromHex(good?.bytesHex ?? ""),
      { dek: payload.subarray(0, 32), salt: payload.subarray(32), listingVersion: 1 },
      commitment,
    ),
    canonical,
  );
  // A wrap sealed to any other room is not openable by this one.
  await assert.rejects(
    () =>
      sealAndUpload(
        { canonical, saltHex, sealTo: "zz".repeat(32), listingId: 7, version: 1 },
        upload.put,
      ),
    /not an even number of lower-case hex digits/,
  );
});

test("the disclosure says what RoomSealed costs, in the words AC-29 allows", () => {
  const simulated = roomSealedDisclosure(target());
  const text = simulated.map((one) => `${one.title} ${one.detail}`).join("\n");

  // §3.12.7's three limitations, each as its own item the seller cannot miss.
  assert.equal(simulated.length, 4);
  assert.match(text, /restart loses the key/);
  assert.match(text, /Only room cccccccccc… can ever deliver/);
  assert.match(text, /no job-commitment proof/i);
  assert.match(text, /DR-5/);
  // And it does not claim a mitigation M1 does not have: the room reads one RPC (room/src/config.ts).
  assert.match(text, /M1's room reads one/);
  // AC-29: forgetting is attested, never proven, and nothing claims deletion or unlearning.
  assert.match(text, /forgotten under attestation/);
  assert.doesNotMatch(text, /unlearn|deletion|deleted|erased|wiped|guarantee/i);

  // A simulated attestation says so where the seller is deciding, not only on /rooms.
  assert.match(text, /No quote was verified/);
  assert.match(text, /attested in name only/);

  // A verified quote reads differently, and still does not claim this page checked it.
  const real = roomSealedDisclosure(target({ attestationMode: "OnChainDcap" }));
  const realText = real.map((one) => one.detail).join("\n");
  assert.match(realText, /verified on-chain by NEAR One's locked tee-verifier/);
  assert.match(realText, /This page did not re-verify it/);
  assert.equal(quoteNote(target({ attestationMode: "AttesterQuorum" })).includes("in name only"), true);
});

test("a read-back waits for the chain to catch up with the write", async () => {
  // The signer returns when a transaction has executed; a view asks for final state, which trails
  // it. A single look therefore misses what was just created — which is what made the wizard say
  // "the chain has no listing for this account yet" about a listing that was already on chain.
  const waits: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    waits.push(ms);
    return Promise.resolve();
  };

  let look = 0;
  const late = await settled<string>(
    () => {
      look += 1;
      return Promise.resolve({ ok: look < 3 ? null : "listing 2" });
    },
    8,
    750,
    sleep,
  );
  assert.deepEqual(late, { ok: "listing 2" }, "it keeps asking until the chain agrees");
  assert.equal(look, 3);
  assert.deepEqual(waits, [750, 750], "it waits between looks, not before the first");

  // Something that is genuinely absent is still absent, and says so rather than hanging.
  let tries = 0;
  const missing = await settled<string>(
    () => {
      tries += 1;
      return Promise.resolve({ ok: null });
    },
    4,
    10,
    sleep,
  );
  assert.deepEqual(missing, { ok: null });
  assert.equal(tries, 4, "it gives up after the attempts it was given");

  // The default wait is a real timer, and it is what runs in a browser — so it is exercised here
  // rather than always being replaced by a stub.
  let real = 0;
  const waited = await settled<string>(() => {
    real += 1;
    return Promise.resolve({ ok: real < 2 ? null : "arrived" });
  }, 3, 1);
  assert.deepEqual(waited, { ok: "arrived" });
  assert.equal(real, 2);

  // An error is not emptiness: it comes back at once, because retrying would only repeat it.
  let asked = 0;
  const failed = await settled<string>(
    () => {
      asked += 1;
      return Promise.resolve({ error: "E_DECODE" });
    },
    5,
    10,
    sleep,
  );
  assert.deepEqual(failed, { error: "E_DECODE" });
  assert.equal(asked, 1, "an error is returned without retrying");
});
