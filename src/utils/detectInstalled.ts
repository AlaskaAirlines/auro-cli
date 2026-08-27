import { AURO_COMPONENT_PACKAGES } from "#static/auroComponents.js";
import type { Manifest } from "#utils/cem.js";
import {
  fetchManifest,
  type ManifestFetchResult,
} from "#utils/fetchManifest.js";

/** A component package resolved from the current project's `node_modules`. */
export interface InstalledComponent {
  /** The installed npm package, e.g. `@aurodesignsystem/auro-button`. */
  pkg: string;
  /** The installed version, read from the package's own `package.json`. */
  version: string;
  /** The package's parsed `custom-elements.json`. */
  manifest: Manifest;
}

/**
 * Pick the locally installed components out of a set of manifest fetch outcomes.
 * Pure and side-effect-free: an outcome counts as installed only when it was
 * resolved from local `node_modules` (`source: "local"`) and carries both a
 * parsed manifest and a version. Shared by {@link detectInstalled} and the
 * `context` command so the "scan node_modules + capture the installed version"
 * rule lives in exactly one place.
 */
export function installedFromOutcomes(
  outcomes: readonly ManifestFetchResult[],
): InstalledComponent[] {
  const installed: InstalledComponent[] = [];
  for (const outcome of outcomes) {
    if (outcome.source === "local" && outcome.manifest && outcome.version) {
      installed.push({
        pkg: outcome.target,
        version: outcome.version,
        manifest: outcome.manifest as Manifest,
      });
    }
  }
  return installed;
}

/**
 * Detect which Auro component packages are installed in the current directory's
 * `node_modules`, capturing each one's installed version and manifest. Local
 * reads only — never hits the network — so the result reflects exactly what the
 * project has installed (the version-pinned set `auro init` grounds against).
 * Defaults to the curated candidate list; pass an explicit set to scope the scan.
 */
export async function detectInstalled(
  packages: readonly string[] = AURO_COMPONENT_PACKAGES,
): Promise<InstalledComponent[]> {
  const outcomes = await Promise.all(
    packages.map((pkg) => fetchManifest(pkg, { allowNetwork: false })),
  );
  return installedFromOutcomes(outcomes);
}
