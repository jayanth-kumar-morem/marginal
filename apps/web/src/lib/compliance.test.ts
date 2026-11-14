import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { ChainPort, Fetch } from "./chain";
import { configFrom, type WebConfig } from "./config";
import {
  AUDIT_GENESIS,
  AUDIT_PAGE,
  EXPORT_FILES,
  EXPORT_FORMAT,
  EXPORT_LIMIT,
  ONE_BIT_MBITS,
  buildExport,
  checkAudit,
  compareEntries,
  complianceCopies,
  exactlyOneBit,
  exportFiles,
  exportName,
  filesIn,
  handleRequest,
  heldListings,
  loadAudit,
  missingSeqs,
  parseExport,
  recomputeHead,
  restrictedJobs,
  reverifyExport,
  type AuditExport,
  type AuditStep,
  type ComplianceDeps,
  type SealedDelivery,
} from "./compliance";
import type { AuditEntry, Job, Listing, Settlement } from "./records";

// ------------------------------------------------------------------------------------ fixtures

/** A stand-in for `marginal-core`'s `audit_step`: any pure fold over the same bytes will do here. */
const step: AuditStep = (prevHead, entry) =>
  createHash("sha256").update(prevHead).update(JSON.stringify(entry)).digest("hex");

const entry = (seq: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
  seq,
  height: 2_000 + seq,
  kind: "ListingCreated",
  subject_id: 1,
  payload_hash: String(seq).repeat(2).padStart(64, "a"),
  ...over,
});

const listing = (id: number, over: Partial<Listing> = {}): Listing => ({
  id,
  seller: "seller.testnet",
  version: 1,
  status: "Active",
  asset_class: "Knowledge",
  category: 1,
  licence_class: 1,
  good_commitment: "aa".repeat(32),
  ciphertext: { uri_hash: "bb".repeat(32), sha256: "cc".repeat(32), size_class: 4 },
  key_mode: "Ckd",
  key_path_hash: "dd".repeat(32),
  pk_l: null,
  appraiser: "knowledge@1",
  schema_hash: "ee".repeat(32),
  rule: { Posted: { ask: "500000000" } },
  l_floor_bps: 2_000,
  disclosure_policy: "Blind",
  external_judges_allowed: false,
  token: "musdc.testnet",
  max_copies: 1,
  copies: 0,
  value_class: "B",
  challenge_window_blocks: 600,
  delivery_deadline_blocks: 600,
  publish_height: 2_100,
  ...over,
});

const job = (id: number, over: Partial<Job> = {}): Job => ({
  id,
  kind: "Appraisal",
  listing_id: 1,
  listing_version: 1,
  state: "Restricted",
  token: "musdc.testnet",
  job_commitment: "ab".repeat(32),
  buyer: "buyer.testnet",
  privacy: "Open",
  mode: "Blind",
  snapshot_id: null,
  max_debit_mbits: 4_000,
  delivery_pk: "11".repeat(32),
  compliance_pk: null,
  context_auth_pk: "22".repeat(32),
  buckets: {
    budget: "500000000",
    compute: "1000000",
    comp_reserved: "25000000",
    fee_reserved: "0",
    storage: "0",
    held: "0",
    refund: "0",
  },
  assigned: ["33".repeat(32)],
  requested_height: 2_000,
  deadline_height: 2_600,
  delivery_deadline_height: null,
  ...over,
});

const settlement = (jobId: number, over: Partial<Settlement> = {}): Settlement => ({
  job_id: jobId,
  outcome: "Restricted",
  price: "0",
  refund: "474000000",
  held: "0",
  held_until: null,
  fees: { treasury: "0" },
  leakage_debit_mbits: ONE_BIT_MBITS,
  leakage_comp: "6250000",
  components_commitment: null,
  delivery_commitment: null,
  delivery_receipt: null,
  cert_hashes: ["ff".repeat(32)],
  simulated_flags: 1,
  audit_seq: 3,
  payout: "0",
  ...over,
});

