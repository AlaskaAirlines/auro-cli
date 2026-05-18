import { type ComplianceStatus, evaluatePackage } from "./evaluate.ts";
import {
  compareSemver,
  majorsBehind,
  type ResolvedLatest,
} from "./npm-registry.ts";
import {
  findPackagePolicy,
  type PackagePolicyRecord,
} from "./policy-catalog.ts";
import type { ComplianceFinding, ScanCache } from "./types.ts";

/**
 * Result of evaluating a single (package, pinned) tuple against the
 * catalog + npm resolver. Shared by candidates and findings — candidates
 * filter out `Current`, findings keep them.
 */
export interface EvaluatedTuple {
  policy: PackagePolicyRecord | undefined;
  /** Successor package name when the candidate should point consumers at
   *  a different package (catalog.replacedBy OR cross-scope alias). */
  targetPackage: string | undefined;
  /** The version the bot recommends — successor's npm latest for
   *  deprecation cases, `policy.targetVersion ?? npm latest` otherwise. */
  effectiveLatest: string;
  majorsBehind: number;
  status: ComplianceStatus;
  statusReason: string;
}

/**
 * Pure per-tuple evaluator. Returns null when the tuple should be
 * dropped entirely (archived without a catalog deprecation pointer, or
 * the relevant version couldn't be resolved on npm). Otherwise returns
 * the evaluated state, including `Current` rows — callers choose whether
 * to surface those.
 *
 * Extracted from scan.ts so candidates and findings share one source of
 * truth for the per-tuple decision: same status logic, same successor
 * pointer, same effectiveLatest computation. Without sharing, the two
 * outputs could drift on, say, the archived-with-replacedBy override or
 * the no-policy fallback to Behind vs Current.
 */
export function evaluateRepoPackage(
  name: string,
  pinned: string,
  archivedPackages: Set<string>,
  latestByPackage: Map<string, ResolvedLatest>,
): EvaluatedTuple | null {
  const policy = findPackagePolicy(name);
  // Defer the archived filter when the catalog points at a successor:
  // the deprecation ticket is the value-add, and the body will direct
  // consumers at policy.replacedBy.
  if (archivedPackages.has(name) && !policy?.replacedBy) return null;

  let targetPackage: string | undefined;
  let effectiveLatest: string;
  if (policy?.replacedBy) {
    const successor = latestByPackage.get(policy.replacedBy);
    if (!successor?.version) return null;
    targetPackage = policy.replacedBy;
    effectiveLatest = successor.version;
  } else {
    const resolved = latestByPackage.get(name);
    if (!resolved?.version) return null;
    // The catalog's targetVersion is the incident knob: when an engineer
    // pins it (off a regressed release), the bot files tickets against
    // that pin instead of npm latest. With no catalog override, the
    // effective target is whatever npm currently calls latest.
    effectiveLatest = policy?.targetVersion ?? resolved.version;
    if (resolved.resolvedPackage !== name) {
      targetPackage = resolved.resolvedPackage;
    }
  }
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

  return {
    policy,
    targetPackage,
    effectiveLatest,
    majorsBehind: mb,
    status,
    statusReason,
  };
}

interface FindingInProgress {
  pinned: string;
  paths: string[];
  evaluated: EvaluatedTuple;
}

/**
 * Walks the cache once, evaluates every (repo, manifest, package) tuple,
 * collapses multi-manifest occurrences to one finding per (repo, package),
 * and returns every row — including `Current` — so downstream readers
 * (dashboards, Backstage, compliance reports) see the full picture, not
 * just the bot's action list.
 *
 * The collapse uses the lowest pin across manifests (worst-case-behind),
 * matching how candidates are produced. That choice means a repo with
 * `^11.5.0` in one manifest and `^7.2.0` in another reports the lower
 * pin's status, and `manifestPaths` carries both.
 */
export function buildComplianceFindings(
  cache: ScanCache,
  archivedPackages: Set<string>,
  latestByPackage: Map<string, ResolvedLatest>,
  scanRunId: string,
  scannedAt: string,
): ComplianceFinding[] {
  const byKey = new Map<string, FindingInProgress>();
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

        const key = `${repoEntry.name}|${name}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.paths.push(pkgScan.path);
          // Lower pin wins: re-evaluate with the worse case so status and
          // majorsBehind reflect the most out-of-date manifest.
          if ((compareSemver(pinned, existing.pinned) ?? 0) < 0) {
            const reEval = evaluateRepoPackage(
              name,
              pinned,
              archivedPackages,
              latestByPackage,
            );
            if (reEval) {
              existing.pinned = pinned;
              existing.evaluated = reEval;
            }
          }
        } else {
          byKey.set(key, { pinned, paths: [pkgScan.path], evaluated });
        }
      }
    }
  }

  const findings: ComplianceFinding[] = [];
  for (const [key, entry] of byKey) {
    const sepIdx = key.indexOf("|");
    const repository = key.slice(0, sepIdx);
    const packageName = key.slice(sepIdx + 1);
    findings.push({
      scanRunId,
      scannedAt,
      repository,
      packageName,
      declaredVersion: entry.pinned,
      resolvedVersion: null,
      targetVersion: entry.evaluated.policy?.targetVersion ?? null,
      minimumVersion: entry.evaluated.policy?.minimumVersion ?? null,
      status: entry.evaluated.status,
      statusReason: entry.evaluated.statusReason,
      majorsBehind: entry.evaluated.majorsBehind,
      successorPackage: entry.evaluated.targetPackage ?? null,
      notes: entry.evaluated.policy?.notes ?? null,
      manifestPaths: entry.paths,
    });
  }
  return findings;
}
