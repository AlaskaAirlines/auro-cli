/**
 * The legacy-standalone → `auro-formkit` migration codemod.
 *
 * A consumer on a legacy standalone form package (`@aurodesignsystem/auro-input`,
 * …) is on the deprecated form of a component that now lives in the
 * `auro-formkit` monorepo. This module detects those dependencies and, on request,
 * rewrites the project onto formkit: it swaps the `package.json` dependency and
 * rewrites the bare import specifiers to the formkit subpath
 * (`@aurodesignsystem/auro-formkit/auro-<x>`).
 *
 * It is intentionally file-in / file-out — no prompting, no network — so the `init`
 * command owns the interactive confirm and the non-interactive/CI guard, and so the
 * codemod is unit-testable against a temp fixture. It is **conservative**: only an
 * exact bare specifier is rewritten; a deep import (`…/auro-input/dist/x.js`) is left
 * untouched and reported, since formkit's deep layout is not a 1:1 remap.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import { SOURCE_GLOB, SOURCE_GLOB_IGNORE } from "#init/registry.js";
import {
  FORMKIT_PACKAGE,
  formkitSubpathFor,
  isLegacyFormkitPackage,
  LEGACY_FORMKIT_PACKAGES,
} from "#static/formkitMigration.js";

/** A legacy standalone package declared in the consumer's `package.json`. */
export interface LegacyDependency {
  /** The standalone package name, e.g. `@aurodesignsystem/auro-input`. */
  pkg: string;
  /** Its declared version range (from `dependencies` or `devDependencies`). */
  version: string;
  /** Which manifest field it was declared in. */
  field: "dependencies" | "devDependencies";
}

/** A deep import the codemod deliberately left in place for manual follow-up. */
export interface SkippedDeepImport {
  /** The source file (relative to `cwd`) containing the import. */
  file: string;
  /** The full deep specifier, e.g. `@aurodesignsystem/auro-input/dist/index.js`. */
  specifier: string;
}

