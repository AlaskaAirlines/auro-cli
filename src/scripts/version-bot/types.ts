import type { ComplianceStatus } from "./evaluate.ts";

export type { ComplianceStatus };

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
  version: 2;
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
  /**
   * Every package.json path inside the repo that pins this package. The
   * scan always populates at least one entry; the field is optional only
   * to keep pre-v2 candidates JSON files loadable. Multiple entries surface
   * BFF+Component / monorepo cases where the same package is declared in
   * `client/package.json` and `component/package.json` etc. — engineers
   * need to know to update them all. The pinned/majorsBehind fields use
   * the lowest version found across these manifests (worst-case-behind).
   */
  manifestPaths?: string[];
  /**
   * Compliance status from `evaluatePackage`. Optional so pre-compliance
   * candidates JSON files still load; renderers treat absent as `Behind`
   * (the bot's pre-catalog default).
   */
  status?: ComplianceStatus;
  /** Human-readable explanation paired with `status`. */
  statusReason?: string;
  /**
   * Policy `notes` snapshotted at scan time. When set, the ticket body
   * renders an incident callout above the breaking-changes section. Plain
   * text; HTML-escaped at render time.
   */
  notes?: string;
}
