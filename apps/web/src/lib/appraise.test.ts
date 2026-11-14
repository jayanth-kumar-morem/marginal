import test from "node:test";
import assert from "node:assert/strict";

import { call, CoreError } from "@marginal/core-wasm";

import {
  APPRAISER_SCHEMAS,
  askApi,
  buildRequest,
  compare,
  findNewJob,
  handle,
  hexToBase64,
  judgeChoices,
  loadBalance,
  parseRestricted,
  parseTokens,
  quoteFor,
  quotes,
  randomKeyHex,
  requestProblems,
  schemaFor,
  type ApiBody,
  type CoreCall,
  type Quote,
  type QuoteInput,
  type Quotes,
} from "./appraise";
import type { ChainPort } from "./chain";
import type { Job, Listing } from "./records";
import { POST } from "../app/api/appraise/route";

const core: CoreCall = call;

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 1,
  seller: "gov.sandbox",
  version: 1,
  status: "Active",
  asset_class: "Knowledge",
  category: 1,
  licence_class: 1,
  good_commitment: "00".repeat(32),
  ciphertext: { uri_hash: "00".repeat(32), sha256: "00".repeat(32), size_class: 0 },
  key_mode: "Ckd",
  key_path_hash: "11".repeat(32),
  pk_l: null,
  appraiser: "knowledge@1",
  schema_hash: APPRAISER_SCHEMAS["knowledge@1"]?.schemaHash ?? "",
  rule: { Posted: { ask: "400000000" } },
  l_floor_bps: 1_000,
  disclosure_policy: "DisputeOnly",
  external_judges_allowed: true,
  token: "musdc.sandbox",
  max_copies: 3,
  copies: 0,
  value_class: "M",
  challenge_window_blocks: 100,
  delivery_deadline_blocks: 200,
  publish_height: null,
  ...over,
});

const quoteInput = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  appraiser: "knowledge@1",
  schema_hash: APPRAISER_SCHEMAS["knowledge@1"]?.schemaHash ?? "",
  rule: { Posted: { ask: "400000000" } },
  budget: "400000000",
  n_judges: 2,
  price_per_bit: "6250000",
  clearing_fee_buyer_bps: 50,
  ...over,
});

/** A chain that answers from a table and records what it was asked. */
function fakeChain(answers: Record<string, unknown>): ChainPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    view<T>(_contract: string, method: string): Promise<T> {
      asked.push(method);
      return Promise.resolve(answers[method] as T);
    },
  };
}

const job = (over: Partial<Job> = {}): Job =>
  ({ id: 7, listing_id: 1, buyer: "bob.sandbox", ...over }) as Job;

test("the schema is taken only when the listing's own hash proves it", () => {
  const known = APPRAISER_SCHEMAS["knowledge@1"];
  assert.ok(known);
  assert.deepEqual(schemaFor("knowledge@1", known.schemaHash), known.schema);
  // A listing whose schema this build cannot prove gets no Open preview rather than a guess.
  assert.equal(schemaFor("knowledge@1", "ab".repeat(32)), null);
  assert.equal(schemaFor("nothing@9", known.schemaHash), null);
});

test("the schema hash is the one the deployed listing reports", () => {
  // Pinned from the sandbox listing's `get_listing.schema_hash`, which is
  // SHA-256(borsh(OutputSchema)) of [21, 21] components on an eleven-level judge scale.
  assert.equal(
    APPRAISER_SCHEMAS["dataset-lite@0"]?.schemaHash,
    "72b4a70d885349ee67a4a24baa5ba7fe47dde697bc9b0b544b62cf47536276cc",
  );
});

test("judges are offered only when the seller allows them", () => {
  assert.deepEqual(judgeChoices(listing()), [0, 1, 2]);
  assert.deepEqual(judgeChoices(listing({ external_judges_allowed: false })), [0]);
});

test("a restricted list is split, trimmed and deduplicated", () => {
  assert.deepEqual(parseRestricted(" acme ,\n beta\nacme,, "), ["acme", "beta"]);
  assert.deepEqual(parseRestricted("  "), []);
});

test("a typed amount becomes base units, or nothing at all", () => {
  assert.equal(parseTokens("400"), "400000000");
  assert.equal(parseTokens("1,250.5"), "1250500000");
  assert.equal(parseTokens("0"), "0");
  assert.equal(parseTokens("0.000001"), "1");
  // A seventh decimal is refused, not rounded away.
  assert.equal(parseTokens("1.0000001"), null);
  assert.equal(parseTokens("four"), null);
  assert.equal(parseTokens(""), null);
  assert.equal(parseTokens("1.5", 2), "150");
});

