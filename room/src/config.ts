/**
 * The room's configuration (SDD §3.13, E7.2: "the only operator input is the RPC URL").
 *
 * Everything else is baked into the measured image, so the host cannot change what the room talks
 * to: a different clearing or KeyPolicy account would be a different compose hash, and the
 * attestation would no longer match the seller's pins. `allowed_envs: []` in `app-compose.json`
 * makes dstack drop every host-supplied variable anyway; the RPC URL is passed in the compose file
 * the image is built with.
 */

/** What a room needs to know to run. */
export interface RoomConfig {
  /** The only operator input (E7.2). */
  readonly rpcUrl: string;
  readonly chainId: string;
  readonly clearing: string;
  readonly keypolicy: string;
  /** The room's class in the registry (SDD §3.11); the demo runs `Kcpu`. */
  readonly roomClass: "K" | "Kcpu";
  /** The dstack guest agent's unix socket (SDD §3.13 step 5). */
  readonly dstackSocket: string;
  /** Where the operator agent (E11.3) listens, on the host. */
  readonly operatorUrl: string;
  /** How often to poll `get_jobs_for_room`, in milliseconds. */
  readonly pollMs: number;
  /** The most jobs to run at once. */
  readonly maxWorkers: number;
}

const ROOM_CLASSES = ["K", "Kcpu"] as const;

/** The defaults the image is built with. Only `MARGINAL_RPC_URL` is expected to vary. */
export const DEFAULTS = {
  roomClass: "Kcpu",
  dstackSocket: "/var/run/dstack.sock",
  pollMs: 2_000,
  maxWorkers: 2,
} as const;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value.trim();
}

function url(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    throw new Error(`${name} must be an http(s) URL`);
  }
  return value;
}

function positive(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/**
 * Reads the configuration, refusing anything missing or malformed: a room that starts with half a
 * configuration would register and then fail every job.
 */
export function loadConfig(env: NodeJS.ProcessEnv): RoomConfig {
  const roomClass = (env.MARGINAL_ROOM_CLASS ?? DEFAULTS.roomClass).trim();
  if (!(ROOM_CLASSES as readonly string[]).includes(roomClass)) {
    throw new Error(`MARGINAL_ROOM_CLASS must be one of ${ROOM_CLASSES.join(", ")}`);
  }
  return {
    rpcUrl: url(env, "MARGINAL_RPC_URL"),
    chainId: required(env, "MARGINAL_CHAIN_ID"),
    clearing: required(env, "MARGINAL_CLEARING"),
    keypolicy: required(env, "MARGINAL_KEYPOLICY"),
    roomClass: roomClass as RoomConfig["roomClass"],
    dstackSocket: (env.MARGINAL_DSTACK_SOCKET ?? DEFAULTS.dstackSocket).trim(),
    operatorUrl: url(env, "MARGINAL_OPERATOR_URL"),
    pollMs: positive(env, "MARGINAL_POLL_MS", DEFAULTS.pollMs),
    maxWorkers: positive(env, "MARGINAL_MAX_WORKERS", DEFAULTS.maxWorkers),
  };
}
