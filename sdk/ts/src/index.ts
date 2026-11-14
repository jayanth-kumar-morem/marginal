/**
 * `@marginal/sdk` (SDD §3.23; E12.1).
 *
 * The browser's half of the protocol: canonicalisation, the commitment, the seals and the delivery
 * keys. Pricing, Borsh and hashing of records are **not** here and never will be —
 * `@marginal/core-wasm` is the one implementation of those (CLAUDE.md), and a page reaches it
 * through a route handler because it loads its wasm with `node:fs`.
 */
export const PACKAGE = "@marginal/sdk";

export {
  AEAD_NONCE_BYTES,
  CANONICAL_EXTENSIONS,
  DEK_BYTES,
  DELIVERY_PAYLOAD_BYTES,
  MIN_CLAIM_WORDS,
  PUBLIC_KEY_BYTES,
  SALT_BYTES,
  aeadSeal,
  boxPublicKey,
  canonicalise,
  claims,
  dek,
  fromHex,
  getDeliveryKey,
  goodCommitment,
  hkdf,
  openDelivery,
  openGood,
  putDeliveryKey,
  salt,
  sealTo,
  sha256Hex,
  toHex,
  wrapKey,
  type Delivery,
  type DeliveryPayload,
  type IdbFactory,
} from "./crypto.js";
