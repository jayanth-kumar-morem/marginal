/**
 * What `/sell` does (E13.2, D1 and D7; SDD §3.23, §3.24).
 *
 * The wizard is seven steps and the plaintext never leaves the browser in any of them: it is read
 * from the seller's disk, canonicalised, committed to and sealed there (SDD §3.2). This file is
 * everything about that which is not a React component — the arithmetic, the argument shapes, the
 * two route handlers' bodies and the chain reads — so each piece can be tested on its own.
 *
 * Three rules shape it.
 *
 * **Nothing is hand-rolled.** Every contract argument is Borsh built by `marginal-core`
 * (`listing_spec_encode`, `publish_spec_encode`), and `validate_spec` runs before a transaction is
 * signed, so the seller learns the refusal code without paying gas. The core is wasm loaded with
 * `node:fs`, so it cannot run in a browser: {@link handleEncode} is the whole server side of it, as
 * `appraise.ts`'s `handle` is for the buyer.
 *
 * **The crypto is the SDK's.** `@marginal/sdk` holds canonicalisation, the commitment, the AEAD and
 * the sealed box, and it is the same code the room reads on the other side.
 *
 * **The gateway is proxied, not trusted.** The browser cannot reach it directly (it sends no CORS
 * headers, and the app's CSP allows `connect-src 'self'`), so {@link handleBlob} forwards an upload.
 * Trust is not the reason it is a proxy, and nothing changes about the gateway being untrusted
 * (§2.7): what it stores is already sealed, and the chain commits to the hash of the bytes.
 */
import { hexToBase64, type CoreCall, type OutputSchema, type Privacy } from "./appraise";
import { errorCode, type ChainPort, type Fetch } from "./chain";
import { BPS, MBITS_PER_BIT, TOKEN_DECIMALS } from "./format";
import { listingIds, loadListing } from "./listings";
import type { ClearingConfig, KeyMode, Listing } from "./records";
import { knowledgeRoomKeys, loadRoom, modeNote } from "./rooms";
import { aeadSeal, dek, fromHex, sha256Hex, toHex, wrapKey } from "@marginal/sdk";

// -----------------------------------------------------------------------------------------------
// The core, through `POST /api/encode`

/**
 * The operations the app may ask `marginal-core` for. It is an allow-list because the handler is a
 * public endpoint on the seller's own origin: the core has operations that belong to a room or to
 * governance, and this page needs nine of them — the four encodings a seller or buyer signs, the
 * two validators that refuse before gas is paid, the two key-path hashes a listing is identified
 * by, and the good commitment.
 */
export const ENCODE_OPS = [
  "listing_spec_encode",
  "publish_spec_encode",
  "blob_ref_encode",
  "appraisal_request_encode",
  "validate_spec",
  "validate_request",
  "path_hash",
  "listing_path",
  "good_commitment",
] as const;

export type EncodeOp = (typeof ENCODE_OPS)[number];

const ALLOWED: ReadonlySet<string> = new Set(ENCODE_OPS);

