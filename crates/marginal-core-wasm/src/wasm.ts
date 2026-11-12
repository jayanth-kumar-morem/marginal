// Loads marginal-core's wasm build and exposes its one function. Built by `make wasm-core` into
// `core.wasm` at the package root, which is where both `src/` and `dist/` find it.
import { readFileSync } from "node:fs";

interface Exports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  call_raw(op: number, opLen: number, input: number, inputLen: number): number;
}

const wasm = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(new URL("../core.wasm", import.meta.url))), {}).exports as unknown as Exports;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A refusal from marginal-core: a stable code such as `E_SCHEMA` (SDD §4.1). */
export class CoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CoreError";
  }
}

function write(text: string): { ptr: number; len: number } {
  const bytes = encoder.encode(text);
  const ptr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  return { ptr, len: bytes.length };
}

/**
 * Runs one operation of marginal-core: pricing (`apply_rule`, `measured_index`, ...), `max_debit`,
 * `job_commitment`, the Borsh encode/decode, signing bytes and hashes of verdicts, certificates
 * and deliveries, the audit chain step and the conservation check. The input and the result are the
 * JSON model of `marginal_core::json` (amounts are decimal strings, bytes are hex). Throws
 * {@link CoreError} when the core refuses, including `E_DECODE` for an unknown operation or input of
 * the wrong shape. The operations are listed in `crates/marginal-core-wasm/src/lib.rs`.
 */
export function call(op: string, input: unknown): unknown {
  const opText = write(op);
  const inputText = write(JSON.stringify(input));
  const reply = wasm.call_raw(opText.ptr, opText.len, inputText.ptr, inputText.len);
  wasm.dealloc(opText.ptr, opText.len);
  wasm.dealloc(inputText.ptr, inputText.len);

  // Read the reply through a fresh view: the call may have grown (and so detached) the old buffer.
  const length = new DataView(wasm.memory.buffer, reply, 4).getUint32(0, true);
  const text = decoder.decode(new Uint8Array(wasm.memory.buffer, reply + 4, length));
  wasm.dealloc(reply, 4 + length);

  const result = JSON.parse(text) as { ok: unknown } | { err: string };
  if ("err" in result) throw new CoreError(result.err);
  return result.ok;
}
