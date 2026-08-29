/**
 * Git-ignore reconciliation for the files `auro init` writes. Everything the
 * command emits — the grounding files, `auro.config.json`, and the editor
 * IntelliSense artifacts plus their wiring — is meant to be **committed** so a
 * team and CI share one deterministic set. A project `.gitignore` can silently
 * defeat that: `.vscode/` is very commonly ignored, so a `--vscode` run writes
 * `.vscode/auro.html-custom-data.json`, the local editor works, and the file is
 * never committed. This module lets the command detect that and, with consent,
 * repair it.
 *
 * Two functions, both **advisory and non-throwing** (a git hiccup must never
 * break a write that already succeeded):
 *  - {@link findIgnored} — ask git which of the given paths are ignored.
 *  - {@link unignore} — append the minimal `.gitignore` negations to re-include
 *    them, verifying with git that the fix actually took.
 *
 * We defer to `git check-ignore` (via the `simple-git` dependency already used in
 * ../utils/gitUtils.ts) rather than parse `.gitignore` ourselves: it honors nested
 * ignore files, `.git/info/exclude`, global excludes, negations, and the rule that
 * a *tracked* file is never ignored — none of which naive string matching gets
 * right.
 */

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";

/** Header marking the block of entries `auro init` appends to `.gitignore`. */
const GITIGNORE_HEADER =
  "# Added by auro init — keep generated grounding/IntelliSense files tracked";

/**
 * The subset of `paths` (project-root-relative, forward-slash) that git would
 * ignore — i.e. that a plain `git add` would not stage. Returns `[]` when `cwd`
 * is not a git repository, git is unavailable, or `paths` is empty, so callers
 * can treat "no git" as "nothing to warn about". Never throws.
 */
export async function findIgnored(
  cwd: string,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) {
    return [];
  }
  try {
    return await simpleGit({ baseDir: cwd }).checkIgnore(paths);
  } catch {
    // Not a git repo / git missing → ignoring is not in play here.
    return [];
  }
}

/** POSIX dirname of a forward-slash path, or "" for a root-level file. */
function parentDir(rel: string): string {
  const dir = path.posix.dirname(rel);
  return dir === "." ? "" : dir;
}

/**
 * Append `lines` to `<cwd>/.gitignore` (created if absent), preserving a trailing
 * newline. With `dedupe` (the default) any line already present is skipped so
 * re-runs stay idempotent; pass `dedupe: false` for order-sensitive negation
 * blocks whose entries must land in sequence even if an equal line exists earlier
 * (a later match wins in git's last-match-wins rule).
 */
function appendGitignore(cwd: string, lines: string[], dedupe = true): void {
  const gitignoreAbs = path.join(cwd, ".gitignore");
  let current = "";
  try {
    current = readFileSync(gitignoreAbs, "utf-8");
  } catch {
    // Absent → we create it below.
  }
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const toAdd = dedupe
    ? lines.filter((line) => !existing.has(line.trim()))
    : lines;
  if (toAdd.length === 0) {
    return;
  }
  // Separate the appended block from prior content when the file lacks a final \n.
  const prefix = current === "" || current.endsWith("\n") ? "" : "\n";
  appendFileSync(gitignoreAbs, `${prefix}${toAdd.join("\n")}\n`, "utf-8");
}

/**
 * Un-ignore `ignoredPaths` by appending the minimal negations to `.gitignore`,
 * verifying each step with git so the returned result is never optimistic.
 *
 * Two rounds, because a bare `!<file>` cannot re-include a file whose parent
 * *directory* is excluded (a documented git limitation):
 *  1. Append `!<path>` for each ignored path; re-check.
 *  2. For anything still ignored (a parent dir is the culprit), append the
 *     git-documented re-include trio per parent dir — `!<dir>/`, `<dir>/*`,
 *     `!<path>` — where `<dir>/*` preserves the ignore for the dir's other files;
 *     re-check.
 *
 * @returns `fixed` (now tracked) and `unfixable` (git still reports ignored after
 *   both rounds — surfaced to the caller for manual handling, never silently
 *   dropped).
 */
export async function unignore(
  cwd: string,
  ignoredPaths: string[],
): Promise<{ fixed: string[]; unfixable: string[] }> {
  if (ignoredPaths.length === 0) {
    return { fixed: [], unfixable: [] };
  }

  // Round 1 — a simple negation clears a file/glob ignore (`*.json`, a bare name).
  appendGitignore(cwd, [
    GITIGNORE_HEADER,
    ...ignoredPaths.map((rel) => `!${rel}`),
  ]);
  let stillIgnored = await findIgnored(cwd, ignoredPaths);

  // Round 2 — a still-ignored path has an excluded ancestor dir; re-include it,
  // re-exclude its contents (to keep siblings ignored), then re-include the file.
  // Force-append (no dedupe): the `!<path>` must land AFTER `<dir>/*`, but Round 1
  // already wrote `!<path>` earlier — a deduping append would skip it and leave
  // `<dir>/*` as the last match, re-ignoring the file. This block only runs while a
  // path is still ignored, so it never re-executes on an already-fixed re-run.
  if (stillIgnored.length > 0) {
    const trio: string[] = [];
    const seenDirs = new Set<string>();
    for (const rel of stillIgnored) {
      const dir = parentDir(rel);
      if (dir !== "" && !seenDirs.has(dir)) {
        seenDirs.add(dir);
        trio.push(`!${dir}/`, `${dir}/*`);
      }
      trio.push(`!${rel}`);
    }
    appendGitignore(cwd, trio, false);
    stillIgnored = await findIgnored(cwd, ignoredPaths);
  }

  const unfixable = new Set(stillIgnored);
  return {
    fixed: ignoredPaths.filter((rel) => !unfixable.has(rel)),
    unfixable: [...unfixable],
  };
}
