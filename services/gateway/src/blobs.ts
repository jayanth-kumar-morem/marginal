/**
 * The blob store behind the gateway (SDD §3.22; E11.2).
 *
 * Everything in it is either public or already sealed: listing ciphertexts, deliveries,
 * certificates, job logs. The gateway is **untrusted** (§2.7), so the store's job is not
 * confidentiality — it is that an object cannot be swapped for another. Two things do that: an
 * upload needs a **grant** naming the key and the content's SHA-256, and the bytes are rejected
 * unless they hash to it.
 *
 * Grants are HMACs over the grant's own fields, so the gateway holds no upload state and a grant
 * cannot be edited into one for a different object.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { HttpError } from "@marginal/service-common";

/** How long an upload grant is good for. */
export const GRANT_TTL_SECONDS = 900;
/** The largest object the store takes: a size class well above any M1 listing. */
export const MAX_OBJECT_BYTES = 16 * 1024 * 1024;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * Keys are paths the room and the SDK agree on (`certs/{hash}`, `listings/{id}/v{n}/good`). They
 * are checked rather than sanitised: a key with a `..` or a backslash in it is a caller trying
 * something, not a caller to be helped.
 */
export function checkKey(key: string): string {
  if (!/^[a-z0-9][a-z0-9/._-]{0,127}$/.test(key) || key.includes("..")) {
    throw new HttpError(400, "that is not a blob key");
  }
  return key;
}

export interface Grant {
  readonly key: string;
  readonly sha256: string;
  readonly size: number;
  readonly expires: number;
}

/** A store on disk. One file per object, named by the hash of its key. */
export function blobStore(
  directory: string,
  secret: Uint8Array,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): {
  grant(request: unknown): Grant & { token: string };
  put(key: string, token: string, bytes: Buffer): { key: string; sha256: string };
  get(key: string): Buffer;
} {
  mkdirSync(directory, { recursive: true });
  const path = (key: string): string => join(directory, createHash("sha256").update(key).digest("hex"));
  const sign = (grant: Grant): string =>
    createHmac("sha256", secret)
      .update(`${grant.key}\n${grant.sha256}\n${grant.size}\n${grant.expires}`)
      .digest("hex");

  return {
    /** Issues a grant for one object. The client must already know what it is uploading. */
    grant(request: unknown): Grant & { token: string } {
      const asked = request as { key?: unknown; sha256?: unknown; size?: unknown };
      const key = checkKey(typeof asked.key === "string" ? asked.key : "");
      if (typeof asked.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(asked.sha256)) {
        throw new HttpError(400, "sha256 must be 32 bytes of hex");
      }
      if (typeof asked.size !== "number" || !Number.isInteger(asked.size) || asked.size <= 0) {
        throw new HttpError(400, "size must be a positive integer");
      }
      if (asked.size > MAX_OBJECT_BYTES) throw new HttpError(413, "that object is too large");
      const grant: Grant = {
        key,
        sha256: asked.sha256,
        size: asked.size,
        expires: now() + GRANT_TTL_SECONDS,
      };
      return { ...grant, token: sign(grant) };
    },

    /** Stores bytes against a grant, and only if they are the bytes the grant named. */
    put(key: string, token: string, bytes: Buffer): { key: string; sha256: string } {
      const parts = token.split(".");
      const [expires, size, digest, mac] = parts;
      if (parts.length !== 4 || expires === undefined || size === undefined || digest === undefined || mac === undefined) {
        throw new HttpError(400, "that is not an upload token");
      }
      const grant: Grant = {
        key: checkKey(key),
        sha256: digest,
        size: Number(size),
        expires: Number(expires),
      };
      const expected = Buffer.from(sign(grant), "hex");
      const given = Buffer.from(mac, "hex");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new HttpError(403, "that upload token is not for this object");
      }
      if (grant.expires < now()) throw new HttpError(403, "that upload token has expired");
      if (bytes.length !== grant.size) throw new HttpError(400, "that is not the size the grant named");
      if (sha256(bytes) !== grant.sha256) throw new HttpError(400, "those bytes are not the ones the grant named");
      writeFileSync(path(grant.key), bytes);
      return { key: grant.key, sha256: grant.sha256 };
    },

    get(key: string): Buffer {
      try {
        return readFileSync(path(checkKey(key)));
      } catch {
        throw new HttpError(404, "no such object");
      }
    },
  };
}

/** The token a client sends back: the grant's fields, then its MAC. */
export function grantToken(grant: Grant & { token: string }): string {
  return `${grant.expires}.${grant.size}.${grant.sha256}.${grant.token}`;
}
