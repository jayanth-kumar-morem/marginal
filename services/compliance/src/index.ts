/**
 * The compliance service (SDD §3.20, D4, D8; E11.4).
 *
 * It is its own deploy, on purpose. It holds the two keys that can grant something — the issuer key
 * behind nullifier credentials and the compliance key behind payout approvals — and nothing else in
 * the system holds either. Clearing checks both signatures itself, so this service cannot move
 * money; what it can do is refuse.
 *
 * Both of its answers are **signed messages**, not API results: `nullifier_signing_bytes` and
 * `payout_approval_signing_bytes` bind the chain, the contract, the subject and the epoch or route,
 * so a credential cannot be replayed onto another deployment or another listing.
 */
import { createPrivateKey, createPublicKey, sign, randomBytes, createHash, type KeyObject } from "node:crypto";
import type { Server } from "node:http";

import { call } from "@marginal/core-wasm";
import { HttpError, jsonServer, listen, required, type Routes } from "@marginal/service-common";

import { emptySdn, fetchSdn, isListed, REFRESH_SECONDS, type SdnList, type SdnOptions } from "./sdn.js";
import { store, type Store } from "./store.js";

export const PACKAGE = "@marginal/compliance";

export { parseSdn, emptySdn, fetchSdn, isListed, sdnUrlFrom, SDN_URL, REFRESH_SECONDS, type SdnList } from "./sdn.js";
export { store, type Store, type Issued, type Screening } from "./store.js";

/** `"marginal/nullif\0"`, the credential's domain tag. */
export const NULLIFIER_DOMAIN = Buffer.from("marginal/nullif\0", "utf8").toString("hex");
/** `"marginal/payout\0"`. */
export const PAYOUT_DOMAIN = Buffer.from("marginal/payout\0", "utf8").toString("hex");
/** How long a credential is good for, in blocks (about an hour at one second a block). */
export const VALIDITY_BLOCKS = 3_600;

/** An ed25519 key from its raw 32 bytes, which is how a deployment configures one. */
export function issuerKey(seed: Uint8Array): { key: KeyObject; publicKey: string } {
  if (seed.length !== 32) throw new Error("compliance: a key seed is 32 bytes");
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seed)]);
  const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const spki = createPublicKey(key).export({ type: "spki", format: "der" });
  return { key, publicKey: Buffer.from(spki.subarray(spki.length - 32)).toString("hex") };
}

/**
 * The nullifier for a subject on a listing in an epoch: `SHA-256` of the issuer's own secret and
 * those three. It is the same every time for the same inputs — that is the point, it is what stops
 * one person appraising the same listing twice through different accounts — and it cannot be
 * computed by anyone who does not hold the issuer key.
 */
export function nullifierFor(secret: Uint8Array, subject: string, listingId: number, epoch: number): string {
  return createHash("sha256")
    .update(secret)
    .update(`marginal/nullifier/v1\n${subject}\n${listingId}\n${epoch}`)
    .digest("hex");
}

export interface ComplianceOptions {
  readonly chainId: string;
  readonly clearing: string;
  /** The issuer key's 32-byte seed (D4's credentials). */
  readonly issuerSeed: Uint8Array;
  /** The compliance key's seed (payout approvals). A different key, because it grants differently. */
  readonly complianceSeed: Uint8Array;
  /** Who may be issued a credential at all. M1's demo identities (§3.20). */
  readonly allowed: readonly string[];
  readonly sdn?: SdnOptions;
  /** Overridable so a test does not have to wait a day, or reach Treasury. */
  readonly refreshSeconds?: number;
  readonly now?: () => number;
  readonly height?: () => number;
  readonly db?: Store;
  readonly onError?: (error: Error) => void;
}

export interface Compliance {
  readonly server: Server;
  /** The list in use, and its version. */
  list(): SdnList;
  /** Re-reads the SDN list. Called at start and then daily. */
  refresh(): Promise<SdnList>;
  stop(): void;
}

