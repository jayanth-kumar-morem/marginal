import test from "node:test";
import assert from "node:assert/strict";

import { PCCS_URL, fetchCollateral } from "./collateral.js";

test("with no options at all it looks for dcap-qvl on the path", async () => {
  // There is no `dcap-qvl` in a test environment, and that is the point: the failure names the
  // binary an operator has to install rather than reading as "there is no collateral".
  await assert.rejects(() => fetchCollateral("00ff"), /dcap-qvl could not fetch collateral/);
  assert.equal(PCCS_URL, "https://pccs.phala.network/tdx/certification/v4");
});