/** A chain whose every view is a table lookup, so a test says only what it needs to. */
interface Tables {
  readonly audit?: readonly AuditEntry[];
  readonly head?: { seq: number; head: string };
  readonly nextJobId?: number;
  readonly nextListingId?: number;
  readonly jobs?: Readonly<Record<number, Job>>;
  readonly settlements?: Readonly<Record<number, Settlement>>;
  readonly listings?: Readonly<Record<number, Listing>>;
  readonly fail?: string;
}

function fakeChain(tables: Tables): ChainPort & { calls: string[] } {
  const calls: string[] = [];
  const audit = tables.audit ?? [];
  return {
    calls,
    view<T>(_contract: string, method: string, args: unknown = {}): Promise<T> {
      calls.push(`${method} ${JSON.stringify(args)}`);
      if (tables.fail === method) return Promise.reject(new Error(`${method}: E_PAUSED`));
      const read = (): unknown => {
        if (method === "audit_head") {
          return tables.head ?? { seq: audit.length, head: recomputeHead(audit, step) };
        }
        if (method === "get_audit") {
          const { from, limit } = args as { from: string; limit: number };
          const first = Number(from);
          return audit.filter((row) => row.seq >= first && row.seq < first + limit);
        }
        if (method === "config") {
          return {
            next_job_id: tables.nextJobId ?? 1,
            next_listing_id: tables.nextListingId ?? 1,
          };
        }
        if (method === "get_job") {
          return tables.jobs?.[Number((args as { job_id: string }).job_id)] ?? null;
        }
        if (method === "get_settlement") {
          return tables.settlements?.[Number((args as { job_id: string }).job_id)] ?? null;
        }
        if (method === "get_listing") {
          return tables.listings?.[Number((args as { listing_id: string }).listing_id)] ?? null;
        }
        return null;
      };
      return Promise.resolve(read() as T);
    },
  };
}

const config = (): WebConfig =>
  configFrom({ MARGINAL_CLEARING: "clearing.sandbox", MARGINAL_KEYPOLICY: "keypolicy.sandbox" });

const sealed: SealedDelivery = {
  eph_pk: "99".repeat(32),
  entries: [
    { recipient: "11".repeat(32), ciphertext: "dead" },
    { recipient: "22".repeat(32), ciphertext: "beef" },
  ],
};

function deps(over: Partial<ComplianceDeps> = {}): ComplianceDeps {
  return {
    config: config(),
    chain: fakeChain({}),
    step,
    fetchImpl: (() => Promise.reject(new Error("no network in this test"))) as unknown as Fetch,
    decodeDelivery: () => sealed,
    now: () => 1_700_000_000_000,
    ...over,
  };
}

/** A fetch that answers one body, for the service and gateway proxies. */
function fakeFetch(
  reply: { ok?: boolean; status?: number; json?: unknown; bytes?: Uint8Array } | Error,
): Fetch & { urls: string[] } {
  const urls: string[] = [];
  const impl = (input: unknown): Promise<Response> => {
    urls.push(String(input));
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: () => Promise.resolve(reply.json),
      arrayBuffer: () => Promise.resolve((reply.bytes ?? new Uint8Array()).buffer),
    } as unknown as Response);
  };
  return Object.assign(impl as unknown as Fetch, { urls });
}

