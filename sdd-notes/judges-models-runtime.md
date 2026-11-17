# Judges, room models and room runtime: research for OI-7, OI-15, OI-9

Compiled 2026-11-12 for SDD.md §11. Live data was fetched 2026-11-11 between 19:00 and 20:30 UTC.

**Scope.**
- OI-7: NEAR AI Cloud judges.
- OI-15: v1 embedder and NLI model; benchmark against NovAScore.
- OI-9: keep the room worker in TypeScript, or port it to Rust.

**Builds on.**
- `spec-notes/near-primitives.md` (A6, B1, row 16): receipt format, quote layout, incident summary, tier counts.
- `spec-notes/ml-papers.md`: NovAScore abstract, judge-attack papers.
- Those notes are not repeated here. Where this file corrects or extends them, it says so.

**Source labels.**
- **PRIMARY**: official docs, model cards, papers, the vendor's own GitHub repos, or live API output.
- **SECONDARY**: press or third-party pages.
- **UNVERIFIED**: could not be checked.
- **DERIVED**: my own calculation from primary data.

**Rules followed.**
- No API key was used. The only NEAR AI calls were public unauthenticated GETs: `/v1/models` and `/v1/attestation/report`.
- Public repos were cloned read-only and their code was never run.
- Lockfiles were resolved with `npm --package-lock-only --ignore-scripts` and `cargo generate-lockfile`. Nothing was built.

---

## 0. Status at a glance

| Item | Status | One-line answer |
|---|---|---|
| OI-7.1 Catalogue and judge pick | **Resolved** (pending spike S-J) | Judges: `Qwen/Qwen3.8-27B` (Qwen) and `z-ai/glm-5.3-flash` (GLM). Fallback: `deepseek-ai/DeepSeek-V4.1-Flash-1017` (DeepSeek; on a different CVM and engine). No gpt-oss, Llama or Gemma is in the Private TEE tier today. |
| OI-7.2 Verification APIs and key rotation | **Resolved** | Signing keys come from dstack KMS by model name. They are stable across restarts and shared by all instances, so they do **not** rotate on restart (this corrects the earlier prototype). A signer address does not pin a measurement. |
| OI-7.3 Parameters, determinism, limits, terms | **Partially resolved** | `temperature`, `seed`, `max_tokens` and structured outputs are supported per model. Outputs are not bitwise deterministic (batching, speculative decoding, FP8/W4 quantisation). Rate limit is 64 concurrent requests per model per org by default. No prompt-retention period is published. |
| OI-7.4 SGLang incident | **Resolved** (to 2026-11-11) | NEAR AI's own repos show an SSRF through OHTTP inner requests into unauthenticated SGLang admin endpoints. The proxy was fixed 11-08; engine-level CVEs were still open on the GLM fork on 11-11, and an upgrade to SGLang v0.5.23 was in progress. |
| OI-15 Embedder and NLI | **Partially resolved; needs the benchmark spike** | Shortlist `bge-small-en-v1.5` (default) and `bge-base-en-v1.5`. NLI: `cross-encoder/nli-deberta-v3-xsmall` (HDP) or `-base` (v1). Thresholds must be recalibrated per model. NovAScore code is still unreleased. |
| OI-9 TS vs Rust | **Resolved as a recommendation** | Keep TS (hardened) for the hackathon. Port the worker and key custody to one Rust binary before the v1 audit. |

---

## 1. OI-7: NEAR AI Cloud judges

### 1.1 Catalogue (live, 2026-11-11)

**Sources** (all PRIMARY):
- `GET https://cloud-api.near.ai/v1/models`: public, no key, 63 models.
- `https://near.ai/models`: "Showing 63 of 63 models", with 13 Private TEE, 4 Private 3P TEE and 46 Incognito.
- `https://docs.near.ai/cloud/models.md`.

**Naming drift.** The docs call the tier "Confidential TEE". The catalogue page labels it "Private TEE".

**Tier semantics** (docs/cloud/models.md):
- **Confidential/Private TEE** models run on NEAR AI's own GPU fleet in TEEs. They support attestation, signatures and verification.
- **3P Confidential TEE** ("Attested 3P") runs in a third party's TEE. Model-level verification depends on the SDK: the JS SDK verifies Chutes, the Python SDK verifies the gateway only.
- **Incognito** is proxied through the gateway TEE to OpenAI, Anthropic, Google and others. "the TEE privacy and verifiability guarantees do not extend to the upstream provider."

**Private TEE text LLMs** (the judge candidates):

| Canonical ID (`/v1/models`) | Family | Arch / quant (serving config) | Context | $/M in | $/M out | Sampling params listed | Features listed | Engine (attested compose) | CVM instance | ECDSA signer (2026-11-11 19:18 UTC) |
|---|---|---|---|---|---|---|---|---|---|---|
| `Qwen/Qwen3.8-27B` | Qwen | Dense, FP8 (`Qwen/Qwen3.8-27B-FP8` rev `017b9c7…`) | 262,144 | 0.04 | 1.35 | temperature, top_p, top_k, max_tokens, stop, seed | tools, structured_outputs, reasoning | SGLang, `lmsysorg/sglang@sha256:febfb971…`, TP1 | `a8a25faa…` ("small-models") | `0x835ab53d20294ef795906dff21ae4c045336aa26` |
| `Qwen/Qwen3.6-35B-A3B-FP8` | Qwen | MoE (about 3B active), FP8 | 262,144 | 0.17 | 1.10 | + min_p, penalties, logit_bias | tools, json_mode, structured_outputs, logprobs, reasoning | SGLang `v0.5.16-cu129` | `a8a25faa…` | `0xfdbd7952498b333206f360d71d97a1e0961e8ddf` |
| `z-ai/glm-5.3-flash` | GLM (Z.ai) | MoE, W4AFP8 community quant `graphistry/GLM-5.3-Flash-W4AFP8`, EAGLE speculative decoding, 2 replicas | 1,048,576 | 0.08 | 0.50 | temperature, top_p, top_k, min_p, penalties, max_tokens, stop, seed, logit_bias | tools, structured_outputs, reasoning, json_mode | SGLang fork, `nearaidev/sglang@sha256:da8d4e4b…` ("v12") | `a8a25faa…` | `0x3b753b4406613c5e70ae640508632b600424fa0c` |
| `deepseek-ai/DeepSeek-V4.1-Flash-1017` | DeepSeek | W4A8; vLLM fork (`vllm0320`), PPCIe, "dspark" speculative decoding | 1,048,576 | 0.30 | 1.20 | **none listed** | tools, reasoning | vLLM fork, `nearaidev/vllm@sha256:5eaa0d46…` | `fccd496a…` (separate) | `0xfe0071895500a9755c18044948ab4f4e1a7f337e` |
| `Qwen/Qwen3-VL-30B-A3B-Instruct` | Qwen | MoE, FP8 | 16,384 | 0.15 | 0.55 | many | structured_outputs, logprobs | vLLM | `a8a25faa…` | — |
| `*-abliterated` (Qwen3.8, DeepSeek) | — | Same engines; a LoRA with refusals removed (the DeepSeek one is a third-party HF LoRA) | — | same | same | — | — | Shared with the base model | — | **Exclude** |
| `levanto/sage-2` | Levanto | "decision model", `/v1/systemone`, outputs probabilities | 32,768 | 0.07 | 2.00 | — | — | NEAR-hosted ("sage" service) | — | Signature support UNVERIFIED |

**Other Private TEE models (not judges).**
- `Qwen/Qwen3-Embedding-0.6B` and `Qwen3-Reranker-0.6B`: $0.01/M.
- `openai/whisper-large-v3`, `openai/privacy-filter`.
- `black-forest-labs/FLUX.2-klein-4B`.

**Private 3P TEE (Chutes).** These are not suitable because model-level signatures are gateway-signed.
- `deepseek/deepseek-v3.2`: $1.10/$1.10.
- `moonshotai/kimi-k2.6`: $0.81/$3.85.
- `moonshotai/kimi-k3`: $3.30/$16.50.
- `z-ai/glm-5.3`: $1.80/$5.75.

**Families absent from the Private TEE tier.**
- gpt-oss, Llama and Gemma are not there.
- `openai/gpt-oss-120b` still appears in `docs/cloud/reasoning-models.md` but not in the live catalogue. It is probably deprecated (UNVERIFIED).

**Where the engine, instance and signer columns come from** (PRIMARY):
- My own public `GET /v1/attestation/report?model=…&provider=near&signing_algo=ecdsa&nonce=<random>` with `x-no-aliasing: true`.
- The `compose_manager_attestation` action log inside it.
- The public repo `nearai/cvm-compose-files`. The attested `file_sha256` of the latest `prod/small-models.yaml` deployment (`f5455af6…`, tag v0.0.556, 2026-11-11T00:13Z) **matches** the public file byte for byte. So does the DeepSeek file (`fe8407db…`).

**Notable infrastructure facts** (PRIMARY, from the reports and compose files):
1. **Qwen3.8-27B, Qwen3.6-35B, GLM-5.3-Flash, Qwen3-VL, FLUX, the embedding and reranker models, Whisper and Privacy Filter all share one 8×GPU CVM.**
   - They have the same `instance_id a8a25faab3ef…` and `compose_hash e8416a02…`.
   - `vm_config` shows 8 GPUs, 64 vCPU and 2 TiB RAM.
   - DeepSeek V4.1 Flash runs on a different instance (`fccd496a…`) but has the **same `app_id 2c0a0c96…`**.
