import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  generateAgentsMd,
  generateClaudeMd,
  groundingFiles,
} from "../src/init/generator.ts";
import type { ResolvedComponent } from "../src/init/resolver.ts";

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/init/${name}`, import.meta.url)),
    "utf-8",
  );

/**
 * The two components the golden AGENTS.md fixture is assembled from: a standalone
 * `auro-button` prefixed to `myapp-button`, and a `auro-formkit` monorepo
 * component (`auro-input`) imported via its subpath export and overridden to
 * `legacy-input`. Rebuilding them here and asserting byte-equality is the step-4
 * golden test the format-freeze (step 1) deferred.
 */
const BUTTON: ResolvedComponent = {
  pkg: "@aurodesignsystem/auro-button",
  version: "12.3.0",
  tagName: "auro-button",
  importPath: "@aurodesignsystem/auro-button",
  isMonorepo: false,
  declaration: {
    kind: "class",
    name: "AuroButton",
    tagName: "auro-button",
    customElement: true,
    description: "A clickable button styled per the Auro Design System.",
    superclass: { name: "LitElement" },
    attributes: [
      {
        name: "disabled",
        description: "Disables the button.",
        type: { text: "boolean" },
      },
      {
        name: "fluid",
        description: "Stretches to full width.",
        type: { text: "boolean" },
      },
    ],
    slots: [{ name: "", description: "Button label content." }],
    events: [{ name: "click", description: "Fired on activation." }],
  },
};

const INPUT: ResolvedComponent = {
  pkg: "@aurodesignsystem/auro-formkit",
  version: "6.1.0",
  tagName: "auro-input",
  importPath: "@aurodesignsystem/auro-formkit/auro-input",
  isMonorepo: true,
  declaration: {
    kind: "class",
    name: "AuroInput",
    tagName: "auro-input",
    customElement: true,
    description: "A text input field with built-in validation.",
    superclass: { name: "LitElement" },
    attributes: [
      {
        name: "required",
        description: "Marks the field as required.",
        type: { text: "boolean" },
      },
    ],
    slots: [{ name: "label", description: "The field label." }],
    events: [],
  },
};

const RESOLVED_TAGS = new Map([
  ["auro-button", "myapp-button"],
  ["auro-input", "legacy-input"],
]);

test("generateAgentsMd reproduces the golden AGENTS.md byte-for-byte", () => {
  const output = generateAgentsMd([BUTTON, INPUT], RESOLVED_TAGS);
  assert.equal(output, fixture("AGENTS.md"));
});

test("generateClaudeMd reproduces the golden CLAUDE.md", () => {
  assert.equal(generateClaudeMd(), fixture("CLAUDE.md"));
});

test("groundingFiles returns AGENTS.md then CLAUDE.md with their contents", () => {
  const files = groundingFiles([BUTTON, INPUT], RESOLVED_TAGS);
  assert.deepEqual(
    files.map((f) => f.filename),
    ["AGENTS.md", "CLAUDE.md"],
  );
  assert.equal(files[0].contents, fixture("AGENTS.md"));
  assert.equal(files[1].contents, fixture("CLAUDE.md"));
});

test("a component with no resolved tag falls back to its bare auro-* tag", () => {
  const output = generateAgentsMd([BUTTON]); // no resolvedTags map
  assert.match(output, /<auro-button>/u, "bare tag used in the table");
  assert.match(
    output,
    /AuroButton\.register\('auro-button'\)/u,
    "register snippet uses the bare tag",
  );
});

test("generateAgentsMd emits a monorepo component's subpath import and register call", () => {
  const output = generateAgentsMd([INPUT], RESOLVED_TAGS);
  assert.match(
    output,
    /import "@aurodesignsystem\/auro-formkit\/auro-input";/u,
    "imports via the subpath export, not the package root",
  );
  assert.match(
    output,
    /npm i @aurodesignsystem\/auro-formkit\b/u,
    "installs the package",
  );
  assert.match(output, /AuroInput\.register\('legacy-input'\)/u);
});

test("generateAgentsMd yields a valid document with no installed components", () => {
  const output = generateAgentsMd([]);
  assert.ok(
    output.includes("## Installed Components"),
    "the section is still present",
  );
  assert.ok(
    output.includes("| Tag | Package | Version | Import |"),
    "the table header is still present",
  );
  assert.ok(!output.includes("### `<"), "but no per-component sections");
  assert.ok(output.endsWith("\n"), "ends with a single trailing newline");
});
