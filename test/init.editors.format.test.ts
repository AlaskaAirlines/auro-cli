import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";
import type { AuroConfig } from "../src/init/config.ts";
import {
  FRAMEWORK_TYPES_DIR,
  HTML_CUSTOM_DATA_FILENAME,
  HTML_CUSTOM_DATA_SETTINGS_ENTRY,
  HTML_CUSTOM_DATA_SETTINGS_KEY,
  JSX_TYPES_FILENAME,
  SVELTE_TYPES_FILENAME,
  TSCONFIG_INCLUDE_ENTRY,
  TSCONFIG_INCLUDE_KEY,
  VSCODE_DIR,
} from "../src/init/editors/layout.ts";

/**
 * Freeze tests for the PT-M2 editor-artifact format (build-order step 1). Like
 * the PT-M1 init.format.test.ts, these assert the golden fixtures embody the
 * frozen decisions and stay in sync with the input-independent constants the
 * per-target builders (step 2) will assemble around. They do NOT assert
 * byte-exact builder output (the builders don't exist yet) — that golden test
 * lands with the builders. Their job is to catch silent format/wiring drift.
 *
 * The three artifact fixtures are real output from the frozen community tools
 * over one resolved manifest: a standalone `auro-button` grounded under the
 * default prefix (`<myapp-button>`) and a monorepo `auro-formkit/auro-input`
 * grounded via a per-component override (`<legacy-input>`) — the same two
 * components the PT-M1 AGENTS.md fixture pins, so every artifact is checked
 * against the resolved tags a consumer actually registers, never the bare
 * `auro-*` tag.
 */

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/init/editors/${name}`, import.meta.url)),
    "utf-8",
  );

const HTML_CUSTOM_DATA = fixture(HTML_CUSTOM_DATA_FILENAME);
const JSX_TYPES = fixture(JSX_TYPES_FILENAME);
const SVELTE_TYPES = fixture(SVELTE_TYPES_FILENAME);

// ---------------------------------------------------------------------------
// Frozen filenames / paths / wiring keys (the shape step 1 pins)
// ---------------------------------------------------------------------------

test("editor artifact locations + wiring keys are frozen and self-consistent", () => {
  // HTML custom-data lives under .vscode/ and is wired via a project-root path.
  assert.equal(HTML_CUSTOM_DATA_FILENAME, "auro.html-custom-data.json");
  assert.equal(HTML_CUSTOM_DATA_SETTINGS_KEY, "html.customData");
  assert.equal(
    HTML_CUSTOM_DATA_SETTINGS_ENTRY,
    `./${VSCODE_DIR}/${HTML_CUSTOM_DATA_FILENAME}`,
    "settings entry is the project-root-relative path to the file we write",
  );
  assert.equal(HTML_CUSTOM_DATA_SETTINGS_ENTRY.startsWith("./"), true);

  // Framework .d.ts bundles live in a NON-dotted dir so TypeScript's default
  // `**/*` include (which skips dotfiles) picks them up with zero tsconfig edits.
  assert.equal(FRAMEWORK_TYPES_DIR, "auro-types");
  assert.equal(
    FRAMEWORK_TYPES_DIR.startsWith("."),
    false,
    "types dir must be non-dotted or the default include glob skips it",
  );
  assert.equal(JSX_TYPES_FILENAME.endsWith(".d.ts"), true);
  assert.equal(SVELTE_TYPES_FILENAME.endsWith(".d.ts"), true);

  // tsconfig wiring appends the types dir to `include`, and can never point
  // somewhere other than where the files are written.
  assert.equal(TSCONFIG_INCLUDE_KEY, "include");
  assert.equal(TSCONFIG_INCLUDE_ENTRY, FRAMEWORK_TYPES_DIR);
});

// ---------------------------------------------------------------------------
// HTML custom-data artifact (VS Code HTML Language Server)
// ---------------------------------------------------------------------------

test("HTML custom-data fixture is VS Code custom-data v1.1 keyed on resolved tags", () => {
  const data = JSON.parse(HTML_CUSTOM_DATA) as {
    version: string | number;
    tags: { name: string }[];
  };

  assert.equal(String(data.version), "1.1", "VS Code custom-data format v1.1");
  assert.ok(Array.isArray(data.tags), "carries a tags array");

  const names = data.tags.map((t) => t.name);
  assert.ok(names.includes("myapp-button"), "default-prefixed tag emitted");
  assert.ok(names.includes("legacy-input"), "per-component override emitted");
  // The bare auro-* tags are NOT what the consumer registers.
  assert.ok(!names.includes("auro-button"), "bare auro-button not emitted");
  assert.ok(!names.includes("auro-input"), "bare auro-input not emitted");
});

// ---------------------------------------------------------------------------
// JSX / React type declarations (TS language service)
// ---------------------------------------------------------------------------

test("JSX types fixture augments JSX.IntrinsicElements for resolved tags", () => {
  // Global augmentation so plain .tsx (no explicit import) sees the elements.
  assert.match(JSX_TYPES, /declare global/u);
  assert.match(JSX_TYPES, /namespace JSX/u);
  assert.match(JSX_TYPES, /interface IntrinsicElements/u);

  // React 19's automatic runtime resolves JSX types from `react/jsx-runtime`,
  // not the global namespace — the tool augments it too (open question resolved).
  assert.match(JSX_TYPES, /declare module 'react\/jsx-runtime'/u);

  // Keyed on the resolved tags, not the bare auro-* tags.
  assert.match(JSX_TYPES, /"myapp-button":/u);
  assert.match(JSX_TYPES, /"legacy-input":/u);

  // Component prop types come from the class imported at each component's
  // resolved importPath (componentTypePath): standalone root vs monorepo subpath.
  assert.match(
    JSX_TYPES,
    /import type \{ AuroButton \} from "@aurodesignsystem\/auro-button"/u,
    "standalone class imported from the package root",
  );
  assert.match(
    JSX_TYPES,
    /import type \{ AuroInput[^}]*\} from "@aurodesignsystem\/auro-formkit\/auro-input"/u,
    "monorepo class imported from its subpath export",
  );
});

// ---------------------------------------------------------------------------
// Svelte type declarations (Svelte language server)
// ---------------------------------------------------------------------------

test("Svelte types fixture augments svelteHTML for resolved tags", () => {
  assert.match(SVELTE_TYPES, /declare namespace svelteHTML/u);
  assert.match(SVELTE_TYPES, /interface IntrinsicElements/u);

  assert.match(SVELTE_TYPES, /"myapp-button":/u);
  assert.match(SVELTE_TYPES, /"legacy-input":/u);

  // Same importPath contract as JSX: monorepo component from its subpath export.
  assert.match(
    SVELTE_TYPES,
    /from "@aurodesignsystem\/auro-formkit\/auro-input"/u,
    "monorepo class imported from its subpath export",
  );
});

// ---------------------------------------------------------------------------
// settings.json merge scenarios (comment-preserving, non-destructive)
// ---------------------------------------------------------------------------

test("settings.json merge fixtures cover the three consumer states", () => {
  // Empty object — merge creates the key.
  const empty = parseJsonc(fixture("settings/empty.json")) as Record<
    string,
    unknown
  >;
  assert.deepEqual(empty, {}, "empty fixture is a bare object");

  // Unrelated keys + a comment — merge must add the key while preserving both.
  const unrelatedRaw = fixture("settings/unrelated-keys.json");
  assert.match(unrelatedRaw, /\/\//u, "carries a comment to preserve");
  const unrelated = parseJsonc(unrelatedRaw) as Record<string, unknown>;
  assert.equal(
    HTML_CUSTOM_DATA_SETTINGS_KEY in unrelated,
    false,
    "no pre-existing html.customData — merge creates it",
  );
  assert.equal(unrelated["editor.tabSize"], 2, "unrelated keys survive parse");

  // Pre-existing html.customData array — merge must APPEND, never clobber.
  const preexisting = parseJsonc(
    fixture("settings/preexisting-custom-data.json"),
  ) as Record<string, unknown>;
  const existing = preexisting[HTML_CUSTOM_DATA_SETTINGS_KEY];
  assert.ok(
    Array.isArray(existing),
    "html.customData is an array to append to",
  );
  assert.equal(
    (existing as string[]).includes(HTML_CUSTOM_DATA_SETTINGS_ENTRY),
    false,
    "the Auro entry is not yet present (merge will add it)",
  );
});

// ---------------------------------------------------------------------------
// tsconfig.json include-merge scenarios (the four-branch decision tree)
// ---------------------------------------------------------------------------

test("tsconfig merge fixtures cover the four include/files branches", () => {
  const hasInclude = parseJsonc(fixture("tsconfig/has-include.json")) as {
    include?: unknown;
    files?: unknown;
  };
  assert.ok(Array.isArray(hasInclude.include), "branch 1: include present");
  assert.equal(hasInclude.files, undefined);

  const both = parseJsonc(fixture("tsconfig/files-and-include.json")) as {
    include?: unknown;
    files?: unknown;
  };
  assert.ok(Array.isArray(both.include), "branch 2: include present");
  assert.ok(Array.isArray(both.files), "branch 2: files present");

  const filesOnly = parseJsonc(fixture("tsconfig/files-only.json")) as {
    include?: unknown;
    files?: unknown;
  };
  assert.equal(filesOnly.include, undefined, "branch 3: no include");
  assert.ok(Array.isArray(filesOnly.files), "branch 3: files present");

  const neither = parseJsonc(fixture("tsconfig/neither.json")) as {
    include?: unknown;
    files?: unknown;
  };
  assert.equal(neither.include, undefined, "branch 4: no include");
  assert.equal(neither.files, undefined, "branch 4: no files (default glob)");
});

// ---------------------------------------------------------------------------
// Additive `init.editors` config field (no version bump)
// ---------------------------------------------------------------------------

test("auro.config.json with an editors block stays a valid v1 config", () => {
  const config = JSON.parse(fixture("auro.config.editors.json")) as AuroConfig;

  assert.equal(config.version, 1, "additive field does not bump the version");
  assert.equal(typeof config.init.prefix.default, "string");

  const editors = config.init.editors;
  assert.ok(editors, "editors block present");
  // Each key is an optional tri-state boolean; a settled false is honored as-is.
  assert.equal(typeof editors.vscode, "boolean");
  assert.equal(typeof editors.jsx, "boolean");
  assert.equal(typeof editors.svelte, "boolean");
  assert.equal(editors.svelte, false, "a settled opt-OUT is representable");
});