export function compliance(options: ComplianceOptions): Compliance {
  const issuer = issuerKey(options.issuerSeed);
  const complianceSigner = issuerKey(options.complianceSeed);
  const db = options.db ?? store();
  const now = options.now ?? ((): number => Math.floor(Date.now() / 1_000));
  const height = options.height ?? ((): number => 0);
  const allowed = new Set(options.allowed);
  let list = emptySdn();
  let timer: NodeJS.Timeout | undefined;

  const signWith = (signer: { key: KeyObject }, message: string): string =>
    Buffer.from(sign(null, Buffer.from(message, "hex"), signer.key)).toString("hex");

  const routes: Routes = {
    "GET /v1/health": () => ({
      json: {
        ok: true,
        package: PACKAGE,
        issuer_key: issuer.publicKey,
        compliance_key: complianceSigner.publicKey,
        // `demo`, as §3.20 requires: nothing here is a regulated identity service.
        label: "demo",
        list_version: list.version,
        list_entries: list.entries,
      },
    }),

    /**
     * A nullifier credential for a demo identity (D4). The same subject, listing and epoch always
     * gets the same nullifier, so a second request is the same answer rather than a second
     * identity.
     */
    "POST /v1/nullifiers": (request) => {
      const subject = required(request.body, "subject");
      if (!allowed.has(subject)) throw new HttpError(403, "that identity is not allow-listed");
      const body = request.body as { listing_id?: unknown; epoch?: unknown };
      const listingId = Number(body.listing_id);
      const epoch = Number(body.epoch);
      if (!Number.isInteger(listingId) || listingId < 0) throw new HttpError(400, "listing_id is required");
      if (!Number.isInteger(epoch) || epoch < 0) throw new HttpError(400, "epoch is required");

      const nullifier = nullifierFor(options.issuerSeed, subject, listingId, epoch);
      const credential = {
        domain: NULLIFIER_DOMAIN,
        chain_id: options.chainId,
        clearing: options.clearing,
        subject,
        listing_id: listingId,
        epoch,
        nullifier,
        expiry_height: height() + VALIDITY_BLOCKS,
      };
      db.issue({ subject, listingId, epoch, nullifier }, now());
      return {
        json: {
          credential,
          sig: signWith(issuer, call("nullifier_signing_bytes", credential) as string),
        },
      };
    },

    /**
     * A payout approval (D8). A listed address is **blocked**, which is an approval saying so
     * rather than a refusal to answer: clearing records `Blocked` with the screening id and keeps
     * the money claimable, so nothing is seized and the decision is auditable.
     */
    "POST /v1/payout-approvals": (request) => {
      const subject = required(request.body, "subject");
      const routeHash = required(request.body, "route_hash");
      if (!/^[0-9a-f]{64}$/.test(routeHash)) throw new HttpError(400, "route_hash must be 32 bytes of hex");
      const address = (request.body as { address?: unknown }).address;
      if (typeof address !== "string" || address === "") throw new HttpError(400, "address is required");
      if (list.entries === 0) throw new HttpError(503, "the sanctions list has not been read yet");

      const blocked = isListed(list, address);
      const screeningId = Buffer.from(randomBytes(32)).toString("hex");
      const approval = {
        domain: PAYOUT_DOMAIN,
        chain_id: options.chainId,
        clearing: options.clearing,
        subject,
        route_hash: routeHash,
        list_version: list.version,
        screening_id: screeningId,
        blocked,
        expiry_height: height() + VALIDITY_BLOCKS,
      };
      db.record({ subject, routeHash, screeningId, blocked, listVersion: list.version, at: now() });
      return {
        json: {
          approval,
          sig: signWith(complianceSigner, call("payout_approval_signing_bytes", approval) as string),
        },
      };
    },

    /** The decisions made about one subject, for the review log (§3.20). */
    "GET /v1/screenings/*": (request) => ({ json: { screenings: db.screenings(request.rest) } }),
  };

  const server = jsonServer(routes, options.onError);
  const refresh = async (): Promise<SdnList> => {
    list = await fetchSdn(options.sdn);
    return list;
  };
  timer = setInterval(
    () => {
      void refresh().catch((error: unknown) => options.onError?.(error as Error));
    },
    (options.refreshSeconds ?? REFRESH_SECONDS) * 1_000,
  );
  timer.unref();

  return {
    server,
    list: () => list,
    refresh,
    stop(): void {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      db.close();
    },
  };
}

/** Starts the service, reads the list once, and reports the port. */
export async function serve(
  options: ComplianceOptions,
  port: number,
): Promise<Compliance & { port: number }> {
  const service = compliance(options);
  await service.refresh();
  return { ...service, port: await listen(service.server, port) };
}
