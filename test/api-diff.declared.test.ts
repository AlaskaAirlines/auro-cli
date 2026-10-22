/**
 * `auro api-diff` declared bump — runs the real `@semantic-release/commit-analyzer`
 * with the shared auro-config rules (including the custom `releaseRules`), and
 * covers how the repo's release config is resolved. Also covers the bump
 * comparison and PR-comment summary.
 *
 * @see ../src/scripts/api-diff/declared.ts
 * @see ../src/scripts/api-diff/bump.ts
 */

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  type ApiChange,
  compareBumps,
  maxBump,
  sortChanges,
} from "../src/scripts/api-diff/bump.ts";
import {
  declaredBump,
  loadAnalyzerConfig,
  SHARED_ANALYZER_OPTIONS,
} from "../src/scripts/api-diff/declared.ts";
import { formatSummary } from "../src/scripts/api-diff/index.ts";
import { tempCwd } from "./support.ts";

const shared = { options: SHARED_ANALYZER_OPTIONS, source: "default" };

/** The bump one commit message declares under the shared rules. */
async function bumpOf(message: string): Promise<string> {
  const { bump } = await declaredBump(
    [{ hash: "a1", message }],
    shared,
    process.cwd(),
  );
  return bump;
}

test("the shared rules match semantic-release's, including Auro's custom releaseRules", async () => {
  const cases: Array<[string, string]> = [
    ["feat: add a variant", "minor"],
    ["fix: correct focus ring", "patch"],
    ["perf: faster render", "patch"],
    ["feat!: remove ondark", "major"],
    ["fix(button)!: drop value", "major"],
    ["fix: x\n\nBREAKING CHANGE: removes ondark", "major"],
    // Auro's custom rules:
    ["refactor: simplify render", "patch"],
    ["style: fix lint", "patch"],
    ["docs(README): update usage", "patch"],
    // Not released:
    ["docs: update guide", "none"],
    ["chore: bump deps", "none"],
    ["test: add coverage", "none"],
    ["ci: update workflow", "none"],
    ["build: update config", "none"],
    ["not a conventional commit", "none"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(await bumpOf(message), expected, message);
  }
});

test("the declared bump is the highest across commits, with each commit reported", async () => {
  const result = await declaredBump(
    // Newest first, as git log lists them.
    [
      { hash: "c3", message: "fix: focus" },
      { hash: "b2", message: "feat!: remove ondark" },
      { hash: "a1", message: "chore: tidy" },
    ],
    shared,
    process.cwd(),
  );
  assert.equal(result.bump, "major");
  // Reported oldest first.
  assert.deepEqual(
    result.commits.map((c) => [c.hash, c.type, c.bump]),
    [
      ["a1", "chore", "none"],
      ["b2", "feat!", "major"],
      ["c3", "fix", "patch"],
    ],
  );
});

test("a reverted commit doesn't count toward the declared bump", async () => {
  const result = await declaredBump(
    [
      {
        hash: "bbbbbbb2",
        message: 'Revert "feat: add variant"\n\nThis reverts commit aaaaaaa1.',
      },
      { hash: "aaaaaaa1", message: "feat: add variant" },
    ],
    shared,
    process.cwd(),
  );
  assert.equal(result.bump, "none");
});

test("no commits declare no release", async () => {
  const result = await declaredBump([], shared, process.cwd());
  assert.equal(result.bump, "none");
  assert.deepEqual(result.commits, []);
});

test("the repo's own commit-analyzer is required to read commits", async (t) => {
  const bare = await tempCwd(t);
  await assert.rejects(
    declaredBump([{ hash: "a1", message: "fix: x" }], shared, bare),
    /@semantic-release\/commit-analyzer isn't installed in /u,
  );
  // With nothing to read, the analyzer isn't needed.
  assert.equal((await declaredBump([], shared, bare)).bump, "none");
});

/** Write a fake installed package exposing `./releaserc`. */
async function installReleaseConfig(
  cwd: string,
  releaseRules: unknown[],
): Promise<void> {
  const dir = path.join(
    cwd,
    "node_modules",
    "@aurodesignsystem",
    "auro-config",
  );
  await mkdir(path.join(dir, "configs"), { recursive: true });
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@aurodesignsystem/auro-config",
      exports: { "./releaserc": "./configs/releaserc.json" },
    }),
  );
  await writeFile(
    path.join(dir, "configs", "releaserc.json"),
    JSON.stringify({
      plugins: [
        [
          "@semantic-release/commit-analyzer",
          { preset: "conventionalcommits", releaseRules },
        ],
        "@semantic-release/npm",
      ],
    }),
  );
}

