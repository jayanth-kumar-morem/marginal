import test from "node:test";
import assert from "node:assert/strict";

import type { ListingRecord } from "../chain.js";
import { generateRoomKeys } from "../keys.js";
import { seal } from "../crypto/sodium.js";
import { listingKeys } from "../crypto/ckd.js";
import {
  fakeOperator,
  job as jobFixture,
  jobRecordFixture,
  localChannel,
  testConfig,
} from "../testing.js";
import {
  jobKeyFor,
  keyMode,
  localUnwrap,
  workerLog,
  ROOM_SEALED_DISCLOSURE,
  type KeyContext,
} from "./keys.js";

function listing(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: 3,
    seller: "alice.testnet",
    version: 1,
    status: "Active",
    good_commitment: "00".repeat(32),
    ciphertext: { uri_hash: "0a".repeat(32), sha256: "0b".repeat(32), size_class: 12 },
    key_mode: "Ckd",
    pk_l: null,
    appraiser: "knowledge@1",
    value_class: "M",
    l_floor_bps: 1_000,
    rule: { Posted: { ask: "400000000" } },
    disclosure_policy: "DisputeOnly",
    external_judges_allowed: false,
    ...overrides,
  };
}

test("a listing's key release mode is one of the two, by name", () => {
  assert.equal(keyMode(listing()), "Ckd");
  assert.equal(keyMode(listing({ key_mode: "RoomSealed" })), "RoomSealed");
  // Not a default, not a guess: the value is named in the refusal, so an operator can see what the
  // chain said and the room cannot open a listing the wrong way.
  assert.throws(
    () => keyMode(listing({ key_mode: "Threshold" })),
    /listing 3: this room does not implement key release mode Threshold/,
  );
});

test("the derived listing key opens the seller's wrap without leaving the worker", async () => {
  const keys = listingKeys(new Uint8Array(48).fill(3));
  const sealed = Buffer.from(seal(new Uint8Array([1, 2, 3]), keys.publicKey)).toString("hex");
  assert.deepEqual(await localUnwrap(keys)(sealed), new Uint8Array([1, 2, 3]));
  await assert.rejects(
    () => localUnwrap(keys)("00".repeat(64)),
    /the sealed box does not open with this key/,
  );
});

test("the RoomSealed disclosure says what is weaker, and claims nothing about deletion (AC-29)", () => {
  for (const limitation of [
    /a room restart loses box_sk/,
    /only this room can re-deliver/,
    /no job-commitment proof/,
    /DR-5/,
    /§3\.12\.7/,
  ]) {
    assert.match(ROOM_SEALED_DISCLOSURE, limitation);
  }
  for (const forbidden of [/delet/i, /unlearn/i, /erase/i, /forget/i, /destroy/i]) {
    assert.doesNotMatch(ROOM_SEALED_DISCLOSURE, forbidden);
  }
});

test("a disclosure goes to the supervisor's stderr when nothing else is listening", async () => {
  const lines: string[] = [];
  const real = process.stderr.write.bind(process.stderr);
  const capture = (chunk: string): boolean => {
    lines.push(chunk);
    return true;
  };
  process.stderr.write = capture as typeof process.stderr.write;
  try {
    workerLog("a line");
    // A job with no `log` of its own discloses the same thing, the same way.
    const ctx: KeyContext = {
      channel: localChannel(generateRoomKeys(), fakeOperator(), jobFixture(11)),
      config: testConfig(),
      roomKeyHex: "aa".repeat(32),
    };
    const key = await jobKeyFor(ctx, jobRecordFixture(), listing({ key_mode: "RoomSealed" }));
    assert.equal(key.mode, "RoomSealed");
    assert.deepEqual(key.keyIds, [], "it held no key of its own");
    key.destroy();
  } finally {
    process.stderr.write = real;
  }
  assert.deepEqual(lines, ["a line\n", `listing 3 v1: ${ROOM_SEALED_DISCLOSURE}\n`]);
});
