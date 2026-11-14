/**
 * The room's keys (SDD §3.13 step 2): an ed25519 signing pair and an X25519 box pair, generated in
 * memory at every boot.
 *
 * Nothing persists them: `key_provider: "none"` means dstack gives the CVM a fresh disk each boot,
 * so **a restart always means new keys** and a fresh registration (§3.13 step 9). Node's own crypto
 * generates both, so no key material passes through a third-party library.
 */
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

/** A raw public key, 32 bytes for both curves. */
export type PublicKey = Uint8Array;

export interface RoomKeys {
  /** ed25519: what the room signs verdicts, reports and its own registration with. */
  readonly signPk: PublicKey;
  /** X25519: what buyers and sellers seal keys to. */
  readonly boxPk: PublicKey;
  /** Signs `message` with the signing key. The private key never leaves this object. */
  sign(message: Uint8Array): Uint8Array;
  /** The box private key, for sealed-box opening (E8.1). */
  boxPrivate(): KeyObject;
}

/** The last 32 bytes of a DER-encoded raw public key are the key itself. */
function raw(key: KeyObject): Uint8Array {
  const der = key.export({ type: "spki", format: "der" });
  return new Uint8Array(der.subarray(der.length - 32));
}

/** Generates a room's keys. Call once per boot. */
export function generateRoomKeys(): RoomKeys {
  const signing = generateKeyPairSync("ed25519");
  const box = generateKeyPairSync("x25519");
  const signPk = raw(signing.publicKey);
  const boxPk = raw(box.publicKey);
  return {
    signPk,
    boxPk,
    sign(message: Uint8Array): Uint8Array {
      return new Uint8Array(sign(null, message, signing.privateKey));
    },
    boxPrivate(): KeyObject {
      return box.privateKey;
    },
  };
}
