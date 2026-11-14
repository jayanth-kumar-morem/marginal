import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { call } from "@marginal/core-wasm";

import { appId, appKeyFromScalar, listingKeys } from "../crypto/ckd.js";
import { generateRoomKeys } from "../keys.js";
import {
  CLEARING,
  KEYPOLICY,
  ckdNetwork,
  fakeChain,
  fakeOperator,
  job as jobFixture,
  jobRecordFixture,
  localChannel,
  sealGood,
  testConfig,
} from "../testing.js";
import { loadJob, openGood, type WorkerContext } from "./context.js";
import { aeadOpen } from "../crypto/sodium.js";
import { localUnwrap } from "./keys.js";
import { runProvisioning } from "./provisioning.js";
import { runScreening } from "./screening.js";
import { runJob } from "./main.js";

const SCALAR = 987_654_321n;
const SELLER = "alice.testnet";
const NOW = 1_794_000_000;

const measurement = {
  mrtd: "01".repeat(48),
  rtmr0: "02".repeat(48),
  rtmr1: "03".repeat(48),
  rtmr2: "04".repeat(48),
  compose_hash: "05".repeat(32),
  key_provider_digest: "06".repeat(48),
  gpu_policy_hash: null,
};

/** A world: a chain with canned views, an operator that plays KeyPolicy and the MPC network. */
function world(
  options: { kind: string; good?: string; listingVersion?: number; keyMode?: string } = {
    kind: "Provisioning",
  },
) {
  const keys = generateRoomKeys();
  const roomKeyHex = Buffer.from(keys.signPk).toString("hex");
  const network = ckdNetwork();
  const config = testConfig({ mpcPublicKey: network.publicKey });
  const version = options.listingVersion ?? 1;
  const path = call("listing_path", { seller: SELLER, listing_id: 3, version }) as string;
  const id = appId(KEYPOLICY, path);
  const appKey = appKeyFromScalar(SCALAR);
  const derived = listingKeys(network.sigma(id));

  // Under the RoomSealed fallback the seller seals the wrap to the room's own `box_pk` instead,
  // and the listing has no `pk_L` at all (§3.12.7).
  const keyMode = options.keyMode ?? "Ckd";
  const sealed = sealGood(
    options.good ?? "A quarterly market commentary, already published.",
    keyMode === "RoomSealed" ? keys.boxPk : derived.publicKey,
  );
  const operator = fakeOperator();
  const base = operator.submit.bind(operator);
  const submitted = operator.submitted;
  operator.submit = (method, args, contract) => {
    void base(method, args, contract);
    // A RoomSealed job has no business calling KeyPolicy: if it ever does, the call fails loudly
    // rather than being answered, so a test cannot pass by accident.
    if (keyMode !== "Ckd" && (method === "authorize" || method === "derive")) {
      return Promise.reject(new Error(`a RoomSealed job asked KeyPolicy for ${method}`));
    }
    if (method === "authorize") return Promise.resolve("7");
    if (method === "derive") return Promise.resolve(network.answer(id, appKey.pk1));
    return Promise.resolve(null);
  };
  operator.blobs.set(`listings/3/v${version}/good`, sealed.object);
  operator.blobs.set(`listings/3/v${version}/dek`, sealed.wrapped);

  const record = jobFixture(11, { kind: options.kind, listing_id: 3, listing_version: version });
  const chain = fakeChain({
    get_job: jobRecordFixture({
      kind: options.kind,
      listing_id: 3,
      listing_version: version,
      job_commitment: record.job_commitment,
    }),
    config: { chain_id: config.chainId, keypolicy: KEYPOLICY, policy_version: 4 },
    get_attestation: {
      measurement,
      ppid_hash: "07".repeat(32),
      quote_hash: "08".repeat(32),
      collateral_hash: "09".repeat(32),
      mode: "OnChainDcap",
      expires_at: NOW + 86_400,
    },
    get_listing: {
      id: 3,
      seller: SELLER,
      version,
      status: "Draft",
      good_commitment: sealed.good_commitment,
      ciphertext: { uri_hash: "0a".repeat(32), sha256: sealed.sha256, size_class: 12 },
      key_mode: keyMode,
      pk_l: null,
      appraiser: "knowledge@1",
      value_class: "M",
      rule: { Posted: { ask: "400000000" } },
      disclosure_policy: "DisputeOnly",
      external_judges_allowed: false,
    },
  });
  const channel = localChannel(keys, operator, record);
  const logs: string[] = [];
  const ctx: WorkerContext = {
    channel,
    chain,
    config,
    roomKeyHex,
    now: () => NOW,
    appKeySource: () => appKey,
    log: (line) => logs.push(line),
  };
  return { ctx, operator, submitted, derived, channel, chain, sealed, path, id, keys, logs };
}

