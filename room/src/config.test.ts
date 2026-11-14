import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULTS, loadConfig } from "./config.js";

const complete = {
  MARGINAL_RPC_URL: "https://rpc.testnet.near.org",
  MARGINAL_CHAIN_ID: "testnet",
  MARGINAL_CLEARING: "clearing.marginal-demo.testnet",
  MARGINAL_KEYPOLICY: "keypolicy.marginal-demo.testnet",
  MARGINAL_OPERATOR_URL: "http://127.0.0.1:8080",
};

test("the RPC URL is the only operator input; everything else has a default or is fixed", () => {
  const config = loadConfig({ ...complete });
  assert.equal(config.rpcUrl, "https://rpc.testnet.near.org");
  assert.equal(config.roomClass, DEFAULTS.roomClass);
  assert.equal(config.dstackSocket, DEFAULTS.dstackSocket);
  assert.equal(config.pollMs, DEFAULTS.pollMs);
  assert.equal(config.maxWorkers, DEFAULTS.maxWorkers);
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

test("the room class is one the registry knows", () => {
  assert.throws(() => loadConfig({ ...complete, MARGINAL_ROOM_CLASS: "G" }), /MARGINAL_ROOM_CLASS/);
  assert.throws(() => loadConfig({ ...complete, MARGINAL_ROOM_CLASS: "" }), /MARGINAL_ROOM_CLASS/);
});
