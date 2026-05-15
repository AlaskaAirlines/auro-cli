import type { Octokit } from "@octokit/rest";

const AURO_NAMESPACES = ["@aurodesignsystem", "@alaskaairux"] as const;

export interface ManifestDiscoveryResult {
  byRepo: Map<string, Set<string>>;
  totalMatches: number;
}

/**
 * Discover every package.json in the org that references an Auro namespace.
 *
 * The pre-2026-05-15 scan only read each repo's root `package.json`, so it
 * silently missed BFF+Component patterns (`component/package.json`), microsite
 * subdirectories (`Website/m.alaskaair.com/package.json`), and any monorepo
 * workspace manifest. This function uses GitHub Code Search to find every
 * manifest containing an `@aurodesignsystem` or `@alaskaairux` reference,
 * grouped by repo so the scan can then fetch each one and parse its deps.
 *
 * Notes:
 * - Code Search has a 1000-item hard cap per query. Current org totals are
 *   ~250 matches across both namespaces combined, so headroom is large.
 *   If a single namespace ever crosses 1000, this function silently
 *   undercounts — a follow-up can split queries by path prefix.
 * - Code Search index is eventually consistent (minutes-to-hours lag).
 *   Acceptable for the quarterly scan cadence.
 */
export async function discoverAuroManifests(
  octokit: Octokit,
  org: string,
): Promise<ManifestDiscoveryResult> {
  const byRepo = new Map<string, Set<string>>();
  let totalMatches = 0;

  for (const namespace of AURO_NAMESPACES) {
    const q = `${namespace} org:${org} in:file filename:package.json`;
    const iterator = octokit.paginate.iterator(octokit.rest.search.code, {
      q,
      per_page: 100,
    });

    for await (const { data } of iterator) {
      for (const item of data) {
        totalMatches++;
        const repoName = item.repository?.name;
        const path = item.path;
        if (!repoName || !path) continue;

        const paths = byRepo.get(repoName) ?? new Set<string>();
        paths.add(path);
        byRepo.set(repoName, paths);
      }
    }
  }

  return { byRepo, totalMatches };
}