test("a .releaserc that extends the shared config resolves through it", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(path.join(cwd, "package.json"), "{}");
  await writeFile(
    path.join(cwd, ".releaserc"),
    JSON.stringify({ extends: ["@aurodesignsystem/auro-config/releaserc"] }),
  );
  await installReleaseConfig(cwd, [{ type: "chore", release: "patch" }]);
  const config = loadAnalyzerConfig(cwd);
  assert.equal(config.source, "@aurodesignsystem/auro-config/releaserc");
  // The fake install has no analyzer, so read with auro-cli's own.
  const { bump } = await declaredBump(
    [{ hash: "a1", message: "chore: x" }],
    config,
    process.cwd(),
  );
  assert.equal(bump, "patch");
});

test("a repo's own analyzer plugin (like auro-formkit's copied .releaserc) wins over extends", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(
    path.join(cwd, ".releaserc.json"),
    JSON.stringify({
      extends: "@aurodesignsystem/auro-config/releaserc",
      plugins: [
        [
          "@semantic-release/commit-analyzer",
          { preset: "conventionalcommits" },
        ],
      ],
    }),
  );
  const config = loadAnalyzerConfig(cwd);
  assert.equal(config.source, ".releaserc.json");
  assert.deepEqual(config.options, { preset: "conventionalcommits" });
});

test("package.json#release is read when there's no .releaserc", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({
      release: { plugins: ["@semantic-release/commit-analyzer"] },
    }),
  );
  assert.deepEqual(loadAnalyzerConfig(cwd), {
    options: {},
    source: "package.json#release",
  });
});

test("the shared rules are the fallback when the repo's config can't be resolved", async (t) => {
  const cwd = await tempCwd(t);
  assert.equal(loadAnalyzerConfig(cwd).source, "default");
  await writeFile(path.join(cwd, "package.json"), "{}");
  await writeFile(
    path.join(cwd, ".releaserc"),
    JSON.stringify({ extends: "@aurodesignsystem/auro-config/releaserc" }),
  );
  // auro-config isn't installed.
  assert.deepEqual(loadAnalyzerConfig(cwd), shared);
});

test("compareBumps: lower fails, equal or higher passes, unneeded release warns", () => {
  assert.equal(compareBumps("patch", "major"), "fail");
  assert.equal(compareBumps("none", "patch"), "fail");
  assert.equal(compareBumps("minor", "minor"), "pass");
  assert.equal(compareBumps("major", "patch"), "pass");
  assert.equal(compareBumps("none", "none"), "pass");
  assert.equal(compareBumps("patch", "none"), "warn");
  assert.equal(compareBumps("major", "none"), "warn");
});

test("maxBump and sortChanges order by bump", () => {
  assert.equal(maxBump([]), "none");
  assert.equal(maxBump(["patch", "major", "minor"]), "major");
  const changes: ApiChange[] = [
    { bump: "patch", source: "files", message: "p" },
    { bump: "minor", source: "manifest", message: "m1" },
    { bump: "major", source: "manifest", message: "M" },
    { bump: "minor", source: "manifest", message: "m2" },
    { bump: "minor", source: "manifest", message: "m1" },
  ];
  assert.deepEqual(
    sortChanges(changes).map((c) => c.message),
    ["M", "m1", "m2", "p"],
  );
});

test("the summary takes the TRD's PR-comment form", () => {
  const changes: ApiChange[] = [
    {
      bump: "major",
      source: "manifest",
      message: "Removed attribute `ondark` from `<auro-button>`",
    },
    {
      bump: "patch",
      source: "files",
      message: "Changed published files: `src/a.js`",
    },
  ];
  const commits = [
    { hash: "a", subject: "fix: x", type: "fix", bump: "patch" as const },
  ];
  assert.equal(
    formatSummary("patch", "major", changes, commits),
    "Commits declare `fix` (patch). Code requires major: removed attribute `ondark` from `<auro-button>`.",
  );
  assert.equal(
    formatSummary("none", "none", [], []),
    "Commits declare no release. Code requires no release.",
  );
});

test("the summary lists at most three reasons", () => {
  const changes: ApiChange[] = ["A", "B", "C", "D", "E"].map((m) => ({
    bump: "minor",
    source: "manifest",
    message: m,
  }));
  assert.match(
    formatSummary("none", "minor", changes, []),
    /requires minor: a; b; c; and 2 more\.$/u,
  );
});
