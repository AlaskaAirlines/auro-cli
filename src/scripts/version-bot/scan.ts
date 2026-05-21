import { Octokit } from "@octokit/rest";
import ora from "ora";
import { newRunId } from "./audit-log.ts";
import {
  complianceFindingsPath,
  displayPath,
  readScanCache,
  scanCachePath,
  upgradeCandidatesPath,
  writeComplianceFindings,
  writeScanCache,
  writeUpgradeCandidates,
} from "./cache.ts";
import { buildComplianceFindings, evaluateRepoPackage } from "./findings.ts";
import { discoverAuroManifests } from "./manifest-discovery.ts";
import {
  compareSemver,
  type ResolvedLatest,
  resolveLatestAcrossAliases,
} from "./npm-registry.ts";
import { findPackagePolicy } from "./policy-catalog.ts";
import type {
  PackageScan,
  RepoEntry,
  ScanCache,
  UpgradeCandidate,
} from "./types.ts";

const AURO_ORG = "AlaskaAirlines";

interface ScanOptions {
  org: string;
  force: boolean;
  outputDir?: string;
}

interface ScanSummary {
  reposScanned: number;
  reposSkipped: number;
  reposErrored: number;
  candidatesFound: number;
  findingsCount: number;
  cachePath: string;
  candidatesPath: string;
  findingsPath: string;
}

export async function runScan(options: ScanOptions): Promise<ScanSummary> {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    throw new Error("GH_TOKEN environment variable is required");
  }

  const octokit = new Octokit({ auth: ghToken });
  const cache = readScanCache(options.outputDir);

  const archivedSpinner = ora(
    `Listing archived Auro packages in ${AURO_ORG}...`,
  ).start();
  const archivedPackages = await fetchArchivedAuroPackages(octokit);
  archivedSpinner.succeed(
    `Found ${archivedPackages.size / 2} archived Auro repos (excluded from upgrade candidates).`,
  );

  const reposSpinner = ora(`Listing repos in ${options.org}...`).start();
  const repos = await listEcommerceRepos(octokit, options.org);
  reposSpinner.succeed(
    `Found ${repos.length} non-archived, non-fork repos in ${options.org}.`,
  );

  const discoverySpinner = ora(
    `Discovering Auro package.json manifests in ${options.org}...`,
  ).start();
  const discovery = await discoverAuroManifests(octokit, options.org);
  discoverySpinner.succeed(
    `Discovered ${discovery.totalMatches} Auro references across ${discovery.byRepo.size} repos.`,
  );

  // Map listed repos by name so we can filter discovery hits to non-archived
  // non-fork repos only. Anything in discovery but not in this map is implicitly
  // skipped (archived, fork, or otherwise excluded by listEcommerceRepos).
  const reposByName = new Map(repos.map((r) => [r.name, r]));

  let scanned = 0;
  let skipped = 0;
  let errored = 0;

  for (const [repoName, manifestPaths] of discovery.byRepo) {
    const repo = reposByName.get(repoName);
    if (!repo) continue; // archived / fork / outside scope

    const cached = cache.repos[repoName];
    if (
      !options.force &&
      cached?.scannedAt &&
      cached.pushedAt === repo.pushed_at
    ) {
      skipped++;
      continue;
    }

    const repoSpinner = ora(
      `Scanning ${repoName} (${manifestPaths.size} manifest${manifestPaths.size === 1 ? "" : "s"})...`,
    ).start();
    const entry = await scanRepo(octokit, options.org, repo, manifestPaths);
    cache.repos[repoName] = entry;

    if (entry.error) {
      repoSpinner.warn(`${repoName}: ${entry.error}`);
      errored++;
    } else {
      const auroDepCount = countAuroDeps(entry);
      repoSpinner.succeed(
        `${repoName}: ${auroDepCount} Auro deps across ${Object.keys(entry.packages).length} manifest${Object.keys(entry.packages).length === 1 ? "" : "s"}`,
      );
    }
    scanned++;
  }

  // Drop cache entries for repos no longer in discovery. Keeps the cache from
  // accumulating ghosts when a repo drops Auro deps entirely or gets archived.
  for (const cachedName of Object.keys(cache.repos)) {
    if (!discovery.byRepo.has(cachedName)) {
      delete cache.repos[cachedName];
    }
  }

  writeScanCache(cache, options.outputDir);

  const latestByPackage = await resolveLatestVersions(cache, archivedPackages);

  // One scanRunId stamped onto every finding in this run. Forward-compatible
  // with the SQLite migration in the compliance recommendation (rows in a
  // findings table joining to a scan_runs table by this id).
  const scanRunId = newRunId();
  const scannedAt = new Date().toISOString();
  const findings = buildComplianceFindings(
    cache,
    archivedPackages,
    latestByPackage,
    scanRunId,
    scannedAt,
  );
  writeComplianceFindings(findings, options.outputDir);

  const candidates = collapseCandidatesByPackage(
    cache,
    archivedPackages,
    latestByPackage,
    options.org,
  );
  writeUpgradeCandidates(candidates, options.outputDir);

  return {
    reposScanned: scanned,
    reposSkipped: skipped,
    reposErrored: errored,
    candidatesFound: candidates.length,
    findingsCount: findings.length,
    cachePath: displayPath(scanCachePath(options.outputDir)),
    candidatesPath: displayPath(upgradeCandidatesPath(options.outputDir)),
    findingsPath: displayPath(complianceFindingsPath(options.outputDir)),
  };
}

