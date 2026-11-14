/**
 * What `/appraise/[id]` computes (E13.4, D1, D8, D10).
 *
 * The page's job is to tell a buyer the truth before they sign: what the appraisal will debit from
 * the listing's leakage budget, what that debit costs them at the seller's π per bit, and what the
 * escrow balance has to cover. None of those numbers are worked out here — every one of them comes
 * from `marginal-core` through `@marginal/core-wasm` (`max_debit`, `fund`), which is the same code
 * the contract runs, so the preview and the chain cannot disagree (SDD §3.8, §3.9.1).
 *
 * `marginal-core` loads a wasm file with `node:fs`, so it cannot run in the browser. Everything
 * here that needs it takes a {@link CoreCall} instead of importing it, and the one place that does
 * import it is the route handler at `src/app/api/appraise/route.ts`, which calls {@link handle}.
 */
import { errorCode } from "./chain";
import type { ChainPort, Fetch } from "./chain";
import { TOKEN_DECIMALS } from "./format";
import type { ClearingConfig, Job, Listing, PricingRule } from "./records";

/** One operation of `marginal-core`, as `@marginal/core-wasm`'s `call` provides it. */
export type CoreCall = (op: string, input: unknown) => unknown;

/** Who may see the verdict's numbers (`marginal_core::types::VerdictPrivacy`, §3.17). */
export type Privacy = "Open" | "Sealed";

/**
 * A listing's output schema. M1 is blind — no field is ever shown — so `fields` is always empty and
 * the debit comes from the component alphabets and the judge scale (§3.8).
 */
export interface OutputSchema {
  readonly fields: readonly never[];
  readonly component_alphabets: readonly number[];
  readonly judge_scale: number;
}

/**
 * The schemas M1's two appraisers publish, with the `schema_hash` each one produces.
 *
 * `get_listing` returns only `schema_hash`, not the schema, so the Open-mode debit cannot be read
 * off the chain. It can still be *checked*: the hash is SHA-256 of the schema's Borsh bytes, so a
 * listing whose `schema_hash` matches one of these entries has exactly that schema, and the debit
 * computed from it is the one the contract will reserve. A listing that matches nothing gets no
 * Open preview at all rather than a guessed one — see {@link schemaFor}.
 *
 * The alphabets are the appraisers' own constants: `room/src/appraisers/knowledge/index.ts` and
 * `dataset-lite/index.ts` both quantise to 21 levels, and a judge answers on the eleven-level
 * 0..=10 scale of `room/src/judges/sim.ts`. The hash is pinned because recomputing it would mean
 * re-implementing a Borsh layout in TypeScript, which this repo does in exactly one place (Rust).
 */
export const APPRAISER_SCHEMAS: Record<
  string,
  { readonly schema: OutputSchema; readonly schemaHash: string }
> = {
  "knowledge@1": {
    schema: { fields: [], component_alphabets: [21, 21], judge_scale: 11 },
    schemaHash: "72b4a70d885349ee67a4a24baa5ba7fe47dde697bc9b0b544b62cf47536276cc",
  },
  "dataset-lite@0": {
    schema: { fields: [], component_alphabets: [21, 21], judge_scale: 11 },
    schemaHash: "72b4a70d885349ee67a4a24baa5ba7fe47dde697bc9b0b544b62cf47536276cc",
  },
};

/**
 * The listing's schema, if this build knows it and the listing's own `schema_hash` proves it. A
 * `null` means the Open-mode debit cannot be previewed honestly; Sealed can still be, because a
 * sealed verdict debits one bit whatever the schema says.
 */
export function schemaFor(appraiser: string, schemaHash: string): OutputSchema | null {
  const known = APPRAISER_SCHEMAS[appraiser];
  if (known === undefined || known.schemaHash !== schemaHash) return null;
  return known.schema;
}

/**
 * How many judges a buyer may ask for. A seller who does not allow external judges gets none, and
 * the ceiling is two because that is what the room's proof takes (`room/src/prove.ts`, §3.16) —
 * `marginal_core::request::MAX_JUDGES` allows eight, which M1 cannot run.
 */
