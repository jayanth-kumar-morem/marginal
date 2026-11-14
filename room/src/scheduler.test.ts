import test from "node:test";
import assert from "node:assert/strict";

import type { RoomJob } from "./chain.js";
import { runLoop, scheduler } from "./scheduler.js";
import { CLEARING, fakeChain, job } from "./testing.js";

const ROOM = "ea".repeat(32);

/** A spawner that hands back control: a test decides when each worker finishes. */
function spawner() {
  const started: number[] = [];
  const finish = new Map<number, () => void>();
  return {
    started,
    finish(id: number): void {
      finish.get(id)?.();
      finish.delete(id);
    },
    run(j: RoomJob): Promise<void> {
      started.push(j.id);
      return new Promise<void>((resolve) => finish.set(j.id, resolve));
    },
  };
}

test("one worker per job, and never twice for the same job", async () => {
  const jobs = [job(1), job(2)];
  const chain = fakeChain({ get_jobs_for_room: jobs });
  const workers = spawner();
  const sched = scheduler({ chain, clearing: CLEARING, roomKeyHex: ROOM, spawner: workers, maxWorkers: 4 });

  assert.equal(await sched.tick(), 2);
  assert.equal(sched.running(), 2);
  // The view still lists them until the room answers, so a second poll starts nothing.
  assert.equal(await sched.tick(), 0);
  assert.deepEqual(workers.started, [1, 2]);

  workers.finish(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sched.running(), 1, "a finished worker leaves room for another");
  assert.equal(await sched.tick(), 1, "and job 1 is picked up again, since it is still listed");
});

test("no more workers than the cap, however many jobs are waiting", async () => {
  const chain = fakeChain({ get_jobs_for_room: [job(1), job(2), job(3)] });
  const workers = spawner();
  const sched = scheduler({ chain, clearing: CLEARING, roomKeyHex: ROOM, spawner: workers, maxWorkers: 2 });
  assert.equal(await sched.tick(), 2);
  assert.deepEqual(workers.started, [1, 2]);
  assert.equal(await sched.tick(), 0, "full: the loop does not even ask");
  workers.finish(2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await sched.tick(), 1);
  assert.deepEqual(workers.started, [1, 2, 2]);
});

test("the loop survives a chain that is down and a worker that throws", async () => {
  const errors: Error[] = [];
  const broken = {
    view<T>(): Promise<T> {
      return Promise.reject(new Error("rpc: HTTP 502"));
    },
  };
  const sched = scheduler({
    chain: broken,
    clearing: CLEARING,
    roomKeyHex: ROOM,
    spawner: { run: () => Promise.resolve() },
    maxWorkers: 1,
    onError: (error) => errors.push(error),
  });
  assert.equal(await sched.tick(), 0);
  assert.match(errors[0]?.message ?? "", /502/);

  const chain = fakeChain({ get_jobs_for_room: [job(5)] });
  const failing = scheduler({
    chain,
    clearing: CLEARING,
    roomKeyHex: ROOM,
    spawner: { run: () => Promise.reject(new Error("worker crashed")) },
    maxWorkers: 1,
    onError: (error) => errors.push(error),
  });
  assert.equal(await failing.tick(), 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(errors[1]?.message ?? "", /worker crashed/);
  assert.equal(failing.running(), 0, "and the job is not left marked as running");
});

test("an error anywhere is reported, or swallowed when nobody is listening", async () => {
  const chain = fakeChain({});
  const sched = scheduler({
    chain,
    clearing: CLEARING,
    roomKeyHex: ROOM,
    spawner: { run: () => Promise.resolve() },
    maxWorkers: 1,
  });
  assert.equal(await sched.tick(), 0, "no canned view: the poll fails and the loop goes on");
});

test("the loop polls until it is stopped, and stopping it twice is harmless", async () => {
  const chain = fakeChain({ get_jobs_for_room: [] });
  const sched = scheduler({
    chain,
    clearing: CLEARING,
    roomKeyHex: ROOM,
    spawner: { run: () => Promise.resolve() },
    maxWorkers: 1,
  });
  let ticks = 0;
  const loop = runLoop(() => {
    ticks += 1;
    return sched.tick();
  }, 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(ticks >= 2, `polled ${ticks} times`);
  loop.stop();
  const after = ticks;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(ticks, after, "stopped means stopped");
  loop.stop();
});

test("a loop stopped before its first tick never runs one", () => {
  const timers: (() => void)[] = [];
  let cleared = 0;
  const loop = runLoop(
    () => Promise.resolve(0),
    5,
    (fn) => {
      timers.push(fn);
      return 1 as unknown as NodeJS.Timeout;
    },
    () => {
      cleared += 1;
    },
  );
  loop.stop();
  assert.equal(cleared, 1);
  // Firing the timer after stopping schedules nothing more.
  timers[0]?.();
  assert.equal(timers.length, 1);
});