test("amounts compare as integers, not as numbers", () => {
  assert.equal(compare("1", "2"), -1);
  assert.equal(compare("2", "1"), 1);
  assert.equal(compare("340282366920938463463374607431768211455", "1"), 1);
  assert.equal(compare("7", "7"), 0);
});

test("the quote for each privacy mode is the core's own arithmetic", () => {
  const both = quotes(core, quoteInput());
  // Open: the outcome bit, two component alphabets of 21, and two judge factors on 11 levels.
  assert.equal(both.open?.debit_mbits, 16_706);
  // Sealed: one bit, whatever the schema says (SDD §3.17).
  assert.equal(both.sealed.debit_mbits, 1_000);
  // π · d / 1000 at 6.25 mUSDC a bit, and the buyer's 0.5% of the budget.
  assert.equal(both.open?.comp, "104412500");
  assert.equal(both.sealed.comp, "6250000");
  assert.equal(both.open?.fee, "2000000");
  assert.equal(both.open?.total, "506412500");
  assert.equal(both.sealed.privacy, "Sealed");
});

test("a listing whose schema cannot be proved is priced for Sealed only", () => {
  const both = quotes(core, quoteInput({ schema_hash: "ab".repeat(32) }));
  assert.equal(both.open, null);
  assert.equal(both.sealed.debit_mbits, 1_000);
});

test("asking for no judge drops the judge terms from the debit", () => {
  const known = APPRAISER_SCHEMAS["knowledge@1"];
  assert.ok(known);
  const quote = quoteFor(core, quoteInput({ n_judges: 0 }), known.schema, "Open");
  assert.equal(quote.debit_mbits, 9_786);
  assert.equal(quote.privacy, "Open");
});

test("the request a buyer signs is blind, refunds to escrow and carries no context yet", () => {
  const request = buildRequest({
    listing: listing({ id: 4, version: 2 }),
    budget: "400000000",
    privacy: "Sealed",
    nJudges: 1,
    deliveryPk: "aa".repeat(32),
    contextAuthPk: "bb".repeat(32),
  });
  assert.deepEqual(request, {
    listing_id: 4,
    listing_version: 2,
    snapshot_id: null,
    budget: "400000000",
    mode: "Blind",
    privacy: "Sealed",
    n_judges: 1,
    delivery_pk: "aa".repeat(32),
    compliance_pk: null,
    context_auth_pk: "bb".repeat(32),
    sealed_context_key: "",
    refund_to: "Balance",
    nullifier: null,
    nullifier_sig: null,
  });
  // The core accepts it, which is what the page checks before asking for a signature.
  assert.equal(call("validate_request", request), true);
});

test("hex becomes the base64 a contract argument travels as", () => {
  assert.equal(hexToBase64("00010203"), "AAECAw==");
  assert.equal(hexToBase64(""), "");
});

test("a placeholder key is thirty-two bytes of hex", () => {
  const key = randomKeyHex();
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notEqual(key, randomKeyHex());
});

test("every refusal the contract would make is shown before anything is signed", () => {
  const quote: Quote = {
    privacy: "Open",
    debit_mbits: 16_706,
    comp: "104412500",
    fee: "2000000",
    total: "506412500",
  };
  const clear = {
    connected: true,
    budget: "400000000",
    ask: "400000000",
    quote,
    remainingMbits: 32_000,
    balance: "600000000",
  };
  assert.deepEqual(requestProblems(clear), []);
  assert.match(requestProblems({ ...clear, connected: false })[0] ?? "", /Connect a wallet/);
  assert.match(requestProblems({ ...clear, ask: null })[0] ?? "", /E_RULE_DISABLED/);
  assert.match(requestProblems({ ...clear, budget: null })[0] ?? "", /six decimals/);
  assert.match(
    requestProblems({ ...clear, budget: "399999999" })[0] ?? "",
    /E_RULE_PARAMS/,
  );
  assert.match(
    requestProblems({ ...clear, remainingMbits: 1_000 })[0] ?? "",
    /E_BUDGET_EXHAUSTED/,
  );
  assert.match(requestProblems({ ...clear, balance: "1" })[0] ?? "", /E_BALANCE_LOW/);
  // While the preview and the balance are still unread, neither can refuse anything.
  assert.deepEqual(requestProblems({ ...clear, quote: null, balance: null }), []);
});

