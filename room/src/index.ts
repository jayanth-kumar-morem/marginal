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
export {
  appId,
  appKey,
  appKeyFromScalar,
  parseBlsKey,
  recoverSigma,
  strongKey,
  listingKeys,
  NEAR_STRONG_KEY_INFO,
  type AppKey,
  type CkdResponse,
  type ListingKeys,
} from "./crypto/ckd.js";
export {
  sealDelivery,
  openDelivery,
  deliveryPayload,
  ephemeralKey,
  type Delivery,
} from "./crypto/delivery.js";

export { loadConfig, DEFAULTS, type RoomConfig } from "./config.js";
export { generateRoomKeys, type RoomKeys, type PublicKey } from "./keys.js";
export { dstackClient, isHttpError, type DstackPort, type DstackOptions, type Quote, type RawEvent } from "./dstack.js";
export {
  chainClient,
  jobsForRoom,
  roomRecord,
  jobRecord,
  listingRecord,
  attestationRecord,
  clearingConfig,
  type ChainPort,
  type RoomJob,
  type RoomRecord,
  type JobRecord,
  type ListingRecord,
  type AttestationRecord,
  type ClearingConfig,
  type Fetch,
} from "./chain.js";
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

// The worker side (E8): the channel it reaches the supervisor through, the keys it derives, the
// certificate it signs, and the two jobs it can run.
export { workerChannel, type WorkerChannel, type Assignment, type ChannelProcess } from "./worker/ipc.js";
export { listingKeyFor, listingPath, type KeyContext, type DerivedKey } from "./worker/keys.js";
export {
  loadJob,
  openGood,
  goodKey,
  wrappedKeyKey,
  type WorkerContext,
  type JobData,
  type Good,
} from "./worker/context.js";
export { runProvisioning, PROVISIONING_DOMAIN } from "./worker/provisioning.js";
export { runScreening, SCREENING_DOMAIN } from "./worker/screening.js";
export { runJob, appraiserFor, main as workerMain } from "./worker/main.js";
export {
  runAppraisal,
  checkCommitment,
  parseBundle,
  restrictedMatch,
  contextKey,
  VERDICT_DOMAIN,
  type Bundle,
  type Appraised,
} from "./worker/appraisal.js";
export { base64, hashOf, certificateKey, commitmentOf } from "./worker/report.js";
export {
  buildCertificate,
  signCertificate,
  scopeFor,
  nonPersistenceBasis,
  FORGET_DOMAIN,
  NP_PROCESS_EXIT,
  NP_NO_PERSISTENT_STORAGE,
  NP_NO_SWAP,
  NP_TEE_MEMORY,
  type CertificateInputs,
  type SignedCertificate,
  type Scope,
} from "./cert/forget.js";
export { screen, FLAG_MNPI, type Screening, type ScreeningResult } from "./appraisers/screening/index.js";
export { quantise, type Appraiser, type Appraisal, type AppraisalInput, type JudgeFactor } from "./appraisers/types.js";
export {
  knowledgeAppraiser,
  COMPONENT_LEVELS,
  N_PUB_WITHOUT_CORPUS,
  MIN_CONTEXT_CLAIMS,
} from "./appraisers/knowledge/index.js";
export {
  embedder,
  similarity,
  readVerified,
  EMBED_DIMENSIONS,
  MODEL_DIR,
  type Embedder,
} from "./appraisers/knowledge/embed.js";
export {
  datasetLiteAppraiser,
  lift,
  parseRows,
  checkIntegrity,
  OVERLAP_SIMILARITY,
  BOOTSTRAP,
  LOWER_PERCENTILE,
  MAX_SELLER_ROWS,
  MAX_EVAL_ROWS,
  type Row,
  type EvalSet,
  type Lift,
} from "./appraisers/dataset-lite/index.js";
export {
  choleskySolve,
  normalEquations,
  predict,
  seededRandom,
  percentile,
  LAMBDA,
} from "./appraisers/dataset-lite/linear.js";
export {
  claims,
  claimNovelty,
  novelty,
  KNOWN,
  UNSEEN,
  MIN_WEIGHT,
  MIN_CLAIM_WORDS,
  type Novelty,
  type ClaimScore,
} from "./appraisers/knowledge/novelty.js";
export {
  encode,
  normalize,
  preTokenize,
  wordPiece,
  MAX_TOKENS,
  type TokenizerModel,
  type Encoded,
} from "./appraisers/knowledge/tokenizer.js";
export { INSIDER_PHRASES, EVENT_TERMS, ISSUER_LEXICON } from "./appraisers/screening/lexicon.js";
