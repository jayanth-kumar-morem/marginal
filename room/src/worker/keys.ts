/**
 * Getting a listing's key, inside a worker (SDD §3.12.3; E8.2's recovery driven as a job).
 *
 * The round trip is: make a per-job app key, sign a `KeyRequest`, have the operator agent relay
 * `keypolicy.authorize` and then `keypolicy.derive`, and recover σ from the answer. Nothing here
 * trusts the agent: it pays the gas and carries the bytes, and every byte it carries is signed by
 * the room and bound to this chain, this KeyPolicy, this job and this path.
 *
 * The MPC network's public key is a **pin from the measured image**, not a value read over RPC. If
 * a host could choose it, it could answer with a key it made itself and the pairing check would
 * pass; because it cannot, a σ that passes proves KeyPolicy accepted this job's commitment (DR-5).
 */
import { call } from "@marginal/core-wasm";

import type { JobRecord, ListingRecord } from "../chain.js";
import type { RoomConfig } from "../config.js";
import {
  appId,
  appKey,
  listingKeys,
  parseBlsKey,
  recoverSigma,
  type AppKey,
  type CkdResponse,
  type ListingKeys,
} from "../crypto/ckd.js";
import type { WorkerChannel } from "./ipc.js";

const base64 = (hexBytes: string): string => Buffer.from(hexBytes, "hex").toString("base64");

export interface KeyContext {
  readonly channel: WorkerChannel;
  readonly config: RoomConfig;
  readonly roomKeyHex: string;
}

/** The one canonical spelling of a listing's key path (`marginal_core::keyrelease`). */
export function listingPath(listing: ListingRecord): string {
  return call("listing_path", {
    seller: listing.seller,
    listing_id: listing.id,
    version: listing.version,
  }) as string;
}

function asCkdResponse(value: unknown): CkdResponse {
  const reply = value as { big_y?: unknown; big_c?: unknown } | null;
  if (typeof reply?.big_y !== "string" || typeof reply.big_c !== "string") {
    throw new Error("ckd: the MPC answer has no big_y and big_c");
  }
  return { big_y: reply.big_y, big_c: reply.big_c };
}

function asTicketId(value: unknown): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  throw new Error("ckd: authorize did not return a ticket id");
}

/** The listing keys, and what they were derived for, so a certificate can name them. */
export interface DerivedKey extends ListingKeys {
  readonly path: string;
  readonly appId: Uint8Array;
}

/**
 * Derives the listing key for a job. `make` is the app-key source, overridable so a test can pin
 * the scalar; in a room it is a fresh random scalar for every job.
 */
export async function listingKeyFor(
  ctx: KeyContext,
  job: JobRecord,
  listing: ListingRecord,
  make: () => AppKey = appKey,
): Promise<DerivedKey> {
  const path = listingPath(listing);
  const key = make();
  const request = {
    chain_id: ctx.config.chainId,
    keypolicy: ctx.config.keypolicy,
    room_key: ctx.roomKeyHex,
    job_id: job.id,
    path,
    app_key: {
      pk1: Buffer.from(key.pk1).toString("hex"),
      pk2: Buffer.from(key.pk2).toString("hex"),
    },
    job_commitment: job.job_commitment,
    value_class: listing.value_class,
  };
  const signature = await ctx.channel.sign(call("key_request_signing_bytes", request) as string);
  const ticket = asTicketId(
    await ctx.channel.submit(
      "authorize",
      {
        request: base64(call("key_request_encode", request) as string),
        room_sig: base64(signature),
      },
      "keypolicy",
    ),
  );
  const response = asCkdResponse(
    await ctx.channel.submit("derive", { ticket_id: ticket }, "keypolicy"),
  );
  const id = appId(ctx.config.keypolicy, path);
  const sigma = recoverSigma(
    response,
    key.scalar,
    id,
    parseBlsKey(ctx.config.mpcPublicKey, "bls12381g2"),
  );
  return { ...listingKeys(sigma), path, appId: id };
}
