import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { CONFIG_FILENAME, CONFIG_VERSION } from "../src/init/config.ts";
import {
  CSS_SNIPPETS_PATH,
  HTML_CUSTOM_DATA_PATH,
  HTML_CUSTOM_DATA_SETTINGS_ENTRY,
  JSX_TYPES_PATH,
  SVELTE_TYPES_PATH,
  TSCONFIG_INCLUDE_ENTRY,
} from "../src/init/editors/layout.ts";
import {
  unmergeTsconfigInclude,
  unmergeVsCodeSettings,
} from "../src/init/editors/settings.ts";
import {
  AGENTS_FILENAME,
  CLAUDE_FILENAME,
  CLAUDE_MD,
  GROUNDING_HEADER,
} from "../src/init/layout.ts";
import { applyReset, planReset } from "../src/init/reset.ts";
import { tempCwd } from "./support.ts";

/** Write `contents` to `<cwd>/<rel>`, creating parent dirs as needed. */
function seed(cwd: string, rel: string, contents: string): void {
  const abs = path.join(cwd, ...rel.split("/"));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents, "utf-8");
}

/** True when `<cwd>/<rel>` exists on disk. */
function has(cwd: string, rel: string): boolean {
  return existsSync(path.join(cwd, ...rel.split("/")));
}

/** Read `<cwd>/<rel>` as UTF-8. */
function read(cwd: string, rel: string): string {
  return readFileSync(path.join(cwd, ...rel.split("/")), "utf-8");
}

/** A minimal valid `auro.config.json` body the reset guard will accept. */
function validConfig(): string {
  return `${JSON.stringify(
    {
      version: CONFIG_VERSION,
      init: { prefix: { default: "auro-", overrides: {} } },
    },
    null,
    2,
  )}\n`;
}

/**
 * Seed a temp cwd with a full `auro init` output: both grounding files, the
 * config, all four editor artifacts, and both configs merged with the Auro entry.
 */
function seedFullInit(cwd: string): void {
  seed(cwd, AGENTS_FILENAME, `${GROUNDING_HEADER}\nbody\n`);
  seed(cwd, CLAUDE_FILENAME, CLAUDE_MD);
  seed(cwd, CONFIG_FILENAME, validConfig());
  seed(cwd, HTML_CUSTOM_DATA_PATH, "{}");
  seed(cwd, CSS_SNIPPETS_PATH, "{}");
  seed(cwd, JSX_TYPES_PATH, "export {};");
  seed(cwd, SVELTE_TYPES_PATH, "export {};");
  seed(
    cwd,
    ".vscode/settings.json",
    `${JSON.stringify(
      {
        "editor.tabSize": 2,
        "html.customData": [HTML_CUSTOM_DATA_SETTINGS_ENTRY],
      },
      null,
      2,
    )}\n`,
  );
  seed(
    cwd,
    "tsconfig.json",
    `${JSON.stringify({ include: ["src", TSCONFIG_INCLUDE_ENTRY] }, null, 2)}\n`,
  );
}

// ---------------------------------------------------------------------------
// Un-merge, settings.json
// ---------------------------------------------------------------------------

test("unmergeVsCodeSettings drops our entry and keeps the others", () => {
  const source = `{
  // keep this comment
  "html.customData": ["./other.json", "${HTML_CUSTOM_DATA_SETTINGS_ENTRY}"]
}`;
  const result = unmergeVsCodeSettings(source);
  assert.equal(result.changed, true);
  assert.match(result.contents, /keep this comment/);
  assert.match(result.contents, /other\.json/);
  assert.doesNotMatch(result.contents, /auro\.html-custom-data/);
});

test("unmergeVsCodeSettings deletes the key when we were the only entry", () => {
  const source = `{ "html.customData": ["${HTML_CUSTOM_DATA_SETTINGS_ENTRY}"] }`;
  const result = unmergeVsCodeSettings(source);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.contents, /html\.customData/);
});

test("unmergeVsCodeSettings deletes the key for a bare string equal to our entry", () => {
  const source = `{ "html.customData": "${HTML_CUSTOM_DATA_SETTINGS_ENTRY}" }`;
  const result = unmergeVsCodeSettings(source);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.contents, /html\.customData/);
});

test("unmergeVsCodeSettings is a no-op when our entry is absent", () => {
  const source = `{ "html.customData": ["./other.json"] }`;
  const result = unmergeVsCodeSettings(source);
  assert.equal(result.changed, false);
  assert.equal(result.contents, source);
});

