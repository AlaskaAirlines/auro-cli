export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

export interface PackageScan {
  path: string;
  auroDeps: Record<string, string>;
  totalDeps: number;
}

export interface RepoEntry {
  name: string;
  defaultBranch: string;
  pushedAt: string;
  archived: boolean;
  language: string | null;
  scannedAt: string;
  isMonorepo: boolean;
  packages: Record<string, PackageScan>;
  error: string | null;
}

export interface ScanCache {
  version: 1;
  lastFullScan: string | null;
  repos: Record<string, RepoEntry>;
}

export interface UpgradeCandidate {
  repo: string;
  package: string;
  pinned: string;
  latest: string;
  majorsBehind: number;
  repoUrl: string;
}