test("a provisioning job derives the listing key and reports pk_L with its certificate", async () => {
  const w = world({ kind: "Provisioning" });
  const pkL = await runProvisioning(w.ctx, 11);

  assert.equal(pkL, Buffer.from(w.derived.publicKey).toString("hex"), "the key CKD gave it");

  // It asked KeyPolicy, in order, and nothing else.
  assert.deepEqual(
    w.submitted.map((s) => `${s.contract}.${s.method}`),
    ["keypolicy.authorize", "keypolicy.derive", "clearing.submit_provisioning"],
  );

  // The certificate is stored at its own hash and says what a provisioning job may say.
  const report = w.submitted[2]?.args as { report: string; sig: string };
  const decoded = call("provisioning_encode", {
    domain: Buffer.from("marginal/provis\0", "utf8").toString("hex"),
    chain_id: "sandbox",
    clearing: CLEARING,
    job_id: 11,
    listing_id: 3,
    listing_version: 1,
    room_key: w.ctx.roomKeyHex,
    pk_l: pkL,
    cert_hash: ([...w.operator.blobs.keys()].find((k) => k.startsWith("certs/")) ?? "").replace("certs/", ""),
  }) as string;
  assert.equal(
    Buffer.from(report.report, "base64").toString("hex"),
    decoded,
    "the report clearing gets is the one the room signed",
  );

  const certKey = [...w.operator.blobs.keys()].find((k) => k.startsWith("certs/"));
  assert.ok(certKey, "the certificate was stored");
  const certificate = call("certificate_decode", {
    bytes: w.operator.blobs.get(certKey) ?? "",
  }) as Record<string, unknown>;
  assert.deepEqual(certificate.scope, [], "a provisioning room holds no plaintext");
  assert.equal(certificate.kind, "Provisioning");
  assert.equal(certificate.policy_version, 4);
  assert.equal(
    certificate.attestation_ref,
    call("attestation_ref", { quote_hash: "08".repeat(32), collateral_hash: "09".repeat(32) }),
  );
  assert.deepEqual(certificate.key_ids_destroyed, [
    createHash("sha256").update(w.derived.publicKey).digest("hex"),
  ]);
  assert.equal(certificate.non_persistence_basis, 15, "process exit, no storage, no swap, TDX");
});

test("a screening job opens the good and reports Pass or a flag", async () => {
  const clean = world({ kind: "Screening" });
  const passed = await runScreening(clean.ctx, 11);
  assert.equal(passed.result, "Pass");
  assert.deepEqual(
    clean.submitted.map((s) => s.method),
    ["authorize", "derive", "submit_screening"],
  );

  const flagged = world({
    kind: "Screening",
    good: "Strictly confidential: Acme Corp earnings will miss guidance.",
  });
  const screening = await runScreening(flagged.ctx, 11);
  assert.deepEqual(screening.result, { Flag: { reason: 1 } });
  assert.ok(screening.hits.includes("strictly confidential"));

  // The certificate covers the good's plaintext, and the matched terms are nowhere on chain.
  const certKey = [...flagged.operator.blobs.keys()].find((k) => k.startsWith("certs/"));
  const certificate = call("certificate_decode", {
    bytes: flagged.operator.blobs.get(certKey ?? "") ?? "",
  }) as Record<string, unknown>;
  assert.deepEqual(certificate.scope, ["GoodPlaintext"]);
  assert.equal((certificate.input_commitments as string[]).length, 1);
  const report = JSON.stringify(flagged.submitted[2]?.args);
  assert.equal(report.includes("confidential"), false, "nothing of the document is reported");
});

