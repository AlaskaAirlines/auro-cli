import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const UNPKG_BASE = "https://unpkg.com";
const REGISTRY_BASE = "https://registry.npmjs.org";

/**
 * Abort a manifest request that stalls. Without this a single connection that
 * is accepted but never answered would hang the CLI indefinitely — `auro cem`
 * fetches every component concurrently via `Promise.all`, so one stalled
 * request would leave the whole command spinning forever.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/** Outcome of resolving a package's Custom Elements Manifest. */
export interface ManifestFetchResult {
  /** The npm package (or `package@tag`) that was requested. */
  target: string;
  /** Parsed custom-elements.json, or null when it could not be resolved. */
  manifest: unknown;
  /** Where the manifest was resolved from, when successful. */
  source?: "local" | "unpkg";
  /** Resolved package version. Currently only known for local reads. */
  version?: string;
  /** Human-readable reason the manifest was unavailable. */
  reason?: string;
  /** True when the failure was transient (network/5xx/parse), not a genuine 404. */
  transient?: boolean;
}

/** Options controlling how a manifest is resolved. */
export interface FetchManifestOptions {
  /**
   * Read an installed copy from the current directory's `node_modules` before
   * falling back to unpkg. Defaults to true. Only applies when `target` has no
   * explicit version/tag — an explicit ref means "exactly this version", which
   * the local install may not match.
   */
  preferLocal?: boolean;
  /**
   * Allow network (unpkg) fetches. Defaults to true. When false, only a local
   * read is attempted and a miss returns a non-transient result.
   */
  allowNetwork?: boolean;
}

/**
 * Split a target into its package name and optional version/tag. The scope's
 * leading `@` (`@scope/name`) is not a separator — only a later `@` is:
 * `@aurodesignsystem/auro-button@3.0.0` → `{ pkg, ref: "3.0.0" }`.
 */
function parseTarget(target: string): { pkg: string; ref?: string } {
  const at = target.lastIndexOf("@");
  if (at > 0) {
    return { pkg: target.slice(0, at), ref: target.slice(at + 1) };
  }
  return { pkg: target };
}

/**
 * Whether `child` resolves to `parent` itself or a path nested inside it —
 * used to keep local reads confined to the intended directory.
 */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Attempt to read an installed package's manifest from the current directory's
 * `node_modules`. Returns null when the package isn't installed, or is installed
 * but ships no manifest (so the caller can fall back to unpkg). The manifest
 * path honors the package's `customElements` field, defaulting to
 * `custom-elements.json`.
 */
async function readLocalManifest(
  pkg: string,
): Promise<ManifestFetchResult | null> {
  const modulesRoot = path.join(process.cwd(), "node_modules");
  const pkgDir = path.join(modulesRoot, ...pkg.split("/"));
  // Defense-in-depth: package names come from the curated static list or the
  // user's own CLI argument (never untrusted network data), but a name with a
  // `..` segment could still resolve outside node_modules — refuse it.
  if (!isInside(modulesRoot, pkgDir)) {
    return null;
  }

  let version: string | undefined;
  let manifestRelPath = "custom-elements.json";
  try {
    const pkgJson = JSON.parse(
      await readFile(path.join(pkgDir, "package.json"), "utf-8"),
    );
    if (typeof pkgJson.version === "string") {
      version = pkgJson.version;
    }
    // The `customElements` field comes from the installed package's own
    // package.json; constrain it to the package directory so a malformed or
    // hostile value can't redirect the read at a file outside the package.
    if (
      typeof pkgJson.customElements === "string" &&
      isInside(pkgDir, path.resolve(pkgDir, pkgJson.customElements))
    ) {
      manifestRelPath = pkgJson.customElements;
    }
  } catch {
    // Not installed (or unreadable package.json) — no local copy.
    return null;
  }

  try {
    const manifest = JSON.parse(
      await readFile(path.join(pkgDir, manifestRelPath), "utf-8"),
    );
    return { target: pkg, manifest, source: "local", version };
  } catch {
    // Installed but ships no manifest — let the caller fall back to unpkg.
    return null;
  }
}

/**
 * Resolve a package's Custom Elements Manifest (`custom-elements.json`),
 * preferring a copy installed in the current directory's `node_modules` (so the
 * API shown matches the version the user actually has) and falling back to
 * unpkg for anything not installed. Never throws — failures are returned as a
 * result so callers can distinguish a genuine absence (404) from a transient
 * error. `target` may be a bare package name (`@aurodesignsystem/auro-button`)
 * or include a dist-tag or version (`@aurodesignsystem/auro-button@latest`).
 */
export async function fetchManifest(
  target: string,
  options: FetchManifestOptions = {},
): Promise<ManifestFetchResult> {
  const { preferLocal = true, allowNetwork = true } = options;
  const { ref } = parseTarget(target);

  // Local-first only when no explicit version/tag was requested.
  if (preferLocal && !ref) {
    const local = await readLocalManifest(target);
    if (local) {
      return { ...local, target };
    }
  }

  if (!allowNetwork) {
    return {
      target,
      manifest: null,
      reason: "not installed locally and network fetching is disabled",
    };
  }

  const url = `${UNPKG_BASE}/${target}/custom-elements.json`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    const message = timedOut
      ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      target,
      manifest: null,
      reason: `request failed (${message})`,
      transient: true,
    };
  }

  if (response.status === 404) {
    return {
      target,
      manifest: null,
      reason: "no custom-elements.json published",
    };
  }

  if (!response.ok) {
    return {
      target,
      manifest: null,
      reason: `HTTP ${response.status}`,
      transient: true,
    };
  }

  try {
    return { target, manifest: await response.json(), source: "unpkg" };
  } catch {
    return {
      target,
      manifest: null,
      reason: "custom-elements.json is not valid JSON",
      transient: true,
    };
  }
}

/** A set of fetch outcomes split by how their failures should be treated. */
export interface OutcomePartition {
  /** Every outcome that yielded no manifest — genuine 404s and transient
   *  failures alike (all are absent from the aggregate). */
  skipped: ManifestFetchResult[];
  /** The subset of skips that failed transiently. Their absence means a manifest
   *  that *should* be present is missing, so any aggregate built from the
   *  remaining sources is incomplete and the run should be treated as failed. */
  transientFailures: ManifestFetchResult[];
}

/**
 * Partition fetch outcomes into those that produced no manifest and, within
 * those, the ones that failed transiently. A genuine 404 is an expected skip
 * (not every package publishes a CEM), whereas a transient failure (network
 * error, timeout, 5xx, unparseable body) means an expected manifest is missing —
 * distinguishing the two lets a caller skip the former but fail on the latter.
 */
export function partitionOutcomes(
  outcomes: ManifestFetchResult[],
): OutcomePartition {
  const skipped = outcomes.filter((outcome) => !outcome.manifest);
  return {
    skipped,
    transientFailures: skipped.filter((outcome) => outcome.transient),
  };
}

/**
 * Fetch the latest published version of a package from the npm registry.
 * Returns null on any failure — staleness reporting is best-effort and must
 * never break the command that calls it.
 */
export async function fetchLatestVersion(pkg: string): Promise<string | null> {
  try {
    const response = await fetch(`${REGISTRY_BASE}/${pkg}/latest`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}
