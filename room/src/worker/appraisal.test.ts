import test from "node:test";
import assert from "node:assert/strict";
import { call } from "@marginal/core-wasm";

import { appId, appKeyFromScalar, listingKeys } from "../crypto/ckd.js";
import { ephemeralKey, openDelivery } from "../crypto/delivery.js";
import { aeadOpen, boxKeys } from "../crypto/sodium.js";
import { boxSecretKey, generateRoomKeys } from "../keys.js";
import type { Appraisal, Appraiser } from "../appraisers/types.js";
import {
  CLEARING,
  KEYPOLICY,
  ckdNetwork,
  fakeChain,
  fakeOperator,
  job as jobFixture,
  jobRecordFixture,
  localChannel,
  longContext,
  sealBundle,
  sealGood,
  testConfig,
} from "../testing.js";
import { closeProver } from "../prove.js";
import { createPublicKey, verify } from "node:crypto";
import {
  ACK_DOMAIN,
  checkCommitment,
  parseBundle,
  restrictedMatch,
  runAppraisal,
  contextKey,
} from "./appraisal.js";
import { loadJob, type WorkerContext } from "./context.js";
import { runJob } from "./main.js";

const SCALAR = 7n;
const SELLER = "alice.testnet";
const NOW = 1_794_000_000;
const GOOD = "The fund has begun unwinding its position in Brazilian utilities this quarter.";

/** An appraiser that reports a fixed measurement: the pipeline does not care which one ran. */
function stubAppraiser(
  components = [8_000, 10_000],
  /** What had been submitted by the time it ran, so a test can prove the order of two steps. */
  onAppraise: () => void = () => {},
): Appraiser & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    id: "knowledge",
    version: 1,
    formulaId: "KnowledgeV1",
    componentAlphabets: [21, 21],
    appraise(input): Promise<Appraisal> {
      onAppraise();
      seen.push(input.good);
      return Promise.resolve({ components, factors: [], shown: [], datasheet: { claims: 1 } });
    },
  };
}

const measurement = {
  mrtd: "01".repeat(48),
  rtmr0: "02".repeat(48),
  rtmr1: "03".repeat(48),
  rtmr2: "04".repeat(48),
  compose_hash: "05".repeat(32),
  key_provider_digest: "06".repeat(48),
  gpu_policy_hash: null,
};