test("the new job is recovered from the chain, because the wallet drops the answer", async () => {
  const chain = fakeChain({ config: { next_job_id: 8 }, get_job: job() });
  assert.equal(await findNewJob(chain, "clearing.sandbox", 1, "bob.sandbox"), 7);
  assert.deepEqual(chain.asked, ["config", "get_job"]);
  // A blocked request creates no job at all (§3.21), and nor does a fresh deployment have one.
  assert.equal(
    await findNewJob(fakeChain({ config: { next_job_id: 1 } }), "c", 1, "bob.sandbox"),
    null,
  );
  assert.equal(
    await findNewJob(fakeChain({ config: { next_job_id: 8 }, get_job: null }), "c", 1, "bob"),
    null,
  );
  // Someone else's job, or one on another listing, is not this buyer's.
  const other = fakeChain({ config: { next_job_id: 8 }, get_job: job({ listing_id: 2 }) });
  assert.equal(await findNewJob(other, "c", 1, "bob.sandbox"), null);
  const theirs = fakeChain({ config: { next_job_id: 8 }, get_job: job({ buyer: "eve" }) });
  assert.equal(await findNewJob(theirs, "c", 1, "bob.sandbox"), null);
});

test("the escrow balance is read for the buyer's own token", async () => {
  const chain = fakeChain({ get_balance: "1000000" });
  assert.equal(await loadBalance(chain, "clearing.sandbox", "bob.sandbox", "musdc.sandbox"), "1000000");
  assert.deepEqual(chain.asked, ["get_balance"]);
});

/** A POST to the route, as the browser sends it. */
const post = (body: unknown): Request =>
  new Request("http://127.0.0.1/api/appraise", { method: "POST", body: JSON.stringify(body) });

test("the route quotes both modes", async () => {
  const body: ApiBody = { op: "quote", input: quoteInput() };
  const response = await handle(core, post(body));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: { sealed: Quote } };
  assert.equal(payload.ok.sealed.debit_mbits, 1_000);
});

test("the route encodes the request as the base64 the contract takes", async () => {
  const request = buildRequest({
    listing: listing(),
    budget: "400000000",
    privacy: "Open",
    nJudges: 2,
    deliveryPk: "aa".repeat(32),
    contextAuthPk: "bb".repeat(32),
  });
  const response = await handle(core, post({ op: "encode", request }));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: { base64: string } };
  assert.equal(payload.ok.base64, hexToBase64(call("appraisal_request_encode", request) as string));
});

test("the route answers a refusal with the core's own code", async () => {
  // R2 is in the wire format and refused on chain in M1 (SDD §3.7).
  const rule = { ValueIndexed: { p_min: "1", p_full: "2", price_quantum_bps: 100 } };
  const refused = await handle(core, post({ op: "quote", input: quoteInput({ rule }) }));
  assert.equal(refused.status, 400);
  assert.deepEqual(await refused.json(), { error: "E_RULE_DISABLED" });

  const request = buildRequest({
    listing: listing(),
    budget: "0",
    privacy: "Open",
    nJudges: 0,
    deliveryPk: "aa".repeat(32),
    contextAuthPk: "bb".repeat(32),
  });
  const invalid = await handle(core, post({ op: "encode", request }));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "E_RULE_PARAMS" });
  assert.throws(() => call("validate_request", request), CoreError);
});

test("the route refuses a body it cannot read and an operation it does not have", async () => {
  const empty = new Request("http://127.0.0.1/api/appraise", { method: "POST", body: "not json" });
  assert.equal((await handle(core, empty)).status, 400);
  assert.deepEqual(await (await handle(core, post({ op: "etch" }))).json(), { error: "E_DECODE" });
});

test("the page's own API call carries the answer back, or the code", async () => {
  // The fake fetch is the route itself, so this is the whole round trip the browser makes.
  const through: typeof globalThis.fetch = (_url, init) =>
    handle(core, new Request("http://127.0.0.1/api/appraise", init));
  const both = await askApi<Quotes>({ op: "quote", input: quoteInput() }, through);
  assert.equal(both.sealed.debit_mbits, 1_000);

  const refused = askApi<Quotes>(
    { op: "quote", input: quoteInput({ appraiser: "knowledge@1", price_per_bit: "x" }) },
    through,
  );
  await assert.rejects(refused, { message: "E_DECODE" });

  // A reply that is neither an answer nor a code is still a refusal, not a silent default.
  const empty: typeof globalThis.fetch = () => Promise.resolve(new Response("{}"));
  await assert.rejects(askApi<Quotes>({ op: "quote", input: quoteInput() }, empty), {
    message: "E_DECODE",
  });
});

test("the route handler is the core's call and nothing else", async () => {
  const response = await POST(post({ op: "quote", input: quoteInput({ n_judges: 0 }) }));
  const payload = (await response.json()) as { ok: { open: Quote } };
  assert.equal(payload.ok.open.debit_mbits, 9_786);
});
