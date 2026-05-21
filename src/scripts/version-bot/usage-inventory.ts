import { Octokit } from "@octokit/rest";

export interface UsageFileMatch {
  path: string;
  htmlUrl: string;
}

export interface UsageInventory {
  /** Total matching files in the repo (from GitHub's `total_count`). */
  totalCount: number;
  /** First N matches from the search response; surfaced as links in the ticket. */
  sampleFiles: UsageFileMatch[];
  /** Pre-built github.com search URL the reader can click to see all matches. */
  searchUrl: string;
}

const inventoryCache = new Map<string, UsageInventory | null>();

/**
 * Queries GitHub Code Search for files in the consumer repo that reference
 * a given package name. For cross-namespace candidates, searches both the
 * legacy and target package names in a single OR query.
 *
 * Returns null on any failure (missing token, 4xx/5xx, network) — callers
 * should treat null as "skip the usage section in this ticket." A
 * non-null result with totalCount === 0 means the search succeeded but
 * found nothing.
 *
 * Results are cached per (org, repo, packages-key) for the lifetime of
 * the process so multiple candidates for the same (repo, pkg) don't
 * re-hit the API.
 *
 * Rate-limit note: GitHub Code Search authenticated limit is 30
 * requests/min. For a full-org `--apply` (~455 candidates after the
 * 2026-05-13 namespace work) that's ~15 min added to the run. Acceptable
 * for the quarterly cron; negligible for `--apply --limit 1`.
 */
export async function findUsageInRepo(input: {
  org: string;
  repo: string;
  packages: string[];
}): Promise<UsageInventory | null> {
  const { org, repo, packages } = input;
  const packagesKey = packages.slice().sort().join("|");
  const cacheKey = `${org}/${repo}::${packagesKey}`;
  if (inventoryCache.has(cacheKey)) {
    return inventoryCache.get(cacheKey) ?? null;
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    inventoryCache.set(cacheKey, null);
    return null;
  }
  if (packages.length === 0) {
    inventoryCache.set(cacheKey, null);
    return null;
  }

  // GitHub Code Search does NOT honor `OR` as a logical operator —
  // an `a OR b` query treats `OR` as a literal token and effectively ANDs
  // everything, which makes cross-namespace queries return zero hits. So
  // we run one search per package and merge the results. Adds a second
  // API call on cross-namespace candidates only (a minority of total).
  try {
    const octokit = new Octokit({ auth: token });
    const merged = new Map<string, UsageFileMatch>();
    let totalCount = 0;
    let primaryQuery = "";
    for (const pkg of packages) {
      // GitHub auto-excludes node_modules and binary files. Lockfiles and
      // dist bundles still match, which is noise — exclude them explicitly.
      // Also exclude package.json itself (root or workspace-nested) — every
      // candidate by definition has the package in package.json, so listing
      // it adds no information for the reviewer.
      const query =
        `"${pkg}" repo:${org}/${repo}` +
        " -path:package-lock.json -path:yarn.lock -path:pnpm-lock.yaml" +
        " -path:dist -path:build -filename:package.json";
      if (!primaryQuery) primaryQuery = query;
      const result = await octokit.rest.search.code({
        q: query,
        per_page: 10,
      });
      totalCount += result.data.total_count;
      for (const item of result.data.items) {
        if (!merged.has(item.html_url)) {
          merged.set(item.html_url, {
            path: item.path,
            htmlUrl: item.html_url,
          });
        }
      }
    }
    const inventory: UsageInventory = {
      totalCount,
      sampleFiles: [...merged.values()].slice(0, 10),
      searchUrl: `https://github.com/search?q=${encodeURIComponent(primaryQuery)}&type=code`,
    };
    inventoryCache.set(cacheKey, inventory);
    return inventory;
  } catch {
    inventoryCache.set(cacheKey, null);
    return null;
  }
}
