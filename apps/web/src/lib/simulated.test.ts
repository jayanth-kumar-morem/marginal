import test from "node:test";
import assert from "node:assert/strict";

import {
  SIM_ATTESTATION,
  SIM_JUDGE,
  SIM_SETTLEMENT,
  profileBanner,
  simulatedElements,
  simulatedSummary,
} from "./simulated";

test("the bits are the contracts' bits", () => {
  // `marginal_core::types`: SIM_ATTESTATION = 1 << 0, SIM_JUDGE = 1 << 1, SIM_SETTLEMENT = 1 << 2.
  assert.deepEqual([SIM_ATTESTATION, SIM_JUDGE, SIM_SETTLEMENT], [1, 2, 4]);
});

test("a flags byte names its elements, in bit order", () => {
  assert.deepEqual(simulatedElements(0), []);
  assert.deepEqual(
    simulatedElements(SIM_JUDGE).map((e) => e.label),
    ["Simulated judge"],
  );
  assert.deepEqual(
    simulatedElements(SIM_ATTESTATION | SIM_SETTLEMENT).map((e) => e.label),
    ["Simulated attestation", "Simulated settlement"],
  );
  assert.equal(simulatedElements(7).length, 3);
  // Every element says what it means for the record being looked at.
  for (const element of simulatedElements(7)) {
    assert.ok(element.detail.length > 20, element.label);
  }
});

test("a settlement's summary reads as a sentence, however many elements it has", () => {
  assert.equal(simulatedSummary(0), null);
  assert.equal(
    simulatedSummary(SIM_ATTESTATION),
    "This record was produced with a simulated attestation.",
  );
  assert.equal(
    simulatedSummary(SIM_ATTESTATION | SIM_JUDGE),
    "This record was produced with a simulated attestation and simulated judge.",
  );
  assert.equal(
    simulatedSummary(7),
    "This record was produced with a simulated attestation, simulated judge and simulated settlement.",
  );
});

test("a demo profile always carries a banner and a production one never does", () => {
  const banner = profileBanner({ profile: "hdp", network: "testnet", simulatedProfile: true });
  assert.match(banner ?? "", /hdp profile on testnet/);
  assert.match(banner ?? "", /flagged on-chain/);
  assert.equal(
    profileBanner({ profile: "mainnet", network: "mainnet", simulatedProfile: false }),
    null,
  );
});
