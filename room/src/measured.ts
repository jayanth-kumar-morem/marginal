/**
 * Files that come out of the measured image (DR-9).
 *
 * Nothing the room scores or proves with comes off the network at run time: the weights, the
 * tokenizer and the circuit's keys are baked into the image and checked against a `SHA256SUMS` that
 * is part of the same image, and therefore of the compose hash a seller pinned. A swapped file is
 * refused rather than used.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Reads a file and refuses it unless its SHA-256 is the one `SHA256SUMS` in `dir` records. `name`
 * is the path the sums file lists, which may be in a subdirectory.
 */
export function readVerified(dir: string, name: string): Buffer {
  const sums = readFileSync(`${dir}SHA256SUMS`, "utf8");
  const line = sums.split("\n").find((row) => row.trimEnd().endsWith(` ${name}`));
  if (line === undefined) throw new Error(`measured: ${name} is not in SHA256SUMS`);
  const expected = line.slice(0, 64);
  const bytes = readFileSync(`${dir}${name}`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`measured: ${name} is ${actual}, not ${expected}`);
  return bytes;
}