2. **Measured configuration vs runtime workloads.**
   - The measured `app_compose` (MRCONFIGID/RTMR3) holds only a launcher (`nearaidev/compose-manager-launcher`) plus sidecars (OpenTelemetry collector, certbot).
   - The model workloads are started **at runtime** by `compose-manager` from a git tag and commit of `cvm-compose-files`.
   - Each action is recorded in `compose_manager_attestation.actions[]`, with its own quote whose `report_data = actions_hash ‖ nonce`. The GLM report holds 151 actions since 2026-10-21.
   - **Consequence: verifying the MRCONFIGID alone does not tell you which engine image serves the model.** You must replay the action log and map `file_sha256` to the public compose file.
3. **Telemetry.**
   - Engine containers carry Datadog/Loki log labels.
   - The Qwen3.8 engine runs with `--log-requests-level 0`. The GLM labels say `request_logging:disabled`.
   - `cloud-api`'s CLAUDE.md rule: never log "credentials and customer content" (PRIMARY, engineering policy only, not a contract).

### 1.2 Judge pick (two families, JSON-only grader)

**Judge A: `Qwen/Qwen3.8-27B`**
- Dense, so its behaviour is predictable.
- Cheapest input ($0.04/M); 262k context.
- Supports `seed` and `structured_outputs`.
- Its signer `0x835ab53d…` is **the same address the earlier prototype registered on testnet** (read via test.rpc.fastnear.com).

**Judge B: `z-ai/glm-5.3-flash`**
- Different family (Z.ai GLM).
- Supports `json_mode`, `structured_outputs` and `seed`.
- $0.08/$0.50 per M.

**Fallback B′: `deepseek-ai/DeepSeek-V4.1-Flash-1017`**
- Different family, and also a different engine (vLLM vs SGLang) and a different CVM instance.
- The catalogue lists no sampling or structured-output parameters, so run spike S-J before relying on it.

**Do not use:**
- Abliterated variants.
- Qwen3.6 as the second judge (same family as A).
- Any Incognito model (no TEE).
- 3P TEE models (gateway-signed only; see §1.3).

**Independence caveat.**
- A and B share a CVM, gateway, KMS and `app_id`.
- The `min()` of two families defends against *model-level* manipulation: prompt-injection transfer, which is weaker across families (ml-papers §2g).
- It does not defend against an infrastructure compromise. The two judges sit in **one NEAR AI trust domain**.

**Cost per judge call** (DERIVED, assuming a 20k-token good plus ~600 prompt tokens and ≤50 output tokens):
- Qwen3.8: ≈ $0.0009.
- GLM-5.3-Flash: ≈ $0.0017.
- Total under $0.003 per appraisal.

**Request template** (based on PRIMARY docs; exact output bytes need spike S-J):

```jsonc
POST https://cloud-api.near.ai/v1/chat/completions
Headers: Authorization: Bearer <key>; Content-Type: application/json;
         x-no-aliasing: true; Accept-Encoding: identity
{ "model": "Qwen/Qwen3.8-27B",            // canonical ID; part of the signed text
  "messages": [...],                       // system: untrusted-data rule; user: need + delimited good
  "temperature": 0, "seed": <job-derived u32>, "max_tokens": 32, "stream": false,
  "chat_template_kwargs": {"enable_thinking": false},      // Qwen (documented for 3.5/3.6; 3.8 UNVERIFIED)
  "response_format": {"type":"json_schema", ...}           // optional; see whitespace caveat
}
// GLM-5.3-Flash: use "reasoning_effort":"low" (docs: "Minimal reasoning, usually under 20 tokens")
// or "thinking_token_budget": <small>; do NOT use enable_thinking:false. The docs say the model
// then writes its reasoning into `content`, which breaks the strict parse.
```

**GLM reasoning gotcha.** GLM-5.3-Flash reasons by default with an 8,192-token budget. Reasoning tokens count toward `completion_tokens`. So `max_tokens` must cover budget + answer, or `content` can come back empty. That empty content resolves to the floor (fail-safe, but useless).

### 1.3 Verification APIs (exact)

All PRIMARY: docs.near.ai pages listed in §5, plus the OpenAPI blocks inside them.

**Response signature**
- Request: `GET https://cloud-api.near.ai/v1/signature/{chat_id}?model=<id>&signing_algo=ecdsa|ed25519`.
  - Needs an API key.
  - `chat_id` is the completion `id`, or `resp_…` for the Responses API.
- Response fields: `{text, signature, signing_address, signing_algo, signature_kind}`.
- `signature_kind`:
  - `"provider_tee"`: signed in the model-serving TEE. `text = "{model_id}:{sha256(req)}:{sha256(resp)}"`.
  - `"gateway"`: `text = "{sha256(req)}:{sha256(resp)}"`, signed by the gateway TEE.
- When the gateway signs instead of the model TEE:
  - streamed completions (by default);
  - alias resolution;
  - the Responses API;
  - "attested fallback providers without per-response signatures" (Chutes).
- Missing results:
  - A `2xx` containing `error_code` means unavailable.
  - A `404` may be retried for a "short, bounded interval".
  - Either is unverified if signatures are required.
- Defaults differ: `/v1/signature` defaults to `ecdsa`; `/v1/attestation/report` defaults to `ed25519` for the gateway and `ecdsa` for model reports. **Always pass `signing_algo` explicitly on both calls.**
- How to verify each algorithm:
  - ECDSA: recover the EIP-191 signer from `text`.
  - Ed25519: verify the UTF-8 `text` against `signing_address`, which is the hex public key.
- Hashing rules:
  - Hash the exact request bytes and the exact *uncompressed* response bytes.
  - Never re-serialise JSON.

**Attestation report**
- Request: `GET https://cloud-api.near.ai/v1/attestation/report`.
- Parameters:
  - `model`;
  - `provider=near|chutes`;
  - `signing_algo`;
  - `nonce` (64 hex characters, generated by the client);
  - `signing_address`;
  - `include_tls_fingerprint`.
- Access and cost:
  - No key is needed for listed models.
  - Anonymous calls share "a small concurrency limit" (429 with `Retry-After`).
  - Retrieval is "non-billable".
- Response:
  - `gateway_attestation`;
  - `model_attestations[]`, the candidates. Verify every one and reject an empty list;
  - `ohttp_attestation` and `ohttp_key_config`;
  - optionally `tls_certificate`.
- Model report fields:
  - `model_name`;
  - `signing_address`, `signing_algo`, `signing_public_key`;
  - `request_nonce`;
  - `intel_quote` (TDX);
  - `nvidia_payload` (JSON string, sent unchanged to NRAS `https://nras.attestation.nvidia.com/v3/attest/gpu`; require `x-nvidia-overall-att-result == true`);
  - `event_log`;
  - `info.{app_id, instance_id, tcb_info{mrtd, rtmr0-3, app_compose, …}, os_image_hash, compose_hash, key_provider_info, vm_config}`;
  - `compose_manager_attestation{actions[], actions_hash, nonce, quote, event_log, report_data}`.
- Checks (docs "Quote, Nonce, and Signer Bindings"):
  1. Run `dcap-qvl` with your TCB policy.
  2. Reject a debug TD (`TD_ATTRIBUTES` bit 0).
  3. `report_data[0..32]` = signer, zero-padded (or `SHA-256(signer‖SPKI)` with TLS binding). `report_data[32..64]` = nonce.
  4. Replay RTMR3: `SHA-384(event_type LE32 ‖ ":" ‖ event ‖ ":" ‖ payload)`, extended from 48 zero bytes.
  5. MRCONFIGID = `01 ‖ SHA-256(app_compose) ‖ 0×15`.
  6. Check the GPU evidence via NRAS.
  7. Apply your measurement and provenance policy.
- **Preflight rule.** "A report fetched after the completion cannot replace this preflight evidence."
  - For `provider_tee`, the signer must match **exactly one** retained verified candidate.
  - "Instances of the same model share one signing key, including instances with different measured configurations."
- **Intel Trust Authority.** `GET /v1/attestation/ita-token?model=&nonce=&signing_algo=&signing_address=&include_tls_fingerprint=&policy_ids=` is public and returns ITA-signed JWTs.

**Verifier tools**
- `nearai/nearai-cloud-verifier` (Python and TypeScript):
  - `py/model_verifier.py --model <id>`;
  - `py/chat_verifier.py --model <id>`;
  - `pnpm run model -- --model <id>`;
  - plus TLS, domain and encrypted-chat verifiers.
- Caveats (README, PRIMARY):
  - The gateway path needs `API_KEY`.
  - Its "Sigstore" check only HEADs `search.sigstore.dev` (reachability, not signature verification).
  - The README says "each server has its own unique signing key", which **conflicts** with the current docs (shared per model). Its last push was 2026-09-02, so it is stale.
- The docs also point to `near-examples/nearai-cloud-verification-example` and to code snippets (Python `dcap-qvl`, Node `@phala/dcap-qvl`).
- `dcap-qvl` fetches collateral from Phala's PCCS by default. Pass `INTEL_PCS_URL` to use Intel's PCS.

**Key derivation and rotation** (PRIMARY, from code)
- `nearai/inference-proxy` (Rust; README: "Rewrite of nearai/vllm-proxy (Python)") in `src/signing.rs`:
  - production `SigningPair::init` calls dstack `get_key(path = "{model_name}/ecdsa-signing-key", purpose = "signing")`, and the same for ed25519;
  - only dev mode uses random keys.
