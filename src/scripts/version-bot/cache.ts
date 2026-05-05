import fs from "node:fs";
import path from "node:path";
import { withHomeDir } from "#utils/pathUtils.js";
import type { ScanCache, UpgradeCandidate } from "./types.ts";

const VERSION_BOT_DIR = "version-bot";
const SCAN_CACHE_FILE = "auro-deps-by-ecommerce-repo.json";
const UPGRADE_CANDIDATES_FILE = "auro-upgrade-candidates.json";

export function versionBotDir(): string {
  return withHomeDir(VERSION_BOT_DIR);
}

export function scanCachePath(): string {
  return withHomeDir(VERSION_BOT_DIR, SCAN_CACHE_FILE);
}

export function upgradeCandidatesPath(): string {
  return withHomeDir(VERSION_BOT_DIR, UPGRADE_CANDIDATES_FILE);
}

function ensureDir(): void {
  const dir = versionBotDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readScanCache(): ScanCache {
  const file = scanCachePath();
  if (!fs.existsSync(file)) {
    return { version: 1, lastFullScan: null, repos: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ScanCache;
    if (parsed?.version === 1 && parsed.repos) {
      return parsed;
    }
  } catch {
    // Fall through to a fresh cache on malformed JSON.
  }
  return { version: 1, lastFullScan: null, repos: {} };
}

export function writeScanCache(cache: ScanCache): void {
  ensureDir();
  cache.lastFullScan = new Date().toISOString();
  fs.writeFileSync(scanCachePath(), JSON.stringify(cache, null, 2));
}

export function writeUpgradeCandidates(candidates: UpgradeCandidate[]): void {
  ensureDir();
  fs.writeFileSync(
    upgradeCandidatesPath(),
    JSON.stringify(candidates, null, 2),
  );
}

export function readUpgradeCandidates(): UpgradeCandidate[] {
  const file = upgradeCandidatesPath();
  if (!fs.existsSync(file)) {
    throw new Error(
      `Upgrade candidates file not found at ${file}. Run \`auro version-scan\` first.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as UpgradeCandidate[];
}

export function relativeToHome(filePath: string): string {
  const home = path.dirname(path.dirname(filePath));
  return filePath.startsWith(home)
    ? `~${filePath.slice(home.length)}`
    : filePath;
}
