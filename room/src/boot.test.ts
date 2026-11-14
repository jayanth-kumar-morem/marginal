import test from "node:test";
import assert from "node:assert/strict";

import { boot, RENEW_BEFORE_SECS, RENEW_EVERY_MS } from "./boot.js";
import { generateRoomKeys } from "./keys.js";
import { CLEARING, fakeChain, fakeDstack, fakeOperator, job, testConfig } from "./testing.js";

const NOW = 1_794_000_000;

/** The doubles a boot needs, keeping their concrete types so a test can read what they recorded. */
function ports(): {
  chain: ReturnType<typeof fakeChain>;
  dstack: ReturnType<typeof fakeDstack>;
  operator: ReturnType<typeof fakeOperator>;
  spawner: { run: () => Promise<void> };
  now: () => number;
} {
  return {
    chain: fakeChain({
      get_jobs_for_room: [],
      get_room: { expires_at: NOW + 86_400, current: true },
    }),
    dstack: fakeDstack(),
    operator: fakeOperator(),
    spawner: { run: () => Promise.resolve() },
    now: () => NOW,
  };
}

test("a room registers before it takes any work, and its key is its signing key", async () => {
  const config = testConfig();
  const p = ports();
  const room = await boot(config, p);
  try {
    assert.equal(p.operator.registered.length, 1, "registered on boot");
    assert.equal(room.roomKeyHex, Buffer.from(room.keys.signPk).toString("hex"));
    assert.equal(room.scheduler.running(), 0);
    assert.deepEqual(p.chain.calls, [], "and it polls only once the loop fires");
  } finally {
    room.stop();
  }
});

test("a room that cannot register does not start polling", async () => {
  const p = {
    ...ports(),
    operator: {
      issueNonce: () => Promise.resolve("22".repeat(32)),
      register: () => Promise.reject(new Error("operator: HTTP 500")),
      submit: () => Promise.resolve(),
    },
  };
  await assert.rejects(() => boot(testConfig(), p), /HTTP 500/);
});

test("the room knows when its attestation is about to lapse", async () => {
  const fresh = await boot(testConfig(), ports());
  try {
    assert.equal(await fresh.isCurrent(), true);
  } finally {
    fresh.stop();
  }

  // Inside the renewal window: still admitted, but not for long enough to take new work.
  const expiring = await boot(testConfig(), {
    ...ports(),
    chain: fakeChain({
      get_jobs_for_room: [],
      get_room: { expires_at: NOW + RENEW_BEFORE_SECS - 1, current: true },
    }),
  });
  try {
    assert.equal(await expiring.isCurrent(), false);
  } finally {
    expiring.stop();
  }

  // Revoked, or never admitted at all.
  const revoked = await boot(testConfig(), {
    ...ports(),
    chain: fakeChain({
      get_jobs_for_room: [],
      get_room: { expires_at: NOW + 86_400, current: false },
    }),
  });
  try {
    assert.equal(await revoked.isCurrent(), false);
  } finally {
    revoked.stop();
  }

  const unknown = await boot(testConfig(), {
    ...ports(),
    chain: fakeChain({ get_jobs_for_room: [], get_room: null }),
  });
  try {
    assert.equal(await unknown.isCurrent(), false);
  } finally {
    unknown.stop();
  }
});

test("renewal is another registration with the same keys (§3.13 step 9)", async () => {
  const p = ports();
  const room = await boot(testConfig(), p);
  try {
    const before = room.roomKeyHex;
    await room.renew();
    assert.equal(p.operator.registered.length, 2);
    assert.equal(room.roomKeyHex, before, "the same keys");
    const first = p.operator.registered[0] as { sign_pk: string; nonce: string };
    const second = p.operator.registered[1] as { sign_pk: string; nonce: string };
    assert.equal(second.sign_pk, first.sign_pk);
    assert.equal(p.dstack.calls, 2, "and a fresh quote each time");
  } finally {
    room.stop();
  }
});

