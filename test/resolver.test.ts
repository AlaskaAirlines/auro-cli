import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { resolveComponents, resolveInstalled } from "../src/init/resolver.ts";
import type { Manifest } from "../src/utils/cem.ts";
import type { InstalledComponent } from "../src/utils/detectInstalled.ts";
import { elementManifest, installLocalPackage, tempCwd } from "./support.ts";

const BUTTON = "@aurodesignsystem/auro-button";
const FORMKIT = "@aurodesignsystem/auro-formkit";
const INPUT_STANDALONE = "@aurodesignsystem/auro-input";

const pascal = (tag: string): string =>
  tag
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

/** Build an aggregated CEM shipping one registered element per tag. */
function manifestWith(tags: string[]): Manifest {
  return {
    schemaVersion: "1.0.0",
    modules: tags.map((tag) => ({
      kind: "javascript-module",
      path: `${tag}.js`,
      declarations: [
        {
          kind: "class",
          name: pascal(tag),
          tagName: tag,
          customElement: true,
          description: `The ${tag} element.`,
        },
      ],
    })),
  };
}

const installed = (
  pkg: string,
  version: string,
  manifest: Manifest,
): InstalledComponent => ({ pkg, version, manifest });

test("resolveComponents imports a standalone package from its root", () => {
  const { components, duplicates } = resolveComponents([
    installed(BUTTON, "12.3.0", manifestWith(["auro-button"])),
  ]);

  assert.equal(components.length, 1);
  assert.deepEqual(
    {
      pkg: components[0].pkg,
      version: components[0].version,
      tagName: components[0].tagName,
      importPath: components[0].importPath,
      isMonorepo: components[0].isMonorepo,
    },
    {
      pkg: BUTTON,
      version: "12.3.0",
      tagName: "auro-button",
      importPath: BUTTON,
      isMonorepo: false,
    },
  );
  assert.ok(components[0].declaration, "carries the CEM declaration");
  assert.deepEqual(duplicates, []);
});

test("resolveComponents enumerates every monorepo component with subpath imports and a shared version", () => {
  const { components } = resolveComponents([
    installed(
      FORMKIT,
      "6.1.0",
      manifestWith(["auro-input", "auro-select", "auro-checkbox"]),
    ),
  ]);

  assert.deepEqual(
    components.map((c) => c.tagName),
    ["auro-input", "auro-select", "auro-checkbox"],
    "all shipped components are enumerated, in manifest order",
  );
  assert.ok(
    components.every((c) => c.isMonorepo),
    "a >1-element package is treated as a monorepo",
  );
  assert.ok(
    components.every((c) => c.version === "6.1.0"),
    "the package version is shared across every component",
  );
  assert.deepEqual(
    components.map((c) => c.importPath),
    [
      `${FORMKIT}/auro-input`,
      `${FORMKIT}/auro-select`,
      `${FORMKIT}/auro-checkbox`,
    ],
    "each component imports via its per-component subpath export",
  );
});

test("resolveComponents ignores internal base classes that carry no tag", () => {
  const manifest: Manifest = {
    schemaVersion: "1.0.0",
    modules: [
      {
        kind: "javascript-module",
        path: "auro-button.js",
        declarations: [
          // An internal base class — customElement but no tagName.
          {
            kind: "class",
            name: "AuroButtonBase",
            customElement: true,
          },
          {
            kind: "class",
            name: "AuroButton",
            tagName: "auro-button",
            customElement: true,
            description: "The auro-button element.",
          },
        ],
      },
    ],
  };

  const { components } = resolveComponents([
    installed(BUTTON, "12.3.0", manifest),
  ]);

  assert.deepEqual(
    components.map((c) => c.tagName),
    ["auro-button"],
    "the untagged base class is not a component",
  );
  assert.equal(
    components[0].isMonorepo,
    false,
    "only one real element → standalone, imports from the root",
  );
});

test("resolveComponents grounds a duplicated tag once, first-detected package wins", () => {
  const { components, duplicates } = resolveComponents([
    installed(INPUT_STANDALONE, "9.0.0", manifestWith(["auro-input"])),
    installed(FORMKIT, "6.1.0", manifestWith(["auro-input", "auro-select"])),
  ]);

  assert.deepEqual(
    components.map((c) => c.tagName),
    ["auro-input", "auro-select"],
    "auro-input is grounded exactly once, not once per registering package",
  );
  const input = components.find((c) => c.tagName === "auro-input");
  assert.equal(
    input?.pkg,
    INPUT_STANDALONE,
    "the first-detected package (the standalone) wins the grounding",
  );
  assert.equal(
    input?.importPath,
    INPUT_STANDALONE,
    "the winner keeps its own import shape — the standalone imports from the root",
  );
  assert.deepEqual(
    duplicates,
    [{ tagName: "auro-input", packages: [INPUT_STANDALONE, FORMKIT] }],
    "both colliding packages are still recorded so the command can warn",
  );
});

test("resolveComponents returns empty results for no installed packages", () => {
  assert.deepEqual(resolveComponents([]), { components: [], duplicates: [] });
});

test("resolveInstalled detects and normalises from node_modules without the network", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(
    cwd,
    BUTTON,
    "12.3.0",
    elementManifest("auro-button"),
  );
  await installLocalPackage(
    cwd,
    FORMKIT,
    "6.1.0",
    manifestWith(["auro-input", "auro-select"]),
  );
  t.mock.method(process, "cwd", () => cwd);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("resolveInstalled must not touch the network");
  });

  const { components, duplicates } = await resolveInstalled([
    BUTTON,
    FORMKIT,
    INPUT_STANDALONE, // not installed — excluded
  ]);

  assert.equal(fetchMock.mock.callCount(), 0, "local reads only");
  assert.deepEqual(
    components.map((c) => c.tagName),
    ["auro-button", "auro-input", "auro-select"],
    "only installed packages, all monorepo components enumerated",
  );
  assert.deepEqual(
    components.map((c) => c.importPath),
    [BUTTON, `${FORMKIT}/auro-input`, `${FORMKIT}/auro-select`],
  );
  assert.deepEqual(duplicates, [], "no overlapping tags here");
});
