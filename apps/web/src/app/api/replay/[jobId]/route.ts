/**
 * `GET /api/replay/:jobId` — one settlement, re-checked from public chain data (D2, E13.5, E13.6).
 *
 * The work is `@marginal/replay-ts`'s, and it runs here rather than in the browser for one reason:
 * it uses `marginal-core` itself, which is a wasm module loaded with `node:fs`. Running the same
 * verifier the gateway runs means a reader can get the same answer from either, and neither can
 * quietly disagree with the contract.
 */
import { replayer, type Report } from "@marginal/replay-ts";

// Relative, not `@/lib/…`: the coverage gate runs these tests with node from the repository root,
// where tsx has no tsconfig to read the path alias from.
import { chainClient, errorCode } from "../../../../lib/chain";
import { loadConfig } from "../../../../lib/config.server";

/** Answers a replay, or says why it could not. Exported so a test can call it with a `Request`. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await context.params;
  const id = Number(jobId);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: `${jobId} is not a job id` }, { status: 400 });
  }
  try {
    // Inside the try: a deployment with no manifest and no environment is a 502 like any other
    // reason the chain cannot be read, not a crashed route.
    const config = loadConfig();
    const report: Report = await replayer(chainClient(config.rpcUrl), config.clearing)(id);
    return Response.json(report);
  } catch (error) {
    // An unreachable chain is not a failed check: there is nothing to report either way.
    return Response.json({ error: errorCode(error) }, { status: 502 });
  }
}