/** A whole job: a listing, a buyer's sealed context, a sealed good, and a chain that agrees. */
function world(
  options: {
    good?: string;
    context?: string;
    restricted?: string[];
    compliance?: boolean;
    rule?: unknown;
    privacy?: string;
    keyMode?: string;
  } = {},
) {
  const keys = generateRoomKeys();
  const roomKeyHex = Buffer.from(keys.signPk).toString("hex");
  const network = ckdNetwork();
  const config = testConfig({ mpcPublicKey: network.publicKey });
  const path = call("listing_path", { seller: SELLER, listing_id: 3, version: 1 }) as string;
  const id = appId(KEYPOLICY, path);
  const appKey = appKeyFromScalar(SCALAR);
  const derived = listingKeys(network.sigma(id));
  const buyer = boxKeys();
  const compliance = boxKeys();

  // Under the RoomSealed fallback the seller seals the wrap to the room's own `box_pk`, and the
  // listing pins no `pk_L`: there is no listing key (§3.12.7).
  const keyMode = options.keyMode ?? "Ckd";
  const roomSealed = keyMode === "RoomSealed";
  const sealed = sealGood(options.good ?? GOOD, roomSealed ? keys.boxPk : derived.publicKey);
  const bundle = sealBundle(
    {
      context: options.context ?? longContext(),
      need: "I need to know what the fund is doing.",
      restricted: options.restricted ?? [],
    },
    keys.boxPk,
  );

  const rule = options.rule ?? { Posted: { ask: "400000000" } };
  const listing = {
    id: 3,
    seller: SELLER,
    version: 1,
    status: "Active",
    good_commitment: sealed.good_commitment,
    ciphertext: { uri_hash: "0a".repeat(32), sha256: sealed.sha256, size_class: 12 },
    key_mode: keyMode,
    pk_l: roomSealed ? null : Buffer.from(derived.publicKey).toString("hex"),
    appraiser: "knowledge@1",
    value_class: "M",
    l_floor_bps: 1_000,
    rule,
    disclosure_policy: "DisputeOnly",
    external_judges_allowed: false,
  };
  const job = jobRecordFixture({
    kind: "Appraisal",
    listing_id: 3,
    listing_version: 1,
    privacy: options.privacy ?? "Open",
    delivery_pk: Buffer.from(buyer.publicKey).toString("hex"),
    compliance_pk: options.compliance === true ? Buffer.from(compliance.publicKey).toString("hex") : null,
  });
  // The commitment is what clearing would have computed at request time.
  const commitment = call("job_commitment", {
    chain_id: config.chainId,
    clearing: CLEARING,
    job_id: job.id,
    kind: "Appraisal",
    listing_id: 3,
    listing_version: 1,
    snapshot_id: null,
    snapshot_content_hash: null,
    budget: job.buckets.budget,
    rule,
    formula_params: { delta_star_bps: 0 },
    mode: job.mode,
    privacy: job.privacy,
    disclosure_policy: listing.disclosure_policy,
    max_debit_mbits: job.max_debit_mbits,
    delivery_pk: job.delivery_pk,
    compliance_pk: job.compliance_pk,
    context_auth_pk: job.context_auth_pk,
    assigned_rooms: [],
    deadline_height: job.deadline_height,
  }) as string;
  const committed = { ...job, job_commitment: commitment };

  const operator = fakeOperator();
  operator.blobs.set("listings/3/v1/good", sealed.object);
  operator.blobs.set("listings/3/v1/dek", sealed.wrapped);
  operator.blobs.set(contextKey(job.id), bundle.object);
  const base = operator.submit.bind(operator);
  operator.submit = (method, args, contract) => {
    void base(method, args, contract);
    // A RoomSealed job must not call KeyPolicy at all: if it does, the call fails loudly rather
    // than being answered, so no test of this can pass by accident.
    if (roomSealed && (method === "authorize" || method === "derive")) {
      return Promise.reject(new Error(`a RoomSealed job asked KeyPolicy for ${method}`));
    }
    if (method === "authorize") return Promise.resolve("7");
    if (method === "derive") return Promise.resolve(network.answer(id, appKey.pk1));
    if (method === "submit_verdict") return Promise.resolve({ status: "Settled", price: "400000000" });
    return Promise.resolve(null);
  };

  const chain = fakeChain({
    get_job: committed,
    config: { chain_id: config.chainId, keypolicy: KEYPOLICY, policy_version: 4 },
    get_attestation: {
      measurement,
      ppid_hash: "07".repeat(32),
      quote_hash: "08".repeat(32),
      collateral_hash: "09".repeat(32),
      mode: "OnChainDcap",
      expires_at: NOW + 86_400,
    },
    get_listing: listing,
    get_context_key: bundle.sealedKey,
  });
  // The supervisor's side of the channel is forked for *this* job, so the `RoomJob` it holds
  // carries the same commitment the job record does — which is what binds the delivery key to it.
  const channel = localChannel(
    keys,
    operator,
    jobFixture(11, { kind: "Appraisal", job_commitment: commitment }),
  );
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
  return { ctx, operator, chain, derived, buyer, compliance, committed, listing, sealed, keys, logs, channel };
}

