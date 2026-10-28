/**
 * The `docs/api.md` generator ([docs-generator.ts](../src/scripts/docs/docs-generator.ts)):
 * the section headings it writes into every component's API docs follow the
 * content guidelines — sentence case, and "and" instead of "&".
 *
 * @see https://github.com/orgs/AlaskaAirlines/discussions/660 › Word choices, Formatting
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import Docs from "../src/scripts/docs/docs-generator.ts";

/** An element with one documented entry in every section the generator renders. */
const element = {
  kind: "class",
  name: "AuroThing",
  tagName: "auro-thing",
  customElement: true,
  description: "A thing.",
  members: [
    {
      kind: "field",
      name: "disabled",
      attribute: "disabled",
      type: { text: "boolean" },
      description: "Turns the thing off.",
    },
    { kind: "method", name: "reset", description: "Resets the thing." },
  ],
  events: [{ name: "change", description: "Fires when the thing changes." }],
  slots: [{ name: "", description: "The thing's content." }],
  cssParts: [{ name: "base", description: "The wrapper element." }],
  cssProperties: [
    { name: "--ds-auro-thing-color", description: "Color of the thing." },
  ],
};

/** The `###` section headings in the rendered markdown, in order. */
function headings(markdown: string): string[] {
  return [...markdown.matchAll(/^### (.+)$/gmu)].map((match) => match[1] ?? "");
}

test("renderElement writes sentence-case section headings with no ampersand", () => {
  // biome-ignore lint/suspicious/noExplicitAny: a minimal CEM declaration fixture
  const markdown = Docs.renderElement(element as any);
  assert.deepEqual(headings(markdown), [
    "Properties and attributes",
    "Methods",
    "Events",
    "Slots",
    "CSS shadow parts",
    "CSS custom properties",
  ]);
});
