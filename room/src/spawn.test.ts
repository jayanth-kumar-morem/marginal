import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateRoomKeys } from "./keys.js";
import { seal } from "./crypto/sodium.js";
import { forkSpawner, parseWorkerRequest, WORKER_TIMEOUT_MS } from "./spawn.js";
import { fakeOperator, job, workerFixture } from "./testing.js";

const VERDICT = Buffer.from("marginal/verdict/v1 and a body", "utf8").toString("hex");

/** A worker that signs a verdict, submits it and exits 0 only if both answers were right. */
const goodWorker = workerFixture(`
process.on("message", (m) => {
  if (m.kind === "job") {
    if (m.job.id !== 7) process.exit(10);
    // A worker is given nothing of the host's environment, and a heap it cannot grow past.
    // None of the host's own variables reach a worker (the platform may still inject its own).
    if (process.env.PATH !== undefined || process.env.HOME !== undefined) process.exit(15);
    if (!process.execArgv.some((a) => a.startsWith("--max-old-space-size="))) process.exit(16);
    process.send({ kind: "sign", id: 1, message: ${JSON.stringify(VERDICT)} });
    return;
  }
  if (m.kind === "sign") {
    if (m.id !== 1 || typeof m.signature !== "string" || m.signature.length !== 128) process.exit(11);
    process.send({ kind: "submit", id: 2, method: "submit_verdict", args: { sig: m.signature } });
    return;
  }
  if (m.kind === "submit") process.exit(m.id === 2 && m.ok === true ? 0 : 12);
});
`);

test("a worker gets its job, a signature and a relay, and the supervisor waits for it", async () => {
  const keys = generateRoomKeys();
  const operator = fakeOperator();
  const spawner = forkSpawner({ workerPath: goodWorker, keys, operator });
  await spawner.run(job(7));
  assert.equal(operator.submitted.length, 1);
  const submitted = operator.submitted[0];
  assert.equal(submitted?.method, "submit_verdict");
  const signature = submitted?.args.sig;
  assert.equal(typeof signature, "string");
  // The signature really is the room's, over the bytes the worker asked for.
  const { createPublicKey, verify } = await import("node:crypto");
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(keys.signPk)]);
  assert.equal(
    verify(
      null,
      Buffer.from(VERDICT, "hex"),
      createPublicKey({ key: der, format: "der", type: "spki" }),
      Buffer.from(signature as string, "hex"),
    ),
    true,
  );
});

test("the supervisor refuses to sign anything that is not one of the room's own messages", async () => {
  // Exits 0 only when the refusal came back, so a resolved run *is* the refusal.
  const worker = workerFixture(`
    process.on("message", (m) => {
      if (m.kind === "job") {
        process.send({ kind: "sign", id: 4, message: Buffer.from("give me your key").toString("hex") });
        return;
      }
      process.exit(m.error === "the message is not one the room signs" ? 0 : 20);
    });
  `);
  const operator = fakeOperator();
  await forkSpawner({ workerPath: worker, keys: generateRoomKeys(), operator }).run(job(1));
  assert.deepEqual(operator.submitted, [], "and nothing was relayed");
});

test("a relay the operator agent refuses comes back as an error, not a signature", async () => {
  const worker = workerFixture(`
    process.on("message", (m) => {
      if (m.kind === "job") {
        process.send({ kind: "submit", id: 5, method: "submit_verdict", args: {} });
        return;
      }
      process.exit(m.error === "operator: HTTP 500: " ? 0 : 21);
    });
  `);
  const operator = {
    ...fakeOperator(),
    submit: (): Promise<void> => Promise.reject(new Error("operator: HTTP 500: ")),
  };
  await forkSpawner({ workerPath: worker, keys: generateRoomKeys(), operator }).run(job(1));
});

test("a worker that fails takes its job's slot with it, and says how it failed", async () => {
  const worker = workerFixture(`process.exit(7);`);
  await assert.rejects(
    () => forkSpawner({ workerPath: worker, keys: generateRoomKeys(), operator: fakeOperator() }).run(job(3)),
    /worker for job 3 exited with 7/,
  );
});

