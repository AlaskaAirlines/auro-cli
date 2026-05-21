import { aliasFor } from "./aliases.ts";
import type { SemverParts } from "./types.ts";

const NPM_REGISTRY = "https://registry.npmjs.org";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Fetches the latest published version string for an npm package.
 * Returns null on network failure or unknown package — callers should treat
 * a null result as "skip this package this run."
 */
export async function npmLatest(pkgName: string): Promise<string | null> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(pkgName)}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseSemver(
  value: string | null | undefined,
): SemverParts | null {
  if (!value) {
    return null;
  }
  const stripped = String(value).replace(/^[\^~>=<\s]+/, "");
  const match = stripped.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

export function majorsBehind(pinned: string, latest: string | null): number {
  const p = parseSemver(pinned);
  const l = parseSemver(latest);
  if (!p || !l) {
    return 0;
  }
  return Math.max(0, l.major - p.major);
}

export interface ResolvedLatest {
  /** The npm package name the returned version actually came from. Equals
   *  the input package unless an alias produced a higher version. */
  resolvedPackage: string;
  /** Highest version seen across the input package and its alias (if any),
   *  or null when both lookups failed. */
  version: string | null;
}

/**
 * Like `npmLatest`, but also consults `aliases.ts`. For an
 * `@alaskaairux/*` package with a known `@aurodesignsystem/*` successor,
 * looks up both and returns the higher version. Used by `scan.ts` so a
 * consumer pinned on a legacy-scope package is still cross-checked against
 * its new-scope successor.
 */
export async function resolveLatestAcrossAliases(
  pkgName: string,
): Promise<ResolvedLatest> {
  const alias = aliasFor(pkgName);
  if (!alias) {
    return { resolvedPackage: pkgName, version: await npmLatest(pkgName) };
  }
  const [direct, aliased] = await Promise.all([
    npmLatest(pkgName),
    npmLatest(alias),
  ]);
  if (direct === null && aliased === null) {
    return { resolvedPackage: pkgName, version: null };
  }
  if (direct === null) return { resolvedPackage: alias, version: aliased };
  if (aliased === null) return { resolvedPackage: pkgName, version: direct };
  const cmp = compareSemver(direct, aliased);
  // If either side is unparseable, prefer the aliased (newer scope) version
  // since that's where active development lives.
  if (cmp === null) return { resolvedPackage: alias, version: aliased };
  return cmp < 0
    ? { resolvedPackage: alias, version: aliased }
    : { resolvedPackage: pkgName, version: direct };
}

/**
 * Compares two semver strings. Returns -1 / 0 / 1 in the standard sort order,
 * or null when either side is unparseable.
 */
export function compareSemver(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}
