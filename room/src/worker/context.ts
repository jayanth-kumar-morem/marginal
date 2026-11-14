/**
 * What every job needs before it starts: the records it is about, and the plaintext it is allowed
 * to read (SDD §3.14.2 steps 1 and 5).
 *
 * Two rules hold for all three job kinds. The room answers the job it was **given** — clearing
 * refuses a report whose job is not `Assigned` to this room, so a job that is not is refused here
 * before any key is asked for. And nothing is trusted because it came back from an RPC: the good is
 * accepted only when it hashes to the commitment the listing published.
 */
import { createHash } from "node:crypto";

import type {
  AttestationRecord,
  ChainPort,
  ClearingConfig,
  JobRecord,
  ListingRecord,
} from "../chain.js";
import { attestationRecord, clearingConfig, jobRecord, listingRecord } from "../chain.js";
import type { RoomConfig } from "../config.js";
import { unseal } from "../crypto/sodium.js";
import type { AppKey, ListingKeys } from "../crypto/ckd.js";
import type { WorkerChannel } from "./ipc.js";

export interface WorkerContext {
  readonly channel: WorkerChannel;
  readonly chain: ChainPort;
  readonly config: RoomConfig;
  readonly roomKeyHex: string;
  /** Seconds, overridable so a certificate's window is a fixed number in a test. */
  readonly now: () => number;
  /**
   * Where a job's app key comes from. A room draws a fresh random scalar for every job; a test
   * pins it, so it can play the MPC network's side of the exchange.
   */
  readonly appKeySource?: () => AppKey;
}

/** Everything a job is about, read once and checked. */
export interface JobData {
  readonly job: JobRecord;
  readonly listing: ListingRecord;
  readonly attestation: AttestationRecord;
  readonly clearing: ClearingConfig;
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Where a listing version's objects live. The SDK writes to the same keys (E12.1). */
export function goodKey(listing: ListingRecord): string {
  return `listings/${listing.id}/v${listing.version}/good`;
}

export function wrappedKeyKey(listing: ListingRecord): string {
  return `listings/${listing.id}/v${listing.version}/dek`;
}

/** Reads the job, its listing and this room's attestation, and refuses anything inconsistent. */
export async function loadJob(ctx: WorkerContext, jobId: number): Promise<JobData> {
  const [job, clearing, attestation] = await Promise.all([
    jobRecord(ctx.chain, ctx.config.clearing, jobId),
    clearingConfig(ctx.chain, ctx.config.clearing),
    attestationRecord(ctx.chain, ctx.config.keypolicy, ctx.roomKeyHex),
  ]);
  if (job === null) throw new Error(`job ${jobId}: clearing has no such job`);
  if (attestation === null) throw new Error(`job ${jobId}: this room has no attestation`);
  if (clearing.chain_id !== ctx.config.chainId) {
    throw new Error(`job ${jobId}: clearing is on ${clearing.chain_id}, not ${ctx.config.chainId}`);
  }
  if (clearing.keypolicy !== ctx.config.keypolicy) {
    throw new Error(`job ${jobId}: clearing names another KeyPolicy`);
  }
  const listing = await listingRecord(ctx.chain, ctx.config.clearing, job.listing_id);
  if (listing === null) throw new Error(`job ${jobId}: listing ${job.listing_id} is gone`);
  if (listing.version !== job.listing_version) {
    throw new Error(`job ${jobId}: the listing has moved to version ${listing.version}`);
  }
  return { job, listing, attestation, clearing };
}

/** The good, and the salt its commitment was made with. */
export interface Good {
  readonly plaintext: Uint8Array;
  readonly salt: Uint8Array;
  readonly dek: Uint8Array;
}

/**
 * Fetches and opens the good.
 *
 * The seller's wrap is a sealed box to `pk_L` holding `DEK_g ‖ salt`; the ciphertext object is the
 * 24-byte nonce followed by XChaCha20-Poly1305 of the good (§3.19's layout for the delivery, used
 * the same way for the listing). Two checks have to pass before the plaintext counts: the
 * ciphertext's SHA-256 is the one the listing published, and `SHA-256(salt ‖ good)` is the
 * listing's `good_commitment` — so the room can tell it appraised what was sold.
 */
export async function openGood(
  ctx: WorkerContext,
  listing: ListingRecord,
  keys: ListingKeys,
  aeadOpen: (key: Uint8Array, nonce: Uint8Array, ct: Uint8Array, aad: Uint8Array) => Uint8Array,
): Promise<Good> {
  const wrapped = Buffer.from(await ctx.channel.getBlob(wrappedKeyKey(listing)), "hex");
  const opened = unseal(new Uint8Array(wrapped), {
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  });
  if (opened.length !== 64) throw new Error("the wrapped key is not DEK_g and a salt");
  const dek = opened.subarray(0, 32);
  const salt = opened.subarray(32);

  const object = new Uint8Array(Buffer.from(await ctx.channel.getBlob(goodKey(listing)), "hex"));
  if (sha256(object) !== listing.ciphertext.sha256) {
    throw new Error("the ciphertext is not the one the listing published");
  }
  if (object.length <= 24) throw new Error("the ciphertext is too short to hold a nonce");
  const plaintext = aeadOpen(dek, object.subarray(0, 24), object.subarray(24), new Uint8Array(0));
  if (sha256(new Uint8Array([...salt, ...plaintext])) !== listing.good_commitment) {
    throw new Error("the good does not match its commitment");
  }
  return { plaintext, salt, dek };
}
