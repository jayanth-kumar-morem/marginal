/**
 * The supervisor's signing service (SDD §3.1, E7.5: "the supervisor keeps the signing key, signs
 * over IPC").
 *
 * A worker handles one job's plaintext and is the part most likely to be pushed around by a
 * prompt-injection attempt or a parsing bug, so it never holds the room's signing key: it asks the
 * supervisor over IPC. The supervisor will not sign arbitrary bytes. It signs only a message whose
 * **domain prefix** is one of the room's own (`marginal/verdict/v1`, `marginal/forget/v1`, and the
 * rest), so a compromised worker cannot turn the room's key into a signature over something else —
 * a key request for another job, say, or a registration for another room's keys.
 */
import type { RoomKeys } from "./keys.js";

/**
 * The domains a worker may ask for. Registration is not here: the supervisor signs its own
 * proof of possession and never takes one from a worker (`registration.ts`).
 */
export const WORKER_DOMAINS = [
  "marginal/verdict/v1",
  "marginal/forget/v1",
  "marginal/provisioning/v1",
  "marginal/screening/v1",
  "marginal/keyreq/v1",
] as const;

export type WorkerDomain = (typeof WORKER_DOMAINS)[number];

/** What a worker sends over IPC. */
export interface SignRequest {
  readonly id: number;
  /** Hex of the bytes to sign, domain prefix and all. */
  readonly message: string;
}

/** What the supervisor sends back: a signature, or the reason it refused. */
export type SignReply =
  | { readonly id: number; readonly signature: string }
  | { readonly id: number; readonly error: string };

function startsWithDomain(message: Uint8Array): WorkerDomain | undefined {
  return WORKER_DOMAINS.find((domain) => {
    const prefix = Buffer.from(domain, "utf8");
    return message.length > prefix.length && Buffer.from(message.subarray(0, prefix.length)).equals(prefix);
  });
}

/** The most bytes a worker may ask to have signed: a verdict with two judge receipts is far less. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * Answers one signing request. Anything that is not a message of the room's own — a bad hex string,
 * an unknown domain, something too large — is refused, and the refusal says which.
 */
export function signForWorker(keys: RoomKeys, request: SignRequest): SignReply {
  if (!/^([0-9a-f]{2})+$/.test(request.message)) {
    return { id: request.id, error: "the message is not hex" };
  }
  const message = new Uint8Array(Buffer.from(request.message, "hex"));
  if (message.length > MAX_MESSAGE_BYTES) {
    return { id: request.id, error: "the message is too large" };
  }
  const domain = startsWithDomain(message);
  if (domain === undefined) {
    return { id: request.id, error: "the message is not one the room signs" };
  }
  return { id: request.id, signature: Buffer.from(keys.sign(message)).toString("hex") };
}
