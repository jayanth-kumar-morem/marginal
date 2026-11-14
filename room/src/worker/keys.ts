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
import { sealDelivery, sealDeliveryWith, type Delivery } from "../crypto/delivery.js";
import { memzero, unseal } from "../crypto/sodium.js";
import { hashOf } from "./report.js";
import type { WorkerChannel } from "./ipc.js";

const base64 = (hexBytes: string): string => Buffer.from(hexBytes, "hex").toString("base64");

const bytesOf = (hexBytes: string): Uint8Array => new Uint8Array(Buffer.from(hexBytes, "hex"));

export interface KeyContext {
  readonly channel: WorkerChannel;
  readonly config: RoomConfig;
  readonly roomKeyHex: string;
  /** Where §3.12.7's disclosures go; the supervisor's stderr unless a caller says otherwise. */
  readonly log?: (line: string) => void;
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

/** The key-release modes a room implements (`marginal_core::KeyReleaseMode`, §3.12.1). */
export type KeyMode = "Ckd" | "RoomSealed";

/**
 * A listing's key-release mode.
 *
 * Anything that is neither mode is refused by name rather than quietly treated as one of them: a
 * listing this room cannot open the right way is a listing it must not open at all.
 */
export function keyMode(listing: ListingRecord): KeyMode {
  if (listing.key_mode === "Ckd" || listing.key_mode === "RoomSealed") return listing.key_mode;
  throw new Error(
    `listing ${listing.id}: this room does not implement key release mode ${listing.key_mode}`,
  );
}

/**
 * What using the RoomSealed fallback costs, disclosed every time it is used (§3.12.7).
 *
 * It says what is weaker and nothing else: no claim is made about deletion or unlearning (AC-29),
 * and the three limitations are the ones §3.12.7 lists.
 */
export const ROOM_SEALED_DISCLOSURE =
  "RoomSealed key release (SDD §3.12.7, a fallback only): DEK_g is sealed to this room's box_pk, " +
  "so a room restart loses box_sk and the listing has to be re-sealed, only this room can " +
  "re-deliver, and there is no job-commitment proof, so DR-5's protection is absent.";

/** Where a worker's disclosures go when its caller named nowhere else: the supervisor's stderr. */
export function workerLog(line: string): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Opening the seller's wrap with a derived listing key, inside the worker (Ckd). The key is `sk_L`,
 * which the job derived itself, so no IPC is needed.
 */
export function localUnwrap(keys: ListingKeys): (sealedHex: string) => Promise<Uint8Array> {
  return async (sealedHex: string): Promise<Uint8Array> => unseal(bytesOf(sealedHex), keys);
}

/**
 * What a job needs a key for, and nothing more: opening the seller's wrap, sealing a delivery, and
 * saying in the certificate which keys it held and destroyed.
 *
 * The two modes differ only in where the key material comes from, so every job kind goes through
 * this and no pipeline reads `key_mode` for itself. `mode` is here because one thing downstream
 * does depend on it: an appraisal has to ack a RoomSealed job to clearing (`appraisal.ts`).
 */
export interface JobKey {
  readonly mode: KeyMode;
  /** Opens a sealed box addressed to this job's key. */
  readonly unwrap: (sealedHex: string) => Promise<Uint8Array>;
  /** Seals this job's delivery (§3.19). */
  readonly seal: (
    jobCommitment: Uint8Array,
    payload: Uint8Array,
    recipients: readonly Uint8Array[],
  ) => Promise<Delivery>;
  /** The public parts of the keys the job held and destroyed, for the forget certificate (§3.18). */
  readonly keyIds: readonly string[];
  /** Wipes what the job held. */
  readonly destroy: () => void;
}

/**
 * The one place key acquisition branches on the listing's mode (§3.14.2 step 2).
 *
 * Under `Ckd` it is the round trip above: a per-job app key, a signed `KeyRequest`, `authorize`,
 * `derive`, and σ. Under `RoomSealed` there is no listing key and no call to KeyPolicy at all — the
 * seller sealed `DEK_g` to this room's `box_pk`, so the wrap is opened through supervisor IPC and
 * the delivery key is derived by the supervisor from `box_sk`, which never enters a worker.
 */
export async function jobKeyFor(
  ctx: KeyContext,
  job: JobRecord,
  listing: ListingRecord,
  make: () => AppKey = appKey,
): Promise<JobKey> {
  const mode = keyMode(listing);
  if (mode === "RoomSealed") {
    const channel = ctx.channel;
    (ctx.log ?? workerLog)(`listing ${listing.id} v${listing.version}: ${ROOM_SEALED_DISCLOSURE}`);
    return {
      mode,
      unwrap: (sealedHex: string): Promise<Uint8Array> => channel.unseal(sealedHex).then(bytesOf),
      seal: (
        jobCommitment: Uint8Array,
        payload: Uint8Array,
        recipients: readonly Uint8Array[],
      ): Promise<Delivery> =>
        channel
          .deliveryKey(Buffer.from(jobCommitment).toString("hex"))
          .then((eph) => sealDeliveryWith(eph, jobCommitment, payload, recipients)),
      // Nothing: the wrap was opened with `box_sk`, which belongs to the room rather than to the
      // job and outlives it, and the delivery key was derived from it by the supervisor. A
      // certificate naming either as destroyed would be a false statement (§3.12.7, AC-29).
      keyIds: [],
      destroy: (): void => undefined,
    };
  }
  const derived = await listingKeyFor(ctx, job, listing, make);
  return {
    mode,
    unwrap: localUnwrap(derived),
    seal: (
      jobCommitment: Uint8Array,
      payload: Uint8Array,
      recipients: readonly Uint8Array[],
    ): Promise<Delivery> =>
      Promise.resolve(sealDelivery(derived.secretKey, jobCommitment, payload, recipients)),
    keyIds: [hashOf(derived.publicKey)],
    destroy: (): void => {
      memzero(derived.root);
      memzero(derived.secretKey);
    },
  };
}
