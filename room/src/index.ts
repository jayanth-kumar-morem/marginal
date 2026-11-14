/**
 * `@marginal/room`: the supervisor that runs inside the CVM (SDD §3.1, §3.13, §3.14).
 *
 * E7 builds the supervisor: configuration, keys, the dstack client, registration, the chain views,
 * the signing service and the job loop. The per-job worker and the appraisers are E8, and they
 * reach the chain only through this supervisor.
 */
export const PACKAGE = "@marginal/room";

export {
  seal,
  unseal,
  aeadSeal,
  aeadOpen,
  hkdf,
  memzero,
  randomBytes,
  boxKeys,
  boxPublicKey,
  sharedSecret,
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  SEAL_OVERHEAD_BYTES,
  type BoxKeys,
} from "./crypto/sodium.js";

export { loadConfig, DEFAULTS, type RoomConfig } from "./config.js";
export { generateRoomKeys, type RoomKeys, type PublicKey } from "./keys.js";
export { dstackClient, isHttpError, type DstackPort, type DstackOptions, type Quote, type RawEvent } from "./dstack.js";
export { chainClient, jobsForRoom, roomRecord, type ChainPort, type RoomJob, type RoomRecord, type Fetch } from "./chain.js";
export { operatorClient, type OperatorPort } from "./operator.js";
export {
  buildRegistration,
  register,
  reportData,
  roomBinding,
  rtmr3Events,
  proofOfPossession,
  toHex,
  type RegistrationBundle,
  type Rtmr3Event,
} from "./registration.js";
export {
  signForWorker,
  MAX_MESSAGE_BYTES,
  WORKER_DOMAINS,
  type SignRequest,
  type SignReply,
  type WorkerDomain,
} from "./signer.js";
export { scheduler, runLoop, type Scheduler, type WorkerSpawner, type SchedulerOptions } from "./scheduler.js";
export {
  forkSpawner,
  parseWorkerRequest,
  WORKER_TIMEOUT_MS,
  WORKER_MAX_OLD_SPACE_MB,
  type ForkOptions,
  type WorkerRequest,
} from "./spawn.js";
export { boot, RENEW_BEFORE_SECS, RENEW_EVERY_MS, type Room, type BootPorts } from "./boot.js";
export { main, WORKER_PATH } from "./main.js";
