import assert from "node:assert/strict";
import { test } from "node:test";
import type { CemDeclaration } from "../src/utils/cem.ts";
import {
  deprecatedTag,
  formatDeclaration,
  kebabToCamel,
  renderList,
  toPackageName,
} from "../src/utils/formatComponent.ts";

test("toPackageName normalizes bare, prefixed, and scoped names", () => {
  assert.equal(
    toPackageName("button"),
    "@aurodesignsystem/auro-button",
    "bare name gets the scope and auro- prefix",
  );
  assert.equal(
    toPackageName("auro-button"),
    "@aurodesignsystem/auro-button",
    "an existing auro- prefix is not doubled",
  );
  assert.equal(
    toPackageName("@aurodesignsystem/auro-button"),
    "@aurodesignsystem/auro-button",
    "an explicit scope is preserved verbatim",
  );
  assert.equal(
    toPackageName("@myscope/thing"),
    "@myscope/thing",
    "a non-auro explicit scope is respected",
  );
});

test("toPackageName tolerates surrounding whitespace and casing", () => {
  assert.equal(toPackageName("  Button  "), "@aurodesignsystem/auro-button");
  assert.equal(toPackageName("AURO-Button"), "@aurodesignsystem/auro-button");
});

test("kebabToCamel converts kebab attribute names to camelCase fields", () => {
  assert.equal(kebabToCamel("no-validate"), "noValidate");
  assert.equal(kebabToCamel("a-b-c"), "aBC");
  assert.equal(kebabToCamel("plain"), "plain");
});

test("deprecatedTag renders nothing, a bare marker, or a reason", () => {
  assert.equal(deprecatedTag(undefined), "");
  assert.equal(deprecatedTag(false), "");
  assert.equal(deprecatedTag(true), " [deprecated]");
  assert.equal(deprecatedTag("use auro-x"), " [deprecated: use auro-x]");
});

test("renderList shows (none) for an empty list", () => {
  assert.equal(renderList([]), "  (none)");
});

test("renderList aligns the label column to the widest entry", () => {
  const out = renderList([
    ["a", "short"],
    ["longer", "desc"],
  ]);
  const lines = out.split("\n");
  // Both descriptions start at the same column (padded to "longer" width).
  assert.equal(lines[0], "  a       short");
  assert.equal(lines[1], "  longer  desc");
});

test("renderList defensively coerces a missing name/description", () => {
  const out = renderList([
    [undefined as unknown as string, "has desc"],
    ["name", undefined as unknown as string],
  ]);
  // Neither a missing label nor a missing description throws; the row renders.
  assert.match(out, /has desc/);
  assert.match(out, /name/);
});

test("formatDeclaration renders every section with counts and install snippet", () => {
  const decl: CemDeclaration = {
    kind: "class",
    name: "AuroButton",
    tagName: "auro-button",
    customElement: true,
    summary: "A button.",
    superclass: { name: "LitElement" },
    attributes: [
      { name: "disabled", type: { text: "boolean" }, default: "false" },
    ],
    members: [
      { kind: "method", name: "focus", return: { type: { text: "void" } } },
      { kind: "field", name: "value", type: { text: "string" } },
    ],
    slots: [{ name: "", description: "Default slot" }],
    events: [{ name: "click", type: { text: "MouseEvent" } }],
    cssParts: [{ name: "button", description: "The button" }],
    cssProperties: [{ name: "--auro-button-color", description: "Text color" }],
  };

  const out = formatDeclaration("@aurodesignsystem/auro-button", decl);

  assert.match(out, /auro-button {2}\(@aurodesignsystem\/auro-button\)/);
  assert.match(out, /A button\./);
  assert.match(out, /Class: AuroButton extends LitElement/);
  assert.match(out, /npm i @aurodesignsystem\/auro-button/);
  assert.match(out, /import "@aurodesignsystem\/auro-button";/);
  assert.match(out, /Attributes \(1\):/);
  assert.match(out, /disabled.*\{boolean\} = false/);
  assert.match(out, /Properties & Methods \(2\):/);
  assert.match(out, /focus\(\).*\{void\}/, "methods render with ()");
  assert.match(out, /value.*\{string\}/);
  assert.match(out, /Slots \(1\):/);
  assert.match(out, /\(default\)/, "an empty slot name renders as (default)");
  assert.match(out, /Events \(1\):/);
  assert.match(out, /click.*\{MouseEvent\}/);
  assert.match(out, /CSS Parts \(1\):/);
  assert.match(out, /CSS Custom Properties \(1\):/);
});

test("formatDeclaration points install/import at an overridden package and subpath", () => {
  const decl: CemDeclaration = {
    kind: "class",
    name: "AuroInput",
    tagName: "auro-input",
    customElement: true,
  };

  // A legacy form component served from the auro-formkit monorepo: install the
  // monorepo package, import the per-component subpath.
  const out = formatDeclaration("@aurodesignsystem/auro-formkit", decl, {
    installPkg: "@aurodesignsystem/auro-formkit",
    importSpecifier: "@aurodesignsystem/auro-formkit/auro-input",
  });

  assert.match(out, /auro-input {2}\(@aurodesignsystem\/auro-formkit\)/);
  assert.match(out, /npm i @aurodesignsystem\/auro-formkit\n/);
  assert.match(out, /import "@aurodesignsystem\/auro-formkit\/auro-input";/);
});

test("formatDeclaration omits the CSS sections when empty", () => {
  const decl: CemDeclaration = {
    name: "AuroIcon",
    tagName: "auro-icon",
    customElement: true,
  };
  const out = formatDeclaration("@aurodesignsystem/auro-icon", decl);
  assert.doesNotMatch(out, /CSS Parts/);
  assert.doesNotMatch(out, /CSS Custom Properties/);
  // Empty sections still render their (none) placeholder.
  assert.match(out, /Attributes \(0\):/);
  assert.match(out, /\(none\)/);
});

test("formatDeclaration hides members already covered by an attribute", () => {
  const decl: CemDeclaration = {
    name: "AuroButton",
    tagName: "auro-button",
    customElement: true,
    attributes: [
      { name: "disabled" }, // covered by bare name
      { name: "no-validate" }, // covered by camelCase form
      { name: "shape", fieldName: "shapeType" }, // covered by fieldName
    ],
    members: [
      { kind: "field", name: "disabled" },
      { kind: "field", name: "noValidate" },
      { kind: "field", name: "shapeType" },
      { kind: "method", name: "reset", return: { type: { text: "void" } } },
      { kind: "field", name: "value", type: { text: "string" } },
      { kind: "field", name: "_secret", privacy: "private" },
      { kind: "field", name: "VERSION", static: true },
      { kind: "field", name: "" }, // malformed, no name
    ],
  };

  const out = formatDeclaration("@aurodesignsystem/auro-button", decl);

  // Only reset() and value survive the attribute/privacy/static/name filters.
  assert.match(out, /Properties & Methods \(2\):/);
  assert.match(out, /reset\(\)/);
  assert.match(out, /value/);
  assert.doesNotMatch(
    out,
    /noValidate/,
    "the camelCase field backing no-validate is not listed again",
  );
  assert.doesNotMatch(out, /shapeType/);
  assert.doesNotMatch(out, /_secret/);
  assert.doesNotMatch(out, /VERSION/);
});
