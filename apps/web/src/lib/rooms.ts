/**
 * What `/rooms` reads (E13.6, D3): the rooms this deployment will release a key to, and the
 * attestation record behind each one.
 *
 * `eligible(class)` is the only enumeration a contract offers, and it answers with the rooms that
 * are *currently* eligible — which is the honest list, because an expired or revoked room is not a
 * room a seller's good can be opened by. KeyPolicy holds the attestation itself.
 */
import type { ChainPort } from "./chain";
import type { Attestation, Room } from "./records";

/** The room classes M1 can deploy (SDD §3.11; only `Kcpu` runs in the HDP). */
export const ROOM_CLASSES = ["Kcpu", "K", "S", "G", "D"] as const;

export interface RoomRow {
  readonly key: string;
  readonly room: Room | null;
  readonly attestation: Attestation | null;
  /** From `check_room`: why clearing would refuse this room, if it would. */
  readonly denyReasons: readonly string[];
}

/** Every eligible room key, across the classes, without repeats. */
export async function roomKeys(chain: ChainPort, clearing: string): Promise<readonly string[]> {
  const perClass = await Promise.all(
    ROOM_CLASSES.map((klass) =>
      chain
        .view<readonly string[]>(clearing, "eligible", { class: klass })
        .catch(() => [] as readonly string[]),
    ),
  );
  return [...new Set(perClass.flat())];
}

/**
 * The classes of room that may run a listing's jobs. `pick_room` in
 * `contracts/clearing/src/listing.rs` draws from exactly these two pools (`KNOWLEDGE_ROOMS`), so
 * these are the rooms a knowledge or dataset listing can ever be assigned to.
 */
export const KNOWLEDGE_ROOM_CLASSES = ["K", "Kcpu"] as const;

/**
 * Every room currently eligible to take a listing's work, without repeats.
 *
 * Unlike {@link roomKeys}, a view that does not answer is **not** swallowed here: this is what a
 * seller's decision rests on under RoomSealed, and an RPC that failed must not read as "this
 * deployment has no rooms".
 */
export async function knowledgeRoomKeys(
  chain: ChainPort,
  clearing: string,
): Promise<readonly string[]> {
  const perClass = await Promise.all(
    KNOWLEDGE_ROOM_CLASSES.map((klass) =>
      chain.view<readonly string[]>(clearing, "eligible", { class: klass }),
    ),
  );
  return [...new Set(perClass.flat())];
}

/** One room: the registry's record, KeyPolicy's attestation, and the deny list. */
export async function loadRoom(
  chain: ChainPort,
  clearing: string,
  keypolicy: string,
  key: string,
): Promise<RoomRow> {
  const [room, attestation, check] = await Promise.all([
    chain.view<Room | null>(clearing, "get_room", { room_key: key }).catch(() => null),
    chain.view<Attestation | null>(keypolicy, "get_attestation", { room_key: key }).catch(() => null),
    chain
      .view<{ ok: boolean; deny_reasons: readonly string[] }>(clearing, "check_room", {
        room_key: key,
      })
      .catch(() => ({ ok: false, deny_reasons: ["check_room did not answer"] })),
  ]);
  return { key, room, attestation, denyReasons: check.deny_reasons };
}

/** Every room, with everything known about it. */
export async function loadRooms(
  chain: ChainPort,
  clearing: string,
  keypolicy: string,
): Promise<readonly RoomRow[]> {
  const keys = await roomKeys(chain, clearing);
  return Promise.all(keys.map((key) => loadRoom(chain, clearing, keypolicy, key)));
}

/**
 * What an attestation mode means, in the contrast D3 is built on: a real quote verified on-chain
 * through the locked tee-verifier, or something weaker that is flagged everywhere it appears.
 */
export function modeNote(mode: string | null): { real: boolean; note: string } {
  switch (mode) {
    case "OnChainDcap":
      return {
        real: true,
        note: "A real TDX quote, verified on-chain by NEAR One's locked tee-verifier.",
      };
    case "AttesterQuorum":
      return {
        real: false,
        note: "A quorum of attesters vouched for the quote; the chain did not check it itself.",
      };
    case "Simulated":
      return {
        real: false,
        note: "No quote was verified. Every record this room produces is flagged simulated.",
      };
    default:
      return { real: false, note: "No attestation record." };
  }
}

/**
 * The RTMR3 event order dstack measures, which is what proves the room booted with no key provider
 * (§3.13, DRC-3). The page shows the recorded events against this, so a missing or reordered event
 * is visible rather than implied.
 */
export const RTMR3_EVENTS = [
  "system-preparing",
  "app-id",
  "compose-hash",
  "instance-id",
  "boot-mr-done",
  "key-provider",
  "storage-fs",
  "storage-encrypted",
  "system-ready",
] as const;
