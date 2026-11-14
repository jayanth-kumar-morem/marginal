/**
 * `POST /api/encode` (E13.2, part of E12.1): the one way this app turns JSON into the Borsh bytes a
 * contract argument carries.
 *
 * `@marginal/core-wasm` loads `core.wasm` with `node:fs`, so `listing_spec_encode`,
 * `publish_spec_encode` and `validate_spec` cannot run in the browser — and nothing is allowed to
 * re-implement a Borsh layout or a hash there (CLAUDE.md). The handler itself is
 * {@link handleEncode}, which holds every branch and is tested directly; this file only hands it
 * the core.
 */
import { call } from "@marginal/core-wasm";

import { handleEncode } from "../../../lib/sell";

export const POST = (request: Request): Promise<Response> => handleEncode(call, request);
