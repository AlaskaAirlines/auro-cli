import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAuroContext,
  renderComponentRows,
  STATIC_COMPONENT_TABLE,
  STATIC_COMPONENTS,
} from "../src/static/auroContext.ts";

test("renderComponentRows renders one Markdown row per component", () => {
  const rows = renderComponentRows([
    {
      tag: "auro-button",
      pkg: "@aurodesignsystem/auro-button",
      description: "A button",
    },
    {
      tag: "auro-icon",
      pkg: "@aurodesignsystem/auro-icon",
      description: "An icon",
    },
  ]);
  const lines = rows.split("\n");
  assert.equal(lines.length, 2);
  assert.equal(
    lines[0],
    "| `<auro-button>` | `@aurodesignsystem/auro-button` | A button |",
  );
});

test("renderComponentRows escapes pipes in descriptions", () => {
  const rows = renderComponentRows([
    {
      tag: "auro-x",
      pkg: "@aurodesignsystem/auro-x",
      description: "a | b | c",
    },
  ]);
  // Raw pipes would break the Markdown table, so they must be backslash-escaped.
  assert.match(rows, /a \\\| b \\\| c/);
});

test("buildAuroContext embeds the table between the header and footer", () => {
  const doc = buildAuroContext("| row |");
  assert.match(doc, /# Auro Design System/, "includes the header");
  assert.match(
    doc,
    /\| Element Tag \| Package \| Description \|/,
    "table header",
  );
  assert.match(doc, /\| row \|/, "the supplied table body");
  assert.match(doc, /## Common Patterns/, "includes the footer");
  // Header must come before the table, table before the footer.
  assert.ok(doc.indexOf("# Auro Design System") < doc.indexOf("| row |"));
  assert.ok(doc.indexOf("| row |") < doc.indexOf("## Common Patterns"));
});

test("STATIC_COMPONENT_TABLE is non-empty and covers the curated set", () => {
  assert.ok(STATIC_COMPONENTS.length > 0);
  assert.equal(
    STATIC_COMPONENT_TABLE.split("\n").length,
    STATIC_COMPONENTS.length,
    "one row per curated component",
  );
  assert.match(STATIC_COMPONENT_TABLE, /auro-button/);
});
