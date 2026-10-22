/**
 * Git and build plumbing for `auro api-diff`: resolve refs, list commits and
 * changed files, read files at a ref, and rebuild `custom-elements.json` at a ref
 * in a throwaway worktree so the committed copy is never trusted.
 */

import {
  type ChildProcess,
  execFile,
  execFileSync,
  spawn,
} from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Commit } from "./declared.ts";

const execFileAsync = promisify(execFile);

/** Run `git` in `cwd` and return its trimmed stdout. */
export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Resolve a ref (branch, tag, SHA) to a full commit SHA. */
export function resolveRef(cwd: string, ref: string): Promise<string> {
  return git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

/** The best common ancestor of two commits. */
export function mergeBase(cwd: string, a: string, b: string): Promise<string> {
  return git(cwd, ["merge-base", a, b]);
}

/** A file's contents at a commit, or `null` when it doesn't exist there. */
export async function showFile(
  cwd: string,
  sha: string,
  path: string,
): Promise<string | null> {
  try {
    return await git(cwd, ["show", `${sha}:${path}`]);
  } catch {
    return null;
  }
}

/**
 * Paths changed between two commits. Renames are listed as a deletion and an
 * addition, so moving `src/x.js` into `test/` still counts as a change to `src/`.
 */
export async function changedFiles(
  cwd: string,
  base: string,
  head: string,
): Promise<string[]> {
  const out = await git(cwd, [
    "diff",
    "--name-only",
    "--no-renames",
    base,
    head,
  ]);
  return out ? out.split("\n") : [];
}

/** First-line patterns of merge commits, which never affect the version. */
const MERGE_SUBJECT = /^Merge (pull request|branch|remote-tracking branch) /u;

/**
 * The commits in `base..head`, skipping merge commits. Every rebased commit is
 * kept, since each one is analyzed at release. Newest first, the order
 * semantic-release passes them in; its revert filtering depends on it.
 */
export async function listCommits(
  cwd: string,
  base: string,
  head: string,
): Promise<Commit[]> {
  const out = await git(cwd, [
    "log",
    "--no-merges",
    "--format=%H%x1f%B%x1e",
    `${base}..${head}`,
  ]);
  return out
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, message = ""] = entry.split("\x1f");
      return { hash: hash.trim(), message: message.trim() };
    })
    .filter((commit) => !MERGE_SUBJECT.test(commit.message));
}

/** Worktrees being built (directory → repo) and their running commands. */
const activeWorktrees = new Map<string, string>();
const activeChildren = new Set<ChildProcess>();

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/**
 * On Ctrl-C or a cancelled CI job, stop the running build and remove every
 * worktree (each holds a full `node_modules`) before exiting. Synchronous,
 * because the process exits straight after.
 */
function onSignal(signal: NodeJS.Signals): void {
  for (const child of activeChildren) {
    child.kill(signal);
  }
  for (const [dir, cwd] of activeWorktrees) {
    try {
      execFileSync("git", ["worktree", "remove", "--force", dir], {
        cwd,
        stdio: "ignore",
      });
    } catch {
      // Already gone, or git can't remove it; the rm below still cleans up.
    }
    rmSync(dir, { recursive: true, force: true });
  }
  process.exit(128 + (constants.signals[signal] ?? 0));
}

/** Track a worktree so a signal removes it; the handlers live only while one exists. */
function trackWorktree(dir: string, cwd: string): void {
  if (activeWorktrees.size === 0) {
    for (const signal of SIGNALS) {
      process.on(signal, onSignal);
    }
  }
  activeWorktrees.set(dir, cwd);
}

function untrackWorktree(dir: string): void {
  activeWorktrees.delete(dir);
  if (activeWorktrees.size === 0) {
    for (const signal of SIGNALS) {
      process.off(signal, onSignal);
    }
  }
}

/** Run a shell command in `cwd`, capturing output; reject with its tail on failure. */
function runCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HUSKY: "0" },
    });
    activeChildren.add(child);
    const output: string[] = [];
    child.stdout?.on("data", (data) => output.push(String(data)));
    child.stderr?.on("data", (data) => output.push(String(data)));
    child.on("error", (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.on("close", (code) => {
      activeChildren.delete(child);
      if (code === 0) {
        resolve();
        return;
      }
      const tail = output.join("").trim().split("\n").slice(-20).join("\n");
      reject(new Error(`\`${command}\` exited with ${code}\n${tail}`));
    });
  });
}

/** How to install and build a checkout so it writes its manifest. */
export interface BuildCommands {
  install: string;
  build: string;
}

/**
 * Check out `sha` in a temporary worktree, install and build it, and return the
 * parsed manifest at `manifestPath`. The worktree is always removed, including
 * when `worktree add` fails or the process is interrupted.
 */
export async function buildManifestAt(
  cwd: string,
  sha: string,
  manifestPath: string,
  commands: BuildCommands,
): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "auro-api-diff-"));
  trackWorktree(dir, cwd);
  try {
    await git(cwd, ["worktree", "add", "--detach", "--force", dir, sha]);
    await runCommand(commands.install, dir);
    await runCommand(commands.build, dir);
    return JSON.parse(await readFile(join(dir, manifestPath), "utf-8"));
  } finally {
    await git(cwd, ["worktree", "remove", "--force", dir]).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    untrackWorktree(dir);
  }
}
