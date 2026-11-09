import fs from "node:fs/promises";
import path from "node:path";

/**
 * How a consumer pulls a sub-component into its build.
 *
 * - `versioned-tag`: registered under a version-suffixed tag via
 *   `AuroDependencyVersioning.generateTag`, with the version baked in by
 *   `scripts/version.mjs` → `writeDepVersionFile()`.
 * - `extends`: the sub-component's class is imported and subclassed (or
 *   otherwise compiled in) without a versioned tag.
 *
 * Both are compiled into the consumer's bundle, so a release of the
 * sub-component only reaches users once the consumer rebuilds and releases.
 */
export type EdgeKind = "versioned-tag" | "extends";

/** One sub-component a package bundles. */
export interface BundledEdge {
  /** The bundled sub-component's npm package name. */
  package: string;
  kind: EdgeKind;
  /** Semver range declared in the consumer's package.json, when present. */
  range?: string;
  /**
   * Exact version written to `src/<name>Version.js` at the last build. In a
   * monorepo where components disagree, a stale pin wins over an in-range one.
   */
  pinned?: string;
  /**
   * True when a committed `src/<name>Version.js` pins a version outside
   * `range`: the build compiles in the installed version but registers it
   * under the stale version's tag until `npm run build:version` is re-run.
   */
  stale?: boolean;
  /** Monorepo only: the workspace components that bundle this package. */
  via?: string[];
  /** Source files (relative to the repo root) that import the package. */
  files: string[];
}

/** Bundled-dependency facts for a single repo (one published package). */
export interface RepoDeps {
  package: string;
  /** `owner/name` GitHub slug, derived from package.json `repository`. */
  repo?: string;
  bundles: BundledEdge[];
  /**
   * Monorepo only: workspace component → sibling workspace packages it
   * bundles. These ship in the same release, so they never need a cascade, but
   * they explain which component carries each external edge.
   */
  internal?: Record<string, string[]>;
  /** Drift between `scripts/version.mjs` and what `src/` actually imports. */
  warnings: string[];
}

/**
 * `@aurodesignsystem/auro-*` packages that are build tooling rather than
 * components. Imports of these never create a bundled edge.
 */
const TOOLING_PACKAGES = new Set([
  "@aurodesignsystem/auro-library",
  "@aurodesignsystem/auro-cli",
  "@aurodesignsystem/auro-config",
]);

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts"]);
const IMPORT_PATTERN =
  /(?:from\s+|import\s*\(\s*|import\s+)["'](@aurodesignsystem\/auro-[a-z0-9-]+)(?:\/[^"']*)?["']/g;
const VERSION_WRITER_PATTERN = /writeDepVersionFile\(\s*["']([^"']+)["']\s*\)/g;
const VERSION_FILE_PATTERN = /export\s+default\s+["']([^"']+)["']/;

interface PackageJson {
  name?: string;
  repository?: string | { url?: string };
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return undefined;
  }
}

