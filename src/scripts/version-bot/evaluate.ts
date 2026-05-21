import type { PackagePolicyRecord } from "./policy-catalog.ts";

export type ComplianceStatus =
  | "Behind"
  | "Current"
  | "Not used"
  | "Review needed"
  | "Unknown"
  | "Unsupported";

export interface EvaluatePackageInput {
  declaredVersion?: string | null;
  detected: boolean;
  hasDeprecatedApiUsage?: boolean;
  packageName: string;
}

export interface EvaluatePackageResult {
  packageName: string;
  reason: string;
  status: ComplianceStatus;
}

const VERSION_RANGE_PREFIX = /^[\^~>=<\s]+/;

const parseVersion = (raw: string): number[] | null => {
  const cleaned = raw.replace(VERSION_RANGE_PREFIX, "").trim();
  const match = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    match[3] !== undefined ? Number.parseInt(match[3], 10) : 0,
  ];
};

const compareVersions = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
};

/**
 * Pure-function compliance evaluator. Ported from auro-scan. Returns a
 * status for the (package, declared version, policy) tuple, with a short
 * human-readable reason that the version-bot surfaces in ticket bodies
 * and (eventually) compliance reports.
 *
 * The version-bot wires this in at scan time per (repo, package, manifest)
 * candidate. When no catalog policy exists for a package, the bot falls
 * back to majorsBehind-driven 'Behind' (handled at the call site, not here).
 */
export const evaluatePackage = (
  input: EvaluatePackageInput,
  policy: PackagePolicyRecord | undefined,
): EvaluatePackageResult => {
  const { declaredVersion, detected, hasDeprecatedApiUsage, packageName } =
    input;

  if (!detected) {
    return {
      packageName,
      reason: "No evidence of this package was found in the repository.",
      status: "Not used",
    };
  }

  if (!policy) {
    return {
      packageName,
      reason: "No policy record exists for this package.",
      status: "Unknown",
    };
  }

  if (policy.replacedBy) {
    return {
      packageName,
      reason: `This package is deprecated. Migrate to ${policy.replacedBy}.`,
      status: "Unsupported",
    };
  }

  if (hasDeprecatedApiUsage) {
    return {
      packageName,
      reason:
        "Deprecated API usage was detected. Review usage and migrate to supported APIs.",
      status: "Review needed",
    };
  }

  if (!declaredVersion) {
    return {
      packageName,
      reason: "Package was detected but no version could be determined.",
      status: "Unknown",
    };
  }

  const version = parseVersion(declaredVersion);
  if (!version) {
    return {
      packageName,
      reason: `Could not parse declared version "${declaredVersion}".`,
      status: "Unknown",
    };
  }

  const { minimumVersion, targetVersion } = policy;

  if (minimumVersion) {
    const minimum = parseVersion(minimumVersion);
    if (minimum && compareVersions(version, minimum) < 0) {
      return {
        packageName,
        reason: `Version ${declaredVersion} is below the minimum supported version ${minimumVersion}.`,
        status: "Unsupported",
      };
    }
  }

  if (targetVersion) {
    const target = parseVersion(targetVersion);
    if (target && compareVersions(version, target) < 0) {
      return {
        packageName,
        reason: `Version ${declaredVersion} is behind the target version ${targetVersion}.`,
        status: "Behind",
      };
    }
  }

  return {
    packageName,
    reason: `Version ${declaredVersion} meets or exceeds the target version${targetVersion ? ` ${targetVersion}` : ""}.`,
    status: "Current",
  };
};
