import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { simpleGit } from "simple-git";
import { findIgnored, unignore } from "../src/init/gitignore.ts";
import { tempCwd } from "./support.ts";

/** Write `contents` to `<cwd>/<rel>`, creating parent dirs as needed. */
function seed(cwd: string, rel: string, contents: string): void {
  const abs = path.join(cwd, ...rel.split("/"));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents, "utf-8");
}

/** Read `<cwd>/.gitignore` as UTF-8. */
function readGitignore(cwd: string): string {
  return readFileSync(path.join(cwd, ".gitignore"), "utf-8");
}

/** A temp cwd that is a real (empty) git repo, so check-ignore has rules to read. */
async function gitRepo(t: TestContext): Promise<string> {
  const cwd = await tempCwd(t);
  await simpleGit({ baseDir: cwd }).init();
  return cwd;
}

test("findIgnored returns [] and does not throw outside a git repo", async (t) => {
  const cwd = await tempCwd(t); // no `git init`
  const ignored = await findIgnored(cwd, ["AGENTS.md", "auro.config.json"]);
  assert.deepEqual(ignored, []);
});

test("findIgnored returns [] for an empty path list", async (t) => {
  const cwd = await gitRepo(t);
  seed(cwd, ".gitignore", "*.json\n");
  assert.deepEqual(await findIgnored(cwd, []), []);
});

test("findIgnored flags glob- and directory-ignored files, not tracked-safe ones", async (t) => {
  const cwd = await gitRepo(t);
  seed(cwd, ".gitignore", "*.json\n.vscode/\n");

  const ignored = await findIgnored(cwd, [
    "AGENTS.md",
    "auro.config.json",
    ".vscode/auro.html-custom-data.json",
  ]);

  assert.ok(ignored.includes("auro.config.json"), "glob ignore is flagged");
  assert.ok(
    ignored.includes(".vscode/auro.html-custom-data.json"),
    "directory ignore is flagged via the file inside it",
  );
  assert.ok(!ignored.includes("AGENTS.md"), "an unignored file is not flagged");
});

test("unignore clears a glob ignore with a plain negation (round 1)", async (t) => {
  const cwd = await gitRepo(t);
  seed(cwd, ".gitignore", "*.json\n");

  const { fixed, unfixable } = await unignore(cwd, ["auro.config.json"]);

  assert.deepEqual(fixed, ["auro.config.json"]);
  assert.deepEqual(unfixable, []);
  assert.match(readGitignore(cwd), /!auro\.config\.json/u);
  // Git itself agrees the file is no longer ignored.
  assert.deepEqual(await findIgnored(cwd, ["auro.config.json"]), []);
});

test("unignore clears a directory ignore with the re-include trio, sparing siblings", async (t) => {
  const cwd = await gitRepo(t);
  seed(cwd, ".gitignore", ".vscode/\n");
  const target = ".vscode/auro.html-custom-data.json";

  const { fixed, unfixable } = await unignore(cwd, [target]);

  assert.deepEqual(fixed, [target]);
  assert.deepEqual(unfixable, []);
  assert.deepEqual(await findIgnored(cwd, [target]), [], "target now tracked");
  // The `.vscode/*` line preserves the ignore for the directory's other files.
  assert.deepEqual(
    await findIgnored(cwd, [".vscode/settings-of-mine.json"]),
    [".vscode/settings-of-mine.json"],
    "an unrelated sibling stays ignored",
  );
});

test("unignore is idempotent — a second call appends nothing and still reports fixed", async (t) => {
  const cwd = await gitRepo(t);
  seed(cwd, ".gitignore", ".vscode/\n");
  const target = ".vscode/auro.html-custom-data.json";

  await unignore(cwd, [target]);
  const afterFirst = readGitignore(cwd);

  const second = await unignore(cwd, [target]);
  assert.deepEqual(second.fixed, [target]);
  assert.deepEqual(second.unfixable, []);
  assert.equal(readGitignore(cwd), afterFirst, "no duplicate entries appended");
});

test("unignore does not restack the round-2 trio for an unfixable path across re-runs", async (t) => {
  const cwd = await gitRepo(t);
  // `a/` is ignored, so a file two levels down can't be re-included: the trio
  // re-includes only its immediate parent `a/b/`, but git won't re-include a
  // subdirectory of an excluded dir. The path stays ignored (unfixable) and so
  // re-enters round 2 on every run — the appended trio must not accumulate.
  seed(cwd, ".gitignore", "a/\n");
  const target = "a/b/auro.config.json";

  const first = await unignore(cwd, [target]);
  assert.deepEqual(first.fixed, [], "the path is genuinely unfixable");
  assert.deepEqual(first.unfixable, [target]);
  const afterFirst = readGitignore(cwd);

  const second = await unignore(cwd, [target]);
  assert.deepEqual(second.unfixable, [target]);
  assert.equal(
    readGitignore(cwd),
    afterFirst,
    "no duplicate trio appended on the re-run",
  );
});

test("unignore creates .gitignore when absent and no-ops on an empty list", async (t) => {
  const cwd = await gitRepo(t);
  const result = await unignore(cwd, []);
  assert.deepEqual(result, { fixed: [], unfixable: [] });
});
