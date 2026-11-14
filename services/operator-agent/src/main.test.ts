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

  const withKey = await main({ ...env, MARGINAL_NEARAI_KEY: "secret" }, (line) => lines.push(line));
  try {
    assert.match(lines.at(-1) ?? "", /judges live$/);
    assert.equal(lines.join("\n").includes("secret"), false, "and never the key itself");
  } finally {
    await new Promise<void>((resolve) => withKey.server.close(() => resolve()));
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
