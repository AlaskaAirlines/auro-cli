/**
 * The static contract rules ([rules.ts](../src/init/cem-check/rules.ts)),
 * exercised directly through `runContractRules` — fast, pure, no `tsc`. Focused on
 * the `type-not-typescript` / `type-imprecise` rules that flag a `type.text` which
 * is not valid TypeScript (a lowercase primitive or a bare generic) or is valid but
 * uninformative, with a precise per-attribute locator.
 *
 * @see ../src/init/cem-check/rules.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CemFinding,
  runContractRules,
} from "../src/init/cem-check/rules.ts";
import type { Manifest } from "../src/utils/cem.ts";
import { elementManifest } from "./support.ts";

/** Build a one-element manifest with the given attributes and run the rules. */
function findingsFor(attributes: unknown[]): CemFinding[] {
  const manifest = elementManifest("auro-button", { attributes }) as Manifest;
  return runContractRules(manifest);
}

/** Build a one-element manifest with arbitrary declaration extras and run the rules. */
function findingsForDecl(extra: Record<string, unknown>): CemFinding[] {
  const manifest = elementManifest("auro-button", extra) as Manifest;
  return runContractRules(manifest);
}

test("a lowercase `array` type.text is a type-not-typescript error with a precise locator", () => {
  const findings = findingsFor([{ name: "items", type: { text: "array" } }]);
  const finding = findings.find((f) => f.rule === "type-not-typescript");
  assert.ok(finding, "expected a type-not-typescript finding");
  assert.equal(finding.severity, "error");
  assert.equal(finding.element, "auro-button");
  assert.equal(finding.path, "attributes[0].type.text");
});

test("a lowercase `function` type.text is a type-not-typescript error", () => {
  const findings = findingsFor([
    { name: "onChange", type: { text: "function" } },
  ]);
  assert.ok(
    findings.some(
      (f) => f.rule === "type-not-typescript" && f.severity === "error",
    ),
  );
});

test("a bare generic `Array` (no type argument) is a type-not-typescript error", () => {
  const findings = findingsFor([{ name: "items", type: { text: "Array" } }]);
  const finding = findings.find((f) => f.rule === "type-not-typescript");
  assert.ok(finding, "expected a type-not-typescript finding");
  assert.match(finding.message, /Array<T>/);
});

test("`object` is valid TS but imprecise — a warn, never an error", () => {
  const findings = findingsFor([{ name: "config", type: { text: "object" } }]);
  assert.ok(
    findings.some((f) => f.rule === "type-imprecise" && f.severity === "warn"),
  );
  assert.ok(
    !findings.some((f) => f.rule === "type-not-typescript"),
    "`object` must not be a type-not-typescript error",
  );
});

test("real lowercase TS types (`string`, `boolean`) are not flagged", () => {
  const findings = findingsFor([
    { name: "label", type: { text: "string" } },
    { name: "disabled", type: { text: "boolean" } },
  ]);
  assert.ok(
    !findings.some(
      (f) => f.rule === "type-not-typescript" || f.rule === "type-imprecise",
    ),
    "valid lowercase primitives should produce no type finding",
  );
});

test("an embedded bare `Array` in a union is a type-not-typescript error with a precise locator", () => {
  const findings = findingsFor([
    { name: "items", type: { text: "Array | null" } },
  ]);
  const finding = findings.find((f) => f.rule === "type-not-typescript");
  assert.ok(finding, "expected a type-not-typescript finding");
  assert.equal(finding.severity, "error");
  assert.equal(finding.path, "attributes[0].type.text");
  assert.match(finding.message, /Array<T>/);
});

test("a lowercase `array` embedded in a union is flagged (not only whole-string)", () => {
  const findings = findingsFor([
    { name: "value", type: { text: "string | array" } },
  ]);
  assert.ok(
    findings.some(
      (f) => f.rule === "type-not-typescript" && f.severity === "error",
    ),
  );
});

test("a parameterised generic (`Array<string>`, `Record<string, number>`) is not flagged", () => {
  const findings = findingsFor([
    { name: "items", type: { text: "Array<string>" } },
    { name: "map", type: { text: "Record<string, number>" } },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "type-not-typescript"),
    "a generic with a type argument is valid TS",
  );
});

test("string-literal members that contain `array` are not flagged (literals are blanked)", () => {
  const findings = findingsFor([
    { name: "layout", type: { text: '"array" | "list"' } },
  ]);
  assert.ok(
    !findings.some(
      (f) => f.rule === "type-not-typescript" || f.rule === "type-imprecise",
    ),
    "a quoted `array` is a valid string-literal type, not the `array` keyword",
  );
});

test("a string-literal member containing a bracket char is not a type-parseable error (literals are ignored)", () => {
  // `">"` and `"none"` are a valid string-literal union; the `>` lives inside a
  // quoted literal, not as an unbalanced delimiter. `hasBalancedDelimiters` must
  // blank literals before its bracket scan or this trips a false `type-parseable`
  // error — an error-severity false positive that would fail the CEM gate on a
  // legitimate manifest.
  const findings = findingsFor([
    { name: "comparison", type: { text: '">" | "none"' } },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "type-parseable"),
    "a bracket inside a string literal must not be read as an unbalanced delimiter",
  );
});