test("a room answers the job it was given, and nothing else", async () => {
  const w = world({ kind: "Screening" });
  await assert.rejects(() => runProvisioning(w.ctx, 11), /job 11 is a Screening job/);
  const p = world({ kind: "Provisioning" });
  await assert.rejects(() => runScreening(p.ctx, 11), /job 11 is a Provisioning job/);
  await assert.rejects(() => runJob(p.ctx, "Redelivery", 11), /does not run Redelivery jobs/);
  await runJob(p.ctx, "Provisioning", 11);
  const s = world({ kind: "Screening" });
  await runJob(s.ctx, "Screening", 11);
});

test("a job is refused before any key is asked for when the chain says something else", async () => {
  const w = world({ kind: "Provisioning" });
  const views = {
    get_job: null,
    config: { chain_id: "sandbox", keypolicy: KEYPOLICY, policy_version: 4 },
    get_attestation: { measurement, ppid_hash: "07".repeat(32), quote_hash: "08".repeat(32), collateral_hash: "09".repeat(32), mode: "OnChainDcap", expires_at: NOW },
    get_listing: null,
  };
  const ctx = { ...w.ctx, chain: fakeChain(views) };
  await assert.rejects(() => loadJob(ctx, 11), /clearing has no such job/);

  const job = jobRecordFixture({ kind: "Provisioning", listing_id: 3 });
  await assert.rejects(
    () => loadJob({ ...w.ctx, chain: fakeChain({ ...views, get_job: job, get_attestation: null }) }, 11),
    /this room has no attestation/,
  );
  await assert.rejects(
    () =>
      loadJob(
        { ...w.ctx, chain: fakeChain({ ...views, get_job: job, config: { ...views.config, chain_id: "mainnet" } }) },
        11,
      ),
    /clearing is on mainnet, not sandbox/,
  );
  await assert.rejects(
    () =>
      loadJob(
        { ...w.ctx, chain: fakeChain({ ...views, get_job: job, config: { ...views.config, keypolicy: "other.testnet" } }) },
        11,
      ),
    /names another KeyPolicy/,
  );
  await assert.rejects(
    () => loadJob({ ...w.ctx, chain: fakeChain({ ...views, get_job: job }) }, 11),
    /listing 3 is gone/,
  );
  const moved = world({ kind: "Provisioning", listingVersion: 2 });
  await assert.rejects(
    () =>
      loadJob(
        { ...moved.ctx, chain: fakeChain({ ...views, get_job: job, get_listing: { id: 3, seller: SELLER, version: 2, status: "Draft", good_commitment: "00".repeat(32), ciphertext: { uri_hash: "0a".repeat(32), sha256: "00".repeat(32), size_class: 12 }, key_mode: "Ckd", pk_l: null, appraiser: "knowledge@1", value_class: "M" } }) },
        11,
      ),
    /moved to version 2/,
  );
});

