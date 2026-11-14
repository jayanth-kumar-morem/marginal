import test from "node:test";
import assert from "node:assert/strict";

import {
  account,
  amount,
  bits,
  height,
  leakageUsedPercent,
  near,
  percent,
  short,
  tokens,
  when,
} from "./format";

test("an amount is split, not rounded: what is shown is what is stored", () => {
  assert.equal(amount("400000000"), "400");
  assert.equal(amount("400000001"), "400.000001");
  assert.equal(amount("1"), "0.000001");
  assert.equal(amount("0"), "0");
  assert.equal(amount("1234567890123"), "1,234,567.890123");
  // A u128 beyond Number.MAX_SAFE_INTEGER keeps every digit.
  assert.equal(
    amount("340282366920938463463374607431768211455"),
    "340,282,366,920,938,463,463,374,607,431,768.211455",
  );
  assert.equal(tokens("400000000"), "400 mUSDC");
  assert.equal(tokens("5000000", "USDC"), "5 USDC");
  // A token with another precision: the decimals are a parameter, not an assumption.
  assert.equal(tokens("5000000000000000000", "DAI", 18), "5 DAI");
  assert.equal(near("30000000000000000000000"), "0.03 NEAR");
});

test("basis points, bits and heights read the way the contracts count them", () => {
  assert.equal(percent(10_000), "100%");
  assert.equal(percent(8_250), "82.5%");
  assert.equal(percent(8_255), "82.55%");
  assert.equal(percent(0), "0%");
  assert.equal(bits(1_000), "1 bit");
  assert.equal(bits(1_500), "1.5 bits");
  assert.equal(bits(0), "0 bits");
  assert.equal(height(1_234_567), "1,234,567");
  assert.equal(when(1_794_000_000), "2026-11-06 21:20Z");
});

test("a hash is elided in the middle and an account only when it must be", () => {
  const hash = "62f7e87dc29e6c5bf157a3a90a2acc0d40c6bc5fc15525abbcff30c8e6b0f4ff";
  assert.equal(short(hash), "62f7e8…b0f4ff");
  assert.equal(short("abc"), "abc");
  // Exactly 2 × keep + 1 characters is shorter than its own elision, so it is left alone.
  assert.equal(short("abcdefghijklm", 6), "abcdefghijklm");
  assert.equal(short("abcdefghijklmn", 6), "abcdef…ijklmn");
  assert.equal(account("buyer.testnet"), "buyer.testnet");
  assert.equal(account("buyer.testnet", 8), "buyer.testnet", "a short name is left alone");
  assert.equal(account("a-considerably-longer-name.testnet", 10), "a-cons…r-name.testnet");
  assert.equal(
    account("a-very-long-account-name-indeed.marginal-demo.testnet"),
    "a-very…indeed.marginal-demo.testnet",
  );
  // An implicit account (a 64-hex id) has no dot to split on.
  assert.equal(account("0".repeat(64)), "000000…000000");
});

test("the leakage meter counts reserved bits as gone, because they are committed", () => {
  assert.equal(
    leakageUsedPercent({ budget_mbits: 32_000, reserved_mbits: 0, spent_mbits: 8_000 }),
    25,
  );
  assert.equal(
    leakageUsedPercent({ budget_mbits: 32_000, reserved_mbits: 8_000, spent_mbits: 8_000 }),
    50,
  );
  // Never over 100, and a listing with no budget is full rather than a division by zero.
  assert.equal(
    leakageUsedPercent({ budget_mbits: 1_000, reserved_mbits: 1_000, spent_mbits: 1_000 }),
    100,
  );
  assert.equal(leakageUsedPercent({ budget_mbits: 0, reserved_mbits: 0, spent_mbits: 0 }), 100);
});