function answer(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * `POST /api/encode`'s whole body: `{op, input}` in, `{ok}` or `{error}` out.
 *
 * A refusal carries the core's own stable code (`E_RULE_PARAMS`, `E_SCHEMA_INVALID`), because that
 * is what the contract will say too and a seller can look it up. An operation that is not on the
 * list is a 403 rather than a 400: the input was never the problem.
 */
export async function handleEncode(call: CoreCall, request: Request): Promise<Response> {
  const body = await request
    .json()
    .then((parsed) => parsed as { op?: unknown; input?: unknown })
    .catch(() => null);
  if (body === null) return answer({ error: "E_DECODE" }, 400);
  if (typeof body.op !== "string" || !ALLOWED.has(body.op)) {
    return answer({ error: "that is not an operation this app may ask the core for" }, 403);
  }
  try {
    return answer({ ok: call(body.op, body.input) });
  } catch (error: unknown) {
    return answer({ error: errorCode(error) }, 400);
  }
}

/** One core operation, from the browser. A refusal arrives as the stable code and is thrown as one. */
export async function encode<T>(
  op: EncodeOp,
  input: unknown,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<T> {
  const response = await fetchImpl("/api/encode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, input }),
  });
  const payload = (await response.json()) as { ok?: T; error?: string };
  if (payload.ok === undefined) throw new Error(payload.error ?? "E_DECODE");
  return payload.ok;
}

// -----------------------------------------------------------------------------------------------
// Objects, and `POST /api/blob`

/** The largest object the gateway takes (`services/gateway/src/blobs.ts`'s `MAX_OBJECT_BYTES`). */
export const MAX_OBJECT_BYTES = 16 * 1024 * 1024;

/**
 * The same key rule the gateway enforces (`blobs.ts`'s `checkKey`), applied here so a seller is
 * told what is wrong by this app rather than by a 400 from a service they did not call.
 */
export function checkBlobKey(key: string): string {
  if (!/^[a-z0-9][-a-z0-9/._]{0,127}$/.test(key) || key.includes("..")) {
    throw new Error(`"${key}" is not a blob key`);
  }
  return key;
}

/**
 * Where a listing version's two objects live. These are the keys the **room** reads
 * (`goodKey` and `wrappedKeyKey` in `room/src/worker/context.ts`): the ciphertext of the good, and
 * the sealed box holding `DEK_g ‖ salt`. A seller who writes them anywhere else has published a
 * listing no room can open.
 */
export function goodKey(listingId: number, version: number): string {
  return checkBlobKey(`listings/${listingId}/v${version}/good`);
}

export function wrappedKeyKey(listingId: number, version: number): string {
  return checkBlobKey(`listings/${listingId}/v${version}/dek`);
}

/**
 * The `size_class` a listing publishes: the power-of-two bucket the object falls in, so 4 KiB is
 * 12 — the bucket the room's own fixtures use.
 *
 * M1 declares the bucket without padding the object up to it. Padding would have to happen inside
 * the AEAD to stay invisible, and the commitment is over the canonical text, so a padded object
 * would fail the room's `SHA-256(salt ‖ good)` check. The class is therefore a coarse public hint
 * at the size, which is all §3.4 asks of it, and it is honest about being one.
 */
export function sizeClass(bytes: number): number {
  return Math.min(255, Math.ceil(Math.log2(Math.max(bytes, 1))));
}

/** What an upload answers with: the key it landed under and the hash the chain will commit to. */
export interface Uploaded {
  readonly key: string;
  readonly sha256: string;
}

/**
 * `POST /api/blob`'s whole body: the two-step upload the gateway requires, done from the server so
 * the browser stays same-origin.
 *
 * Step one asks for a grant naming the key, the hash and the size; step two puts exactly those
 * bytes with the grant's token. The hash is computed here from the bytes that arrived, never taken
 * from the caller, so a grant cannot be had for one object and spent on another.
 */
export async function handleBlob(
  request: Request,
  gateway: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<Response> {
  const body = await request
    .json()
    .then((parsed) => parsed as { key?: unknown; bytesHex?: unknown })
    .catch(() => null);
  if (body === null || typeof body.key !== "string" || typeof body.bytesHex !== "string") {
    return answer({ error: "an upload needs a key and bytesHex" }, 400);
  }
  // `fromHex` hands back a buffer it allocated, which is what a `fetch` body has to be.
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    checkBlobKey(body.key);
    bytes = fromHex(body.bytesHex);
  } catch (error: unknown) {
    // A bad key or a body that is not hex: both are this caller's mistake, and both are named.
    return answer({ error: errorCode(error) }, 400);
  }
  if (bytes.length === 0) return answer({ error: "there is nothing to upload" }, 400);
  if (bytes.length > MAX_OBJECT_BYTES) {
    return answer({ error: `that object is larger than ${MAX_OBJECT_BYTES} bytes` }, 413);
  }
  try {
    return answer({ ok: await putObject(gateway, body.key, bytes, fetchImpl) });
  } catch (error: unknown) {
    // A gateway that is not running, or one that refused: either way the seller is told which
    // service did not answer, because it is not the chain and not this app.
    return answer({ error: errorCode(error) }, 502);
  }
}

/** The gateway's grant-then-put protocol (`services/gateway/src/index.ts`). */
async function putObject(
  gateway: string,
  key: string,
  bytes: Uint8Array<ArrayBuffer>,
  fetchImpl: Fetch,
): Promise<Uploaded> {
  const sha256 = await sha256Hex(bytes);
  const granted = await ask(
    fetchImpl,
    `${gateway}/v1/uploads`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, sha256, size: bytes.length }),
    },
    gateway,
  );
  const grant = (await granted.json()) as { token?: string };
  if (typeof grant.token !== "string") throw new Error("the gateway issued no upload token");
  await ask(
    fetchImpl,
    `${gateway}/v1/blob/${key}`,
    {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", "x-upload-token": grant.token },
      body: bytes,
    },
    gateway,
  );
  return { key, sha256 };
}

/** One call to a host service, with its failures named rather than left as a stack trace. */
async function ask(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  gateway: string,
): Promise<Response> {
  const response = await fetchImpl(url, init).catch(() => null);
  if (response === null) throw new Error(`the gateway at ${gateway} did not answer`);
  if (!response.ok) {
    throw new Error(`the gateway answered ${response.status} for ${new URL(url).pathname}`);
  }
  return response;
}

/** Uploads one object from the browser, through this app's own origin. */
export async function uploadBlob(
  key: string,
  bytesHex: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<Uploaded> {
  const response = await fetchImpl("/api/blob", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, bytesHex }),
  });
  const payload = (await response.json()) as { ok?: Uploaded; error?: string };
  if (payload.ok === undefined) throw new Error(payload.error ?? "the upload failed");
  return payload.ok;
}

// -----------------------------------------------------------------------------------------------
// The parameters a seller chooses (SDD §3.24's `listing.toml`, as a form)