test("the good is accepted only when it is the one the listing published", async () => {
  const w = world({ kind: "Screening" });
  const data = await loadJob(w.ctx, 11);
  const good = await openGood(w.ctx, data.listing, localUnwrap(w.derived), aeadOpen);
  assert.equal(Buffer.from(good.plaintext).toString("utf8").startsWith("A quarterly"), true);

  // A ciphertext that is not the published one, a wrap that is not DEK_g ‖ salt, a truncated
  // object, and a good that does not match its commitment: each is refused on its own terms.
  const tampered = { ...data.listing, ciphertext: { ...data.listing.ciphertext, sha256: "ff".repeat(32) } };
  await assert.rejects(() => openGood(w.ctx, tampered, localUnwrap(w.derived), aeadOpen), /not the one the listing published/);

  w.operator.blobs.set("listings/3/v1/dek", w.sealed.wrapped.slice(0, 64));
  await assert.rejects(() => openGood(w.ctx, data.listing, localUnwrap(w.derived), aeadOpen), /sealed box/);

  const short = world({ kind: "Screening" });
  short.operator.blobs.set("listings/3/v1/good", "00".repeat(10));
  const shortListing = {
    ...data.listing,
    ciphertext: {
      ...data.listing.ciphertext,
      sha256: createHash("sha256").update(Buffer.from("00".repeat(10), "hex")).digest("hex"),
    },
  };
  await assert.rejects(
    () => openGood(short.ctx, shortListing, localUnwrap(short.derived), aeadOpen),
    /too short to hold a nonce/,
  );

  const other = world({ kind: "Screening" });
  const otherData = await loadJob(other.ctx, 11);
  await assert.rejects(
    () =>
      openGood(
        other.ctx,
        { ...otherData.listing, good_commitment: "ee".repeat(32) },
        localUnwrap(other.derived),
        aeadOpen,
      ),
    /does not match its commitment/,
  );
});

test("an answer that is not a ticket or not a key is refused, not used", async () => {
  for (const [bad, expected] of [
    [null, /did not return a ticket id/],
    ["seven", /did not return a ticket id/],
    [-1, /did not return a ticket id/],
    [1.5, /did not return a ticket id/],
  ] as const) {
    const w = world({ kind: "Provisioning" });
    w.operator.submit = (method) =>
      method === "authorize" ? Promise.resolve(bad) : Promise.resolve(null);
    await assert.rejects(() => runProvisioning(w.ctx, 11), expected, String(bad));
  }
  // A ticket id may come back as a number or as a decimal string: both are what NEAR returns.
  for (const ticket of [7, "7"] as const) {
    const w = world({ kind: "Provisioning" });
    const network = ckdNetwork();
    void network;
    const base = w.operator.submit.bind(w.operator);
    w.operator.submit = (method, args, contract) =>
      method === "authorize" ? Promise.resolve(ticket) : base(method, args, contract);
    await runProvisioning(w.ctx, 11);
  }

  for (const answer of [null, {}, { big_y: "x" }, { big_y: 1, big_c: 2 }]) {
    const w = world({ kind: "Provisioning" });
    w.operator.submit = (method) =>
      method === "authorize" ? Promise.resolve("7") : Promise.resolve(answer);
    await assert.rejects(
      () => runProvisioning(w.ctx, 11),
      /no big_y and big_c/,
      JSON.stringify(answer),
    );
  }
});

test("a wrap that opens but is not DEK_g and a salt is refused", async () => {
  const w = world({ kind: "Screening" });
  const data = await loadJob(w.ctx, 11);
  // A well-formed sealed box to pk_L holding the wrong number of bytes.
  const { seal } = await import("../crypto/sodium.js");
  w.operator.blobs.set(
    "listings/3/v1/dek",
    Buffer.from(seal(new Uint8Array(31), w.derived.publicKey)).toString("hex"),
  );
  await assert.rejects(
    () => openGood(w.ctx, data.listing, localUnwrap(w.derived), aeadOpen),
    /not DEK_g and a salt/,
  );
});

