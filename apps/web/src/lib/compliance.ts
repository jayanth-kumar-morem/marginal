/**
 * What `/compliance` reads, recomputes and exports (E13.7, D8, DRC-8; SPEC SC-22).
 *
 * Three jobs live here. The **audit walk** pages `get_audit` to the end and folds the entries back
 * into a head, so the page can say whether the chain holds rather than quote the contract's own
 * answer back at the reader. The **export** is the same walk written down, with the settlements,
 * the listings' public metadata and the certificate hashes beside it; because every byte of it came
 * from a view, it re-verifies without a signature from us — which is the point of SC-22's "show
 * controls to a regulator without Marginal ever seeing the content". And the **request handler**
 * behind `/api/compliance` is here rather than in `route.ts` because Next refuses any export from a
 * route file other than its verbs.
 *
 * Nothing here hashes anything itself: the chain step is `marginal-core`'s `audit_step`, injected as
 * {@link AuditStep}, so the browser, the room and the contract agree to the byte. It is injected
 * rather than imported because `@marginal/core-wasm` loads its wasm with `node:fs`, so it exists
 * only on the server, while this module is also bundled for the client.
 *
 * The browser reaches both the chain and the host services **through** the handler. Two separate
 * reasons: the compliance service sends no CORS headers, and the app's CSP (`next.config.ts`) only
 * opens `connect-src` to its own origin and the configured RPC, which on a sandbox deploy is a
 * loopback port the CSP was not built with. Same-origin is the only thing that works everywhere.
 */
import { errorCode, type ChainPort, type Fetch } from "./chain";
import type { WebConfig } from "./config";
import { loadJobs, type JobRow } from "./jobs";
import { loadListings, type ListingRow } from "./listings";
import type { AuditEntry, Job, Settlement } from "./records";

/** The head before the first entry (`marginal_core::audit::AUDIT_GENESIS`). */
export const AUDIT_GENESIS = "0".repeat(64);
/** `clearing::views::MAX_AUDIT_PAGE`: the most entries one `get_audit` call will return (§3.10). */
export const AUDIT_PAGE = 100;
/** How far back the export reaches for jobs and listings. Demo scale, read by id (there is no indexer). */
export const EXPORT_LIMIT = 200;
/** The export's format tag, so a zip from another version is refused rather than misread. */
export const EXPORT_FORMAT = "marginal-audit-export/1";
/** A leakage debit of exactly one bit, in the millibits the contract accounts in. */
export const ONE_BIT_MBITS = 1_000;

/** The names inside an export zip. A reader opens `manifest.json` first. */
export const EXPORT_FILES = {
  manifest: "manifest.json",
  entries: "audit.json",
  settlements: "settlements.json",
  listings: "listings.json",
  certificates: "certificates.json",
} as const;

/** `head[n+1] = SHA-256(head[n] ‖ borsh(entry))`, as `marginal-core` computes it. */
export type AuditStep = (prevHead: string, entry: AuditEntry) => string;

/** `clearing.audit_head()`. */
export interface AuditHead {
  readonly seq: number;
  readonly head: string;
}

// ---------------------------------------------------------------------------- the audit chain

/**
 * Every entry from 1 to `lastSeq`. The view caps a page at {@link AUDIT_PAGE}, and it drops a
 * sequence it cannot find rather than erroring, so the walk steps by `page` over the sequence space
 * instead of trusting a short page to mean the end — a gap is then visible to
 * {@link missingSeqs} rather than silently truncating the chain.
 *
 * Anything past `lastSeq` is dropped. A page is a window of `page` sequences, not of `page`
 * entries, so the last one reaches beyond the head the caller read; on a live chain a settlement
 * landing between the two calls would otherwise put an entry in the walk that the head does not
 * cover, and a chain that is perfectly sound would be reported as broken.
 */
export async function loadAudit(
  chain: ChainPort,
  clearing: string,
  lastSeq: number,
  page: number,
): Promise<readonly AuditEntry[]> {
  const entries: AuditEntry[] = [];
  for (let from = 1; from <= lastSeq; from += page) {
    const batch = await chain.view<readonly AuditEntry[]>(clearing, "get_audit", {
      from: String(from),
      limit: page,
    });
    entries.push(...batch.filter((entry) => entry.seq <= lastSeq));
  }
  return entries;
}

