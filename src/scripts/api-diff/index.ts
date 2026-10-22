/**
 * `auro api-diff` analyzer: works out the smallest version bump the code changes
 * between two refs require, the bump their commits declare, and whether the
 * declaration is high enough.
 *
 * All comparisons start from the merge base of the two refs, so for a pull request
 * only the PR's own changes and commits count, however far its base branch has
 * moved on.
 *
 * @see https://github.com/orgs/AlaskaAirlines/discussions/661
 */

import type { Manifest } from "#utils/cem.js";
import {
  type ApiChange,
  type Bump,
  compareBumps,
  maxBump,
  type Outcome,
  sortChanges,
} from "./bump.ts";
import {
  type DeclaredCommit,
  declaredBump,
  loadAnalyzerConfig,
} from "./declared.ts";
import {
  type BuildCommands,
  buildManifestAt,
  changedFiles,
  listCommits,
  mergeBase,
  resolveRef,
  showFile,
} from "./git.ts";
import { diffManifests } from "./manifest-diff.ts";
import {
  diffChangedFiles,
  diffPackageJson,
  isUnpublishedPath,
  type PackageJson,
} from "./package-diff.ts";

/** Options for {@link runApiDiff}. */
export interface ApiDiffOptions {
  /** Repo to analyze. Defaults to the current directory. */
  cwd?: string;
  /**
   * Rebuild `custom-elements.json` at both refs (the default). When false, the
   * committed copies are compared instead — faster, but only as good as the
   * committed files.
   */
  rebuild?: boolean;
  /** Manifest path relative to the repo root. Defaults to `customElements` in package.json. */
  manifest?: string;
  /** Commands that install and build a checkout so it writes its manifest. */
  commands?: Partial<BuildCommands>;
}

/** The analysis result; `required` and `reasons` lead so the JSON reads well. */
export interface ApiDiffResult {
  /** The smallest bump the code changes require. */
  required: Bump;
  /** Why, highest bump first. */
  reasons: string[];
  /** The bump the commits declare. */
  declared: Bump;
  outcome: Outcome;
  /** One-paragraph summary suitable for a PR comment. */
  summary: string;
  base: string;
  head: string;
  mergeBase: string;
  changes: ApiChange[];
  commits: DeclaredCommit[];
  /** Release config the declared bump was read with (`default` = shared rules). */
  releaseConfig: string;
  /** Anything that limited the analysis, such as a base that wouldn't build. */
  warnings: string[];
}

export const DEFAULT_COMMANDS: BuildCommands = {
  install: "npm ci --no-audit --no-fund",
  build: "npm run build",
};

const DEFAULT_MANIFEST = "custom-elements.json";

