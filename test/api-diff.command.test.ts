/**
 * `auro api-diff` end to end, against throwaway git repos: the merge-base scoping,
 * merge-commit handling, "reconcile dev with main" PRs, rebuilding the manifest in
 * worktrees (and what happens when a ref won't build), and the command's output
 * and exit contract.
 *
 * @see ../src/scripts/api-diff/index.ts
 * @see ../src/commands/api-diff.ts
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runApiDiffCommand } from "../src/commands/api-diff.ts";
import { SHARED_ANALYZER_OPTIONS } from "../src/scripts/api-diff/declared.ts";
import { runApiDiff } from "../src/scripts/api-diff/index.ts";
import {
  captureError,
  captureWrite,
  type ExitError,
  elementManifest,
  mockExit,
  tempCwd,
} from "./support.ts";

/** Run git in `cwd` with a fixed identity and no signing, returning stdout. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf-8" },
  ).trim();
}

/** Write files (relative path → contents; objects are JSON) and commit them. */
async function commit(
  cwd: string,
  message: string,
  files: Record<string, unknown> = {},
): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    const full = path.join(cwd, file);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(
      full,
      typeof contents === "string" ? contents : JSON.stringify(contents),
    );
  }
  git(cwd, "add", "-A");
  git(cwd, "commit", "--allow-empty", "-m", message);
}

/** A button manifest with the given attributes. */
const button = (...attributes: string[]) =>
  elementManifest("auro-button", {
    attributes: attributes.map((name) => ({ name })),
  });

/** The shared rules as the repo's own release config, like a component repo's. */
const RELEASERC = {
  plugins: [["@semantic-release/commit-analyzer", SHARED_ANALYZER_OPTIONS]],
};

const NODE_MODULES = fileURLToPath(new URL("../node_modules", import.meta.url));

/** `git init` a repo with auro-cli's node_modules linked in, as `npm ci` would install them. */
async function initRepo(cwd: string): Promise<void> {
  git(cwd, "init", "-q", "-b", "dev");
  await symlink(NODE_MODULES, path.join(cwd, "node_modules"), "junction");
  await appendFile(path.join(cwd, ".git", "info", "exclude"), "node_modules\n");
}

/**
 * A repo whose `dev` has a committed button manifest with `ondark`, checked out
 * on a new `feature` branch.
 */
async function repo(t: TestContext): Promise<string> {
  const cwd = await tempCwd(t);
  await initRepo(cwd);
  await commit(cwd, "feat: initial release", {
    "package.json": { name: "@aurodesignsystem/auro-button", main: "index.js" },
    ".releaserc.json": RELEASERC,
    "custom-elements.json": button("ondark", "fluid"),
    "src/auro-button.js": "export {};\n",
  });
  git(cwd, "checkout", "-q", "-b", "feature");
  return cwd;
}

const committed = { rebuild: false };

test("a fix that removes an attribute fails: the code requires major", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: drop ondark", {
    "custom-elements.json": button("fluid"),
    "src/auro-button.js": "export const x = 1;\n",
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.required, "major");
  assert.equal(result.declared, "patch");
  assert.equal(result.outcome, "fail");
  assert.deepEqual(result.reasons, [
    "Removed attribute `ondark` from `<auro-button>`",
    "Changed published files: `src/auro-button.js`",
  ]);
  assert.equal(
    result.summary,
    "Commits declare `fix` (patch). Code requires major: removed attribute `ondark` from `<auro-button>`.",
  );
  assert.equal(result.mergeBase, git(cwd, "rev-parse", "dev"));
});

test("declaring more than required passes", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "feat!: rework rendering", {
    "src/auro-button.js": "export const y = 2;\n",
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.required, "patch");
  assert.equal(result.declared, "major");
  assert.equal(result.outcome, "pass");
});

test("a fix that only touches tests warns: no release is required", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: flaky test", { "test/a.test.js": "// x\n" });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.required, "none");
  assert.equal(result.outcome, "warn");
});

