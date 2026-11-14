import test from "node:test";
import assert from "node:assert/strict";

import type { Fetch } from "./chain";
import { deliveryKey, getObject, goodKey, handleDelivery } from "./delivery";

/** A gateway that serves bytes by key, or the status a test asks for. */
function fakeGateway(
  objects: Record<string, Uint8Array | number>,
): { fetch: Fetch; asked: string[] } {
  const asked: string[] = [];
  const fetch = ((url: string) => {
    asked.push(url);
    const key = url.split("/v1/blob/")[1] ?? "";
    const found = objects[key];
    if (found === undefined) {
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }
    if (typeof found === "number") {
      return Promise.resolve({ ok: false, status: found } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(found.buffer),
    } as Response);
  }) as unknown as Fetch;
  return { fetch, asked };
}

test("the object keys are the ones the room writes", () => {
  assert.equal(deliveryKey(11), "deliveries/11");
  assert.equal(goodKey(3, 1), "listings/3/v1/good");
  assert.equal(goodKey(12, 4), "listings/12/v4/good");
});

test("an object comes back as hex, and a gateway that has none says which key", async () => {
  const gateway = fakeGateway({ "deliveries/11": new Uint8Array([0xde, 0xad, 0xbe, 0xef]) });
  assert.equal(await getObject("http://gw", "deliveries/11", gateway.fetch), "deadbeef");
  assert.deepEqual(gateway.asked, ["http://gw/v1/blob/deliveries/11"]);

  await assert.rejects(
    () => getObject("http://gw", "deliveries/12", gateway.fetch),
    /has no object at deliveries\/12/,
  );
  const broken = fakeGateway({ "deliveries/11": 500 });
  await assert.rejects(
    () => getObject("http://gw", "deliveries/11", broken.fetch),
    /answered 500 for deliveries\/11/,
  );
});

const bundleRequest = (query: string) =>
  new Request(`http://localhost/api/delivery?${query}`);

test("the bundle is the delivery envelope and the sealed object", async () => {
  const gateway = fakeGateway({
    "deliveries/11": new Uint8Array([1, 2, 3]),
    "listings/3/v1/good": new Uint8Array([4, 5]),
  });
  const seen: { op: string; input: unknown }[] = [];
  const call = (op: string, input: unknown) => {
    seen.push({ op, input });
    return { eph_pk: "ab", entries: [] };
  };
  const response = await handleDelivery(
    call,
    bundleRequest("job=11&listing=3&version=1"),
    "http://gw",
    gateway.fetch,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: { delivery: unknown; objectHex: string } };
  assert.deepEqual(body.ok.delivery, { eph_pk: "ab", entries: [] });
  assert.equal(body.ok.objectHex, "0405");
  // The envelope is decoded by core, from the bytes the gateway served.
  assert.deepEqual(seen, [{ op: "delivery_decode", input: { bytes: "010203" } }]);
});

test("a request that does not name a job, a listing and a version is refused", async () => {
  const call = () => ({});
  for (const query of [
    "",
    "job=11",
    "job=11&listing=3",
    "job=0&listing=3&version=1",
    "job=abc&listing=3&version=1",
    "job=11&listing=3&version=0",
  ]) {
    const response = await handleDelivery(call, bundleRequest(query), "http://gw");
    assert.equal(response.status, 400, query);
    assert.match(((await response.json()) as { error: string }).error, /positive integers/);
  }
});

test("a gateway that is not running, and an envelope core refuses, both answer 502", async () => {
  const empty = fakeGateway({});
  const refused = await handleDelivery(
    () => ({}),
    bundleRequest("job=11&listing=3&version=1"),
    "http://gw",
    empty.fetch,
  );
  assert.equal(refused.status, 502);
  assert.match(((await refused.json()) as { error: string }).error, /has no object at/);

  const gateway = fakeGateway({
    "deliveries/11": new Uint8Array([1]),
    "listings/3/v1/good": new Uint8Array([2]),
  });
  const bad = await handleDelivery(
    () => {
      throw new Error("E_DECODE");
    },
    bundleRequest("job=11&listing=3&version=1"),
    "http://gw",
    gateway.fetch,
  );
  assert.equal(bad.status, 502);
  assert.equal(((await bad.json()) as { error: string }).error, "E_DECODE");
});