test("an appraisal runs end to end: components published, delivery sealed, receipt submitted", async () => {
  const w = world();
  const appraiser = stubAppraiser();
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(appraiser));

  assert.equal(appraised.status, "Ok");
  assert.deepEqual(appraised.components, [8_000, 10_000]);
  assert.equal(appraised.price, "400000000", "clearing priced it, not the room");
  assert.deepEqual(appraiser.seen, [GOOD], "the appraiser saw the good, once");

  assert.deepEqual(
    w.operator.submitted.map((s) => s.method),
    ["authorize", "derive", "submit_verdict", "submit_delivery_receipt"],
  );

  // The verdict is Open and blind, and clearing can read it back.
  const sent = call("verdict_decode", {
    bytes: Buffer.from(w.operator.submitted[2]?.args.verdict as string, "base64").toString("hex"),
  }) as Record<string, unknown>;
  assert.equal(sent.status, "Ok");
  assert.deepEqual(sent.open, { components: [8_000, 10_000], factors: [], shown: [] });
  assert.equal(sent.sealed, null);
  assert.equal(sent.job_commitment, w.committed.job_commitment);
  assert.equal(sent.delivery_commitment, appraised.deliveryHash);

  // And the buyer can open the delivery it committed to, and get a key that opens the good.
  const stored = w.operator.blobs.get("deliveries/11");
  assert.ok(stored);
  const delivery = call("delivery_decode", { bytes: stored }) as Parameters<typeof openDelivery>[0];
  assert.equal(call("delivery_hash", delivery), appraised.deliveryHash);
  const payload = openDelivery(
    delivery,
    w.buyer.secretKey,
    new Uint8Array(Buffer.from(w.committed.job_commitment, "hex")),
  );
  assert.equal(payload.length, 68);
  assert.equal(
    w.operator.submitted[3]?.args.delivery_hash,
    appraised.deliveryHash,
    "the receipt names the hash the verdict committed to",
  );
});

test("a compliance copy is a second delivery entry, and only when the job asked for one", async () => {
  const withCopy = world({ compliance: true });
  await runAppraisal(withCopy.ctx, 11, () => Promise.resolve(stubAppraiser()));
  const delivery = call("delivery_decode", {
    bytes: withCopy.operator.blobs.get("deliveries/11") ?? "",
  }) as { entries: unknown[] };
  assert.equal(delivery.entries.length, 2);

  const without = world();
  await runAppraisal(without.ctx, 11, () => Promise.resolve(stubAppraiser()));
  const one = call("delivery_decode", {
    bytes: without.operator.blobs.get("deliveries/11") ?? "",
  }) as { entries: unknown[] };
  assert.equal(one.entries.length, 1);
});

test("too little context rejects the input, and the good is never decrypted", async () => {
  const w = world({ context: "One short sentence of context, which is not enough." });
  const appraiser = stubAppraiser();
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(appraiser));
  assert.equal(appraised.status, "InputRejected");
  assert.equal(appraised.deliveryHash, null);
  assert.deepEqual(appraiser.seen, [], "the appraiser never ran");
  // Nothing was delivered, and the verdict still went in: silence would lock the buyer's funds.
  assert.deepEqual(
    w.operator.submitted.map((s) => s.method),
    ["authorize", "derive", "submit_verdict"],
  );
  assert.equal(w.operator.blobs.has("deliveries/11"), false);

  // A job whose context key never arrived is the same answer: the buyer did not seal one, so there
  // is nothing to measure against and nothing to decrypt.
  const noKey = world();
  const chain = fakeChain({ ...viewsOf(noKey), get_context_key: null });
  const missing = await runAppraisal({ ...noKey.ctx, chain }, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(missing.status, "InputRejected");
});

test("a restricted-list match stops the appraisal (D8, AC-62)", async () => {
  const w = world({ good: "A memo about Helios Protocol and its treasury.", restricted: ["helios protocol"] });
  const appraiser = stubAppraiser();
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(appraiser));
  assert.equal(appraised.status, "Restricted");
  assert.deepEqual(appraiser.seen, [], "nothing else was computed");
  assert.equal(appraised.deliveryHash, null);

  assert.equal(restrictedMatch("about Acme Corp", ["acme corp"]), "acme corp");
  assert.equal(restrictedMatch("about ACME CORP", ["Acme Corp"]), "acme corp");
  assert.equal(restrictedMatch("about nothing", ["acme corp"]), undefined);
  assert.equal(restrictedMatch("anything", [""]), undefined, "an empty term matches nothing");
});