- The older Python `vllm-proxy` (`src/app/quote/quote.py`, last commit 2026-02-06) does the same KMS derivation.
- dstack KMS derives app keys from the `app_id`. Two different instances in my reports share `app_id 2c0a0c96…`.
- **So keys are stable across restarts and identical across instances of a model.** They change only if NEAR AI changes:
  - the KMS root;
  - the `app_id`;
  - the canonical model name.
- NEAR AI publishes no rotation schedule or notification channel. **Clients learn keys only by re-fetching `/v1/attestation/report`.**
- **This corrects an earlier prototype's README** ("signing keys rotate when the backend restarts") and SDD §3.16. That behaviour matches the dev-mode or old random-key path, not today's production.
- Observation: the earlier prototype's on-chain signer for Qwen3.8 (`0x835ab53d…`) still matched at 19:18 UTC. But the compose-manager log shows no Qwen restart between that deploy (~07:00 UTC on 11-11) and my fetch. So this is consistent with the code, not an independent proof.
- **Security consequence.** Because the key follows the `app_id`, **any workload that NEAR AI's KMS policy authorises for that `app_id` gets the same signer**:
  - including a different engine image started by compose-manager;
  - including the unpatched or abliterated LoRA engines that serve the base model too.
- A registered signer address is therefore an identity for "NEAR AI's fleet for model X", **not** for a measured software stack.

### 1.4 Parameters, determinism, limits, terms, keys

- **Parameters.**
  - The schema (`ChatCompletionRequest`) lists `model, messages, temperature, top_p, max_tokens, n, stop, stream, frequency_penalty, presence_penalty` with `additionalProperties: {}`. Extra fields are passed through to the backend.
  - Per-model support is in `/v1/models` (§1.1).
  - Reasoning controls: `chat_template_kwargs.enable_thinking` (Qwen 3.5/3.6, GLM-5.1), `thinking_token_budget` or `reasoning_effort` (GLM-5.3-Flash), `chat_template_kwargs.thinking` (Kimi).
  - Reasoning text is returned in `message.reasoning_content` (docs/cloud/reasoning-models.md, PRIMARY).
- **Determinism caveats.**
  - No prod compose sets SGLang `--enable-deterministic-inference`. A grep of `prod/small-models.yaml` finds 0 matches (PRIMARY).
  - GLM uses EAGLE speculative decoding, and DeepSeek uses probabilistic "dspark" speculative decoding.
  - Weights are FP8, W4AFP8 or W4A8 quantised.
  - Batches are dynamic (`--max-running-requests 32`).
  - SGLang's deterministic mode exists (batch-invariant kernels, per-request seed, default seed 42) but is off by default and costs throughput. Sources: LMSYS blog 2025-09-22 and SGLang docs (PRIMARY via search summary). LLM-42 (arXiv 2601.17768) reports up to 56% overhead for SGLang's deterministic mode (SECONDARY, search summary).
  - **So `temperature: 0` plus `seed` reduces variance but does not make judges replayable.** Marginal does not need replay: it verifies receipts and takes min(ℓ₁, ℓ₂) on an integer scale.
- **JSON and whitespace.**
  - `structured_outputs` and `json_mode` constrain the format, but grammar backends may emit `{"relevance": 7}` with a space.
  - SDD DR-2's regex `^\{"relevance":(10|[0-9])\}$` would then floor every answer.
  - Spike S-J must record the exact bytes. Otherwise widen the regex to `^\s*\{\s*"relevance"\s*:\s*(10|[0-9])\s*\}\s*$`, which still admits only one key and one integer.
- **Rate limits and capacity.**
  - The default concurrent-request limit is **64 per model per organization**: admin API "Get organization concurrent request limit", "returns … the default (64)" (PRIMARY, docs index).
  - `429` errors are `rate_limit_exceeded` or `service_overloaded`.
  - `402` means insufficient credits.
  - Per-minute token limits are not published. ToS §4.3 says limits are "set forth in the applicable Order Form".
  - Anonymous attestation calls have a small concurrency cap. Room preflight should send the key, or use attester-cached evidence.
- **Pricing.** Pay as you go per million tokens (§1.1 table). Alternatively, "Staking for Inference": stake NEAR and the staking rewards pay for inference (docs, PRIMARY).
- **Getting a key** (described only):
  1. Sign up at cloud.near.ai.
  2. Buy credits under "Credits".
  3. Create a key under "API Keys" (workspace level).
  - Keys can have names, expiry dates and **spend limits**, and can take up to 10 s to activate.
  - The same flow exists as API calls: `POST …/workspaces/{id}/api-keys`, plus `update-api-key-spend-limit`.
- **Privacy and retention** (PRIMARY):
  - **ToS (updated 2026-10-29), §10.2:** "NEAR AI will not use Customer Data to train any generative AI models."
  - **ToS §4.7:** Usage Data excludes Inputs and Outputs.
  - **ToS §14.5:** NEAR AI "does not have access to the contents of Customer workloads, memory or data processed within a running TEE during normal operations".
  - **ToS §14.6–14.7:** CVMs "do not eliminate all security risks", with no warranty.
  - **ToS §7.3:** Incognito routes send input to the third party, and "Model execution occurs outside a NEAR AI-hosted TEE".
  - **ToS §4.2:** no use of Outputs to train competing models; no bypassing rate limits.
  - **Privacy Policy (2026-10-12)** and **DPA (2026-10-15):** **no prompt or output retention period** is stated; retention is "as long as needed". Breach notice is "without undue delay"; sub-processors are listed at trust.near.ai/subprocessors (not fetched).
  - **Responses API:** stateless; `store` must be false; "does not store the raw request, response…".
  - **No SLA.** Models and routes can be removed (§4.5); see also the `deprecate-a-model` admin endpoint, which aliases old IDs to successors.
  - Aliasing changes the signed `model_id` and makes the signature gateway-signed. Hence `x-no-aliasing: true`.

### 1.5 The 2026-11-08/09 SGLang incident: what is known (extends near-primitives B1)

| Fact | Source | Label |
|---|---|---|
| Blog (2026-11-09, no "updated" note when fetched 11-11). RCE in SGLang on one inference server, then lateral access. In-flight requests on that server, "including confidential ones", were observable on Nov 8. About 100 Private Chat accounts' details, 18 legacy (non-TEE) agents and **2 customers' Cloud API keys "exposed in logs"** were affected. Remediation: revoked sessions and admin credentials, rotated tokens, took Private Chat offline, deployed an SGLang fix "across all inference servers". No CVE was named and **no signing-key statement** was made. | near.ai/blog/security-incident-report-sglang-vulnerability | PRIMARY |
| **Vector.** "an attacker reached an engine and called the unauthenticated `/update_weights_from_tensor`". A later PR calls it "the 11-07 incident (an SSRF into unauthenticated SGLang endpoints)". The date differs from the blog's Nov 8. | `nearai/cvm-compose-files` PR #442 (2026-11-10) and PR #446 (2026-11-11) | PRIMARY |
| **First fix (proxy).** inference-proxy PR #342 (merged 2026-11-08 20:23Z) restricts decrypted **OHTTP inner requests** to `GET /v1/models` and `POST /v1/chat/completions`, `/v1/completions`, `/v1/audio/transcriptions`, and pins them to loopback. cvm-compose-files #439 (20:32Z) repinned all 34 proxy references to `vllm-proxy-rs@sha256:7a295d6f…`. That digest is in today's attested compose. | GitHub PRs | PRIMARY |
| Attested ops log (GLM report). 11-09 21:05–21:08 compose_down of most small-models engines. 11-10 00:35 `rotate-compose-manager-token` and compose-manager restarted with a new digest (`a0c07308…`). 11-10 01:44–04:57 services back up (v0.0.554). 11-11 00:13 v0.0.556. | `/v1/attestation/report` `compose_manager_attestation.actions` | PRIMARY |
| **Engine-level CVEs still open on the GLM fork on 11-11.** PR #446: upstream v0.5.23 closes CVE-2026-15976 (`update_weights_from_disk` pickle RCE), CVE-2026-86793 (`update_weights_from_tensor` unpickler bypass) and CVE-2026-15969 (LoRA-from-tensors), "all open on the fork today". It also adds CVE-2026-15977 (admin-key leak through `/server_info` and logs) and CVE-2026-112266 (cross-user request abort), plus customer-data log redaction. "No compose file changes" yet. PR #442's admin-auth backport (v13) was merged as a draft that "changes no running service. Compose files stay pinned to v12 (`da8d4e4b5ec6`)". The current attested compose still runs GLM on `da8d4e4b…`. | PRs #442, #446; `prod/small-models.yaml` | PRIMARY |
| Qwen3.6 runs `lmsysorg/sglang:v0.5.16` and Qwen3.8 runs `lmsysorg/sglang@febfb971…`. Both are older than upstream v0.5.23. Whether they are exploitable once the proxy allow-list is in place is **UNVERIFIED**. NEAR's blog says the fix is deployed. | compose file; GitHub releases (v0.5.23 published 2026-11-02) | PRIMARY / UNVERIFIED |
| SGLang GitHub publishes **no security advisories** (API returns empty). CVE details come from GitLab advisories, CERT/CC VU#915947, VicOne and others. | `gh api repos/sgl-project/sglang/security-advisories`; search results | PRIMARY (empty) / SECONDARY |
| Press after 11-09: The Block, Decrypt, NewsBTC, Cryptonomist, Blockonomi (11-10). They add nothing beyond the blog. | search | SECONDARY |

