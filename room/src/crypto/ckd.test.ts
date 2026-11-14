import test from "node:test";
import assert from "node:assert/strict";
import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { base58 } from "@scure/base";

import {
  NEAR_STRONG_KEY_INFO,
  appId,
  appKey,
  appKeyFromScalar,
  listingKeys,
  parseBlsKey,
  recoverSigma,
  strongKey,
  type CkdResponse,
} from "./ckd.js";
import { randomBytes, seal, unseal } from "./sodium.js";

const KEYPOLICY = "keypolicy.marginal-demo.testnet";
const PATH = "listing/alice.testnet/7/1";
const DST = "NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_";

const g1Key = (bytes: Uint8Array): string => `bls12381g1:${base58.encode(bytes)}`;

/**
 * Plays the MPC network's side exactly as near/mpc's own test does
 * (`crates/ckd-example-cli/src/ckd.rs`, `simulate_ckd_response`): the master key signs
 * `H(mpc_pk ‖ app_id)` and the signature is blinded to the app key as `(Y, C) = (y·G1, σ + y·a·G1)`.
 */
function mpcAnswer(
  msk: bigint,
  scalar: bigint,
  id: Uint8Array,
  y: bigint,
): { response: CkdResponse; mpcPublicKey: Uint8Array; sigma: Uint8Array } {
  const mpcPublicKey = bls.G2.Point.BASE.multiply(msk);
  const base = bls.G1.hashToCurve(new Uint8Array([...mpcPublicKey.toBytes(), ...id]), { DST });
  const sigma = base.multiply(msk);
  const bigY = bls.G1.Point.BASE.multiply(y);
  const bigC = sigma.add(bls.G1.Point.BASE.multiply((scalar * y) % bls.G1.Point.Fn.ORDER));
  return {
    response: { big_y: g1Key(bigY.toBytes()), big_c: g1Key(bigC.toBytes()) },
    mpcPublicKey: mpcPublicKey.toBytes(),
    sigma: sigma.toBytes(),
  };
}

/**
 * The app id is the room's own computation and the thing the pairing binds, so it is checked
 * against an independently computed SHA3-256 rather than against this code.
 */
test("the app id is SHA3-256 of near/mpc's derivation string", () => {
  assert.equal(
    Buffer.from(appId(KEYPOLICY, PATH)).toString("hex"),
    "5efe8e12120c87734406dd82e5e745ec33a216e482310dc47c55a7f6cfc55e57",
  );
  assert.equal(
    Buffer.from(
      appId(KEYPOLICY, `listing/${"00".repeat(32)}/v1`),
    ).toString("hex"),
    "765e2a0fa70ab1cf8b0ac8e3b72d4b59e6f3ccb0f2962fd0547edec9956edcde",
  );
  // The contract account and the path are both bound: a different either way is a different key.
  assert.notDeepEqual(appId(KEYPOLICY, PATH), appId(`other.${KEYPOLICY}`, PATH));
  assert.notDeepEqual(appId(KEYPOLICY, PATH), appId(KEYPOLICY, `${PATH}x`));
});

test("an app key is the scalar's two points, and the scalar never leaves the room", () => {
  const key = appKeyFromScalar(42n);
  assert.equal(key.pk1.length, 48);
  assert.equal(key.pk2.length, 96);
  assert.deepEqual(key.pk1, bls.G1.Point.BASE.multiply(42n).toBytes());
  assert.deepEqual(key.pk2, bls.G2.Point.BASE.multiply(42n).toBytes());
  assert.throws(() => appKeyFromScalar(0n), /out of range/);
  assert.throws(() => appKeyFromScalar(bls.G1.Point.Fn.ORDER), /out of range/);
});

test("a fresh app key rejects a draw outside the curve order instead of reducing it", () => {
  const draws = [new Uint8Array(32).fill(0xff), new Uint8Array(32), (() => {
    const bytes = new Uint8Array(32);
    bytes[31] = 7;
    return bytes;
  })()];
  let index = 0;
  const key = appKey(() => draws[index++] ?? new Uint8Array(32));
  assert.equal(key.scalar, 7n, "the first two draws were too large and zero");
  assert.equal(index, 3);
  // And with real randomness it is a different key every time.
  assert.notEqual(appKey().scalar, appKey().scalar);
});

