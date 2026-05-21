import fs from "node:fs";
import path from "node:path";
import type {
  ComplianceFinding,
  ScanCache,
  UpgradeCandidate,
} from "./types.ts";

const SCAN_CACHE_FILE = "auro-deps-by-ecommerce-repo.json";
const UPGRADE_CANDIDATES_FILE = "auro-upgrade-candidates.json";
const COMPLIANCE_FINDINGS_FILE = "auro-compliance-findings.json";

/**
 * Default output dir for the version-bot — project-local under the cwd.
 * Matches the existing `.cache/` convention already in auro-cli's
 * .gitignore. Override at the CLI layer with --output-dir / --candidates.
 */
const DEFAULT_OUTPUT_SUBPATH = path.join(".cache", "version-bot");

export function defaultOutputDir(): string {
  return path.resolve(process.cwd(), DEFAULT_OUTPUT_SUBPATH);
}

function resolveOutputDir(dir?: string): string {
  return dir ? path.resolve(dir) : defaultOutputDir();
}

export function versionBotDir(dir?: string): string {
  return resolveOutputDir(dir);
}

export function scanCachePath(dir?: string): string {
  return path.join(resolveOutputDir(dir), SCAN_CACHE_FILE);
}

export function upgradeCandidatesPath(dir?: string): string {
  return path.join(resolveOutputDir(dir), UPGRADE_CANDIDATES_FILE);
}

export function complianceFindingsPath(dir?: string): string {
  return path.join(resolveOutputDir(dir), COMPLIANCE_FINDINGS_FILE);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readScanCache(dir?: string): ScanCache {
  const file = scanCachePath(dir);
  if (!fs.existsSync(file)) {
    return { version: 2, lastFullScan: null, repos: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ScanCache;
    // v1 caches stored only the repo's root package.json. v2 indexes every
    // matching manifest path (including BFF/Component subdirectories). Older
    // caches are discarded rather than migrated — the next scan rebuilds them.
    if (parsed?.version === 2 && parsed.repos) {
      return parsed;
    }
  } catch {
    // Fall through to a fresh cache on malformed JSON.
  }
  return { version: 2, lastFullScan: null, repos: {} };
}

export function writeScanCache(cache: ScanCache, dir?: string): void {
  ensureDir(resolveOutputDir(dir));
  cache.lastFullScan = new Date().toISOString();
  fs.writeFileSync(scanCachePath(dir), JSON.stringify(cache, null, 2));
}

export function writeUpgradeCandidates(
  candidates: UpgradeCandidate[],
  dir?: string,
): void {
  ensureDir(resolveOutputDir(dir));
  fs.writeFileSync(
    upgradeCandidatesPath(dir),
    JSON.stringify(candidates, null, 2),
  );
}

export function readUpgradeCandidates(dir?: string): UpgradeCandidate[] {
  const file = upgradeCandidatesPath(dir);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Upgrade candidates file not found at ${file}. Run \`auro version-scan\` first.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as UpgradeCandidate[];
}

export function writeComplianceFindings(
  findings: ComplianceFinding[],
  dir?: string,
): void {
  ensureDir(resolveOutputDir(dir));
  fs.writeFileSync(
    complianceFindingsPath(dir),
    JSON.stringify(findings, null, 2),
  );
}

export function readComplianceFindings(dir?: string): ComplianceFinding[] {
  const file = complianceFindingsPath(dir);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Compliance findings file not found at ${file}. Run \`auro version-scan\` first.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as ComplianceFinding[];
}

/**
 * Format a path for human display: prefer cwd-relative when the path is
 * inside the project, fall back to absolute otherwise.
 */
export function displayPath(filePath: string): string {
  const rel = path.relative(process.cwd(), filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return filePath;
  }
  return `./${rel}`;
}
