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
  /**
   * When the upgrade crosses npm scopes (e.g. `@alaskaairux/auro-button` →
   * `@aurodesignsystem/auro-button`), this names the package the consumer
   * should depend on going forward. Omitted when the upgrade stays within
   * the original scope. Cross-scope upgrades require a package.json rename
   * as part of the change; the migration guide calls this out explicitly.
   */
  targetPackage?: string;
}
