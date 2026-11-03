import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildDependencyMap,
  transitiveDependents,
} from "../src/scripts/dependencyMap/buildMap.ts";
import {
  extractBundledDeps,
  extractFromWorkspace,
  parseComponentImports,
  parseVersionScript,
  satisfiesRange,
} from "../src/scripts/dependencyMap/extractBundledDeps.ts";
import {
  renderDependencyMapMarkdown,
  renderMermaid,
} from "../src/scripts/dependencyMap/renderMarkdown.ts";

const WORKSPACE = fileURLToPath(
  new URL("./fixtures/dependencyMap", import.meta.url),
);
const fixture = (name: string) => `${WORKSPACE}/${name}`;

test("parseVersionScript reads every writeDepVersionFile call, either quote style", () => {
  const source = `
    versionWriter.writeDepVersionFile("@aurodesignsystem/auro-button");
    versionWriter.writeDepVersionFile('@aurodesignsystem/auro-icon');
  `;
  assert.deepEqual(parseVersionScript(source), [
    "@aurodesignsystem/auro-button",
    "@aurodesignsystem/auro-icon",
  ]);
});

test("parseComponentImports keeps component packages and drops tooling", () => {
  const source = `
    import { AuroButton } from "@aurodesignsystem/auro-button/class";
    import "@aurodesignsystem/auro-icon";
    const lazy = await import('@aurodesignsystem/auro-popover/class');
    import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
    import { validate } from "@aurodesignsystem/form-validation";
  `;
  assert.deepEqual(parseComponentImports(source), [
    "@aurodesignsystem/auro-button",
    "@aurodesignsystem/auro-icon",
    "@aurodesignsystem/auro-popover",
  ]);
});

test("a standalone repo records versioned-tag edges with range and pinned version", async () => {
  const deps = await extractBundledDeps(fixture("auro-button"));
  assert.equal(deps?.package, "@aurodesignsystem/auro-button");
  assert.equal(deps?.repo, "AlaskaAirlines/auro-button");
  assert.deepEqual(deps?.bundles, [
    {
      package: "@aurodesignsystem/auro-icon",
      kind: "versioned-tag",
      range: "^9.1.0",
      pinned: "9.1.2",
      files: ["src/auro-button.js"],
    },
  ]);
  assert.deepEqual(deps?.warnings, []);
});

test("a class imported without a versioned tag is an extends edge", async () => {
  const deps = await extractBundledDeps(fixture("auro-hyperlink"));
  const kinds = Object.fromEntries(
    deps!.bundles.map((edge) => [edge.package, edge.kind]),
  );
  assert.deepEqual(kinds, {
    "@aurodesignsystem/auro-button": "extends",
    "@aurodesignsystem/auro-icon": "versioned-tag",
  });
});

test("a monorepo rolls external edges up to the repo and keeps siblings internal", async () => {
  const deps = await extractBundledDeps(fixture("auro-kit"));
  assert.equal(deps?.package, "@aurodesignsystem/auro-kit");
  assert.deepEqual(deps?.internal, {
    "@aurodesignsystem/auro-alpha": ["@aurodesignsystem/auro-beta"],
  });

  const button = deps!.bundles.find(
    (edge) => edge.package === "@aurodesignsystem/auro-button",
  );
  // Versioned in alpha, plain import in beta → the stronger kind wins.
  assert.equal(button?.kind, "versioned-tag");
  // Component package.json has no range, so the repo root's is used.
  assert.equal(button?.range, "^12.4.0");
  assert.equal(button?.pinned, "12.4.1");
  assert.deepEqual(button?.via, [
    "@aurodesignsystem/auro-alpha",
    "@aurodesignsystem/auro-beta",
  ]);
  assert.ok(
    !deps!.bundles.some(
      (edge) => edge.package === "@aurodesignsystem/auro-beta",
    ),
    "sibling workspaces are not external edges",
  );
});

test("version.mjs entries that src/ never imports are reported as drift", async () => {
  const deps = await extractBundledDeps(fixture("auro-kit"));
  assert.equal(deps?.warnings.length, 1);
  assert.match(deps!.warnings[0], /auro-beta.*auro-hyperlink/);
});

