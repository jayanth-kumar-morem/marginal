/**
 * Small shared pieces of a room's report: the hashes and encodings every job kind needs
 * (SDD §3.18, §3.4).
 *
 * They live here rather than in each job so that a provisioning, screening and appraisal report
 * cannot drift apart in how they name a certificate or commit to an input.
 */
import { createHash, randomBytes } from "node:crypto";

/** Borsh hex to the base64 a contract's `Base64VecU8` argument takes. */
export function base64(hexBytes: string): string {
  return Buffer.from(hexBytes, "hex").toString("base64");
}

/** `SHA-256` of some bytes, hex. */
export function hashOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Where a certificate is stored: `certs/{sha256(borsh(cert))}` (§3.18). */
export function certificateKey(hash: string): string {
  return `certs/${hash}`;
}

/**
 * A salted commitment to an input the certificate covers: `SHA-256(salt ‖ input)` with a fresh
 * salt, so the commitment says "this is what we held" without being a searchable hash of the
 * document itself (§3.18, `input_commitments`).
 */
export function commitmentOf(input: Uint8Array): { commitment: string; salt: Uint8Array } {
  const salt = new Uint8Array(randomBytes(32));
  return { commitment: hashOf(new Uint8Array([...salt, ...input])), salt };
}
