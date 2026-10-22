/**
 * Classify `package.json` and changed-file differences per the TRD's package.json
 * and changed-files tables (Verifying Release Versions Against Code Changes).
 */

import semver from "semver";
import type { ApiChange } from "./bump.ts";

/** The `package.json` fields the comparison reads. */
export interface PackageJson {
  main?: string;
  types?: string;
  typings?: string;
  exports?: unknown;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: Record<string, string>;
}

/**
 * Flatten `exports` to its subpaths. A string, array or conditions object is the
 * `.` entry; an object whose keys start with `.` maps subpaths directly.
 */
function exportSubpaths(exports: unknown): Set<string> {
  if (exports === undefined || exports === null) {
    return new Set();
  }
  if (typeof exports === "object" && !Array.isArray(exports)) {
    const keys = Object.keys(exports);
    // `{}` exports nothing at all.
    if (keys.every((key) => key.startsWith("."))) {
      return new Set(keys);
    }
  }
  return new Set(["."]);
}

/**
 * The breaking-change line a range targets: its minimum version's major, or
 * `0.<minor>` below 1.0.0, where semver treats a minor bump as breaking.
 */
function breakingLine(range: string): string | null {
  try {
    const min = semver.minVersion(range);
    if (!min) {
      return null;
    }
    return min.major > 0 ? `${min.major}` : `0.${min.minor}`;
  } catch {
    // Non-semver specifiers (git URLs, tags, `file:`) can't be compared.
    return null;
  }
}

/** Report dependencies whose range moved to a new breaking line. */
function diffDependencyMajors(
  label: string,
  base: Record<string, string> = {},
  head: Record<string, string> = {},
): ApiChange[] {
  const changes: ApiChange[] = [];
  for (const [name, headRange] of Object.entries(head)) {
    const baseRange = base[name];
    if (baseRange === undefined) {
      continue;
    }
    const from = breakingLine(baseRange);
    const to = breakingLine(headRange);
    if (from !== null && to !== null && from !== to) {
      changes.push({
        bump: "major",
        source: "package",
        message: `Bumped ${label} \`${name}\` from \`${baseRange}\` to \`${headRange}\``,
      });
    }
  }
  return changes;
}

/** Report engines whose minimum version went up, or that gained a constraint. */
function diffEngines(
  base: Record<string, string> = {},
  head: Record<string, string> = {},
): ApiChange[] {
  const changes: ApiChange[] = [];
  for (const [engine, headRange] of Object.entries(head)) {
    const baseRange = base[engine];
    const what = `engine \`${engine}\``;
    if (baseRange === undefined) {
      changes.push({
        bump: "major",
        source: "package",
        message: `Added ${what} requirement \`${headRange}\``,
      });
      continue;
    }
    let baseMin: semver.SemVer | null = null;
    let headMin: semver.SemVer | null = null;
    try {
      baseMin = semver.minVersion(baseRange);
      headMin = semver.minVersion(headRange);
    } catch {
      continue;
    }
    if (baseMin && headMin && semver.gt(headMin, baseMin)) {
      changes.push({
        bump: "major",
        source: "package",
        message: `Tightened ${what} from \`${baseRange}\` to \`${headRange}\``,
      });
    }
  }
  return changes;
}

/** Classify every published-contract difference between two `package.json` files. */
export function diffPackageJson(
  base: PackageJson,
  head: PackageJson,
): ApiChange[] {
  const changes: ApiChange[] = [];

  const baseExports = exportSubpaths(base.exports);
  const headExports = exportSubpaths(head.exports);
  // Without `exports` every file in the package is importable; adding the field
  // blocks every path it doesn't list.
  const introduced = base.exports === undefined && head.exports !== undefined;
  if (introduced) {
    changes.push({
      bump: "major",
      source: "package",
      message: "Added `exports`, which blocks imports of unlisted paths",
    });
  }
  for (const subpath of baseExports) {
    if (!headExports.has(subpath)) {
      changes.push({
        bump: "major",
        source: "package",
        message: `Removed export \`${subpath}\``,
      });
    }
  }
  for (const subpath of headExports) {
    if (!introduced && !baseExports.has(subpath)) {
      changes.push({
        bump: "minor",
        source: "package",
        message: `Added export \`${subpath}\``,
      });
    }
  }

  for (const field of ["main", "types", "typings"] as const) {
    if (base[field] !== undefined && head[field] === undefined) {
      changes.push({
        bump: "major",
        source: "package",
        message: `Removed \`${field}\` (\`${base[field]}\`)`,
      });
    }
  }

  const headFiles = new Set(head.files ?? []);
  for (const entry of base.files ?? []) {
    if (!headFiles.has(entry)) {
      changes.push({
        bump: "major",
        source: "package",
        message: `Removed \`files\` entry \`${entry}\``,
      });
    }
  }

  changes.push(
    ...diffDependencyMajors(
      "peer dependency",
      base.peerDependencies,
      head.peerDependencies,
    ),
    ...diffDependencyMajors("dependency", base.dependencies, head.dependencies),
    ...diffEngines(base.engines, head.engines),
  );

  return changes;
}

/** Repo paths that are never published, whatever their contents. */
const UNPUBLISHED_PREFIXES = ["test/", "tests/", ".github/", "docs/"];

/** Whether a changed path is under a directory that never ships to npm. */
export function isUnpublishedPath(file: string): boolean {
  return UNPUBLISHED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/**
 * Whether a changed path ships to npm per the TRD: anything under a `src/` or
 * `demo/` directory, or a `README.md`. Matched per path segment so monorepo
 * layouts (`components/<name>/src/…`) count too.
 */
export function isPublishedPath(file: string): boolean {
  if (isUnpublishedPath(file)) {
    return false;
  }
  return /(^|\/)(src|demo)\//u.test(file) || /(^|\/)README\.md$/u.test(file);
}

/**
 * Classify the changed file list: published files require at least a patch;
 * changes confined to tests, CI, docs or other unpublished files require none.
 */
export function diffChangedFiles(files: string[]): ApiChange[] {
  const published = files.filter(isPublishedPath);
  if (published.length === 0) {
    return [];
  }
  const shown = published.slice(0, 5).map((file) => `\`${file}\``);
  const more =
    published.length > shown.length
      ? ` and ${published.length - shown.length} more`
      : "";
  return [
    {
      bump: "patch",
      source: "files",
      message: `Changed published files: ${shown.join(", ")}${more}`,
    },
  ];
}
