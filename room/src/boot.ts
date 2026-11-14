/**
 * Boot (SDD §3.13 steps 1–9, E7.4 and E7.5): keys, registration, renewal, and the job loop.
 *
 * The order matters. Keys first, because the quote has to commit to them. Registration next,
 * because no key is released to a room the registry has not admitted. Only then the job loop, so
 * the room never picks up work it could not finish. Renewal runs well before the 24 h expiry, and
 * a restart means new keys and a new registration — nothing here is persisted.
 */
import type { ChainPort } from "./chain.js";
import { roomRecord } from "./chain.js";
import type { RoomConfig } from "./config.js";
import type { DstackPort } from "./dstack.js";
import { generateRoomKeys, type RoomKeys } from "./keys.js";
import type { OperatorPort } from "./operator.js";
import { register, toHex } from "./registration.js";
import { runLoop, scheduler, type Scheduler, type WorkerSpawner } from "./scheduler.js";

/** How long before an attestation expires to renew it: an hour of the 24 (§3.13 step 9). */
export const RENEW_BEFORE_SECS = 3_600;

/** How often to look at the registry and decide whether to renew. */
export const RENEW_EVERY_MS = 300_000;

export interface BootPorts {
  readonly chain: ChainPort;
  readonly dstack: DstackPort;
  readonly operator: OperatorPort;
  readonly spawner: WorkerSpawner;
  /**
   * The room's keys. `main.ts` generates them itself, because the signing service it wires into
   * the worker fork has to hold the same key; a boot without them makes its own, which is what
   * every restart does.
   */
  readonly keys?: RoomKeys;
  /** Overridable so a test does not have to wait for a timer. */
  readonly now?: () => number;
  /** Overridable so a test does not have to wait five minutes for a renewal check. */
  readonly renewEveryMs?: number;
  readonly onError?: (error: Error) => void;
}

export interface Room {
  readonly keys: RoomKeys;
  readonly roomKeyHex: string;
  readonly scheduler: Scheduler;
  /** True when the registry still admits this room and the attestation is not about to lapse. */
  isCurrent(): Promise<boolean>;
  /** Registers again with the same keys, which is what renewal is (§3.13 step 9). */
  renew(): Promise<void>;
  /** Stops both loops: the job poll and the renewal check. */
  stop(): void;
}

/**
 * Brings a room up: generates keys, registers, and starts polling for work.
 *
 * It does not catch registration failures. A room that cannot register cannot be given a key, so
 * carrying on would mean polling for jobs it could never answer; the supervisor exits and the host
 * restarts it, with new keys.
 */
export async function boot(config: RoomConfig, ports: BootPorts): Promise<Room> {
  const keys = ports.keys ?? generateRoomKeys();
  const roomKeyHex = toHex(keys.signPk);
  const onError = ports.onError ?? ((): void => {});
  await register(config, keys, ports.dstack, ports.operator);

  const sched = scheduler({
    chain: ports.chain,
    clearing: config.clearing,
    roomKeyHex,
    spawner: ports.spawner,
    maxWorkers: config.maxWorkers,
    onError,
  });
  const loop = runLoop(() => sched.tick(), config.pollMs);
  const now = ports.now ?? ((): number => Math.floor(Date.now() / 1_000));

  const isCurrent = async (): Promise<boolean> => {
    const record = await roomRecord(ports.chain, config.clearing, roomKeyHex);
    if (record === null) return false;
    return record.current && record.expires_at > now() + RENEW_BEFORE_SECS;
  };
  const renew = async (): Promise<void> => {
    await register(config, keys, ports.dstack, ports.operator);
  };

  // §3.13 step 9: renewal is the room's own job. A room whose attestation has lapsed is refused
  // every verdict (E6.1), so the check runs far more often than the window it is watching, and a
  // failed renewal is reported and tried again rather than ending the room.
  const renewal = runLoop(async () => {
    try {
      if (!(await isCurrent())) await renew();
    } catch (error) {
      onError(error as Error);
    }
  }, ports.renewEveryMs ?? RENEW_EVERY_MS);

  return {
    keys,
    roomKeyHex,
    scheduler: sched,
    isCurrent,
    renew,
    stop(): void {
      loop.stop();
      renewal.stop();
    },
  };
}