interface RepoSummary {
  name: string;
  default_branch: string;
  pushed_at: string;
  language: string | null;
}

async function listEcommerceRepos(
  octokit: Octokit,
  org: string,
): Promise<RepoSummary[]> {
  const repos: RepoSummary[] = [];
  const iterator = octokit.paginate.iterator(octokit.rest.repos.listForOrg, {
    org,
    per_page: 100,
    type: "all",
  });

  for await (const { data } of iterator) {
    for (const repo of data) {
      if (repo.archived || repo.fork) continue;
      repos.push({
        name: repo.name,
        default_branch: repo.default_branch ?? "main",
        pushed_at: repo.pushed_at ?? "",
        language: repo.language ?? null,
      });
    }
  }

  return repos;
}

async function fetchArchivedAuroPackages(
  octokit: Octokit,
): Promise<Set<string>> {
  const archived = new Set<string>();
  const iterator = octokit.paginate.iterator(octokit.rest.repos.listForOrg, {
    org: AURO_ORG,
    per_page: 100,
    type: "all",
  });

  for await (const { data } of iterator) {
    for (const repo of data) {
      if (!repo.archived) continue;
      archived.add(`@aurodesignsystem/${repo.name}`);
      archived.add(`@alaskaairux/${repo.name}`);
    }
  }

  return archived;
}

async function scanRepo(
  octokit: Octokit,
  org: string,
  repo: RepoSummary,
  manifestPaths: Set<string>,
): Promise<RepoEntry> {
  const entry: RepoEntry = {
    name: repo.name,
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
    archived: false,
    language: repo.language,
    scannedAt: new Date().toISOString(),
    isMonorepo: manifestPaths.size > 1,
    packages: {},
    error: null,
  };

  for (const path of manifestPaths) {
    const manifest = await fetchPackageJson(
      octokit,
      org,
      repo.name,
      path,
      repo.default_branch,
    );
    if (!manifest) continue;
    entry.packages[path] = buildPackageScan(manifest, path);
  }

  // Code Search said this repo had Auro hits, but every fetch missed (renamed
  // file? deleted between index and fetch?). Record a soft error so the run
  // summary surfaces it without crashing the scan.
  if (Object.keys(entry.packages).length === 0) {
    entry.error = "no-manifests-fetched";
  }

  return entry;
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function fetchPackageJson(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<PackageJsonShape | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref,
    });
    if (Array.isArray(response.data) || response.data.type !== "file") {
      return null;
    }
    if (!("content" in response.data) || !response.data.content) {
      return null;
    }
    const raw = Buffer.from(response.data.content, "base64").toString("utf8");
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return null;
  }
}

function buildPackageScan(
  pkg: PackageJsonShape,
  filePath: string,
): PackageScan {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const auroDeps: Record<string, string> = {};
  for (const [name, version] of Object.entries(all)) {
    if (
      name.startsWith("@aurodesignsystem/") ||
      name.startsWith("@alaskaairux/")
    ) {
      auroDeps[name] = version;
    }
  }
  return {
    path: filePath,
    auroDeps,
    totalDeps: Object.keys(all).length,
  };
}

function countAuroDeps(entry: RepoEntry): number {
  let n = 0;
  for (const pkg of Object.values(entry.packages)) {
    n += Object.keys(pkg.auroDeps).length;
  }
  return n;
}

/**
 * Walks the cache once to collect every Auro package name (plus any
 * catalog `replacedBy` successors) and resolves their npm latest in
 * parallel. Returns a map suitable for both `buildComplianceFindings`
 * and `collapseCandidatesByPackage` — the npm calls are the slow part
 * of the run, so we make them once and feed both outputs.
 */
