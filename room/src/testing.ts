/**
 * Test support: the doubles the room's ports are tested against, and a real unix-socket guest agent
 * so the dstack client is exercised over a socket rather than a mock. Not part of the room's
 * measured code (excluded from the coverage gate, like every `testing.ts`).
 */
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { base58 } from "@scure/base";

import type { ChainPort, RoomJob } from "./chain.js";
import type { RoomConfig } from "./config.js";
import type { DstackPort, Quote, RawEvent } from "./dstack.js";
import type { OperatorPort } from "./operator.js";
import type { RoomKeys } from "./keys.js";
import { signForWorker } from "./signer.js";
import { AEAD_KEY_BYTES, AEAD_NONCE_BYTES, aeadSeal, randomBytes, seal } from "./crypto/sodium.js";
import type { WorkerChannel } from "./worker/ipc.js";

export const CHAIN_ID = "sandbox";
export const CLEARING = "clearing.marginal-demo.testnet";
export const KEYPOLICY = "keypolicy.marginal-demo.testnet";
/** A real BLS12-381 G2 point in NEAR's spelling: `5·G2`, which is enough to parse and multiply. */
export const MPC_PUBLIC_KEY =
  "bls12381g2:mS1dNRvQS81AJyLWxavvKPkaBMNb38iVqYnAPASANGR1sSWAty97q28pzEhLcqTRQppC8JyFDL71bg3gbAboT35SaH5bgHjMyGziwBYarYpDFVWCcijN9pUrvwcYpYLfNHu";

export function testConfig(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    rpcUrl: "http://127.0.0.1:3030",
    chainId: CHAIN_ID,
    clearing: CLEARING,
    keypolicy: KEYPOLICY,
    roomClass: "Kcpu",
    dstackSocket: "/var/run/dstack.sock",
    operatorUrl: "http://127.0.0.1:8080",
    mpcPublicKey: MPC_PUBLIC_KEY,
    pollMs: 10,
    maxWorkers: 2,
    ...overrides,
  };
}

/** The event log of a room this policy admits (the same shape E3.2's tests use). */
export function goodEventLog(composeHash = "c0".repeat(32)): RawEvent[] {
  const event = (name: string, payload: string): RawEvent => ({
    imr: 3,
    event_type: 0x08000001,
    digest: "00".repeat(48),
    event: name,
    event_payload: payload,
  });
  return [
    { ...event("system-preparing", ""), imr: 1 },
    event("system-preparing", ""),
    event("app-id", composeHash.slice(0, 40)),
    event("compose-hash", composeHash),
    event("instance-id", ""),
    event("boot-mr-done", ""),
    event("key-provider", Buffer.from('{"name":"none","id":""}', "utf8").toString("hex")),
    event("storage-fs", Buffer.from("zfs", "utf8").toString("hex")),
    event("storage-encrypted", Buffer.from("1", "utf8").toString("hex")),
    event("system-ready", ""),
  ];
}

/**
 * A quote whose report data is whatever was asked for. A real quote is 5 KB of signed structure;
 * what the room checks locally is the report data at its fixed offset, so the double puts it there.
 */
export function fakeQuote(reportData: Uint8Array): Uint8Array {
  const quote = new Uint8Array(48 + 584);
  quote.set(reportData, 48 + 520);
  return quote;
}

export function fakeDstack(log: RawEvent[] = goodEventLog()): DstackPort & { calls: number } {
  const port = {
    calls: 0,
    getQuote(reportData: Uint8Array): Promise<Quote> {
      port.calls += 1;
      return Promise.resolve({ quote: fakeQuote(reportData), eventLog: log });
    },
  };
  return port;
}

