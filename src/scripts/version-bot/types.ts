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

/**
 * One row per (repository, package) tuple, emitted alongside the
 * upgrade-candidates JSON during each scan. Findings are the
 * backward-looking superset: they include `Current` and (eventually)
 * `Not used` rows that candidates drop, because the rest of the org —
 * dashboards, Backstage panels, the LLM synthesizer, multi-team routing —
 * needs the complete picture, not just the action list.
 *
 * Schema is aligned with auro-scan's compliance model so the two tools
 * can converge on a shared catalog/SQLite store later without a second
 * refactor. Bot-specific fields (manifestPaths, majorsBehind,
 * successorPackage, notes) are additive — auro-scan can ignore them.
 *
 * scanRunId + scannedAt are denormalized per row so the file is forward
 * compatible with the SQLite migration in the recommendation doc (where
 * rows live in a single table joined to a scan_runs table).
 */
export interface ComplianceFinding {
  scanRunId: string;
  scannedAt: string;
  repository: string;
  packageName: string;
  /** Pinned version from package.json (e.g. "^4.0.0"). Worst-case-behind
   *  across manifests when the package appears in more than one. */
  declaredVersion: string;
  /** Resolved version from a lockfile. Null until lockfile parsing lands
   *  (Step 3 in the compliance recommendation). */
  resolvedVersion: string | null;
  /** Policy.targetVersion when the catalog pins a specific target;
   *  otherwise null (the bot is using npm latest as the implicit target). */
  targetVersion: string | null;
  /** Policy.minimumVersion when the catalog sets a floor for support. */
  minimumVersion: string | null;
  status: ComplianceStatus;
  statusReason: string;
  /** Convenience field: 0 when status is Current or for deprecation-style
   *  Unsupported (where comparing the deprecated package's pin against
   *  the successor's version isn't meaningful). */
  majorsBehind: number;
  /** Catalog's replacedBy or the npm resolver's cross-scope alias —
   *  whichever points consumers at the successor package. */
  successorPackage: string | null;
  /** Catalog.notes snapshotted at scan time. Incident context that surfaces
   *  in the ticket body callout. */
  notes: string | null;
  /** Every package.json path inside the repo that pins this package. */
  manifestPaths: string[];
}