/** What {@link migrateToFormkit} changed, for the caller to report and tests to assert. */
export interface MigrationReport {
  /** Legacy packages removed from `package.json`. */
  packagesMigrated: string[];
  /** Whether `auro-formkit` was newly added or already a dependency. */
  formkit: "added" | "present";
  /** Source files (relative to `cwd`) whose import specifiers were rewritten. */
  filesChanged: string[];
  /** Total bare specifiers rewritten across all files. */
  rewriteCount: number;
  /** Deep imports left untouched — a formkit deep path can't be guessed 1:1. */
  deepImports: SkippedDeepImport[];
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

const PACKAGE_JSON = "package.json";

/** Read and parse `<cwd>/package.json`, or `null` when it is absent. */
function readPackageJson(cwd: string): PackageJson | null {
  let raw: string;
  try {
    raw = readFileSync(path.join(cwd, PACKAGE_JSON), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  try {
    return JSON.parse(raw) as PackageJson;
  } catch {
    throw new Error(`${PACKAGE_JSON}: invalid JSON.`);
  }
}

/**
 * Detect the legacy standalone form packages declared in the consumer's
 * `package.json` (`dependencies` + `devDependencies`). This is authoritative for
 * "installed" — it is exactly what the migration edits — and version-independent:
 * any declared legacy standalone qualifies, regardless of how current it is.
 * Returns `[]` when there is no `package.json`; throws on malformed JSON.
 */
export function detectLegacyFormkit(cwd: string): LegacyDependency[] {
  const pkgJson = readPackageJson(cwd);
  if (!pkgJson) {
    return [];
  }

  const found: LegacyDependency[] = [];
  const fields: LegacyDependency["field"][] = [
    "dependencies",
    "devDependencies",
  ];
  // Iterate the curated legacy list (stable, deterministic order) rather than the
  // manifest's key order, so the report reads the same across projects.
  for (const pkg of LEGACY_FORMKIT_PACKAGES) {
    for (const field of fields) {
      const version = pkgJson[field]?.[pkg];
      if (typeof version === "string") {
        found.push({ pkg, version, field });
        break; // a package in both fields is reported once (dependencies wins)
      }
    }
  }
  return found;
}

/** Escape a string for literal use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite one source file's legacy specifiers to formkit subpaths. An exact bare
 * specifier (`"@aurodesignsystem/auro-input"`, any quote style) is rewritten; a deep
 * specifier (`"@aurodesignsystem/auro-input/…"`) is left in place and returned as a
 * skip. Returns the (possibly unchanged) source, the number of rewrites, and any
 * deep imports seen.
 */
function rewriteSource(
  source: string,
  legacyPkgs: readonly string[],
): { next: string; rewrites: number; deep: string[] } {
  let next = source;
  let rewrites = 0;
  const deep: string[] = [];

  for (const pkg of legacyPkgs) {
    const escaped = escapeRegExp(pkg);
    // Exact bare specifier: quote, package, same quote — the trailing quote rules
    // out any deep `…/dist` path (which has a `/` before the quote).
    const bare = new RegExp(`(['"\`])${escaped}\\1`, "g");
    next = next.replace(bare, (_match, quote: string) => {
      rewrites += 1;
      return `${quote}${formkitSubpathFor(pkg)}${quote}`;
    });

    // Deep specifier: quote, package, `/`, anything but the quote, same quote.
    const deepRe = new RegExp(`(['"\`])(${escaped}/[^'"\`]*)\\1`, "g");
    let deepMatch: RegExpExecArray | null = deepRe.exec(next);
    while (deepMatch !== null) {
      deep.push(deepMatch[2]);
      deepMatch = deepRe.exec(next);
    }
  }

  return { next, rewrites, deep };
}

/**
 * Migrate the project at `cwd` off the given legacy standalone packages and onto
 * `auro-formkit`: remove each from `package.json`, ensure `auro-formkit` is a
 * dependency (added as `"latest"` when absent — the exact version resolves on the
 * user's next `npm install`; an existing formkit version is kept), and rewrite bare
 * legacy import specifiers across the project's source to the formkit subpath.
 *
 * `legacy` is normally {@link detectLegacyFormkit}'s output; only entries that are
 * genuine legacy packages are acted on. Returns a {@link MigrationReport}.
 */
export function migrateToFormkit(
  cwd: string,
  legacy: readonly LegacyDependency[],
): MigrationReport {
  const legacyPkgs = [
    ...new Set(legacy.map((l) => l.pkg).filter(isLegacyFormkitPackage)),
  ];

  const report: MigrationReport = {
    packagesMigrated: [],
    formkit: "present",
    filesChanged: [],
    rewriteCount: 0,
    deepImports: [],
  };
  if (legacyPkgs.length === 0) {
    return report;
  }

  // 1. package.json — swap the legacy deps for auro-formkit.
  const pkgJson = readPackageJson(cwd);
  if (pkgJson) {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const block = pkgJson[field];
      if (!block) {
        continue;
      }
      for (const pkg of legacyPkgs) {
        if (pkg in block) {
          delete block[pkg];
          if (!report.packagesMigrated.includes(pkg)) {
            report.packagesMigrated.push(pkg);
          }
        }
      }
    }

    const alreadyHasFormkit =
      Boolean(pkgJson.dependencies?.[FORMKIT_PACKAGE]) ||
      Boolean(pkgJson.devDependencies?.[FORMKIT_PACKAGE]);
    if (alreadyHasFormkit) {
      report.formkit = "present";
    } else {
      pkgJson.dependencies ??= {};
      pkgJson.dependencies[FORMKIT_PACKAGE] = "latest";
      report.formkit = "added";
    }

    writeFileSync(
      path.join(cwd, PACKAGE_JSON),
      `${JSON.stringify(pkgJson, null, 2)}\n`,
      "utf-8",
    );
  }

  // 2. Source — rewrite bare legacy specifiers to formkit subpaths.
  const files = globSync(SOURCE_GLOB, {
    cwd,
    absolute: true,
    nodir: true,
    ignore: SOURCE_GLOB_IGNORE,
  });
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf-8");
    } catch {
      continue; // unreadable file — skip, mirrors the scanner's tolerance
    }
    const { next, rewrites, deep } = rewriteSource(source, legacyPkgs);
    const rel = path.relative(cwd, file);
    for (const specifier of deep) {
      report.deepImports.push({ file: rel, specifier });
    }
    if (rewrites > 0 && next !== source) {
      writeFileSync(file, next, "utf-8");
      report.filesChanged.push(rel);
      report.rewriteCount += rewrites;
    }
  }

  return report;
}
