/**
 * Registration (SDD §3.13 steps 2–6, E7.4): what the room puts in its quote, and what it hands the
 * operator agent to relay.
 *
 * Every byte here comes from `@marginal/core-wasm`, so the room computes exactly what KeyPolicy
 * will check: the report data is `SHA-512("marginal-room-v1" ‖ borsh(RoomBinding))`, and the
 * registration carries the room's own signature over `"marginal/room-pop/v1" ‖ report_data` —
 * without it, anyone with a TDX machine could register this room's public key under their own box
 * key (E3.2's proof of possession).
 */
import { call } from "@marginal/core-wasm";

import type { RoomConfig } from "./config.js";
import type { DstackPort, RawEvent } from "./dstack.js";
import type { OperatorPort } from "./operator.js";
import type { RoomKeys } from "./keys.js";

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "hex"));
}

/** The event log in the shape the contracts read: a type, a name and raw payload bytes. */
export interface Rtmr3Event {
  readonly event_type: number;
  readonly name: string;
  readonly payload: string;
}

/**
 * Keeps the RTMR3 events and drops everything else. dstack writes one log for every measurement
 * register; only register 3's entries replay to the value KeyPolicy checks (§3.13).
 */
export function rtmr3Events(log: readonly RawEvent[]): Rtmr3Event[] {
  return log
    .filter((entry) => entry.imr === 3)
    .map((entry) => ({
      event_type: entry.event_type,
      name: entry.event,
      payload: entry.event_payload,
    }));
}

/** The binding a quote commits to (SDD §3.13 step 4). */
export function roomBinding(
  config: RoomConfig,
  keys: RoomKeys,
  nonceHex: string,
): Record<string, string> {
  return {
    chain_id: config.chainId,
    keypolicy: config.keypolicy,
    sign_pk: toHex(keys.signPk),
    box_pk: toHex(keys.boxPk),
    nonce: nonceHex,
  };
}

/** The 64 bytes the quote must report. */
export function reportData(binding: Record<string, string>): Uint8Array {
  return fromHex(call("room_report_data", binding) as string);
}

/** What the room signs to prove it holds the signing key the quote names. */
export function proofOfPossession(keys: RoomKeys, binding: Record<string, string>): Uint8Array {
  return keys.sign(fromHex(call("room_pop_signing_bytes", binding) as string));
}

/** The signed parts of a registration. The operator agent adds the collateral it fetches (E11.3). */
export interface RegistrationBundle {
  readonly quote: string;
  readonly events: readonly Rtmr3Event[];
  readonly sign_pk: string;
  readonly box_pk: string;
  readonly nonce: string;
  readonly class: string;
  /** The room's proof that it holds `sign_pk` (E3.2). */
  readonly sign_sig: string;
  /**
   * Never set on a real registration, so the bytes the agent relays are exactly what E3.2's
   * verifier checks; the simulated bundle below sets it to `true`.
   */
  readonly simulated?: false;
}

/**
 * A registration with nothing proved (SDD §6.1, E14.4): no quote, no event log and no
 * proof-of-possession, because a room with no TDX machine has nothing to make them from.
 *
 * The room deliberately claims **no measurement**. In a real run the measurement comes out of the
 * quote's event log, which the room does not have here, so the agent's own configuration supplies
 * it — the untrusted host claiming what a quote would have proved, which is what `SimRoom` is for.
 * Only `keypolicy-sim` has a method that accepts it, and the record it writes says `Simulated`.
 */
export interface SimulatedBundle {
  readonly sign_pk: string;
  readonly box_pk: string;
  readonly nonce: string;
  readonly class: string;
  /** The discriminant the agent switches on. Literally `true`, and nothing else counts. */
  readonly simulated: true;
}

/**
 * Where the quote reports its 64 bytes of report data: a TDX v4 quote is a 48-byte header followed
 * by the TD report, whose `report_data` sits at offset 520.
 */
const REPORT_DATA_OFFSET = 48 + 520;

/** A nonce KeyPolicy issued, or nothing: it goes into the report data, so it is checked first. */
function checkNonce(nonceHex: string): void {
  if (!/^[0-9a-f]{64}$/.test(nonceHex)) throw new Error("the nonce is not 32 bytes of hex");
}

/**
 * Builds a registration and **checks it the way KeyPolicy will** before anyone pays for it. The
 * verifier call costs 200 TGas and the registration costs storage, so a quote that cannot pass is
 * better refused here: the room replays its own event log, applies the same event policy, and reads
 * the report data back out of the quote (E3.2's checks, through `@marginal/core-wasm`).
 *
 * The collateral is not here on purpose: the room has no route to Intel's PCCS and no business
 * having one. The agent fetches it and assembles the Borsh `RegisterRoomRequest` with
 * `register_room_encode`; none of the room's signatures cover it, so it cannot be tampered into
 * something that passes.
 */
export async function buildRegistration(
  config: RoomConfig,
  keys: RoomKeys,
  dstack: DstackPort,
  nonceHex: string,
): Promise<RegistrationBundle> {
  checkNonce(nonceHex);
  const binding = roomBinding(config, keys, nonceHex);
  const expected = reportData(binding);
  const { quote, eventLog } = await dstack.getQuote(expected);
  const events = rtmr3Events(eventLog);

  const reported = quote.subarray(REPORT_DATA_OFFSET, REPORT_DATA_OFFSET + 64);
  if (toHex(reported) !== toHex(expected)) {
    throw new Error("the quote does not report this registration's data");
  }
  // The log has to replay to the value the quote reports, and it has to be the log of a room this
  // policy admits: no KMS, no injected script, storage encrypted (E3.2's event policy).
  call("rtmr3_replay", { events });
  call("room_events", { events });

  return {
    quote: toHex(quote),
    events,
    sign_pk: toHex(keys.signPk),
    box_pk: toHex(keys.boxPk),
    nonce: nonceHex,
    class: config.roomClass,
    sign_sig: toHex(proofOfPossession(keys, binding)),
  };
}

/**
 * What a room registers with when there is no TDX machine to ask (SDD §6.1, E14.4).
 *
 * There is nothing to build: the room's two public keys, the nonce it was issued, and the class it
 * runs as. No quote, so no report data and no proof of possession — `register_room_simulated` checks
 * neither, because a simulated record proves nothing anyway and pretending otherwise would be worse
 * than being plain about it.
 */
export function simulatedBundle(
  config: RoomConfig,
  keys: RoomKeys,
  nonceHex: string,
): SimulatedBundle {
  checkNonce(nonceHex);
  return {
    sign_pk: toHex(keys.signPk),
    box_pk: toHex(keys.boxPk),
    nonce: nonceHex,
    class: config.roomClass,
    simulated: true,
  };
}

/**
 * Registers the room: a nonce from the agent, a quote from dstack, and the agent relays it.
 *
 * A simulated run never reaches dstack. That is the point of it — on a laptop
 * `/var/run/dstack.sock` does not exist, so asking for a quote is not a degraded path but a
 * guaranteed failure.
 */
export async function register(
  config: RoomConfig,
  keys: RoomKeys,
  dstack: DstackPort,
  operator: OperatorPort,
): Promise<RegistrationBundle | SimulatedBundle> {
  const nonce = await operator.issueNonce();
  const bundle = config.simulatedAttestation
    ? simulatedBundle(config, keys, nonce)
    : await buildRegistration(config, keys, dstack, nonce);
  await operator.register(bundle);
  return bundle;
}
