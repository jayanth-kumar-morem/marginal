import test from "node:test";
import assert from "node:assert/strict";

import type { ChainPort } from "./chain";
import {
  KNOWLEDGE_ROOM_CLASSES,
  ROOM_CLASSES,
  RTMR3_EVENTS,
  knowledgeRoomKeys,
  loadRoom,
  loadRooms,
  modeNote,
  roomKeys,
} from "./rooms";

const KEY_A = "aa".repeat(32);
const KEY_B = "bb".repeat(32);

/** A chain where a method can also be made to throw, which is what an absent view does. */
function fakeChain(answers: Record<string, unknown>): ChainPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    view<T>(_contract: string, method: string, args?: unknown): Promise<T> {
      const key = `${method}:${JSON.stringify(args ?? {})}`;
      asked.push(key);
      const answer = answers[key];
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(answer as T);
    },
  };
}

test("the room list is every eligible key, across the classes, without repeats", async () => {
  const chain = fakeChain({
    'eligible:{"class":"Kcpu"}': [KEY_A, KEY_B],
    'eligible:{"class":"K"}': [KEY_B],
    'eligible:{"class":"S"}': [],
    'eligible:{"class":"G"}': new Error("no such class"),
    'eligible:{"class":"D"}': [],
  });
  assert.deepEqual(await roomKeys(chain, "clearing.testnet"), [KEY_A, KEY_B]);
  assert.equal(chain.asked.length, ROOM_CLASSES.length, "one call per class, and a refusal is empty");
});

test("a room is its registry record, its attestation and its deny reasons", async () => {
  const chain = fakeChain({
    [`get_room:{"room_key":"${KEY_A}"}`]: { room_key: KEY_A, mode: "OnChainDcap" },
    [`get_attestation:{"room_key":"${KEY_A}"}`]: { room_key: KEY_A, tcb_status: "UpToDate" },
    [`check_room:{"room_key":"${KEY_A}"}`]: { ok: true, deny_reasons: [] },
  });
  const row = await loadRoom(chain, "clearing.testnet", "keypolicy.testnet", KEY_A);
  assert.equal(row.key, KEY_A);
  assert.equal(row.room?.mode, "OnChainDcap");
  assert.equal(row.attestation?.tcb_status, "UpToDate");
  assert.deepEqual(row.denyReasons, []);
});

test("a room KeyPolicy has no record of still appears, with what is missing said plainly", async () => {
  const chain = fakeChain({
    [`get_room:{"room_key":"${KEY_B}"}`]: new Error("boom"),
    // KeyPolicy itself can refuse — an account that is not there, or an RPC that is down — and that
    // is not the same as "there is no attestation", so both have to end in the same honest null.
    [`get_attestation:{"room_key":"${KEY_B}"}`]: new Error("no such contract"),
    [`check_room:{"room_key":"${KEY_B}"}`]: new Error("boom"),
  });
  const row = await loadRoom(chain, "clearing.testnet", "keypolicy.testnet", KEY_B);
  assert.equal(row.room, null);
  assert.equal(row.attestation, null);
  assert.deepEqual(row.denyReasons, ["check_room did not answer"]);
});

test("loading every room walks the classes then each key", async () => {
  const chain = fakeChain({
    'eligible:{"class":"Kcpu"}': [KEY_A],
    'eligible:{"class":"K"}': [],
    'eligible:{"class":"S"}': [],
    'eligible:{"class":"G"}': [],
    'eligible:{"class":"D"}': [],
    [`get_room:{"room_key":"${KEY_A}"}`]: { room_key: KEY_A },
    [`get_attestation:{"room_key":"${KEY_A}"}`]: null,
    [`check_room:{"room_key":"${KEY_A}"}`]: { ok: true, deny_reasons: [] },
  });
  const rooms = await loadRooms(chain, "clearing.testnet", "keypolicy.testnet");
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0]?.key, KEY_A);
});

test("only an on-chain DCAP attestation counts as real", () => {
  assert.equal(modeNote("OnChainDcap").real, true);
  assert.match(modeNote("OnChainDcap").note, /locked tee-verifier/);
  assert.equal(modeNote("AttesterQuorum").real, false);
  assert.equal(modeNote("Simulated").real, false);
  assert.match(modeNote("Simulated").note, /flagged simulated/);
  assert.equal(modeNote(null).real, false);
  assert.match(modeNote(null).note, /No attestation record/);
});

test("the expected RTMR3 order is dstack's, with key-provider in it", () => {
  assert.equal(RTMR3_EVENTS[0], "system-preparing");
  assert.equal(RTMR3_EVENTS[RTMR3_EVENTS.length - 1], "system-ready");
  assert.ok(RTMR3_EVENTS.includes("key-provider"), "DRC-3 reads this event to prove there is no KMS");
  assert.ok(RTMR3_EVENTS.includes("compose-hash"));
});

test("the rooms a listing can be assigned to are the two knowledge pools, and a refusal is not an empty pool", async () => {
  // `pick_room` in clearing draws from K and Kcpu only, so those are the pools a seller's listing
  // can land in. A room eligible in both is still one room.
  const chain = fakeChain({
    'eligible:{"class":"K"}': [KEY_A, KEY_B],
    'eligible:{"class":"Kcpu"}': [KEY_B],
  });
  assert.deepEqual(await knowledgeRoomKeys(chain, "clearing.testnet"), [KEY_A, KEY_B]);
  assert.equal(chain.asked.length, KNOWLEDGE_ROOM_CLASSES.length);

  // Unlike `roomKeys`, a view that does not answer is reported: this is what a RoomSealed seller
  // decides on, and "no rooms" must never be the way an RPC failure looks.
  await assert.rejects(
    () =>
      knowledgeRoomKeys(
        fakeChain({
          'eligible:{"class":"K"}': new Error("the RPC answered 503"),
          'eligible:{"class":"Kcpu"}': [],
        }),
        "clearing.testnet",
      ),
    /the RPC answered 503/,
  );
});
