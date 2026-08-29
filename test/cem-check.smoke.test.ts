/**
 * `runGenerationSmoke` — the authoritative half of `auro cem-check`. Proves the
 * real builders + `tsc` accept a clean component set, and that a CEM which passes
 * the static rules but emits a broken `.d.ts` (a balanced-but-unresolvable
 * `type.text`) is still caught by the generation smoke.
 *
 * @see ../src/init/cem-check/smoke.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { runGenerationSmoke } from "../src/init/cem-check/smoke.ts";
import type { ResolvedComponent } from "../src/init/resolver.ts";
import { COMPONENTS } from "./support.editors.ts";

test("a clean component set generates types that type-check (no findings)", () => {
  const findings = runGenerationSmoke(COMPONENTS);
  assert.deepEqual(
    findings,
    [],
    `expected a clean generation smoke, got:\n${findings.map((f) => f.message).join("\n")}`,
  );
});

test("an empty component set is a no-op (nothing to generate)", () => {
  assert.deepEqual(runGenerationSmoke([]), []);
});

test("a balanced-but-unresolvable type.text fails the generation smoke", () => {
  // `Bogus` has balanced delimiters (the static `type-parseable` rule passes) and
  // a string `name` (the `name-required` rule passes) — but it is not a real type,
  // so the inlined prop type makes the emitted `.d.ts` fail to compile. Only the
  // end-to-end smoke catches this class of break.
  const BROKEN: ResolvedComponent = {
    pkg: "@aurodesignsystem/auro-broken",
    version: "1.0.0",
    tagName: "auro-broken",
    importPath: "@aurodesignsystem/auro-broken",
    isMonorepo: false,
    declaration: {
      kind: "class",
      name: "AuroBroken",
      tagName: "auro-broken",
      customElement: true,
      description: "Declares an attribute with an unresolvable type.",
      superclass: { name: "LitElement" },
      attributes: [
        {
          name: "mode",
          description: "A mode typed against a non-existent type.",
          type: { text: "Bogus" },
        },
      ],
      slots: [],
      events: [],
    },
  };

  const findings = runGenerationSmoke([BROKEN]);
  assert.ok(
    findings.some(
      (f) => f.severity === "error" && f.rule === "generation-smoke",
    ),
    `expected a generation-smoke error, got:\n${JSON.stringify(findings, null, 2)}`,
  );
});
