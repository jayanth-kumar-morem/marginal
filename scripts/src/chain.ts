// Small chain helpers shared by the deploy code and the tests.
import type { JsonRpcProvider, SerializedReturnValue } from "near-api-js";
import { AccountDoesNotExistError } from "near-api-js/rpc-errors";

export const TERA = 10n ** 12n;
export const NEAR = 10n ** 24n;

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