/** Who may see a Sealed verdict's opening, and when (`marginal_core::types::DisclosurePolicy`). */
export const DISCLOSURE_POLICIES = [
  "DisputeOnly",
  "AuditorEscrow",
  "DelayedAggregate",
  "PublishWithBuyerConsent",
] as const;

export type Disclosure = (typeof DISCLOSURE_POLICIES)[number];

/** M1's one appraiser for a document (`room/src/appraisers/knowledge/index.ts`). */
export const KNOWLEDGE_APPRAISER = "knowledge@1";

/**
 * `knowledge@1`'s output schema: no shown field (M1 is blind), two components quantised to 21
 * levels, and the eleven-level scale a judge answers on.
 *
 * It is the appraiser's, not the seller's — which is why it is not on the form. `appraise.ts`'s
 * `APPRAISER_SCHEMAS` is the authority for the `schema_hash` this produces, and a test pins this
 * schema equal to the one there, so the two cannot drift apart.
 */
export const KNOWLEDGE_SCHEMA: OutputSchema = {
  fields: [],
  component_alphabets: [21, 21],
  judge_scale: 11,
};

/** What the form holds. Every number stays text until it is parsed, so a typo is reported once. */
export interface SellForm {
  readonly category: string;
  readonly licenceClass: string;
  readonly ask: string;
  readonly budgetBits: string;
  readonly pricePerBit: string;
  readonly lFloorPercent: string;
  readonly maxCopies: string;
  readonly privacy: Privacy;
  readonly disclosure: Disclosure;
  readonly externalJudges: boolean;
  readonly challengeWindowBlocks: string;
  readonly deliveryDeadlineBlocks: string;
}

/**
 * SDD §3.24's defaults for a knowledge memo: a 400 mUSDC ask, a 32-bit leakage budget, and
 * π = 0.5 × ask ÷ budget, which is what makes the leakage meter worth a seller's attention. ℓ_floor
 * is the share of the measured value that judges can never take away; 10% is the sandbox's own
 * listing. The windows are the demo's: short enough to watch a challenge expire.
 */
export const DEFAULT_FORM: SellForm = {
  category: "1",
  licenceClass: "1",
  ask: "400",
  budgetBits: "32",
  pricePerBit: "6.25",
  lFloorPercent: "10",
  maxCopies: "3",
  privacy: "Sealed",
  disclosure: "DisputeOnly",
  externalJudges: true,
  challengeWindowBlocks: "100",
  deliveryDeadlineBlocks: "200",
};

/**
 * A decimal amount as base units, by moving the point rather than multiplying: these are token
 * amounts, and a float would round one. "400" with six decimals is "400000000".
 */
