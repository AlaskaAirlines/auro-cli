import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { buildAggregateManifest } from "../src/utils/aggregateManifest.ts";
import { elementManifest, installLocalPackage, tempCwd } from "./support.ts";

const BUTTON = "@aurodesignsystem/auro-button";
const ACCORDION = "@aurodesignsystem/auro-accordion";
const BADGE = "@aurodesignsystem/auro-badge";

test("buildAggregateManifest merges the manifests that resolve", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(
    cwd,
    BUTTON,
    "12.3.0",
    elementManifest("auro-button"),
  );
  await installLocalPackage(
    cwd,
    ACCORDION,
    "3.0.0",
    elementManifest("auro-accordion"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline aggregate must not touch the network");
  });

  const result = await buildAggregateManifest([BUTTON, ACCORDION], {
    allowNetwork: false,
  });

  assert.equal(result.sources.length, 2, "both local reads become sources");
  assert.deepEqual(result.sources.map((s) => s.pkg).sort(), [
    ACCORDION,
    BUTTON,
  ]);
  // Each source contributes at least its one module to the merged manifest.
  assert.ok(
    (result.manifest.modules?.length ?? 0) >= 2,
    "merged manifest carries every source's modules",
  );
  assert.deepEqual(result.skipped, [], "nothing skipped when all resolve");
  assert.deepEqual(result.transientFailures, [], "and nothing failed");
});

test("buildAggregateManifest surfaces a transient failure without throwing", async (t) => {
  const cwd = await tempCwd(t);
  // Only one package is installed; the other 500s from unpkg (transient).
  await installLocalPackage(
    cwd,
    BUTTON,
    "12.3.0",
    elementManifest("auro-button"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("auro-accordion")) {
      return new Response("upstream boom", { status: 503 });
    }
    return new Response(null, { status: 404 });
  });

  const result = await buildAggregateManifest([BUTTON, ACCORDION]);

  assert.deepEqual(
    result.sources.map((s) => s.pkg),
    [BUTTON],
    "the installed package still aggregates",
  );
  assert.equal(
    result.transientFailures.length,
    1,
    "the 503 is reported as a transient failure",
  );
  assert.equal(result.transientFailures[0].target, ACCORDION);
  assert.ok(
    result.skipped.some((o) => o.target === ACCORDION),
    "transient failures are a subset of skipped",
  );
});

test("buildAggregateManifest returns a valid empty result when nothing resolves", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  // Genuine 404s — no manifest published, nothing transient.
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  const result = await buildAggregateManifest([BADGE]);

  assert.deepEqual(result.sources, [], "no sources");
  assert.deepEqual(result.transientFailures, [], "no transient failures");
  assert.equal(result.skipped.length, 1, "the 404 is a plain skip");
  // Still a well-formed manifest object — the caller decides if empty is an error.
  assert.ok(result.manifest, "an empty manifest is still returned");
  assert.deepEqual(result.manifest.modules ?? [], [], "with no modules");
});
