import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import {
  fetchLatestVersion,
  fetchManifest,
} from "../src/utils/fetchManifest.ts";
import { elementManifest, installLocalPackage, tempCwd } from "./support.ts";

const PKG = "@aurodesignsystem/auro-button";

test("prefers a locally installed manifest and never hits the network", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(cwd, PKG, "12.3.0", elementManifest("auro-button"));
  t.mock.method(process, "cwd", () => cwd);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("network must not be used when a local copy exists");
  });

  const result = await fetchManifest(PKG);

  assert.equal(result.source, "local");
  assert.equal(result.version, "12.3.0");
  assert.ok(result.manifest, "the local manifest is returned");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("honors a package's custom customElements manifest path", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(cwd, PKG, "1.0.0", elementManifest("auro-button"), {
    customElements: "dist/custom-elements.json",
  });
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("should read the custom path locally, not fetch");
  });

  const result = await fetchManifest(PKG);

  assert.equal(result.source, "local");
  assert.equal(result.version, "1.0.0");
});

test("falls back to unpkg when installed but shipping no manifest", async (t) => {
  const cwd = await tempCwd(t);
  // Install package.json only (no custom-elements.json shipped).
  await installLocalPackage(cwd, PKG, "9.9.9", elementManifest("auro-button"), {
    omitManifest: true,
  });
  t.mock.method(process, "cwd", () => cwd);
  const remote = elementManifest("auro-button");
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(remote), { status: 200 }),
  );

  const result = await fetchManifest(PKG);

  assert.equal(result.source, "unpkg");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("falls back to unpkg when the package is not installed", async (t) => {
  const cwd = await tempCwd(t); // empty, no node_modules
  t.mock.method(process, "cwd", () => cwd);
  const remote = elementManifest("auro-button");
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(remote), { status: 200 }),
  );

  const result = await fetchManifest(PKG);

  assert.equal(result.source, "unpkg");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("an explicit version skips the local copy and goes to unpkg", async (t) => {
  const cwd = await tempCwd(t);
  // Local copy is a different version; an explicit @ref means "exactly this".
  await installLocalPackage(cwd, PKG, "12.3.0", elementManifest("auro-button"));
  t.mock.method(process, "cwd", () => cwd);
  const remote = elementManifest("auro-button");
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(remote), { status: 200 }),
  );

  const result = await fetchManifest(`${PKG}@11.0.0`);

  assert.equal(result.source, "unpkg", "explicit ref forces the network path");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("preferLocal:false skips a local copy even without a ref", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(cwd, PKG, "12.3.0", elementManifest("auro-button"));
  t.mock.method(process, "cwd", () => cwd);
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify(elementManifest("auro-button")), {
        status: 200,
      }),
  );

  const result = await fetchManifest(PKG, { preferLocal: false });

  assert.equal(result.source, "unpkg");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("fetchLatestVersion returns the version from the registry", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ version: "13.0.0" }), { status: 200 }),
  );
  assert.equal(await fetchLatestVersion(PKG), "13.0.0");
});

test("fetchLatestVersion returns null on a non-ok response", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );
  assert.equal(await fetchLatestVersion(PKG), null);
});

test("fetchLatestVersion returns null when version is missing", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({}), { status: 200 }),
  );
  assert.equal(await fetchLatestVersion(PKG), null);
});

test("fetchLatestVersion returns null when the request throws", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(await fetchLatestVersion(PKG), null);
});