/** Parse JSON that may be missing or malformed, returning `null` instead of throwing. */
function parseJson<T>(text: string | null): T | null {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Lower-case the first letter so a reason reads mid-sentence. */
function midSentence(reason: string): string {
  return reason.charAt(0).toLowerCase() + reason.slice(1);
}

/**
 * Summarize the result in the TRD's PR-comment form, e.g. "Commits declare `fix`
 * (patch). Code requires major: removed attribute `ondark` from `<auro-button>`."
 */
export function formatSummary(
  declared: Bump,
  required: Bump,
  changes: ApiChange[],
  commits: DeclaredCommit[],
): string {
  let declaredText = "Commits declare no release.";
  if (declared !== "none") {
    const types = [
      ...new Set(
        commits
          .filter((commit) => commit.bump === declared)
          .map((commit) => commit.type ?? "breaking change"),
      ),
    ];
    const typeText = types.length
      ? types.map((type) => `\`${type}\``).join(", ")
      : "a release";
    declaredText = `Commits declare ${typeText} (${declared}).`;
  }

  if (required === "none") {
    return `${declaredText} Code requires no release.`;
  }
  const reasons = changes
    .filter((change) => change.bump === required)
    .map((change) => midSentence(change.message));
  const shown = reasons.slice(0, 3).join("; ");
  const more = reasons.length > 3 ? `; and ${reasons.length - 3} more` : "";
  return `${declaredText} Code requires ${required}: ${shown}${more}.`;
}

/**
 * Load the manifests at both refs. With `rebuild`, each ref is built in a
 * throwaway worktree. A head that won't build is an error (fail closed). A base
 * that won't build falls back to its committed manifest, then to skipping the
 * comparison, with a warning either way (fail open): the PR shouldn't be blocked
 * by a base it didn't break.
 */
async function loadManifests(
  cwd: string,
  baseSha: string,
  headSha: string,
  manifestPath: string,
  rebuild: boolean,
  commands: BuildCommands,
  warnings: string[],
): Promise<{ base: Manifest; head: Manifest } | null> {
  const committed = async (sha: string) =>
    parseJson<Manifest>(await showFile(cwd, sha, manifestPath));

  let head: Manifest | null;
  if (rebuild) {
    try {
      head = (await buildManifestAt(
        cwd,
        headSha,
        manifestPath,
        commands,
      )) as Manifest;
    } catch (error) {
      throw new Error(
        `Could not build ${manifestPath} at the head ref: ${(error as Error).message}`,
      );
    }
  } else {
    head = await committed(headSha);
  }

  let base: Manifest | null = null;
  if (rebuild) {
    try {
      base = (await buildManifestAt(
        cwd,
        baseSha,
        manifestPath,
        commands,
      )) as Manifest;
    } catch (error) {
      base = await committed(baseSha);
      warnings.push(
        base
          ? `The base ref didn't build, so its committed ${manifestPath} was used: ${(error as Error).message.split("\n")[0]}`
          : `The base ref didn't build and has no committed ${manifestPath}, so the public API wasn't compared.`,
      );
    }
  } else {
    base = await committed(baseSha);
  }

  if (!head) {
    warnings.push(
      `No ${manifestPath} at the head ref, so the public API wasn't compared.`,
    );
    return null;
  }
  if (!base) {
    // A failed rebuild already explained itself above.
    if (!rebuild) {
      warnings.push(
        `No ${manifestPath} at the base ref, so the public API wasn't compared.`,
      );
    }
    return null;
  }
  return { base, head };
}

/** Analyze the changes between `baseRef` and `headRef`. */
export async function runApiDiff(
  baseRef: string,
  headRef = "HEAD",
  options: ApiDiffOptions = {},
): Promise<ApiDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const rebuild = options.rebuild ?? true;
  const commands = { ...DEFAULT_COMMANDS, ...options.commands };
  const warnings: string[] = [];

  const base = await resolveRef(cwd, baseRef);
  const head = await resolveRef(cwd, headRef);
  const ancestor = await mergeBase(cwd, base, head);

  const files = await changedFiles(cwd, ancestor, head);
  const basePkg =
    parseJson<PackageJson>(await showFile(cwd, ancestor, "package.json")) ?? {};
  const headPkg =
    parseJson<PackageJson & { customElements?: string }>(
      await showFile(cwd, head, "package.json"),
    ) ?? {};
  const manifestPath =
    options.manifest ?? headPkg.customElements ?? DEFAULT_MANIFEST;

  // The manifest can only change when something outside tests, CI and docs did,
  // so skip the expensive rebuild otherwise (e.g. "reconcile dev with main" PRs,
  // whose diff from the merge base is empty).
  const changes: ApiChange[] = [];
  if (files.some((file) => !isUnpublishedPath(file))) {
    const manifests = await loadManifests(
      cwd,
      ancestor,
      head,
      manifestPath,
      rebuild,
      commands,
      warnings,
    );
    if (manifests) {
      changes.push(...diffManifests(manifests.base, manifests.head));
    }
  }
  changes.push(
    ...diffPackageJson(basePkg, headPkg),
    ...diffChangedFiles(files),
  );

  const sorted = sortChanges(changes);
  const required = maxBump(sorted.map((change) => change.bump));

  const releaseConfig = loadAnalyzerConfig(cwd);
  const commits = await listCommits(cwd, ancestor, head);
  const declared = await declaredBump(commits, releaseConfig, cwd);
  if (commits.length > 0 && releaseConfig.source === "default") {
    warnings.push(
      "The repo's release config couldn't be resolved, so commits were read with the shared auro-config rules, which may differ from how the repo releases.",
    );
  }

  return {
    required,
    reasons: sorted.map((change) => change.message),
    declared: declared.bump,
    outcome: compareBumps(declared.bump, required),
    summary: formatSummary(declared.bump, required, sorted, declared.commits),
    base,
    head,
    mergeBase: ancestor,
    changes: sorted,
    commits: declared.commits,
    releaseConfig: releaseConfig.source,
    warnings,
  };
}
