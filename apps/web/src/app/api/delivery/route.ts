/**
 * `GET /api/delivery` (E13.5, D1): the two objects a buyer needs to open their delivery.
 *
 * The opening happens in the browser with `@marginal/sdk`; this exists because the gateway sends no
 * CORS headers and because the delivery's envelope is Borsh, which only `marginal-core` reads. It
 * never sees a key: what it moves is ciphertext the chain already commits to.
 */
import { call } from "@marginal/core-wasm";

import { loadConfig } from "../../../lib/config.server";
import { handleDelivery } from "../../../lib/delivery";

export const GET = (request: Request): Promise<Response> =>
  handleDelivery(call, request, loadConfig().gateway);