/** The head these entries fold to, starting from genesis. */
export function recomputeHead(entries: readonly AuditEntry[], step: AuditStep): string {
  return entries.reduce<string>((head, entry) => step(head, entry), AUDIT_GENESIS);
}

/** Which sequences between 1 and `lastSeq` the walk did not return. */
export function missingSeqs(
  entries: readonly AuditEntry[],
  lastSeq: number,
): readonly number[] {
  const seen = new Set(entries.map((entry) => entry.seq));
  const missing: number[] = [];
  for (let seq = 1; seq <= lastSeq; seq += 1) {
    if (!seen.has(seq)) missing.push(seq);
  }
  return missing;
}

/** The walk, the contract's own head, and whether the two agree. */
export interface AuditCheck {
  readonly head: AuditHead;
  readonly entries: readonly AuditEntry[];
  readonly recomputed: string;
  readonly missing: readonly number[];
  readonly holds: boolean;
}

export async function checkAudit(
  chain: ChainPort,
  clearing: string,
  step: AuditStep,
  page: number,
): Promise<AuditCheck> {
  const head = await chain.view<AuditHead>(clearing, "audit_head");
  const entries = await loadAudit(chain, clearing, head.seq, page);
  const recomputed = recomputeHead(entries, step);
  const missing = missingSeqs(entries, head.seq);
  return {
    head,
    entries,
    recomputed,
    missing,
    holds: missing.length === 0 && recomputed === head.head,
  };
}

// ------------------------------------------------------------------- screening, holds, copies

/** The listings a compliance hold stopped before any appraisal could run (§3.5, D8). */
export function heldListings(rows: readonly ListingRow[]): readonly ListingRow[] {
  return rows.filter((row) => row.listing.status === "Held");
}

/** A job that ended `Restricted`: the buyer's own list matched, and one bit says so. */
export interface RestrictedJob {
  readonly job: Job;
  readonly settlement: Settlement;
}

export function restrictedJobs(rows: readonly JobRow[]): readonly RestrictedJob[] {
  const restricted: RestrictedJob[] = [];
  for (const row of rows) {
    if (row.settlement !== null && row.settlement.outcome === "Restricted") {
      restricted.push({ job: row.job, settlement: row.settlement });
    }
  }
  return restricted;
}

/**
 * Whether the debit was exactly one bit. DRC-8 asks for that figure and not a smaller one: a
 * `Restricted` verdict reveals that the buyer's list matched, which is one bit, and the contract
 * charges for it so the reveal is paid for rather than free.
 */
export function exactlyOneBit(settlement: Settlement): boolean {
  return settlement.leakage_debit_mbits === ONE_BIT_MBITS;
}

/** The jobs whose buyer asked for a compliance copy of the delivery (§3.19, AC-55). */
export function complianceCopies(rows: readonly JobRow[]): readonly JobRow[] {
  return rows.filter((row) => row.job.compliance_pk !== null);
}

// --------------------------------------------------------------------------------- the export

/**
 * An export's `manifest.json`. Flat on purpose: every field is a string or a number, so the shape
 * check that reads a zip back in is one table rather than a tree of special cases.
 */
export interface ExportManifest {
  readonly format: string;
  readonly chain_id: string;
  readonly clearing: string;
  readonly exported_at: string;
  /** `audit_head().head` when the export was taken. */
  readonly head: string;
  readonly head_seq: number;
  /** The same head, recomputed from the entries below rather than read off the contract. */
  readonly recomputed_head: string;
  readonly entries: number;
  readonly settlements: number;
  readonly listings: number;
  readonly certificates: number;
}

/**
 * The whole export. The settlements, listings and certificates are carried as they came off the
 * views — they are public metadata by construction, so there is nothing to project away — and are
 * typed `unknown` because re-verification compares the audit entries, not these. The entries' own
 * payload hashes are what commit to them.
 */
export interface AuditExport {
  readonly manifest: ExportManifest;
  readonly entries: readonly AuditEntry[];
  readonly settlements: readonly unknown[];
  readonly listings: readonly unknown[];
  readonly certificates: readonly unknown[];
}

