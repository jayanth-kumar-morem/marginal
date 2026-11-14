import test from "node:test";
import assert from "node:assert/strict";

import { main } from "./main.js";

const env = {
  MARGINAL_RPC_URL: "http://127.0.0.1:1",
  MARGINAL_AGENT_ACCOUNT: "agent.testnet",
  MARGINAL_AGENT_KEY: "ed25519:4HhNGLKJVVpGLJGyLQqNLrxh1kXgbDaYGLgmWVnfRHGRXNSKPSPvMRPcCSNyWEqRrEUqmPSSUx2bmTJPSrGvNZXP",
  MARGINAL_CLEARING: "clearing.testnet",
  MARGINAL_KEYPOLICY: "keypolicy.testnet",
  MARGINAL_GATEWAY_URL: "http://127.0.0.1:2",
  PORT: "0",
  MARGINAL_NEARAI_BASE: "http://nearai.test",
};

test("the agent starts from the environment and says which judges it has", async () => {
  const lines: string[] = [];
  const started = await main(env, (line) => lines.push(line));
  try {
    const health = await fetch(`http://127.0.0.1:${started.port}/v1/health`);
    assert.deepEqual(await health.json(), { ok: true, package: "@marginal/operator-agent" });
    assert.match(lines[0] ?? "", /judges simulated$/);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }

  // **An empty key is no key.** The deploy writes `MARGINAL_NEARAI_KEY=` into the services' env
  // file when the operator has not bought one ([P-2]), and compose substitutes a missing variable
  // as "". Testing for `undefined` made the agent log `judges live` and call NEAR AI with a blank
  // key — seen in a real run of the local stack, where it should have said `simulated`.
  const blank = await main({ ...env, MARGINAL_NEARAI_KEY: "" }, (line) => lines.push(line));
  assert.match(lines.at(-1) ?? "", /judges simulated$/, "an empty key is no key");
  await new Promise<void>((resolve) => blank.server.close(() => resolve()));

  const withKey = await main({ ...env, MARGINAL_NEARAI_KEY: "secret" }, (line) => lines.push(line));
  try {
    assert.match(lines.at(-1) ?? "", /judges live$/);
    assert.equal(lines.join("\n").includes("secret"), false, "and never the key itself");
  } finally {
    await new Promise<void>((resolve) => withKey.server.close(() => resolve()));
  }

  // The sandbox's simulated attestation comes from the environment too, and a value that is wrong
  // is refused by name when a room tries to use it — never at startup, and never by falling back.
  const sim = await main(
    {
      ...env,
      MARGINAL_SIM_MEASUREMENT: JSON.stringify({
        mrtd: "aa".repeat(48),
        rtmr0: "bb".repeat(48),
        rtmr1: "cc".repeat(48),
        rtmr2: "dd".repeat(48),
        compose_hash: "ee".repeat(32),
        key_provider_digest: "11".repeat(48),
      }),
      MARGINAL_SIM_PPID: "ab",
    },
    (line) => lines.push(line),
  );
  try {
    const refused = await fetch(`http://127.0.0.1:${sim.port}/v1/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sign_pk: "01".repeat(32),
        box_pk: "02".repeat(32),
        nonce: "ab".repeat(32),
        class: "Kcpu",
        simulated: true,
      }),
    });
    assert.equal(refused.status, 503);
    assert.match(((await refused.json()) as { error: string }).error, /MARGINAL_SIM_PPID must be 32 hex/);
  } finally {
    await new Promise<void>((resolve) => sim.server.close(() => resolve()));
  }

  for (const missing of [
    "MARGINAL_RPC_URL",
    "MARGINAL_AGENT_ACCOUNT",
    "MARGINAL_AGENT_KEY",
    "MARGINAL_CLEARING",
    "MARGINAL_KEYPOLICY",
    "MARGINAL_GATEWAY_URL",
  ]) {
    const short = { ...env, [missing]: "" };
    await assert.rejects(() => main(short, () => {}), new RegExp(`${missing} is required`), missing);
  }
});
