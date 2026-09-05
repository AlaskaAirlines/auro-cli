import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import type { Manifest } from "../src/utils/cem.ts";
import {
  detectInstalled,
  installedFromOutcomes,
} from "../src/utils/detectInstalled.ts";
import type { ManifestFetchResult } from "../src/utils/fetchManifest.ts";
import { elementManifest, installLocalPackage, tempCwd } from "./support.ts";

const BUTTON = "@aurodesignsystem/auro-button";
const ACCORDION = "@aurodesignsystem/auro-accordion";
const ICON = "@aurodesignsystem/auro-icon";

const manifest = (tag: string): Manifest => elementManifest(tag) as Manifest;

test("installedFromOutcomes keeps only local reads with a version and manifest", () => {
  const outcomes: ManifestFetchResult[] = [
    {
      target: BUTTON,
      manifest: manifest("auro-button"),
      source: "local",
      version: "12.3.0",
    },
    // Resolved from unpkg — not installed, so excluded.
    {
      target: ACCORDION,
      manifest: manifest("auro-accordion"),
      source: "unpkg",
    },
    // Local but no version captured — excluded (can't pin a version).
    { target: ICON, manifest: manifest("auro-icon"), source: "local" },
    // No manifest at all — excluded.
    { target: "@aurodesignsystem/auro-badge", manifest: null, reason: "404" },
  ];

  const installed = installedFromOutcomes(outcomes);

  assert.deepEqual(
    installed.map((c) => c.pkg),
    [BUTTON],
    "only the versioned local read survives",
  );
  assert.equal(installed[0].version, "12.3.0");
  assert.ok(installed[0].manifest, "carries the parsed manifest");
});

test("detectInstalled scans node_modules and never hits the network", async (t) => {
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
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("detectInstalled must not touch the network");
  });

  const installed = await detectInstalled([BUTTON, ACCORDION, ICON]);

  assert.equal(fetchMock.mock.callCount(), 0, "local reads only");
  const byPkg = new Map(installed.map((c) => [c.pkg, c.version]));
  assert.deepEqual(
    [...byPkg.entries()].sort(),
    [
      [ACCORDION, "3.0.0"],
      [BUTTON, "12.3.0"],
    ],
    "returns installed packages with their pinned versions",
  );
  assert.ok(!byPkg.has(ICON), "a package that isn't installed is excluded");
});

test("detectInstalled pins the installed package.json version, never 'latest'", async (t) => {
  const cwd = await tempCwd(t);
  // The installed package.json carries an exact semver — that is what must be
  // captured. `latest` is an npm dist-tag, never a resolved installed version.
  await installLocalPackage(
    cwd,
    BUTTON,
    "12.3.0",
    elementManifest("auro-button"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("detectInstalled must not touch the network");
  });

  const installed = await detectInstalled([BUTTON]);

  assert.equal(installed.length, 1);
  assert.equal(
    installed[0].version,
    "12.3.0",
    "the resolved version is the installed semver from package.json",
  );
  assert.notEqual(
    installed[0].version,
    "latest",
    "a resolved version is never the npm dist-tag",
  );
});

test("detectInstalled excludes a package installed without a manifest", async (t) => {
  const cwd = await tempCwd(t);
  // Installed (package.json present) but ships no custom-elements.json.
  await installLocalPackage(cwd, ICON, "6.1.0", null, { omitManifest: true });
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  const installed = await detectInstalled([ICON]);

  assert.deepEqual(installed, [], "no manifest → nothing to ground against");
});