export function baseUnits(text: string, what: string, decimals = TOKEN_DECIMALS): string {
  const trimmed = text.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`${what} must be a decimal amount, not "${text}"`);
  }
  const dot = trimmed.indexOf(".");
  const units = dot === -1 ? trimmed : trimmed.slice(0, dot);
  const fraction = dot === -1 ? "" : trimmed.slice(dot + 1);
  if (fraction.length > decimals) {
    throw new Error(`${what} has more than ${decimals} decimal places`);
  }
  const scaled = `${units}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  if (scaled === "0") throw new Error(`${what} must be more than zero`);
  return scaled;
}

/** A whole number in a range, refused rather than clamped: a clamped budget is not the seller's. */
export function whole(text: string, what: string, min: number, max: number): number {
  if (!/^\d+$/.test(text.trim())) throw new Error(`${what} must be a whole number, not "${text}"`);
  const value = Number.parseInt(text.trim(), 10);
  if (value < min || value > max) throw new Error(`${what} must be between ${min} and ${max}`);
  return value;
}

/** A percentage as basis points: "10" is 1,000 bps, "62.5" is 6,250. */
export function percentBps(text: string, what: string): number {
  const trimmed = text.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`${what} must be a percentage, not "${text}"`);
  }
  const dot = trimmed.indexOf(".");
  const units = dot === -1 ? trimmed : trimmed.slice(0, dot);
  const fraction = dot === -1 ? "" : trimmed.slice(dot + 1);
  const value =
    Number.parseInt(units, 10) * 100 + Number.parseInt(fraction.padEnd(2, "0"), 10);
  if (value > BPS) throw new Error(`${what} cannot be more than 100%`);
  return value;
}

/** `marginal_core::listing::ListingSpec` in the core's JSON model (`marginal_core::json`). */
export interface ListingSpecJson {
  readonly asset_class: "Knowledge";
  readonly category: number;
  readonly licence_class: number;
  readonly key_mode: KeyMode;
  readonly appraiser: { readonly id: string; readonly version: number; readonly formula_id: "KnowledgeV1" };
  readonly schema: OutputSchema;
  readonly rule: { readonly Posted: { readonly ask: string } };
  readonly token: string;
  readonly max_copies: number;
  readonly l_floor_bps: number;
  readonly external_judges_allowed: boolean;
  readonly privacy_default: Privacy;
  readonly disclosure_policy: Disclosure;
  readonly leakage: {
    readonly budget_mbits: number;
    readonly reserved_mbits: 0;
    readonly spent_mbits: 0;
    readonly price_per_bit: string;
    readonly sub_budget_mbits_per_identity: number;
    readonly verified_reserve_bps: number;
  };
  readonly value_class: "M";
  readonly eligibility: {
    readonly min_tier: "Id1";
    readonly min_anonymity_set: number;
    readonly nullifier_gated: boolean;
    readonly cooling_blocks: number;
  };
  readonly challenge_window_blocks: number;
  readonly delivery_deadline_blocks: number;
  readonly dossier_hash: null;
}

/**
 * The spec `create_listing` takes, from the form.
 *
 * What is **not** on the form is as deliberate as what is. The asset class is Knowledge, because
 * that is the only one M1 appraises (§1.5), and the key mode is the **deployment's**, never a
 * seller's choice: it decides who can ever open the good, and a seller cannot pick a mode the
 * deployment has no keys for. The appraiser and its schema are
 * `knowledge@1`'s. The identity sub-budget and the verified reserve are zero: both exist to ration
 * a budget between identity tiers (DR-17), and the demo has no tiers to ration between, so
 * claiming otherwise on a published listing would be a fiction. `min_tier` is `Id1` because `Id0`
 * cannot appraise at all. Every field a seller can get wrong is parsed here, with its own message,
 * before `validate_spec` is asked and long before gas is paid.
 */
export function listingSpecJson(
  form: SellForm,
  token: string,
  keyMode: KeyMode,
): ListingSpecJson {
  if (token === "") throw new Error("this deployment has no settlement token configured");
  return {
    asset_class: "Knowledge",
    category: whole(form.category, "the category", 1, 65_535),
    licence_class: whole(form.licenceClass, "the licence class", 0, 65_535),
    key_mode: keyMode,
    appraiser: { id: "knowledge", version: 1, formula_id: "KnowledgeV1" },
    schema: KNOWLEDGE_SCHEMA,
    rule: { Posted: { ask: baseUnits(form.ask, "the ask") } },
    token,
    max_copies: whole(form.maxCopies, "the copy limit", 1, 65_535),
    l_floor_bps: percentBps(form.lFloorPercent, "the judgement floor"),
    external_judges_allowed: form.externalJudges,
    privacy_default: form.privacy,
    disclosure_policy: form.disclosure,
    leakage: {
      budget_mbits: whole(form.budgetBits, "the leakage budget", 1, 1_000) * MBITS_PER_BIT,
      reserved_mbits: 0,
      spent_mbits: 0,
      price_per_bit: baseUnits(form.pricePerBit, "the price per bit"),
      sub_budget_mbits_per_identity: 0,
      verified_reserve_bps: 0,
    },
    value_class: "M",
    eligibility: {
      min_tier: "Id1",
      min_anonymity_set: 0,
      nullifier_gated: false,
      cooling_blocks: 0,
    },
    challenge_window_blocks: whole(form.challengeWindowBlocks, "the challenge window", 1, 1_000_000),
    delivery_deadline_blocks: whole(form.deliveryDeadlineBlocks, "the delivery deadline", 1, 1_000_000),
    dossier_hash: null,
  };
}

// -----------------------------------------------------------------------------------------------
// Publishing: the commitment, the ciphertext and the payout route

/** Where the proceeds go (`marginal_core::types::PayoutRoute`, SDD §3.9.4). */
export type Payout =
  | { readonly route: "NearAccount"; readonly account: string }
  | { readonly route: "DryQuote"; readonly chain: string; readonly asset: string; readonly address: string };

export type PayoutRouteJson =
  | { readonly NearAccount: string }
  | { readonly DryQuote: { readonly chain: string; readonly asset: string; readonly address: string } };

/**
 * The route, as the core encodes it.
 *
 * `DryQuote` is the demo's cross-chain route and it is honest about what it is: the proceeds are
 * paid on NEAR, and the foreign leg is a swap the seller's own wallet signs (DR-12). The quote the
 * wizard shows is indicative and is never stored (1Click ToS §4.1(e)); the route record keeps only
 * the chain, the asset and the address the seller chose.
 */
export function payoutRouteJson(payout: Payout): PayoutRouteJson {
  if (payout.route === "NearAccount") {
    if (payout.account === "") throw new Error("a NEAR payout needs an account");
    return { NearAccount: payout.account };
  }
  if (payout.address === "") throw new Error("a cross-chain payout needs a destination address");
  return { DryQuote: { chain: payout.chain, asset: payout.asset, address: payout.address } };
}

/** `marginal_core::types::BlobRef`: the object by key and by content. */
export interface BlobRefJson {
  readonly uri_hash: string;
  readonly sha256: string;
  readonly size_class: number;
}

/**
 * The ciphertext reference a listing publishes.
 *
 * `sha256` is the whole object's hash, which is what the room checks before it decrypts anything
 * ("the ciphertext is not the one the listing published"). `uri_hash` is the hash of the blob key
 * the object lives under: the room derives the key itself from the listing id and version, so this
 * is a record of where it was put rather than something anyone resolves.
 */
export async function blobRefJson(key: string, sha256: string, bytes: number): Promise<BlobRefJson> {
  return {
    uri_hash: await sha256Hex(new TextEncoder().encode(key)),
    sha256,
    size_class: sizeClass(bytes),
  };
}

/** `marginal_core::listing::PublishSpec`, the argument to `publish_listing`. */
export interface PublishSpecJson {
  readonly good_commitment: string;
  readonly ciphertext: BlobRefJson;
  readonly payout: PayoutRouteJson;
}

export function publishSpecJson(
  goodCommitment: string,
  ciphertext: BlobRefJson,
  payout: Payout,
): PublishSpecJson {
  return { good_commitment: goodCommitment, ciphertext, payout: payoutRouteJson(payout) };
}

/** The base64 a contract argument carrying a core type travels as. */
export async function encodeArg(op: EncodeOp, input: unknown, fetchImpl?: Fetch): Promise<string> {
  return hexToBase64(await encode<string>(op, input, fetchImpl));
}

// -----------------------------------------------------------------------------------------------
// Reading back what was created

/**
 * The newest listing this account owns.
 *
 * A wallet answers with a transaction hash, not with a return value, so the listing id
 * `create_listing` chose is read back from the chain: ids are handed out in order, so the first one
 * walking down from `next_listing_id` whose seller is this account is the one just made. There is
 * no indexer in M1 (`tasks.md`), which is why this is a scan rather than a query.
 */
export async function newestListing(
  chain: ChainPort,
  clearing: string,
  seller: string,
  limit = 20,
): Promise<Listing | null> {
  const config = await chain.view<ClearingConfig>(clearing, "config");
  for (const id of listingIds(config.next_listing_id, limit)) {
    const row = await loadListing(chain, clearing, id);
    if (row !== null && row.listing.seller === seller) return row.listing;
  }
  return null;
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

/** What KeyPolicy charges to store a listing version's pins (`contracts/keypolicy/src/fees.rs`). */
export async function pinsFee(chain: ChainPort, keypolicy: string): Promise<string> {
  const config = await chain.view<{ pins_fee: string }>(keypolicy, "config");
  return config.pins_fee;
}

// -----------------------------------------------------------------------------------------------
// The two key-release modes (SDD §3.12.7)

/**
 * One wizard step: its number, its title, and the contract methods it signs.
 *
 * This is the **plan**, and it is the one place that knows which calls a key mode takes. The page
 * reads it for the stepper's titles and {@link sendSellCall} reads it to refuse a call the mode
 * does not have, so a mis-wired button cannot send `begin_provisioning` for a listing the contract
 * would refuse it for (`listing.rs`: a RoomSealed listing fails with `E_RULE_DISABLED`).
 */
export interface SellStep {
  readonly step: number;
  readonly title: string;
  /** In the order they are sent. Empty for the steps that run in the browser alone. */
  readonly methods: readonly string[];
}

/**
 * The steps, for one mode. The numbering is the same either way, so the two flows differ only in
 * what they actually do:
 *
 * - **Ckd** derives the listing key in a room (`begin_provisioning`), seals `DEK_g` to the `pk_L`
 *   the room reports, and pins the measurements KeyPolicy will release that key to.
 * - **RoomSealed** has no listing key: the good is sealed to one attested room's own `box_pk`, so
 *   there is nothing to provision — the contract refuses it — and nothing to pin. Step 6 is the
 *   disclosure §3.12.7 requires instead, and `publish_listing` goes straight from `Draft`.
 */
export function sellSteps(mode: KeyMode): readonly SellStep[] {
  const ckd = mode === "Ckd";
  return [
    { step: 1, title: "File", methods: [] },
    { step: 2, title: "Canonicalise", methods: [] },
    { step: 3, title: "Parameters", methods: [] },
    {
      step: 4,
      title: "Create",
      methods: ckd ? ["create_listing", "begin_provisioning"] : ["create_listing"],
    },
    { step: 5, title: "Seal", methods: [] },
    { step: 6, title: ckd ? "Pins" : "Key release", methods: ckd ? ["set_pins"] : [] },
    { step: 7, title: "Publish", methods: ["publish_listing"] },
  ];
}

/** Every call a listing takes in this mode, in order. Ckd has four; RoomSealed has two. */
export function sellMethods(mode: KeyMode): readonly string[] {
  return sellSteps(mode).flatMap((step) => step.methods);
}

/**
 * One call a page wants signed. It is `components/wallet`'s `TxRequest`, which is what `useWallet`
 * takes; the compiler checks the two agree where the wizard hands one to the other.
 */
export interface SellTx {
  readonly contract: string;
  readonly method: string;
  readonly args: Record<string, unknown>;
  /** Yocto-NEAR, as a decimal string. */
  readonly deposit?: string;
  /** Gas, as a decimal string of gas units. */
  readonly gas?: string;
}

/** What the seller's wallet offers of itself: one signed call, answering with a transaction hash. */
export interface Signer {
  send(tx: SellTx): Promise<string>;
}

/** 100 TGas, as the other pages use: enough for a listing write and the jobs it opens. */
export const SELL_GAS = "100000000000000";

/**
 * `create_listing`.
 *
 * Under RoomSealed it refuses without a resolved {@link SealTarget}: the good will be sealed to
 * that one room's `box_pk`, so a listing created before the room is known is a listing nobody may
 * be able to open — and it has already cost its storage deposit. The page checks this too, with the
 * chain's own reason; this is the backstop that makes "nothing is created first" structural.
 */
export function createListingTx(
  clearing: string,
  specBase64: string,
  fee: string,
  mode: KeyMode,
  target: SealTarget | null,
): SellTx {
  if (mode === "RoomSealed" && target === null) {
    throw new Error(
      "a RoomSealed listing cannot be created before the one room it binds to is known (§3.12.7)",
    );
  }
  return {
    contract: clearing,
    method: "create_listing",
    args: { spec: specBase64 },
    deposit: fee,
    gas: SELL_GAS,
  };
}

export function beginProvisioningTx(clearing: string, listingId: number): SellTx {
  return {
    contract: clearing,
    method: "begin_provisioning",
    args: { listing_id: String(listingId) },
    gas: SELL_GAS,
  };
}

export function setPinsTx(
  keypolicy: string,
  listingId: number,
  version: number,
  pins: readonly string[] | null,
  fee: string,
): SellTx {
  return {
    contract: keypolicy,
    method: "set_pins",
    args: { listing_id: String(listingId), version, pins },
    deposit: fee,
    gas: SELL_GAS,
  };
}

export function publishListingTx(
  clearing: string,
  listingId: number,
  publishBase64: string,
  fee: string,
): SellTx {
  return {
    contract: clearing,
    method: "publish_listing",
    args: { listing_id: String(listingId), publish: publishBase64 },
    deposit: fee,
    gas: SELL_GAS,
  };
}

/**
 * Signs one call, if this key mode's plan has it.
 *
 * The guard is not decoration. A RoomSealed listing that is sent `begin_provisioning` is refused on
 * chain (`E_RULE_DISABLED`) after the seller has paid gas, and `set_pins` would charge a storage
 * deposit for pins no release path reads. Refusing here costs nothing and names the reason.
 */
export async function sendSellCall(signer: Signer, mode: KeyMode, tx: SellTx): Promise<string> {
  if (!sellMethods(mode).includes(tx.method)) {
    throw new Error(`a ${mode} listing never calls ${tx.method} (SDD §3.12.7)`);
  }
  return signer.send(tx);
}

// -----------------------------------------------------------------------------------------------
// What the good is sealed to

/** The key `DEK_g ‖ salt` is sealed to, and everything the seller is owed about it. */
export interface SealTarget {
  /** The X25519 public key, hex: the room's attested `box_pk`. */
  readonly publicKey: string;
  /** The room this listing binds to (SDD line 1955), hex. */
  readonly roomKey: string;
  /** The attestation record's quote hash — shown, not verified here; see {@link quoteNote}. */
  readonly quoteHash: string;
  /** The measurement set hash the same record carries, which `/rooms` shows in full. */
  readonly measurementHash: string;
  /** `OnChainDcap`, `AttesterQuorum` or `Simulated`, as KeyPolicy recorded it. */
  readonly attestationMode: string;
  /** Unix seconds, from KeyPolicy's record: after this the room gets no key and no work. */
  readonly expiresAt: number;
}

const HEX32 = /^[0-9a-f]{64}$/;

/**
 * The one room a RoomSealed listing may be sealed to, with its attestation checked as far as a
 * browser honestly can.
 *
 * **Exactly one.** RoomSealed binds a listing to one room: only that room holds the `box_sk` that
 * opens the wrap. With a second eligible room the very next job is a coin flip — `pick_room` picks
 * the screening room at random, `runScreening` opens the good, and a room that cannot open it
 * leaves the listing stuck in `Screening` — so this refuses with none or several, before
 * `create_listing` is signed and before any object is uploaded. A refusal costs the seller nothing.
 *
 * **What "check the quote hash" can mean from here** (§3.12.7 asks clients to check it before
 * sealing). A browser has views, not quotes: it cannot re-verify a TDX quote, which is what
 * KeyPolicy's locked verifier did at registration. So this checks everything that *is* checkable
 * and shows the rest:
 *
 * - KeyPolicy holds an attestation record for this room, and its `box_pk` is well formed;
 * - clearing's own registry record for the same room agrees on that `box_pk`. The two contracts
 *   store it separately — KeyPolicy wrote clearing's copy through `admit_room` after verifying the
 *   quote — so agreement is real evidence, while the record's own `room_key` is not: the view
 *   echoes the argument it was given;
 * - `check_room` says clearing would still give this room work (not unknown, not expired, platform
 *   still admitted), which is the chain's own clock rather than the browser's;
 * - KeyPolicy's record has not expired either, against the time the caller passes in;
 * - the quote hash is a 32-byte hash and is handed to the seller, labelled with the mode that
 *   produced it. `OnChainDcap` means the chain verified the quote behind that hash; `Simulated`
 *   means nobody did, and {@link quoteNote} says so in those words.
 */
export async function roomSealTarget(
  chain: ChainPort,
  clearing: string,
  keypolicy: string,
  nowSecs: number,
): Promise<SealTarget> {
  const keys = await knowledgeRoomKeys(chain, clearing);
  const roomKey = keys.length === 1 ? keys[0] : undefined;
  if (roomKey === undefined) {
    throw new Error(
      `RoomSealed binds a listing to one room, and ${clearing} has ${keys.length} eligible: ` +
        `${keys.length === 0 ? "nothing can open a good sealed now" : keys.join(", ")}. ` +
        "Register exactly one room for this mode, or deploy a profile that uses CKD.",
    );
  }
  const row = await loadRoom(chain, clearing, keypolicy, roomKey);
  const attestation = row.attestation;
  if (attestation === null) {
    throw new Error(`${keypolicy} has no attestation record for room ${roomKey}`);
  }
  if (row.room === null || row.room.box_pk !== attestation.box_pk) {
    throw new Error(
      `${clearing} and ${keypolicy} do not agree on room ${roomKey}'s box_pk, so there is no ` +
        "attested key to seal to",
    );
  }
  if (row.denyReasons.length > 0) {
    throw new Error(
      `${clearing} would give room ${roomKey} no work: ${row.denyReasons.join(", ")}`,
    );
  }
  if (attestation.expires_at <= nowSecs) {
    throw new Error(
      `room ${roomKey}'s attestation expired at ${attestation.expires_at} (it is now ${nowSecs})`,
    );
  }
  if (!HEX32.test(attestation.box_pk) || /^0+$/.test(attestation.box_pk)) {
    throw new Error(`room ${roomKey}'s box_pk is not a 32-byte key: "${attestation.box_pk}"`);
  }
  if (!HEX32.test(attestation.quote_hash)) {
    throw new Error(`room ${roomKey}'s record carries no quote hash: "${attestation.quote_hash}"`);
  }
  return {
    publicKey: attestation.box_pk,
    roomKey,
    quoteHash: attestation.quote_hash,
    measurementHash: attestation.measurement_hash,
    attestationMode: attestation.mode,
    expiresAt: attestation.expires_at,
  };
}