test("a chore that changes src/ fails: it would never release", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "chore: tweak", {
    "src/auro-button.js": "export const z = 3;\n",
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.declared, "none");
  assert.equal(result.required, "patch");
  assert.equal(result.outcome, "fail");
});

test("only the PR's own changes count, however far the base has moved", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: small", {
    "src/auro-button.js": "export const a = 1;\n",
  });
  // dev moves on with a breaking change after the branch point.
  git(cwd, "checkout", "-q", "dev");
  await commit(cwd, "feat!: drop fluid", {
    "custom-elements.json": button("ondark"),
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.required, "patch");
  assert.equal(result.declared, "patch");
  assert.deepEqual(
    result.commits.map((c) => c.subject),
    ["fix: small"],
  );
});

test("merge commits are skipped; every rebased commit counts", async (t) => {
  const cwd = await repo(t);
  git(cwd, "checkout", "-q", "-b", "topic");
  await commit(cwd, "docs: a", { "docs/a.md": "a\n" });
  await commit(cwd, "fix: b", { "src/b.js": "b\n" });
  git(cwd, "checkout", "-q", "feature");
  // The PR title in the merge body must not affect the version.
  git(
    cwd,
    "merge",
    "--no-ff",
    "-q",
    "topic",
    "-m",
    "Merge pull request #1 from AlaskaAirlines/topic\n\nfeat!: big change",
  );
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.deepEqual(
    result.commits.map((c) => c.subject),
    ["docs: a", "fix: b"],
  );
  assert.equal(result.declared, "patch");
});

test("a 'reconcile dev with main' PR comes out as no change", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: x", {
    "src/auro-button.js": "export const b = 1;\n",
  });
  git(cwd, "checkout", "-q", "dev");
  git(
    cwd,
    "merge",
    "--no-ff",
    "-q",
    "feature",
    "-m",
    "Merge pull request #2 from x/feature",
  );
  // main is released from an RC pointed at dev, then merged back into dev.
  git(cwd, "checkout", "-q", "-b", "main");
  git(cwd, "checkout", "-q", "-b", "reconcile");
  const result = await runApiDiff("dev", "reconcile", { ...committed, cwd });
  assert.equal(result.required, "none");
  assert.equal(result.declared, "none");
  assert.equal(result.outcome, "pass");
  assert.equal(
    result.summary,
    "Commits declare no release. Code requires no release.",
  );
});

test("package.json changes are classified from the merge base", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: drop main", {
    "package.json": { name: "@aurodesignsystem/auro-button" },
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.deepEqual(result.reasons, ["Removed `main` (`index.js`)"]);
  assert.equal(result.outcome, "fail");
});

test("a missing manifest is a warning, not a failure", async (t) => {
  const cwd = await repo(t);
  git(cwd, "rm", "-q", "custom-elements.json");
  await commit(cwd, "fix: stop committing the manifest", {
    "src/auro-button.js": "export const c = 1;\n",
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.required, "patch");
  assert.match(result.warnings[0], /No custom-elements\.json at the head ref/u);
});

test("moving a published file into test/ still requires a release", async (t) => {
  const cwd = await repo(t);
  await mkdir(path.join(cwd, "test"));
  git(cwd, "mv", "src/auro-button.js", "test/auro-button.js");
  await commit(cwd, "test: move fixture");
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.required, "patch");
  assert.equal(result.outcome, "fail");
  assert.deepEqual(result.reasons, [
    "Changed published files: `src/auro-button.js`",
  ]);
});

test("reading commits with the shared rules is a warning", async (t) => {
  const cwd = await repo(t);
  git(cwd, "rm", "-q", ".releaserc.json");
  await commit(cwd, "fix: drop the release config", {
    "src/auro-button.js": "export const c = 1;\n",
  });
  const result = await runApiDiff("dev", "feature", { ...committed, cwd });
  assert.equal(result.releaseConfig, "default");
  assert.match(result.warnings[0], /shared auro-config rules/u);
});