**Implications for Marginal.**
1. The judges see the good in plaintext, and NEAR AI's own engines had unauthenticated admin surfaces. Keep NEAR AI judges **opt-in** (`external_judges_allowed`), and disclose this incident in the seller UI and the certificate scope.
2. Attesters must gate on **engine image digests**: an allow-list keyed to digests that contain the fixes (for example the SGLang v0.5.23-based images once rolled out), checked through the compose-manager action log.
3. Use API keys with spend limits and rotate them, because keys were exposed in logs.

### 1.6 Recommended SDD changes (OI-7)

1. **§3.16 "NEAR AI Cloud judge"**:
   - Models: `Qwen/Qwen3.8-27B` and `z-ai/glm-5.3-flash`, with fallback `deepseek-ai/DeepSeek-V4.1-Flash-1017`.
   - Private TEE tier only. Never `*-abliterated`, 3P TEE or Incognito.
   - Every call sets `stream:false`, the canonical model ID, `x-no-aliasing: true` and `Accept-Encoding: identity`.
   - `signing_algo=ecdsa` on both the report call and the signature call.
   - Accept only `signature_kind == "provider_tee"`. Anything else, including a fallback to Chutes, gives `factorBps = 0`.
2. **Replace "NEAR AI rotates signing keys on backend restart (earlier prototype README)"** with:
   - Keys are KMS-derived per (`app_id`, model) and shared across instances and measured configurations.
   - A signer address therefore does not pin code.
   - Registry entries become `{model_id, signing_algo, signing_address, verified_compose_hash, cm_actions_hash, engine_digests[], verified_at, expires_at}`.
   - Attesters re-verify on a fixed cadence (proposal: hourly; expiry 24 h) and whenever `actions_hash` changes.
   - They reject entries whose compose-manager log starts an engine digest that is not on the allow-list.
3. **Room preflight per job.** Fetch `/v1/attestation/report?model=…&provider=near&signing_algo=ecdsa&nonce=<job-derived>` and check:
   - the signer is in the registry and fresh;
   - the nonce binding;
   - optionally run the full `dcap-qvl` and NRAS check in the room.
   - Reason: the docs require preflight evidence.
4. **DR-2 parse.**
   - Parse `choices[0].message.content` only.
   - Fix the whitespace rule after spike S-J: either an exact-bytes constraint or a widened regex.
   - Set `max_tokens` above the reasoning budget.
   - Do not use `enable_thinking:false` on GLM-5.3-Flash.
5. **New leak in Open mode.**
   - The on-chain `response_body` contains `message.reasoning_content`, which can **quote the good**.
   - Require reasoning disabled or minimal, and have the room reject (factor 0) any body whose `reasoning_content` is non-empty before publishing in Open mode.
   - Otherwise these receipts are allowed only in Sealed mode.
6. **§8 threats.** Add "judge-provider software compromise (SGLang SSRF/RCE, 2026-11-07/08)": the good can be exposed during the judge call. Controls: opt-in, engine-digest allow-list, spend-limited key, disclosure.
7. **OI-7 text.**
   - Second family: GLM-5.3-Flash.
   - API key: an org key with a spend limit, held by the supervisor and sealed to the room.
   - Re-registration cadence: hourly re-attest; a change only when `app_id`, KMS or model ID changes, or when the compose log changes the engine.

---

## 2. OI-15: v1 embedder and NLI model

### 2.1 Embedders

**How the scores were produced.**
- **MTEB English v1 category averages** were computed from each model card's `model-index` (self-reported MTEB results, PRIMARY). The averaging is DERIVED: STS over 10 tasks (cosine Spearman), PairClassification over 3 (AP), Retrieval over 15 (nDCG@10).
- **Validation.** My averages reproduce the published tables exactly for:
  - bge-small: STS 81.59, PC 84.92, Retr 51.68;
  - bge-base: 82.4 / 86.55 / 53.25;
  - gte-small: 82.07 / 83.54 / 49.46;
  - e5-small-v2: 80.39 / 84.67 / 49.04.
  - All four match the table in the BAAI/bge-small-en-v1.5 card.
- MiniLM has no card scores. Its row comes from `embeddings-benchmark/results` (official MTEB results repo, revision `8b3219a9`), averaged the same way.
- The MTEB v2 English numbers (EmbeddingGemma, Qwen3) **are not comparable** with v1.

| Model | Params (safetensors) | Dim (MRL) | Layers / max tokens | Licence | MTEB-en v1 STS | PairClass | Retrieval | ONNX | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `sentence-transformers/all-MiniLM-L6-v2` (baseline) | 22.7M | 384 | 6 / 512 (card: "truncated" at 256 word pieces) | Apache-2.0 | 78.95 | 82.37 | 41.95 | official `onnx/` (9 variants); Xenova | Training mix lists MS MARCO (9.1M triplets) |
| `BAAI/bge-small-en-v1.5` | 33.4M | 384 | 12 / 512 | MIT | 81.59 | 84.92 | 51.68 | official `onnx/model.onnx`; Xenova | Card: v1.5 has a "more reasonable similarity distribution". Pick thresholds "based on the similarity distribution on your data" |
| `BAAI/bge-base-en-v1.5` | 109.5M | 768 | 12 / 512 | MIT | 82.40 | **86.55** | 53.25 | official; Xenova | Best pair-classification score in the BERT-base class |
| `intfloat/e5-small-v2` | 33.4M | 384 | 12 / 512 | MIT | 80.39 | 84.67 | 49.04 | official (`model.onnx`, O4, qint8); Xenova | Needs a `query: ` prefix. Card: cosine "distribute[s] around 0.7 to 1.0" |
| `intfloat/multilingual-e5-small` | 117.7M (250k vocab) | 384 | 12 / 512 | MIT | 79.10 | 82.59 | 46.65 | official; Xenova | Only multilingual option among the small models |
| `thenlper/gte-small` | 33.4M | 384 | 12 / 512 | MIT | 82.07 | 83.54 | 49.46 | official; Xenova | Best STS score among the small models |
| `thenlper/gte-base` | 109.5M | 768 | 12 / 512 | MIT | 82.30 | 84.57 | 51.14 | official | — |
| `Alibaba-NLP/gte-base-en-v1.5` | 136.8M | 768 | 12 / 8192 | Apache-2.0 | 81.97 | 85.33 | 54.09 | official (7 variants) | Custom architecture (`trust_remote_code`) |
| `Snowflake/snowflake-arctic-embed-s` | 33.2M | 384 | 12 / 512 | Apache-2.0 | 78.44 | 82.07 | 51.98 | official | Tuned for retrieval; weak on STS |
| `Snowflake/snowflake-arctic-embed-m-v2.0` | 305.4M | 768 | 12 / 8192 | Apache-2.0 | 77.13 | 82.23 | **55.38** | official | Multilingual; custom "gte" architecture. No `-s-v2.0` exists (HF 401) |
| `nomic-ai/nomic-embed-text-v1.5` | 136.7M | 768 (MRL) | 12 / 2048 (8192 claimed) | Apache-2.0 | 81.94 | 84.61 | 53.01 | official (8 variants) | Needs task prefixes; custom `nomic_bert` |
| `mixedbread-ai/mxbai-embed-xsmall-v1` | 24.1M | 384 (MRL) | 6 / 4096 | Apache-2.0 | n/r | n/r | 42.80 | official (8 variants) | Card reports retrieval only |
| `jinaai/jina-embeddings-v2-small-en` | 32.7M | 512 | 4 / 8192 | Apache-2.0 | 80.00 | 84.44 | 45.14 | official (`model.onnx`, mean-pooling variant); Xenova | ALiBi; custom code |
| `google/embeddinggemma-300m` | 302.9M | 768 (MRL 512/256/128) | 24 / 2048 | **Gemma Terms** (gated; Prohibited Use Policy flows down) | v2 only: Mean(Task) 69.67 (768d) | — | — | `onnx-community/embeddinggemma-300m-ONNX` | Card: activations do not support float16 |
| `Qwen/Qwen3-Embedding-0.6B` | 595.8M | 1024 (MRL) | 28 / 32,768 | Apache-2.0 | MTEB(eng, v2): STS 86.57, PairClass 84.37, Retr 61.83, Mean(Task) 70.70 | | | `onnx-community/Qwen3-Embedding-0.6B-ONNX` | About 18× MiniLM's parameters. Also served by NEAR AI at $0.01/M (Private TEE) |

**CPU latency.** None of the embedder cards report CPU latency. The only CPU speed figure found is MoritzLaurer's xsmall NLI ("6.0 text/sec, CPU, 128 batch"), which is not comparable. So latency is part of the benchmark plan (§2.4). Relative compute scales roughly with layers × hidden² (DERIVED):
- MiniLM-L6 is 6×384².
- bge-small, e5-small and gte-small are 12×384² (≈2× MiniLM).
- bge-base is 12×768² (≈8× MiniLM).

**Licence caveat.**
- Model weights are MIT or Apache, but training mixtures include **MS MARCO**: "intended for non-commercial research purposes only" (microsoft.github.io/msmarco, PRIMARY). The all-MiniLM card lists MS MARCO explicitly (PRIMARY). For the others it is UNVERIFIED but common.
- This grey zone affects essentially every open embedder, including the current baseline. Route it to counsel (OI-18). It does not discriminate between candidates.

### 2.2 NLI cross-encoders

