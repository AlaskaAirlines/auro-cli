/**
 * `auro api-diff` package.json and changed-files classification — one test per
 * row of the TRD's package.json and changed-files tables.
 *
 * @see ../src/scripts/api-diff/package-diff.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diffChangedFiles,
  diffPackageJson,
  isPublishedPath,
  isPublishedTarget,
  type PackageJson,
} from "../src/scripts/api-diff/package-diff.ts";

function diff(base: PackageJson, head: PackageJson): Array<[string, string]> {
  return diffPackageJson(base, head).map((c) => [c.bump, c.message]);
}

test("identical package.json files have no changes", () => {
  const pkg: PackageJson = {
    main: "dist/index.js",
    exports: { ".": "./dist/index.js" },
    files: ["dist"],
    dependencies: { lit: "^3.3.2" },
  };
  assert.deepEqual(diff(pkg, pkg), []);
});

test("removing an exports entry is major; adding one is minor", () => {
  const base = { exports: { ".": "./a.js", "./class": "./b.js" } };
  assert.deepEqual(diff(base, { exports: { ".": "./a.js" } }), [
    ["major", "Removed export `./class`"],
  ]);
  assert.deepEqual(
    diff(base, { exports: { ...base.exports, "./demo/*.md": "./demo/*.md" } }),
    [["minor", "Added export `./demo/*.md`"]],
  );
});

test("a string or conditions-object exports is the `.` entry", () => {
  assert.deepEqual(
    diff(
      { exports: "./a.js" },
      { exports: { import: "./a.js", types: "./a.d.ts" } },
    ),
    [],
  );
  assert.deepEqual(diff({ exports: "./a.js" }, { exports: {} }), [
    ["major", "Removed export `.`"],
  ]);
});

test("introducing exports is major, since it blocks unlisted deep imports", () => {
  assert.deepEqual(diff({}, { exports: { ".": "./a.js", "./b": "./b.js" } }), [
    ["major", "Added `exports`, which blocks imports of unlisted paths"],
  ]);
});

test("removing main, types or a files entry is major; changing or adding them isn't", () => {
  assert.deepEqual(
    diff(
      { main: "a.js", types: "a.d.ts", files: ["dist", "demo"] },
      { files: ["dist"] },
    ),
    [
      ["major", "Removed `main` (`a.js`)"],
      ["major", "Removed `types` (`a.d.ts`)"],
      ["major", "Removed `files` entry `demo`"],
    ],
  );
  assert.deepEqual(
    diff(
      { main: "a.js", files: ["dist"] },
      { main: "b.js", files: ["dist", "x"] },
    ),
    [],
  );
});

test("a major bump of a peer or runtime dependency is major", () => {
  assert.deepEqual(
    diff(
      {
        peerDependencies: { lit: "^2.0.0" },
        dependencies: { tslib: "^1.2.0" },
      },
      {
        peerDependencies: { lit: "^3.0.0" },
        dependencies: { tslib: "^2.0.0" },
      },
    ),
    [
      ["major", "Bumped peer dependency `lit` from `^2.0.0` to `^3.0.0`"],
      ["major", "Bumped dependency `tslib` from `^1.2.0` to `^2.0.0`"],
    ],
  );
});

test("minor dependency bumps, new dependencies and devDependency bumps aren't changes", () => {
  assert.deepEqual(
    diff(
      { dependencies: { lit: "^3.0.0" } },
      { dependencies: { lit: "^3.3.2", other: "^1.0.0" } },
    ),
    [],
  );
});

test("below 1.0.0, a minor dependency bump is major", () => {
  assert.deepEqual(
    diff({ dependencies: { x: "^0.2.0" } }, { dependencies: { x: "^0.3.0" } }),
    [["major", "Bumped dependency `x` from `^0.2.0` to `^0.3.0`"]],
  );
});

test("non-semver dependency specifiers are ignored", () => {
  assert.deepEqual(
    diff(
      { dependencies: { x: "github:a/b" } },
      { dependencies: { x: "file:../x" } },
    ),
    [],
  );
});

test("tightening or adding an engines constraint is major; loosening isn't", () => {
  assert.deepEqual(
    diff({ engines: { node: ">=18" } }, { engines: { node: ">=20" } }),
    [["major", "Tightened engine `node` from `>=18` to `>=20`"]],
  );
  assert.deepEqual(diff({}, { engines: { node: ">=20" } }), [
    ["major", "Added engine `node` requirement `>=20`"],
  ]);
  assert.deepEqual(
    diff({ engines: { node: ">=20" } }, { engines: { node: ">=18" } }),
    [],
  );
  assert.deepEqual(diff({ engines: { node: ">=20" } }, {}), []);
});

test("src/, demo/ and README.md changes are published and need a patch", () => {
  for (const file of [
    "src/auro-button.js",
    "demo/index.md",
    "README.md",
    "components/combobox/src/auro-combobox.js",
    "components/combobox/README.md",
  ]) {
    assert.equal(isPublishedPath(file), true, file);
  }
  assert.deepEqual(
    diffChangedFiles(["src/a.js", "test/a.test.js"]).map((c) => c.bump),
    ["patch"],
  );
});

test("test/, .github/, docs/ and other unpublished files need no release", () => {
  for (const file of [
    "test/auro-button.test.js",
    ".github/workflows/ci.yml",
    "docs/partials/index.md",
    "docs/src/thing.md",
    "package-lock.json",
    "biome.json",
  ]) {
    assert.equal(isPublishedPath(file), false, file);
  }
  assert.deepEqual(
    diffChangedFiles(["test/a.test.js", ".github/x.yml", "docs/README.md"]),
    [],
  );
});

test("the changed-files reason lists at most five files", () => {
  const files = Array.from({ length: 7 }, (_, i) => `src/f${i}.js`);
  const [change] = diffChangedFiles(files);
  assert.match(change.message, /`src\/f4\.js` and 2 more$/u);
});

test("an export whose target was never published isn't API: removing or adding one is a patch", () => {
  const files = ["dist/**/*", "demo/**/*", "README.md"];
  assert.deepEqual(
    diff(
      {
        files,
        exports: {
          ".": "./dist/a.js",
          "./package-lock.json": "./package-lock.json",
        },
      },
      { files, exports: { ".": "./dist/a.js" } },
    ),
    [
      [
        "patch",
        "Removed export `./package-lock.json`, which never resolved: its target isn't in the published package",
      ],
    ],
  );
  // Like the packages that export a custom-elements.json they don't publish.
  assert.deepEqual(
    diff(
      { files, exports: { ".": "./dist/a.js" } },
      {
        files,
        exports: {
          ".": "./dist/a.js",
          "./custom-elements.json": "./custom-elements.json",
        },
      },
    ),
    [
      [
        "patch",
        "Added export `./custom-elements.json`, which won't resolve: its target isn't in the published package",
      ],
    ],
  );
});

test("exports covered by files, by npm's always-published files, or with no files list are API", () => {
  const files = ["custom-elements.json", "dist/**/*", "demo/**/*"];
  const exports = {
    ".": "./dist/registered.js",
    "./custom-elements.json": "./custom-elements.json",
    "./package.json": "./package.json",
    "./readme.md": "./README.md",
    "./demo/*.js": "./demo/*.min.js",
    "./class": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  };
  assert.deepEqual(
    diff({ files, exports }, { files, exports: {} }).map(([bump]) => bump),
    Array(6).fill("major"),
  );
  assert.deepEqual(diff({ exports: { "./x": "./x.js" } }, { exports: {} }), [
    ["major", "Removed export `./x`"],
  ]);
});

test("isPublishedTarget", () => {
  assert.equal(isPublishedTarget("./package-lock.json"), false);
  assert.equal(isPublishedTarget("./node_modules/x/index.js"), false);
  assert.equal(isPublishedTarget("./LICENSE", ["dist"]), true);
  assert.equal(isPublishedTarget("./dist/a/b.js", ["dist"]), true);
  assert.equal(isPublishedTarget("./distro/a.js", ["dist"]), false);
  assert.equal(isPublishedTarget("./demo/*.md", ["demo/**/*"]), true);
});