test("a repo without commit-analyzer installed fails the analysis", async (t) => {
  const cwd = await repo(t);
  await unlink(path.join(cwd, "node_modules"));
  await commit(cwd, "fix: x", {
    "src/auro-button.js": "export const d = 1;\n",
  });
  await assert.rejects(
    runApiDiff("dev", "feature", { ...committed, cwd }),
    /commit-analyzer isn't installed .* run `npm ci` first/u,
  );
});

/** A build script that writes the manifest from `api.json`, like `auro build` does from src/. */
const BUILD_SCRIPT =
  "import { copyFileSync } from 'node:fs'; copyFileSync('api.json', 'built.json');\n";

/** A repo whose manifest is built (and gitignored), not committed. */
async function buildRepo(t: TestContext): Promise<string> {
  const cwd = await tempCwd(t);
  await initRepo(cwd);
  await commit(cwd, "feat: initial release", {
    "package.json": { name: "x", customElements: "built.json" },
    ".releaserc.json": RELEASERC,
    ".gitignore": "built.json\n",
    "build.mjs": BUILD_SCRIPT,
    "api.json": button("ondark"),
    "src/a.js": "a\n",
  });
  git(cwd, "checkout", "-q", "-b", "feature");
  return cwd;
}

const buildCommands = { install: "node -e 0", build: "node build.mjs" };

test("the manifest is rebuilt at both refs in worktrees that are cleaned up", async (t) => {
  const cwd = await buildRepo(t);
  await commit(cwd, "feat: add fluid", {
    "api.json": button("ondark", "fluid"),
    "src/a.js": "b\n",
  });
  const result = await runApiDiff("dev", "feature", {
    cwd,
    commands: buildCommands,
  });
  assert.equal(result.required, "minor");
  assert.equal(result.reasons[0], "Added attribute `fluid` to `<auro-button>`");
  assert.equal(result.outcome, "pass");
  // Only the main worktree remains.
  assert.equal(git(cwd, "worktree", "list").split("\n").length, 1);
});

const REGISTER = new URL("./register.mjs", import.meta.url).href;
const INDEX = new URL("../src/scripts/api-diff/index.ts", import.meta.url).href;

test(
  "an interrupted rebuild still removes its worktree",
  { skip: process.platform === "win32" && "POSIX signals only" },
  async (t) => {
    const cwd = await buildRepo(t);
    await commit(cwd, "feat: add fluid", { "src/a.js": "b\n" });
    const script = path.join(cwd, ".git", "run-api-diff.mjs");
    await writeFile(
      script,
      `import { runApiDiff } from ${JSON.stringify(INDEX)};
const [cwd, hang] = process.argv.slice(2);
await runApiDiff("dev", "feature", { cwd, commands: { install: hang, build: hang } });
`,
    );
    // An install that outlives the test unless the signal stops it.
    const hang = `"${process.execPath}" -e "setTimeout(() => {}, 30000)"`;
    const child = spawn(
      process.execPath,
      ["--import", REGISTER, script, cwd, hang],
      { stdio: "ignore" },
    );
    t.after(() => child.kill("SIGKILL"));

    let worktree: string | undefined;
    for (let i = 0; i < 100 && !worktree; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      worktree = git(cwd, "worktree", "list", "--porcelain")
        .split("\n")
        .filter((line) => line.startsWith("worktree "))[1]
        ?.slice("worktree ".length);
    }
    assert.ok(worktree, "the rebuild never added a worktree");

    child.kill("SIGTERM");
    const [code] = await once(child, "exit");
    assert.equal(code, 143);
    assert.equal(git(cwd, "worktree", "list").split("\n").length, 1);
    assert.equal(existsSync(worktree), false);
  },
);

