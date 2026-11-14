/**
 * `@marginal/service-common`: the HTTP plumbing the gateway, the operator agent and the compliance
 * service share (SDD §2.7; E11). It holds no policy of its own.
 */
export const PACKAGE = "@marginal/service-common";

export {
  HttpError,
  jsonServer,
  listen,
  match,
  parseRoutes,
  requestLine,
  reporter,
  portFrom,
  fromEnv,
  listFrom,
  stdout,
  required,
  MAX_BODY_BYTES,
  type Handler,
  type Reply,
  type Request,
  type Routes,
} from "./http.js";
