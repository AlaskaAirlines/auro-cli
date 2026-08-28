import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type TestContext, test } from "node:test";
import type { EditorSelection } from "../src/init/editors/detect.ts";
import {
  HTML_CUSTOM_DATA_PATH,
  HTML_CUSTOM_DATA_SETTINGS_ENTRY,
  SVELTE_TYPES_PATH,
  TSCONFIG_INCLUDE_ENTRY,
} from "../src/init/editors/layout.ts";
import { verifyEditorWiring } from "../src/init/editors/verify.ts";
import { tempCwd } from "./support.ts";

/** Write `contents` to `<cwd>/<rel>`, creating parent dirs as needed. */
function seed(cwd: string, rel: string, contents: string): void {
  const abs = path.join(cwd, ...rel.split("/"));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents, "utf-8");
}

/** A selection with every target off; spread to flip on the ones under test. */
const OFF: EditorSelection = {
  vscode: false,
  jsx: false,
  svelte: false,
  cssSnippets: false,
};

/** Seed a fully-wired VS Code target (custom-data file + settings pointer). */
function seedVsCode(cwd: string): void {
  seed(cwd, HTML_CUSTOM_DATA_PATH, "{}");
  seed(
    cwd,
    ".vscode/settings.json",
    `${JSON.stringify({ "html.customData": [HTML_CUSTOM_DATA_SETTINGS_ENTRY] }, null, 2)}\n`,
  );
}

test("no inconsistencies when an enabled vscode target is fully wired", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seedVsCode(cwd);

  const verdict = verifyEditorWiring(cwd, { ...OFF, vscode: true });
  assert.deepEqual(verdict.inconsistencies, []);
  assert.equal(verdict.markupDisabled, false);
});

test("reports a missing custom-data file for an enabled vscode target", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  // Pointer present, but the file it points at is gone (the external-tamper case).
  seed(
    cwd,
    ".vscode/settings.json",
    `${JSON.stringify({ "html.customData": [HTML_CUSTOM_DATA_SETTINGS_ENTRY] }, null, 2)}\n`,
  );

  const verdict = verifyEditorWiring(cwd, { ...OFF, vscode: true });
  assert.equal(verdict.inconsistencies.length, 1);
  assert.match(verdict.inconsistencies[0], /html-custom-data\.json is missing/);
});

test("reports a missing settings pointer for an enabled vscode target", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, HTML_CUSTOM_DATA_PATH, "{}"); // file present, but nothing registers it
  seed(cwd, ".vscode/settings.json", "{}\n");

  const verdict = verifyEditorWiring(cwd, { ...OFF, vscode: true });
  assert.equal(verdict.inconsistencies.length, 1);
  assert.match(verdict.inconsistencies[0], /does not register/);
});

test("markupDisabled is true when the vscode target is off", async (t: TestContext) => {
  const cwd = await tempCwd(t);

  const verdict = verifyEditorWiring(cwd, { ...OFF, svelte: true });
  assert.equal(verdict.markupDisabled, true);
});

test("svelte target: missing .d.ts is an inconsistency", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  // No auro-types/, no tsconfig — only the .d.ts absence should be flagged.
  const verdict = verifyEditorWiring(cwd, { ...OFF, svelte: true });
  assert.ok(
    verdict.inconsistencies.some((m) => m.includes("auro-svelte.d.ts")),
    "missing svelte declarations are reported",
  );
});

test("svelte target: .d.ts present but jsconfig include missing is an inconsistency", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, SVELTE_TYPES_PATH, "export {};");
  // A jsconfig exists but does not include auro-types → the writer's merge is missing.
  seed(
    cwd,
    "jsconfig.json",
    `${JSON.stringify({ include: ["src"] }, null, 2)}\n`,
  );

  const verdict = verifyEditorWiring(cwd, { ...OFF, svelte: true });
  assert.ok(
    verdict.inconsistencies.some((m) => m.includes(TSCONFIG_INCLUDE_ENTRY)),
    "missing include entry is reported",
  );
});

test("svelte target: .d.ts present and no tsconfig at all is consistent (default glob covers it)", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, SVELTE_TYPES_PATH, "export {};");

  const verdict = verifyEditorWiring(cwd, { ...OFF, svelte: true });
  assert.deepEqual(verdict.inconsistencies, []);
});

test("a disabled target with nothing on disk is not an inconsistency", async (t: TestContext) => {
  const cwd = await tempCwd(t);

  const verdict = verifyEditorWiring(cwd, {
    ...OFF,
    vscode: false,
    svelte: false,
  });
  assert.deepEqual(verdict.inconsistencies, []);
});
