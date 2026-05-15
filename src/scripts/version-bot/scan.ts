import { Octokit } from "@octokit/rest";
import ora from "ora";
import {
  displayPath,
  readScanCache,
  scanCachePath,
  upgradeCandidatesPath,
  writeScanCache,
  writeUpgradeCandidates,
} from "./cache.ts";
import { type ComplianceStatus, evaluatePackage } from "./evaluate.ts";
import { discoverAuroManifests } from "./manifest-discovery.ts";
import {
  compareSemver,
  majorsBehind,
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
  cachePath: string;
  candidatesPath: string;
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

  const candidates = await buildUpgradeCandidates(
    cache,
    archivedPackages,
    options.org,
  );
  writeUpgradeCandidates(candidates, options.outputDir);

  return {
    reposScanned: scanned,
    reposSkipped: skipped,
    reposErrored: errored,
    candidatesFound: candidates.length,
    cachePath: displayPath(scanCachePath(options.outputDir)),
    candidatesPath: displayPath(upgradeCandidatesPath(options.outputDir)),
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

async function buildUpgradeCandidates(
  cache: ScanCache,
  archivedPackages: Set<string>,
  org: string,
): Promise<UpgradeCandidate[]> {
  const distinctPackages = new Set<string>();
  for (const repoEntry of Object.values(cache.repos)) {
    if (repoEntry.error || repoEntry.archived) continue;
    for (const pkgScan of Object.values(repoEntry.packages)) {
      for (const name of Object.keys(pkgScan.auroDeps)) {
        if (archivedPackages.has(name)) continue;
        distinctPackages.add(name);
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

  return collapseCandidatesByPackage(
    cache,
    archivedPackages,
    latestByPackage,
    org,
  );
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
        if (archivedPackages.has(name)) continue;
        const resolved = latestByPackage.get(name);
        if (!resolved?.version) continue;

        // The catalog's targetVersion is the incident knob: when an engineer
        // pins it (off a regressed release), the bot files tickets against
        // that pin instead of npm latest. With no catalog override, the
        // effective target is whatever npm currently calls latest.
        const policy = findPackagePolicy(name);
        const effectiveLatest = policy?.targetVersion ?? resolved.version;
        const mb = majorsBehind(pinned, effectiveLatest);

        const evalResult = evaluatePackage(
          { packageName: name, detected: true, declaredVersion: pinned },
          policy,
        );
        let status: ComplianceStatus = evalResult.status;
        let statusReason = evalResult.reason;
        // Uncataloged packages default to npm-latest-driven Behind/Current
        // rather than evaluatePackage's literal 'Unknown'. Without this, the
        // first deploy after wiring evaluatePackage in would flood
        // Unknown-tagged tickets for every uncataloged package the bot
        // currently ships tickets for.
        if (!policy) {
          if (mb >= 1) {
            status = "Behind";
            statusReason = `Version ${pinned} is behind npm latest (${effectiveLatest}).`;
          } else {
            status = "Current";
            statusReason = `Version ${pinned} matches the latest published major.`;
          }
        }
        if (status === "Current") continue;

        const key = `${repoEntry.name}|${name}`;
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.manifestPaths) existing.manifestPaths = [];
          existing.manifestPaths.push(pkgScan.path);
          if ((compareSemver(pinned, existing.pinned) ?? 0) < 0) {
            existing.pinned = pinned;
            existing.majorsBehind = mb;
            existing.status = status;
            existing.statusReason = statusReason;
          }
        } else {
          const candidate: UpgradeCandidate = {
            repo: repoEntry.name,
            package: name,
            pinned,
            latest: effectiveLatest,
            majorsBehind: mb,
            repoUrl: `https://github.com/${org}/${repoEntry.name}`,
            manifestPaths: [pkgScan.path],
            status,
            statusReason,
          };
          if (resolved.resolvedPackage !== name) {
            candidate.targetPackage = resolved.resolvedPackage;
          }
          if (policy?.notes) {
            candidate.notes = policy.notes;
          }
          byKey.set(key, candidate);
        }
      }
    }
  }

  return [...byKey.values()];
}