/**
 * What the quote hash the seller is about to seal against is worth. `modeNote` is `/rooms`' own
 * wording, so the same room reads the same way on both pages.
 */
export function quoteNote(target: SealTarget): string {
  const mode = modeNote(target.attestationMode);
  return mode.real
    ? `${mode.note} This page did not re-verify it: it shows the hash of the quote the chain ` +
        "verified, so it can be compared with the room's record on /rooms."
    : `${mode.note} The quote hash below identifies a quote nothing on this chain checked, so the ` +
        "box_pk you are sealing to is attested in name only.";
}

/**
 * The key this listing's `DEK_g` is sealed to, or null while there is none.
 *
 * Under Ckd that is the listing's own `pk_L`, which exists only once a room has reported it; under
 * RoomSealed it is the attested room's `box_pk`. A good sealed to anything else can never be
 * opened, which is why this is one function rather than a condition at each call site.
 */
export function sealPublicKey(
  mode: KeyMode,
  listing: Listing | null,
  target: SealTarget | null,
): string | null {
  if (mode === "Ckd") return listing?.pk_l ?? null;
  return target?.publicKey ?? null;
}

/** Where an object was uploaded, for the step that shows it. */
export interface Sealed {
  readonly goodKey: string;
  readonly dekKey: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly ciphertext: BlobRefJson;
}