test("a BLS key is read the way the MPC contract writes one", () => {
  const point = bls.G1.Point.BASE.multiply(5n).toBytes();
  assert.deepEqual(parseBlsKey(g1Key(point), "bls12381g1"), point);
  const g2 = bls.G2.Point.BASE.multiply(5n).toBytes();
  assert.deepEqual(parseBlsKey(`bls12381g2:${base58.encode(g2)}`, "bls12381g2"), g2);

  assert.throws(() => parseBlsKey(base58.encode(point), "bls12381g1"), /needs a curve prefix/);
  assert.throws(() => parseBlsKey(`bls12381g2:${base58.encode(point)}`, "bls12381g1"), /not a bls12381g1 key/);
  assert.throws(() => parseBlsKey("bls12381g1:0OIl", "bls12381g1"), /not base58/);
  assert.throws(() => parseBlsKey(`bls12381g1:${base58.encode(g2)}`, "bls12381g1"), /is 48 bytes, got 96/);
  assert.throws(() => parseBlsKey(`bls12381g2:${base58.encode(point)}`, "bls12381g2"), /is 96 bytes, got 48/);
});

test("σ comes back only when it is the key for this app id", () => {
  const id = appId(KEYPOLICY, PATH);
  const scalar = 987654321n;
  const { response, mpcPublicKey, sigma } = mpcAnswer(1234567890n, scalar, id, 55555n);

  assert.deepEqual(recoverSigma(response, scalar, id, mpcPublicKey), sigma);

  // A different app id, a different MPC key, or a different scalar: the pairing refuses.
  assert.throws(
    () => recoverSigma(response, scalar, appId(KEYPOLICY, `${PATH}x`), mpcPublicKey),
    /not the key for this app id/,
  );
  assert.throws(
    () => recoverSigma(response, scalar + 1n, id, mpcPublicKey),
    /not the key for this app id/,
  );
  assert.throws(
    () => recoverSigma(response, scalar, id, bls.G2.Point.BASE.multiply(9n).toBytes()),
    /not the key for this app id/,
  );
  // And a response that is simply a point the network never sent.
  assert.throws(
    () => recoverSigma({ ...response, big_c: g1Key(bls.G1.Point.BASE.toBytes()) }, scalar, id, mpcPublicKey),
    /not the key for this app id/,
  );
});

test("every malformed CKD answer is refused with its own reason", () => {
  const id = appId(KEYPOLICY, PATH);
  const scalar = 7n;
  const { response, mpcPublicKey } = mpcAnswer(99n, scalar, id, 3n);
  const zeroG1 = g1Key(bls.G1.Point.ZERO.toBytes());

  assert.throws(() => recoverSigma(response, scalar, new Uint8Array(31), mpcPublicKey), /an app id is 32 bytes/);
  assert.throws(() => recoverSigma(response, 0n, id, mpcPublicKey), /scalar is out of range/);
  assert.throws(() => recoverSigma({ ...response, big_y: zeroG1 }, scalar, id, mpcPublicKey), /big_y is not in the prime-order subgroup/);
  assert.throws(() => recoverSigma({ ...response, big_c: zeroG1 }, scalar, id, mpcPublicKey), /big_c is not in the prime-order subgroup/);
  assert.throws(
    () => recoverSigma({ ...response, big_y: g1Key(new Uint8Array(48).fill(9)) }, scalar, id, mpcPublicKey),
    /big_y is not a G1 point/,
  );
  assert.throws(
    () => recoverSigma(response, scalar, id, new Uint8Array(96).fill(9)),
    /the MPC key is not a G2 point/,
  );
  assert.throws(
    () => recoverSigma(response, scalar, id, bls.G2.Point.ZERO.toBytes()),
    /the MPC key is not in the prime-order subgroup/,
  );
  // big_c == y·a·G1 leaves σ at infinity: a network answering with no key at all.
  const y = 3n;
  const blinded = bls.G1.Point.BASE.multiply((scalar * y) % bls.G1.Point.Fn.ORDER);
  assert.throws(
    () =>
      recoverSigma(
        { big_y: g1Key(bls.G1.Point.BASE.multiply(y).toBytes()), big_c: g1Key(blinded.toBytes()) },
        scalar,
        id,
        mpcPublicKey,
      ),
    /the recovered key is not a valid point/,
  );
});