const get = (query: string): Request => new Request(`http://web.test/api/compliance${query}`);
const post = (body: unknown): Request =>
  new Request("http://web.test/api/compliance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const filesOf = (data: AuditExport): Record<string, string> =>
  Object.fromEntries(exportFiles(data).map((file) => [file.name, file.text]));

// -------------------------------------------------------------------------------- the walk

test("the genesis head is thirty-two zero bytes", () => {
  assert.equal(AUDIT_GENESIS, "0".repeat(64));
  assert.equal(AUDIT_PAGE, 100);
  assert.equal(EXPORT_LIMIT, 200);
});

test("an empty chain folds to genesis", () => {
  assert.equal(recomputeHead([], step), AUDIT_GENESIS);
});

test("each entry changes the head", () => {
  const one = recomputeHead([entry(1)], step);
  const two = recomputeHead([entry(1), entry(2)], step);
  assert.notEqual(one, AUDIT_GENESIS);
  assert.notEqual(one, two);
});

test("the walk reads one page when one page is enough", async () => {
  const chain = fakeChain({ audit: [entry(1), entry(2)] });
  const entries = await loadAudit(chain, "clearing.sandbox", 2, AUDIT_PAGE);
  assert.deepEqual(
    entries.map((row) => row.seq),
    [1, 2],
  );
  assert.deepEqual(chain.calls, ['get_audit {"from":"1","limit":100}']);
});

test("the walk pages to the end, because the view caps a page", async () => {
  const chain = fakeChain({ audit: [entry(1), entry(2), entry(3), entry(4), entry(5)] });
  const entries = await loadAudit(chain, "clearing.sandbox", 5, 2);
  assert.deepEqual(
    entries.map((row) => row.seq),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(chain.calls, [
    'get_audit {"from":"1","limit":2}',
    'get_audit {"from":"3","limit":2}',
    'get_audit {"from":"5","limit":2}',
  ]);
});

test("an entry that landed mid-walk is left out rather than breaking the fold", async () => {
  // A page is a window of sequences, so the last one reaches past the head the caller read.
  const chain = fakeChain({ audit: [entry(1), entry(2), entry(3)] });
  const entries = await loadAudit(chain, "clearing.sandbox", 2, AUDIT_PAGE);
  assert.deepEqual(
    entries.map((row) => row.seq),
    [1, 2],
  );
});

test("a chain with no entries is not walked at all", async () => {
  const chain = fakeChain({});
  assert.deepEqual(await loadAudit(chain, "clearing.sandbox", 0, AUDIT_PAGE), []);
  assert.deepEqual(chain.calls, []);
});

test("nothing is missing from a complete walk", () => {
  assert.deepEqual(missingSeqs([entry(1), entry(2)], 2), []);
});

test("a gap in the walk is named by sequence", () => {
  assert.deepEqual(missingSeqs([entry(1), entry(4)], 4), [2, 3]);
});

test("the chain holds when the walk rebuilds the contract's own head", async () => {
  const audit = [entry(1), entry(2), entry(3)];
  const check = await checkAudit(fakeChain({ audit }), "clearing.sandbox", step, AUDIT_PAGE);
  assert.equal(check.holds, true);
  assert.equal(check.recomputed, check.head.head);
  assert.equal(check.entries.length, 3);
  assert.deepEqual(check.missing, []);
});

test("a head that does not match the walk is reported, not hidden", async () => {
  const check = await checkAudit(
    fakeChain({ audit: [entry(1)], head: { seq: 1, head: "ba".repeat(32) } }),
    "clearing.sandbox",
    step,
    AUDIT_PAGE,
  );
  assert.equal(check.holds, false);
  assert.notEqual(check.recomputed, check.head.head);
});

test("a chain missing an entry does not hold even if the rest rebuilds", async () => {
  const check = await checkAudit(
    fakeChain({ audit: [entry(2)], head: { seq: 2, head: recomputeHead([entry(2)], step) } }),
    "clearing.sandbox",
    step,
    AUDIT_PAGE,
  );
  assert.equal(check.holds, false);
  assert.deepEqual(check.missing, [1]);
});

// ------------------------------------------------------------------ screening, holds, copies

test("only a held listing is a compliance hold", () => {
  const rows = [
    { listing: listing(1, { status: "Held" }), leakage: null },
    { listing: listing(2), leakage: null },
  ];
  assert.deepEqual(
    heldListings(rows).map((row) => row.listing.id),
    [1],
  );
});

test("only a settled restricted job counts as a restricted outcome", () => {
  const rows = [
    { job: job(1), settlement: settlement(1) },
    { job: job(2, { state: "Deal" }), settlement: settlement(2, { outcome: "Deal" }) },
    { job: job(3, { state: "Computing" }), settlement: null },
  ];
  assert.deepEqual(
    restrictedJobs(rows).map((row) => row.job.id),
    [1],
  );
});

test("a restricted debit is exactly one bit, and anything else is not", () => {
  assert.equal(exactlyOneBit(settlement(1)), true);
  assert.equal(exactlyOneBit(settlement(1, { leakage_debit_mbits: 2_000 })), false);
});

test("a compliance copy is a job whose buyer asked for one", () => {
  const rows = [
    { job: job(1), settlement: null },
    { job: job(2, { compliance_pk: "44".repeat(32) }), settlement: null },
  ];
  assert.deepEqual(
    complianceCopies(rows).map((row) => row.job.id),
    [2],
  );
});

// ------------------------------------------------------------------------------- the export

const exportTables: Tables = {
  audit: [entry(1), entry(2)],
  nextJobId: 3,
  nextListingId: 2,
  jobs: { 1: job(1), 2: job(2, { state: "Computing" }) },
  settlements: { 1: settlement(1) },
  listings: { 1: listing(1, { status: "Held" }) },
};

test("an export is built from views alone, and its manifest counts what is in it", async () => {
  const data = await buildExport(
    fakeChain(exportTables),
    "clearing.sandbox",
    step,
    { chainId: "sandbox", exportedAt: "2026-11-14T00:00:00.000Z" },
    EXPORT_LIMIT,
  );
  assert.equal(data.manifest.format, EXPORT_FORMAT);
  assert.equal(data.manifest.chain_id, "sandbox");
  assert.equal(data.manifest.clearing, "clearing.sandbox");
  assert.equal(data.manifest.exported_at, "2026-11-14T00:00:00.000Z");
  assert.equal(data.manifest.head_seq, 2);
  assert.equal(data.manifest.head, data.manifest.recomputed_head);
  assert.equal(data.manifest.entries, 2);
  assert.equal(data.manifest.settlements, 1);
  assert.equal(data.manifest.listings, 1);
  assert.equal(data.manifest.certificates, 1);
  assert.deepEqual(data.certificates, [{ job_id: 1, hash: "ff".repeat(32) }]);
});

test("an empty deployment exports an empty but well-formed bundle", async () => {
  const data = await buildExport(
    fakeChain({}),
    "clearing.sandbox",
    step,
    { chainId: "sandbox", exportedAt: "2026-11-14T00:00:00.000Z" },
    EXPORT_LIMIT,
  );
  assert.equal(data.manifest.head_seq, 0);
  assert.equal(data.manifest.recomputed_head, AUDIT_GENESIS);
  assert.deepEqual(data.entries, []);
  assert.deepEqual(data.certificates, []);
});

test("the zip holds five files, each pretty-printed JSON", async () => {
  const data = await buildExport(
    fakeChain(exportTables),
    "clearing.sandbox",
    step,
    { chainId: "sandbox", exportedAt: "2026-11-14T00:00:00.000Z" },
    EXPORT_LIMIT,
  );
  const files = exportFiles(data);
  assert.deepEqual(
    files.map((file) => file.name),
    [
      EXPORT_FILES.manifest,
      EXPORT_FILES.entries,
      EXPORT_FILES.settlements,
      EXPORT_FILES.listings,
      EXPORT_FILES.certificates,
    ],
  );
  for (const file of files) {
    assert.ok(file.text.endsWith("\n"));
    JSON.parse(file.text);
  }
  assert.equal(exportName(data.manifest), "marginal-audit-clearing.sandbox-2.zip");
});

// ---------------------------------------------------------------------- reading an export back

async function anExport(tables: Tables = exportTables): Promise<AuditExport> {
  return buildExport(
    fakeChain(tables),
    "clearing.sandbox",
    step,
    { chainId: "sandbox", exportedAt: "2026-11-14T00:00:00.000Z" },
    EXPORT_LIMIT,
  );
}

test("an export round-trips through its files", async () => {
  const data = await anExport();
  const back = parseExport(filesOf(data));
  assert.deepEqual(back.manifest, data.manifest);
  assert.deepEqual(back.entries, data.entries);
  assert.equal(back.settlements.length, 1);
  assert.equal(back.listings.length, 1);
  assert.equal(back.certificates.length, 1);
});

test("a missing file in the zip says which one", async () => {
  const files = filesOf(await anExport());
  delete files[EXPORT_FILES.entries];
  assert.throws(() => parseExport(files), /the export has no audit\.json/);
});

test("a file that is not JSON says so", async () => {
  const files = filesOf(await anExport());
  files[EXPORT_FILES.manifest] = "not json";
  assert.throws(() => parseExport(files), /manifest\.json is not JSON/);
});

test("a manifest missing a field says which field and what it should be", async () => {
  const files = filesOf(await anExport());
  files[EXPORT_FILES.manifest] = JSON.stringify({ format: EXPORT_FORMAT });
  assert.throws(() => parseExport(files), /manifest\.json: chain_id is not a string/);
});

test("a manifest that is not an object at all is refused", async () => {
  const files = filesOf(await anExport());
  files[EXPORT_FILES.manifest] = "null";
  assert.throws(() => parseExport(files), /manifest\.json: format is not a string/);
});

test("an export from another format version is refused rather than misread", async () => {
  const data = await anExport();
  const files = filesOf({
    ...data,
    manifest: { ...data.manifest, format: "marginal-audit-export/99" },
  });
  assert.throws(() => parseExport(files), /this export is marginal-audit-export\/99/);
});

test("a file that should be a list but is not is refused", async () => {
  const files = filesOf(await anExport());
  files[EXPORT_FILES.listings] = "{}";
  assert.throws(() => parseExport(files), /listings\.json is not an array/);
});

test("something in audit.json that is not an entry is refused", async () => {
  const files = filesOf(await anExport());
  files[EXPORT_FILES.entries] = JSON.stringify([{ seq: 1, height: 2 }]);
  assert.throws(() => parseExport(files), /audit\.json: kind is not a string/);
});

// -------------------------------------------------------------------------------- comparison

test("identical lists have nothing to report", () => {
  assert.deepEqual(compareEntries([entry(1), entry(2)], [entry(1), entry(2)]), []);
});

test("an entry the chain does not have is named", () => {
  assert.deepEqual(compareEntries([entry(1), entry(7)], [entry(1)]), [
    { seq: 7, problem: "the chain has no entry at this sequence" },
  ]);
});

test("an entry the export does not have is named", () => {
  assert.deepEqual(compareEntries([entry(1)], [entry(1), entry(2)]), [
    { seq: 2, problem: "the export is missing this entry" },
  ]);
});

test("an edited entry names every field that differs", () => {
  const edited = entry(1, { payload_hash: "00".repeat(32), height: 9 });
  assert.deepEqual(compareEntries([edited], [entry(1)]), [
    { seq: 1, problem: "height, payload_hash differs from the chain" },
  ]);
});

test("problems come back in sequence order whatever order they were found in", () => {
  const problems = compareEntries([entry(3), entry(1)], [entry(1), entry(2)]);
  assert.deepEqual(
    problems.map((problem) => problem.seq),
    [2, 3],
  );
});

// ----------------------------------------------------------------------------- re-verification

test("an export of this chain re-verifies against it", async () => {
  const data = await anExport();
  const report = await reverifyExport(
    fakeChain(exportTables),
    "clearing.sandbox",
    step,
    data,
    AUDIT_PAGE,
  );
  assert.equal(report.holds, true);
  assert.equal(report.advanced, false);
  assert.deepEqual(report.mismatches, []);
  assert.equal(report.recomputed, data.manifest.head);
});

test("a chain that has moved on since the export says so without failing it", async () => {
  const data = await anExport();
  const later: Tables = { ...exportTables, audit: [entry(1), entry(2), entry(3)] };
  const report = await reverifyExport(
    fakeChain(later),
    "clearing.sandbox",
    step,
    data,
    AUDIT_PAGE,
  );
  assert.equal(report.advanced, true);
  assert.equal(report.holds, true);
  assert.equal(report.chainHead.seq, 3);
});

test("an export whose entry was edited fails, and the entry is named", async () => {
  const data = await anExport();
  const tampered: AuditExport = {
    ...data,
    entries: [entry(1, { payload_hash: "00".repeat(32) }), entry(2)],
  };
  const report = await reverifyExport(
    fakeChain(exportTables),
    "clearing.sandbox",
    step,
    tampered,
    AUDIT_PAGE,
  );
  assert.equal(report.holds, false);
  assert.deepEqual(report.mismatches, [
    { seq: 1, problem: "payload_hash differs from the chain" },
  ]);
});

test("an export whose manifest head was edited fails even with sound entries", async () => {
  const data = await anExport();
  const report = await reverifyExport(
    fakeChain(exportTables),
    "clearing.sandbox",
    step,
    { ...data, manifest: { ...data.manifest, head: "cd".repeat(32) } },
    AUDIT_PAGE,
  );
  assert.equal(report.holds, false);
  assert.deepEqual(report.mismatches, []);
});

test("an export whose recomputed head was edited fails too", async () => {
  const data = await anExport();
  const report = await reverifyExport(
    fakeChain(exportTables),
    "clearing.sandbox",
    step,
    { ...data, manifest: { ...data.manifest, recomputed_head: "cd".repeat(32) } },
    AUDIT_PAGE,
  );
  assert.equal(report.holds, false);
});

// ------------------------------------------------------------------------------- posted bodies

test("a body with no files is not an export", () => {
  assert.equal(filesIn(null), null);
  assert.equal(filesIn({}), null);
  assert.equal(filesIn({ files: "nope" }), null);
});

test("only the string members of a posted files map are kept", () => {
  assert.deepEqual(filesIn({ files: { "a.json": "{}", "b.json": 7 } }), { "a.json": "{}" });
});

// ------------------------------------------------------------------------------- the handler

test("the handler refuses an operation it does not have", async () => {
  const response = await handleRequest(get("?op=whatever"), deps());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: '"whatever" is not an operation' });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("the handler refuses a request that names no operation", async () => {
  const response = await handleRequest(get(""), deps());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: '"" is not an operation' });
});

