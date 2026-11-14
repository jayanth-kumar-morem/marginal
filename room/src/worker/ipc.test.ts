import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { job as jobFixture } from "../testing.js";
import { workerChannel, type ChannelProcess } from "./ipc.js";

/** A host end of the channel: it records what the worker sent and lets a test answer. */
function host(send = true): {
  process: ChannelProcess;
  sent: Record<string, unknown>[];
  answer(message: Record<string, unknown>): void;
} {
  const events = new EventEmitter();
  const sent: Record<string, unknown>[] = [];
  const process: ChannelProcess = {
    on(event, listener) {
      return events.on(event, listener);
    },
    ...(send
      ? {
          send(message: unknown): boolean {
            sent.push(message as Record<string, unknown>);
            return true;
          },
        }
      : {}),
  };
  return { process, sent, answer: (message) => events.emit("message", message) };
}

test("the job arrives before it is asked for, or is waited for", async () => {
  const early = host();
  const channel = workerChannel(early.process);
  early.answer({ kind: "job", job: jobFixture(5), room_key: "aa".repeat(32) });
  const first = await channel.job();
  assert.equal(first.job.id, 5);
  assert.equal(first.roomKey, "aa".repeat(32));
  assert.deepEqual(await channel.job(), first, "and it is remembered");

  const late = host();
  const waiting = workerChannel(late.process);
  const pending = waiting.job();
  late.answer({ kind: "job", job: jobFixture(6), room_key: "bb".repeat(32) });
  assert.equal((await pending).job.id, 6);
});

test("a signature and a relay are requests with answers", async () => {
  const h = host();
  const channel = workerChannel(h.process);
  const signing = channel.sign("abcd");
  assert.deepEqual(h.sent[0], { kind: "sign", message: "abcd", id: 1 });
  h.answer({ kind: "sign", id: 1, signature: "ff".repeat(64) });
  assert.equal(await signing, "ff".repeat(64));

  const relaying = channel.submit("submit_verdict", { a: 1 });
  assert.deepEqual(h.sent[1], {
    kind: "submit",
    method: "submit_verdict",
    args: { a: 1 },
    contract: "clearing",
    id: 2,
  });
  h.answer({ kind: "submit", id: 2, ok: true, value: "7" });
  assert.equal(await relaying, "7");

  const keypolicy = channel.submit("authorize", {}, "keypolicy");
  assert.equal(h.sent[2]?.contract, "keypolicy");
  h.answer({ kind: "submit", id: 3, ok: true, value: null });
  assert.equal(await keypolicy, null);
});

test("blobs go through the supervisor, because a worker has no network", async () => {
  const h = host();
  const channel = workerChannel(h.process);
  const reading = channel.getBlob("certs/aa");
  assert.deepEqual(h.sent[0], { kind: "blob", op: "get", key: "certs/aa", id: 1 });
  h.answer({ kind: "blob", id: 1, ok: true, value: "0011" });
  assert.equal(await reading, "0011");

  const writing = channel.putBlob("certs/bb", "2233");
  assert.deepEqual(h.sent[1], { kind: "blob", op: "put", key: "certs/bb", bytes: "2233", id: 2 });
  h.answer({ kind: "blob", id: 2, ok: true, value: "" });
  await writing;
});

test("a sealed box is opened by the supervisor, which holds the box key", async () => {
  const h = host();
  const channel = workerChannel(h.process);
  const opening = channel.unseal("aabb");
  assert.deepEqual(h.sent[0], { kind: "unseal", bytes: "aabb", id: 1 });
  h.answer({ kind: "unseal", id: 1, ok: true, value: "0011" });
  assert.equal(await opening, "0011");

  const empty = channel.unseal("aabb");
  h.answer({ kind: "unseal", id: 2, ok: true });
  await assert.rejects(() => empty, /the box did not open/);
});

test("a refusal is an error, and a reply that answers nothing is not mistaken for one", async () => {
  const h = host();
  const channel = workerChannel(h.process);
  const refused = channel.sign("00");
  h.answer({ kind: "sign", id: 1, error: "the message is not one the room signs" });
  await assert.rejects(() => refused, /supervisor: the message is not one the room signs/);

  const empty = channel.sign("00");
  h.answer({ kind: "sign", id: 2 });
  await assert.rejects(() => empty, /no signature came back/);

  const noBlob = channel.getBlob("certs/aa");
  h.answer({ kind: "blob", id: 3, ok: true });
  await assert.rejects(() => noBlob, /certs\/aa did not come back/);
});

test("nothing a supervisor could send derails a worker", async () => {
  const h = host();
  const channel = workerChannel(h.process);
  const pending = channel.sign("abcd");
  // Not an object, no id, an id nobody asked about, and a job message with no room key: all ignored.
  for (const message of [null, 42, {}, { id: 99, signature: "aa" }, { kind: "job", job: jobFixture(1) }]) {
    h.answer(message as Record<string, unknown>);
  }
  h.answer({ kind: "sign", id: 1, signature: "cd".repeat(64) });
  assert.equal(await pending, "cd".repeat(64));
});

test("a worker with no channel to the supervisor says so instead of hanging", async () => {
  const channel = workerChannel(host(false).process);
  await assert.rejects(() => channel.sign("abcd"), /no channel to the supervisor/);
});