test("a listing's keys are derived from σ, deterministically and by purpose", () => {
  const sigma = mpcAnswer(5n, 11n, appId(KEYPOLICY, PATH), 13n).sigma;
  const keys = listingKeys(sigma);
  assert.deepEqual(listingKeys(sigma), keys, "any room with σ derives the same listing key");
  assert.equal(keys.root.length, 32);
  assert.equal(keys.secretKey.length, 32);
  assert.equal(keys.publicKey.length, 32);
  assert.notDeepEqual(keys.root, keys.secretKey, "the root key is not the X25519 secret");
  // near/mpc's own purpose gives a different key, which is the point of the info string.
  assert.notDeepEqual(strongKey(sigma, NEAR_STRONG_KEY_INFO), keys.root);
  assert.throws(() => strongKey(new Uint8Array(32), NEAR_STRONG_KEY_INFO), /sigma is 48 bytes/);

  // The derived pair really works: a seller who sealed DEK_g to pk_L reaches the room that
  // recovered σ, and nobody else.
  const dek = randomBytes(32);
  const sealed = seal(dek, keys.publicKey);
  assert.deepEqual(unseal(sealed, { publicKey: keys.publicKey, secretKey: keys.secretKey }), dek);
  const other = listingKeys(mpcAnswer(6n, 11n, appId(KEYPOLICY, PATH), 13n).sigma);
  assert.throws(
    () => unseal(sealed, { publicKey: other.publicKey, secretKey: other.secretKey }),
    /does not open with this key/,
  );
});

/**
 * A golden vector produced by near/mpc's own code — `cargo test -p ckd-example-cli` at release
 * 3.19.0, with a deterministic exchange (msk = 1234567890, a = 987654321, y = 55555) printed from
 * `ckd.rs`'s own helpers. It pins the whole chain across two implementations and two curve
 * libraries: the app id, the blinding, the hash-to-curve domain, σ, and near/mpc's own strong-key
 * derivation. If any constant here drifted, every key release would fail against the live network.
 */
test("the ckd-example-cli vectors pass", () => {
  const hex = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, "hex"));
  const id = appId("keypolicy.marginal-demo.testnet", "listing/alice.testnet/7/1");
  assert.equal(
    Buffer.from(id).toString("hex"),
    "5efe8e12120c87734406dd82e5e745ec33a216e482310dc47c55a7f6cfc55e57",
    "app_id",
  );

  const scalar = 987654321n;
  const mpcPublicKey = hex(
    "b8005357ad6d494e3987f01c9d83e13eedd78a0ac4e7b96c7141afedbe1be4930b40808437619555104b8c37158fa0a819f89e390a61ccda4aa3e4b1d83f85535056bd4239a33dadb9a1fc842971e6080706ad4ccd4c0c09120c322424823161",
  );
  const response = {
    big_y: g1Key(hex("87c1eb5b0ed80bb4c511bdbbacab86c6c30e4efb96ce6356f87e5af95db834950f58236fb4bd1e213e8525ea3b62673a")),
    big_c: g1Key(hex("923020600eeadc0085e2463fb3e6b35785b06d3486549dd3aff522a7eee135d5a0b47f444fe7772de80bc57755941bf5")),
  };

  const sigma = recoverSigma(response, scalar, id, mpcPublicKey);
  assert.equal(
    Buffer.from(sigma).toString("hex"),
    "a33980119e8f7dc8252ae9a75a4e8b6407397ebf00f2afba5cde117c42e8f564b1dda96ea720ce6ea3258863fd37a564",
    "sigma",
  );
  assert.equal(
    Buffer.from(strongKey(sigma, NEAR_STRONG_KEY_INFO)).toString("hex"),
    "7bafabb3ad7f98462147a05d1c65dc72f0bab909925037ac02064a55ba85d42a",
    "the example CLI's strong key",
  );
});