test("the service's own health comes through when it is running", async () => {
  const fetchImpl = fakeFetch({ json: { ok: true, list_version: "abc", list_entries: 512 } });
  const response = await handleRequest(get("?op=service"), deps({ fetchImpl }));
  assert.deepEqual(await response.json(), {
    reachable: true,
    body: { ok: true, list_version: "abc", list_entries: 512 },
  });
  assert.deepEqual(fetchImpl.urls, ["http://127.0.0.1:8083/v1/health"]);
});

test("a service that is not running is reported, not thrown", async () => {
  const response = await handleRequest(
    get("?op=service"),
    deps({ fetchImpl: fakeFetch(new Error("fetch failed")) }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reachable: false, error: "fetch failed" });
});

test("a service that refuses passes its own message on", async () => {
  const response = await handleRequest(
    get("?op=screenings&subject=desk.testnet"),
    deps({ fetchImpl: fakeFetch({ ok: false, status: 403, json: { error: "not allow-listed" } }) }),
  );
  assert.deepEqual(await response.json(), { reachable: false, error: "not allow-listed" });
});

test("a service that refuses without a message is described by its status", async () => {
  const response = await handleRequest(
    get("?op=service"),
    deps({ fetchImpl: fakeFetch({ ok: false, status: 503, json: null }) }),
  );
  assert.deepEqual(await response.json(), { reachable: false, error: "the service answered 503" });
});

