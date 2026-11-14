import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { call } from "@marginal/core-wasm";

import {
  NULLIFIER_DOMAIN,
  PAYOUT_DOMAIN,
  VALIDITY_BLOCKS,
  compliance,
  emptySdn,
  fetchSdn,
  isListed,
  issuerKey,
  nullifierFor,
  parseSdn,
  sdnUrlFrom,
  serve,
  store,
} from "./index.js";

const ISSUER = new Uint8Array(32).fill(1);
const COMPLIANCE = new Uint8Array(32).fill(2);
const ROUTE = "ab".repeat(32);
const LISTED = "1Ai5226pyWMd9NnFwbMRSRHqLs2sKNpss1";

/** An SDN file in Treasury's own shape, trimmed to what the parser looks for. */
const SDN = [
  '123,"SOMEONE","individual","-0- ","-0- ","-0- ","-0- ","-0- ","-0- ","-0- ","Digital Currency Address - XBT ' +
    `${LISTED}; Digital Currency Address - ETH 0xDEADBEEF00000000000000000000000000000000"`,
  '124,"ANOTHER","-0- ","-0- ","-0- ","-0- ","-0- ","-0- ","-0- ","-0- ","no addresses here"',
].join("\n");

const sdnFetch = (text = SDN, status = 200): typeof globalThis.fetch =>
  (() => Promise.resolve(new Response(text, { status }))) as typeof globalThis.fetch;

async function up(
  options: Partial<Parameters<typeof compliance>[0]> = {},
): Promise<{
  call: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => Promise<void>;
}> {
  const service = await serve(
    {
      chainId: "sandbox",
      clearing: "clearing.test",
      issuerSeed: ISSUER,
      complianceSeed: COMPLIANCE,
      allowed: ["buyer.testnet"],
      sdn: { fetchImpl: sdnFetch() },
      height: () => 1_000,
      now: () => 1_700,
      ...options,
    },
    0,
  );
  return {
    call: (path, init) => fetch(`http://127.0.0.1:${service.port}${path}`, init),
    stop: async () => {
      service.stop();
      await new Promise<void>((resolve) => service.server.close(() => resolve()));
    },
  };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Verifies an ed25519 signature the way clearing does: raw key, raw message. */
function verifies(publicKeyHex: string, messageHex: string, signatureHex: string): boolean {
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(publicKeyHex, "hex"),
  ]);
  return verify(
    null,
    Buffer.from(messageHex, "hex"),
    createPublicKey({ key: der, format: "der", type: "spki" }),
    Buffer.from(signatureHex, "hex"),
  );
}

test("the SDN parser finds the addresses and nothing else", () => {
  const list = parseSdn(SDN);
  assert.equal(list.entries, 2);
  assert.equal(isListed(list, LISTED), true);
  assert.equal(isListed(list, LISTED.toUpperCase()), true, "chains spell them differently");
  assert.equal(isListed(list, "0xdeadbeef00000000000000000000000000000000"), true);
  assert.equal(isListed(list, "1SomeoneElse"), false);
  assert.match(list.version, /^[0-9a-f]{64}$/);
  // An empty list is distinguishable from a list with nothing on it.
  assert.equal(emptySdn().entries, 0);
  assert.notEqual(emptySdn().version, list.version);
  assert.notEqual(parseSdn(`${SDN}\n`).version, list.version, "the version is the file's hash");
});