test("a worker that will not finish is killed", async () => {
  // It counts into a file, so the file says whether it is still alive. The first beat is written
  // before the interval starts, and the timeout is long enough for a fork to get that far on a
  // loaded machine: otherwise the kill could win the race against the worker's own start, and the
  // test would fail for a reason that has nothing to do with killing a worker.
  const beat = join(mkdtempSync(join(tmpdir(), "marginal-beat-")), "beats");
  const worker = workerFixture(`
    import { appendFileSync } from "node:fs";
    appendFileSync(${JSON.stringify(beat)}, "x");
    setInterval(() => appendFileSync(${JSON.stringify(beat)}, "x"), 5);
  `);
  await assert.rejects(
    () =>
      forkSpawner({
        workerPath: worker,
        keys: generateRoomKeys(),
        operator: fakeOperator(),
        timeoutMs: 300,
      }).run(job(4)),
    /worker for job 4 timed out/,
  );
  // An unwritten file means the worker never started, which is a different failure and says so.
  const atDeath = existsSync(beat) ? readFileSync(beat, "utf8").length : 0;
  assert.ok(atDeath > 0, "it was running");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(readFileSync(beat, "utf8").length, atDeath, "and it is not running any more");
  assert.equal(WORKER_TIMEOUT_MS, 600_000, "and the real cap is ten minutes");
});

test("a worker that cannot be started at all is reported, not hung", async () => {
  await assert.rejects(
    () =>
      forkSpawner({
        workerPath: goodWorker,
        keys: generateRoomKeys(),
        operator: fakeOperator(),
        execPath: "/nonexistent/node",
      }).run(job(5)),
    /ENOENT|spawn/,
  );
});

test("a message the supervisor does not take is reported and answered with nothing", async () => {
  const worker = workerFixture(`
    process.on("message", () => {
      process.send({ kind: "give-me-the-key", id: 1 });
      setTimeout(() => process.exit(0), 30);
    });
  `);
  const errors: string[] = [];
  await forkSpawner({
    workerPath: worker,
    keys: generateRoomKeys(),
    operator: fakeOperator(),
    onError: (error) => errors.push(error.message),
  }).run(job(6));
  assert.deepEqual(errors, ["worker for job 6 sent a message the supervisor does not take"]);

  // And a supervisor started without a logger swallows it rather than failing the job.
  await forkSpawner({ workerPath: worker, keys: generateRoomKeys(), operator: fakeOperator() }).run(job(6));
});

test("a worker that gives up before its relay comes back is not written to", async () => {
  const worker = workerFixture(`
    process.on("message", (m) => {
      if (m.kind === "job") {
        process.send({ kind: "submit", id: 8, method: "submit_verdict", args: {} });
        setTimeout(() => process.exit(0), 10);
      }
    });
  `);
  let release = (): void => {};
  const operator = {
    ...fakeOperator(),
    submit: (): Promise<void> =>
      new Promise<void>((resolve) => {
        release = (): void => resolve();
      }),
  };
  const errors: Error[] = [];
  await forkSpawner({
    workerPath: worker,
    keys: generateRoomKeys(),
    operator,
    onError: (error) => errors.push(error),
  }).run(job(8));
  release();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(errors, [], "a reply to a dead worker is dropped, not an error");
});

