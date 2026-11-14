import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULTS, loadConfig, configEnv} from "./config.js";
import { MPC_PUBLIC_KEY, testConfig } from "./testing.js";

const complete = {
  MARGINAL_RPC_URL: "https://rpc.testnet.near.org",
  MARGINAL_CHAIN_ID: "testnet",
  MARGINAL_CLEARING: "clearing.marginal-demo.testnet",
  MARGINAL_KEYPOLICY: "keypolicy.marginal-demo.testnet",
  MARGINAL_OPERATOR_URL: "http://127.0.0.1:8080",
  MARGINAL_MPC_PUBLIC_KEY: MPC_PUBLIC_KEY,
};

test("the RPC URL is the only operator input; everything else has a default or is fixed", () => {
  const config = loadConfig({ ...complete });
  assert.equal(config.rpcUrl, "https://rpc.testnet.near.org");
  assert.equal(config.roomClass, DEFAULTS.roomClass);
  assert.equal(config.dstackSocket, DEFAULTS.dstackSocket);
  assert.equal(config.pollMs, DEFAULTS.pollMs);
  assert.equal(config.maxWorkers, DEFAULTS.maxWorkers);
  assert.equal(config.mpcPublicKey, MPC_PUBLIC_KEY);
});

test("every value can be overridden for a sandbox run", () => {
  const config = loadConfig({
    ...complete,
    MARGINAL_ROOM_CLASS: "K",
    MARGINAL_DSTACK_SOCKET: "/tmp/dstack.sock",
    MARGINAL_POLL_MS: "250",
    MARGINAL_MAX_WORKERS: "4",
  });
  assert.equal(config.roomClass, "K");
  assert.equal(config.dstackSocket, "/tmp/dstack.sock");
  assert.equal(config.pollMs, 250);
  assert.equal(config.maxWorkers, 4);
});

test("a room will not start on half a configuration", () => {
  for (const name of Object.keys(complete)) {
    const env = { ...complete, [name]: "" };
    assert.throws(() => loadConfig(env), new RegExp(`${name} is required`), name);
    const missing = { ...complete };
    delete (missing as Record<string, string>)[name];
    assert.throws(() => loadConfig(missing), new RegExp(`${name} is required`), name);
  }
  // Whitespace is not a value.
  assert.throws(() => loadConfig({ ...complete, MARGINAL_CHAIN_ID: "   " }), /required/);
});

test("a URL must be one, and a count must be a positive whole number", () => {
  assert.throws(() => loadConfig({ ...complete, MARGINAL_RPC_URL: "rpc.testnet.near.org" }), /http\(s\) URL/);
  assert.throws(() => loadConfig({ ...complete, MARGINAL_OPERATOR_URL: "unix:/tmp/x" }), /http\(s\) URL/);
  for (const bad of ["0", "-1", "2.5", "many"]) {
    assert.throws(() => loadConfig({ ...complete, MARGINAL_POLL_MS: bad }), /positive integer/, bad);
  }
  assert.equal(loadConfig({ ...complete, MARGINAL_POLL_MS: "" }).pollMs, DEFAULTS.pollMs);
  assert.throws(() => loadConfig({ ...complete, MARGINAL_MAX_WORKERS: "0" }), /positive integer/);
});

test("the MPC key is a pin, and a room will not start on one it cannot use", () => {
  // It is what every derived key is checked against (§3.12.3), so a value of the wrong curve is
  // refused at boot rather than at the first job.
  assert.throws(
    () => loadConfig({ ...complete, MARGINAL_MPC_PUBLIC_KEY: "bls12381g1:abc" }),
    /MARGINAL_MPC_PUBLIC_KEY must be a bls12381g2 key/,
  );
  assert.throws(
    () => loadConfig({ ...complete, MARGINAL_MPC_PUBLIC_KEY: "ed25519:abc" }),
    /must be a bls12381g2 key/,
  );
});

test("a room with no TDX hardware can be told to register with no quote at all", () => {
  // Off unless asked for: a real deployment must never take the simulated path by accident.
  assert.equal(loadConfig({ ...complete }).simulatedAttestation, false);
  for (const on of ["1", "true", "TRUE", " true "]) {
    assert.equal(
      loadConfig({ ...complete, MARGINAL_SIMULATED_ATTESTATION: on }).simulatedAttestation,
      true,
      on,
    );
  }
  // Anything else is off, including the values that mean "no" to a shell.
  for (const off of ["", "   ", "0", "false", "no", "yes", "sim"]) {
    assert.equal(
      loadConfig({ ...complete, MARGINAL_SIMULATED_ATTESTATION: off }).simulatedAttestation,
      false,
      off,
    );
  }
});

test("the room class is one the registry knows", () => {
  assert.throws(() => loadConfig({ ...complete, MARGINAL_ROOM_CLASS: "G" }), /MARGINAL_ROOM_CLASS/);
  assert.throws(() => loadConfig({ ...complete, MARGINAL_ROOM_CLASS: "" }), /MARGINAL_ROOM_CLASS/);
});

/**
 * The round trip the worker depends on. The supervisor forks a worker with no host environment at
 * all, so whatever the worker needs has to be derived from the room's own configuration — and the
 * worker reads it with `loadConfig`. If these two ever disagree, a worker takes its job and dies,
 * which is precisely what happened: `MARGINAL_RPC_URL is required`, with every job left assigned.
 */
test("a room's configuration survives the trip to its worker, exactly", () => {
  const config = testConfig({
    rpcUrl: "http://127.0.0.1:3030",
    chainId: "sandbox",
    clearing: "clearing.sandbox",
    keypolicy: "keypolicy.sandbox",
    operatorUrl: "http://127.0.0.1:8082",
    pollMs: 1_500,
    maxWorkers: 3,
    simulatedAttestation: true,
  });
  assert.deepEqual(loadConfig(configEnv(config)), config, "loadConfig(configEnv(c)) is c");

  // And the other way for the flag, because `false` and "absent" must not be the same mistake.
  const real = testConfig({ simulatedAttestation: false });
  assert.equal(loadConfig(configEnv(real)).simulatedAttestation, false);

  // Nothing of the host's environment is in it: that is the whole reason the worker gets no `env`.
  const names = Object.keys(configEnv(config));
  assert.equal(
    names.every((name) => name.startsWith("MARGINAL_")),
    true,
    `only MARGINAL_* may reach a worker, got ${names.join(", ")}`,
  );
});