test("unmergeVsCodeSettings warns and does not touch an unparseable file", () => {
  const source = "{ not json";
  const result = unmergeVsCodeSettings(source);
  assert.equal(result.changed, false);
  assert.ok(result.warning);
  assert.equal(result.contents, source);
});

// ---------------------------------------------------------------------------
// Un-merge, tsconfig.json
// ---------------------------------------------------------------------------

test("unmergeTsconfigInclude drops our entry and keeps the rest", () => {
  const source = `{ "include": ["src", "${TSCONFIG_INCLUDE_ENTRY}"] }`;
  const result = unmergeTsconfigInclude(source);
  assert.equal(result.changed, true);
  assert.match(result.contents, /"src"/);
  assert.doesNotMatch(result.contents, /auro-types/);
});

test("unmergeTsconfigInclude deletes include when we were its only entry", () => {
  const source = `{ "include": ["${TSCONFIG_INCLUDE_ENTRY}"] }`;
  const result = unmergeTsconfigInclude(source);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.contents, /include/);
});

test("unmergeTsconfigInclude is a no-op when the entry is absent", () => {
  const source = `{ "include": ["src"] }`;
  const result = unmergeTsconfigInclude(source);
  assert.equal(result.changed, false);
});

// ---------------------------------------------------------------------------
// planReset — signature guards
// ---------------------------------------------------------------------------

test("planReset lists a generated AGENTS.md for removal", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, AGENTS_FILENAME, `${GROUNDING_HEADER}\nbody\n`);
  const plan = planReset(cwd);
  assert.ok(plan.filesToRemove.includes(AGENTS_FILENAME));
  assert.equal(plan.filesToSkip.length, 0);
});

test("planReset skips an AGENTS.md that is missing the marker", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, AGENTS_FILENAME, "# My own notes\n");
  const plan = planReset(cwd);
  assert.ok(!plan.filesToRemove.includes(AGENTS_FILENAME));
  assert.ok(plan.filesToSkip.some((f) => f.path === AGENTS_FILENAME));
});

test("planReset skips a CLAUDE.md with extra user content", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, CLAUDE_FILENAME, `${CLAUDE_MD}\n# extra project rules\n`);
  const plan = planReset(cwd);
  assert.ok(!plan.filesToRemove.includes(CLAUDE_FILENAME));
  assert.ok(plan.filesToSkip.some((f) => f.path === CLAUDE_FILENAME));
});

test("planReset removes a valid config but skips a malformed one", async (t: TestContext) => {
  const validCwd = await tempCwd(t);
  seed(validCwd, CONFIG_FILENAME, validConfig());
  assert.ok(planReset(validCwd).filesToRemove.includes(CONFIG_FILENAME));

  const badCwd = await tempCwd(t);
  seed(badCwd, CONFIG_FILENAME, "{ not json");
  const badPlan = planReset(badCwd);
  assert.ok(!badPlan.filesToRemove.includes(CONFIG_FILENAME));
  assert.ok(badPlan.filesToSkip.some((f) => f.path === CONFIG_FILENAME));
});

// ---------------------------------------------------------------------------
// applyReset — end to end
// ---------------------------------------------------------------------------

test("applyReset removes every artifact, un-merges configs, and prunes empty dirs", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seedFullInit(cwd);

  const report = applyReset(cwd, planReset(cwd));

  for (const rel of [
    AGENTS_FILENAME,
    CLAUDE_FILENAME,
    CONFIG_FILENAME,
    HTML_CUSTOM_DATA_PATH,
    CSS_SNIPPETS_PATH,
    JSX_TYPES_PATH,
    SVELTE_TYPES_PATH,
  ]) {
    assert.ok(!has(cwd, rel), `${rel} should be removed`);
  }

  // Both wiring entries gone, sibling content kept.
  const settings = read(cwd, ".vscode/settings.json");
  assert.doesNotMatch(settings, /auro\.html-custom-data/);
  assert.match(settings, /editor\.tabSize/);
  const tsconfig = read(cwd, "tsconfig.json");
  assert.doesNotMatch(tsconfig, /auro-types/);
  assert.match(tsconfig, /"src"/);

  // auro-types/ emptied → pruned; .vscode/ still holds settings.json → kept.
  assert.ok(!has(cwd, "auro-types"), "auro-types/ should be pruned");
  assert.ok(has(cwd, ".vscode"), ".vscode/ still holds settings.json");
  assert.ok(report.prunedDirs.includes("auro-types"));
  assert.ok(!report.prunedDirs.includes(".vscode"));
});

