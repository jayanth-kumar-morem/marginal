/**
 * The buyer's decrypt-and-check (SDD §3.19, D1, DRC-1; E13.5).
 *
 * This is the last step of a deal and the one a viewer should not have to take on trust: the room
 * delivered a key sealed to the buyer, and the buyer opens the listing's ciphertext with it and
 * confirms that what came out is the good the contract committed to. Both halves are the point —
 * decrypting proves the key was delivered, and the commitment proves it is the good that was
 * appraised and sold rather than another document.
 *
 * The opening itself is `@marginal/sdk`'s, in the browser. What is here is the part that needs a
 * server: fetching two objects from the gateway (which sends no CORS headers, and which this app's
 * CSP deliberately forbids the browser from reaching) and decoding the delivery's Borsh with
 * `marginal-core` (which loads its wasm through `node:fs`). Neither of those sees a key or a
 * plaintext: one moves ciphertext, the other reads a public envelope.
 */
import type { CoreCall } from "./appraise";
import { errorCode, type Fetch } from "./chain";

/** Where the room writes a job's delivery (`room/src/worker/appraisal.ts`). */
export function deliveryKey(jobId: number): string {
  return `deliveries/${jobId}`;
}

/** Where a listing version's sealed good lives (`room/src/worker/context.ts`'s `goodKey`). */
export function goodKey(listingId: number, version: number): string {
  return `listings/${listingId}/v${version}/good`;
}

function answer(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Reads one object from the gateway, as hex, or says which service did not answer. */
export async function getObject(
  gateway: string,
  key: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<string> {
  const response = await fetchImpl(`${gateway}/v1/blob/${key}`);
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `the gateway has no object at ${key}`
        : `the gateway answered ${response.status} for ${key}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What the browser needs to open a delivery, none of it secret. */
export interface DeliveryBundle {
  /** The `DeliveryV1`, decoded from its Borsh by `marginal-core`. */
  readonly delivery: unknown;
  /** The listing's sealed object, hex. */
  readonly objectHex: string;
}

/**
 * `GET /api/delivery?job=<id>&listing=<id>&version=<n>` — the two objects and the decoded envelope.
 *
 * It is a GET with no body because nothing about it is secret: a delivery entry is sealed to a key
 * only the buyer holds, and the good's object is the ciphertext the chain already commits to. The
 * browser does the opening.
 */
export async function handleDelivery(
  call: CoreCall,
  request: Request,
  gateway: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const job = Number(url.searchParams.get("job"));
  const listing = Number(url.searchParams.get("listing"));
  const version = Number(url.searchParams.get("version"));
  if (![job, listing, version].every((value) => Number.isInteger(value) && value >= 1)) {
    return answer({ error: "a job, a listing and a version are needed, all positive integers" }, 400);
  }
  try {
    const [deliveryHex, objectHex] = await Promise.all([
      getObject(gateway, deliveryKey(job), fetchImpl),
      getObject(gateway, goodKey(listing, version), fetchImpl),
    ]);
    // The envelope is Borsh: who it is addressed to and the ephemeral key, nothing secret.
    const delivery = call("delivery_decode", { bytes: deliveryHex });
    return answer({ ok: { delivery, objectHex } satisfies DeliveryBundle });
  } catch (error: unknown) {
    return answer({ error: errorCode(error) }, 502);
  }
}
