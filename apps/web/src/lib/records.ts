/**
 * The shapes the contracts' views actually return (`contracts/clearing/src/views.rs`,
 * `payout.rs`, `registry.rs`, `contracts/keypolicy/src/views.rs`).
 *
 * Only the fields a page reads are declared, as in `room/src/chain.ts`: a view that grows a field
 * does not break the app, and a page that needs a new field has to add it here on purpose. Amounts
 * are decimal strings and ids are numbers, exactly as the views send them.
 */

/** `clearing.config()`. */
export interface ClearingConfig {
  readonly version: number;
  readonly gov: string;
  readonly keypolicy: string;
  readonly chain_id: string;
  readonly tokens: readonly string[];
  readonly profile: { readonly profile: string; readonly gov_profile: string };
  readonly policy_version: number;
  readonly next_listing_id: number;
  readonly next_job_id: number;
  readonly next_snapshot_id: number;
  readonly fees: {
    readonly clearing_fee_buyer_bps: number;
    readonly clearing_fee_seller_bps: number;
  };
}

/** `clearing.get_listing(listing_id)`. */
export interface Listing {
  readonly id: number;
  readonly seller: string;
  readonly version: number;
  readonly status: string;
  readonly asset_class: string;
  /** `CategoryId` is a newtype over `u16`, so the view sends a number, not a name. */
  readonly category: number;
  readonly licence_class: number;
  readonly good_commitment: string;
  readonly ciphertext: { readonly uri_hash: string; readonly sha256: string; readonly size_class: number };
  readonly key_mode: string;
  readonly key_path_hash: string;
  readonly pk_l: string | null;
  readonly appraiser: string;
  readonly schema_hash: string;
  readonly rule: PricingRule;
  readonly l_floor_bps: number;
  readonly disclosure_policy: string;
  readonly external_judges_allowed: boolean;
  readonly token: string;
  readonly max_copies: number;
  readonly copies: number;
  readonly value_class: string;
  readonly challenge_window_blocks: number;
  readonly delivery_deadline_blocks: number;
  /** Null until `publish_listing` has run: a draft has no publish height. */
  readonly publish_height: number | null;
}

/** Only R1 is enabled in M1; the others exist in the format and are refused on chain (§3.7). */
export type PricingRule =
  | { readonly Posted: { readonly ask: string } }
  | Record<string, Record<string, unknown>>;

/** `clearing.get_leakage(listing_id)` — the meter on a listing (§3.8). */
export interface Leakage {
  readonly budget_mbits: number;
  readonly reserved_mbits: number;
  readonly spent_mbits: number;
  readonly remaining_mbits: number;
  readonly price_per_bit: string;
}

/** `clearing.get_job(job_id)`. */
export interface Job {
  readonly id: number;
  readonly kind: string;
  readonly listing_id: number;
  readonly listing_version: number;
  readonly state: string;
  readonly token: string;
  readonly job_commitment: string;
  readonly buyer: string | null;
  readonly privacy: string;
  readonly mode: string;
  readonly snapshot_id: number | null;
  readonly max_debit_mbits: number;
  readonly delivery_pk: string;
  readonly compliance_pk: string | null;
  readonly context_auth_pk: string;
  readonly buckets: {
    readonly budget: string;
    readonly compute: string;
    readonly comp_reserved: string;
    readonly fee_reserved: string;
    readonly storage: string;
    readonly held: string;
    readonly refund: string;
  };
  readonly assigned: readonly string[];
  readonly requested_height: number;
  readonly deadline_height: number;
  readonly delivery_deadline_height: number | null;
}

/** `clearing.get_settlement(job_id)`. */
export interface Settlement {
  readonly job_id: number;
  readonly outcome: string;
  readonly price: string;
  readonly refund: string;
  readonly held: string;
  readonly held_until: number | null;
  readonly fees: Record<string, string>;
  readonly leakage_debit_mbits: number;
  readonly leakage_comp: string;
  readonly components_commitment: string | null;
  readonly delivery_commitment: string | null;
  readonly delivery_receipt: string | null;
  readonly cert_hashes: readonly string[];
  readonly simulated_flags: number;
  readonly audit_seq: number;
  readonly payout: string;
}

/** `clearing.get_room(room_key)`. */
export interface Room {
  readonly room_key: string;
  readonly box_pk: string;
  readonly ppid_hash: string;
  readonly measurement_set: string;
  readonly class: string;
  readonly mode: string;
  readonly registered_height: number;
  readonly expires_at: number;
  readonly current: boolean;
}

/** `keypolicy.get_attestation(room_key)`. */
export interface Attestation {
  readonly room_key: string;
  readonly box_pk: string;
  readonly class: string;
  readonly ppid_hash: string;
  readonly measurement: {
    readonly mrtd: string;
    readonly rtmr0: string;
    readonly rtmr1: string;
    readonly rtmr2: string;
    readonly compose_hash: string;
    readonly key_provider_digest: string;
    readonly gpu_policy_hash: string | null;
  };
  readonly measurement_hash: string;
  readonly tcb_status: string;
  readonly tee_tcb_svn: string;
  readonly collateral_hash: string;
  readonly quote_hash: string;
  readonly mode: string;
  readonly verified_height: number;
  readonly expires_at: number;
}

/** One entry of the hash-chained audit log (`clearing.get_audit`). */
export interface AuditEntry {
  readonly seq: number;
  readonly height: number;
  readonly kind: string;
  readonly subject_id: number;
  readonly payload_hash: string;
}

/** R1's ask, or null for a rule M1 does not price. */
export function postedAsk(rule: PricingRule): string | null {
  const posted = (rule as { Posted?: { ask?: unknown } }).Posted;
  return typeof posted?.ask === "string" ? posted.ask : null;
}

/** The rule's name, for a page that has to show one either way. */
export function ruleName(rule: PricingRule): string {
  return Object.keys(rule)[0] ?? "Unknown";
}