async function resolveLatestVersions(
  cache: ScanCache,
  archivedPackages: Set<string>,
): Promise<Map<string, ResolvedLatest>> {
  const distinctPackages = new Set<string>();
  for (const repoEntry of Object.values(cache.repos)) {
    if (repoEntry.error || repoEntry.archived) continue;
    for (const pkgScan of Object.values(repoEntry.packages)) {
      for (const name of Object.keys(pkgScan.auroDeps)) {
        const policy = findPackagePolicy(name);
        // Archived packages with a catalog deprecation pointer (replacedBy)
        // are NOT skipped — the catalog tells consumers where to migrate, so
        // the ticket is still actionable. Archived without a successor in the
        // catalog stays skipped (we have nothing useful to recommend).
        if (archivedPackages.has(name) && !policy?.replacedBy) continue;
        distinctPackages.add(name);
        // Also resolve the successor's npm latest so deprecation tickets can
        // target it. In practice every successor is already in distinctPackages
        // (consumers declare it directly too), but seeding explicitly removes
        // the dependency on that incidental coverage.
        if (policy?.replacedBy) distinctPackages.add(policy.replacedBy);
      }
    }
  }

  const latestSpinner = ora(
    `Resolving latest npm versions for ${distinctPackages.size} Auro packages...`,
  ).start();
  const names = [...distinctPackages];
  const results = await Promise.all(
    names.map((name) => resolveLatestAcrossAliases(name)),
  );
  const latestByPackage = new Map<string, ResolvedLatest>(
    names.map((name, i) => [name, results[i]]),
  );
  latestSpinner.succeed(
    `Resolved ${latestByPackage.size} package versions on npm.`,
  );
  return latestByPackage;
}

/**
 * Pure helper extracted for testability. Iterates every (repo, manifest,
 * package) tuple in the cache and groups them into one candidate per
 * (repo, package). When the same package appears in multiple manifests
 * within one repo (BFF+Component, monorepos), the lowest pin wins —
 * worst-case-behind drives the ticket urgency — and every manifest path
 * is recorded so the engineer knows to update them all.
 *
 * Without this, multi-manifest repos would generate duplicate ADO tickets
 * that the WIQL dedupe collapses anyway, producing noisy dry-run output
 * and wasted ticket-creation attempts under `--apply`.
 */
export function collapseCandidatesByPackage(
  cache: ScanCache,
  archivedPackages: Set<string>,
  latestByPackage: Map<string, ResolvedLatest>,
  org: string,
): UpgradeCandidate[] {
  const byKey = new Map<string, UpgradeCandidate>();
  for (const repoEntry of Object.values(cache.repos)) {
    if (repoEntry.error || repoEntry.archived) continue;
    for (const pkgScan of Object.values(repoEntry.packages)) {
      for (const [name, pinned] of Object.entries(pkgScan.auroDeps)) {
        const evaluated = evaluateRepoPackage(
          name,
          pinned,
          archivedPackages,
          latestByPackage,
        );
        if (!evaluated) continue;
        // Candidates are the action subset: drop `Current` rows. Findings
        // keep them so dashboards can show "you're on the latest."
        if (evaluated.status === "Current") continue;

        const key = `${repoEntry.name}|${name}`;
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.manifestPaths) existing.manifestPaths = [];
          existing.manifestPaths.push(pkgScan.path);
          // Lower pin wins: re-evaluate the worse case so status,
          // majorsBehind, and statusReason reflect the most out-of-date
          // manifest in the repo.
          if ((compareSemver(pinned, existing.pinned) ?? 0) < 0) {
            const reEval = evaluateRepoPackage(
              name,
              pinned,
              archivedPackages,
              latestByPackage,
            );
            if (reEval && reEval.status !== "Current") {
              existing.pinned = pinned;
              existing.majorsBehind = reEval.majorsBehind;
              existing.status = reEval.status;
              existing.statusReason = reEval.statusReason;
            }
          }
        } else {
          const candidate: UpgradeCandidate = {
            repo: repoEntry.name,
            package: name,
            pinned,
            latest: evaluated.effectiveLatest,
            majorsBehind: evaluated.majorsBehind,
            repoUrl: `https://github.com/${org}/${repoEntry.name}`,
            manifestPaths: [pkgScan.path],
            status: evaluated.status,
            statusReason: evaluated.statusReason,
          };
          if (evaluated.targetPackage) {
            candidate.targetPackage = evaluated.targetPackage;
          }
          if (evaluated.policy?.notes) {
            candidate.notes = evaluated.policy.notes;
          }
          byKey.set(key, candidate);
        }
      }
    }
  }

  return [...byKey.values()];
}