test("the list's address is the environment's, or Treasury's", () => {
  assert.equal(sdnUrlFrom({ MARGINAL_SDN_URL: "http://mirror.test/sdn.csv" }), "http://mirror.test/sdn.csv");
  assert.match(sdnUrlFrom({}), /^https:\/\/www\.treasury\.gov\//);
  assert.match(sdnUrlFrom({ MARGINAL_SDN_URL: "  " }), /^https:\/\/www\.treasury\.gov\//);
});

test("a list that cannot be read is an error, never an empty list", async () => {
  await assert.rejects(() => fetchSdn({ fetchImpl: sdnFetch("", 503) }), /answered 503/);
  const list = await fetchSdn({ fetchImpl: sdnFetch() });
  assert.equal(list.entries, 2);
});

test("a demo identity gets a credential clearing will accept (D4)", async () => {
  const s = await up();
  try {
    const health = (await (await s.call("/v1/health")).json()) as {
      issuer_key: string;
      label: string;
      list_entries: number;
    };
    assert.equal(health.label, "demo", "nothing here is a regulated identity service");
    assert.equal(health.list_entries, 2);

    const reply = await s.call("/v1/nullifiers", postJson({ subject: "buyer.testnet", listing_id: 3, epoch: 7 }));
    const issued = (await reply.json()) as { credential: Record<string, unknown>; sig: string };
    assert.equal(issued.credential.domain, NULLIFIER_DOMAIN);
    assert.equal(issued.credential.chain_id, "sandbox");
    assert.equal(issued.credential.subject, "buyer.testnet");
    assert.equal(issued.credential.expiry_height, 1_000 + VALIDITY_BLOCKS);
    assert.ok(
      verifies(health.issuer_key, call("nullifier_signing_bytes", issued.credential) as string, issued.sig),
      "the signature is over the bytes clearing checks",
    );

    // The same subject, listing and epoch is the same nullifier: one identity, one appraisal.
    const again = (await (
      await s.call("/v1/nullifiers", postJson({ subject: "buyer.testnet", listing_id: 3, epoch: 7 }))
    ).json()) as { credential: { nullifier: string } };
    assert.equal(again.credential.nullifier, issued.credential.nullifier);
    // A different epoch is a different one, which is what lets a listing be appraised next epoch.
    const next = (await (
      await s.call("/v1/nullifiers", postJson({ subject: "buyer.testnet", listing_id: 3, epoch: 8 }))
    ).json()) as { credential: { nullifier: string } };
    assert.notEqual(next.credential.nullifier, issued.credential.nullifier);
  } finally {
    await s.stop();
  }
});

test("only an allow-listed identity, and only a well-formed request", async () => {
  const s = await up();
  try {
    const refused = await s.call("/v1/nullifiers", postJson({ subject: "stranger.testnet", listing_id: 1, epoch: 1 }));
    assert.equal(refused.status, 403);
    for (const body of [
      {},
      { subject: "buyer.testnet" },
      { subject: "buyer.testnet", listing_id: 1 },
      { subject: "buyer.testnet", listing_id: -1, epoch: 1 },
      { subject: "buyer.testnet", listing_id: 1, epoch: 1.5 },
    ]) {
      assert.equal((await s.call("/v1/nullifiers", postJson(body))).status, 400, JSON.stringify(body));
    }
  } finally {
    await s.stop();
  }
});

test("a payout to a listed address is blocked, and the decision is recorded (D8)", async () => {
  const s = await up();
  try {
    const key = ((await (await s.call("/v1/health")).json()) as { compliance_key: string }).compliance_key;

    const clean = (await (
      await s.call("/v1/payout-approvals", postJson({ subject: "seller.testnet", route_hash: ROUTE, address: "1CleanAddress" }))
    ).json()) as { approval: Record<string, unknown>; sig: string };
    assert.equal(clean.approval.blocked, false);
    assert.equal(clean.approval.domain, PAYOUT_DOMAIN);
    assert.ok(verifies(key, call("payout_approval_signing_bytes", clean.approval) as string, clean.sig));

    const blocked = (await (
      await s.call("/v1/payout-approvals", postJson({ subject: "seller.testnet", route_hash: ROUTE, address: LISTED }))
    ).json()) as { approval: Record<string, unknown>; sig: string };
    assert.equal(blocked.approval.blocked, true, "a listed address is blocked");
    assert.equal(blocked.approval.list_version, clean.approval.list_version);
    assert.notEqual(blocked.approval.screening_id, clean.approval.screening_id);
    assert.ok(verifies(key, call("payout_approval_signing_bytes", blocked.approval) as string, blocked.sig));

    // Both decisions are in the log, with the version they were made against.
    const log = (await (await s.call("/v1/screenings/seller.testnet")).json()) as {
      screenings: { blocked: boolean; listVersion: string }[];
    };
    assert.deepEqual(log.screenings.map((row) => row.blocked), [false, true]);
    assert.equal(log.screenings[0]?.listVersion, clean.approval.list_version);
    // And the service never learned the route: it was hashed before it arrived.
    assert.equal(JSON.stringify(log).includes("1CleanAddress"), false);
  } finally {
    await s.stop();
  }
});

test("an approval is refused before the list has been read, and on a malformed request", async () => {
  const unread = compliance({
    chainId: "sandbox",
    clearing: "clearing.test",
    issuerSeed: ISSUER,
    complianceSeed: COMPLIANCE,
    allowed: [],
    sdn: { fetchImpl: sdnFetch() },
  });
  try {
    assert.equal(unread.list().entries, 0, "nothing read yet");
  } finally {
    unread.stop();
  }

  const s = await up();
  try {
    for (const body of [
      {},
      { subject: "a" },
      { subject: "a", route_hash: "short" },
      { subject: "a", route_hash: ROUTE },
      { subject: "a", route_hash: ROUTE, address: "" },
    ]) {
      assert.equal((await s.call("/v1/payout-approvals", postJson(body))).status, 400, JSON.stringify(body));
    }
  } finally {
    await s.stop();
  }

  // With a list that is empty, an approval is a 503 rather than a quiet "not listed".
  const empty = await up({ sdn: { fetchImpl: sdnFetch("no addresses at all") } });
  try {
    const reply = await empty.call(
      "/v1/payout-approvals",
      postJson({ subject: "a", route_hash: ROUTE, address: "1Clean" }),
    );
    assert.equal(reply.status, 503);
  } finally {
    await empty.stop();
  }
});

test("the list is re-read on a timer, and a failed read is reported not fatal", async () => {
  let calls = 0;
  const errors: Error[] = [];
  const service = await serve(
    {
      chainId: "sandbox",
      clearing: "clearing.test",
      issuerSeed: ISSUER,
      complianceSeed: COMPLIANCE,
      allowed: [],
      refreshSeconds: 0.01,
      onError: (error) => errors.push(error),
      sdn: {
        fetchImpl: (() => {
          calls += 1;
          return Promise.resolve(calls > 1 ? new Response("", { status: 500 }) : new Response(SDN, { status: 200 }));
        }) as typeof globalThis.fetch,
      },
    },
    0,
  );
  try {
    assert.equal(service.list().entries, 2);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(calls > 1, "it tried again");
    assert.ok(errors.length > 0, "and said so");
    assert.equal(service.list().entries, 2, "while keeping the list it has");
  } finally {
    service.stop();
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
  }
});

test("a service built with no clock of its own still answers", async () => {
  const service = await serve(
    {
      chainId: "sandbox",
      clearing: "clearing.test",
      issuerSeed: ISSUER,
      complianceSeed: COMPLIANCE,
      allowed: ["buyer.testnet"],
      sdn: { fetchImpl: sdnFetch() },
    },
    0,
  );
  try {
    const issued = (await (
      await fetch(`http://127.0.0.1:${service.port}/v1/nullifiers`, postJson({ subject: "buyer.testnet", listing_id: 1, epoch: 1 }))
    ).json()) as { credential: { expiry_height: number } };
    // No height source, so the credential expires relative to zero: the wall clock is not a chain.
    assert.equal(issued.credential.expiry_height, VALIDITY_BLOCKS);
    const approved = await fetch(
      `http://127.0.0.1:${service.port}/v1/payout-approvals`,
      postJson({ subject: "s", route_hash: ROUTE, address: "1Clean" }),
    );
    assert.equal(approved.status, 200);
  } finally {
    service.stop();
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
  }
});

test("the keys and the nullifier are derived, not stored", () => {
  assert.deepEqual(issuerKey(ISSUER).publicKey, issuerKey(ISSUER).publicKey);
  assert.notEqual(issuerKey(ISSUER).publicKey, issuerKey(COMPLIANCE).publicKey);
  assert.throws(() => issuerKey(new Uint8Array(31)), /a key seed is 32 bytes/);

  assert.equal(nullifierFor(ISSUER, "a", 1, 1), nullifierFor(ISSUER, "a", 1, 1));
  for (const other of [
    nullifierFor(ISSUER, "b", 1, 1),
    nullifierFor(ISSUER, "a", 2, 1),
    nullifierFor(ISSUER, "a", 1, 2),
    nullifierFor(COMPLIANCE, "a", 1, 1),
  ]) {
    assert.notEqual(other, nullifierFor(ISSUER, "a", 1, 1));
  }
});

test("the store keeps what was issued and every decision", () => {
  const db = store();
  try {
    db.issue({ subject: "a", listingId: 1, epoch: 1, nullifier: "ff" }, 100);
    assert.deepEqual(db.issuedFor("a", 1, 1), { subject: "a", listingId: 1, epoch: 1, nullifier: "ff" });
    assert.equal(db.issuedFor("a", 1, 2), undefined);
    // Issuing again is the same record, not a second one.
    db.issue({ subject: "a", listingId: 1, epoch: 1, nullifier: "ff" }, 200);
    assert.deepEqual(db.issuedFor("a", 1, 1)?.nullifier, "ff");

    db.record({ subject: "s", routeHash: ROUTE, screeningId: "11", blocked: false, listVersion: "v1", at: 1 });
    db.record({ subject: "s", routeHash: ROUTE, screeningId: "22", blocked: true, listVersion: "v1", at: 2 });
    assert.deepEqual(db.screenings("s").map((row) => row.screeningId), ["11", "22"]);
    assert.deepEqual(db.screenings("s")[1]?.blocked, true);
    assert.deepEqual(db.screenings("nobody"), []);
  } finally {
    db.close();
  }
});