test("changes confined to tests, CI and docs skip the rebuild", async (t) => {
  const cwd = await buildRepo(t);
  await commit(cwd, "test: more", { "test/a.test.js": "x\n" });
  // A build command that always fails proves nothing was built.
  const result = await runApiDiff("dev", "feature", {
    cwd,
    commands: { install: "node -e 0", build: "node -e process.exit(1)" },
  });
  assert.equal(result.required, "none");
  assert.deepEqual(result.warnings, []);
});

test("a head that won't build fails the analysis (fail closed)", async (t) => {
  const cwd = await buildRepo(t);
  await commit(cwd, "fix: break the build", {
    "build.mjs": "process.exit(1);\n",
  });
  await assert.rejects(
    runApiDiff("dev", "feature", { cwd, commands: buildCommands }),
    /Could not build built\.json at the head ref/u,
  );
});

test("a base that won't build is skipped with a warning (fail open)", async (t) => {
  const cwd = await tempCwd(t);
  await initRepo(cwd);
  await commit(cwd, "feat: initial", {
    "package.json": { name: "x", customElements: "built.json" },
    ".releaserc.json": RELEASERC,
    "build.mjs": "process.exit(1);\n",
    "api.json": button("ondark"),
  });
  git(cwd, "checkout", "-q", "-b", "feature");
  await commit(cwd, "fix: repair the build", {
    "build.mjs": BUILD_SCRIPT,
    "src/a.js": "a\n",
  });
  const result = await runApiDiff("dev", "feature", {
    cwd,
    commands: buildCommands,
  });
  assert.equal(result.required, "patch");
  assert.match(
    result.warnings[0],
    /base ref didn't build and has no committed built\.json/u,
  );
});

/** chdir into `cwd` for the rest of the test. */
function chdir(t: TestContext, cwd: string): void {
  const original = process.cwd();
  process.chdir(cwd);
  t.after(() => process.chdir(original));
}

test("--json writes the result to stdout, required and reasons first", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: drop ondark", {
    "custom-elements.json": button("fluid"),
  });
  chdir(t, cwd);
  const stdout = captureWrite(t, process.stdout);
  await runApiDiffCommand("dev", "feature", { json: true, rebuild: false });
  const result = JSON.parse(stdout());
  assert.deepEqual(Object.keys(result).slice(0, 2), ["required", "reasons"]);
  assert.equal(result.required, "major");
  assert.equal(result.outcome, "fail");
});

test("without --enforce a failing check still exits 0 (report-only)", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: drop ondark", {
    "custom-elements.json": button("fluid"),
  });
  chdir(t, cwd);
  const stderr = captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new Error(`process.exit(${code}) should not have been called`);
  });
  await runApiDiffCommand("dev", "feature", { rebuild: false });
  assert.match(
    stderr(),
    /✖ Commits declare `fix` \(patch\)\. Code requires major/u,
  );
  assert.match(stderr(), /\[major\] Removed attribute `ondark`/u);
});

test("--enforce exits 1 when the declared bump is too low", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: drop ondark", {
    "custom-elements.json": button("fluid"),
  });
  chdir(t, cwd);
  mockExit(t);
  captureError(t);
  await assert.rejects(
    runApiDiffCommand("dev", "feature", { enforce: true, rebuild: false }),
    (err: ExitError) => err.code === 1,
  );
});

test("--enforce passes a warn outcome", async (t) => {
  const cwd = await repo(t);
  await commit(cwd, "fix: test only", { "test/a.test.js": "x\n" });
  chdir(t, cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new Error(`process.exit(${code}) should not have been called`);
  });
  await runApiDiffCommand("dev", "feature", { enforce: true, rebuild: false });
});

test("an analysis error exits 2", async (t) => {
  const cwd = await repo(t);
  chdir(t, cwd);
  mockExit(t);
  const stderr = captureError(t);
  await assert.rejects(
    runApiDiffCommand("no-such-ref", undefined, { json: true, rebuild: false }),
    (err: ExitError) => err.code === 2,
  );
  assert.match(stderr(), /api-diff failed/u);
});
