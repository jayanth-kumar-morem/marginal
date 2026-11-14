/**
 * `POST /api/blob` (E13.2): the seller's upload, proxied to the gateway.
 *
 * The browser cannot talk to the gateway itself — it answers with no CORS headers, and this app's
 * CSP allows `connect-src 'self'` precisely so a page holding a seller's plaintext cannot reach
 * anywhere else (`next.config.ts`). So the two-step upload runs here, one hop from the browser,
 * against the gateway the manifest names. What is uploaded is already sealed; the gateway stays
 * untrusted either way, because the chain commits to the hash of these bytes (SDD §2.7, §3.22).
 *
 * The body is {@link handleBlob}, which is tested directly against a fake gateway.
 */
import { loadConfig } from "../../../lib/config.server";
import { handleBlob } from "../../../lib/sell";

export const POST = (request: Request): Promise<Response> =>
  handleBlob(request, loadConfig().gateway);
