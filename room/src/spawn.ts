/**
 * Forking one worker per job (SDD §3.14.1, E7.5).
 *
 * A worker holds a job's plaintext, its keys and whatever the good says; the supervisor holds the
 * room's signing key and the only route off the machine. So the two are separate processes and the
 * worker gets neither: it asks over IPC, and the supervisor answers exactly two questions — sign
 * one of the room's own messages (`signer.ts`), and relay one signed report through the operator
 * agent (`operator.ts`). Nothing else crosses, and the worker is started with an empty environment,
 * a memory cap and no durable storage, so a job's state cannot outlive its process.
 *
 * The worker module itself is E8. This is the supervisor's side of the fork, and the whole of it.
 */
import { fork, type ChildProcess } from "node:child_process";

import type { RoomJob } from "./chain.js";
import type { RoomKeys } from "./keys.js";
import type { OperatorPort } from "./operator.js";
import type { WorkerSpawner } from "./scheduler.js";
import { signForWorker } from "./signer.js";
import { boxSecretKey } from "./keys.js";
import { unseal } from "./crypto/sodium.js";

/**
 * The longest a worker may run before it is killed. A job's own on-chain deadline is what decides
 * whether it still counts; this only stops a stuck worker from holding a slot forever, so it is
 * well past the longest duration class a listing can ask for (SPEC §4.6.5).
 */
export const WORKER_TIMEOUT_MS = 600_000;

/** The worker's heap cap, in MB: two of these fit a `tdx.large` (4 vCPU, 8 GB) with room over. */
export const WORKER_MAX_OLD_SPACE_MB = 2_048;

/** The two things a worker may ask the supervisor for. */
export type WorkerRequest =
  | { readonly kind: "sign"; readonly id: number; readonly message: string }
  | {
      readonly kind: "submit";
      readonly id: number;
      readonly method: string;
      readonly args: Record<string, unknown>;
      /** Which contract the agent should call; clearing unless the worker says otherwise. */
      readonly contract: "clearing" | "keypolicy";
    }
  | {
      /**
       * Open a sealed box addressed to the room's `box_pk`. The worker never holds `box_sk`
       * (§3.12.4): it hands over the ciphertext and gets the plaintext. The supervisor cannot tell
       * which job a sealed box belongs to, so a worker can open any context key sealed to this
       * room — which is the room's own key for the room's own jobs, and nothing else.
       */
      readonly kind: "unseal";
      readonly id: number;
      readonly bytes: string;
    }
  | {
      readonly kind: "blob";
      readonly id: number;
      readonly op: "get" | "put";
      readonly key: string;
      /** Hex, on a put. */
      readonly bytes: string;
    };

/**
 * Reads one IPC message, refusing anything that is not one of the two requests. The worker is the
 * part of the room most likely to be misled, so what it sends is parsed, never trusted.
 */
export function parseWorkerRequest(raw: unknown): WorkerRequest | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const message = raw as Record<string, unknown>;
  if (typeof message.id !== "number" || !Number.isInteger(message.id)) return undefined;
  if (message.kind === "sign" && typeof message.message === "string") {
    return { kind: "sign", id: message.id, message: message.message };
  }
  if (
    message.kind === "submit" &&
    typeof message.method === "string" &&
    typeof message.args === "object" &&
    message.args !== null
  ) {
    if (message.contract !== undefined && message.contract !== "clearing" && message.contract !== "keypolicy") {
      return undefined;
    }
    return {
      kind: "submit",
      id: message.id,
      method: message.method,
      args: message.args as Record<string, unknown>,
      contract: message.contract === "keypolicy" ? "keypolicy" : "clearing",
    };
  }
  if (message.kind === "unseal" && typeof message.bytes === "string" && message.bytes !== "") {
    return { kind: "unseal", id: message.id, bytes: message.bytes };
  }
  if (
    message.kind === "blob" &&
    typeof message.key === "string" &&
    message.key !== "" &&
    (message.op === "get" || (message.op === "put" && typeof message.bytes === "string"))
  ) {
    return {
      kind: "blob",
      id: message.id,
      op: message.op,
      key: message.key,
      bytes: message.op === "put" ? (message.bytes as string) : "",
    };
  }
  return undefined;
}

export interface ForkOptions {
  /** The worker module to fork (E8's `worker/main.js`). */
  readonly workerPath: string;
  readonly keys: RoomKeys;
  readonly operator: OperatorPort;
  readonly timeoutMs?: number;
  /** Which node runs the worker. Overridable so a test can make the fork itself fail. */
  readonly execPath?: string;
  readonly onError?: (error: Error) => void;
}

/** Sends a reply only while the worker is still listening: one that has exited gets nothing. */
function reply(child: ChildProcess, message: object): void {
  if (child.connected) child.send(message);
}

/** The real spawner: one process per job, which is what the forget certificate claims (§3.18). */
export function forkSpawner(options: ForkOptions): WorkerSpawner {
  const timeoutMs = options.timeoutMs ?? WORKER_TIMEOUT_MS;
  const onError = options.onError ?? ((): void => {});

  return {
    run(job: RoomJob): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const child = fork(options.workerPath, [], {
          // Nothing of the host's environment reaches a worker: its only input is this job.
          env: {},
          execPath: options.execPath,
          execArgv: [`--max-old-space-size=${WORKER_MAX_OLD_SPACE_MB}`],
        });
        let settled = false;
        const finish = (error?: Error): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error === undefined) resolve();
          else reject(error);
        };
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish(new Error(`worker for job ${job.id} timed out`));
        }, timeoutMs);

        child.on("message", (raw: unknown) => {
          const request = parseWorkerRequest(raw);
          if (request === undefined) {
            onError(new Error(`worker for job ${job.id} sent a message the supervisor does not take`));
            return;
          }
          if (request.kind === "sign") {
            reply(child, { kind: "sign", ...signForWorker(options.keys, request) });
            return;
          }
          if (request.kind === "unseal") {
            try {
              const opened = unseal(new Uint8Array(Buffer.from(request.bytes, "hex")), {
                publicKey: options.keys.boxPk,
                secretKey: boxSecretKey(options.keys),
              });
              reply(child, {
                kind: "unseal",
                id: request.id,
                ok: true,
                value: Buffer.from(opened).toString("hex"),
              });
            } catch (error) {
              reply(child, { kind: "unseal", id: request.id, error: (error as Error).message });
            }
            return;
          }
          if (request.kind === "blob") {
            const work =
              request.op === "get"
                ? options.operator.getBlob(request.key)
                : options.operator.putBlob(request.key, request.bytes).then(() => "");
            void work
              .then((bytes) => reply(child, { kind: "blob", id: request.id, ok: true, value: bytes }))
              .catch((error: unknown) =>
                reply(child, { kind: "blob", id: request.id, error: (error as Error).message }),
              );
            return;
          }
          void options.operator
            .submit(request.method, request.args, request.contract)
            .then((value) => reply(child, { kind: "submit", id: request.id, ok: true, value }))
            .catch((error: unknown) =>
              reply(child, { kind: "submit", id: request.id, error: (error as Error).message }),
            );
        });
        child.on("error", (error) => finish(error));
        child.on("exit", (code, signal) => {
          if (code === 0) finish();
          else finish(new Error(`worker for job ${job.id} exited with ${signal ?? code}`));
        });
        // The worker holds no key of its own, so the room's public key comes with the job.
        child.send({
          kind: "job",
          job,
          room_key: Buffer.from(options.keys.signPk).toString("hex"),
        });
      });
    },
  };
}