| Model | Params | Licence | Training data | Reported accuracy | ONNX | Label order |
|---|---|---|---|---|---|---|
| `cross-encoder/nli-deberta-v3-xsmall` | 70.8M (12 layers, 384 hidden) | Apache-2.0 | SNLI + MNLI | SNLI-test 91.64; MNLI-mm 87.77 | official `onnx/` (9 variants incl. O1–O4, qint8); Xenova | `[contradiction, entailment, neutral]` |
| `cross-encoder/nli-deberta-v3-small` | 141.9M (6 layers, 768 hidden) | Apache-2.0 | SNLI + MNLI | SNLI 91.65; MNLI-mm 87.55 | official; Xenova | same |
| `cross-encoder/nli-deberta-v3-base` | 184.4M | Apache-2.0 | SNLI + MNLI | SNLI 92.38; MNLI-mm 90.04 | official; Xenova | same |
| `MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli` | 184.4M | MIT (weights) | MNLI, FEVER-NLI, **ANLI** | MNLI-m 0.903; mm 0.903; fever-nli 0.777; ANLI-all 0.579; ANLI-r3 0.495 | none in repo | `[entailment, neutral, contradiction]` |
| `MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli` | 435.1M | MIT | + LingNLI, WANLI, **ANLI** | MNLI-m 0.912; mm 0.908; ANLI-all 0.702; ANLI-r3 0.64; WANLI 0.77; LingNLI 0.87 | official `onnx/` | `[entailment, neutral, contradiction]` |
| `MoritzLaurer/DeBERTa-v3-xsmall-mnli-fever-anli-ling-binary` | 70.8M | MIT | binary NLI incl. **ANLI** | 2-class: MNLI-m 0.925; mm 0.922; fever 0.892; ANLI-all 0.676; ANLI-r3 0.665; LingNLI 0.888 | official `onnx/` | `[entailment, not_entailment]` |

**Licences.**
- **ANLI is "licensed under Creative Commons-Non Commercial 4.0"** (facebookresearch/anli README, PRIMARY). So the ANLI-trained models carry training-data NC risk despite their MIT weights.
- SNLI is CC BY-SA 4.0 (UNVERIFIED here). MNLI is mostly OANC (permissive).

**Label order differs between the two publishers.** The room must read `id2label` from the pinned `config.json` and assert it in a unit test.

### 2.3 NovAScore and benchmark datasets

**NovAScore** (arXiv 2409.09249; COLING 2025 pp. 3479–3494). Full text read via arxiv.org/html (PRIMARY).

- **Pipeline.**
  - GPT-4o extracts abstractive ACUs (atomic content units), writes a summary, and marks salient ACUs.
  - ACUs go into an "ACUBank": all-mpnet-base-v2 embeddings indexed with FAISS.
  - The top 5 historical ACUs with cosine ≥ 0.6 are retrieved.
  - Each ACU is marked novel or non-novel by one of three evaluators:
    - CosSim (any match above threshold);
    - NLI (GPT-4o; premise = concatenated retrieved ACUs);
    - QA (GPT-4o; 3 questions; answer cosine ≥ 0.85).
  - Score: NovAScore = Σ Nᵢ·(w_s·Sᵢ + w_ns·(1−Sᵢ))/n, with w_ns = min(w_s, α(p_s−β)³+γ).
  - TAP-DLND uses α=0, β=0.5, γ=1; APWSJ uses α=1, β=0.5, γ=0.7.
- **Data.**
  - TAP-DLND 1.0: 500 sampled documents (250 novel / 250 non-novel), 223 clusters.
  - APWSJ: 500 sampled (259/241).
  - Internal: 32 articles, not releasable.
- **Results** (document level, point-biserial / Spearman / Kendall):
  - TAP-DLND: CosSim 0.545/0.555/0.460; **NLI 0.626**/0.622/0.510; QA 0.508/0.497/0.409.
  - APWSJ: CosSim 0.447/0.446/0.358; NLI 0.476/0.482/0.395; QA 0.422/0.439/0.353.
  - ACU-level accuracy / macro-F1: CosSim 0.83/0.71; NLI 0.94/0.84; QA 0.91/0.80. One search summary attributed the best ACU score to QA (SECONDARY); the full-text table says NLI.
  - Internal set, Pearson without salience: **NLI 0.920**, QA 0.843, CosSim 0.748.
  - GPT-4o salience vs human salience: macro-F1 0.6.
- **Code.** "Code will be released soon." No repository found as of 2026-11-11 (search, UNVERIFIED negative).
- **Relevance to Marginal.**
  - The CosSim variant is exactly Marginal's deterministic core: claims, cosine against the reference, threshold.
  - The NLI variant corresponds to the borderline-NLI step.
  - So NovAScore gives directly comparable baselines without any LLM in the loop for CosSim.

**Other datasets**

| Dataset | Task fit | Licence / availability | Label |
|---|---|---|---|
| TAP-DLND 1.0 (LREC 2018; 6,109 docs, 2,704 non-novel; 223 events) | Document novelty against source documents: the primary NovAScore comparison | **Licence and download not found.** Ask the authors. Evaluate only; do not redistribute. | PRIMARY (paper) / UNVERIFIED (licence) |
| TAP-DLND 2.0 (Ghosal et al., Computational Linguistics 48(1), 2022) | Novelty as multi-premise entailment; enhanced dataset | Licence UNVERIFIED | SECONDARY |
| APWSJ (Zhang, Callan, Minka, SIGIR 2002) | Redundancy in AP/WSJ newswire | Built on TREC AP/WSJ texts, which normally need an LDC/NIST licence. Availability of the annotations is UNVERIFIED. Treat as optional. | SECONDARY |
| PAWS-Wiki | Paraphrase vs high-overlap non-paraphrase: an adversarial test for "same claim, reworded" vs "same words, different claim" | "may be freely used for any purpose". PAWS-QQP must be rebuilt from QQP, under QQP's terms. | PRIMARY |
| Webis-CPC-11 | Passage paraphrase (4,067 positive / 3,792 negative) | **CC BY 4.0** (Zenodo 3251771) | PRIMARY |
| STS-B | Graded similarity 0–5: threshold calibration | Mixed sources (CC BY-SA 3.0/4.0 per GLUE tables) | SECONDARY |
| MRPC | Paraphrase | Microsoft research licence (MSR-SSLA). Internal evaluation only. | SECONDARY |
| MTEB tasks (SprintDuplicateQuestions, TwitterURLCorpus, STS12–17…) | Already reflected in the §2.1 averages | Per-dataset | — |

### 2.4 Recommendation, threshold recalibration, benchmark plan

**v1 picks** (benchmark-gated). All are commercially licensed weights and plain BERT/DeBERTa graphs that run under onnxruntime-node, `ort`, candle (`bert.rs`, `debertav2.rs`) and tract.
- **Embedder.** Default candidate `BAAI/bge-small-en-v1.5`; quality candidate `BAAI/bge-base-en-v1.5`; MiniLM stays as the control.
  - bge-small vs MiniLM: STS +2.6, PairClass +2.6, Retrieval +9.7 points, for ≈2× MiniLM's compute.
  - Use `gte-small` only if STS-like calibration favours it.
  - Keep `multilingual-e5-small` as the option if listings are not English.
  - Qwen3-Embedding-0.6B serves as an **offline upper bound** in the benchmark and as a v2/G-room option, not a CPU v1 default.
- **NLI.** `cross-encoder/nli-deberta-v3-xsmall` for HDP and `cross-encoder/nli-deberta-v3-base` for v1 if CPU time allows.
  - Entailment = softmax over the 3 logits, index read from `id2label`, threshold 0.9 recalibrated.
  - Exclude ANLI-trained checkpoints unless counsel clears them.

**Why the τ values cannot carry over.**
- e5's cosines sit in 0.7–1.0 (card), and bge-v1 sat in 0.6–1.0 (card).
- The v0 values τ_hi = 0.78 and τ_lo = 0.45 are MiniLM-specific. bge-v1.5 "alleviates" the compression but still advises picking thresholds from your own data.

**Recalibration procedure (per model hash).**
1. **Build a pairs set** of (claim, context sentence) labelled non-novel / partial / novel:
   - (a) synthetic memo–notes pairs derived from the D1 fixture with controlled paraphrase, restatement, partial overlap and contradiction;
   - (b) PAWS-Wiki, Webis-CPC-11 and STS-B mapped to labels (STS ≥ 4 → non-novel; ≤ 2 → novel);
   - (c) ACU pairs from TAP-DLND if the licence allows.
2. **Fit a calibration curve.** Isotonic regression from the max-cosine to P(non-novel).
   - **τ_hi** = the smallest cosine where P(non-novel) ≥ 0.9.
   - **τ_lo** = the largest cosine where P(non-novel) ≤ 0.1.
   - Report bootstrap 90% confidence intervals.
   - Alternatively, use quantile matching: pick each model's τ so the share of pairs above τ equals MiniLM's share above 0.78 and 0.45 on the same set. This preserves the v0 operating point.
3. **Tune the NLI threshold** on the τ_lo < sim < τ_hi band, targeting ≤ 5% false "entailed" on the novel class.
4. **Bake τ_hi, τ_lo and the NLI threshold into the measured image** next to the model hashes (DR-9). Each model change is a new appraiser version.