test("a RoomSealed screening job opens the good through the supervisor, never through CKD", async () => {
  const w = world({ kind: "Screening", keyMode: "RoomSealed" });
  const screening = await runScreening(w.ctx, 11);
  assert.equal(screening.result, "Pass");

  // No authorize, no derive: under RoomSealed there is no listing key to ask KeyPolicy for, and
  // the world's operator would have rejected the call if it had been made (§3.12.7).
  assert.deepEqual(
    w.submitted.map((s) => `${s.contract}.${s.method}`),
    ["clearing.submit_screening"],
  );

  // The certificate says what it honestly can: the room held the good's plaintext, and it names no
  // key as destroyed, because `box_sk` is the room's and outlives the job.
  const certKey = [...w.operator.blobs.keys()].find((k) => k.startsWith("certs/"));
  const certificate = call("certificate_decode", {
    bytes: w.operator.blobs.get(certKey ?? "") ?? "",
  }) as Record<string, unknown>;
  assert.deepEqual(certificate.scope, ["GoodPlaintext"]);
  assert.deepEqual(certificate.key_ids_destroyed, []);
  assert.equal(certificate.non_persistence_basis, 15, "the mode does not weaken this claim");

  // And the limitations were disclosed, once, naming the listing they apply to.
  assert.equal(w.logs.length, 1);
  assert.match(w.logs[0] ?? "", /^listing 3 v1: RoomSealed key release \(SDD §3\.12\.7/);
  assert.match(w.logs[0] ?? "", /only this room can re-deliver/);
});

test("a RoomSealed wrap that is not DEK_g and a salt, or a good that does not match, is refused", async () => {
  const { seal } = await import("../crypto/sodium.js");

  // A well-formed sealed box to the room's own `box_pk`, holding the wrong number of bytes.
  const short = world({ kind: "Screening", keyMode: "RoomSealed" });
  short.operator.blobs.set(
    "listings/3/v1/dek",
    Buffer.from(seal(new Uint8Array(31), short.keys.boxPk)).toString("hex"),
  );
  await assert.rejects(() => runScreening(short.ctx, 11), /not DEK_g and a salt/);

  // A box the room cannot open at all is refused where it is opened — in the supervisor — and the
  // refusal reaches the worker rather than being guessed at.
  const stranger = world({ kind: "Screening", keyMode: "RoomSealed" });
  stranger.operator.blobs.set("listings/3/v1/dek", "00".repeat(64));
  await assert.rejects(
    () => runScreening(stranger.ctx, 11),
    /crypto: the sealed box does not open with this key/,
  );

  // The commitment check is the same one the Ckd path makes: the wrap opened, the ciphertext was
  // the published one, and the good still does not hash to what the listing committed to.
  const w = world({ kind: "Screening", keyMode: "RoomSealed" });
  const data = await loadJob(w.ctx, 11);
  await assert.rejects(
    () =>
      openGood(
        w.ctx,
        { ...data.listing, good_commitment: "ee".repeat(32) },
        (sealedHex) => w.ctx.channel.unseal(sealedHex).then((hex) => new Uint8Array(Buffer.from(hex, "hex"))),
        aeadOpen,
      ),
    /does not match its commitment/,
  );
});

test("a provisioning job is refused for a RoomSealed listing, before any key is asked for", async () => {
  const w = world({ kind: "Provisioning", keyMode: "RoomSealed" });
  await assert.rejects(
    () => runProvisioning(w.ctx, 11),
    /job 11: listing 3 is RoomSealed, so it has no key to provision/,
  );
  assert.deepEqual(w.submitted, [], "nothing was asked of KeyPolicy or of clearing");
});

test("a key release mode this room does not implement is refused by name", async () => {
  for (const mode of ["Threshold", "", "ckd"]) {
    const w = world({ kind: "Screening", keyMode: mode });
    await assert.rejects(
      () => runScreening(w.ctx, 11),
      new RegExp(`listing 3: this room does not implement key release mode ${mode}$`),
      mode,
    );
    const p = world({ kind: "Provisioning", keyMode: mode });
    await assert.rejects(() => runProvisioning(p.ctx, 11), /does not implement key release mode/);
    assert.deepEqual(w.submitted, [], "no key was asked for");
  }
});
