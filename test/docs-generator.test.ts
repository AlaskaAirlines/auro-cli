/**
 * The `docs/api.md` generator ([docs-generator.ts](../src/scripts/docs/docs-generator.ts)):
 * the section headings it writes into every component's API docs follow the
 * content guidelines — sentence case, and "and" instead of "&".
 *
 * @see https://github.com/orgs/AlaskaAirlines/discussions/660 › Word choices, Formatting
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { create, ts } from "@custom-elements-manifest/analyzer";
import { categoryPlugin } from "../src/scripts/cem/categoryPlugin.mjs";
import { numericBoundsPlugin } from "../src/scripts/cem/numericBoundsPlugin.mjs";
import { relevantWhenPlugin } from "../src/scripts/cem/relevantWhenPlugin.mjs";
import { requiredWhenPlugin } from "../src/scripts/cem/requiredWhenPlugin.mjs";
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

/** The cells of the table under `### heading`, one object per row keyed by column header. */
function table(markdown: string, heading: string): Record<string, string>[] {
  const lines =
    markdown.split(`### ${heading}\n\n`)[1]?.split("\n\n")[0]?.split("\n") ??
    [];
  const cells = (line: string) =>
    line
      .replace(/^\|/u, "")
      .replace(/\|$/u, "")
      .split(/(?<!\\)\|/u)
      .map((cell) => cell.trim());
  const [header = "", , ...rows] = lines;
  const headers = cells(header);
  return rows.map((row) => {
    const values = cells(row);
    assert.equal(
      values.length,
      headers.length,
      `row has the wrong number of cells: ${row}`,
    );
    return Object.fromEntries(
      headers.map((name, index) => [name, values[index] ?? ""]),
    );
  });
}

/** The column headers of the table under `### heading`. */
function columns(markdown: string, heading: string): string[] {
  return Object.keys(table(markdown, heading)[0] ?? {});
}

/** Renders a CEM declaration fixture. */
const render = (declaration: unknown): string =>
  // biome-ignore lint/suspicious/noExplicitAny: a minimal CEM declaration fixture
  Docs.renderElement(declaration as any);

test("an element with none of the tag fields renders exactly as before", () => {
  assert.equal(
    render(element),
    `# auro-thing

A thing.

### Properties and attributes

| Properties | Attributes | Modifiers | Type    | Default | Description          |
| ---------- | ---------- | --------- | ------- | ------- | -------------------- |
| disabled   | disabled   |           | boolean |         | Turns the thing off. |

### Methods

| Name  | Parameters | Return | Description       |
| ----- | ---------- | ------ | ----------------- |
| reset | None       |        | Resets the thing. |

### Events

| Name   | Description                   |
| ------ | ----------------------------- |
| change | Fires when the thing changes. |

### Slots

| Name      | Description          |
| --------- | -------------------- |
| (default) | The thing's content. |

### CSS shadow parts

| Name | Description          |
| ---- | -------------------- |
| base | The wrapper element. |

### CSS custom properties

| Name                  | Description         |
| --------------------- | ------------------- |
| --ds-auro-thing-color | Color of the thing. |`,
  );
});

test("block tags on a property and inline tags on a slot, CSS part and CSS custom property render the same cells", (t) => {
  t.mock.method(console, "warn", () => {});
  const tags = (inline: boolean) =>
    [
      "category ui",
      "requiredWhen hasIcon",
      "relevantWhen type === 'cta'",
      "minimum 0",
      "maximum 10",
    ]
      .map((tag) => (inline ? `{@${tag}}` : `\n     * @${tag}`))
      .join(inline ? " " : "");
  const source = `
/**
 * A thing.
 * @customElement auro-thing
 * @slot icon - The icon. ${tags(true)}
 * @csspart link - The inner link. ${tags(true)}
 * @cssprop --ds-auro-thing-color - Color of the thing. ${tags(true)}
 */
export class AuroThing extends HTMLElement {
  constructor() {
    super();
    /** Shows an icon. */
    this.hasIcon = false;
    /** @type {'cta' | 'nav'} */
    this.type = undefined;
    /**
     * How many things.${tags(false)}
     */
    this.count = 1;
  }
}
customElements.define("auro-thing", AuroThing);
`;
  const manifest = create({
    modules: [
      ts.createSourceFile(
        "src/auro-thing.js",
        source,
        ts.ScriptTarget.ES2015,
        true,
      ),
    ],
    plugins: [
      numericBoundsPlugin(),
      requiredWhenPlugin(),
      relevantWhenPlugin(),
      categoryPlugin(),
    ],
    context: { dev: false },
  });
  const markdown = render(manifest.modules[0]?.declarations?.[0]);
  const expected = {
    Category: "ui",
    Required: "`hasIcon`",
    "Relevant when": "`type === 'cta'`",
    Range: "0–10",
  };

  const [count] = table(markdown, "Properties and attributes").filter(
    (row) => row.Properties === "count",
  );
  assert.deepEqual(
    {
      Category: count?.Category,
      Required: count?.Required,
      "Relevant when": count?.["Relevant when"],
      Range: count?.Range,
    },
    expected,
  );
  for (const heading of [
    "Slots",
    "CSS shadow parts",
    "CSS custom properties",
  ]) {
    const [row] = table(markdown, heading);
    assert.deepEqual(
      row,
      {
        Name: row?.Name ?? "",
        ...expected,
        Description: row?.Description ?? "",
      },
      heading,
    );
    assert.doesNotMatch(row?.Description ?? "", /@/u, heading);
  }
});