**Benchmark plan** (proposed spike S-5 for OI-15; it reuses NovAScore's metrics):

| Track | Data | Systems | Metric | Pass bar (proposal) |
|---|---|---|---|---|
| B1 Document novelty | TAP-DLND 1.0 (500-doc sample as in NovAScore); APWSJ only if licensed | Marginal knowledge@1 (deterministic splitter + {MiniLM, bge-small, bge-base, gte-small} ± NLI) vs re-implemented NovAScore-CosSim (mpnet, 0.6) and NovAScore-NLI with an open LLM; Qwen3-Embedding as upper bound | Point-biserial, Spearman, Kendall vs labels | ≥ 0.545 (NovAScore CosSim) with CPU models only; target 0.60+ |
| B2 Claim-level | PAWS-Wiki, Webis-CPC-11, STS-B, synthetic D1 pairs | Same embedders ± NLI | AUROC and accuracy at calibrated τ; false-novel rate on paraphrases | False-novel on paraphrases ≤ 10% |
| B3 Gaming | DIPPER-style paraphrase of buyer-known claims, padding (AC-39) | Full pipeline | Δ N_b under attack | N_b inflation ≤ 1 quantisation step (5%) |
| B4 Cost | 20k-token memo, 30–500 context sentences | ORT fp32, 1 thread | p50/p95 latency and peak RSS on the target TDX vCPU | Within the duration-class budget |
| B5 Determinism | Repeat runs; ≥ 2 CPU generations | Same | Byte-identical components | Identical on the same ISA; document any cross-ISA diffs |

**Determinism finding (AC-38).** ONNX Runtime's CPU library MLAS "at startup … detect[s] underlying platform, and based on instruction sets available, hookup[s] the best available kernels". Source: ORT maintainer in microsoft/onnxruntime #11833 (PRIMARY).
- So one intra-op thread plus sequential mode gives **same-machine-class** determinism, not cross-ISA determinism (AVX2 vs AVX-512 vs AMX).
- Quantised (int8) graphs are reported to diverge by ISA (HF forum, SECONDARY). Keep fp32.
- **SDD change:** AC-38's CI must run on the production CPU family. Record `cpuid` ISA flags in the job log. Define replay equality on quantised components, flagging any cosine within 1e-4 of τ.

### 2.5 Recommended SDD changes (OI-15)

- **§3.15.1 Embeddings row.** "v1: `bge-small-en-v1.5` (MIT, 33M, 384-d) unless spike S-5 favours `bge-base-en-v1.5`; MiniLM is kept as the control. ONNX fp32 from the official repo, pinned by SHA-256."
- **§3.15.1 per-claim novelty.** "τ_hi and τ_lo are per model hash, from the calibration procedure in §5. The v0 values apply only to MiniLM."
- **§3.15.1 NLI.**
  - "`cross-encoder/nli-deberta-v3-xsmall` (HDP) or `-base` (v1); Apache-2.0; SNLI and MNLI only."
  - "Label index taken from `config.json` `id2label`."
  - "ANLI-trained models excluded (CC BY-NC 4.0 training data)."
- **§3.14.3 determinism.** Add the scope "same CPU ISA class", plus the cpuid record.
- **§5.** Add spike S-5 (OI-15) with tracks B1–B5. Note that NovAScore code is unreleased, so re-implement it. Licences: TAP-DLND unknown, APWSJ via TREC/LDC.
- **OI-18.** Add "training-data licences of embedders and NLI (MS MARCO non-commercial; ANLI NC)".

---

## 3. OI-9: TypeScript worker or Rust port

### 3.1 Rust building blocks (PRIMARY unless marked)

**`ort`** (pykeio)
- Version 2.0.0-rc.15 (2026-10-19) wraps ONNX Runtime 1.31; Apache-2.0. Used by HF Text Embeddings Inference, Magika and fastembed-rs.
- Default feature **`download-binaries`: "Downloads prebuilt binaries from pyke's CDN"**. That is a third-party binary in the TCB.
- For an auditable room, disable it, build ORT from source and link statically with `ORT_LIB_PATH` (docs/setup/linking).
- Determinism controls match onnxruntime-node (intra/inter threads, sequential mode) because it is the same MLAS. The cross-ISA caveat in §2.4 applies unchanged.
- Alternative backends `ort-tract` and `ort-candle` are labelled "experimental".

**`candle`** (HF; Apache-2.0)
- Pure Rust, with model code for `bert`, `debertav2`, `nomic_bert`, `jina_bert`, `xlm_roberta`, `gemma3`, `qwen3`, `modernbert`.
- No C++ runtime. Uses its own GEMM, with runtime SIMD dispatch (UNVERIFIED for every kernel).
- Determinism and equivalence against ORT need a spike.

**`tract`** (Sonos; v0.23.10, 2026-11-05)
- Pure-Rust ONNX/NNEF inference.
- Good fit for small BERT graphs. Op coverage for DeBERTa's relative attention is UNVERIFIED.

**`tokenizers`** (HF; 0.23.2; Apache-2.0)
- The same Rust core as the Python and JS tokenizers.
- `default-features=false, features=["fancy-regex"]` avoids the C `onig` dependency.

**Sealing and crypto**
- **`crypto_box`** (RustCrypto nacl-compat; 0.9.1): libsodium-compatible box. "one security audit by Cure53 (version 0.7.1), with no significant findings" (README).
- **`dryoc`** 2.0.0 (MIT): pure Rust, libsodium-compatible, protected memory, zeroisation. No audit mentioned.
- `libsodium-sys-stable` keeps C libsodium through FFI.
- `sodiumoxide` is archived ("DEPRECATED"). Do not use it.

**`zeroize`** 1.9.1
- "guarantees the zeroing operation can't be 'optimized away'" (`write_volatile` plus fences).
- Its own caveats:
  - "cannot guarantee copies of the data were not previously made by buffer reallocation";
  - stack spills can leave copies, and clearing registers is out of scope;
  - `mlock`/`mprotect` are "explicitly out-of-scope".
- Pair it with pre-sized `Vec`s, `Zeroizing<Box<[u8]>>`, and `mlock` (dryoc's `protected` feature, or `memsec`).

### 3.2 Memory hygiene in Node/V8 (why the SDD's "V8 can copy" note is right)

- **V8's young generation is a copying scavenger.** Live objects are moved between semispaces (v8.dev/blog/orinoco-parallel-scavenger, PRIMARY via search summary). Old copies persist until the space is reused.
- **Buffer pooling** (Node 22 docs, PRIMARY). "The `Buffer` module pre-allocates an internal `Buffer` instance of size `Buffer.poolSize` that is used as a pool for … `Buffer.allocUnsafe()`, `Buffer.from(array)`, `Buffer.from(string)`, and `Buffer.concat()`" for sizes below poolSize/2 (4 KiB by default).
  - Plaintext under 4 KiB can therefore share a slab with unrelated buffers.
  - `memzero` of the slice wipes only that slice.
  - Use `Buffer.alloc()` or `allocUnsafeSlow()` for secrets.
- **Strings are immutable.** Any `TextDecoder`, JSON or tokenizer step that makes a JS string creates copies that cannot be wiped. This is a language property; I found no single official V8 statement, so it is labelled UNVERIFIED as a citation.
  - The worker's tokeniser and NLI input path necessarily build strings: transformers.js tokenisers take strings.
- **Node `--secure-heap`** covers OpenSSL allocations only (crypto docs), not V8 objects.

### 3.3 TCB and attack surface: measured numbers

| Measure | TS room (today) | Rust worker (proposed) | Source |
|---|---|---|---|
| Transitive packages | Earlier prototype `enclave/package-lock.json`: **151** npm packages, 3 with install scripts (onnxruntime-node, protobufjs, sharp). A Marginal-like set (those deps + snarkjs + onnxruntime-node ≥1.23): **193**, 26 optional/platform, install scripts in onnxruntime-node (×2), protobufjs, sharp. | `ort` (no download), `tokenizers` (fancy-regex), `crypto_box`, `zeroize`, `sha2`, `serde_json`: **105** crates for linux-x86_64 normal deps (109 with build deps) | DERIVED: lockfile resolution, 2026-11-11 |
| Native blobs | Node binary (V8, OpenSSL, ICU, libuv); onnxruntime-node npm package unpacked **217.9 MB**. Its `postinstall` (`script/install`) downloads CUDA EP binaries from GitHub releases unless `--onnxruntime-node-install-cuda=skip`. | ORT C++ static library (built from source); one static binary | npm registry; onnxruntime `js/node/script/install.js` |
| Runtime patch cadence | Node security releases in 2026: Mar 24, Jun 18, Jul 29, Oct 21, **Nov 11**. Each forces a re-measured image. | rustc/crate advisories via `cargo audit`; no runtime VM | nodejs.org/en/blog/vulnerability (PRIMARY) |
| Wiping | Best effort (GC copies, pooled slabs, strings) | `zeroize` and `mlock` with documented limits | §3.1–3.2 |

**Takeaway.** Rust does not shrink the dependency count dramatically: `tokenizers` alone pulls in rayon, regex, serde and more. ORT stays C++ in both. The gains are elsewhere:
- no JIT/VM and no GC copies;
- no install scripts or runtime package loader;
- a single static binary;
- `cargo vet`/`cargo deny`/`cargo audit`;
- `zeroize` semantics;
- reuse of `marginal-core` natively instead of as wasm.
- Further cuts: a hand-written WordPiece tokenizer (about 200 LoC) instead of `tokenizers`, and `candle` instead of ORT after spike S-6.

### 3.4 Reproducible builds

**Node**
- `npm ci` installs exactly from `package-lock.json` (sha512 integrity) and fails if it disagrees with `package.json`.
- `--ignore-scripts` blocks lifecycle scripts, but onnxruntime-node and sharp then need manual binary placement.
- Native prebuilt `.node` files are opaque binaries, not rebuilt from source.
- Image layers need pinned base digests and `SOURCE_DATE_EPOCH` for timestamps. I found no official Node or npm reproducibility statement in this research (UNVERIFIED).

**Rust**
- `cargo build --locked` fails on any lock drift.
- Pin the toolchain (`rust-toolchain.toml`).
- Use `trim-paths` (RFC 3127) or `--remap-path-prefix` to remove host paths. The rustc docs advise scope `all` for reproducibility.
- Set `SOURCE_DATE_EPOCH` and build in a pinned container.
- The repo already uses `cargo near build reproducible-wasm` for contracts (SDD §3.2).

### 3.5 Supply-chain incidents relevant to running npm in a TEE

All from searches; PRIMARY where the vendor or government page was fetched.

| Date | Incident | Key facts |
|---|---|---|
| 2025-09-08 | chalk/debug and ~18 packages | Maintainer phished through the `npmjs[.]help` domain; browser crypto-drainer payload; ~2.6B weekly downloads (SECONDARY) |
| 2025-09 (CISA alert 2025-09-23) | **Shai-Hulud** worm | "compromised over 500 packages". Harvested GitHub PATs and AWS/GCP/Azure keys, then self-replicated with the stolen npm credentials. CISA: pin to versions before 2025-09-16, rotate credentials, use phishing-resistant MFA (PRIMARY) |
| 2026-05 | "Mini Shai-Hulud" (TanStack, Mistral AI, UiPath; 160+ npm/PyPI packages; 639 versions in 323 packages in one day) | SECONDARY |
| 2026-06 | node-gyp / "Miasma" worm through `binding.gyp`; 57 packages | SECONDARY (Snyk) |
| **2026-08-04** | **ChainDrop** (keyv, flat-cache, cache-manager; "more than 400 packages") | `preinstall` hook runs `setup.mjs`, then a Bun payload that steals npm, GitHub, cloud, Kubernetes and Vault credentials and worm-republishes. It **abused GitHub Actions OIDC trusted publishing**, so malicious packages can carry valid provenance. Mitigations include npm CLI v12 `min-release-age` (Microsoft, PRIMARY). |
| Rust, for balance | 2025-09 `faster_log`/`async_println` (wallet-key theft); 2026-03 five crates exfiltrating `.env`; **2026-08 arrayref, internment and append-only-vec** compromised through a maintainer account, with a malicious build-script dependency live for 86–107 min | SECONDARY (The Hacker News, The Register) |

**Implication.** Both ecosystems are attacked, and Rust shows up through build scripts. For the room, the difference is *where* code runs:
- npm lifecycle scripts run at install time.
- npm packages run as interpreted code inside the room process.
- A Rust binary carries only compiled code. Build-time compromise is caught (or not) by `cargo vet` and reproducible rebuilds.
- In both cases dependencies must be pinned, vetted and built offline.

### 3.6 What other TEE products use in the enclave

Repo language shares come from the GitHub API (PRIMARY).

| Product | In-TEE language |
|---|---|
| NEAR AI inference-proxy | **Rust 96%**. Explicitly a "Rewrite of nearai/vllm-proxy (Python)". |
| NEAR AI cloud-api (gateway in a TEE) | Rust 99% |
| NEAR MPC nodes (`near/mpc`) | Rust 82% |
| dstack (`Dstack-TEE/dstack`; guest agent, KMS) | Rust 67% |
| Flashbots BuilderNet | rbuilder Rust 98%; `buildernet-orderflow-proxy` and `cvm-reverse-proxy` Go 95%; images built with shell/mkosi |
| Apple PCC (`apple/security-pcc`) | Swift 75%, C 18% |
| Signal SVR2 / CDSI | C++ 73% + Go 22% (SVR2); C 60% + Java 36% (CDSI host side) |
| Enarx, Occlum, Fortanix rust-sgx | Rust 98% / 71% / 90% |
| NEAR Shade Agent Framework (JS/TS 77%) | Deprecated since 2026-04-19 (near-primitives B4) |

**Pattern.** Production enclaves use compiled languages with no tracing GC (Rust, C/C++, Go, Swift). Go has a GC; Swift uses ARC. The closest peer, NEAR AI, moved its TEE proxy from Python to Rust.

### 3.7 Recommendation and plan

**Hackathon (HDP): keep TypeScript, but harden it.**
1. Drop `@huggingface/transformers`, which brings onnxruntime-web, sharp and protobufjs. Call `onnxruntime-node` directly with a small vendored WordPiece/SentencePiece tokenizer, or `@huggingface/tokenizers` if one exists for Node (UNVERIFIED).
2. Run `npm ci --ignore-scripts --omit=optional`, with `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`. Vendor and hash-pin the ORT `.node` binary and the model files.
3. Pin the Node image by digest and track Node security releases. One landed 2026-11-11.
4. Allocate secrets with `Buffer.alloc()`, never `allocUnsafe` or `Buffer.from(string)`. Keep plaintext in `Uint8Array`s, and isolate string conversion to the tokenizer call.
5. Keep the SDD's honesty note about zeroisation.

**v1, before the audit: port the worker and key custody to Rust.** The supervisor's network and RPC orchestration may stay in TypeScript only if it never holds `sign_sk`, `box_sk`, DEKs or plaintext.

| Phase | Scope | Exit criteria |
|---|---|---|
| R0 Spike S-6 | Rust embed+NLI with `ort` (ORT built from source, static) and with `candle`; `tokenizers` or a minimal tokenizer; compare against the TS outputs | Byte-identical quantised components vs TS on the same CPU across the D1 fixture and benchmark B2; latency ≤ TS |
| R1 `room-worker` crate | Job pipeline steps 3–10 (§3.14.2): decrypt (`crypto_box` or libsodium-sys), appraise, validate, link `marginal-core` natively (drop wasm), deterministic delivery sealing. IPC over a socketpair; `Zeroizing` buffers, `mlock`, no network; `#![forbid(unsafe_code)]` outside the FFI module | Golden vectors; fuzzed parsers; `cargo deny`/`vet`/`audit` clean |
| R2 `keyd` | Move `sign_sk`, `box_sk`, CKD unwrap and the verdict signature into the Rust binary. Supervisor TS keeps only queueing and RPC. | Supervisor never sees key bytes (test with a canary key) |
| R3 Prover | Groth16 for Sealed mode: keep snarkjs in a separate prover process that sees only the witness, or move to a Rust/C++ prover (arkworks-circom or rapidsnark; UNVERIFIED fit) | Same proofs verify on-chain; prover sandboxed |
| R4 Repro build | `cargo build --locked`, trim-paths, pinned toolchain container, `SOURCE_DATE_EPOCH`; SBOM in the measured image; second-party rebuild matches the compose hash | Independent rebuild reproduces the image digest |

### 3.8 Recommended SDD changes (OI-9)

- **§3.2 Room runtime row.** Change "Port the worker to Rust in v2" to "**Port the worker and key custody to Rust before the v1 audit** (`ort` with ORT built from source, or `candle`; `tokenizers`; `crypto_box`; `zeroize`). HDP stays TypeScript with the hardening in §8.2."
- **§3.14.2 step 13.** "In the Rust worker: `Zeroizing` and `mlock`'d buffers. In HDP TS: `sodium.memzero` on `Buffer.alloc` buffers only."
- **§3.14.3.**
  - `ort` must not use `download-binaries`.
  - Record CPU ISA flags in the job log.
  - Node HDP: `npm ci --ignore-scripts`, no transformers.js, ORT binary vendored by hash.
- **§8.2 Implementation security.** Add the npm/crates supply-chain controls: lockfile pinning, minimum release age, `cargo vet`, offline builds. Cite Shai-Hulud, ChainDrop and arrayref.
- **§12 MoM item 5.** Decision: TS for HDP; Rust worker and keyd are in v1 audit scope.

---

## 4. Open questions and spikes to add

- **S-J (OI-7)**, with a key, ≤ $5 of credits:
  - exact response bytes from Qwen3.8 and GLM-5.3-Flash with `response_format` json_schema vs plain prompting;
  - whether `enable_thinking:false` works on Qwen3.8;
  - GLM `reasoning_effort:"low"` output;
  - whether `signature_kind` is `provider_tee` for both;
  - p50 latency;
  - agreement across 50 D1 judgements;
  - DeepSeek-V4.1-Flash-1017 parameter support.
- **S-5 (OI-15).** Benchmark tracks B1–B5 (§2.4).
- **S-6 (OI-9).** Rust embed/NLI equivalence and latency (§3.7, R0).
- **Ask NEAR AI.**
  - Rotation policy for KMS-derived signer keys.
  - Whether engine digests will be published as signed provenance.
  - Rollout date for SGLang v0.5.23 on GLM-5.3-Flash, Qwen3.8 and Qwen3.6.
  - Whether `x-no-aliasing` plus `provider=near` guarantees no Chutes fallback on completions.

---

## 5. Sources

**NEAR AI (PRIMARY, fetched 2026-11-11)**
- https://cloud-api.near.ai/v1/models (live JSON, 63 models)
- https://cloud-api.near.ai/v1/attestation/report?model=…&provider=near&signing_algo=ecdsa&nonce=… (4 live reports: GLM-5.3-Flash, Qwen3.8-27B, Qwen3.6-35B, DeepSeek-V4.1-Flash-1017)
- https://near.ai/models
- https://docs.near.ai/llms.txt
- https://docs.near.ai/cloud/models.md · /cloud/private-inference.md · /cloud/quickstart.md · /cloud/reasoning-models.md · /cloud/guides/openai-compatibility.md · /cloud/guides/stateless-responses.md
- https://docs.near.ai/cloud/verification/index.md · /cloud-api/model-attestations.md · /cloud-api/response-signatures.md · /cloud-api/gateway-attestation.md · /cloud-api/image-provenance.md · /reference/quote-nonce-signer.md · /reference/verification-policy.md
- https://docs.near.ai/api-reference/attestation/get-attestation-report.md · /get-completion-or-responses-api-signature.md · /get-intel-trust-authority-attestation-token.md · /api-reference/chat/create-chat-completion.md · /api-reference/gateway/check-api-key-validity.md
- https://near.ai/blog/security-incident-report-sglang-vulnerability (2026-11-09)
- https://near.ai/terms-of-service (2026-10-29) · https://near.ai/privacy-policy (2026-10-12) · https://near.ai/near-ai-data-processing-agreement-for-customers (2026-10-15)
- https://github.com/nearai/inference-proxy (`src/signing.rs`; PR #342) · https://github.com/nearai/vllm-proxy (`src/app/quote/quote.py`) · https://github.com/nearai/cloud-api (`CLAUDE.md`) · https://github.com/nearai/cvm-compose-files (`prod/small-models.yaml`, `prod/DeepSeek-V4.1-Flash-1017-vLLM-DEP8-Abliterated.yaml`; PRs #439, #442, #446) · https://github.com/nearai/nearai-cloud-verifier
- Earlier prototype testnet state: `get_config` via https://test.rpc.fastnear.com (ai_signers)

**Incident press (SECONDARY)**
- https://www.theblock.co/news/defi/2026-11-10-near-ai-security-breach-437002
- https://decrypt.co/382965/near-ai-breach-exposes-user-details-data-ai-agents
- https://blockonomi.com/near-ai-says-hacker-may-have-seen-confidential-ai-requests-in-server-breach
- SGLang CVE context: https://www.kb.cert.org/vuls/id/915947 · https://advisories.gitlab.com/pkg/pypi/sglang/ · https://vicone.com/blog/cve-2026-86793-sglang-bypass-could-let-attackers-run-code-on-ai-servers
- SGLang determinism: https://www.lmsys.org/blog/2025-09-22-sglang-deterministic · https://docs.sglang.io/advanced_features/deterministic_inference.html · https://arxiv.org/html/2601.17768

**Models and benchmarks (PRIMARY)**
- HF API `https://huggingface.co/api/models/<id>?expand[]=cardData&expand[]=safetensors&expand[]=siblings`, plus `config.json` and `README.md`, for all models in §2.1–2.2
- https://github.com/embeddings-benchmark/results (all-MiniLM-L6-v2 rev 8b3219a9)
- https://huggingface.co/google/embeddinggemma-300m
- https://arxiv.org/html/2409.09249 (NovAScore) · https://aclanthology.org/2025.coling-main.234
- https://aclanthology.org/L18-1559 (TAP-DLND 1.0) · https://aclanthology.org/2022.cl-1.3 (TAP-DLND 2.0)
- https://github.com/facebookresearch/anli (licence) · https://github.com/google-research-datasets/paws (LICENSE) · https://zenodo.org/records/3251771 (Webis-CPC-11, CC BY 4.0) · https://microsoft.github.io/msmarco/ (terms)
- https://core.ac.uk/download/280232715.pdf (APWSJ origin; SECONDARY for licence)

**Runtime, Rust, Node (PRIMARY unless marked)**
- https://github.com/pykeio/ort (README; `docs/content/setup/linking.mdx`, `cargo-features.mdx`, `backends/*`)
- https://github.com/huggingface/candle (`candle-transformers/src/models`)
- https://github.com/sonos/tract · https://github.com/huggingface/tokenizers
- https://docs.rs/zeroize/latest/zeroize/
- https://github.com/RustCrypto/nacl-compat (crypto_box README; Cure53 2022 audit) · https://github.com/brndnmtthws/dryoc
- https://github.com/microsoft/onnxruntime/issues/11833 (MLAS ISA dispatch) · onnxruntime `js/node/script/install.js` (rel-1.21.0) · https://registry.npmjs.org/onnxruntime-node/1.21.0
- Node 22 `doc/api/buffer.md` and `crypto.md` (raw.githubusercontent.com/nodejs/node/v22.x) · https://nodejs.org/en/blog/vulnerability
- https://v8.dev/blog/orinoco-parallel-scavenger (via search summary)
- https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem
- https://www.microsoft.com/en-us/security/blog/2026/08/04/chaindrop-supply-chain-compromise-anatomy-self-propagating-worm/
- SECONDARY: https://www.stepsecurity.io/blog/chaindrop-npm-worm · https://orca.security/resources/blog/tanstack-npm-supply-chain-worm/ · https://snyk.io/blog/node-gyp-supply-chain-compromise-self-propagating-npm-worm-binding-gyp/ · https://thehackernews.com/2026/08/rust-supply-chain-attack-puts-build.html · https://thehackernews.com/2025/09/malicious-rust-crates-steal-solana-and.html
- https://doc.rust-lang.org/rustc/remap-source-paths.html · https://rust-lang.github.io/rfcs/3127-trim-paths.html · https://rust-secure-code.github.io/rust-supply-chain-security/build.html
- GitHub languages API for: signalapp/SecureValueRecovery2, signalapp/ContactDiscoveryService-Icelake, flashbots/rbuilder, flashbots/buildernet-orderflow-proxy, flashbots/cvm-reverse-proxy, Dstack-TEE/dstack, near/mpc, apple/security-pcc, NearDeFi/shade-agent-framework, enarx/enarx, occlum/occlum, fortanix/rust-sgx
- Earlier prototype (`enclave/package.json`, `package-lock.json`, `README.md`, `scripts/deploy-testnet.sh`)

## 6. Query log

**WebSearch** (18)
1. NEAR AI SGLang security incident update November 2026 (extended)
2. SGLang remote code execution vulnerability CVE 2026 advisory (extended)
3. NEAR AI Cloud privacy policy terms of service prompts logged retention cloud.near.ai
4. all-MiniLM-L6-v2 MTEB average 56.26 STS 78.9 pair classification 82.37 retrieval 41.95
5. NovAScore github code release document-level novelty ACU
6. TAP-DLND 1.0 dataset document level novelty detection licence download IIT Patna
7. ANLI dataset license …; PAWS dataset license; MRPC license; STS-B license
8. APWSJ redundancy novelty dataset Zhang Callan Minka 2002 AP WSJ TREC licence availability
9. onnxruntime deterministic output CPU intra_op_num_threads 1 sequential … AVX512
10. onnxruntime github issue different results on different CPU mlas AVX2 AVX512
11. V8 garbage collector copies objects scavenger …; Node.js Buffer pool allocUnsafe sensitive data
12. npm supply chain attack 2026 compromised packages worm (extended)
13. chalk debug npm compromise September 2025 …; Shai-Hulud worm CISA alert
14. crates.io malicious crates removed 2025 2026 Rust supply chain incident stealing keys
15. Node.js reproducible builds npm ci SOURCE_DATE_EPOCH …; Rust cargo --locked reproducible …
16. "TAP-DLND 2.0" novelty detection dataset Ghosal Computational Linguistics 2022
17. Webis-CPC-11 paraphrase corpus license …
18. SGLang deterministic inference enable-deterministic-inference batch invariant LMSYS blog

**WebFetch** (14)
1. near.ai/blog/security-incident-report-sglang-vulnerability
2. github.com/nearai/nearai-cloud-verifier
3. near.ai/privacy-policy
4. near.ai/terms-of-service
5. near.ai/near-ai-data-processing-agreement-for-customers
6. huggingface.co/google/embeddinggemma-300m
7. arxiv.org/html/2409.09249
8. ort.pyke.io (403; repo docs used instead)
9. docs.rs/zeroize
10. cisa.gov alert 2025-09-23
11. microsoft.com ChainDrop blog
12. microsoft.github.io/msmarco
13. nodejs.org/en/blog/vulnerability
14. near.ai/models

**Direct GETs** (curl and `gh api`; public, unauthenticated, read-only)
- **NEAR AI.** cloud-api `/v1/models`; 4 × `/v1/attestation/report`; docs.near.ai `llms.txt` and 22 `.md` pages; probes of near.ai legal URLs.
- **Hugging Face.** HF API metadata for 40 model IDs; 12 `config.json`; 9 `README.md`.
- **MTEB.** 39 per-task JSONs from embeddings-benchmark/results.
- **GitHub repos and PRs.**
  - Read-only shallow clones: nearai/inference-proxy, vllm-proxy, cloud-api, cvm-compose-files.
  - PR bodies: cvm-compose-files #439, #442, #446; inference-proxy #342.
  - Commit list for cvm-compose-files since 2026-11-08.
  - sgl-project/sglang security-advisories (empty) and releases.
- **Rust and runtime docs.**
  - pykeio/ort README and docs.
  - huggingface/candle model list.
  - crates.io API for dryoc, crypto_box, ort, tokenizers.
  - nacl-compat and dryoc READMEs.
  - GitHub languages for 16 repos.
- **Datasets and licences.** facebookresearch/anli README; google-research-datasets/paws README and LICENSE; Zenodo search (Webis-CPC-11, TAP-DLND).
- **Node and ORT.** Node v22 `buffer.md` and `crypto.md`; onnxruntime issue #11833 and comments; onnxruntime `install.js`; npm registry for onnxruntime-node and snarkjs.
- **Earlier prototype.** Repo files; testnet `get_config` via fastnear RPC (rpc.testnet.near.org returned "deprecated").
- **Lockfile resolution (no builds, no scripts).** `cargo generate-lockfile` + `cargo tree` for the Rust probe; `npm install --package-lock-only --ignore-scripts` for the TS probe.