test("an appraisal room refuses a job of another kind", async () => {
  const w = world();
  const ctx = { ...w.ctx, chain: fakeChain({ ...viewsOf(w), get_job: { ...w.committed, kind: "Screening" } }) };
  await assert.rejects(() => runAppraisal(ctx, 11, () => Promise.resolve(stubAppraiser())), /job 11 is a Screening job/);
  assert.deepEqual(w.operator.submitted, [], "and asks for no key");
});

test("a job whose parameters do not hash to its commitment is refused before any key", async () => {
  const w = world();
  const tampered = { ...w.committed, max_debit_mbits: w.committed.max_debit_mbits + 1 };
  const ctx = { ...w.ctx, chain: fakeChain({ ...viewsOf(w), get_job: tampered }) };
  await assert.rejects(
    () => runAppraisal(ctx, 11, () => Promise.resolve(stubAppraiser())),
    /do not hash to its commitment/,
  );
  assert.deepEqual(w.operator.submitted, [], "no key was asked for");
});

test("the commitment covers the snapshot a standing context named", async () => {
  const w = world();
  const withSnapshot = { ...w.committed, snapshot_id: 9 };
  const views = { ...viewsOf(w), get_job: withSnapshot, get_snapshot: { id: 9, owner: "bob.testnet", content_hash: "0f".repeat(32), blob: { uri_hash: "00".repeat(32), sha256: "00".repeat(32), size_class: 1 } } };
  const ctx = { ...w.ctx, chain: fakeChain(views) };
  const data = await loadJob(ctx, 11);
  // The commitment was computed without a snapshot, so naming one has to change it.
  await assert.rejects(() => checkCommitment(ctx, data), /do not hash to its commitment/);

  // A snapshot id the chain does not have is the same refusal, not a commitment over nothing.
  const gone = { ...w.ctx, chain: fakeChain({ ...views, get_snapshot: null }) };
  const goneData = await loadJob(gone, 11);
  await assert.rejects(() => checkCommitment(gone, goneData), /do not hash to its commitment/);
});

test("a bundle that is not one is refused rather than defaulted", () => {
  assert.deepEqual(parseBundle(JSON.stringify({ context: "c", need: "n", restricted: [] })), {
    context: "c",
    need: "n",
    restricted: [],
  });
  assert.deepEqual(
    parseBundle(JSON.stringify({ context: "c", need: "n", restricted: ["a"] })).restricted,
    ["a"],
  );
  // An omitted or null list is a malformed bundle, not an empty one.
  for (const bad of [{ context: "c", need: "n" }, { context: "c", need: "n", restricted: null }]) {
    assert.throws(() => parseBundle(JSON.stringify(bad)), /not a list of terms/, JSON.stringify(bad));
  }
  for (const bad of [{}, { context: "c" }, { need: "n" }, { context: 1, need: "n" }]) {
    assert.throws(() => parseBundle(JSON.stringify(bad)), /no context and need/, JSON.stringify(bad));
  }
  assert.throws(
    () => parseBundle(JSON.stringify({ context: "c", need: "n", restricted: "a" })),
    /not a list of terms/,
  );
  assert.throws(
    () => parseBundle(JSON.stringify({ context: "c", need: "n", restricted: [1] })),
    /not a list of terms/,
  );
});