test("applyReset leaves an unrelated .vscode sibling untouched and a second run is a clean no-op", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seedFullInit(cwd);
  // A user snippet file sharing .vscode should survive and keep the dir alive.
  seed(cwd, ".vscode/my.code-snippets", "{}");

  applyReset(cwd, planReset(cwd));
  assert.ok(has(cwd, ".vscode/my.code-snippets"), "user snippet survives");
  assert.ok(has(cwd, ".vscode"), ".vscode kept (still has a sibling)");

  // Idempotent: replanning the now-clean project finds nothing to do.
  const secondPlan = planReset(cwd);
  assert.equal(secondPlan.filesToRemove.length, 0);
  assert.equal(secondPlan.unmerges.length, 0);
});

test("planReset removes an Auro-created settings.json (only our entry) instead of leaving {}", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  // settings.json holding ONLY our pointer — the shape `auro init` creates when it
  // had to make the file. Un-merging empties it, so reset should delete the file.
  seed(
    cwd,
    ".vscode/settings.json",
    `${JSON.stringify({ "html.customData": [HTML_CUSTOM_DATA_SETTINGS_ENTRY] }, null, 2)}\n`,
  );

  const plan = planReset(cwd);
  assert.ok(
    plan.filesToRemove.includes(".vscode/settings.json"),
    "empty-after-unmerge settings.json is removed, not un-merged",
  );
  assert.ok(
    !plan.unmerges.some((u) => u.path === ".vscode/settings.json"),
    "it is not left behind as a stray {} un-merge",
  );
});

test("planReset keeps (un-merges, not deletes) a settings.json whose only remaining content is a user comment", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  // Only our pointer as a key, but the user added a JSONC comment. Un-merging
  // empties the object, yet deleting the file would silently discard the comment,
  // so reset must keep the file and just write back the emptied object.
  seed(
    cwd,
    ".vscode/settings.json",
    `{\n  // keep my editor defaults out of source control tweaks\n  "html.customData": ["${HTML_CUSTOM_DATA_SETTINGS_ENTRY}"]\n}\n`,
  );

  const plan = planReset(cwd);
  assert.ok(
    !plan.filesToRemove.includes(".vscode/settings.json"),
    "a comment-carrying settings.json is not deleted",
  );
  assert.ok(
    plan.unmerges.some((u) => u.path === ".vscode/settings.json"),
    "it is un-merged in place so the comment survives",
  );

  // End to end: the file stays, our entry is gone, and the comment survives.
  applyReset(cwd, plan);
  assert.ok(has(cwd, ".vscode/settings.json"), "the file is kept");
  const settings = read(cwd, ".vscode/settings.json");
  assert.match(
    settings,
    /keep my editor defaults/,
    "the user comment survives",
  );
  assert.doesNotMatch(settings, /auro\.html-custom-data/, "our entry is gone");
});

test("applyReset deletes the emptied settings.json and prunes a now-empty .vscode/", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(cwd, HTML_CUSTOM_DATA_PATH, "{}");
  seed(
    cwd,
    ".vscode/settings.json",
    `${JSON.stringify({ "html.customData": [HTML_CUSTOM_DATA_SETTINGS_ENTRY] }, null, 2)}\n`,
  );

  const report = applyReset(cwd, planReset(cwd));

  assert.ok(!has(cwd, ".vscode/settings.json"), "stray settings.json is gone");
  assert.ok(!has(cwd, ".vscode"), ".vscode/ is pruned once empty");
  assert.ok(report.removed.includes(".vscode/settings.json"));
  assert.ok(report.prunedDirs.includes(".vscode"));
});

test("applyReset keeps settings.json (only un-merges) when it holds other keys", async (t: TestContext) => {
  const cwd = await tempCwd(t);
  seed(
    cwd,
    ".vscode/settings.json",
    `${JSON.stringify(
      {
        "editor.tabSize": 2,
        "html.customData": [HTML_CUSTOM_DATA_SETTINGS_ENTRY],
      },
      null,
      2,
    )}\n`,
  );

  applyReset(cwd, planReset(cwd));

  assert.ok(
    has(cwd, ".vscode/settings.json"),
    "file with user content survives",
  );
  const settings = read(cwd, ".vscode/settings.json");
  assert.match(settings, /editor\.tabSize/, "user setting preserved");
  assert.doesNotMatch(settings, /auro\.html-custom-data/, "our entry removed");
});
