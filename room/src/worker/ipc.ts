/**
 * The worker's side of the channel the supervisor serves (SDD §3.14.1; `spawn.ts`).
 *
 * A worker holds a job's plaintext and its keys, so it holds neither the room's signing key nor a
 * route off the machine. It asks for exactly two things and can ask for nothing else: a signature
 * over one of the room's own messages, and a relay of a signed call through the operator agent.
 * Every request is answered or rejected; nothing is fire-and-forget, so a worker cannot believe it
 * submitted something it did not.
 */
import type { RoomJob } from "../chain.js";

/** The slice of `process` this needs, so a test does not have to fork. */
export interface ChannelProcess {
  on(event: "message", listener: (message: unknown) => void): unknown;
  send?(message: unknown): boolean;
}

/** The job this worker was forked for, and the room key it answers under. */
export interface Assignment {
  readonly job: RoomJob;
  readonly roomKey: string;
}

export interface WorkerChannel {
  /** The job the supervisor forked this worker for. */
  job(): Promise<Assignment>;
  /** A signature over `message` (hex), refused unless it is one of the room's own messages. */
  sign(message: string): Promise<string>;
  /** Relays a call and returns what it returned. */
  submit(
    method: string,
    args: Record<string, unknown>,
    contract?: "clearing" | "keypolicy",
  ): Promise<unknown>;
  /** Reads an object from the blob store, as hex. A worker has no network of its own. */
  getBlob(key: string): Promise<string>;
  /** Stores an object the room emitted. */
  putBlob(key: string, bytes: string): Promise<void>;
  /** Opens a sealed box addressed to the room's `box_pk`; the worker never holds `box_sk`. */
  unseal(bytes: string): Promise<string>;
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

function asRecord(raw: unknown): Record<string, unknown> | undefined {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
}

export function workerChannel(host: ChannelProcess): WorkerChannel {
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let job: Assignment | undefined;
  let waitingForJob: Pending | undefined;

  host.on("message", (raw: unknown) => {
    const message = asRecord(raw);
    if (message === undefined) return;
    if (message.kind === "job" && typeof message.room_key === "string") {
      job = { job: message.job as RoomJob, roomKey: message.room_key };
      waitingForJob?.resolve(job);
      waitingForJob = undefined;
      return;
    }
    const id = typeof message.id === "number" ? message.id : -1;
    const waiter = pending.get(id);
    if (waiter === undefined) return;
    pending.delete(id);
    if (typeof message.error === "string") {
      waiter.reject(new Error(`supervisor: ${message.error}`));
      return;
    }
    waiter.resolve(message);
  });

  const ask = (request: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const send = host.send;
    if (send === undefined) {
      return Promise.reject(new Error("supervisor: there is no channel to the supervisor"));
    }
    const id = nextId;
    nextId += 1;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      send.call(host, { ...request, id });
    });
  };

  return {
    job(): Promise<Assignment> {
      if (job !== undefined) return Promise.resolve(job);
      return new Promise<Assignment>((resolve, reject) => {
        waitingForJob = { resolve: resolve as (value: unknown) => void, reject };
      });
    },
    async sign(message: string): Promise<string> {
      const reply = await ask({ kind: "sign", message });
      const signature = reply.signature;
      if (typeof signature !== "string") throw new Error("supervisor: no signature came back");
      return signature;
    },
    async submit(
      method: string,
      args: Record<string, unknown>,
      contract: "clearing" | "keypolicy" = "clearing",
    ): Promise<unknown> {
      const reply = await ask({ kind: "submit", method, args, contract });
      return reply.value;
    },
    async getBlob(key: string): Promise<string> {
      const reply = await ask({ kind: "blob", op: "get", key });
      const bytes = reply.value;
      if (typeof bytes !== "string") throw new Error(`supervisor: ${key} did not come back`);
      return bytes;
    },
    async putBlob(key: string, bytes: string): Promise<void> {
      await ask({ kind: "blob", op: "put", key, bytes });
    },
    async unseal(bytes: string): Promise<string> {
      const reply = await ask({ kind: "unseal", bytes });
      const opened = reply.value;
      if (typeof opened !== "string") throw new Error("supervisor: the box did not open");
      return opened;
    },
  };
}
