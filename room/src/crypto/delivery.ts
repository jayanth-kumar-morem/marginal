/**
 * Deterministic delivery sealing (SDD §3.19, DR-10, AC-31; E8.5).
 *
 * The delivery carries `DEK_g`, not a re-encryption of the good, and every value in it is
 * **derived** rather than drawn: the ephemeral key comes from `sk_L` and the job commitment, each
 * recipient's key and nonce from the ephemeral key and that recipient. So any room holding `K_L`
 * reproduces `D` byte for byte, which is what makes re-delivery possible without the first room
 * (AC-31) and what lets a verifier check `h_D` against the commitment the verdict made.
 *
 * Deriving the nonce is only safe because each `(eph_sk, recipient)` pair encrypts exactly one
 * message. That is why the nonce is a hash of both: two recipients get different nonces, and the
 * same recipient on another job gets a different ephemeral key.
 */
import { createHash } from "node:crypto";

import {
  AEAD_NONCE_BYTES,
  aeadOpen,
  aeadSeal,
  boxPublicKey,
  hkdf,
  sharedSecret,
  type BoxKeys,
} from "./sodium.js";

const EPH_INFO = Buffer.from("marginal/delivery/v1", "utf8");
const KEY_INFO = Buffer.from("marginal/delivery-key/v1", "utf8");

const sha256 = (bytes: Uint8Array): Uint8Array =>
  new Uint8Array(createHash("sha256").update(bytes).digest());

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** What a recipient gets: `DEK_g ‖ salt ‖ listing_version`, 68 bytes. */
export function deliveryPayload(
  dek: Uint8Array,
  salt: Uint8Array,
  listingVersion: number,
): Uint8Array {
  if (dek.length !== 32) throw new Error("delivery: DEK_g is 32 bytes");
  if (salt.length !== 32) throw new Error("delivery: the salt is 32 bytes");
  const version = new Uint8Array(4);
  new DataView(version.buffer).setUint32(0, listingVersion, true);
  return concat(dek, salt, version);
}

/**
 * The ephemeral key for a job: derived from the ikm, so it is the same every time it is derived.
 *
 * The ikm is `sk_L` under Ckd, which any room holding `K_L` can re-derive, and the room's own
 * `box_sk` under the RoomSealed fallback, which only that room has — so a RoomSealed delivery can
 * be reproduced only by the room that made it (§3.19, §3.12.7).
 */
export function ephemeralKey(secretKey: Uint8Array, jobCommitment: Uint8Array): BoxKeys {
  if (jobCommitment.length !== 32) throw new Error("delivery: a job commitment is 32 bytes");
  const ephSk = hkdf(secretKey, jobCommitment, EPH_INFO, 32);
  return { secretKey: ephSk, publicKey: boxPublicKey(ephSk) };
}

function recipientKey(
  ephSk: Uint8Array,
  ephPk: Uint8Array,
  recipient: Uint8Array,
): { key: Uint8Array; nonce: Uint8Array } {
  return {
    key: hkdf(
      sharedSecret(ephSk, recipient),
      new Uint8Array(0),
      concat(KEY_INFO, ephPk, recipient),
      32,
    ),
    nonce: sha256(concat(ephPk, recipient)).subarray(0, AEAD_NONCE_BYTES),
  };
}

/** A `DeliveryV1`, in the JSON shape `marginal-core`'s `delivery_encode` takes. */
export interface Delivery {
  readonly eph_pk: string;
  readonly entries: { readonly recipient: string; readonly ciphertext: string }[];
}

/**
 * Seals the key to each recipient in turn, under an ephemeral key that was already derived. The
 * order is the caller's and it is part of `h_D`, so the buyer comes first and the compliance copy,
 * when there is one, second (§3.19, AC-55).
 *
 * This is the whole of the sealing. It takes the ephemeral key rather than the ikm it came from,
 * because under the RoomSealed fallback the ikm is the room's `box_sk`, which a worker never holds:
 * the supervisor derives this job's key and hands it over (§3.12.7, `worker/ipc.ts`).
 */
export function sealDeliveryWith(
  eph: BoxKeys,
  jobCommitment: Uint8Array,
  payload: Uint8Array,
  recipients: readonly Uint8Array[],
): Delivery {
  if (recipients.length === 0) throw new Error("delivery: there is nobody to deliver to");
  return {
    eph_pk: Buffer.from(eph.publicKey).toString("hex"),
    entries: recipients.map((recipient) => {
      const { key, nonce } = recipientKey(eph.secretKey, eph.publicKey, recipient);
      return {
        recipient: Buffer.from(recipient).toString("hex"),
        ciphertext: Buffer.from(
          aeadSeal(key, nonce, payload, jobCommitment),
        ).toString("hex"),
      };
    }),
  };
}

/**
 * The Ckd path: the ephemeral key comes from `sk_L` and the job commitment, so any room holding
 * `K_L` reproduces the same delivery (AC-31).
 */
export function sealDelivery(
  listingSecretKey: Uint8Array,
  jobCommitment: Uint8Array,
  payload: Uint8Array,
  recipients: readonly Uint8Array[],
): Delivery {
  return sealDeliveryWith(
    ephemeralKey(listingSecretKey, jobCommitment),
    jobCommitment,
    payload,
    recipients,
  );
}

/**
 * Opens the entry addressed to `secretKey`'s public key. This is the buyer's side, and the SDK does
 * the same thing (E12.1); it lives here so the room can prove its own delivery opens.
 */
export function openDelivery(
  delivery: Delivery,
  secretKey: Uint8Array,
  jobCommitment: Uint8Array,
): Uint8Array {
  const recipient = Buffer.from(boxPublicKey(secretKey)).toString("hex");
  const entry = delivery.entries.find((candidate) => candidate.recipient === recipient);
  if (entry === undefined) throw new Error("delivery: there is no entry for this key");
  const ephPk = new Uint8Array(Buffer.from(delivery.eph_pk, "hex"));
  if (ephPk.length !== 32) throw new Error("delivery: the ephemeral key is not 32 bytes");
  const key = hkdf(
    sharedSecret(secretKey, ephPk),
    new Uint8Array(0),
    concat(KEY_INFO, ephPk, new Uint8Array(Buffer.from(recipient, "hex"))),
    32,
  );
  const nonce = sha256(concat(ephPk, new Uint8Array(Buffer.from(recipient, "hex")))).subarray(
    0,
    AEAD_NONCE_BYTES,
  );
  return aeadOpen(key, nonce, new Uint8Array(Buffer.from(entry.ciphertext, "hex")), jobCommitment);
}
