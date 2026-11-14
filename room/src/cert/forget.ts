/**
 * The forget certificate a room signs at the end of every job (SDD §3.18; E8.3, E8.5).
 *
 * It is the room's signed statement of what it held, under which attested identity, and what it
 * destroyed. It is **not** a claim of unlearning or cryptographic deletion (AC-29): the
 * `non_persistence_basis` bits say exactly why the room's memory of the job is gone — the worker
 * process exited, the CVM has no persistent storage and no swap, and TDX protects its memory — and
 * nothing more is claimed.
 *
 * Every field that identifies the room comes from KeyPolicy's own attestation record rather than
 * from the room's belief about itself, because that record is what a verifier will re-derive the
 * certificate against (§3.18 steps 3 to 5).
 */
import { call } from "@marginal/core-wasm";

import type { AttestationRecord, ClearingConfig, JobRecord } from "../chain.js";

/** `"marginal/forget\0"`, the certificate's 16-byte domain tag. */
export const FORGET_DOMAIN = Buffer.from("marginal/forget\0", "utf8").toString("hex");

/** `non_persistence_basis` bits (SDD §3.14.2, `marginal_core::certificate`). */
export const NP_PROCESS_EXIT = 1;
export const NP_NO_PERSISTENT_STORAGE = 2;
export const NP_NO_SWAP = 4;
export const NP_TEE_MEMORY = 8;

/** What the room held, in the certificate's own vocabulary. */
export type Scope = "BuyerContext" | "GoodPlaintext" | "Session";

/**
 * Which plaintext categories a job's room actually held (§3.18, SPEC §4.10.2).
 *
 * A provisioning job holds neither: it derives `K_L` and never sees the good or the context, so its
 * scope is empty and what it destroyed is named in `key_ids_destroyed`. An appraisal that rejected
 * its input, or stopped at the restricted list, never decrypted the good either.
 */
export function scopeFor(kind: string, outcome: string): Scope[] {
  if (kind === "Provisioning") return [];
  if (kind === "Screening") return ["GoodPlaintext"];
  if (outcome === "InputRejected") return [];
  if (outcome === "Restricted") return ["BuyerContext"];
  return ["BuyerContext", "GoodPlaintext"];
}

/**
 * Why the room's memory of the job is gone. A simulated attestation does not get the TDX bit: the
 * certificate has to be weaker when the room is, or it is a false statement.
 */
export function nonPersistenceBasis(attestationMode: string): number {
  const base = NP_PROCESS_EXIT | NP_NO_PERSISTENT_STORAGE | NP_NO_SWAP;
  return attestationMode === "Simulated" ? base : base | NP_TEE_MEMORY;
}

export interface CertificateInputs {
  readonly job: JobRecord;
  readonly attestation: AttestationRecord;
  readonly config: ClearingConfig;
  readonly clearing: string;
  readonly roomKeyHex: string;
  /** Salted commitments of the inputs the certificate covers. */
  readonly inputCommitments: readonly string[];
  /** Hashes of the public parts, or ids, of the keys destroyed. */
  readonly keyIdsDestroyed: readonly string[];
  /** Hashes of every object the room emitted. */
  readonly egress: readonly string[];
  readonly tStart: number;
  readonly tEnd: number;
  readonly outcome: string;
}

/** A certificate, its hash (the blob key and the anchor) and the room's signature over it. */
export interface SignedCertificate {
  readonly certificate: Record<string, unknown>;
  /** `SHA-256(borsh(certificate))`: `certs/{hash}` and the hash anchored on chain. */
  readonly hash: string;
  readonly signature: string;
  /** The Borsh bytes, for the blob store. */
  readonly bytes: string;
}

/** Builds the certificate. Every value is the one a verifier will look up for itself. */
export function buildCertificate(inputs: CertificateInputs): Record<string, unknown> {
  const { job, attestation, config } = inputs;
  return {
    domain: FORGET_DOMAIN,
    chain_id: config.chain_id,
    clearing: inputs.clearing,
    keypolicy: config.keypolicy,
    job_id: job.id,
    job_commitment: job.job_commitment,
    listing_id: job.listing_id,
    listing_version: job.listing_version,
    kind: job.kind,
    scope: scopeFor(job.kind, inputs.outcome),
    input_commitments: [...inputs.inputCommitments],
    room_key: inputs.roomKeyHex,
    measurement: attestation.measurement,
    ppid_hash: attestation.ppid_hash,
    attestation_ref: call("attestation_ref", {
      quote_hash: attestation.quote_hash,
      collateral_hash: attestation.collateral_hash,
    }) as string,
    attestation_mode: attestation.mode,
    policy_version: config.policy_version,
    key_ids_destroyed: [...inputs.keyIdsDestroyed],
    egress_summary: [...inputs.egress],
    t_start: inputs.tStart,
    t_end: inputs.tEnd,
    outcome: inputs.outcome,
    non_persistence_basis: nonPersistenceBasis(attestation.mode),
  };
}

/**
 * Builds and signs it. The signature is over `"marginal/forget/v1" ‖ borsh(certificate)`, and it is
 * made by the supervisor: a worker never holds the room's signing key, so `sign` is the IPC call
 * (`worker/ipc.ts`), which the supervisor answers only because `marginal/forget/v1` is one of the
 * room's own domains.
 */
export async function signCertificate(
  sign: (message: string) => Promise<string>,
  inputs: CertificateInputs,
): Promise<SignedCertificate> {
  const certificate = buildCertificate(inputs);
  const signature = await sign(call("certificate_signing_bytes", certificate) as string);
  return {
    certificate,
    hash: call("certificate_hash", certificate) as string,
    bytes: call("certificate_encode", certificate) as string,
    signature,
  };
}
