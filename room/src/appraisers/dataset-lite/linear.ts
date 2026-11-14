/**
 * The linear algebra `dataset-lite@0` needs (SDD §3.15.3; E8.7): a closed-form ridge classifier.
 *
 * Deliberately the simplest thing that can measure lift: one-vs-rest least squares on frozen
 * embeddings, solved in closed form, in float64, with a fixed λ. No iteration, no learning rate, no
 * random initialisation — so two rooms given the same rows produce the same accuracy to the last
 * bit, which is what a signed measurement needs (AC-38).
 *
 * The datasheet says what this is not: a linear probe on frozen embeddings is not predictive of
 * what fine-tuning a model on the same rows would buy. The v2 lift test replaces it.
 */

/** Ridge penalty. Fixed, because a tuned one would be a parameter a seller could game. */
export const LAMBDA = 1;

/**
 * Solves `(A + λI) w = b` by Cholesky, for a symmetric positive-definite `A` given as rows.
 *
 * Returns `undefined` if the matrix is not positive definite, which with λ > 0 means the input was
 * degenerate rather than merely collinear — a caller treats that as "no measurement", not zero.
 */
export function choleskySolve(
  a: readonly Float64Array[],
  b: readonly Float64Array[],
  lambda = LAMBDA,
): Float64Array[] | undefined {
  const n = a.length;
  // L, lower triangular, in place.
  const l = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    const rowA = a[i] as Float64Array;
    const rowL = l[i] as Float64Array;
    for (let j = 0; j <= i; j += 1) {
      const colL = l[j] as Float64Array;
      let sum = rowA[j] as number;
      if (i === j) sum += lambda;
      for (let k = 0; k < j; k += 1) sum -= (rowL[k] as number) * (colL[k] as number);
      if (i === j) {
        if (sum <= 0) return undefined;
        rowL[j] = Math.sqrt(sum);
      } else {
        rowL[j] = sum / (colL[j] as number);
      }
    }
  }
  // Forward then back substitution, once per right-hand side.
  return b.map((rhs) => {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const rowL = l[i] as Float64Array;
      let sum = rhs[i] as number;
      for (let k = 0; k < i; k += 1) sum -= (rowL[k] as number) * (y[k] as number);
      y[i] = sum / (rowL[i] as number);
    }
    const w = new Float64Array(n);
    for (let i = n - 1; i >= 0; i -= 1) {
      let sum = y[i] as number;
      for (let k = i + 1; k < n; k += 1) sum -= ((l[k] as Float64Array)[i] as number) * (w[k] as number);
      w[i] = sum / ((l[i] as Float64Array)[i] as number);
    }
    return w;
  });
}

/** `Xᵀ X` and `Xᵀ Y`, the normal equations of a least-squares fit. */
export function normalEquations(
  rows: readonly Float32Array[],
  targets: readonly Float64Array[],
): { gram: Float64Array[]; moments: Float64Array[] } {
  const first = rows[0];
  if (first === undefined) throw new Error("dataset-lite: there are no rows to fit");
  const width = first.length;
  const gram = Array.from({ length: width }, () => new Float64Array(width));
  const moments = targets.map(() => new Float64Array(width));
  for (const [index, row] of rows.entries()) {
    for (let i = 0; i < width; i += 1) {
      const value = row[i] as number;
      const gramRow = gram[i] as Float64Array;
      for (let j = i; j < width; j += 1) {
        gramRow[j] = (gramRow[j] as number) + value * (row[j] as number);
      }
      for (const [label, target] of targets.entries()) {
        const moment = moments[label] as Float64Array;
        moment[i] = (moment[i] as number) + value * (target[index] as number);
      }
    }
  }
  // Mirror the upper triangle: the Gram matrix is symmetric.
  for (let i = 0; i < width; i += 1) {
    for (let j = 0; j < i; j += 1) {
      (gram[i] as Float64Array)[j] = (gram[j] as Float64Array)[i] as number;
    }
  }
  return { gram, moments };
}

/** The label a one-vs-rest fit scores highest for a row. */
export function predict(weights: readonly Float64Array[], row: Float32Array): number {
  let best = -Infinity;
  let label = 0;
  for (const [index, w] of weights.entries()) {
    let score = 0;
    for (let i = 0; i < row.length; i += 1) score += (w[i] as number) * (row[i] as number);
    if (score > best) {
      best = score;
      label = index;
    }
  }
  return label;
}

/**
 * A deterministic bootstrap: `xorshift128+` seeded from the job commitment, so the interval is the
 * same in every room that measures the same job (§3.15.3).
 */
export function seededRandom(seed: Uint8Array): () => number {
  let state = 0n;
  for (const byte of seed.subarray(0, 8)) state = (state << 8n) | BigInt(byte);
  // A zero seed would make the generator constant, and a job commitment of eight zero bytes is a
  // commitment somebody chose, so it is worth refusing rather than quietly degrading.
  if (state === 0n) throw new Error("dataset-lite: the bootstrap seed is zero");
  return () => {
    state ^= (state << 13n) & 0xffffffffffffffffn;
    state ^= state >> 7n;
    state ^= (state << 17n) & 0xffffffffffffffffn;
    return Number(state % 1_000_000n) / 1_000_000;
  };
}

/** The `p`-th percentile of a sample, by nearest rank. */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index] as number;
}