export function judgeChoices(listing: Listing): readonly number[] {
  return listing.external_judges_allowed ? [0, 1, 2] : [0];
}

/** The restricted list a buyer typed: comma- or newline-separated terms, deduplicated (D8). */
export function parseRestricted(text: string): readonly string[] {
  const seen = new Set<string>();
  for (const term of text.split(/[,\n]/)) {
    const trimmed = term.trim();
    if (trimmed !== "") seen.add(trimmed);
  }
  return [...seen];
}

/**
 * A typed token amount as base units, or `null` when it is not an amount. The inverse of
 * `format.amount`: six decimals for every M1 settlement token, and a seventh is refused rather
 * than rounded, because rounding someone's budget silently is how money goes missing.
 */
export function parseTokens(text: string, decimals = TOKEN_DECIMALS): string | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const dot = trimmed.indexOf(".");
  const whole = dot === -1 ? trimmed : trimmed.slice(0, dot);
  const fraction = dot === -1 ? "" : trimmed.slice(dot + 1);
  if (fraction.length > decimals) return null;
  return `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
}

/** Compares two `u128` decimal strings, which are too wide for a `number`. */
export function compare(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** What one privacy choice costs, all of it from `marginal-core`. */
export interface Quote {
  readonly privacy: Privacy;
  /** The debit the contract will reserve against the listing's leakage budget, in millibits. */
  readonly debit_mbits: number;
  /** π · debit / 1000: what the seller is paid for the bits, held in the job's `comp_reserved`. */
  readonly comp: string;
  /** The buyer's share of the clearing fee on the budget. */
  readonly fee: string;
  /** Budget + leakage compensation + fee: what the escrow balance must cover, less compute. */
  readonly total: string;
}

/** Everything a quote needs that the page already read from the chain. */
export interface QuoteInput {
  readonly appraiser: string;
  readonly schema_hash: string;
  readonly rule: PricingRule;
  /** Base units. */
  readonly budget: string;
  readonly n_judges: number;
  /** π, per whole bit, in base units. */
  readonly price_per_bit: string;
  readonly clearing_fee_buyer_bps: number;
}

/** Both choices, so the buyer can see what privacy costs before choosing (D10, SDD §3.17). */
export interface Quotes {
  /** `null` when this build cannot prove the listing's schema, so Open cannot be priced. */
  readonly open: Quote | null;
  readonly sealed: Quote;
}

interface FundOut {
  readonly buckets: { readonly comp_reserved: string; readonly fee_reserved: string };
  readonly total: string;
}

/**
 * One privacy choice priced. The `compute` bucket is passed as zero: it comes from the appraiser's
 * fee class in clearing's registry, which no view exposes, so the total here is a floor — the page
 * says so next to the figure.
 */
export function quoteFor(call: CoreCall, input: QuoteInput, schema: OutputSchema, privacy: Privacy): Quote {
  const debit = call("max_debit", {
    schema,
    mode: "Blind",
    rule: input.rule,
    privacy,
    n_judges: input.n_judges,
  }) as number;
  const funded = call("fund", {
    budget: input.budget,
    compute_fee: "0",
    price_per_bit: input.price_per_bit,
    max_debit_mbits: debit,
    clearing_fee_buyer_bps: input.clearing_fee_buyer_bps,
  }) as FundOut;
  return {
    privacy,
    debit_mbits: debit,
    comp: funded.buckets.comp_reserved,
    fee: funded.buckets.fee_reserved,
    total: funded.total,
  };
}

/**
 * Both quotes. Sealed is always priced — one bit, whatever the schema — and Open only when the
 * listing's `schema_hash` proves which schema it has.
 */
export function quotes(call: CoreCall, input: QuoteInput): Quotes {
  const schema = schemaFor(input.appraiser, input.schema_hash);
  // A sealed verdict publishes nothing but the outcome bit, so `max_debit` never reads the schema
  // for it (`marginal_core::leakage`). This stand-in is what lets an unknown listing still be
  // priced for Sealed, and it is the only honest thing to show when the schema cannot be proved.
  const sealedSchema: OutputSchema = schema ?? { fields: [], component_alphabets: [], judge_scale: 2 };
  return {
    open: schema === null ? null : quoteFor(call, input, schema, "Open"),
    sealed: quoteFor(call, input, sealedSchema, "Sealed"),
  };
}

/** `marginal_core::request::AppraisalRequest` in the JSON model (amounts decimal, bytes hex). */
export interface AppraisalRequestJson {
  readonly listing_id: number;
  readonly listing_version: number;
  readonly snapshot_id: number | null;
  readonly budget: string;
  readonly mode: "Blind";
  readonly privacy: Privacy;
  readonly n_judges: number;
  readonly delivery_pk: string;
  readonly compliance_pk: string | null;
  readonly context_auth_pk: string;
  readonly sealed_context_key: string;
  readonly refund_to: "Balance";
  readonly nullifier: null;
  readonly nullifier_sig: null;
}

/** What the form holds when the buyer presses the button. */
export interface RequestForm {
  readonly listing: Listing;
  /** Base units. */
  readonly budget: string;
  readonly privacy: Privacy;
  readonly nJudges: number;
  readonly deliveryPk: string;
  readonly contextAuthPk: string;
}

/**
 * The request the buyer signs.
 *
 * `mode` is `Blind` because clearing refuses `DisplayMode::Fields` in M1, and `refund_to` is
 * `Balance` so a refund lands back in escrow where the next appraisal can spend it without another
 * transfer.
 *
 * TODO(E12.1): `sealed_context_key` is empty and `snapshot_id` is null, so this request carries no
 * context envelope yet. The real sealing — `DEK_c` sealed to the room's attested `box_pk`, and the
 * key pair behind `context_auth_pk` — arrives in `sdk/ts/src/crypto.ts`, and the notes and
 * restricted list this page collects go to the room through it.
 */
export function buildRequest(form: RequestForm): AppraisalRequestJson {
  return {
    listing_id: form.listing.id,
    listing_version: form.listing.version,
    snapshot_id: null,
    budget: form.budget,
    mode: "Blind",
    privacy: form.privacy,
    n_judges: form.nJudges,
    delivery_pk: form.deliveryPk,
    compliance_pk: null,
    context_auth_pk: form.contextAuthPk,
    sealed_context_key: "",
    refund_to: "Balance",
    nullifier: null,
    nullifier_sig: null,
  };
}

/** Hex from the core's JSON model as the base64 a contract argument travels as. */
export function hexToBase64(hex: string): string {
  let binary = "";
  for (let index = 0; index < hex.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return btoa(binary);
}

/**
 * Thirty-two random bytes as hex, from the platform's own CSPRNG.
 *
 * TODO(E12.1): these stand in for a real X25519 key pair until `sdk/ts/src/crypto.ts` lands. A
 * placeholder public key is enough to open a job — the commitment binds whatever is sent — but a
 * delivery sealed to it cannot be opened, so the demo's delivery path needs the SDK's keys.
 */
export function randomKeyHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Everything that would make `request_appraisal` refuse, checked before anything is signed. */
export interface RequestCheck {
  readonly connected: boolean;
  /** Base units, or `null` when what was typed is not an amount. */
  readonly budget: string | null;
  /** The rule's minimum price, or `null` for a rule M1 does not price. */
  readonly ask: string | null;
  /** The chosen mode's quote, or `null` while the preview has not answered. */
  readonly quote: Quote | null;
  readonly remainingMbits: number;
  /** The buyer's escrow balance in base units, or `null` while it has not been read. */
  readonly balance: string | null;
}

/**
 * Why the contract would refuse this request, in its own codes. The page shows these and keeps the
 * button disabled: a refusal the buyer can read before they sign costs them nothing, and the same
 * check runs again on chain where it is the one that counts.
 */
export function requestProblems(check: RequestCheck): readonly string[] {
  const problems: string[] = [];
  if (!check.connected) {
    problems.push("Connect a wallet: the buyer signs this call and it spends the buyer's escrow.");
  }
  if (check.ask === null) {
    problems.push("This listing's pricing rule is not one M1 can price (E_RULE_DISABLED).");
  }
  if (check.budget === null) {
    problems.push("The budget is not an amount of the settlement token (at most six decimals).");
  } else if (check.ask !== null && compare(check.budget, check.ask) < 0) {
    problems.push("The budget is below the ask, so no deal could ever be struck (E_RULE_PARAMS).");
  }
  if (check.quote !== null && check.quote.debit_mbits > check.remainingMbits) {
    problems.push("This mode would leak more bits than the listing has left (E_BUDGET_EXHAUSTED).");
  }
  if (
    check.quote !== null &&
    check.balance !== null &&
    compare(check.balance, check.quote.total) < 0
  ) {
    problems.push("Your escrow balance is below what this job funds (E_BALANCE_LOW).");
  }
  return problems;
}

/**
 * The job this buyer just opened, by reading the chain back.
 *
 * `request_appraisal` answers `{status, job_id}`, but the wallet's `signAndSendTransaction` hands
 * the app a transaction hash and drops the function call's return value, so the id is recovered
 * from views instead: the newest job, confirmed to be this buyer's on this listing. A `null` means
 * the newest job is not this request's — because none was created, which is what
 * `{"status":"Blocked"}` does when an agent cap stopped it (§3.21), or because another buyer's job
 * landed in between. The page sends the buyer to the jobs list and says both, rather than claiming
 * which one it was.
 */
export async function findNewJob(
  chain: ChainPort,
  clearing: string,
  listingId: number,
  buyer: string,
): Promise<number | null> {
  const config = await chain.view<ClearingConfig>(clearing, "config");
  const id = config.next_job_id - 1;
  if (id < 1) return null;
  const job = await chain.view<Job | null>(clearing, "get_job", { job_id: String(id) });
  if (job === null) return null;
  if (job.listing_id !== listingId || job.buyer !== buyer) return null;
  return id;
}

/** The buyer's escrow balance for one token: what `request_appraisal` is funded from. */
export async function loadBalance(
  chain: ChainPort,
  clearing: string,
  account: string,
  token: string,
): Promise<string> {
  return chain.view<string>(clearing, "get_balance", { account, token });
}

/** What `POST /api/appraise` takes: a quote to show, or a request to encode. */
export type ApiBody =
  | { readonly op: "quote"; readonly input: QuoteInput }
  | { readonly op: "encode"; readonly request: AppraisalRequestJson };

/**
 * The app's own API, as the page calls it. A refusal arrives as the core's stable code and is
 * thrown as one, so `errorCode` finds it again and the page shows `E_RULE_PARAMS` as itself.
 */
export async function askApi<T>(body: ApiBody, fetchImpl: Fetch = globalThis.fetch): Promise<T> {
  const response = await fetchImpl("/api/appraise", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok?: T; error?: string };
  if (payload.ok === undefined) throw new Error(payload.error ?? "E_DECODE");
  return payload.ok;
}

function answer(payload: unknown): Response {
  return new Response(JSON.stringify({ ok: payload }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function refuse(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The route handler's whole body (`src/app/api/appraise/route.ts`).
 *
 * It exists because `marginal-core` is wasm loaded from disk: the browser cannot run it, and the
 * app must not re-implement `max_debit` or a Borsh layout in TypeScript. A refusal comes back as
 * the core's own stable code, so the page can show `E_SCHEMA_INVALID` as itself.
 */
export async function handle(call: CoreCall, request: Request): Promise<Response> {
  const body = await request
    .json()
    .then((parsed) => parsed as ApiBody)
    .catch(() => null);
  if (body === null) return refuse("E_DECODE");
  try {
    if (body.op === "quote") return answer(quotes(call, body.input));
    if (body.op === "encode") {
      call("validate_request", body.request);
      const hex = call("appraisal_request_encode", body.request) as string;
      return answer({ base64: hexToBase64(hex) });
    }
  } catch (error: unknown) {
    return refuse(errorCode(error));
  }
  return refuse("E_DECODE");
}
