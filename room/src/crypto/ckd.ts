/**
 * CKD key recovery (SDD §3.12.3 step 4; E8.2): turning the MPC network's answer into the listing
 * key, and refusing to use it unless it is provably the right one.
 *
 * The room makes a per-job BLS12-381 scalar `a` and sends `A = (a·G1, a·G2)` with its key request.
 * The network answers `(big_y, big_c)`, from which the room recovers `σ = big_c − a·big_y` and
 * checks `e(H(mpc_pk ‖ app_id), G2) = e(σ, G2)`. Two things make that check worth doing:
 *
 * - it proves the answer really is the key for `app_id`, which the room computes itself and never
 *   takes from the response; and
 * - because `app_id` binds KeyPolicy's account and the path, **receiving a valid σ proves KeyPolicy,
 *   and therefore clearing, accepted this job's commitment** (DR-5). Only then may the room trust
 *   job parameters it read over RPC.
 *
 * The constants are not ours to choose: the DST, the app-id prefix and the HKDF salt are near/mpc's
 * (`crates/ckd-example-cli/src/ckd.rs` at release 3.19.0). The HKDF `info` is the application's, and
 * near/mpc's own note says to use a distinct one per purpose, so Marginal's keys are derived with
 * Marginal's own info strings and are unrelated to any other key from the same CKD output.
 *
 * The scalar `a` is held as a bigint, because that is what the curve library takes, so it cannot be
 * wiped like the byte buffers in `sodium.ts`. It is per job and guards one key release only.
 */
import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { base58 } from "@scure/base";

import { boxPublicKey, hkdf, randomBytes } from "./sodium.js";

/** near/mpc's hash-to-curve domain for CKD. */
const CKD_DST = "NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_";
/** near/mpc's app-id derivation prefix. The app is the calling contract, not the signer. */
const APP_ID_PREFIX = "near-mpc v0.1.0 app_id derivation:";
/** near/mpc's HKDF salt over a CKD output. */
const CKD_HKDF_SALT = "near-mpc-ckd-hkdf-v1";
/** The `info` `ckd-example-cli` uses, kept so this implementation can be checked against theirs. */
export const NEAR_STRONG_KEY_INFO = "near-mpc-ckd-strong-key-v1";
/** Marginal's own purposes, one `info` each. */
const LISTING_ROOT_INFO = "marginal/ckd-listing-key/v1";
const LISTING_X25519_INFO = "marginal/ckd-listing-x25519/v1";

const G1_BYTES = 48;
const G2_BYTES = 96;

const text = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, "utf8"));

/**
 * `SHA3-256("near-mpc v0.1.0 app_id derivation:" ‖ keypolicy ‖ "," ‖ path)`. The room computes this
 * itself; an `app_id` taken from the response would prove nothing.
 */
export function appId(keypolicy: string, path: string): Uint8Array {
  return sha3_256(text(`${APP_ID_PREFIX}${keypolicy},${path}`));
}

/** One job's app key: the scalar stays in the room, the two points go to KeyPolicy. */
export interface AppKey {
  readonly scalar: bigint;
  /** `a·G1`, compressed (48 bytes). */
  readonly pk1: Uint8Array;
  /** `a·G2`, compressed (96 bytes). */
  readonly pk2: Uint8Array;
}

const ORDER = bls.G1.Point.Fn.ORDER;

function beToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
}

/** The app key for a scalar, as the publicly verifiable form `AppPublicKeyPV` needs it. */
export function appKeyFromScalar(scalar: bigint): AppKey {
  if (scalar <= 0n || scalar >= ORDER) throw new Error("ckd: the scalar is out of range");
  return {
    scalar,
    pk1: bls.G1.Point.BASE.multiply(scalar).toBytes(),
    pk2: bls.G2.Point.BASE.multiply(scalar).toBytes(),
  };
}

/**
 * A fresh app key for one job. The scalar is drawn by rejection rather than reduced, because the
 * curve order is not a power of two and a reduction would bias it.
 */
export function appKey(random: (length: number) => Uint8Array = randomBytes): AppKey {
  for (;;) {
    const candidate = beToBigInt(random(32));
    if (candidate > 0n && candidate < ORDER) return appKeyFromScalar(candidate);
  }
}