/**
 * Seals the good and uploads both objects (SDD §3.19, §3.12.4). This is the whole of what the
 * browser does with the plaintext: a fresh `DEK_g`, XChaCha20-Poly1305 over the canonical text,
 * `DEK_g ‖ salt` in a sealed box to `sealTo`, and the two objects at the keys the room reads.
 *
 * It is the same code for both modes, because the only thing that differs is which public key is
 * passed in — and the room opens either one the same way.
 */
export async function sealAndUpload(
  input: {
    readonly canonical: string;
    readonly saltHex: string;
    readonly sealTo: string;
    readonly listingId: number;
    readonly version: number;
  },
  upload: (key: string, bytesHex: string) => Promise<Uploaded>,
): Promise<Sealed> {
  const key = await dek();
  const object = await aeadSeal(key, new TextEncoder().encode(input.canonical), new Uint8Array(0));
  const wrapped = await wrapKey(fromHex(input.sealTo), key, fromHex(input.saltHex));
  const good = goodKey(input.listingId, input.version);
  const dekAt = wrappedKeyKey(input.listingId, input.version);
  const uploaded = await upload(good, toHex(object));
  await upload(dekAt, toHex(wrapped));
  return {
    goodKey: good,
    dekKey: dekAt,
    sha256: uploaded.sha256,
    bytes: object.length,
    ciphertext: await blobRefJson(good, uploaded.sha256, object.length),
  };
}

