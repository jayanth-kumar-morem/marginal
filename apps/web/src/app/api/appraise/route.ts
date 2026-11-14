/**
 * `POST /api/appraise` (E13.4): the quote the buyer sees and the Borsh argument they sign.
 *
 * `@marginal/core-wasm` loads `core.wasm` with `node:fs`, so `max_debit`, `fund`,
 * `validate_request` and `appraisal_request_encode` cannot run in the browser — and nothing may
 * re-implement them there. This handler is the whole of the server side: it hands the core's `call`
 * to `handle`, which holds every branch and is tested directly.
 */
import { call } from "@marginal/core-wasm";

import { handle } from "../../../lib/appraise";

export const POST = (request: Request): Promise<Response> => handle(call, request);
