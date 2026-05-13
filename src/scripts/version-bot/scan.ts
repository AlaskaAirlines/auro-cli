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
import {
  majorsBehind,
  type ResolvedLatest,
  resolveLatestAcrossAliases,
} from "./npm-registry.ts";
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

  let scanned = 0;
  let skipped = 0;
  let errored = 0;

  for (const repo of repos) {
    const cached = cache.repos[repo.name];
    if (
      !options.force &&
      cached?.scannedAt &&
      cached.pushedAt === repo.pushed_at
    ) {
      skipped++;
      continue;
    }

    const repoSpinner = ora(`Scanning ${repo.name}...`).start();
    const entry = await scanRepo(octokit, options.org, repo);
    cache.repos[repo.name] = entry;

    if (entry.error) {
      if (entry.error === "no-package-json") {
        repoSpinner.info(`${repo.name}: no package.json (skipped)`);
      } else {
        repoSpinner.warn(`${repo.name}: ${entry.error}`);
        errored++;
      }
    } else {
      const auroDepCount = countAuroDeps(entry);
      repoSpinner.succeed(`${repo.name}: ${auroDepCount} Auro deps`);
    }
    scanned++;
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
): Promise<RepoEntry> {
  const entry: RepoEntry = {
    name: repo.name,
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
    archived: false,
    language: repo.language,
    scannedAt: new Date().toISOString(),
    isMonorepo: false,
    packages: {},
    error: null,
  };

  const root = await fetchPackageJson(
    octokit,
    org,
    repo.name,
    "package.json",
    repo.default_branch,
  );
  if (!root) {
    entry.error = "no-package-json";
    return entry;
  }

  entry.packages["."] = buildPackageScan(root, "package.json");
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

  const candidates: UpgradeCandidate[] = [];
  for (const repoEntry of Object.values(cache.repos)) {
    if (repoEntry.error || repoEntry.archived) continue;
    for (const pkgScan of Object.values(repoEntry.packages)) {
      for (const [name, pinned] of Object.entries(pkgScan.auroDeps)) {
        if (archivedPackages.has(name)) continue;
        const resolved = latestByPackage.get(name);
        if (!resolved?.version) continue;
        const mb = majorsBehind(pinned, resolved.version);
        if (mb < 1) continue;
        const candidate: UpgradeCandidate = {
          repo: repoEntry.name,
          package: name,
          pinned,
          latest: resolved.version,
          majorsBehind: mb,
          repoUrl: `https://github.com/${org}/${repoEntry.name}`,
        };
        if (resolved.resolvedPackage !== name) {
          candidate.targetPackage = resolved.resolvedPackage;
        }
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}