test("the job loop runs an appraisal, and only for an appraiser this room has", async () => {
  const w = world();
  await runJob(w.ctx, "Appraisal", 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(w.operator.submitted.at(-1)?.method, "submit_delivery_receipt");

  const { appraiserFor } = await import("./main.js");
  await assert.rejects(
    () => appraiserFor({ ...w.listing, appraiser: "dataset-lite@0" }),
    /does not run dataset-lite@0/,
  );
});

/** The canned views of a world, so a test can change one of them. */
function viewsOf(w: ReturnType<typeof world>): Record<string, unknown> {
  return {
    get_job: w.committed,
    config: { chain_id: "sandbox", keypolicy: KEYPOLICY, policy_version: 4 },
    get_attestation: {
      measurement,
      ppid_hash: "07".repeat(32),
      quote_hash: "08".repeat(32),
      collateral_hash: "09".repeat(32),
      mode: "OnChainDcap",
      expires_at: NOW + 86_400,
    },
    get_listing: w.listing,
    get_context_key: null,
  };
}

test("a verdict clearing answers without a price is not reported as priced", async () => {
  const w = world();
  const base = w.operator.submit.bind(w.operator);
  w.operator.submit = (method, args, contract) =>
    method === "submit_verdict" ? Promise.resolve({ status: "Settled" }) : base(method, args, contract);
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(appraised.price, null, "no price came back, so none is claimed");
  assert.equal(appraised.status, "Ok");

  // Nor when the relay answers with nothing at all.
  const silent = world();
  const under = silent.operator.submit.bind(silent.operator);
  silent.operator.submit = (method, args, contract) =>
    method === "submit_verdict" ? Promise.resolve(null) : under(method, args, contract);
  assert.equal((await runAppraisal(silent.ctx, 11, () => Promise.resolve(stubAppraiser()))).price, null);
});

/**
 * The real appraiser on the real pipeline, with no stub anywhere: `runJob` loads `knowledge@1` from
 * the measured image itself. It is the slowest test in the room and the only one that shows the
 * whole thing working.
 */
test("the pipeline runs the real knowledge@1 from the image", async () => {
  const w = world({ good: "The fund has quietly begun unwinding its Brazilian utilities position." });
  await runJob(w.ctx, "Appraisal", 11);
  const sent = call("verdict_decode", {
    bytes: Buffer.from(w.operator.submitted[2]?.args.verdict as string, "base64").toString("hex"),
  }) as { status: string; appraiser: { id: string; version: number }; open: { components: number[] } };
  assert.equal(sent.status, "Ok");
  assert.deepEqual(sent.appraiser, { id: "knowledge", version: 1, formula_id: "KnowledgeV1" });
  const [novel, pub] = sent.open.components;
  assert.equal(pub, 10_000, "no public corpus in M1");
  assert.ok(novel !== undefined && novel % 500 === 0, `components are quantised: ${String(novel)}`);
  assert.ok(novel > 0, "a document the buyer has never seen is worth something");
});

/**
 * E10.3: the same pipeline in Sealed mode. The verdict carries a proof and a commitment instead of
 * the components, and the room reports no components back either — the buyer sees the outcome and
 * the price, and nothing about the measurement.
 */
test("a sealed job publishes a proof instead of its components (D10)", async () => {
  const w = world({ privacy: "Sealed" });
  // One judge, scoring a whole, so the factor goes into the proof without changing the price: the
  // factors are part of what stays private, so they are what the commitment covers.
  const judged = {
    ...stubAppraiser(),
    appraise: () =>
      Promise.resolve({
        components: [8_000, 10_000],
        factors: [{ model_id: "m", factor_bps: 10_000, proof: { Simulated: { signer: "s" } } }],
        shown: [] as never[],
        datasheet: {},
      }),
  };
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(judged));
  assert.equal(appraised.status, "Ok");
  assert.deepEqual(appraised.components, [], "nothing about the measurement is published");

  const sent = call("verdict_decode", {
    bytes: Buffer.from(w.operator.submitted[2]?.args.verdict as string, "base64").toString("hex"),
  }) as { open: unknown; sealed: Record<string, unknown> | null; privacy: string };
  assert.equal(sent.privacy, "Sealed");
  assert.equal(sent.open, null);
  assert.ok(sent.sealed);
  assert.deepEqual(sent.sealed.shown, []);
  // 8,000 * 10,000 / 10^4 = 8,000, no judges, so m = 8,000 and V = 400,000,000: exactly the ask.
  assert.equal(sent.sealed.outcome, "Deal");
  assert.equal(sent.sealed.price, "400000000");
  assert.equal((sent.sealed.commitment as string).length, 64);
  assert.equal((sent.sealed.proof as string).length, 2 * 256);
  await closeProver();
});

