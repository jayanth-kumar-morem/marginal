/**
 * The Sealed-mode prover (SDD §3.17; E10.3).
 *
 * In Open mode the room publishes its components and clearing recomputes the price. In Sealed mode
 * it publishes neither: it commits to the scores, proves that the price follows from them under
 * `KnowledgeV1` and R1, and clearing checks the proof. The buyer learns the outcome and the price
 * and nothing else.
 *
 * Three things are deliberate here.
 *
 * **The circuit's keys come out of the measured image.** The witness generator and the proving key
 * are read through `readVerified`, like the embedder's weights, so a host cannot swap in a key that
 * proves something else (DR-9). The verifying key is governance's, on chain.
 *
 * **The arithmetic is core's, not this file's.** The outcome and the price are what
 * `measured_index` and `apply_rule` say, through `@marginal/core-wasm`; this file only arranges
 * them into the circuit's public inputs. A prover that disagreed with the contract would produce
 * proofs the contract rejects, which is the failure mode worth having.
 *
 * **The commitment is Poseidon, over the job as well as the scores.** `jc_hi`/`jc_lo` are the job
 * commitment's two 128-bit limbs, so an opening cannot be moved to another job (§3.17).
 */
import { fileURLToPath } from "node:url";

import { call } from "@marginal/core-wasm";
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";

import { randomBytes } from "./crypto/sodium.js";
import { readVerified } from "./measured.js";

/** Where the circuit's artefacts live: beside the room, inside the image. */
export const CIRCUIT_DIR = fileURLToPath(new URL("../../circuits/", import.meta.url));
const WITNESS_WASM = "build/formula_knowledge_v1_js/formula_knowledge_v1.wasm";
const PROVING_KEY = "build/formula_knowledge_v1.zkey";

/** The only formula and rule the committed verifying key is for (§3.17). */
export const SEALED_FORMULA = "KnowledgeV1";

/** What the room knows and the contract will check the proof against. */
export interface SealedJob {
  /** The job commitment, hex. */
  readonly jobCommitment: string;
  /** The buyer's budget, decimal. */
  readonly budget: string;
  /** R1's posted ask, decimal. */
  readonly ask: string;
  readonly lFloorBps: number;
}

/** What the measurement produced, and stays private. */
export interface SealedScores {
  /** The appraiser's two components, in bps. */
  readonly components: readonly number[];
  /** The judges' factors, in bps, at most two. */
  readonly factors: readonly number[];
}

/** The body a Sealed verdict carries. */
export interface SealedBody {
  /** The Poseidon commitment, as the 32 bytes the contract reads as a field element. */
  readonly commitment: string;
  readonly shown: never[];
  readonly outcome: "Deal" | "NoDeal";
  /** Decimal. */
  readonly price: string;
  /** The proof, hex, in `marginal-groth16`'s encoding. */
  readonly proof: string;
}

/**
 * The circuit takes exactly two judge factors because the schema allows at most two (§3.16). A
 * judge that did not run is a whole: `min(l, 10000) = l`, which is what core's `judgement_factor`
 * does with an absent factor.
 */
export function judgeInputs(factors: readonly number[]): [number, number] {
  if (factors.length > 2) throw new Error("prove: the circuit takes at most two judge factors");
  return [factors[0] ?? 10_000, factors[1] ?? 10_000];
}

/**
 * A field element as the decimal the circuit takes, from the little-endian bytes core works in.
 * The contract and the circuit agree on the value; only the spelling differs.
 */
export function fieldDecimal(littleEndianHex: string): string {
  let bigEndian = "";
  for (let at = littleEndianHex.length; at > 0; at -= 2) {
    bigEndian += littleEndianHex.slice(at - 2, at);
  }
  return BigInt(`0x${bigEndian}`).toString();
}

/**
 * R1's ask, out of the listing's rule. The committed verifying key is for R1, so any other rule is
 * one this room cannot prove anything about.
 */
