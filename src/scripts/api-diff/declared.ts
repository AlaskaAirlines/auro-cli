/**
 * Work out the version bump a set of commits declares, using
 * `@semantic-release/commit-analyzer` as a library with the repo's own release
 * config. The check and the release then read commits identically, including
 * Auro's custom `releaseRules` (`refactor`/`style` → patch, `docs(README)` →
 * patch).
 *
 * The analyzer itself must be installed in the repo, because the result depends
 * on the installed versions too: with `conventional-changelog-conventionalcommits`
 * 7 (which auro-config 1.3.1 pulls in) commit-analyzer 13 ignores the preset's
 * parser options, so a `feat!:` header without a `BREAKING CHANGE:` footer
 * releases nothing. auro-cli doesn't ship its own copy: one could disagree with
 * the release, and its `semantic-release` peer would bloat every `npx` install.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Bump } from "./bump.ts";

const ANALYZER = "@semantic-release/commit-analyzer";

/**
 * The commit-analyzer options in `@aurodesignsystem/auro-config/releaserc`. Used
 * only when the repo's own release config can't be resolved (for example, its
 * dependencies aren't installed), so the check still applies the shared rules.
 */
export const SHARED_ANALYZER_OPTIONS: Record<string, unknown> = {
  preset: "conventionalcommits",
  releaseRules: [
    { type: "docs", scope: "README", release: "patch" },
    { type: "refactor", release: "patch" },
    { type: "style", release: "patch" },
  ],
};

/** A non-merge commit in the range being checked. */
export interface Commit {
  hash: string;
  message: string;
}

/** A commit with the bump it declares on its own. */
export interface DeclaredCommit {
  hash: string;
  subject: string;
  /** The Conventional Commits type, e.g. `fix`, or `null` when unparseable. */
  type: string | null;
  bump: Bump;
}

/** The analyzer options in effect and where they came from. */
export interface AnalyzerConfig {
  options: Record<string, unknown>;
  /** The config file the options were read from, or `default` for the fallback. */
  source: string;
}

type ReleaseConfig = { extends?: string | string[]; plugins?: unknown[] };

/** Read the repo's semantic-release config, if it's in a JSON form we can parse. */
function readRepoReleaseConfig(
  cwd: string,
): { config: ReleaseConfig; file: string } | null {
  for (const file of [".releaserc", ".releaserc.json"]) {
    const path = join(cwd, file);
    if (existsSync(path)) {
      try {
        return { config: JSON.parse(readFileSync(path, "utf-8")), file };
      } catch {
        // A YAML `.releaserc` isn't supported; fall through to the next source.
      }
    }
  }
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
    if (pkg.release && typeof pkg.release === "object") {
      return { config: pkg.release, file: "package.json#release" };
    }
  } catch {
    // No package.json — nothing to read.
  }
  return null;
}

/** The analyzer options from a `plugins` array, if the analyzer is listed. */
function analyzerOptions(
  plugins: unknown[] | undefined,
): Record<string, unknown> | null {
  for (const plugin of plugins ?? []) {
    if (plugin === ANALYZER) {
      return {};
    }
    if (Array.isArray(plugin) && plugin[0] === ANALYZER) {
      return (plugin[1] as Record<string, unknown>) ?? {};
    }
  }
  return null;
}

/**
 * Resolve the commit-analyzer options the repo at `cwd` releases with. Follows
 * `extends` the way semantic-release does: the repo's own `plugins`, when set,
 * replace those of the configs it extends. Falls back to
 * {@link SHARED_ANALYZER_OPTIONS} when nothing resolves.
 */
export function loadAnalyzerConfig(cwd: string): AnalyzerConfig {
  const repo = readRepoReleaseConfig(cwd);
  if (!repo) {
    return { options: SHARED_ANALYZER_OPTIONS, source: "default" };
  }

  const own = analyzerOptions(repo.config.plugins);
  if (own) {
    return { options: own, source: repo.file };
  }
  if (repo.config.plugins) {
    // The repo replaces the plugin list and leaves the analyzer out: it releases
    // nothing from commits, but checking against the shared rules is safer.
    return { options: SHARED_ANALYZER_OPTIONS, source: "default" };
  }

  const require = createRequire(join(cwd, "package.json"));
  const parents = [repo.config.extends ?? []].flat().reverse();
  for (const parent of parents) {
    try {
      const resolved = require.resolve(parent);
      const config = JSON.parse(readFileSync(resolved, "utf-8"));
      const options = analyzerOptions(config.plugins);
      if (options) {
        return { options, source: parent };
      }
    } catch {
      // Not installed, or not JSON — try the next parent.
    }
  }
  return { options: SHARED_ANALYZER_OPTIONS, source: "default" };
}

type AnalyzeCommits =
  typeof import("@semantic-release/commit-analyzer").analyzeCommits;

/**
 * Load commit-analyzer from the repo at `cwd`, so the check reads commits with
 * the exact versions the release will. Throws when it isn't installed.
 */
async function loadAnalyzer(cwd: string): Promise<AnalyzeCommits> {
  let resolved: string;
  try {
    resolved = createRequire(join(cwd, "package.json")).resolve(ANALYZER);
  } catch {
    throw new Error(
      `${ANALYZER} isn't installed in ${cwd}. The declared bump is read with the repo's own analyzer, so the check matches the release; run \`npm ci\` first.`,
    );
  }
  const mod = await import(pathToFileURL(resolved).href);
  return mod.analyzeCommits;
}

/** Commit-analyzer logs every commit it reads; the check reports its own way. */
const silentLogger = { log: () => {} };

/** Normalize the analyzer's result (`null` means no release) to a {@link Bump}. */
function toBump(release: string | null): Bump {
  return release === "major" || release === "minor" || release === "patch"
    ? release
    : "none";
}

/** The Conventional Commits type in a subject line (with any `!`), for display only. */
function commitType(subject: string): string | null {
  const match = /^(\w+)(?:\([^)]*\))?(!?):/u.exec(subject);
  return match ? `${match[1]}${match[2]}` : null;
}

/**
 * Work out the bump the commits declare. `commits` must be newest first, as
 * semantic-release passes them. The overall bump comes from one analyzer pass
 * over every commit, so reverts cancel out exactly as they do at release. Each
 * commit is also analyzed alone, so the report can say which commit declared
 * what; that list is oldest first, for reading. With no commits there's nothing
 * to read, so the analyzer isn't needed.
 */
export async function declaredBump(
  commits: Commit[],
  config: AnalyzerConfig,
  cwd: string,
): Promise<{ bump: Bump; commits: DeclaredCommit[] }> {
  if (commits.length === 0) {
    return { bump: "none", commits: [] };
  }
  const analyzeCommits = await loadAnalyzer(cwd);
  const context = { cwd, logger: silentLogger };
  const bump = toBump(
    await analyzeCommits(config.options, { ...context, commits }),
  );
  const perCommit: DeclaredCommit[] = [];
  for (const commit of [...commits].reverse()) {
    const subject = commit.message.split("\n")[0].trim();
    perCommit.push({
      hash: commit.hash,
      subject,
      type: commitType(subject),
      bump: toBump(
        await analyzeCommits(config.options, { ...context, commits: [commit] }),
      ),
    });
  }
  return { bump, commits: perCommit };
}
