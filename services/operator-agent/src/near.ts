/**
 * The agent's one route to the chain (SDD §3.13, §2.7; E11.3).
 *
 * The agent is **untrusted**: it pays gas and carries bytes, and every byte it carries is signed by
 * the room and bound to a chain, a contract and a job. So the worst it can do is not relay
 * something. That is why its key is a funded function-call key and not a full-access one, and why
 * this module can be as thin as it is.
 */
import { Account, JsonRpcProvider, actions, type KeyPairString, type SerializedReturnValue } from "near-api-js";

/** What the agent needs of a chain, so a test can stand in for one. */
export interface Relay {
  view<T>(contract: string, method: string, args: Record<string, unknown>): Promise<T>;
  /** Calls a method and returns its value, as JSON when it is JSON. */
  call(
    contract: string,
    method: string,
    args: Record<string, unknown>,
    gas: bigint,
    deposit: bigint,
  ): Promise<unknown>;
}

const TERA = 10n ** 12n;
/** Registration verifies a quote (200 TGas) and its callback; §3.13 attaches about 300 in total. */
export const REGISTER_GAS = 300n * TERA;
/** Everything else the room asks for fits well inside this. */
export const DEFAULT_GAS = 100n * TERA;

function valueOf(outcome: { status: unknown }): unknown {
  const status = outcome.status as { SuccessValue?: unknown };
  if (typeof status.SuccessValue !== "string") return null;
  const bytes = Buffer.from(status.SuccessValue, "base64").toString("utf8");
  if (bytes === "") return null;
  try {
    return JSON.parse(bytes);
  } catch {
    // A contract may return a bare string; that is still an answer.
    return bytes;
  }
}

/** The real relay: one account, one provider. */
export function nearRelay(rpcUrl: string, accountId: string, key: KeyPairString): Relay {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const account = new Account(accountId, provider, key);
  return {
    view<T>(contract: string, method: string, args: Record<string, unknown>): Promise<T> {
      return provider.callFunction<SerializedReturnValue>({
        contractId: contract,
        method,
        args,
      }) as Promise<T>;
    },
    async call(
      contract: string,
      method: string,
      args: Record<string, unknown>,
      gas: bigint,
      deposit: bigint,
    ): Promise<unknown> {
      const outcome = await account.signAndSendTransaction({
        receiverId: contract,
        actions: [actions.functionCall(method, args, gas, deposit)],
        waitUntil: "FINAL",
      });
      return valueOf(outcome as { status: unknown });
    },
  };
}

export { valueOf as transactionValue };