test("only the two requests parse, and only in their own shape", () => {
  assert.deepEqual(parseWorkerRequest({ kind: "unseal", id: 6, bytes: "aa" }), {
    kind: "unseal",
    id: 6,
    bytes: "aa",
  });
  assert.deepEqual(parseWorkerRequest({ kind: "blob", id: 4, op: "get", key: "certs/aa" }), {
    kind: "blob",
    id: 4,
    op: "get",
    key: "certs/aa",
    bytes: "",
  });
  assert.deepEqual(parseWorkerRequest({ kind: "blob", id: 5, op: "put", key: "certs/aa", bytes: "00" }), {
    kind: "blob",
    id: 5,
    op: "put",
    key: "certs/aa",
    bytes: "00",
  });
  assert.deepEqual(parseWorkerRequest({ kind: "sign", id: 1, message: "ab" }), {
    kind: "sign",
    id: 1,
    message: "ab",
  });
  assert.deepEqual(parseWorkerRequest({ kind: "submit", id: 2, method: "m", args: { a: 1 } }), {
    kind: "submit",
    id: 2,
    method: "m",
    args: { a: 1 },
    contract: "clearing",
  }, "clearing unless the worker says otherwise");
  assert.deepEqual(
    parseWorkerRequest({ kind: "submit", id: 3, method: "authorize", args: {}, contract: "keypolicy" }),
    { kind: "submit", id: 3, method: "authorize", args: {}, contract: "keypolicy" },
  );
  for (const raw of [
    null,
    42,
    "sign",
    {},
    { kind: "sign" },
    { kind: "sign", id: "1", message: "ab" },
    { kind: "sign", id: 1.5, message: "ab" },
    { kind: "sign", id: 1, message: 7 },
    { kind: "submit", id: 1, method: 7, args: {} },
    { kind: "submit", id: 1, method: "m", args: "{}" },
    { kind: "submit", id: 1, method: "m", args: null },
    { kind: "submit", id: 1, method: "m", args: {}, contract: "mpc" },
    { kind: "blob", id: 1, op: "get" },
    { kind: "blob", id: 1, op: "put", key: "a" },
    { kind: "blob", id: 1, op: "list", key: "a" },
    { kind: "blob", id: 1, op: "get", key: "" },
    { kind: "unseal", id: 1 },
    { kind: "unseal", id: 1, bytes: "" },
    { kind: "unseal", id: 1 },
  ]) {
    assert.equal(parseWorkerRequest(raw), undefined, JSON.stringify(raw));
  }
});

test("a worker reads and writes blobs through the supervisor", async () => {
  const worker = workerFixture(`
    process.on("message", (m) => {
      if (m.kind === "job") {
        process.send({ kind: "blob", id: 1, op: "get", key: "listings/1/good" });
        return;
      }
      if (m.id === 1) {
        if (m.value !== "0011") process.exit(30);
        process.send({ kind: "blob", id: 2, op: "put", key: "certs/aa", bytes: "2233" });
        return;
      }
      if (m.id === 2) {
        if (m.ok !== true) process.exit(31);
        process.send({ kind: "blob", id: 3, op: "get", key: "missing" });
        return;
      }
      // A blob that is not there comes back as an error, not as empty bytes.
      process.exit(typeof m.error === "string" && m.error.includes("missing") ? 0 : 32);
    });
  `);
  const operator = fakeOperator();
  operator.blobs.set("listings/1/good", "0011");
  await forkSpawner({ workerPath: worker, keys: generateRoomKeys(), operator }).run(job(2));
  assert.equal(operator.blobs.get("certs/aa"), "2233", "the certificate was stored");
});

test("a worker opens a sealed box through the supervisor, never holding the box key", async () => {
  const keys = generateRoomKeys();
  const sealed = Buffer.from(seal(new Uint8Array([7, 7, 7]), keys.boxPk)).toString("hex");
  const worker = workerFixture(`
    process.on("message", (m) => {
      if (m.kind === "job") {
        process.send({ kind: "unseal", id: 1, bytes: ${JSON.stringify(sealed)} });
        return;
      }
      if (m.id === 1) {
        if (m.value !== "070707") process.exit(40);
        // A box sealed to somebody else does not open, and says so.
        process.send({ kind: "unseal", id: 2, bytes: "00".repeat(64) });
        return;
      }
      process.exit(typeof m.error === "string" ? 0 : 41);
    });
  `);
  await forkSpawner({ workerPath: worker, keys, operator: fakeOperator() }).run(job(5));
});
