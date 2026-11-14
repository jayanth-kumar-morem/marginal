import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MPC_PUBLIC_KEY } from "./testing.js";

const IMAGE_DIR = fileURLToPath(new URL("../image/", import.meta.url));
const BUILD = `${IMAGE_DIR}build.sh`;

const PINS = {
  "--image": `ghcr.io/example/marginal-room@sha256:${"ab".repeat(32)}`,
  "--rpc-url": "https://test.rpc.fastnear.com",
  "--operator-url": "http://10.0.2.2:8090",
  "--clearing": "clearing.marginal-demo.testnet",
  "--keypolicy": "keypolicy.marginal-demo.testnet",
  "--chain-id": "testnet",
  "--mpc-public-key": MPC_PUBLIC_KEY,
};

/** Runs the compose step and returns what it printed, keyed by name. */
function compose(overrides: Record<string, string> = {}): Record<string, string> {
  const args = ["compose"];
  for (const [flag, value] of Object.entries({ ...PINS, ...overrides })) args.push(flag, value);
  const printed = execFileSync(BUILD, args, { encoding: "utf8" });
  return Object.fromEntries(
    printed
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

test("the same pins and the same tree give the same compose hash (DRC-3)", () => {
  const first = compose();
  const second = compose();
  assert.match(first.compose_hash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(second.compose_hash, first.compose_hash);
  assert.equal(first.app_id, first.compose_hash?.slice(0, 40), "the app id is the first 20 bytes");

  // And a different pin is a different room: this is what makes the hash worth checking.
  const elsewhere = compose({ "--rpc-url": "https://rpc.testnet.near.org" });
  assert.notEqual(elsewhere.compose_hash, first.compose_hash);
  const otherImage = compose({ "--image": `ghcr.io/example/marginal-room@sha256:${"cd".repeat(32)}` });
  assert.notEqual(otherImage.compose_hash, first.compose_hash);
});

test("the hash is the hash of the file, which is what dstack measures", () => {
  const printed = compose();
  const bytes = readFileSync(`${IMAGE_DIR}out/app-compose.json`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), printed.compose_hash);
  // dstack hashes these bytes; its SDKs predict the hash from canonical JSON. The file is written
  // in canonical form so the two answers cannot differ.
  const text = bytes.toString("utf8");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.equal(text, JSON.stringify(parsed), "compact, and already in key order");
  assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
});

test("the deployed app-compose is the one §3.13 requires", () => {
  compose();
  const parsed = JSON.parse(readFileSync(`${IMAGE_DIR}out/app-compose.json`, "utf8")) as Record<
    string,
    unknown
  >;
  assert.equal(parsed.key_provider, "none", "no KMS, so no Marginal key derives from dstack");
  assert.equal(parsed.kms_enabled, false);
  assert.equal(parsed.local_key_provider_enabled, false);
  assert.equal(parsed.key_provider_id, "");
  assert.equal(parsed.gateway_enabled, false);
  assert.deepEqual(parsed.allowed_envs, [], "dstack drops every host-supplied variable");
  assert.equal(parsed.no_instance_id, true, "the only thing that makes instance-id empty");
  assert.equal(parsed.secure_time, false);
  assert.equal(parsed.public_logs, false);
  assert.equal(parsed.public_sysinfo, false);
  assert.equal(parsed.public_tcbinfo, true);
  assert.equal(parsed.runner, "docker-compose");
  for (const forbidden of ["init_script", "event_log_version", "pre_launch_script", "os_image_hash"]) {
    assert.equal(forbidden in parsed, false, `${forbidden} would change or add an RTMR3 event`);
  }
});

test("the compose file is embedded verbatim, with every pin filled in and no env_file", () => {
  const printed = compose();
  const embedded = (
    JSON.parse(readFileSync(`${IMAGE_DIR}out/app-compose.json`, "utf8")) as {
      docker_compose_file: string;
    }
  ).docker_compose_file;
  assert.equal(embedded, readFileSync(`${IMAGE_DIR}out/docker-compose.yaml`, "utf8"));
  assert.equal(/@@[A-Z_]+@@/.test(embedded), false, "nothing left unsubstituted");
  assert.equal(/^\s*env_file:/m.test(embedded), false, "nothing is read from the host");
  assert.match(embedded, /read_only: true/);
  assert.match(embedded, /cap_drop:\n\s+- ALL/);
  for (const value of Object.values(PINS)) assert.ok(embedded.includes(value), value);
  assert.match(printed.compose_hash ?? "", /^[0-9a-f]{64}$/);
});

test("a build without its pins is refused, not guessed", () => {
  for (const missing of [
    "--image",
    "--rpc-url",
    "--operator-url",
    "--clearing",
    "--keypolicy",
    "--mpc-public-key",
  ]) {
    const args = ["compose"];
    for (const [flag, value] of Object.entries(PINS)) {
      if (flag !== missing) args.push(flag, value);
    }
    assert.throws(
      () => execFileSync(BUILD, args, { encoding: "utf8", stdio: "pipe" }),
      new RegExp(`${missing.slice(2)} is required`),
      missing,
    );
  }
  assert.throws(
    () => execFileSync(BUILD, ["compose", "--nonsense", "x"], { stdio: "pipe" }),
    /unknown argument/,
  );
  assert.throws(() => execFileSync(BUILD, [], { stdio: "pipe" }), /./);
});