export function postedAsk(rule: unknown): string {
  const posted = (rule as { Posted?: { ask?: unknown } } | null)?.Posted;
  if (typeof posted?.ask !== "string") {
    throw new Error("prove: sealed mode is built for R1 (Posted), and this listing uses another rule");
  }
  return posted.ask;
}

/** The two 128-bit limbs of a job commitment, as the circuit's first two public inputs. */
export function limbs(jobCommitment: string): { jc_hi: string; jc_lo: string } {
  const { hi, lo } = call("commitment_limbs", { commitment: jobCommitment }) as {
    hi: string;
    lo: string;
  };
  return { jc_hi: fieldDecimal(hi), jc_lo: fieldDecimal(lo) };
}

/** A field element, little-endian, as the contract reads one. */
function fieldBytes(decimal: string): string {
  return call("groth16_inputs_encode", { signals: [decimal] }) as string;
}

/**
 * Prices the scores the way clearing would, and proves it. `salt` is a parameter so a test can pin
 * it; a real job draws one, which is what keeps the commitment from being a lookup table over the
 * alphabet of possible scores.
 */
export async function proveSealed(
  job: SealedJob,
  scores: SealedScores,
  salt: string = BigInt(`0x${Buffer.from(randomBytes(31)).toString("hex")}`).toString(),
): Promise<SealedBody> {
  const [c1, c2] = scores.components;
  if (c1 === undefined || c2 === undefined || scores.components.length !== 2) {
    throw new Error("prove: KnowledgeV1 takes two components");
  }
  const [l1, l2] = judgeInputs(scores.factors);
  const m = call("measured_index", {
    formula: SEALED_FORMULA,
    components: [c1, c2],
    params: { delta_star_bps: 0 },
    l_floor: job.lFloorBps,
    factors: [...scores.factors],
  }) as number;
  const priced = call("apply_rule", {
    rule: { Posted: { ask: job.ask } },
    budget: job.budget,
    m,
  }) as "NoDeal" | { Deal: { price: string } };
  const outcome: "Deal" | "NoDeal" = priced === "NoDeal" ? "NoDeal" : "Deal";
  const price = priced === "NoDeal" ? "0" : priced.Deal.price;

  const poseidon = await buildPoseidon();
  const { jc_hi, jc_lo } = limbs(job.jobCommitment);
  const commitment = poseidon.F.toObject(
    poseidon([jc_hi, jc_lo, c1, c2, l1, l2, salt]),
  ).toString() as string;
  const { proof } = await groth16.fullProve(
    {
      jc_hi,
      jc_lo,
      budget: job.budget,
      ask: job.ask,
      l_floor: String(job.lFloorBps),
      outcome: outcome === "Deal" ? "1" : "0",
      price,
      commitment,
      c1: String(c1),
      c2: String(c2),
      l1: String(l1),
      l2: String(l2),
      salt,
    },
    readVerified(CIRCUIT_DIR, WITNESS_WASM),
    readVerified(CIRCUIT_DIR, PROVING_KEY),
  );
  const body = {
    commitment: fieldBytes(commitment),
    shown: [] as never[],
    outcome,
    price,
    proof: call("groth16_proof_encode", proof) as string,
  };
  // One proof per job, and the pool costs more than it saves: a worker that kept it would hold
  // threads open between jobs, and a process that proved once would never exit.
  await closeProver();
  return body;
}

/**
 * Releases snarkjs's worker pool. It is cached on the global object, so anything that proves or
 * verifies has to put it back or the process stays alive.
 */
export async function closeProver(): Promise<void> {
  const curve = globalThis.curve_bn128;
  // snarkjs sets the field to `null` when it tears the pool down itself, so this is a truth test
  // rather than a check for `undefined`.
  if (curve) {
    globalThis.curve_bn128 = undefined;
    await curve.terminate();
  }
}
