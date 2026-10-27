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
  type Generator,
  generatorsDiffer,
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
  /**
   * Manifests to compare instead of building or reading them from git, such as
   * the ones published to npm for each version.
   */
  manifests?: { base: Manifest; head: Manifest };
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
  /**
   * The generator (auro-cli and CEM analyzer versions) each rebuilt ref
   * installed, or `null` when nothing was rebuilt.
   */
  generators: { base: Generator | null; head: Generator | null } | null;
  /** Anything that limited the analysis, such as a base that wouldn't build. */
  warnings: string[];
}

export const DEFAULT_COMMANDS: BuildCommands = {
  install: "npm ci --no-audit --no-fund",
  build: "npm run build",
  pin: "npm install --no-save --no-audit --no-fund",
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

/** What {@link loadManifests} loads and how. */
interface LoadOptions {
  baseSha: string;
  headSha: string;
  manifestPath: string;
  rebuild: boolean;
  commands: BuildCommands;
}

/** The loaded manifests, plus what's needed to attribute their differences. */
interface Loaded {
  manifests: { base: Manifest; head: Manifest } | null;
  /** The base rebuilt with the head's generator, when the two differ. */
  baseWithHeadGenerator: Manifest | null;
  generators: { base: Generator | null; head: Generator | null } | null;
}

/**
 * Load the manifests at both refs. With `rebuild`, each ref is built in a
 * throwaway worktree with its own dependencies, so the comparison is between
 * the manifests that actually ship. A head that won't build is an error (fail
 * closed). A base that won't build falls back to its committed manifest, then to
 * skipping the comparison, with a warning either way (fail open): the PR
 * shouldn't be blocked by a base it didn't break.
 *
 * When the refs install different generators (a PR that upgrades auro-cli), the
 * base is built once more with the head's generator, so each change can be
 * attributed to the code or to the upgrade.
 */
async function loadManifests(
  cwd: string,
  options: LoadOptions,
  warnings: string[],
): Promise<Loaded> {
  const { baseSha, headSha, manifestPath, rebuild, commands } = options;
  const committed = async (sha: string) =>
    parseJson<Manifest>(await showFile(cwd, sha, manifestPath));
  const none: Loaded = {
    manifests: null,
    baseWithHeadGenerator: null,
    generators: null,
  };

  if (!rebuild) {
    const head = await committed(headSha);
    const base = await committed(baseSha);
    if (!head || !base) {
      warnings.push(
        `No ${manifestPath} at the ${head ? "base" : "head"} ref, so the public API wasn't compared.`,
      );
      return none;
    }
    return { ...none, manifests: { base, head } };
  }

  let head: { manifest: unknown; generator: Generator | null };
  try {
    head = await buildManifestAt(cwd, headSha, manifestPath, commands);
  } catch (error) {
    throw new Error(
      `Could not build ${manifestPath} at the head ref: ${(error as Error).message}`,
    );
  }

  let base: { manifest: unknown; generator: Generator | null } | null = null;
  try {
    base = await buildManifestAt(cwd, baseSha, manifestPath, commands);
  } catch (error) {
    const fallback = await committed(baseSha);
    warnings.push(
      fallback
        ? `The base ref didn't build, so its committed ${manifestPath} was used: ${(error as Error).message.split("\n")[0]}`
        : `The base ref didn't build and has no committed ${manifestPath}, so the public API wasn't compared.`,
    );
    if (!fallback) {
      return { ...none, generators: { base: null, head: head.generator } };
    }
    base = { manifest: fallback, generator: null };
  }

  let baseWithHeadGenerator: Manifest | null = null;
  if (
    head.generator &&
    base.generator &&
    generatorsDiffer(base.generator, head.generator)
  ) {
    try {
      baseWithHeadGenerator = (
        await buildManifestAt(
          cwd,
          baseSha,
          manifestPath,
          commands,
          head.generator,
        )
      ).manifest as Manifest;
    } catch (error) {
      warnings.push(
        `The base didn't build with the head's generator, so changes couldn't be split between the code and the generator upgrade: ${(error as Error).message.split("\n")[0]}`,
      );
    }
  }

  return {
    manifests: {
      base: base.manifest as Manifest,
      head: head.manifest as Manifest,
    },
    baseWithHeadGenerator,
    generators: { base: base.generator, head: head.generator },
  };
}

/** Describe a generator for messages, e.g. "auro-cli 4.0.0". */
function describeGenerator(generator: Generator | null): string {
  if (!generator) {
    return "unknown";
  }
  return generator.auroCli
    ? `auro-cli ${generator.auroCli}`
    : `analyzer ${generator.analyzer}`;
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
  let generators: Loaded["generators"] = null;
  let fromUpgrade = 0;
  if (files.some((file) => !isUnpublishedPath(file))) {
    const loaded: Loaded = options.manifests
      ? {
          manifests: options.manifests,
          baseWithHeadGenerator: null,
          generators: null,
        }
      : await loadManifests(
          cwd,
          { baseSha: ancestor, headSha: head, manifestPath, rebuild, commands },
          warnings,
        );
    generators = loaded.generators;
    if (loaded.manifests) {
      const shipped = diffManifests(
        loaded.manifests.base,
        loaded.manifests.head,
      );
      if (loaded.baseWithHeadGenerator) {
        // What the code changed: the same generator on both sides. Anything
        // else in the shipped diff came from the generator upgrade.
        const fromCode = new Set(
          diffManifests(
            loaded.baseWithHeadGenerator,
            loaded.manifests.head,
          ).map((change) => change.message),
        );
        for (const change of shipped) {
          change.cause = fromCode.has(change.message) ? "code" : "generator";
        }
        fromUpgrade = shipped.filter((c) => c.cause === "generator").length;
      }
      changes.push(...shipped);
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

  let summary = formatSummary(
    declared.bump,
    required,
    sorted,
    declared.commits,
  );
  if (fromUpgrade > 0 && generators) {
    summary += ` ${fromUpgrade} of the manifest changes come from upgrading ${describeGenerator(generators.base)} to ${describeGenerator(generators.head)}, not from the component's code; they still change the published manifest.`;
  }

  return {
    required,
    reasons: sorted.map((change) => change.message),
    declared: declared.bump,
    outcome: compareBumps(declared.bump, required),
    summary,
    base,
    head,
    mergeBase: ancestor,
    changes: sorted,
    commits: declared.commits,
    releaseConfig: releaseConfig.source,
    generators,
    warnings,
  };
}