test("a sealed job this room cannot prove is refused rather than answered", async () => {
  const other = world({ privacy: "Sealed" });
  await assert.rejects(
    () =>
      runAppraisal(other.ctx, 11, () =>
        Promise.resolve({ ...stubAppraiser(), formulaId: "DatasetLiteV0" }),
      ),
    /sealed mode is built for KnowledgeV1/,
  );

  const indexed = world({
    privacy: "Sealed",
    rule: { ValueIndexed: { p_min: "1", p_full: "2", price_quantum_bps: 100 } },
  });
  await assert.rejects(
    () => runAppraisal(indexed.ctx, 11, () => Promise.resolve(stubAppraiser())),
    /sealed mode is built for R1/,
  );
});

test("a RoomSealed appraisal seals the delivery under the room's own box key (§3.19, §3.12.7)", async () => {
  const w = world({ keyMode: "RoomSealed" });
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(appraised.status, "Ok");
  assert.equal(appraised.price, "400000000");

  // No authorize and no derive: there is no listing key to ask KeyPolicy for, and the world would
  // have failed the call if the pipeline had made one anyway. The ack in front of them is the room
  // saying it has the key, which is what moves a RoomSealed job to `Computing` (§3.5).
  assert.deepEqual(
    w.operator.submitted.map((s) => `${s.contract}.${s.method}`),
    ["clearing.room_ack", "clearing.submit_verdict", "clearing.submit_delivery_receipt"],
  );
  assert.equal(w.logs.length, 1, "the limitations were disclosed, once");

  // The ephemeral key is §3.19's derivation with the room's `box_sk` as the ikm — not something
  // else of the same shape — and the worker got it without ever holding `box_sk`.
  const stored = w.operator.blobs.get("deliveries/11");
  assert.ok(stored);
  const delivery = call("delivery_decode", { bytes: stored }) as Parameters<typeof openDelivery>[0];
  const commitment = new Uint8Array(Buffer.from(w.committed.job_commitment, "hex"));
  assert.equal(
    delivery.eph_pk,
    Buffer.from(ephemeralKey(boxSecretKey(w.keys), commitment).publicKey).toString("hex"),
  );

  // The buyer's own SDK code opens it, and what comes out is the key that opens the good.
  const payload = openDelivery(delivery, w.buyer.secretKey, commitment);
  assert.equal(payload.length, 68);
  const object = new Uint8Array(Buffer.from(w.sealed.object, "hex"));
  assert.equal(
    Buffer.from(
      aeadOpen(payload.subarray(0, 32), object.subarray(0, 24), object.subarray(24), new Uint8Array(0)),
    ).toString("utf8"),
    GOOD,
    "the delivery carries DEK_g itself",
  );
  assert.equal(call("delivery_hash", delivery), appraised.deliveryHash);

  // And it is deterministic: the same room, the same job and the same good give the same bytes,
  // which is what makes a re-delivery by this room possible at all (AC-31, limited to this room).
  const again = await runAppraisal(w.ctx, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(w.operator.blobs.get("deliveries/11"), stored, "no randomness in the delivery");
  assert.equal(again.deliveryHash, appraised.deliveryHash);
});

test("a Ckd appraisal never asks the supervisor for a delivery key", async () => {
  const w = world();
  // The IPC operation RoomSealed needs is the room's `box_sk` in another dress: a Ckd job that
  // reached for it would be a job sealing a delivery nobody but this room could reproduce.
  w.channel.deliveryKey = (): Promise<never> =>
    Promise.reject(new Error("a Ckd job asked for the room's delivery key"));
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(appraised.status, "Ok");
  assert.ok(appraised.deliveryHash, "it sealed a delivery from sk_L instead");
  assert.deepEqual(w.logs, [], "and nothing was disclosed, because no fallback was used");
  assert.deepEqual(
    w.operator.submitted.map((s) => s.method),
    ["authorize", "derive", "submit_verdict", "submit_delivery_receipt"],
  );
});

/** The room's ed25519 public key, in the form `verify` takes (`signer.test.ts` does the same). */
function publicKeyOf(raw: Uint8Array): ReturnType<typeof createPublicKey> {
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw)]),
    format: "der",
    type: "spki",
  });
}