test("satisfiesRange handles the caret, tilde, exact, and wildcard forms", () => {
  assert.equal(satisfiesRange("12.4.1", "^12.3.2"), true);
  assert.equal(satisfiesRange("12.3.2", "^12.4.1"), false);
  assert.equal(satisfiesRange("13.0.0", "^12.4.1"), false);
  assert.equal(satisfiesRange("0.3.9", "^0.3.1"), true);
  assert.equal(satisfiesRange("0.4.0", "^0.3.1"), false);
  assert.equal(satisfiesRange("6.1.4", "~6.1.0"), true);
  assert.equal(satisfiesRange("6.2.0", "~6.1.0"), false);
  assert.equal(satisfiesRange("10.1.4", "10.1.4"), true);
  assert.equal(satisfiesRange("10.1.5", "10.1.4"), false);
  assert.equal(satisfiesRange("1.0.0", "*"), true);
  // Forms the helper doesn't model are skipped rather than guessed.
  assert.equal(satisfiesRange("1.0.0", ">=1.0.0 <2.0.0"), undefined);
  assert.equal(satisfiesRange("1.0.0-beta.1", "^1.0.0"), undefined);
});

test("a pinned version outside the declared range is flagged stale", async () => {
  const deps = await extractBundledDeps(fixture("auro-hyperlink"));
  const icon = deps!.bundles.find(
    (edge) => edge.package === "@aurodesignsystem/auro-icon",
  );
  assert.equal(icon?.pinned, "9.0.5");
  assert.equal(icon?.stale, true);
  assert.equal(deps?.warnings.length, 1);
  assert.match(
    deps!.warnings[0],
    /src\/iconVersion\.js pins @aurodesignsystem\/auro-icon@9\.0\.5, outside the declared range \^9\.1\.0/,
  );

  const button = await extractBundledDeps(fixture("auro-button"));
  assert.equal(
    button?.bundles[0].stale,
    undefined,
    "in-range pins are not stale",
  );
});

test("extractFromWorkspace skips tooling and non-Auro repos", async () => {
  const names = (await extractFromWorkspace(WORKSPACE)).map((r) => r.package);
  assert.deepEqual(names, [
    "@aurodesignsystem/auro-button",
    "@aurodesignsystem/auro-hyperlink",
    "@aurodesignsystem/auro-icon",
    "@aurodesignsystem/auro-kit",
  ]);
});

test("buildDependencyMap adds reverse edges and a release order", async () => {
  const map = buildDependencyMap(
    await extractFromWorkspace(WORKSPACE),
    "2026-01-01",
  );
  assert.deepEqual(map.packages["@aurodesignsystem/auro-icon"].bundledBy, [
    "@aurodesignsystem/auro-button",
    "@aurodesignsystem/auro-hyperlink",
    "@aurodesignsystem/auro-kit",
  ]);
  assert.equal(
    map.packages["@aurodesignsystem/auro-icon"].repo,
    "AlaskaAirlines/auro-icon",
  );
  assert.deepEqual(map.releaseOrder, [
    ["@aurodesignsystem/auro-icon"],
    ["@aurodesignsystem/auro-button"],
    ["@aurodesignsystem/auro-hyperlink", "@aurodesignsystem/auro-kit"],
  ]);
});

test("transitiveDependents returns every downstream package in release order", async () => {
  const map = buildDependencyMap(await extractFromWorkspace(WORKSPACE));
  assert.deepEqual(transitiveDependents(map, "@aurodesignsystem/auro-icon"), [
    ["@aurodesignsystem/auro-button"],
    ["@aurodesignsystem/auro-hyperlink", "@aurodesignsystem/auro-kit"],
  ]);
  assert.deepEqual(
    transitiveDependents(map, "@aurodesignsystem/auro-hyperlink"),
    [],
  );
});

test("the Markdown rendering carries the diagram, table, and release order", async () => {
  const map = buildDependencyMap(
    await extractFromWorkspace(WORKSPACE),
    "2026-01-01",
  );
  const mermaid = renderMermaid(map);
  assert.match(mermaid, /^graph LR/);
  assert.match(mermaid, /auro_icon --> auro_button/);
  assert.match(mermaid, /auro_button -.-> auro_hyperlink/);

  const doc = renderDependencyMapMarkdown(map);
  assert.match(doc, /Generated by `auro deps map` on 2026-01-01/);
  assert.match(doc, /```mermaid\ngraph LR/);
  assert.match(
    doc,
    /\| `@aurodesignsystem\/auro-icon` \| — \| `auro-button`, `auro-hyperlink`, `auro-kit` \| `auro-button`, `auro-hyperlink`, `auro-kit` \|/,
  );
  assert.match(doc, /1\. `auro-icon`\n2\. `auro-button`/);
  assert.match(doc, /`auro-icon@9\.0\.5` ⚠ stale \(range \^9\.1\.0\)/);
  assert.match(doc, /## Warnings/);
});
