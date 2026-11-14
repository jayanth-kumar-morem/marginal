/**
 * NEAR AI Cloud judges (SDD §3.16; E9.1).
 *
 * The room asks a private-TEE model for one integer, fetches the provider's signature over its own
 * response, and publishes both. Clearing then re-verifies the receipt itself: it recovers the
 * signer, checks it against the registry for that model, parses the body again, and refuses a
 * receipt whose text it has seen before (E6.2). So the room cannot inflate a factor, and a factor
 * it got wrong is simply worth zero.
 *
 * Every refusal here is a factor of zero rather than an exception: a judge that is down, slow,
 * aliased, or talkative must not stop a job, because a zero resolves to the listing's floor and the
 * buyer still gets an answer (AC-41).
 */
import { call } from "@marginal/core-wasm";

import { SYSTEM_PROMPT, userPrompt } from "./prompt.js";
import type { JudgeFactor, JudgePort, JudgeTask } from "./types.js";

/** NEAR AI's API. */
export const NEAR_AI_BASE = "https://cloud-api.near.ai";
/** The two judges §3.16 names, from different model families. */
export const JUDGE_MODELS = ["Qwen/Qwen3.8-27B", "z-ai/glm-5.3-flash"] as const;
/** Only a signature the provider's own TEE made counts. */
export const ACCEPTED_SIGNATURE_KIND = "provider_tee";
/** One integer is all the answer needs; a small cap also bounds what a talkative model can say. */
export const MAX_TOKENS = 16;

export interface NearAiOptions {
  readonly model: string;
  readonly baseUrl?: string;
  /**
   * How the request leaves the room. In a room this is the supervisor's proxy, which forwards to
   * NEAR AI and adds the API key: **the key never enters the measured image**, because a key baked
   * into the compose file would be published with the measurement, and `allowed_envs: []` means the
   * host cannot pass one in either (§3.14.3).
   */
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** A factor of zero for `model`, with the reason kept for the job log only. */
function refused(model: string, reason: string): JudgeFactor {
  return { model_id: model, factor_bps: 0, proof: { Simulated: { signer: `refused:${reason}` } } };
}

/**
 * Builds the request body. `reasoning_effort: "low"` is for GLM, which reasons by default;
 * `enable_thinking: false` is deliberately **not** sent, because it moves the reasoning into
 * `content` and breaks the strict parse (§3.16).
 */
export function requestBody(model: string, task: JudgeTask): string {
  return JSON.stringify({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt(task) },
    ],
    temperature: 0,
    max_tokens: MAX_TOKENS,
    stream: false,
    reasoning_effort: "low",
  });
}

/** The content of the first choice, or undefined if the answer is not a chat completion. */
export function completionContent(body: string): { id: string; content: string } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const answer = parsed as { id?: unknown; choices?: { message?: { content?: unknown } }[] };
  const content = answer.choices?.[0]?.message?.content;
  if (typeof answer.id !== "string" || typeof content !== "string") return undefined;
  return { id: answer.id, content };
}

export function nearAiJudge(options: NearAiOptions): JudgePort {
  const base = options.baseUrl ?? NEAR_AI_BASE;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // No Authorization header: the proxy adds it. Aliasing would change the signed model id and make
  // the signature the gateway's rather than the model's TEE (§3.16), so it is off on every call.
  const headers = {
    "content-type": "application/json",
    "x-no-aliasing": "true",
    "accept-encoding": "identity",
  };

  return {
    async score(task: JudgeTask): Promise<JudgeFactor> {
      let responseBody: string;
      let completion: { id: string; content: string };
      try {
        const response = await fetchImpl(`${base}/v1/chat/completions`, {
          method: "POST",
          headers,
          body: requestBody(options.model, task),
          signal: AbortSignal.timeout(timeoutMs),
        });
        responseBody = await response.text();
        if (!response.ok) return refused(options.model, `http-${response.status}`);
        const read = completionContent(responseBody);
        if (read === undefined) return refused(options.model, "not-a-completion");
        completion = read;
      } catch {
        return refused(options.model, "unreachable");
      }

      // The strict parse and the reasoning check are `marginal-core`'s, so the room decides exactly
      // what clearing will decide about the same bytes.
      if (call("judge_body_ok", { body: responseBody }) !== true) {
        return refused(options.model, "reasoning-in-body");
      }
      const factor = call("parse_relevance", { body: completion.content }) as number;
      if (factor === 0) return refused(options.model, "unparsed");

      try {
        const signature = await fetchImpl(
          `${base}/v1/signature/${completion.id}?model=${encodeURIComponent(options.model)}&signing_algo=ecdsa`,
          { headers, signal: AbortSignal.timeout(timeoutMs) },
        );
        if (!signature.ok) return refused(options.model, `signature-http-${signature.status}`);
        const receipt = JSON.parse(await signature.text()) as {
          text?: unknown;
          signature?: unknown;
          signature_kind?: unknown;
        };
        if (receipt.signature_kind !== ACCEPTED_SIGNATURE_KIND) {
          return refused(options.model, "not-provider-tee");
        }
        if (typeof receipt.text !== "string" || typeof receipt.signature !== "string") {
          return refused(options.model, "no-signature");
        }
        const sig65 = receipt.signature.replace(/^0x/, "");
        if (!/^[0-9a-f]{130}$/.test(sig65)) return refused(options.model, "bad-signature");
        // Clearing binds the receipt to the body by looking for the body's hash in the signed text;
        // a receipt that does not is worth nothing, so there is no point publishing it.
        if (call("receipt_binds_body", { body: responseBody, text: receipt.text }) !== true) {
          return refused(options.model, "unbound-receipt");
        }
        return {
          model_id: options.model,
          factor_bps: factor,
          proof: { NearAiReceipt: { text: receipt.text, sig65, response_body: responseBody } },
        };
      } catch {
        return refused(options.model, "signature-unreachable");
      }
    },
  };
}