/**
 * Reads a `bls12381g1:`/`bls12381g2:` key the way the MPC contract writes one: the prefix, then
 * base58 of the compressed point.
 */
export function parseBlsKey(value: string, curve: "bls12381g1" | "bls12381g2"): Uint8Array {
  const separator = value.indexOf(":");
  if (separator < 0) throw new Error("ckd: a BLS key needs a curve prefix");
  if (value.slice(0, separator) !== curve) throw new Error(`ckd: not a ${curve} key`);
  let bytes: Uint8Array;
  try {
    bytes = base58.decode(value.slice(separator + 1));
  } catch {
    throw new Error("ckd: the key is not base58");
  }
  const expected = curve === "bls12381g1" ? G1_BYTES : G2_BYTES;
  if (bytes.length !== expected) {
    throw new Error(`ckd: a ${curve} key is ${expected} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** What the MPC network answers, as KeyPolicy passes it back. */
export interface CkdResponse {
  readonly big_y: string;
  readonly big_c: string;
}

function g1(bytes: Uint8Array, what: string): ReturnType<typeof bls.G1.Point.fromBytes> {
  let point;
  try {
    point = bls.G1.Point.fromBytes(bytes);
  } catch {
    throw new Error(`ckd: ${what} is not a G1 point`);
  }
  if (point.is0() || !point.isTorsionFree()) {
    throw new Error(`ckd: ${what} is not in the prime-order subgroup`);
  }
  return point;
}

/**
 * Recovers σ and checks the pairing. Returns the 48 compressed bytes, which are the input keying
 * material for every key derived from this release.
 */
export function recoverSigma(
  response: CkdResponse,
  scalar: bigint,
  appIdBytes: Uint8Array,
  mpcPublicKey: Uint8Array,
): Uint8Array {
  if (appIdBytes.length !== 32) throw new Error("ckd: an app id is 32 bytes");
  if (scalar <= 0n || scalar >= ORDER) throw new Error("ckd: the scalar is out of range");
  const bigY = g1(parseBlsKey(response.big_y, "bls12381g1"), "big_y");
  const bigC = g1(parseBlsKey(response.big_c, "bls12381g1"), "big_c");
  let mpc;
  try {
    mpc = bls.G2.Point.fromBytes(mpcPublicKey);
  } catch {
    throw new Error("ckd: the MPC key is not a G2 point");
  }
  if (mpc.is0() || !mpc.isTorsionFree()) {
    throw new Error("ckd: the MPC key is not in the prime-order subgroup");
  }

  const sigma = bigC.subtract(bigY.multiply(scalar));
  if (sigma.is0() || !sigma.isTorsionFree()) {
    throw new Error("ckd: the recovered key is not a valid point");
  }
  const base = bls.G1.hashToCurve(
    new Uint8Array([...mpc.toBytes(), ...appIdBytes]),
    { DST: CKD_DST },
  );
  if (!bls.fields.Fp12.eql(bls.pairing(base, mpc), bls.pairing(sigma, bls.G2.Point.BASE))) {
    throw new Error("ckd: the derived key is not the key for this app id");
  }
  return sigma.toBytes();
}

/** HKDF-SHA256 over σ with near/mpc's salt and a caller-chosen purpose. */
export function strongKey(sigma: Uint8Array, info: string): Uint8Array {
  if (sigma.length !== G1_BYTES) throw new Error("ckd: sigma is 48 bytes");
  return hkdf(sigma, text(CKD_HKDF_SALT), text(info), 32);
}

/** A listing's keys: `K_L`, and the X25519 pair sellers wrap `DEK_g` to (§3.12.3, §3.19). */
export interface ListingKeys {
  /** `K_L`: the listing's root key. */
  readonly root: Uint8Array;
  readonly secretKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

export function listingKeys(sigma: Uint8Array): ListingKeys {
  const root = strongKey(sigma, LISTING_ROOT_INFO);
  const secretKey = hkdf(root, new Uint8Array(0), text(LISTING_X25519_INFO), 32);
  return { root, secretKey, publicKey: boxPublicKey(secretKey) };
}
