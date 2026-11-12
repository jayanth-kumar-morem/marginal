// `fixtures/vectors.json`: the test vectors every implementation of marginal-core must reproduce.
// Shared here so the room and `replay-ts` run the very same check.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { CoreError, call } from "./wasm.js";

export interface VectorCase {
  name: string;
  op: string;
  input: unknown;
  expect: { ok: unknown } | { err: string };
}

export interface Vectors {
  format: number;
  cases: VectorCase[];
}

/** The repository's `fixtures/vectors.json`, found from this file (in `src/` or `dist/`). */
export const vectorsPath = new URL("../../../fixtures/vectors.json", import.meta.url);

export const loadVectors = (path: URL | string = vectorsPath): Vectors => JSON.parse(readFileSync(path, "utf8")) as Vectors;

/**
 * Runs every case through the wasm build and returns one line for each that does not reproduce
 * its recorded answer. An empty list means all of them do, byte for byte.
 */
export function reproduceVectors(vectors: Vectors = loadVectors()): string[] {
  const problems: string[] = [];
  for (const c of vectors.cases) {
    let got: { ok: unknown } | { err: string };
    try {
      got = { ok: call(c.op, c.input) };
    } catch (e) {
      if (!(e instanceof CoreError)) throw e;
      got = { err: e.code };
    }
    if (!isDeepStrictEqual(got, c.expect)) problems.push(`${c.name}: expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`);
  }
  return problems;
}
