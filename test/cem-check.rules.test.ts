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
