/**
 * Test support: the doubles the room's ports are tested against, and a real unix-socket guest agent
 * so the dstack client is exercised over a socket rather than a mock. Not part of the room's
 * measured code (excluded from the coverage gate, like every `testing.ts`).
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChainPort, RoomJob } from "./chain.js";
import type { RoomConfig } from "./config.js";
import type { DstackPort, Quote, RawEvent } from "./dstack.js";
import type { OperatorPort } from "./operator.js";

export const CHAIN_ID = "sandbox";
export const CLEARING = "clearing.marginal-demo.testnet";
export const KEYPOLICY = "keypolicy.marginal-demo.testnet";

export function testConfig(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    rpcUrl: "http://127.0.0.1:3030",
    chainId: CHAIN_ID,
    clearing: CLEARING,
    keypolicy: KEYPOLICY,
    roomClass: "Kcpu",
    dstackSocket: "/var/run/dstack.sock",
    operatorUrl: "http://127.0.0.1:8080",
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
  submitted: { method: string; args: Record<string, unknown> }[];
} {
  const port = {
    registered: [] as unknown[],
    submitted: [] as { method: string; args: Record<string, unknown> }[],
    issueNonce(): Promise<string> {
      return Promise.resolve(nonce);
    },
    register(bundle: unknown): Promise<void> {
      port.registered.push(bundle);
      return Promise.resolve();
    },
    submit(method: string, args: Record<string, unknown>): Promise<void> {
      port.submitted.push({ method, args });
      return Promise.resolve();
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
