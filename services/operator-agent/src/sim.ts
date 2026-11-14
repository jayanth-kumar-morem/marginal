/**
 * The sandbox's simulated registration (SDD §6.1, E14.4): what the agent sends when a room has no
 * TDX machine to get a quote from.
 *
 * A simulated room claims nothing. It cannot: in a real run its measurement comes out of its own
 * quote's event log, and there is no quote here. So the **host** claims it, from the agent's own
 * environment, which is honest about what a `Simulated` record is worth — nothing outside a sandbox.
 * `keypolicy-sim` is the only build with a method that accepts one, and the registry record it
 * writes says `Simulated`.
 *
 * Because the claim is the host's, a missing or malformed variable is the host's mistake and is
 * refused by name. It is never defaulted: a zero measurement would be a record that looks real and
 * pins nothing, and it would sit on chain next to the ones that do.
 */
import { call } from "@marginal/core-wasm";
import { HttpError } from "@marginal/service-common";

const MEASUREMENT_VAR = "MARGINAL_SIM_MEASUREMENT";
const PPID_VAR = "MARGINAL_SIM_PPID";

/** `marginal_core::attest::PPID_LEN` is 16 bytes. */
const PPID_HEX = 32;

/** Every field of `marginal_core::certificate::Measurement`, and its length in hex characters. */
const MEASUREMENT_FIELDS: readonly (readonly [string, number])[] = [
  ["mrtd", 96],
  ["rtmr0", 96],
  ["rtmr1", 96],
  ["rtmr2", 96],
  ["compose_hash", 64],
  ["key_provider_digest", 96],
];

/** What the host claims on a simulated room's behalf. Both values are optional and unvalidated. */
export interface SimulatedSource {
  /** `MARGINAL_SIM_MEASUREMENT`: a `Measurement` as JSON. */
  readonly measurement?: string;
  /** `MARGINAL_SIM_PPID`: 16 bytes of hex, the platform id the record's `ppid_hash` is made from. */
  readonly ppid?: string;
}

/**
 * Whether a room asked for the simulated path.
 *
 * Only the literal `true` counts. A hostile room sending `"true"`, `1` or `{}` gets the real path,
 * where its quote is verified — which is the right answer, because a room cannot be allowed to
 * choose how hard its own attestation is checked.
 */
export function isSimulated(bundle: unknown): boolean {
  return (bundle as { simulated?: unknown } | null)?.simulated === true;
}

function isHex(value: unknown, chars: number): boolean {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${chars}}$`).test(value);
}

/**
 * Reads the measurement the host claims, checking every field's length here rather than trusting
 * the encoder to notice: a short hex string must not reach the chain as a silent zero.
 */
function measurementFrom(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw.trim() === "") {
    throw new HttpError(503, `${MEASUREMENT_VAR} is not set: a simulated room has no quote to measure`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(503, `${MEASUREMENT_VAR} is not JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(503, `${MEASUREMENT_VAR} is not a measurement object`);
  }
  const fields = parsed as Record<string, unknown>;
  for (const [name, chars] of MEASUREMENT_FIELDS) {
    if (!isHex(fields[name], chars)) {
      throw new HttpError(503, `${MEASUREMENT_VAR}.${name} must be ${chars} hex characters`);
    }
  }
  // GPU rooms only, and the demo has none: absent means absent, not zero.
  const gpu = fields.gpu_policy_hash ?? null;
  if (gpu !== null && !isHex(gpu, 64)) {
    throw new HttpError(503, `${MEASUREMENT_VAR}.gpu_policy_hash must be 64 hex characters or null`);
  }
  return { ...fields, gpu_policy_hash: gpu };
}

/** The `ppid_hash` the record carries, from the platform id the host claims. */
function ppidHashFrom(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    throw new HttpError(503, `${PPID_VAR} is not set: a simulated room has no platform to report`);
  }
  const ppid = raw.trim();
  if (!isHex(ppid, PPID_HEX)) {
    throw new HttpError(503, `${PPID_VAR} must be ${PPID_HEX} hex characters (16 bytes)`);
  }
  return call("ppid_hash", { ppid }) as string;
}

/**
 * The Borsh `SimRoom` for `register_room_simulated`, base64 as the contract takes it: the room's
 * own four fields, and the measurement and platform id from the host.
 *
 * The encoding is `marginal-core`'s, so the bytes are the ones the contract decodes.
 */
export function simRoomRequest(bundle: Record<string, unknown>, source: SimulatedSource): string {
  const measurement = measurementFrom(source.measurement);
  const ppid_hash = ppidHashFrom(source.ppid);
  // Anything left for the encoder to refuse is the room's own four fields; the host's two are
  // already checked, so the blame cannot land on the wrong side of the boundary.
  let encoded: string;
  try {
    encoded = call("sim_room_encode", {
      sign_pk: bundle.sign_pk,
      box_pk: bundle.box_pk,
      nonce: bundle.nonce,
      class: bundle.class,
      measurement,
      ppid_hash,
    }) as string;
  } catch {
    throw new HttpError(400, "that is not a simulated registration");
  }
  return Buffer.from(encoded, "hex").toString("base64");
}
