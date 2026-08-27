import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { Manifest } from "../src/utils/cem.ts";
import {
  type ManifestSource,
  mergeManifests,
  namespaceReferences,
} from "../src/utils/mergeManifests.ts";

/** A source with a single module at `src/<pkg-tail>.js`. */
function source(pkg: string, schemaVersion?: string): ManifestSource {
  const tail = pkg.split("/").pop();
  return {
    pkg,
    manifest: {
      schemaVersion,
      modules: [{ path: `src/${tail}.js` }],
    } as Manifest,
  };
}

test("namespaces every module path with its owning package", () => {
  const merged = mergeManifests([
    source("@aurodesignsystem/auro-button"),
    source("@aurodesignsystem/auro-card"),
  ]);

  assert.deepEqual(
    merged.modules?.map((m) => m.path),
    [
      "@aurodesignsystem/auro-button/src/auro-button.js",
      "@aurodesignsystem/auro-card/src/auro-card.js",
    ],
  );
});

test("namespaces local module references but leaves external ones untouched", () => {
  const withRefs = namespaceReferences(
    {
      path: "src/auro-button.js",
      exports: [
        // Local reference — no `package` sibling, so its `module` is rewritten.
        { declaration: { name: "AuroButton", module: "src/auro-button.js" } },
        // External reference — a `package` sibling means `module` is left as-is.
        { declaration: { name: "LitElement", module: "lit", package: "lit" } },
      ],
    },
    "@aurodesignsystem/auro-button",
  ) as {
    exports: Array<{ declaration: { module: string; package?: string } }>;
  };

  assert.equal(
    withRefs.exports[0].declaration.module,
    "@aurodesignsystem/auro-button/src/auro-button.js",
  );
  assert.equal(withRefs.exports[1].declaration.module, "lit");
});

test("warns once, listing every distinct version, when schemas are mixed", () => {
  const warn = mock.fn();

  const merged = mergeManifests(
    [
      source("@aurodesignsystem/auro-button", "1.0.0"),
      source("@aurodesignsystem/auro-card", "2.1.0"),
      // A repeat of an already-seen version must not add a duplicate.
      source("@aurodesignsystem/auro-nav", "1.0.0"),
    ],
    warn,
  );

  assert.equal(warn.mock.callCount(), 1);
  assert.equal(
    warn.mock.calls[0].arguments[0],
    "Merging mixed CEM schema versions: 1.0.0, 2.1.0",
  );
  // The merge still succeeds and adopts the first source's version.
  assert.equal(merged.schemaVersion, "1.0.0");
  assert.equal(merged.modules?.length, 3);
});

test("does not warn when every source shares one schema version", () => {
  const warn = mock.fn();

  mergeManifests(
    [
      source("@aurodesignsystem/auro-button", "1.0.0"),
      source("@aurodesignsystem/auro-card", "1.0.0"),
    ],
    warn,
  );

  assert.equal(warn.mock.callCount(), 0);
});

test("treats a missing schemaVersion as no version (never a spurious mix)", () => {
  const warn = mock.fn();

  // One source declares a version, the other omits it. The absent version is
  // filtered out, so the set has a single entry and no warning fires.
  const merged = mergeManifests(
    [
      source("@aurodesignsystem/auro-button", "1.0.0"),
      source("@aurodesignsystem/auro-card", undefined),
    ],
    warn,
  );

  assert.equal(warn.mock.callCount(), 0);
  assert.equal(merged.schemaVersion, "1.0.0");
});

test("defaults the aggregate version to 1.0.0 when no sources are given", () => {
  const warn = mock.fn();

  const merged = mergeManifests([], warn);

  assert.equal(warn.mock.callCount(), 0);
  assert.equal(merged.schemaVersion, "1.0.0");
  assert.deepEqual(merged.modules, []);
});