test("a genuinely unbalanced delimiter outside any literal is still a type-parseable error", () => {
  // The blanking must not mask a real defect: `Object<key` (auro-formkit's actual
  // truncated `type.text`) has no closing `>` and no string literal to hide in.
  const findings = findingsFor([
    { name: "config", type: { text: "Object<key" } },
  ]);
  assert.ok(
    findings.some((f) => f.rule === "type-parseable" && f.severity === "error"),
    "an unbalanced delimiter in bare type text must still be flagged",
  );
});

test("a property key named `array` is not flagged (only a type position is invalid)", () => {
  const findings = findingsFor([
    { name: "config", type: { text: "{ array: string }" } },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "type-not-typescript"),
    "`array` before a `:` is a property key, which is valid",
  );
});

// ---------------------------------------------------------------------------
// deprecated-prose-unflagged / -unsupported / -no-detail — prose-only deprecation
// ---------------------------------------------------------------------------

test("an attribute described `DEPRECATED …` with no deprecated field warns (deprecated-prose-unflagged)", () => {
  const findings = findingsFor([
    {
      name: "onDark",
      type: { text: "boolean" },
      description: "DEPRECATED - use `appearance` instead.",
    },
  ]);
  const finding = findings.find((f) => f.rule === "deprecated-prose-unflagged");
  assert.ok(finding, "expected a deprecated-prose-unflagged finding");
  assert.equal(finding.severity, "warn");
  assert.equal(finding.element, "auro-button");
  assert.equal(finding.path, "attributes[0]");
});

test("a `(Deprecated)`-prefixed member with no deprecated field warns", () => {
  const findings = findingsForDecl({
    members: [
      {
        kind: "method",
        name: "legacyToggle",
        description: "(Deprecated) Notifies listeners of a toggle.",
      },
    ],
  });
  assert.ok(
    findings.some(
      (f) => f.rule === "deprecated-prose-unflagged" && f.path === "members[0]",
    ),
    "a bracketed `(Deprecated)` marker should be flagged on a member",
  );
});

test("adding the `deprecated` field clears the member finding (analyzer emitted it)", () => {
  const findings = findingsFor([
    {
      name: "onDark",
      type: { text: "boolean" },
      description: "DEPRECATED - use `appearance` instead.",
      deprecated: "use `appearance` instead",
    },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "deprecated-prose-unflagged"),
    "a structural `deprecated` field should clear the prose finding",
  );
  assert.ok(
    !findings.some((f) => f.rule === "deprecated-no-detail"),
    "a string `deprecated` carries a message, so no-detail must not fire",
  );
});

test("a correctly-flagged member (bare `deprecated: true`) produces no prose finding, only no-detail", () => {
  const findings = findingsFor([
    { name: "onDark", type: { text: "boolean" }, deprecated: true },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "deprecated-prose-unflagged"),
    "a flagged member must not be reported as prose-only",
  );
  assert.ok(
    findings.some(
      (f) => f.rule === "deprecated-no-detail" && f.severity === "warn",
    ),
    "a bare `deprecated: true` should draw the low-priority no-detail warning",
  );
});

test("a deprecated-in-prose event is reported under the distinct suppressible rule", () => {
  const findings = findingsForDecl({
    events: [
      {
        name: "auro-legacy-change",
        description: "@deprecated use the `input` event instead.",
      },
    ],
  });
  const finding = findings.find(
    (f) => f.rule === "deprecated-prose-unsupported",
  );
  assert.ok(finding, "expected a deprecated-prose-unsupported finding");
  assert.equal(finding.severity, "warn");
  assert.equal(finding.path, "events[0]");
  assert.match(finding.message, /event/);
  assert.ok(
    !findings.some((f) => f.rule === "deprecated-prose-unflagged"),
    "events must not use the member rule id (not author-fixable)",
  );
});

test("a deprecated-in-prose slot is reported under the distinct suppressible rule", () => {
  const findings = findingsForDecl({
    slots: [
      { name: "legacy", description: "**deprecated** use the default slot." },
    ],
  });
  const finding = findings.find(
    (f) => f.rule === "deprecated-prose-unsupported",
  );
  assert.ok(finding, "expected a deprecated-prose-unsupported finding");
  assert.equal(finding.path, "slots[0]");
  assert.match(finding.message, /slot/);
});

test("an incidental `deprecated` mention is not flagged (marker-targeted)", () => {
  const findings = findingsFor([
    {
      name: "appearance",
      type: { text: '"primary" | "secondary"' },
      description:
        "Sets the appearance; replaces the deprecated `onDark` attribute.",
    },
  ]);
  assert.ok(
    !findings.some(
      (f) =>
        f.rule === "deprecated-prose-unflagged" ||
        f.rule === "deprecated-prose-unsupported",
    ),
    "a mid-sentence mention of `deprecated` must not be flagged",
  );
});

// ---------------------------------------------------------------------------
// attribute-name-not-lowercase — a camelCase attribute name never binds in HTML
// ---------------------------------------------------------------------------