test("a screening lookup needs a subject", async () => {
  const response = await handleRequest(get("?op=screenings"), deps());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "name a subject to look up" });
});

test("a subject is escaped into the service's path", async () => {
  const fetchImpl = fakeFetch({ json: { screenings: [] } });
  await handleRequest(get("?op=screenings&subject=a%2Fb.testnet"), deps({ fetchImpl }));
  assert.deepEqual(fetchImpl.urls, ["http://127.0.0.1:8083/v1/screenings/a%2Fb.testnet"]);
});

test("a sealed delivery comes back decoded, never opened", async () => {
  const fetchImpl = fakeFetch({ bytes: new Uint8Array([0, 15, 255]) });
  let saw = "";
  const response = await handleRequest(
    get("?op=delivery&job=7"),
    deps({
      fetchImpl,
      decodeDelivery: (hex) => {
        saw = hex;
        return sealed;
      },
    }),
  );
  assert.deepEqual(await response.json(), { reachable: true, delivery: sealed });
  assert.equal(saw, "000fff");
  assert.deepEqual(fetchImpl.urls, ["http://127.0.0.1:8081/v1/blob/deliveries/7"]);
});

test("a delivery request without a job id is refused by name", async () => {
  const response = await handleRequest(get("?op=delivery"), deps());
  assert.deepEqual(await response.json(), { reachable: false, error: '"" is not a job id' });
});

