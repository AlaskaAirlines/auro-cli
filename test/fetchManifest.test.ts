import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchManifest,
  type ManifestFetchResult,
  partitionOutcomes,
} from "../src/utils/fetchManifest.ts";

// Every case forces the network path with `preferLocal: false` so the result is
// determined purely by the mocked `fetch`, independent of the cwd's node_modules.
const NET = { preferLocal: false } as const;

test("a genuine 404 is a skip, not a transient failure", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  const result = await fetchManifest("@aurodesignsystem/auro-icon", NET);

  assert.equal(result.manifest, null);
  assert.equal(result.reason, "no custom-elements.json published");
  assert.ok(!result.transient, "a 404 must not be flagged transient");
});

test("a timeout is transient and reports the 10s deadline", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  });

  const result = await fetchManifest("@aurodesignsystem/auro-button", NET);

  assert.equal(result.manifest, null);
  assert.equal(result.transient, true);
  assert.equal(result.reason, "request failed (timed out after 10s)");
});

test("a network error is transient and surfaces the underlying cause", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  const result = await fetchManifest("@aurodesignsystem/auro-button", NET);

  assert.equal(result.transient, true);
  assert.equal(result.reason, "request failed (fetch failed)");
});

test("a 5xx response is transient", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 500 }),
  );

  const result = await fetchManifest("@aurodesignsystem/auro-button", NET);

  assert.equal(result.transient, true);
  assert.equal(result.reason, "HTTP 500");
});

test("an unparseable body is transient", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<!doctype html>not json", { status: 200 }),
  );

  const result = await fetchManifest("@aurodesignsystem/auro-button", NET);

  assert.equal(result.transient, true);
  assert.equal(result.reason, "custom-elements.json is not valid JSON");
});

test("a 200 with valid JSON resolves the manifest from unpkg", async (t) => {
  const manifest = { schemaVersion: "1.0.0", modules: [] };
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(manifest), { status: 200 }),
  );

  const result = await fetchManifest("@aurodesignsystem/auro-button", NET);

  assert.deepEqual(result.manifest, manifest);
  assert.equal(result.source, "unpkg");
  assert.ok(!result.transient);
});

test("a network miss is non-transient when network is disabled", async (t) => {
  // Should never fetch — assert that and make an accidental call loud.
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not be called when allowNetwork is false");
  });

  const result = await fetchManifest("@aurodesignsystem/auro-button", {
    preferLocal: false,
    allowNetwork: false,
  });

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(result.manifest, null);
  assert.ok(!result.transient);
  assert.match(result.reason ?? "", /network fetching is disabled/);
});

test("partitions genuine 404 skips from transient failures", () => {
  const outcomes: ManifestFetchResult[] = [
    { target: "ok", manifest: { modules: [] }, source: "unpkg" },
    {
      target: "gone",
      manifest: null,
      reason: "no custom-elements.json published",
    },
    {
      target: "flaky",
      manifest: null,
      reason: "request failed (fetch failed)",
      transient: true,
    },
  ];

  const { skipped, transientFailures } = partitionOutcomes(outcomes);

  // Both misses are skipped; only the transient one makes the aggregate incomplete.
  assert.deepEqual(
    skipped.map((o) => o.target),
    ["gone", "flaky"],
  );
  assert.deepEqual(
    transientFailures.map((o) => o.target),
    ["flaky"],
  );
});

test("reports no transient failures when every miss is a genuine 404", () => {
  const outcomes: ManifestFetchResult[] = [
    { target: "ok", manifest: { modules: [] }, source: "unpkg" },
    {
      target: "gone",
      manifest: null,
      reason: "no custom-elements.json published",
    },
  ];

  const { skipped, transientFailures } = partitionOutcomes(outcomes);

  assert.equal(skipped.length, 1);
  assert.equal(transientFailures.length, 0);
});