test("a RoomSealed appraisal acks the job to clearing before it computes (§3.5, §3.12.7)", async () => {
  const w = world({ keyMode: "RoomSealed" });
  // What had been sent by the time the appraiser ran: the ack has to be in it already, because a
  // verdict is only accepted for a job clearing has moved to `Computing`.
  let whenAppraised: string[] = [];
  const appraiser = stubAppraiser([8_000, 10_000], () => {
    whenAppraised = w.operator.submitted.map((s) => s.method);
  });
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(appraiser));
  assert.equal(appraised.status, "Ok");
  assert.deepEqual(whenAppraised, ["room_ack"], "acked first, and nothing else sent yet");
  assert.deepEqual(
    w.operator.submitted.map((s) => `${s.contract}.${s.method}`),
    ["clearing.room_ack", "clearing.submit_verdict", "clearing.submit_delivery_receipt"],
    "exactly one ack, to clearing, and no CKD call",
  );

  // It is the ack for the job this worker was forked for, byte for byte what core encodes, signed
  // by this room over `"marginal/room-ack/v1" ‖ borsh(ack)`.
  const sent = w.operator.submitted[0]?.args as { ack: string; room_sig: string };
  const ack = {
    domain: ACK_DOMAIN,
    chain_id: "sandbox",
    clearing: CLEARING,
    job_id: 11,
    room_key: w.ctx.roomKeyHex,
    job_commitment: w.committed.job_commitment,
  };
  assert.equal(ACK_DOMAIN, Buffer.from("marginal/ack\0\0\0\0", "utf8").toString("hex"));
  assert.equal(
    Buffer.from(sent.ack, "base64").toString("hex"),
    call("room_ack_encode", ack),
    "the bytes clearing decodes are the ones core encodes",
  );
  // Every field is pinned by that comparison, because the expected `ack` above is built from this
  // job's own values; an ack for a neighbouring job encodes to something else.
  assert.notEqual(
    call("room_ack_encode", { ...ack, job_commitment: "ff".repeat(32) }),
    Buffer.from(sent.ack, "base64").toString("hex"),
    "it is this job's commitment the room signed, not another's",
  );
  assert.equal(
    verify(
      null,
      Buffer.from(call("room_ack_signing_bytes", ack) as string, "hex"),
      publicKeyOf(w.keys.signPk),
      Buffer.from(sent.room_sig, "base64"),
    ),
    true,
    "signed by the room whose key the ack names",
  );
});

test("a RoomSealed job acks even when it rejects its input, so its verdict is still accepted", async () => {
  // The path that motivates the ordering: nothing is decrypted, nothing is appraised, and a
  // verdict still goes in — which clearing takes only from a job it has moved to `Computing`.
  const w = world({
    keyMode: "RoomSealed",
    context: "One short sentence of context, which is not enough.",
  });
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(appraised.status, "InputRejected");
  assert.deepEqual(
    w.operator.submitted.map((s) => s.method),
    ["room_ack", "submit_verdict"],
  );
});

test("a Ckd appraisal sends no ack: KeyPolicy's key release is what moves one", async () => {
  const w = world();
  const appraised = await runAppraisal(w.ctx, 11, () => Promise.resolve(stubAppraiser()));
  assert.equal(appraised.status, "Ok");
  assert.equal(
    w.operator.submitted.some((s) => s.method === "room_ack"),
    false,
    "clearing would refuse it with E_RULE_DISABLED",
  );
  assert.deepEqual(
    w.operator.submitted.map((s) => s.method),
    ["authorize", "derive", "submit_verdict", "submit_delivery_receipt"],
  );
});
