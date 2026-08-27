import type { Manifest } from "#utils/cem.js";
import {
  type FetchManifestOptions,
  fetchManifest,
  type ManifestFetchResult,
  partitionOutcomes,
} from "#utils/fetchManifest.js";
import { type ManifestSource, mergeManifests } from "#utils/mergeManifests.js";

/** The aggregated manifest plus the bookkeeping a caller needs to report on it. */
export interface AggregateManifestResult {
  /** The merged, namespaced manifest of every source that resolved. */
  manifest: Manifest;
  /** The per-package manifests that went into the merge. */
  sources: ManifestSource[];
  /** Outcomes that yielded no manifest (genuine 404s and transient alike). */
  skipped: ManifestFetchResult[];
  /** The subset of skips that failed transiently (the aggregate is incomplete). */
  transientFailures: ManifestFetchResult[];
}

/**
 * Fetch each package's Custom Elements Manifest, merge the ones that resolve into
 * a single aggregated manifest, and report what was skipped. Extracted from the
 * `cem` command so the fetch → merge → partition pipeline is reusable (by init's
 * resolver) instead of trapped in the command action. Fetch options pass through
 * to {@link fetchManifest}: `cem` aggregates the canonical published manifests
 * (`preferLocal: false`); init aggregates the installed versions (the default).
 *
 * Never fails on its own — an empty `sources` array still returns a valid (empty)
 * manifest. The caller decides whether zero sources or a transient failure is an
 * error, since that policy differs per command.
 */
export async function buildAggregateManifest(
  packages: readonly string[],
  options: FetchManifestOptions = {},
): Promise<AggregateManifestResult> {
  const outcomes = await Promise.all(
    packages.map((pkg) => fetchManifest(pkg, options)),
  );

  const sources: ManifestSource[] = [];
  for (const outcome of outcomes) {
    if (outcome.manifest) {
      sources.push({
        pkg: outcome.target,
        manifest: outcome.manifest as Manifest,
      });
    }
  }

  const { skipped, transientFailures } = partitionOutcomes(outcomes);
  return {
    manifest: mergeManifests(sources),
    sources,
    skipped,
    transientFailures,
  };
}