/** Builds the export from views alone. `exportedAt` is the caller's clock, so a test can fix it. */
export async function buildExport(
  chain: ChainPort,
  clearing: string,
  step: AuditStep,
  meta: { readonly chainId: string; readonly exportedAt: string },
  limit: number,
): Promise<AuditExport> {
  const check = await checkAudit(chain, clearing, step, AUDIT_PAGE);
  const jobs = await loadJobs(chain, clearing, limit);
  const listings = await loadListings(chain, clearing, limit);
  const settlements = jobs
    .map((row) => row.settlement)
    .filter((settlement): settlement is Settlement => settlement !== null);
  const certificates = settlements.flatMap((settlement) =>
    settlement.cert_hashes.map((hash) => ({ job_id: settlement.job_id, hash })),
  );
  return {
    manifest: {
      format: EXPORT_FORMAT,
      chain_id: meta.chainId,
      clearing,
      exported_at: meta.exportedAt,
      head: check.head.head,
      head_seq: check.head.seq,
      recomputed_head: check.recomputed,
      entries: check.entries.length,
      settlements: settlements.length,
      listings: listings.length,
      certificates: certificates.length,
    },
    entries: check.entries,
    settlements,
    listings: listings.map((row) => row.listing),
    certificates,
  };
}

const pretty = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** The export as the files a zip holds, in reading order. */
export function exportFiles(
  data: AuditExport,
): readonly { readonly name: string; readonly text: string }[] {
  return [
    { name: EXPORT_FILES.manifest, text: pretty(data.manifest) },
    { name: EXPORT_FILES.entries, text: pretty(data.entries) },
    { name: EXPORT_FILES.settlements, text: pretty(data.settlements) },
    { name: EXPORT_FILES.listings, text: pretty(data.listings) },
    { name: EXPORT_FILES.certificates, text: pretty(data.certificates) },
  ];
}

/** A suggested filename, so two exports of the same deployment do not overwrite each other. */
export function exportName(manifest: ExportManifest): string {
  return `marginal-audit-${manifest.clearing}-${manifest.head_seq}.zip`;
}

const MANIFEST_SHAPE: Readonly<Record<string, string>> = {
  format: "string",
  chain_id: "string",
  clearing: "string",
  exported_at: "string",
  head: "string",
  head_seq: "number",
  recomputed_head: "string",
  entries: "number",
  settlements: "number",
  listings: "number",
  certificates: "number",
};

const ENTRY_SHAPE: Readonly<Record<string, string>> = {
  seq: "number",
  height: "number",
  kind: "string",
  subject_id: "number",
  payload_hash: "string",
};

/** The fields two entries have to agree on for the export to still describe the chain. */
const ENTRY_FIELDS: readonly (keyof AuditEntry)[] = [
  "height",
  "kind",
  "subject_id",
  "payload_hash",
];

function shaped<T>(value: unknown, shape: Readonly<Record<string, string>>, what: string): T {
  const fields = (value ?? {}) as Record<string, unknown>;
  for (const [field, kind] of Object.entries(shape)) {
    if (typeof fields[field] !== kind) {
      throw new Error(`${what}: ${field} is not a ${kind}`);
    }
  }
  return fields as unknown as T;
}

function readJson(files: Readonly<Record<string, string>>, name: string): unknown {
  const text = files[name];
  if (text === undefined) throw new Error(`the export has no ${name}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${name} is not JSON`);
  }
}

function readArray(files: Readonly<Record<string, string>>, name: string): readonly unknown[] {
  const value = readJson(files, name);
  if (!Array.isArray(value)) throw new Error(`${name} is not an array`);
  return value as readonly unknown[];
}

/**
 * Reads an export zip's files back into an {@link AuditExport}, or throws with what is wrong. The
 * format tag is checked first: a zip from another version would be read with the wrong meaning, and
 * saying so is better than reporting every entry as a mismatch.
 */
