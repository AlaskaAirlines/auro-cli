/**
 * The source rules ([sourceRules.ts](../src/init/cem-check/sourceRules.ts)): the
 * JSDoc block scanner, the `redundant-boolean-default` rule, how `runSourceRules`
 * picks the files to read, and the rule's effect on the `cem-check` exit contract.
 *
 * @see ../src/init/cem-check/sourceRules.ts
 */

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { runCemCheck } from "../src/commands/cem-check.ts";
import {
  findJsDocBlocks,
  runSourceRules,
} from "../src/init/cem-check/sourceRules.ts";
import type { Manifest } from "../src/utils/cem.ts";
import {
  captureError,
  type ExitError,
  elementManifest,
  mockExit,
  tempCwd,
} from "./support.ts";

/** A Lit component whose `disabled` JSDoc has a redundant `@default false` (line 9). */
const LIT_SOURCE = `import { LitElement } from "lit";

export class AuroThing extends LitElement {
  static get properties() {
    return {
      /**
       * Turns the thing off.
       * @category ui
       * @default false
       */
      disabled: {
        type: Boolean,
        reflect: true,
      },

      /**
       * Sets the thing's size.
       * @default "md"
       */
      size: {
        type: String,
      },
    };
  }
}
`;

/** Write `files` (relative path → contents) into a temp dir; return the dir. */
async function writeFiles(
  t: import("node:test").TestContext,
  files: Record<string, string>,
): Promise<string> {
  const dir = await tempCwd(t);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, "utf-8");
  }
  return dir;
}

/** A manifest that lists the given module paths and nothing else. */
function manifestFor(...paths: string[]): Manifest {
  return {
    schemaVersion: "1.0.0",
    modules: paths.map((p) => ({ kind: "javascript-module", path: p })),
  };
}

test("findJsDocBlocks returns each block's start line, tag lines, and the code after it", () => {
  const blocks = findJsDocBlocks(LIT_SOURCE);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.line, 6);
  assert.ok(blocks[0]?.lines.includes("@default false"));
  assert.match(blocks[0]?.following ?? "", /^\s*disabled: \{\s*type: Boolean/u);
});

test("findJsDocBlocks skips an empty /**/ comment", () => {
  assert.deepEqual(findJsDocBlocks("const a = 1; /**/ const b = 2;"), []);
});

test("redundant-boolean-default flags @default false on a Lit Boolean property, at the tag's line", async (t) => {
  const dir = await writeFiles(t, { "src/auro-thing.js": LIT_SOURCE });
  const findings = runSourceRules(manifestFor("src/auro-thing.js"), dir);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.rule, "redundant-boolean-default");
  assert.equal(findings[0]?.severity, "warn");
  assert.equal(findings[0]?.path, "src/auro-thing.js:9");
});

test("redundant-boolean-default flags a block typed @type {boolean}", async (t) => {
  const source = `class A {
  /**
   * Turns it off.
   * @type {boolean}
   * @default false
   */
  disabled = false;
}
`;
  const dir = await writeFiles(t, { "a.js": source });
  const findings = runSourceRules(manifestFor("a.js"), dir);
  assert.deepEqual(
    findings.map((f) => f.path),
    ["a.js:5"],
  );
});

test("redundant-boolean-default flags a @property({ type: Boolean }) decorator", async (t) => {
  const source = `class A {
  /**
   * Turns it off.
   * @default false
   */
  @property({ type: Boolean, reflect: true })
  disabled = false;
}
`;
  const dir = await writeFiles(t, { "a.ts": source });
  assert.equal(runSourceRules(manifestFor("a.ts"), dir).length, 1);
});

test("redundant-boolean-default ignores @default true, non-boolean properties, and booleans with no @default", async (t) => {
  const source = `const properties = {
  /**
   * Shows the thing.
   * @default true
   */
  visible: { type: Boolean },

  /**
   * Sets a label.
   * @default false
   */
  label: { type: String },

  /**
   * Turns it off.
   */
  disabled: { type: Boolean },
};
`;
  const dir = await writeFiles(t, { "a.js": source });
  assert.deepEqual(runSourceRules(manifestFor("a.js"), dir), []);
});

test("runSourceRules skips missing files, non-source paths, and repeated paths", async (t) => {
  const dir = await writeFiles(t, {
    "src/auro-thing.js": LIT_SOURCE,
    "README.md": "/**\n * @default false\n */\nflag: { type: Boolean },\n",
  });
  const findings = runSourceRules(
    manifestFor(
      "src/missing.js",
      "README.md",
      "src/auro-thing.js",
      "src/auro-thing.js",
    ),
    dir,
  );
  assert.deepEqual(
    findings.map((f) => f.path),
    ["src/auro-thing.js:9"],
  );
});

