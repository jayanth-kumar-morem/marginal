/**
 * The HTTP plumbing the three host services share (SDD §2.7, §3.22; E11).
 *
 * One implementation, because three copies of request routing would drift and these services sit on
 * the trust boundary: the gateway and the operator agent are **untrusted** (§2.7), so what matters
 * is that every answer is shaped, every failure is a status rather than a stack trace, and no
 * handler can leak an internal message by accident.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** A failure with a status. Anything else a handler throws becomes a 500 with no detail. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface Request {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  /** The parsed JSON body, or null when there was none. */
  readonly body: unknown;
  /** The raw body, for a content-addressed upload. */
  readonly bytes: Buffer;
  readonly headers: Record<string, string | undefined>;
  /** What matched a `/*` route's tail. */
  readonly rest: string;
}

export interface Reply {
  readonly status?: number;
  readonly json?: unknown;
  readonly bytes?: Buffer;
  readonly contentType?: string;
}

export type Handler = (request: Request) => Promise<Reply> | Reply;
/** Routes are `"METHOD /path"`, optionally ending in `/*` to match a tail. */
export type Routes = Record<string, Handler>;

/** The most a request body may be: everything here is small, and a blob has its own limit. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** The method and path of a request, with node's "it could be missing" cases given a value. */
export function requestLine(
  method: string | undefined,
  url: string | undefined,
): { method: string; path: string; query: URLSearchParams } {
  const parsed = new URL(url === undefined ? "/" : url, "http://service");
  return {
    method: method === undefined ? "GET" : method,
    path: parsed.pathname,
    query: parsed.searchParams,
  };
}

/** A route table, parsed once: `"METHOD /path"`, with a trailing `/*` matching a tail. */
export function parseRoutes(routes: Routes): { method: string; pattern: string; handler: Handler }[] {
  return Object.entries(routes).flatMap(([route, handler]) => {
    const space = route.indexOf(" ");
    // A key without a method is a mistake in the table, not something to guess at.
    if (space <= 0) return [];
    return [{ method: route.slice(0, space), pattern: route.slice(space + 1), handler }];
  });
}

export function match(
  parsed: readonly { method: string; pattern: string; handler: Handler }[],
  method: string,
  path: string,
): { handler: Handler; rest: string } | undefined {
  for (const route of parsed) {
    if (route.method !== method) continue;
    if (route.pattern === path) return { handler: route.handler, rest: "" };
  }
  for (const route of parsed) {
    if (route.method !== method || !route.pattern.endsWith("/*")) continue;
    const prefix = route.pattern.slice(0, -1);
    if (path.startsWith(prefix)) return { handler: route.handler, rest: path.slice(prefix.length) };
  }
  return undefined;
}

async function read(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "the body is too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, reply: Reply): void {
  const status = reply.status ?? 200;
  if (reply.bytes !== undefined) {
    response.writeHead(status, {
      "content-type": reply.contentType ?? "application/octet-stream",
      "content-length": reply.bytes.length,
    });
    response.end(reply.bytes);
    return;
  }
  const body = JSON.stringify(reply.json ?? {});
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

/**
 * Builds a server from a route table. `onError` sees what went wrong, so a service can log it
 * without the client ever being told more than a status.
 */
export function jsonServer(routes: Routes, onError: (error: Error) => void = () => {}): Server {
  const parsed = parseRoutes(routes);
  return createServer((incoming, response) => {
    void (async (): Promise<void> => {
      try {
        const line = requestLine(incoming.method, incoming.url);
        const found = match(parsed, line.method, line.path);
        if (found === undefined) {
          send(response, { status: 404, json: { error: "no such route" } });
          return;
        }
        const bytes = await read(incoming);
        let body: unknown = null;
        if (bytes.length > 0 && (incoming.headers["content-type"] ?? "").includes("json")) {
          try {
            body = JSON.parse(bytes.toString("utf8"));
          } catch {
            throw new HttpError(400, "the body is not JSON");
          }
        }
        send(
          response,
          await found.handler({
            method: line.method,
            path: line.path,
            query: line.query,
            body,
            bytes,
            headers: incoming.headers as Record<string, string | undefined>,
            rest: found.rest,
          }),
        );
      } catch (error) {
        if (error instanceof HttpError) {
          send(response, { status: error.status, json: { error: error.message } });
          return;
        }
        // Never a stack trace and never a message: an untrusted caller learns only that it failed.
        onError(error as Error);
        send(response, { status: 500, json: { error: "internal error" } });
      }
    })();
  });
}

/** Starts a server and reports the port it got, so a test can use port 0. */
export async function listen(server: Server, port: number, host = "127.0.0.1"): Promise<number> {
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  // A server that has just started listening on TCP always reports an address object.
  return (server.address() as AddressInfo).port;
}

/** Reads a JSON field a request must have. */
export function required(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (typeof value !== "string" || value === "") throw new HttpError(400, `${field} is required`);
  return value;
}

/**
 * Turns an error into a log line. A service's own failures are worth seeing; a caller is told only
 * a status (`jsonServer` above), so this is where the detail goes.
 */
export function reporter(log: (line: string) => void): (error: Error) => void {
  return (error) => log(`error ${error.message}`);
}

/** The port a service should listen on, from the environment or its own default. */
export function portFrom(env: NodeJS.ProcessEnv, fallback: number): number {
  const given = env.PORT;
  if (given === undefined || given.trim() === "") return fallback;
  const port = Number(given);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("PORT is not a port");
  return port;
}

/**
 * The address to bind to. **The default is loopback on purpose**: a service started on a laptop
 * should not appear on the network. A container is the exception — inside one, `127.0.0.1` is the
 * *container's* loopback, so a published port has nothing to forward to and the service is
 * unreachable from the host while logging that it started. `deploy/services/docker-compose.yaml`
 * therefore sets `MARGINAL_BIND=0.0.0.0`, where "all interfaces" means the container's.
 */
export function bindFrom(env: NodeJS.ProcessEnv, fallback = "127.0.0.1"): string {
  const given = env.MARGINAL_BIND;
  if (given === undefined || given.trim() === "") return fallback;
  return given.trim();
}

/** A value a service cannot start without. */
export function fromEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value.trim();
}

/**
 * An optional value, where **blank means absent**.
 *
 * `env[name] !== undefined` is the wrong question. An `.env` file writes an unset variable as
 * `NAME=`, and docker compose substitutes a missing one as the empty string, so a service that
 * tests for `undefined` reads "set" where the operator set nothing. That is not hypothetical: the
 * operator agent reported `judges live` and would have called NEAR AI with an empty key, because
 * `MARGINAL_NEARAI_KEY=` is in the generated env file. Blank is absent, everywhere.
 */
export function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** A comma-separated list from the environment, with no empty entries. */
export function listFrom(env: NodeJS.ProcessEnv, name: string): string[] {
  const given = env[name];
  if (given === undefined) return [];
  return given.split(",").map((item) => item.trim()).filter((item) => item !== "");
}

/** Where a service writes a line when nobody says otherwise. */
export function stdout(line: string): void {
  process.stdout.write(`${line}\n`);
}
