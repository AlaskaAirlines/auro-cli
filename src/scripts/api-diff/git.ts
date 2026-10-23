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
import { existsSync, rmSync } from "node:fs";
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
    killTree(child);
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

/** Whether commands run in their own process group (POSIX only). */
const GROUPED = process.platform !== "win32";

/**
 * Kill a command and everything it started. Commands run through a shell, so
 * the child is `sh` and the real work (`npm ci`) is its child: killing only
 * the shell orphans npm, which keeps writing into the worktree while it's
 * being removed. SIGKILL, because the process exits straight after and nothing
 * may write into the worktree once it's being removed.
 */
function killTree(child: ChildProcess): void {
  try {
    if (GROUPED && child.pid) {
      process.kill(-child.pid, "SIGKILL");
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // Already exited.
  }
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
      // Its own process group, so a signal can stop the whole tree (killTree).
      detached: GROUPED,
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
  /** Installs packages over the checkout's own; the `name@version` list is appended. */
  pin: string;
}

const AURO_CLI = "@aurodesignsystem/auro-cli";
const ANALYZER = "@custom-elements-manifest/analyzer";

/**
 * The packages that write a checkout's manifest. Upgrading them (new plugins,
 * new type formatting) can change the published manifest without any change to
 * the component's code.
 */
export interface Generator {
  auroCli?: string;
  analyzer?: string;
}

/** Where a package is installed in `dir`: hoisted, or nested under auro-cli. */
function packageDir(dir: string, pkg: string): string | null {
  for (const candidate of [
    join(dir, "node_modules", pkg),
    join(dir, "node_modules", AURO_CLI, "node_modules", pkg),
  ]) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return null;
}

async function installedVersion(
  dir: string,
  pkg: string,
): Promise<string | undefined> {
  const at = packageDir(dir, pkg);
  if (!at) {
    return undefined;
  }
  return JSON.parse(await readFile(join(at, "package.json"), "utf-8")).version;
}

/** Whether two generators are different versions. */
export function generatorsDiffer(a: Generator, b: Generator): boolean {
  return a.auroCli !== b.auroCli || a.analyzer !== b.analyzer;
}

/** The generator installed in `dir`, or `null` when neither package is there. */
async function detectGenerator(dir: string): Promise<Generator | null> {
  const auroCli = await installedVersion(dir, AURO_CLI);
  const analyzer = await installedVersion(dir, ANALYZER);
  return auroCli || analyzer ? { auroCli, analyzer } : null;
}

/**
 * The command that writes only the manifest: the repo's own `analyze` script
 * (auro-formkit has one), else the analyzer with auro-cli's config, which is
 * what `auro build` runs. `null` when neither exists (auro-cli before 3.5).
 */
async function manifestCommand(dir: string): Promise<string | null> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
  if (pkg.scripts?.analyze) {
    return "npm run analyze";
  }
  const cliDir = packageDir(dir, AURO_CLI);
  const analyzerDir = packageDir(dir, ANALYZER);
  const config = cliDir
    ? join(cliDir, "dist", "configs", "custom-elements-manifest.config.mjs")
    : null;
  if (!config || !existsSync(config) || !analyzerDir) {
    return null;
  }
  return `node "${join(analyzerDir, "cem.js")}" analyze --config "${config}"`;
}

/**
 * Check out `sha` in a temporary worktree, install and build it, and return the
 * parsed manifest at `manifestPath` and the generator the checkout installed.
 * The worktree is always removed, including when `worktree add` fails or the
 * process is interrupted.
 *
 * With `pin`, those generator versions are installed over the checkout's own
 * and only the manifest is generated, not the full build (which falls back to
 * the full build when the checkout has no way to generate the manifest alone).
 * That shows what the checkout's code produces under another generator.
 */
export async function buildManifestAt(
  cwd: string,
  sha: string,
  manifestPath: string,
  commands: BuildCommands,
  pin?: Generator,
): Promise<{ manifest: unknown; generator: Generator | null }> {
  const dir = await mkdtemp(join(tmpdir(), "auro-api-diff-"));
  trackWorktree(dir, cwd);
  try {
    await git(cwd, ["worktree", "add", "--detach", "--force", dir, sha]);
    await runCommand(commands.install, dir);
    if (pin) {
      const pins = [
        pin.auroCli && `${AURO_CLI}@${pin.auroCli}`,
        pin.analyzer && `${ANALYZER}@${pin.analyzer}`,
      ].filter(Boolean);
      await runCommand(`${commands.pin} ${pins.join(" ")}`, dir);
    }
    const generator = await detectGenerator(dir);
    const generate = pin ? await manifestCommand(dir) : null;
    await runCommand(generate ?? commands.build, dir);
    return {
      manifest: JSON.parse(await readFile(join(dir, manifestPath), "utf-8")),
      generator,
    };
  } finally {
    await git(cwd, ["worktree", "remove", "--force", dir]).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    untrackWorktree(dir);
  }
}