export function parseExport(files: Readonly<Record<string, string>>): AuditExport {
  const manifest = shaped<ExportManifest>(
    readJson(files, EXPORT_FILES.manifest),
    MANIFEST_SHAPE,
    EXPORT_FILES.manifest,
  );
  if (manifest.format !== EXPORT_FORMAT) {
    throw new Error(`this export is ${manifest.format}, and this page reads ${EXPORT_FORMAT}`);
  }
  return {
    manifest,
    entries: readArray(files, EXPORT_FILES.entries).map((entry) =>
      shaped<AuditEntry>(entry, ENTRY_SHAPE, EXPORT_FILES.entries),
    ),
    settlements: readArray(files, EXPORT_FILES.settlements),
    listings: readArray(files, EXPORT_FILES.listings),
    certificates: readArray(files, EXPORT_FILES.certificates),
  };
}

/** One entry the export and the chain disagree about. */
export interface Mismatch {
  readonly seq: number;
  readonly problem: string;
}

/** Every disagreement between an export's entries and the chain's, in sequence order. */
export function compareEntries(
  loaded: readonly AuditEntry[],
  onChain: readonly AuditEntry[],
): readonly Mismatch[] {
  const chainBySeq = new Map(onChain.map((entry) => [entry.seq, entry]));
  const loadedSeqs = new Set(loaded.map((entry) => entry.seq));
  const problems: Mismatch[] = [];
  for (const entry of loaded) {
    const live = chainBySeq.get(entry.seq);
    if (live === undefined) {
      problems.push({ seq: entry.seq, problem: "the chain has no entry at this sequence" });
      continue;
    }
    const differs = ENTRY_FIELDS.filter((field) => entry[field] !== live[field]);
    if (differs.length > 0) {
      problems.push({ seq: entry.seq, problem: `${differs.join(", ")} differs from the chain` });
    }
  }
  for (const entry of onChain) {
    if (!loadedSeqs.has(entry.seq)) {
      problems.push({ seq: entry.seq, problem: "the export is missing this entry" });
    }
  }
  return problems.sort((left, right) => left.seq - right.seq);
}

/** What re-verifying a loaded export against the chain found. */
export interface Reverification {
  readonly manifest: ExportManifest;
  /** The head the export's own entries fold to, recomputed now. */
  readonly recomputed: string;
  readonly chainHead: AuditHead;
  /** The chain has entries past the export's head. Expected on a live deployment, not a fault. */
  readonly advanced: boolean;
  readonly mismatches: readonly Mismatch[];
  readonly holds: boolean;
}

/**
 * Re-verifies an export (DRC-8's "the audit export re-verifies"). Three things have to hold: the
 * export's entries fold to the head the export claims, that head is the one the export recorded as
 * recomputed, and every entry is still exactly what the chain says. The chain having moved on since
 * the export is reported separately, because it is normal.
 */
export async function reverifyExport(
  chain: ChainPort,
  clearing: string,
  step: AuditStep,
  loaded: AuditExport,
  page: number,
): Promise<Reverification> {
  const check = await checkAudit(chain, clearing, step, page);
  const upTo = check.entries.filter((entry) => entry.seq <= loaded.manifest.head_seq);
  const mismatches = compareEntries(loaded.entries, upTo);
  const recomputed = recomputeHead(loaded.entries, step);
  return {
    manifest: loaded.manifest,
    recomputed,
    chainHead: check.head,
    advanced: check.head.seq > loaded.manifest.head_seq,
    mismatches,
    holds:
      mismatches.length === 0 &&
      recomputed === loaded.manifest.head &&
      recomputed === loaded.manifest.recomputed_head,
  };
}

// --------------------------------------------------------------- the /api/compliance handler

/** A delivery as `marginal-core`'s `delivery_decode` describes it (`DeliveryV1`, §3.19). */
export interface SealedDelivery {
  readonly eph_pk: string;
  readonly entries: readonly { readonly recipient: string; readonly ciphertext: string }[];
}

/** Everything the handler needs from outside itself, so a test can drive it without a network. */
export interface ComplianceDeps {
  readonly config: WebConfig;
  readonly chain: ChainPort;
  readonly step: AuditStep;
  readonly fetchImpl: Fetch;
  /** `delivery_decode`: Borsh bytes as hex in, the sealed bundle out. */
  readonly decodeDelivery: (bytes: string) => SealedDelivery;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
}

/** A host service either answered or it did not. "It did not" is an ordinary answer here. */
export type Reached<T> = ({ readonly reachable: true } & T) | {
  readonly reachable: false;
  readonly error: string;
};

const asJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function serviceError(body: unknown, status: number): string {
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === "string" ? message : `the service answered ${status}`;
}

/**
 * One GET against the compliance service. It is usually not running — it is its own deploy and
 * holds the only two keys that can grant anything — so being unreachable is reported, not thrown.
 */
async function serviceGet(deps: ComplianceDeps, path: string): Promise<Reached<{ body: unknown }>> {
  try {
    const response = await deps.fetchImpl(`${deps.config.compliance}${path}`, {
      headers: { accept: "application/json" },
    });
    const body: unknown = await response.json();
    if (!response.ok) return { reachable: false, error: serviceError(body, response.status) };
    return { reachable: true, body };
  } catch (error) {
    return { reachable: false, error: errorCode(error) };
  }
}

/**
 * The sealed delivery bundle for a job, from the gateway's blob store (`deliveries/{job_id}`,
 * written by `room/src/worker/appraisal.ts`). The gateway is untrusted and holds only sealed
 * objects, so serving this to the browser reveals nothing: without a secret key it is noise.
 */
async function sealedDelivery(
  deps: ComplianceDeps,
  jobText: string,
): Promise<Reached<{ delivery: SealedDelivery }>> {
  const jobId = Number(jobText);
  if (!Number.isInteger(jobId) || jobId < 1) {
    return { reachable: false, error: `${JSON.stringify(jobText)} is not a job id` };
  }
  try {
    const response = await deps.fetchImpl(`${deps.config.gateway}/v1/blob/deliveries/${jobId}`);
    if (!response.ok) {
      return { reachable: false, error: `the gateway answered ${response.status}` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { reachable: true, delivery: deps.decodeDelivery(hex) };
  } catch (error) {
    return { reachable: false, error: errorCode(error) };
  }
}

/** The five file texts out of a posted body, or null if the body is not that. */
export function filesIn(body: unknown): Readonly<Record<string, string>> | null {
  const files = (body as { files?: unknown } | null)?.files;
  if (files === null || typeof files !== "object") return null;
  const out: Record<string, string> = {};
  for (const [name, text] of Object.entries(files as Record<string, unknown>)) {
    if (typeof text === "string") out[name] = text;
  }
  return out;
}

/**
 * `/api/compliance`. A GET carries `op`; a POST is always a re-verification, because the only thing
 * a browser sends this handler is an export it wants checked. A pasted compliance key never comes
 * here — it stays in the browser, so there is nothing in a URL or a log to find.
 */
export async function handleRequest(request: Request, deps: ComplianceDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  try {
    if (request.method === "POST") {
      const body: unknown = await request.json().catch(() => null);
      const files = filesIn(body);
      if (files === null) return asJson({ error: "that request carries no export files" }, 400);
      let loaded: AuditExport;
      try {
        loaded = parseExport(files);
      } catch (error) {
        return asJson({ error: errorCode(error) }, 400);
      }
      const report = await reverifyExport(
        deps.chain,
        deps.config.clearing,
        deps.step,
        loaded,
        AUDIT_PAGE,
      );
      return asJson({ report });
    }
    const op = params.get("op") ?? "";
    if (op === "service") return asJson(await serviceGet(deps, "/v1/health"));
    if (op === "screenings") {
      const subject = params.get("subject") ?? "";
      if (subject === "") return asJson({ error: "name a subject to look up" }, 400);
      return asJson(await serviceGet(deps, `/v1/screenings/${encodeURIComponent(subject)}`));
    }
    if (op === "delivery") return asJson(await sealedDelivery(deps, params.get("job") ?? ""));
    if (op === "export") {
      const exported = await buildExport(
        deps.chain,
        deps.config.clearing,
        deps.step,
        {
          chainId: deps.config.chainId,
          exportedAt: new Date(deps.now()).toISOString(),
        },
        EXPORT_LIMIT,
      );
      return asJson({ export: exported });
    }
    return asJson({ error: `${JSON.stringify(op)} is not an operation` }, 400);
  } catch (error) {
    // A view that refused, or an RPC that is not there. The chain's own code is the useful part.
    return asJson({ error: errorCode(error) }, 502);
  }
}
