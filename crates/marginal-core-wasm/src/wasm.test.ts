import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CoreError, call } from "./index.js";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CoreError, `expected a CoreError, got ${String(e)}`);
    return e.code;
  }
  throw new Error("did not throw");
};

test("a successful call returns the value", () => {
  assert.equal(call("mbits", { n: 21 }), 4393);
  assert.deepEqual(call("apply_rule", { rule: { Posted: { ask: "400" } }, budget: "1000", m: 5000 }), { Deal: { price: "400" } });
});

test("a refusal throws a CoreError with the stable code", () => {
  assert.equal(code(() => call("mbits", { n: 0 })), "E_SCHEMA_INVALID");
  const refused = (() => {
    try {
      call("mbits", { n: 0 });
    } catch (e) {
      return e as CoreError;
    }
  })();
  assert.equal(refused?.name, "CoreError");
  assert.equal(refused?.message, "E_SCHEMA_INVALID");
});

test("an unknown operation, or input of the wrong shape, is E_DECODE", () => {
  assert.equal(code(() => call("no_such_op", {})), "E_DECODE");
  assert.equal(code(() => call("mbits", { n: "21" })), "E_DECODE");
  assert.equal(code(() => call("mbits", undefined)), "E_DECODE");
});

test("many calls neither leak nor break: memory is freed each time", () => {
  for (let i = 0; i < 3000; i++) assert.equal(call("valuation", { budget: String(i), m: 10000 }), String(i));
});

// A 1 MB good is 2 MB of hex, which makes the module grow its memory mid-call, so the wrapper must
// not hold on to a view of the old buffer. The expected answer is computed here, independently.
test("a large input works and the hash is right", () => {
  const good = Buffer.alloc(1_000_000, 0xab);
  const salt = Buffer.alloc(32, 7);
  const want = createHash("sha256").update(salt).update(good).digest("hex");
  assert.equal(call("good_commitment", { salt: salt.toString("hex"), good: good.toString("hex") }), want);
  assert.equal(call("mbits", { n: 11 }), 3460, "still fine afterwards");
});
