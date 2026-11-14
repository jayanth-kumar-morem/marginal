/**
 * The D1 demo corpus (`fixtures/demo/`, E14.2) measured end to end: the room's own `knowledge@1`
 * appraiser, then marginal-core's own pricing. This is DRC-1's headline — the same document at the
 * same 400 mUSDC ask clears for one buyer and not for the other, because of what each already
 * knows — and the test is here so that a change to the corpus, to the embedder or to the formula
 * cannot quietly break it. The figures it pins are recorded in `fixtures/demo/README.md`.
 *
 * It costs about seven seconds, which is the price of that claim not rotting.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { call } from "@marginal/core-wasm";

import { embedder } from "./embed.js";
import { MIN_CONTEXT_CLAIMS, knowledgeAppraiser } from "./index.js";
import { claims } from "./novelty.js";

const demo = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../fixtures/demo/${name}`, import.meta.url)), "utf8");

interface Case {
  readonly good: string;
  readonly need: string;
  readonly rule: { readonly Posted: { readonly ask: string } };
  readonly budget: string;
  readonly buyers: readonly { readonly id: string; readonly context: string }[];
}

const d1 = (JSON.parse(demo("cases.json")) as { d1: Case }).d1;

/** What clearing would reach from the appraiser's components, with no judge in the way. */
function priced(components: readonly number[]): { m: number; valuation: bigint; outcome: unknown } {
  const m = call("measured_index", {
    formula: "KnowledgeV1",
    components,
    params: { delta_star_bps: 0 },
    l_floor: 0,
    factors: [],
  }) as number;
  return {
    m,
    valuation: BigInt(call("valuation", { budget: d1.budget, m }) as string),
    outcome: call("apply_rule", { rule: d1.rule, budget: d1.budget, m }),
  };
}

test("the D1 corpus clears the ask for Fund A and not for Fund B (DRC-1)", async () => {
  const model = await embedder();
  const appraiser = knowledgeAppraiser(model);
  const good = demo(d1.good);
  const ask = BigInt(d1.rule.Posted.ask);

  interface Measured {
    readonly m: number;
    readonly valuation: bigint;
    readonly outcome: unknown;
    readonly novelty: number;
  }
  const measure = async (buyer: Case["buyers"][number]): Promise<Measured> => {
    const context = demo(buyer.context);
    // T7: the pipeline refuses a job with less context than this, so the fixture has to carry it.
    assert.ok(
      claims(context).length >= MIN_CONTEXT_CLAIMS,
      `${buyer.context} has only ${claims(context).length} context claims`,
    );
    const appraisal = await appraiser.appraise({ good, context, need: d1.need, requestId: "drc-1" });
    assert.equal(appraisal.components[1], 10_000, "N_pub is a whole: M1 has no in-room corpus");
    return { ...priced(appraisal.components), novelty: appraisal.components[0] ?? -1 };
  };
  const [fundA, fundB] = [
    await measure(d1.buyers[0] as Case["buyers"][number]),
    await measure(d1.buyers[1] as Case["buyers"][number]),
  ];

  assert.deepEqual(fundA.outcome, { Deal: { price: d1.rule.Posted.ask } }, `Fund A at m=${fundA.m}`);
  assert.equal(fundB.outcome, "NoDeal", `Fund B at m=${fundB.m}`);

  // With a margin, not on the boundary. The ask is 40% of the budget, so the outcome turns at
  // m = 4,000; A sits comfortably above it and B comfortably below, which is what makes the demo
  // robust to a corpus or model edit rather than a fixture tuned to the last basis point.
  assert.ok(fundA.novelty >= 6_000, `Fund A's novelty was only ${fundA.novelty} bps`);
  assert.ok(fundB.novelty <= 2_500, `Fund B's novelty was ${fundB.novelty} bps`);
  assert.ok(fundA.valuation >= ask * 2n, `Fund A valued it at ${fundA.valuation}`);
  assert.ok(fundB.valuation * 2n <= ask, `Fund B valued it at ${fundB.valuation}`);
});
