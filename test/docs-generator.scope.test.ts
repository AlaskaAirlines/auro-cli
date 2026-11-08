/**
 * `auro docs --api --manifest <path>` in a monorepo
 * ([docs-generator.ts](../src/scripts/docs/docs-generator.ts)): a package reads
 * the shared root `custom-elements.json` and documents only its own elements,
 * limited to the ones with a `scripts/wca` entry point when it has any.
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import type { Package } from "custom-elements-manifest";
import Docs from "../src/scripts/docs/docs-generator.ts";
import { tempCwd } from "./support.ts";

/** A custom element declaration with the given class and tag name. */
function element(name: string, tagName: string) {
  return {
    kind: "class" as const,
    name,
    tagName,
    customElement: true as const,
    description: `The ${tagName} element.`,
  };
}

/** A root manifest covering a select and a datepicker package. */
const monorepoManifest: Package = {
  schemaVersion: "1.0.0",
  modules: [
    {
      kind: "javascript-module",
      path: "components/select/src/auro-select.js",
      declarations: [element("AuroSelect", "auro-select")],
    },
    {
      kind: "javascript-module",
      path: "components/select/src/selectUtils.js",
      declarations: [{ kind: "function", name: "getOptions" }],
    },
    {
      kind: "javascript-module",
      path: "components/datepicker/src/auro-datepicker.js",
      declarations: [element("AuroDatePicker", "auro-datepicker")],
    },
    {
      kind: "javascript-module",
      path: "components/datepicker/src/auro-calendar-cell.js",
      declarations: [element("AuroCalendarCell", "auro-formkit-calendar-cell")],
    },
  ],
};

/**
 * Lay out a temp monorepo with the root manifest and the given packages, each
 * with the given `scripts/wca` entry points.
 */
async function monorepo(
  t: TestContext,
  packages: Record<string, string[]>,
): Promise<string> {
  const root = await tempCwd(t);
  await writeFile(
    path.join(root, "custom-elements.json"),
    JSON.stringify(monorepoManifest),
  );
  for (const [name, wcaTags] of Object.entries(packages)) {
    const wcaDir = path.join(root, "components", name, "scripts", "wca");
    await mkdir(wcaDir, { recursive: true });
    for (const tag of wcaTags) {
      await writeFile(path.join(wcaDir, `${tag}.js`), "");
    }
  }
  return root;
}

/** The tag names of the custom elements left in a manifest. */
function tagNames(manifest: Package): string[] {
  return manifest.modules.flatMap((module) =>
    (module.declarations ?? []).flatMap((dec) =>
      "tagName" in dec && dec.tagName ? [dec.tagName] : [],
    ),
  );
}

/** Run with `dir` as the working directory, restoring it afterwards. */
function chdir(t: TestContext, dir: string): void {
  const original = process.cwd();
  process.chdir(dir);
  t.after(() => process.chdir(original));
}

test("a manifest in the package folder isn't shared", () => {
  assert.equal(
    Docs.isSharedManifest("./custom-elements.json", "/repo/pkg"),
    false,
  );
  assert.equal(
    Docs.isSharedManifest("/repo/pkg/custom-elements.json", "/repo/pkg"),
    false,
  );
  assert.equal(
    Docs.isSharedManifest(
      "../../custom-elements.json",
      "/repo/components/select",
    ),
    true,
  );
});

test("a shared manifest keeps only this package's modules, including non-element declarations", async (t) => {
  const root = await monorepo(t, { select: [] });
  const scoped = Docs.scopeManifest(
    monorepoManifest,
    "../../custom-elements.json",
    path.join(root, "components", "select"),
  );

  assert.deepEqual(
    scoped.modules.map((module) => module.path),
    [
      "components/select/src/auro-select.js",
      "components/select/src/selectUtils.js",
    ],
  );
  assert.deepEqual(tagNames(scoped), ["auro-select"]);
});

test("with scripts/wca entry points, only those elements are kept", async (t) => {
  const root = await monorepo(t, { datepicker: ["auro-datepicker"] });
  const scoped = Docs.scopeManifest(
    monorepoManifest,
    "../../custom-elements.json",
    path.join(root, "components", "datepicker"),
  );

  assert.deepEqual(tagNames(scoped), ["auro-datepicker"]);
});

test("without scripts/wca entry points, every element in the package is kept", async (t) => {
  const root = await tempCwd(t);
  const packageDir = path.join(root, "components", "datepicker");
  await mkdir(packageDir, { recursive: true });

  const scoped = Docs.scopeManifest(
    monorepoManifest,
    "../../custom-elements.json",
    packageDir,
  );

  assert.deepEqual(tagNames(scoped), [
    "auro-datepicker",
    "auro-formkit-calendar-cell",
  ]);
});

test("module paths that start with ./ still match", async (t) => {
  const root = await monorepo(t, { select: [] });
  const manifest: Package = {
    ...monorepoManifest,
    modules: monorepoManifest.modules.map((module) => ({
      ...module,
      path: `./${module.path}`,
    })),
  };

  const scoped = Docs.scopeManifest(
    manifest,
    "../../custom-elements.json",
    path.join(root, "components", "select"),
  );

  assert.deepEqual(tagNames(scoped), ["auro-select"]);
});

test("a manifest outside the package's parent folders is rejected", () => {
  assert.throws(
    () =>
      Docs.scopeManifest(
        monorepoManifest,
        "/elsewhere/custom-elements.json",
        "/repo/components/select",
      ),
    /isn't in \/repo\/components\/select or one of its parent folders/u,
  );
});

test("generate writes api.md with only this package's documented elements", async (t) => {
  const root = await monorepo(t, { datepicker: ["auro-datepicker"] });
  chdir(t, path.join(root, "components", "datepicker"));

  Docs.generate({ manifestPath: "../../custom-elements.json" });

  const markdown = await readFile(path.join("docs", "api.md"), "utf8");
  assert.match(markdown, /^# auro-datepicker$/mu);
  assert.doesNotMatch(markdown, /auro-select|auro-formkit-calendar-cell/u);
});

test("generate fails when a shared manifest has no elements for this package", async (t) => {
  const root = await monorepo(t, { checkbox: ["auro-checkbox"] });
  chdir(t, path.join(root, "components", "checkbox"));

  assert.throws(
    () => Docs.generate({ manifestPath: "../../custom-elements.json" }),
    /has no custom elements under/u,
  );
});
