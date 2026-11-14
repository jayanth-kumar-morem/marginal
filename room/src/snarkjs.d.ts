/**
 * `snarkjs` and `circomlibjs` ship no types, and `any` is a lint error here, so this declares the
 * two functions `prove.ts` uses and nothing else. It cannot be called `prove.d.ts`: TypeScript
 * takes an `X.d.ts` beside an `X.ts` to be that file's own output and ignores it. Both are pure JavaScript and wasm, with no
 * install step, which is what lets them be part of the measured image.
 */
declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, string>,
      witnessWasm: Uint8Array,
      provingKey: Uint8Array,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
  export const wtns: {
    calculate(input: Record<string, string>, witnessWasm: Uint8Array, output: unknown): Promise<void>;
  };
}

declare module "circomlibjs" {
  /** A Poseidon over BN254's scalar field: the hash, and the field it works in. */
  export function buildPoseidon(): Promise<{
    (inputs: readonly (string | number)[]): unknown;
    F: { toObject(value: unknown): bigint };
  }>;
}

/**
 * snarkjs caches its BN254 implementation, and its worker pool, on the global object. A process
 * that proved once would never exit while those threads are alive, so `closeProver` terminates
 * them (see `prove.ts`). This file is a global script, not a module, so the declaration goes at the
 * top level: `declare global` is only allowed inside a module.
 */
// eslint-disable-next-line no-var -- a global declaration has to be `var`.
declare var curve_bn128: { terminate(): Promise<void> } | null | undefined;
