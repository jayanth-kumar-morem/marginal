/**
 * Quote collateral (SDD §3.13 step 6; E11.3).
 *
 * KeyPolicy's locked verifier needs the Intel collateral that proves the quote's certificate chain:
 * the TCB info, the QE identity and their CRLs. The room cannot fetch it — it has no route to
 * Intel and no business having one — so the agent does, through `dcap-qvl`, which knows how to ask
 * Phala's PCCS for exactly the pieces a quote needs.
 *
 * The agent is untrusted here too, and it does not matter: collateral it tampered with would make
 * the verifier refuse the quote, and the room's own pre-flight catches that before any gas is spent.
 */
import { execFile } from "node:child_process";

import { HttpError } from "@marginal/service-common";

/** Phala's PCCS, which `dcap-qvl` reads by default. */
export const PCCS_URL = "https://pccs.phala.network/tdx/certification/v4";

/** The collateral, in the shape `register_room_encode` takes. */
export type Collateral = Record<string, string | null>;

export interface CollateralOptions {
  /** The `dcap-qvl` binary. It is not bundled: the agent runs on the host, not in the room. */
  readonly command?: string;
  readonly pccsUrl?: string;
  readonly timeoutMs?: number;
}

/**
 * Fetches collateral for a quote. `dcap-qvl collateral --quote-hex <hex>` prints it as JSON.
 *
 * A missing binary is a 503 naming it rather than a 500: the operator has to install it, and the
 * message should say so.
 */
export async function fetchCollateral(
  quoteHex: string,
  options: CollateralOptions = {},
): Promise<Collateral> {
  if (!/^([0-9a-f]{2})+$/.test(quoteHex)) throw new HttpError(400, "the quote is not hex");
  const command = options.command ?? "dcap-qvl";
  const printed = await new Promise<string>((resolve, reject) => {
    execFile(
      command,
      ["collateral", "--quote-hex", quoteHex],
      {
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { PCCS_URL: options.pccsUrl ?? PCCS_URL },
      },
      (error, stdout) => {
        if (error !== null) {
          reject(new HttpError(503, `${command} could not fetch collateral`));
          return;
        }
        resolve(stdout);
      },
    );
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(printed);
  } catch {
    throw new HttpError(503, `${command} did not print JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new HttpError(503, `${command} did not print collateral`);
  }
  return parsed as Collateral;
}