test("a camelCase attribute name warns with the lowercased suggestion", () => {
  const findings = findingsFor([
    {
      name: "buttonHref",
      type: { text: "string" },
      description: "The href.",
    },
  ]);
  const finding = findings.find(
    (f) => f.rule === "attribute-name-not-lowercase",
  );
  assert.ok(finding, "expected an attribute-name-not-lowercase finding");
  assert.equal(finding.severity, "warn");
  assert.equal(finding.path, "attributes[0].name");
  assert.match(finding.message, /buttonhref/);
});

test("an all-lowercase attribute name is not flagged", () => {
  const findings = findingsFor([
    { name: "buttonhref", type: { text: "string" }, description: "The href." },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "attribute-name-not-lowercase"),
    "a lowercase attribute name must not be flagged",
  );
});

// ---------------------------------------------------------------------------
// union-widened-by-string — string literals unioned with a bare `string`
// ---------------------------------------------------------------------------

test("a union of literals with a bare `string` warns (union-widened-by-string)", () => {
  const findings = findingsFor([
    {
      name: "theme",
      type: { text: '"default" | "inverse" | string' },
      description: "The theme.",
    },
  ]);
  const finding = findings.find((f) => f.rule === "union-widened-by-string");
  assert.ok(finding, "expected a union-widened-by-string finding");
  assert.equal(finding.severity, "warn");
  assert.equal(finding.path, "attributes[0].type.text");
});

test("a literal ending in an escaped backslash still splits at the top-level `|`", () => {
  // The literal `"a\\"` closes on its final quote (the `\\` is one escaped
  // backslash), so the `| string` after it is a real top-level union member. A
  // naive single-char escape look-behind would treat that quote as escaped, keep
  // the string open, and miss the widening. type.text = `"a\\" | string`.
  const findings = findingsFor([
    {
      name: "token",
      type: { text: '"a\\\\" | string' },
      description: "The token.",
    },
  ]);
  assert.ok(
    findings.some((f) => f.rule === "union-widened-by-string"),
    "an escaped-backslash literal unioned with bare `string` must still be flagged",
  );
});

test("a clean string-literal union (no bare `string`) is not flagged", () => {
  const findings = findingsFor([
    {
      name: "variant",
      type: { text: '"primary" | "secondary"' },
      description: "The variant.",
    },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "union-widened-by-string"),
    "a union without a bare `string` member must not be flagged",
  );
});

test("a `string` inside a nested generic does not trip the widened-union rule", () => {
  const findings = findingsFor([
    {
      name: "items",
      type: { text: '"all" | Array<string>' },
      description: "The items.",
    },
  ]);
  assert.ok(
    !findings.some((f) => f.rule === "union-widened-by-string"),
    "a `string` type argument is not a top-level bare `string` union member",
  );
});

// ---------------------------------------------------------------------------
// enumerated-union — broadened to capital `String` and `any`
// ---------------------------------------------------------------------------

test("a curated attr typed capital `String` is an enumerated-union warn", () => {
  const findings = findingsFor([
    { name: "variant", type: { text: "String" }, description: "The variant." },
  ]);
  const finding = findings.find((f) => f.rule === "enumerated-union");
  assert.ok(finding, "capital `String` on `variant` should warn");
  assert.equal(finding.severity, "warn");
  assert.equal(finding.path, "attributes[0].type.text");
});

test("a curated attr typed `any` is an enumerated-union warn", () => {
  const findings = findingsFor([
    { name: "size", type: { text: "any" }, description: "The size." },
  ]);
  assert.ok(
    findings.some((f) => f.rule === "enumerated-union"),
    "`any` on `size` should warn",
  );
});

// ---------------------------------------------------------------------------
// missing-description — no description and no summary anywhere to drive a hover
// ---------------------------------------------------------------------------

test("an attribute with no description or summary warns (missing-description)", () => {
  const findings = findingsFor([{ name: "label", type: { text: "string" } }]);
  const finding = findings.find(
    (f) => f.rule === "missing-description" && f.path === "attributes[0]",
  );
  assert.ok(finding, "expected a missing-description finding on the attribute");
  assert.equal(finding.severity, "warn");
});

test("a `summary` alone clears the missing-description finding", () => {
  const findings = findingsFor([
    { name: "label", type: { text: "string" }, summary: "The label text." },
  ]);
  assert.ok(
    !findings.some(
      (f) => f.rule === "missing-description" && f.path === "attributes[0]",
    ),
    "a summary drives hover docs, so no missing-description should fire",
  );
});

test("an event with no description or summary warns (missing-description)", () => {
  const findings = findingsForDecl({ events: [{ name: "change" }] });
  assert.ok(
    findings.some(
      (f) => f.rule === "missing-description" && f.path === "events[0]",
    ),
    "an undescribed event should warn",
  );
});

test("a component with an empty description warns element-level (no path)", () => {
  const findings = findingsForDecl({ description: "" });
  const finding = findings.find(
    (f) => f.rule === "missing-description" && f.element === "auro-button",
  );
  assert.ok(finding, "expected an element-level missing-description finding");
  assert.equal(finding.path, undefined);
});
