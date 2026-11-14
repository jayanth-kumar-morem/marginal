/**
 * The dstack guest agent (SDD §3.13 step 5): where a room asks for its TDX quote and the RTMR3
 * event log that replays to it.
 *
 * It speaks JSON over a unix socket at `/var/run/dstack.sock`. This is a direct client rather than
 * `@phala/dstack-sdk`, because the room needs exactly one call and node's own HTTP client already
 * frames a request over a socket; one dependency fewer inside the TEE is one fewer thing to audit.
 * The wire shape is dstack's v0 `GetQuote`: `{report_data: hex}` in, `{quote: hex, event_log: json}`
 * out (dstack `sdk/rust/types/src/dstack_v0.rs`, `guest-agent/src/backend.rs`).
 */
import { request } from "node:http";

/** What the agent answers, decoded. */
export interface Quote {
  /** The TDX quote, as bytes. */
  readonly quote: Uint8Array;
  /** The RTMR3 event log, as the agent reported it (hex payloads, decimal types). */
  readonly eventLog: readonly RawEvent[];
}

/** One event log entry, exactly as the agent writes it. */
export interface RawEvent {
  readonly imr: number;
  readonly event_type: number;
  readonly digest: string;
  readonly event: string;
  readonly event_payload: string;
}

/** What the room needs from the guest agent, so a test can stand in for it. */
export interface DstackPort {
  getQuote(reportData: Uint8Array): Promise<Quote>;
}

export interface DstackOptions {
  readonly socketPath: string;
  /**
   * The agent's route. dstack mounts its v0 surface at `/prpc/` and trims the `Tappd.` prefix, so
   * `/prpc/GetQuote` and `/prpc/Tappd.GetQuote` reach the same method.
   */
  readonly path?: string;
  readonly timeoutMs?: number;
}

const DEFAULT_PATH = "/prpc/GetQuote";
const DEFAULT_TIMEOUT_MS = 30_000;

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Whether the agent answered with something other than a 2xx.
 *
 * `statusCode` is typed `number | undefined` because node shares the type with server-side
 * requests; on a client response it is always set, so `undefined` would mean an answer with no
 * status line at all. Either way it is not an answer the room can use.
 */
export function isHttpError(status: number | undefined): boolean {
  return status === undefined || status < 200 || status >= 300;
}

/** Refuses anything that is not the log shape the contracts replay (SDD §3.13). */
function parseQuote(body: string): Quote {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null) throw new Error("dstack: not an object");
  const { quote, event_log: eventLog, error } = parsed as Record<string, unknown>;
  if (typeof error === "string") throw new Error(`dstack: ${error}`);
  if (typeof quote !== "string" || quote === "") throw new Error("dstack: no quote");
  if (typeof eventLog !== "string") throw new Error("dstack: no event log");
  const events: unknown = JSON.parse(eventLog);
  if (!Array.isArray(events)) throw new Error("dstack: the event log is not a list");
  return {
    quote: new Uint8Array(Buffer.from(quote.replace(/^0x/, ""), "hex")),
    eventLog: events as RawEvent[],
  };
}

/** The real client, over the guest agent's socket. */
export function dstackClient(options: DstackOptions): DstackPort {
  const path = options.path ?? DEFAULT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    getQuote(reportData: Uint8Array): Promise<Quote> {
      if (reportData.length !== 64) {
        return Promise.reject(new Error("report data must be 64 bytes"));
      }
      const payload = JSON.stringify({ report_data: hex(reportData) });
      return new Promise<Quote>((resolve, reject) => {
        const req = request(
          {
            socketPath: options.socketPath,
            path,
            method: "POST",
            headers: {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf8");
              const status = res.statusCode;
              if (isHttpError(status)) {
                reject(new Error(`dstack: HTTP ${status}: ${body.slice(0, 200)}`));
                return;
              }
              try {
                resolve(parseQuote(body));
              } catch (error) {
                reject(error as Error);
              }
            });
          },
        );
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error("dstack: timed out"));
        });
        req.on("error", reject);
        req.end(payload);
      });
    },
  };
}
