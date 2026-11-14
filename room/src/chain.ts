/**
 * Reading the chain from inside the room (SDD §3.22: "read state from contract views").
 *
 * Views only: a room never signs a transaction itself, it hands signed messages to the operator
 * agent (E11.3, `operator.ts`). This is plain JSON-RPC over `fetch` rather than `near-api-js`,
 * because a view call is one request and the room's dependencies are part of its measurement.
 */

/** A NEAR JSON-RPC `call_function` reply, as far as we read it. */
interface ViewResult {
  readonly result?: { readonly result?: number[] };
  readonly error?: { readonly message?: string; readonly data?: unknown };
}

export interface ChainPort {
  /** Calls a view method and parses its JSON answer. */
  view<T>(contract: string, method: string, args: unknown): Promise<T>;
}

/** One job the room has to answer, as `get_jobs_for_room` reports it (SDD issue 5). */
export interface RoomJob {
  readonly id: number;
  readonly kind: string;
  readonly listing_id: number;
  readonly listing_version: number;
  readonly state: string;
  readonly job_commitment: string;
  readonly deadline_height: number;
}

export type Fetch = typeof globalThis.fetch;

export function chainClient(rpcUrl: string, fetchImpl: Fetch = globalThis.fetch): ChainPort {
  return {
    async view<T>(contract: string, method: string, args: unknown): Promise<T> {
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "room",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: contract,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
          },
        }),
      });
      if (!response.ok) throw new Error(`rpc: HTTP ${response.status}`);
      const body = (await response.json()) as ViewResult;
      if (body.error) throw new Error(`rpc: ${body.error.message ?? "call failed"}`);
      const bytes = body.result?.result;
      if (bytes === undefined) throw new Error("rpc: no result");
      return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
    },
  };
}

/** The jobs this room still has to answer. Clearing drops one as soon as it is answered. */
export async function jobsForRoom(
  chain: ChainPort,
  clearing: string,
  roomKeyHex: string,
): Promise<readonly RoomJob[]> {
  return chain.view<RoomJob[]>(clearing, "get_jobs_for_room", { room_key: roomKeyHex });
}

/** Whether the registry still has this room, and until when (SDD §3.11). */
export interface RoomRecord {
  readonly expires_at: number;
  readonly current: boolean;
}

export async function roomRecord(
  chain: ChainPort,
  clearing: string,
  roomKeyHex: string,
): Promise<RoomRecord | null> {
  return chain.view<RoomRecord | null>(clearing, "get_room", { room_key: roomKeyHex });
}

/** A job, as `get_job` reports it. Only the fields the room acts on. */
export interface JobRecord {
  readonly id: number;
  readonly kind: string;
  readonly listing_id: number;
  readonly listing_version: number;
  readonly state: string;
  readonly job_commitment: string;
  readonly privacy: string;
  readonly mode: string;
  readonly snapshot_id: number | null;
  readonly max_debit_mbits: number;
  /** The buckets the deposit was split into; `budget` is what the commitment covers (§3.9.1). */
  readonly buckets: { readonly budget: string; readonly compute: string };
  /** Where a delivery is sealed to (SDD §3.19). */
  readonly delivery_pk: string;
  readonly compliance_pk: string | null;
  readonly context_auth_pk: string;
  readonly deadline_height: number;
}

export async function jobRecord(
  chain: ChainPort,
  clearing: string,
  jobId: number,
): Promise<JobRecord | null> {
  return chain.view<JobRecord | null>(clearing, "get_job", { job_id: String(jobId) });
}

/**
 * The room's own attestation, as KeyPolicy recorded it. A forget certificate names the attestation
 * it was issued under, and only KeyPolicy knows what that record says (SDD §3.18).
 */
export interface AttestationRecord {
  readonly measurement: {
    readonly mrtd: string;
    readonly rtmr0: string;
    readonly rtmr1: string;
    readonly rtmr2: string;
    readonly compose_hash: string;
    readonly key_provider_digest: string;
    readonly gpu_policy_hash: string | null;
  };
  readonly ppid_hash: string;
  readonly quote_hash: string;
  readonly collateral_hash: string;
  readonly mode: string;
  readonly expires_at: number;
}

export async function attestationRecord(
  chain: ChainPort,
  keypolicy: string,
  roomKeyHex: string,
): Promise<AttestationRecord | null> {
  return chain.view<AttestationRecord | null>(keypolicy, "get_attestation", {
    room_key: roomKeyHex,
  });
}

/** The part of clearing's configuration a certificate has to quote (SDD §3.18 step 5). */
export interface ClearingConfig {
  readonly chain_id: string;
  readonly keypolicy: string;
  readonly policy_version: number;
}

export async function clearingConfig(
  chain: ChainPort,
  clearing: string,
): Promise<ClearingConfig> {
  return chain.view<ClearingConfig>(clearing, "config", {});
}

/** A listing, as `get_listing` reports it. Only the fields a room acts on. */
export interface ListingRecord {
  readonly id: number;
  readonly seller: string;
  readonly version: number;
  readonly status: string;
  readonly good_commitment: string;
  readonly ciphertext: { readonly uri_hash: string; readonly sha256: string; readonly size_class: number };
  readonly key_mode: string;
  readonly pk_l: string | null;
  readonly appraiser: string;
  readonly value_class: string;
  /** The judgement floor: a public input of a Sealed proof, and what a judge can cost (§3.7). */
  readonly l_floor_bps: number;
  /** Everything below is part of `job_commitment`, which the room recomputes (SDD §3.12.3). */
  readonly rule: unknown;
  readonly disclosure_policy: unknown;
  /** Whether this seller lets an external judge see the good (§3.16). */
  readonly external_judges_allowed: boolean;
}

/** A snapshot of a buyer's context, as `get_snapshot` reports it. */
export interface SnapshotRecord {
  readonly id: number;
  readonly owner: string;
  readonly content_hash: string;
  readonly blob: { readonly uri_hash: string; readonly sha256: string; readonly size_class: number };
}

export async function snapshotRecord(
  chain: ChainPort,
  clearing: string,
  snapshotId: number,
): Promise<SnapshotRecord | null> {
  return chain.view<SnapshotRecord | null>(clearing, "get_snapshot", {
    snapshot_id: String(snapshotId),
  });
}

export async function listingRecord(
  chain: ChainPort,
  clearing: string,
  listingId: number,
): Promise<ListingRecord | null> {
  return chain.view<ListingRecord | null>(clearing, "get_listing", {
    listing_id: String(listingId),
  });
}
