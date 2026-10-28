/**
 * The inline-tag handling shared by the CEM analyzer plugins
 * ([propertyTagPlugin.mjs](../src/scripts/cem/propertyTagPlugin.mjs)), run
 * through the real analyzer: `{@relevantWhen …}`, `{@requiredWhen …}` and
 * `{@category …}` written inline in a `@slot`, `@csspart` or `@cssprop`
 * description become fields on that entry, and conditions are checked against
 * the element's fields.
 *
 * @see ../src/scripts/cem/conditionTagPlugin.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { create, ts } from "@custom-elements-manifest/analyzer";
import { categoryPlugin } from "../src/scripts/cem/categoryPlugin.mjs";
import { relevantWhenPlugin } from "../src/scripts/cem/relevantWhenPlugin.mjs";
import { requiredWhenPlugin } from "../src/scripts/cem/requiredWhenPlugin.mjs";

/** A component whose slot, CSS part and CSS custom property carry inline tags. */
const SOURCE = `
/**
 * A thing.
 * @customElement auro-thing
 * @slot icon - The icon. {@requiredWhen hasIcon} {@category ui}
 * @csspart link - The inner link. {@relevantWhen type === 'cta'} {@category ui}
 * @cssprop --ds-auro-thing-color - Color of the thing. {@relevantWhen !plain}
 */
export class AuroThing extends HTMLElement {
  constructor() {
    super();
    /** Shows an icon. */
    this.hasIcon = false;
    /** Removes the styling. */
    this.plain = false;
    /** @type {'cta' | 'nav'} */
    this.type = undefined;
  }
}
customElements.define("auro-thing", AuroThing);
`;

type Entry = { name: string; description?: string; [key: string]: unknown };

/** Analyze `source` with the tag plugins; return the element and every plugin warning. */
function analyze(
  t: import("node:test").TestContext,
  source: string,
): {
  slots: Entry[];
  cssParts: Entry[];
  cssProperties: Entry[];
  warnings: string[];
} {
  const warn = t.mock.method(console, "warn", () => {});
  const manifest = create({
    modules: [
      ts.createSourceFile(
        "src/auro-thing.js",
        source,
        ts.ScriptTarget.ES2015,
        true,
      ),
    ],
    plugins: [relevantWhenPlugin(), requiredWhenPlugin(), categoryPlugin()],
    context: { dev: false },
  });
  const [declaration] = manifest.modules[0]?.declarations ?? [];
  return {
    ...(declaration as unknown as {
      slots: Entry[];
      cssParts: Entry[];
      cssProperties: Entry[];
    }),
    warnings: warn.mock.calls.map((call) => String(call.arguments[0])),
  };
}

test("inline tags on a slot, CSS part and CSS custom property become fields and leave the description", (t) => {
  const { slots, cssParts, cssProperties, warnings } = analyze(t, SOURCE);

  assert.deepEqual(slots, [
    {
      name: "icon",
      description: "The icon.",
      requiredWhen: "hasIcon",
      category: "ui",
    },
  ]);
  assert.deepEqual(cssParts, [
    {
      name: "link",
      description: "The inner link.",
      relevantWhen: "type === 'cta'",
      category: "ui",
    },
  ]);
  assert.deepEqual(cssProperties, [
    {
      name: "--ds-auro-thing-color",
      description: "Color of the thing.",
      relevantWhen: "!plain",
    },
  ]);
  assert.deepEqual(warnings, []);
});

test("a condition on a CSS part or CSS custom property is checked against the element's fields", (t) => {
  const source = SOURCE.replace("type === 'cta'", "layout === 'cta'").replace(
    "!plain",
    "type",
  );
  const { warnings } = analyze(t, source);

  assert.equal(warnings.length, 2);
  assert.match(
    warnings[0] ?? "",
    /AuroThing CSS part "link" is @relevantWhen "layout === 'cta'", but AuroThing has no field named "layout"/u,
  );
  assert.match(
    warnings[1] ?? "",
    /AuroThing CSS custom property "--ds-auro-thing-color" is @relevantWhen "type", but/u,
  );
});