test("requiredWhen always shows as Yes and a condition shows as inline code", () => {
  const markdown = render({
    ...element,
    slots: [
      { name: "label", description: "The label.", requiredWhen: "always" },
      { name: "icon", description: "The icon.", requiredWhen: "isDropdown" },
      { name: "help", description: "Help text." },
    ],
  });
  assert.deepEqual(
    table(markdown, "Slots").map((row) => row.Required),
    ["Yes", "`isDropdown`", ""],
  );
});

test("bounds show as a range, a minimum or a maximum, and a bound of 0 is kept", () => {
  const markdown = render({
    ...element,
    cssProperties: [
      { name: "--a", description: "A.", minimum: 1, maximum: 10 },
      { name: "--b", description: "B.", minimum: 0 },
      { name: "--c", description: "C.", maximum: 0 },
      { name: "--d", description: "D.", minimum: 0, maximum: 0 },
      { name: "--e", description: "E." },
    ],
  });
  assert.deepEqual(
    table(markdown, "CSS custom properties").map((row) => row.Range),
    ["1–10", "≥ 0", "≤ 0", "0–0", ""],
  );
});

test("a | in a category or a condition value is escaped and keeps the table intact", () => {
  const markdown = render({
    ...element,
    cssParts: [
      {
        name: "base",
        description: "The wrapper element.",
        category: "ui|a11y",
        relevantWhen: "type === 'a|b'",
      },
    ],
  });
  assert.deepEqual(table(markdown, "CSS shadow parts"), [
    {
      Name: "base",
      Category: "ui\\|a11y",
      "Relevant when": "`type === 'a\\|b'`",
      Description: "The wrapper element.",
    },
  ]);
});

test("a field on both a property and its attribute shows once, and an attribute-only row shows its own", () => {
  const markdown = render({
    ...element,
    members: [
      {
        kind: "field",
        name: "count",
        attribute: "count",
        type: { text: "number" },
        description: "How many things.",
        minimum: 1,
        relevantWhen: "isDropdown",
      },
    ],
    attributes: [
      {
        name: "count",
        fieldName: "count",
        type: { text: "number" },
        description: "How many things.",
        minimum: 1,
        relevantWhen: "isDropdown",
      },
      {
        name: "legacy-size",
        type: { text: "number" },
        description: "The old size.",
        maximum: 5,
      },
    ],
  });
  assert.deepEqual(table(markdown, "Properties and attributes"), [
    {
      Properties: "count",
      Attributes: "count",
      Modifiers: "",
      Type: "number",
      Default: "",
      "Relevant when": "`isDropdown`",
      Range: "≥ 1",
      Description: "How many things.",
    },
    {
      Properties: "",
      Attributes: "legacy-size",
      Modifiers: "",
      Type: "number",
      Default: "",
      "Relevant when": "",
      Range: "≤ 5",
      Description: "The old size.",
    },
  ]);
});

test("rows are grouped by category in first-seen order, with uncategorized rows last", () => {
  const markdown = render({
    ...element,
    slots: [
      { name: "a", description: "A." },
      { name: "b", description: "B.", category: "ui" },
      { name: "c", description: "C.", category: "a11y" },
      { name: "d", description: "D.", category: "ui" },
      { name: "e", description: "E." },
    ],
  });
  assert.deepEqual(
    table(markdown, "Slots").map((row) => [row.Name, row.Category]),
    [
      ["b", "ui"],
      ["d", "ui"],
      ["c", "a11y"],
      ["a", ""],
      ["e", ""],
    ],
  );
});

test("only the columns some row has are added, and only to that table", () => {
  const markdown = render({
    ...element,
    cssProperties: [
      {
        name: "--ds-auro-thing-color",
        description: "Color of the thing.",
        relevantWhen: "!plain",
      },
    ],
  });
  assert.deepEqual(columns(markdown, "CSS custom properties"), [
    "Name",
    "Relevant when",
    "Description",
  ]);
  assert.deepEqual(columns(markdown, "CSS shadow parts"), [
    "Name",
    "Description",
  ]);
  assert.deepEqual(columns(markdown, "Properties and attributes"), [
    "Properties",
    "Attributes",
    "Modifiers",
    "Type",
    "Default",
    "Description",
  ]);
});
