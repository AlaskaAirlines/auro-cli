import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
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

test("ignores a customElements field that escapes the package directory", async (t) => {
  const cwd = await tempCwd(t);
  // Legit default manifest ships at custom-elements.json...
  await installLocalPackage(cwd, PKG, "12.3.0", elementManifest("auro-button"));
  // ...but the package.json points customElements at a file outside the pkg dir.
  const pkgDir = path.join(cwd, "node_modules", ...PKG.split("/"));
  await writeFile(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name: PKG,
      version: "12.3.0",
      customElements: "../../../../evil.json",
    }),
  );
  await writeFile(
    path.join(cwd, "evil.json"),
    JSON.stringify(elementManifest("evil-element")),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("should read the constrained default, not fetch");
  });

  const result = await fetchManifest(PKG);

  assert.equal(result.source, "local");
  // The escaping path was refused; the default custom-elements.json was read.
  const tags = (
    (result.manifest as { modules?: { declarations?: unknown[] }[] }).modules ??
    []
  )
    .flatMap((m) => m.declarations ?? [])
    .map((d) => (d as { tagName?: string }).tagName);
  assert.ok(tags.includes("auro-button"), "read the package's own manifest");
  assert.ok(!tags.includes("evil-element"), "did not read the escaping path");
});

test("a package name with .. segments never reads outside node_modules", async (t) => {
  const cwd = await tempCwd(t);
  // Plant a readable file above the project tree; the traversing name resolves
  // toward it, but the guard must refuse before any read is attempted.
  const secret = path.join(cwd, "secret.json");
  await writeFile(secret, JSON.stringify(elementManifest("secret-element")));
  t.mock.method(process, "cwd", () => cwd);
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  // node_modules/@evil/../../secret.json would escape the project tree.
  const result = await fetchManifest("@evil/../../secret.json", {
    allowNetwork: false,
  });

  assert.equal(result.manifest, null, "no local read outside node_modules");
  assert.equal(result.source, undefined);
  assert.equal(fetchMock.mock.callCount(), 0, "offline, so no network either");
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