/** A guest agent on a real unix socket, answering `GetQuote` the way dstack does. */
export async function dstackSocketServer(
  reply: (reportData: string) => { status?: number; body: string },
): Promise<{ socketPath: string; close(): Promise<void> }> {
  const socketPath = join(mkdtempSync(join(tmpdir(), "marginal-dstack-")), "dstack.sock");
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const asked = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { report_data?: string };
      const answer = reply(asked.report_data ?? "");
      res.writeHead(answer.status ?? 200, { "content-type": "application/json" });
      res.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return {
    socketPath,
    close(): Promise<void> {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A socket that accepts a connection and never answers, so a client's timeout has to end it. */
export async function silentSocketServer(): Promise<{ socketPath: string; close(): Promise<void> }> {
  const { createServer: createNetServer } = await import("node:net");
  const socketPath = join(mkdtempSync(join(tmpdir(), "marginal-silent-")), "dstack.sock");
  const sockets: import("node:net").Socket[] = [];
  const server = createNetServer((socket) => sockets.push(socket));
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return {
    socketPath,
    close(): Promise<void> {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export function fakeOperator(nonce = "11".repeat(32)): OperatorPort & {
  registered: unknown[];
  submitted: { method: string; args: Record<string, unknown>; contract: string }[];
  blobs: Map<string, string>;
} {
  const port = {
    registered: [] as unknown[],
    submitted: [] as { method: string; args: Record<string, unknown>; contract: string }[],
    blobs: new Map<string, string>(),
    putBlob(key: string, bytes: string): Promise<void> {
      port.blobs.set(key, bytes);
      return Promise.resolve();
    },
    getBlob(key: string): Promise<string> {
      const bytes = port.blobs.get(key);
      return bytes === undefined
        ? Promise.reject(new Error(`operator: no blob ${key}`))
        : Promise.resolve(bytes);
    },
    issueNonce(): Promise<string> {
      return Promise.resolve(nonce);
    },
    register(bundle: unknown): Promise<void> {
      port.registered.push(bundle);
      return Promise.resolve();
    },
    submit(
      method: string,
      args: Record<string, unknown>,
      contract: "clearing" | "keypolicy" = "clearing",
    ): Promise<unknown> {
      port.submitted.push({ method, args, contract });
      return Promise.resolve(null);
    },
  };
  return port;
}

/** A chain that answers from a table of canned views. */
export function fakeChain(views: Record<string, unknown>): ChainPort & { calls: string[] } {
  const port = {
    calls: [] as string[],
    view<T>(contract: string, method: string): Promise<T> {
      port.calls.push(`${contract}.${method}`);
      if (!(method in views)) return Promise.reject(new Error(`no canned ${method}`));
      return Promise.resolve(views[method] as T);
    },
  };
  return port;
}

export function job(id: number, overrides: Partial<RoomJob> = {}): RoomJob {
  return {
    id,
    kind: "Appraisal",
    listing_id: 1,
    listing_version: 1,
    state: "Assigned",
    job_commitment: "ab".repeat(32),
    deadline_height: 1_000,
    ...overrides,
  };
}

/**
 * A real HTTP server on localhost, answering JSON by path: it stands in for the operator agent and
 * for the NEAR RPC, so the clients that talk to them are exercised over a socket.
 */
export async function httpJsonServer(
  handler: (path: string, body: unknown) => { status?: number; json: unknown },
): Promise<{ url: string; paths: string[]; close(): Promise<void> }> {
  const paths: string[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "/";
      paths.push(path);
      const answer = handler(path, text === "" ? null : (JSON.parse(text) as unknown));
      res.writeHead(answer.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    paths,
    close(): Promise<void> {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A NEAR JSON-RPC `call_function` answer carrying `value` as its JSON result. */
export function viewReply(value: unknown): unknown {
  return { jsonrpc: "2.0", id: "room", result: { result: [...Buffer.from(JSON.stringify(value))] } };
}

/** Which view a JSON-RPC body asks for. */
export function viewMethod(body: unknown): string {
  const params = (body as { params?: { method_name?: unknown } } | null)?.params;
  return typeof params?.method_name === "string" ? params.method_name : "";
}

/**
 * Writes a worker module to a temporary directory and returns its path, so the fork is a real
 * process running real code rather than a double. Nothing under `src/` pretends to be a worker.
 */
export function workerFixture(source: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "marginal-worker-")), "worker.mjs");
  writeFileSync(path, source, "utf8");
  return path;
}

/**
 * The MPC network's side of a CKD exchange, played locally. `scalar` is the room's per-job app
 * scalar, which a test pins through `WorkerContext.appKeySource`; the network only ever needs
 * `a·G1`, so this is exactly the information the real network has.
 */
export function ckdNetwork(master = 1234567890n): {
  publicKey: string;
  answer(appIdBytes: Uint8Array, pk1: Uint8Array, y?: bigint): { big_y: string; big_c: string };
  sigma(appIdBytes: Uint8Array): Uint8Array;
} {
  const DST = "NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_";
  const mpc = bls12_381.G2.Point.BASE.multiply(master);
  const sigmaFor = (appIdBytes: Uint8Array): ReturnType<typeof bls12_381.G1.hashToCurve> =>
    bls12_381.G1.hashToCurve(new Uint8Array([...mpc.toBytes(), ...appIdBytes]), { DST }).multiply(
      master,
    );
  return {
    publicKey: `bls12381g2:${base58.encode(mpc.toBytes())}`,
    answer(appIdBytes: Uint8Array, pk1: Uint8Array, y = 55_555n) {
      const bigY = bls12_381.G1.Point.BASE.multiply(y);
      const bigC = sigmaFor(appIdBytes).add(bls12_381.G1.Point.fromBytes(pk1).multiply(y));
      return {
        big_y: `bls12381g1:${base58.encode(bigY.toBytes())}`,
        big_c: `bls12381g1:${base58.encode(bigC.toBytes())}`,
      };
    },
    sigma(appIdBytes: Uint8Array) {
      return sigmaFor(appIdBytes).toBytes();
    },
  };
}

/**
 * A `WorkerChannel` that answers the way the supervisor does, without forking: it signs with
 * `signForWorker` (so the domain allow-list is live) and relays to an operator double. The real
 * fork is proven in `spawn.test.ts`; this is for the job pipelines that run inside one.
 */
export function localChannel(
  keys: RoomKeys,
  operator: ReturnType<typeof fakeOperator>,
  job: RoomJob,
): WorkerChannel & { signed: string[] } {
  const signed: string[] = [];
  return {
    signed,
    job(): Promise<{ job: RoomJob; roomKey: string }> {
      return Promise.resolve({ job, roomKey: Buffer.from(keys.signPk).toString("hex") });
    },
    sign(message: string): Promise<string> {
      signed.push(message);
      const reply = signForWorker(keys, { id: 1, message });
      return "signature" in reply ? Promise.resolve(reply.signature) : Promise.reject(new Error(reply.error));
    },
    submit(
      method: string,
      args: Record<string, unknown>,
      contract: "clearing" | "keypolicy" = "clearing",
    ): Promise<unknown> {
      return operator.submit(method, args, contract);
    },
    getBlob(key: string): Promise<string> {
      return operator.getBlob(key);
    },
    putBlob(key: string, bytes: string): Promise<void> {
      return operator.putBlob(key, bytes);
    },
  };
}

/** A listing's good, sealed the way a seller's SDK seals it (E12.1, §3.19's layout). */
export function sealGood(
  plaintext: string,
  publicKey: Uint8Array,
): { object: string; wrapped: string; good_commitment: string; sha256: string } {
  const dek = randomBytes(AEAD_KEY_BYTES);
  const salt = randomBytes(32);
  const nonce = randomBytes(AEAD_NONCE_BYTES);
  const bytes = new Uint8Array(Buffer.from(plaintext, "utf8"));
  const object = new Uint8Array([...nonce, ...aeadSeal(dek, nonce, bytes, new Uint8Array(0))]);
  return {
    object: Buffer.from(object).toString("hex"),
    wrapped: Buffer.from(seal(new Uint8Array([...dek, ...salt]), publicKey)).toString("hex"),
    good_commitment: createHash("sha256").update(new Uint8Array([...salt, ...bytes])).digest("hex"),
    sha256: createHash("sha256").update(object).digest("hex"),
  };
}

/**
 * A supervisor at the other end of a worker's channel, without forking: it answers the same three
 * requests `spawn.ts` answers, so `worker/main.ts` can be run end to end in one process. The real
 * fork is covered by `spawn.test.ts`.
 */
export function supervisorHost(
  keys: RoomKeys,
  operator: ReturnType<typeof fakeOperator>,
): {
  process: { on(event: "message", listener: (message: unknown) => void): unknown; send(message: unknown): boolean };
  give(job: RoomJob): void;
} {
  const listeners: ((message: unknown) => void)[] = [];
  const toWorker = (message: unknown): void => {
    for (const listener of listeners) listener(message);
  };
  return {
    process: {
      on(_event, listener) {
        listeners.push(listener);
        return undefined;
      },
      send(raw: unknown): boolean {
        const message = raw as Record<string, unknown>;
        const id = message.id;
        if (message.kind === "sign") {
          toWorker({ kind: "sign", ...signForWorker(keys, { id: id as number, message: message.message as string }) });
          return true;
        }
        if (message.kind === "submit") {
          void operator
            .submit(
              message.method as string,
              message.args as Record<string, unknown>,
              message.contract as "clearing" | "keypolicy",
            )
            .then((value) => toWorker({ kind: "submit", id, ok: true, value }))
            .catch((error: unknown) => toWorker({ kind: "submit", id, error: (error as Error).message }));
          return true;
        }
        const work =
          message.op === "get"
            ? operator.getBlob(message.key as string)
            : operator.putBlob(message.key as string, message.bytes as string).then(() => "");
        void work
          .then((value) => toWorker({ kind: "blob", id, ok: true, value }))
          .catch((error: unknown) => toWorker({ kind: "blob", id, error: (error as Error).message }));
        return true;
      },
    },
    give(job: RoomJob): void {
      toWorker({ kind: "job", job, room_key: Buffer.from(keys.signPk).toString("hex") });
    },
  };
}