// -----------------------------------------------------------------------------------------------
// The disclosure RoomSealed is not allowed to be used without (SDD §3.12.7)

/** One thing the seller is told before signing. */
export interface Limitation {
  readonly title: string;
  readonly detail: string;
}

/**
 * The limitations §3.12.7 says are "disclosed whenever the mode is used", as the seller's own
 * listing rather than as a footnote: the key is lost on a restart, one room is the only one that
 * can ever deliver, and DR-5's job-commitment proof is absent. The fourth item is what this room's
 * attestation is actually worth, which decides how much the other three cost.
 *
 * The wording is bound by AC-29: nothing here claims deletion or unlearning. A room forgets a
 * plaintext **under attestation** — a claim about the room's code and hardware, not a proof — and
 * that is how it is said.
 */
export function roomSealedDisclosure(target: SealTarget): readonly Limitation[] {
  return [
    {
      title: "A room restart loses the key",
      detail:
        "DEK_g is sealed to box_pk, which the room generates in memory at boot and never writes " +
        "down. A restarted room has a different one, and this listing has to be sealed and " +
        "published again before any buyer can appraise it.",
    },
    {
      title: `Only room ${target.roomKey.slice(0, 10)}… can ever deliver`,
      detail:
        "No other room holds the secret half of this key, however well it is attested, so a " +
        "re-delivery, a re-appraisal or a re-assignment after an expiry is impossible while this " +
        "listing is RoomSealed. Under CKD any eligible room can do all three.",
    },
    {
      title: "There is no job-commitment proof",
      detail:
        "Under CKD the room gets the listing key only with KeyPolicy's signature over the " +
        "commitment of the job the buyer paid for, so the release is itself the proof (DR-5). " +
        "RoomSealed has no such ticket: the room already holds the key, and all that stands " +
        "between a job and the good is the room recomputing that commitment from what one RPC " +
        "endpoint told it. SDD §3.12.7's answer is a cross-check on two independent providers; " +
        "M1's room reads one. The good's working plaintext is still forgotten under attestation, " +
        "which rests on the room's code and hardware rather than on any proof.",
    },
    { title: "What this room's attestation is worth", detail: quoteNote(target) },
  ];
}