test("a gateway that has no such delivery is reported by status", async () => {
  const response = await handleRequest(
    get("?op=delivery&job=7"),
    deps({ fetchImpl: fakeFetch({ ok: false, status: 404 }) }),
  );
  assert.deepEqual(await response.json(), { reachable: false, error: "the gateway answered 404" });
});

test("a gateway that is not running is reported, not thrown", async () => {
  const response = await handleRequest(
    get("?op=delivery&job=7"),
    deps({ fetchImpl: fakeFetch(new Error("connect ECONNREFUSED")) }),
  );
  assert.deepEqual(await response.json(), {
    reachable: false,
    error: "connect ECONNREFUSED",
  });
});

test("a bundle that does not decode is reported rather than shown as noise", async () => {
  const response = await handleRequest(
    get("?op=delivery&job=7"),
    deps({
      fetchImpl: fakeFetch({ bytes: new Uint8Array([1]) }),
      decodeDelivery: () => {
        throw new Error("E_DECODE");
      },
    }),
  );
  assert.deepEqual(await response.json(), { reachable: false, error: "E_DECODE" });
});

test("the export operation returns the whole bundle, stamped with the handler's clock", async () => {
  const response = await handleRequest(
    get("?op=export"),
    deps({ chain: fakeChain(exportTables) }),
  );
  const body = (await response.json()) as { export: AuditExport };
  assert.equal(body.export.manifest.exported_at, new Date(1_700_000_000_000).toISOString());
  assert.equal(body.export.manifest.chain_id, "testnet");
  assert.equal(body.export.entries.length, 2);
});

test("a chain that refuses an export is reported with its own code", async () => {
  const response = await handleRequest(
    get("?op=export"),
    deps({ chain: fakeChain({ fail: "audit_head" }) }),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "E_PAUSED" });
});

test("a posted export is re-verified against the chain", async () => {
  const data = await anExport();
  const response = await handleRequest(
    post({ files: filesOf(data) }),
    deps({ chain: fakeChain(exportTables) }),
  );
  const body = (await response.json()) as { report: { holds: boolean } };
  assert.equal(response.status, 200);
  assert.equal(body.report.holds, true);
});

test("a posted body that is not JSON carries no export", async () => {
  const response = await handleRequest(post("{"), deps());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "that request carries no export files" });
});

test("a posted zip that is not one of ours says what is wrong with it", async () => {
  const response = await handleRequest(post({ files: { "manifest.json": "{}" } }), deps());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "manifest.json: format is not a string",
  });
});
