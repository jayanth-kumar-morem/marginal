/**
 * The sentence embedder (SDD §3.14.3, §3.15.1; E8.6): `all-MiniLM-L6-v2` on CPU, from files baked
 * into the measured image.
 *
 * Three things here are deliberate.
 *
 * **No runtime download.** The weights and the tokenizer are loaded from `room/models/` and each
 * file is checked against `SHA256SUMS` before it is used. LETHE fetched the model from the network
 * at run time; a room that did that would be scoring with weights the host chose (DR-9).
 *
 * **`onnxruntime-web`, not `onnxruntime-node`.** The node package has a `postinstall` that
 * downloads a native binary, which cannot run in an image built with `--ignore-scripts`, and its
 * kernels are chosen by CPU instruction set — so results are byte-identical per CPU model rather
 * than everywhere. The wasm build has no install step and the same kernels on every machine, which
 * is what AC-38 wants.
 *
 * **One thread, one sentence at a time, a fixed length.** Determinism is worth more than speed in a
 * room whose outputs are signed: no thread pool, no batch-shape variance, and every input padded to
 * the 128 tokens `tokenizer.json` specifies.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-web";

import { MAX_TOKENS, encode, type TokenizerModel } from "./tokenizer.js";

/** `all-MiniLM-L6-v2`'s output width. */
export const EMBED_DIMENSIONS = 384;

/** Where the weights live: beside the room, inside the image. */
export const MODEL_DIR = fileURLToPath(new URL("../../../models/all-MiniLM-L6-v2/", import.meta.url));

export interface Embedder {
  /** One unit-length vector per text, in order. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

/**
 * Reads a file and refuses it unless its SHA-256 is the one `SHA256SUMS` records. The sums file is
 * part of the image and therefore of the compose hash, so a swapped weight file cannot pass
 * unnoticed.
 */
export function readVerified(dir: string, name: string): Buffer {
  const sums = readFileSync(`${dir}SHA256SUMS`, "utf8");
  const line = sums.split("\n").find((row) => row.trimEnd().endsWith(` ${name}`));
  if (line === undefined) throw new Error(`models: ${name} is not in SHA256SUMS`);
  const expected = line.slice(0, 64);
  const bytes = readFileSync(`${dir}${name}`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`models: ${name} is ${actual}, not ${expected}`);
  return bytes;
}

/**
 * Mean-pools the token vectors over the attention mask and scales the result to unit length, which
 * is what makes a dot product a cosine. The loops go through `entries()` rather than by index so
 * that there is no "what if this slot is missing" case to handle that cannot happen.
 */
export function meanPool(hidden: Float32Array, mask: readonly number[]): Float32Array {
  const tokens = [...mask.entries()].filter(([, bit]) => bit === 1).map(([token]) => token);
  if (tokens.length === 0) throw new Error("models: the attention mask covers no token");
  if ((Math.max(...tokens) + 1) * EMBED_DIMENSIONS > hidden.length) {
    throw new Error("models: the output is shorter than the mask it is pooled over");
  }
  let pooled = new Float32Array(EMBED_DIMENSIONS);
  for (const token of tokens) {
    const from = token * EMBED_DIMENSIONS;
    const vector = hidden.subarray(from, from + EMBED_DIMENSIONS);
    // The length check above guarantees every unit of every counted token is present.
    pooled = pooled.map((sum, unit) => sum + (vector[unit] as number));
  }
  const mean = pooled.map((sum) => sum / tokens.length);
  const length = Math.sqrt(mean.reduce((norm, value) => norm + value * value, 0));
  return mean.map((value) => value / length);
}

/** The runtime's output, if it really is the float tensor the model declares. */
export function asFloats(data: unknown): Float32Array {
  if (!(data instanceof Float32Array)) {
    throw new Error("models: the embedder did not return a float tensor");
  }
  return data;
}

/** Loads the model and the tokenizer, verifying both, and returns an embedder. */
export async function embedder(dir: string = MODEL_DIR): Promise<Embedder> {
  const tokenizer = JSON.parse(
    readVerified(dir, "tokenizer.json").toString("utf8"),
  ) as TokenizerModel;
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "error";
  const session = await ort.InferenceSession.create(
    new Uint8Array(readVerified(dir, "onnx/model.onnx")),
    { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
  );

  return {
    async embed(texts: readonly string[]): Promise<Float32Array[]> {
      const vectors: Float32Array[] = [];
      for (const text of texts) {
        const encoded = encode(text, tokenizer);
        const shape = [1, MAX_TOKENS];
        const int64 = (values: readonly number[]): ort.Tensor =>
          new ort.Tensor("int64", BigInt64Array.from(values, BigInt), shape);
        const output = await session.run({
          input_ids: int64(encoded.ids),
          attention_mask: int64(encoded.attentionMask),
          token_type_ids: int64(encoded.typeIds),
        });
        vectors.push(meanPool(asFloats(output.last_hidden_state?.data), encoded.attentionMask));
      }
      return vectors;
    },
  };
}

/** Cosine similarity of two unit vectors: their dot product. */
export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("models: these vectors are different widths");
  let sum = 0;
  // Same length, so every unit of `b` is present.
  for (const [unit, value] of a.entries()) sum += value * (b[unit] as number);
  return sum;
}