test("the loop picks up the room's work and stops when the room does", async () => {
  const p = {
    ...ports(),
    chain: fakeChain({
      get_jobs_for_room: [job(9)],
      get_room: { expires_at: NOW + 86_400, current: true },
    }),
  };
  const started: number[] = [];
  const room = await boot(testConfig({ pollMs: 1 }), {
    ...p,
    spawner: {
      run: (j) => {
        started.push(j.id);
        return Promise.resolve();
      },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  room.stop();
  assert.ok(started.includes(9), `started ${JSON.stringify(started)}`);
  assert.ok(p.chain.calls.includes(`${CLEARING}.get_jobs_for_room`));
});

test("two boots are two rooms: nothing is shared or persisted", async () => {
  const first = await boot(testConfig(), ports());
  const second = await boot(testConfig(), ports());
  try {
    assert.notEqual(first.roomKeyHex, second.roomKeyHex);
  } finally {
    first.stop();
    second.stop();
  }
});

test("a room given no clock reads the real one", async () => {
  // `ports()` hands boot a fixed clock; without one the room must fall back to the wall clock, so
  // these two expiries are set against it rather than against NOW.
  const real = Math.floor(Date.now() / 1_000);
  const withoutClock = (
    expiresAt: number,
  ): { chain: ReturnType<typeof fakeChain>; dstack: ReturnType<typeof fakeDstack>; operator: ReturnType<typeof fakeOperator>; spawner: { run: () => Promise<void> } } => ({
    chain: fakeChain({
      get_jobs_for_room: [],
      get_room: { expires_at: expiresAt, current: true },
    }),
    dstack: fakeDstack(),
    operator: fakeOperator(),
    spawner: { run: () => Promise.resolve() },
  });

  const fresh = await boot(testConfig(), withoutClock(real + 86_400));
  try {
    assert.equal(await fresh.isCurrent(), true);
  } finally {
    fresh.stop();
  }

  const lapsing = await boot(testConfig(), withoutClock(real + RENEW_BEFORE_SECS - 60));
  try {
    assert.equal(await lapsing.isCurrent(), false, "inside the renewal window by the real clock");
  } finally {
    lapsing.stop();
  }
});

test("a room renews itself before its attestation lapses (§3.13 step 9)", async () => {
  const p = {
    ...ports(),
    // Inside the renewal window against the fixed clock, so every check decides to renew.
    chain: fakeChain({
      get_jobs_for_room: [],
      get_room: { expires_at: NOW + RENEW_BEFORE_SECS - 1, current: true },
    }),
    renewEveryMs: 2,
  };
  const room = await boot(testConfig(), p);
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(p.operator.registered.length > 1, `registered ${p.operator.registered.length} times`);
    const first = p.operator.registered[0] as { sign_pk: string };
    const last = p.operator.registered[p.operator.registered.length - 1] as { sign_pk: string };
    assert.equal(last.sign_pk, first.sign_pk, "the same keys, a fresh quote");
  } finally {
    room.stop();
  }
  const after = p.operator.registered.length;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(p.operator.registered.length, after, "and stopping stops renewing");
  assert.equal(RENEW_EVERY_MS, 300_000, "the real check is every five minutes");
});

test("a renewal that fails is reported, and the room stays up to try again", async () => {
  let registrations = 0;
  const errors: string[] = [];
  const operator = {
    issueNonce: () => Promise.resolve("44".repeat(32)),
    register: () => {
      registrations += 1;
      // The first registration is the boot; every renewal after it fails.
      return registrations === 1 ? Promise.resolve() : Promise.reject(new Error("operator: HTTP 503"));
    },
    submit: () => Promise.resolve(),
  };
  const room = await boot(testConfig(), {
    ...ports(),
    chain: fakeChain({ get_jobs_for_room: [], get_room: null }),
    operator,
    renewEveryMs: 2,
    onError: (error) => errors.push(error.message),
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(errors.includes("operator: HTTP 503"), `errors ${JSON.stringify(errors)}`);
    assert.ok(registrations > 2, `tried ${registrations} times`);
  } finally {
    room.stop();
  }
});

test("a renewal nobody is listening to is swallowed, and the room still tries again", async () => {
  let registrations = 0;
  const room = await boot(testConfig(), {
    ...ports(),
    chain: fakeChain({ get_jobs_for_room: [], get_room: null }),
    operator: {
      issueNonce: () => Promise.resolve("55".repeat(32)),
      register: () => {
        registrations += 1;
        return registrations === 1 ? Promise.resolve() : Promise.reject(new Error("operator: HTTP 503"));
      },
      submit: () => Promise.resolve(),
    },
    renewEveryMs: 2,
    // No onError on purpose: a supervisor started without a logger must not die of a failed renewal.
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(registrations > 2, `tried ${registrations} times`);
  } finally {
    room.stop();
  }
});

test("a room can be booted with keys the caller already holds", async () => {
  const keys = generateRoomKeys();
  const room = await boot(testConfig(), { ...ports(), keys });
  try {
    assert.equal(room.keys, keys);
    assert.equal(room.roomKeyHex, Buffer.from(keys.signPk).toString("hex"));
  } finally {
    room.stop();
  }
});