/** Write a CEM whose single module path points at `src/auro-thing.js`, plus that source. */
async function writeCemWithSource(
  t: import("node:test").TestContext,
  source: string,
): Promise<string> {
  const manifest = elementManifest("auro-thing") as Manifest;
  const [mod] = manifest.modules ?? [];
  if (mod) mod.path = "src/auro-thing.js";
  const dir = await writeFiles(t, {
    "custom-elements.json": JSON.stringify(manifest),
    "package.json": JSON.stringify({
      name: "@aurodesignsystem/auro-thing",
      version: "1.0.0",
    }),
    "src/auro-thing.js": source,
  });
  return path.join(dir, "custom-elements.json");
}

test("cem-check reports the source finding as a warning, which passes without --strict", async (t) => {
  t.mock.method(process, "exit", (code?: number): never => {
    throw new Error(`process.exit(${code}) should not have been called`);
  });
  const stderr = captureError(t);
  const cemPath = await writeCemWithSource(t, LIT_SOURCE);
  await runCemCheck(cemPath);
  assert.match(
    stderr(),
    /\[redundant-boolean-default\] src\/auro-thing\.js:9/u,
  );
});

test("cem-check --strict fails on the source finding (exit 1)", async (t) => {
  mockExit(t);
  captureError(t);
  const cemPath = await writeCemWithSource(t, LIT_SOURCE);
  await assert.rejects(
    runCemCheck(cemPath, { strict: true }),
    (err: ExitError) => err.code === 1,
  );
});

/** Run the source rules over one file with the given contents; return `rule@line` pairs. */
async function wordFindings(
  t: import("node:test").TestContext,
  source: string,
): Promise<string[]> {
  const dir = await writeFiles(t, { "a.js": source });
  return runSourceRules(manifestFor("a.js"), dir).map(
    (f) => `${f.rule}@${f.path?.split(":")[1]}`,
  );
}

test("word-choice flags e.g., i.e., HTML5, and a11y in prose, at each line", async (t) => {
  const source = `/**
 * Sets the label, e.g. a name.
 * Uses the HTML5 input, i.e. the native one.
 * Helps a11y.
 */
const a = 1;
`;
  assert.deepEqual(await wordFindings(t, source), [
    "word-choice@2",
    "word-choice@3",
    "word-choice@3",
    "word-choice@4",
  ]);
});

test("word-choice ignores code spans, URLs, inline tags, @category, and @example sections", async (t) => {
  const source = `/**
 * Sets the label, such as \`e.g.\` or \`HTML5\`. See https://example.com/e.g./a11y.
 * @slot label - The label. {@category a11y}
 * @category a11y
 * @example
 * // e.g. an HTML5 input — for a11y
 * <auro-thing></auro-thing>
 */
const a = 1;
`;
  assert.deepEqual(await wordFindings(t, source), []);
});

test("spaced-em-dash flags a spaced em dash but not an unspaced one", async (t) => {
  const source = `/**
 * Sets the label — the text people read.
 * Sets the label—the text people read.
 */
const a = 1;
`;
  assert.deepEqual(await wordFindings(t, source), ["spaced-em-dash@2"]);
});

test("deprecated-casing flags DEPRECATED but not sentence-case Deprecated", async (t) => {
  const source = `/**
 * DEPRECATED - use \`appearance\` instead.
 * @event old - Fires when it changes. **DEPRECATED** - Use \`change\`.
 */
const a = 1;
/**
 * Deprecated: Use \`appearance\` instead.
 * @deprecated Use \`appearance\` instead.
 */
const b = 2;
`;
  assert.deepEqual(await wordFindings(t, source), [
    "deprecated-casing@2",
    "deprecated-casing@3",
  ]);
});

test("filler-opener flags a description or tag description that starts with filler, not mid-sentence", async (t) => {
  const source = `/**
 * Used to set the label.
 * @slot close - Used to replace the close button.
 * @param {string} layout - This property sets the layout.
 */
const a = 1;
/**
 * Sets the label, which is used to name the button.
 * @slot icon - The icon. This property is optional.
 */
const b = 2;
`;
  assert.deepEqual(await wordFindings(t, source), [
    "filler-opener@2",
    "filler-opener@3",
    "filler-opener@4",
  ]);
});