// -----------------------------------------------------------------------------------------------
// The payout quote (D7)

/** What the seller is shown a quote for. */
export interface PayoutQuoteInput {
  /** The settlement token on NEAR, which is what would be swapped. */
  readonly token: string;
  /** The ask, in the token's base units: the amount a sale would pay out. */
  readonly amount: string;
  /** The seller's NEAR account, where a refund would land. */
  readonly refundTo: string;
  /** The destination address the seller gave. */
  readonly recipient: string;
  /** The destination asset's Intents id, which only the seller can supply (see `/sell`). */
  readonly destinationAsset: string;
}

/**
 * The 1Click quote request, as the gateway forwards it (`services/gateway/src/quote.ts` forces
 * `dry: true`, so this can never commit anyone to a swap).
 *
 * The destination asset is the seller's to give: 1Click names assets by their Intents id, and
 * guessing one would produce a confidently wrong number for a different token. A quote is a price,
 * and a made-up price is worse than no price.
 */
export function quoteRequest(input: PayoutQuoteInput): Record<string, unknown> {
  if (input.destinationAsset === "") throw new Error("a quote needs the destination asset's id");
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: `nep141:${input.token}`,
    depositType: "INTENTS",
    destinationAsset: input.destinationAsset,
    amount: input.amount,
    refundTo: input.refundTo,
    refundType: "INTENTS",
    recipient: input.recipient,
    recipientType: "DESTINATION_CHAIN",
  };
}

/**
 * Asks the gateway for a dry quote. Nothing is stored, here or there: the reply is rendered and
 * dropped (1Click ToS §4.1(e)).
 */
export async function dryQuote(
  gateway: string,
  request: Record<string, unknown>,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<unknown> {
  const response = await ask(
    fetchImpl,
    `${gateway}/v1/quote`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
    gateway,
  );
  return response.json();
}

/**
 * What 1Click said the destination would receive, if it said anything. A reply this app cannot read
 * is shown as no quote rather than as a zero: the seller sees the raw answer either way.
 */
export function quoteAmount(reply: unknown): string | null {
  const quote = (reply as { quote?: { amountOutFormatted?: unknown; amountOut?: unknown } } | null)
    ?.quote;
  if (typeof quote?.amountOutFormatted === "string") return quote.amountOutFormatted;
  if (typeof quote?.amountOut === "string") return quote.amountOut;
  return null;
}
