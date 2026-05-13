import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { versionBotDir } from "./cache.ts";
import type { UpgradeCandidate } from "./types.ts";

const AUDIT_LOG_FILE = "run-log.jsonl";

export type AuditAction = "created" | "closed";

export interface AuditEntry {
  runId: string;
  timestamp: string;
  action: AuditAction;
  workItemId: number;
  workItemUrl: string;
  candidate: Pick<
    UpgradeCandidate,
    "repo" | "package" | "pinned" | "latest" | "majorsBehind"
  >;
  /** When action === "created": the work item this one replaces (close-and-recreate path). */
  supersedes?: number;
  /** When action === "closed": the new work item replacing this one. */
  replacedBy?: number;
  /** Optional human-readable note (e.g. cleanup reason). */
  note?: string;
}

export function auditLogPath(dir?: string): string {
  return path.join(versionBotDir(dir), AUDIT_LOG_FILE);
}

/**
 * Generates a sortable, human-readable run id like `20260511T143200-a1b2c3`.
 * The timestamp prefix means `ls -1` lists runs chronologically; the hex
 * suffix disambiguates runs started in the same second.
 */
export function newRunId(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "T",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

export function appendAuditEntry(entry: AuditEntry, dir?: string): void {
  const filePath = auditLogPath(dir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
}

export function readAuditEntries(dir?: string): AuditEntry[] {
  const filePath = auditLogPath(dir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const entries: AuditEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as AuditEntry);
    } catch {
      // Skip malformed lines rather than crashing on a corrupted log.
    }
  }
  return entries;
}

export function readAuditEntriesForRun(
  runId: string,
  dir?: string,
): AuditEntry[] {
  return readAuditEntries(dir).filter((e) => e.runId === runId);
}

export function listRunIds(dir?: string): string[] {
  const seen = new Set<string>();
  for (const entry of readAuditEntries(dir)) {
    seen.add(entry.runId);
  }
  return [...seen].sort();
}

export function lastRunId(dir?: string): string | null {
  const ids = listRunIds(dir);
  return ids.length > 0 ? ids[ids.length - 1] : null;
}
