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
  /**
   * The MPC network's CKD public key for this deployment's domain, `bls12381g2:<base58>`.
   *
   * It is a **pin**, not an operator input: the room checks every derived key against it (§3.12.3
   * step 4), so a host that could choose it could hand the room a key it made itself and the
   * pairing check would pass. It is written into the compose file and therefore measured.
   */
  readonly mpcPublicKey: string;
  /** How often to poll `get_jobs_for_room`, in milliseconds. */
  readonly pollMs: number;
  /** The most jobs to run at once. */
  readonly maxWorkers: number;
  /**
   * Register with no quote at all, through `keypolicy-sim`'s `register_room_simulated` (SDD §6.1,
   * E14.4). A laptop has no TDX machine and no `/var/run/dstack.sock`, so without this the demo
   * cannot be run locally at all.
   *
   * It is not a weaker attestation, it is none: the room claims nothing, the untrusted host claims
   * the measurement, and the record KeyPolicy writes says `Simulated`. Only the `sandbox` profile
   * deploys a contract that has the method, so a room that sets it against a real deployment simply
   * fails to register.
   */
  readonly simulatedAttestation: boolean;
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

/** A `bls12381g2:` key, checked here so a room never starts with a key it cannot parse. */
function blsKey(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!value.startsWith("bls12381g2:")) throw new Error(`${name} must be a bls12381g2 key`);
  return value;
}

/**
 * A switch. `1` and `true` turn it on; absent, empty or anything else leaves it off, because a
 * switch that turned on for `0` or `no` would be a trap in a deploy script.
 */
function flag(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = (env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
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
/**
 * The room's configuration as the variables {@link loadConfig} reads, for the worker it forks.
 *
 * A worker is given **nothing of the host's environment** — `spawn.ts` forks it with `env: {}` so
 * that no variable of the operator's can reach the process that touches a plaintext. But the worker
 * still has to know which chain and which contracts it is working against, and it reads that the
 * same way the supervisor does. With neither, it took its job and died in `loadConfig`, which is
 * what a live run showed: jobs assigned, nothing done, `MARGINAL_RPC_URL is required` in the log.
 *
 * So the supervisor hands over exactly this and nothing else: values it already holds, derived
 * from its own configuration, with no `PATH`, no `HOME` and nothing the host set.
 * `loadConfig(configEnv(c))` is `c` — a round trip, and a test asserts it.
 */
export function configEnv(config: RoomConfig): NodeJS.ProcessEnv {
  return {
    MARGINAL_RPC_URL: config.rpcUrl,
    MARGINAL_CHAIN_ID: config.chainId,
    MARGINAL_CLEARING: config.clearing,
    MARGINAL_KEYPOLICY: config.keypolicy,
    MARGINAL_ROOM_CLASS: config.roomClass,
    MARGINAL_DSTACK_SOCKET: config.dstackSocket,
    MARGINAL_OPERATOR_URL: config.operatorUrl,
    MARGINAL_MPC_PUBLIC_KEY: config.mpcPublicKey,
    MARGINAL_POLL_MS: String(config.pollMs),
    MARGINAL_MAX_WORKERS: String(config.maxWorkers),
    MARGINAL_SIMULATED_ATTESTATION: config.simulatedAttestation ? "1" : "0",
  };
}

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
    mpcPublicKey: blsKey(env, "MARGINAL_MPC_PUBLIC_KEY"),
    pollMs: positive(env, "MARGINAL_POLL_MS", DEFAULTS.pollMs),
    maxWorkers: positive(env, "MARGINAL_MAX_WORKERS", DEFAULTS.maxWorkers),
    simulatedAttestation: flag(env, "MARGINAL_SIMULATED_ATTESTATION"),
  };
}