async function listSourceFiles(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files.push(...(await listSourceFiles(full)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

/** `git+https://github.com/AlaskaAirlines/auro-dialog.git` → `AlaskaAirlines/auro-dialog`. */
export function repoSlug(pkg: PackageJson): string | undefined {
  const url =
    typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  return url?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
}

/** Package names passed to `writeDepVersionFile()` in a `version.mjs` script. */
export function parseVersionScript(source: string): string[] {
  return [...source.matchAll(VERSION_WRITER_PATTERN)].map((m) => m[1]);
}

/** Auro component packages imported by a source file (tooling excluded). */
export function parseComponentImports(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    if (!TOOLING_PACKAGES.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

/**
 * Read the version `writeDepVersionFile()` baked into `src/<name>Version.js`.
 * Mirrors its naming: the file name is the package name after `auro-`.
 */
async function readPinnedVersion(
  unitDir: string,
  pkg: string,
): Promise<string | undefined> {
  const subName = pkg.substring(pkg.indexOf("auro-") + "auro-".length);
  const source = await readText(
    path.join(unitDir, "src", `${subName}Version.js`),
  );
  return source?.match(VERSION_FILE_PATTERN)?.[1];
}

/**
 * Whether `version` satisfies `range`, for the range forms Auro package.json
 * files use: `^x.y.z`, `~x.y.z`, an exact `x.y.z`, or `*`. Returns `undefined`
 * for anything else (or prerelease versions) so callers skip rather than guess.
 */
export function satisfiesRange(
  version: string,
  range: string,
): boolean | undefined {
  const parse = (v: string) => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : undefined;
  };
  const trimmed = range.trim();
  if (trimmed === "*" || trimmed === "") return true;

  const actual = parse(version);
  const operator = trimmed.match(/^[\^~]/)?.[0] ?? "";
  const base = parse(trimmed.slice(operator.length));
  if (!actual || !base) return undefined;

  const [major, minor, patch] = actual;
  const [baseMajor, baseMinor, basePatch] = base;
  const atLeastBase =
    major > baseMajor ||
    (major === baseMajor &&
      (minor > baseMinor || (minor === baseMinor && patch >= basePatch)));
  if (!atLeastBase) return false;

  if (operator === "") {
    return major === baseMajor && minor === baseMinor && patch === basePatch;
  }
  if (operator === "~") return major === baseMajor && minor === baseMinor;
  // Caret: the left-most non-zero component is locked.
  if (baseMajor > 0) return major === baseMajor;
  if (baseMinor > 0) return major === 0 && minor === baseMinor;
  return major === 0 && minor === 0 && patch === basePatch;
}

function declaredRange(
  pkg: string,
  ...manifests: (PackageJson | undefined)[]
): string | undefined {
  for (const manifest of manifests) {
    const range =
      manifest?.dependencies?.[pkg] ??
      manifest?.peerDependencies?.[pkg] ??
      manifest?.devDependencies?.[pkg];
    if (range) return range;
  }
  return undefined;
}

/** A buildable unit: a standalone repo, or one workspace component of a monorepo. */
interface Unit {
  dir: string;
  manifest: PackageJson;
}

interface UnitScan {
  name: string;
  /** Imported component package → importing files (relative to repo root). */
  imports: Map<string, string[]>;
  versioned: Set<string>;
}

async function scanUnit(repoRoot: string, unit: Unit): Promise<UnitScan> {
  const name = unit.manifest.name ?? path.basename(unit.dir);
  const imports = new Map<string, string[]>();

  for (const file of await listSourceFiles(path.join(unit.dir, "src"))) {
    const source = await readText(file);
    if (!source) continue;
    for (const pkg of parseComponentImports(source)) {
      if (pkg === name) continue;
      const files = imports.get(pkg) ?? [];
      files.push(path.relative(repoRoot, file));
      imports.set(pkg, files);
    }
  }

  const versionScript = await readText(
    path.join(unit.dir, "scripts", "version.mjs"),
  );
  const versioned = new Set(
    versionScript ? parseVersionScript(versionScript) : [],
  );

  return { name, imports, versioned };
}

async function listWorkspaceComponents(repoRoot: string): Promise<Unit[]> {
  const componentsDir = path.join(repoRoot, "components");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(componentsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const units: Unit[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(componentsDir, entry.name);
    const manifest = await readJson<PackageJson>(
      path.join(dir, "package.json"),
    );
    if (manifest?.name) units.push({ dir, manifest });
  }
  return units.sort((a, b) => a.manifest.name!.localeCompare(b.manifest.name!));
}

/**
 * Extract the Auro components a repo bundles into its build.
 *
 * An edge exists when `src/` imports an `@aurodesignsystem/auro-*` component
 * package, or `scripts/version.mjs` writes a version file for one. Monorepos
 * (a `components/*` workspace, e.g. auro-formkit) are scanned per component:
 * imports of sibling workspaces become `internal` edges, everything else is
 * rolled up to the repo's published package with `via` naming the carriers.
 *
 * Returns `undefined` when the directory has no package.json.
 */
export async function extractBundledDeps(
  repoRoot: string,
): Promise<RepoDeps | undefined> {
  const rootManifest = await readJson<PackageJson>(
    path.join(repoRoot, "package.json"),
  );
  if (!rootManifest?.name) return undefined;

  const workspaceUnits = await listWorkspaceComponents(repoRoot);
  const isMonorepo = workspaceUnits.length > 0;
  const units = isMonorepo
    ? workspaceUnits
    : [{ dir: repoRoot, manifest: rootManifest }];
  const siblings = new Set(workspaceUnits.map((u) => u.manifest.name!));

  const edges = new Map<string, BundledEdge>();
  const internal: Record<string, string[]> = {};
  const warnings: string[] = [];

  for (const unit of units) {
    const scan = await scanUnit(repoRoot, unit);
    const label = isMonorepo
      ? `${rootManifest.name} (${scan.name})`
      : scan.name;

    for (const pkg of scan.versioned) {
      if (!scan.imports.has(pkg)) {
        warnings.push(
          `${label}: scripts/version.mjs writes a version for ${pkg}, but src/ never imports it.`,
        );
      }
    }

    const internalDeps: string[] = [];
    for (const [pkg, files] of [...scan.imports].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (siblings.has(pkg)) {
        internalDeps.push(pkg);
        continue;
      }

      const kind: EdgeKind = scan.versioned.has(pkg)
        ? "versioned-tag"
        : "extends";
      const range = declaredRange(pkg, unit.manifest, rootManifest);
      const pinned = await readPinnedVersion(unit.dir, pkg);
      const stale =
        pinned !== undefined &&
        range !== undefined &&
        satisfiesRange(pinned, range) === false;
      if (stale) {
        const subName = pkg.substring(pkg.indexOf("auro-") + "auro-".length);
        warnings.push(
          `${label}: src/${subName}Version.js pins ${pkg}@${pinned}, outside the declared range ${range}. Run \`npm run build:version\` and commit the result.`,
        );
      }

      const existing = edges.get(pkg);
      if (existing) {
        existing.files.push(...files);
        if (kind === "versioned-tag") existing.kind = kind;
        if (stale) {
          // Surface the out-of-range pin, not an in-range sibling's.
          existing.stale = true;
          existing.pinned = pinned;
        } else if (!existing.stale) {
          existing.pinned ??= pinned;
        }
        if (isMonorepo) existing.via!.push(scan.name);
        continue;
      }

      edges.set(pkg, {
        package: pkg,
        kind,
        range,
        pinned,
        ...(stale ? { stale: true } : {}),
        ...(isMonorepo ? { via: [scan.name] } : {}),
        files: [...files],
      });
    }

    if (isMonorepo && internalDeps.length > 0) {
      internal[scan.name] = internalDeps;
    }
  }

  for (const edge of edges.values()) {
    edge.files.sort();
    if (edge.pinned === undefined) delete edge.pinned;
    if (edge.range === undefined) delete edge.range;
  }

  return {
    package: rootManifest.name,
    repo: repoSlug(rootManifest),
    bundles: [...edges.values()].sort((a, b) =>
      a.package.localeCompare(b.package),
    ),
    ...(isMonorepo ? { internal } : {}),
    warnings,
  };
}

/**
 * Scan every immediate subdirectory of `workspaceDir` (e.g. a folder of Auro
 * checkouts) and extract bundled deps for each `@aurodesignsystem` package.
 * Tooling repos are skipped: they ship no components, and their templates
 * mention component imports as text.
 */
export async function extractFromWorkspace(
  workspaceDir: string,
): Promise<RepoDeps[]> {
  const entries = await fs.readdir(workspaceDir, { withFileTypes: true });
  const results: RepoDeps[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const deps = await extractBundledDeps(path.join(workspaceDir, entry.name));
    if (
      deps?.package.startsWith("@aurodesignsystem/") &&
      !TOOLING_PACKAGES.has(deps.package)
    ) {
      results.push(deps);
    }
  }
  return results.sort((a, b) => a.package.localeCompare(b.package));
}
