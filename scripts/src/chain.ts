// Small chain helpers shared by the deploy code, the demo scripts and the tests.
import type { JsonRpcProvider, SerializedReturnValue } from "near-api-js";
import { AccountDoesNotExistError } from "near-api-js/rpc-errors";
import { call } from "@marginal/core-wasm";

export const TERA = 10n ** 12n;
export const NEAR = 10n ** 24n;

/**
 * `marginal-core`'s Borsh of `value`, as the base64 a `Base64VecU8` argument takes. The layout is
 * the core's and only the core's: `op` is one of its `*_encode` operations, which return hex.
 */
export function borshBase64(op: string, value: unknown): string {
  return Buffer.from(call(op, value) as string, "hex").toString("base64");
}

/**
 * A failed call or view reduced to the contract's own error code.
 *
 * `fail()` in the contracts is `env::panic_str(error.code())`, which near-api-js surfaces as
 * "Contract panicked: E_BUDGET_EXHAUSTED" and the RPC as "Smart contract panicked: …". A demo
 * script has to tell one refusal from another, so the code — not the prose around it — is what it
 * matches on. Anything without a code comes back whole, so nothing is hidden.
 */
export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(E_[A-Z0-9_]+)\b/.exec(message)?.[1] ?? message;
}

/** Calls a view method and returns its decoded result. */
export const view = <T extends SerializedReturnValue>(provider: JsonRpcProvider, contractId: string, method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction<T>({ contractId, method, args }) as Promise<T>;

/** True if the account exists. Any other failure (network, RPC) throws: it must not read as "free". */
export async function accountExists(provider: JsonRpcProvider, id: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId: id });
    return true;
  } catch (e) {
    if (e instanceof AccountDoesNotExistError) return false;
    throw e;
  }
}
