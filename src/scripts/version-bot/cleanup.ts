import chalk from "chalk";
import ora from "ora";
import { closeADOWorkItem } from "#scripts/ado/index.ts";
import {
  type AuditEntry,
  appendAuditEntry,
  lastRunId,
  listRunIds,
  newRunId,
  readAuditEntries,
  readAuditEntriesForRun,
} from "./audit-log.ts";

export interface CleanupOptions {
  /** If true, do real ADO writes. Defaults false (dry-run). */
  apply: boolean;
  /** Specific run id to clean up. Mutually exclusive with `last`. */
  runId?: string;
  /** When true, resolve to the most recent run id from the audit log. */
  last?: boolean;
  /** When true, just list available run ids and exit. */
  list?: boolean;
}

export interface CleanupSummary {
  /** The new run id under which cleanup actions are recorded. */
  cleanupRunId: string;
  /** The run id being cleaned up (the original `--apply` run). */
  targetRunId: string | null;
  candidates: number;
  closed: number;
  skipped: number;
  failed: number;
}

/**
 * Resolves the target run id from the options, surfacing helpful errors
 * when the log is empty or the id isn't found.
 */
function resolveTargetRunId(options: CleanupOptions): string {
  if (options.runId && options.last) {
    throw new Error("Pass either --run-id <id> or --last, not both.");
  }
  if (options.last) {
    const id = lastRunId();
    if (!id) {
      throw new Error(
        "No prior runs found in the audit log (no `version-tickets --apply` has run yet).",
      );
    }
    return id;
  }
  if (!options.runId) {
    throw new Error(
      "Pass --run-id <id> to target a specific run, or --last for the most recent.",
    );
  }
  const known = new Set(listRunIds());
  if (!known.has(options.runId)) {
    const sample = [...known].slice(-3).join(", ");
    throw new Error(
      `Unknown run id "${options.runId}". Recent run ids: ${sample || "(none)"}.`,
    );
  }
  return options.runId;
}

/**
 * Returns the work items created in `targetRunId` that haven't already been
 * closed (either by an earlier cleanup or by close-and-recreate dedupe).
 */
function selectClosable(targetRunId: string): AuditEntry[] {
  const allEntries = readAuditEntries();
  const closedIds = new Set<number>();
  for (const e of allEntries) {
    if (e.action === "closed") closedIds.add(e.workItemId);
  }
  return readAuditEntriesForRun(targetRunId).filter(
    (e) => e.action === "created" && !closedIds.has(e.workItemId),
  );
}

export async function runCleanup(
  options: CleanupOptions,
): Promise<CleanupSummary> {
  if (options.list) {
    const ids = listRunIds();
    console.log(chalk.bold(`Run ids in audit log (${ids.length}):`));
    for (const id of ids) {
      const entries = readAuditEntriesForRun(id);
      const created = entries.filter((e) => e.action === "created").length;
      console.log(`  ${id}  (${created} ticket${created === 1 ? "" : "s"})`);
    }
    return {
      cleanupRunId: "(none — list mode)",
      targetRunId: null,
      candidates: 0,
      closed: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const targetRunId = resolveTargetRunId(options);
  const closable = selectClosable(targetRunId);
  const cleanupRunId = newRunId();
  const summary: CleanupSummary = {
    cleanupRunId,
    targetRunId,
    candidates: closable.length,
    closed: 0,
    skipped: 0,
    failed: 0,
  };

  console.log(chalk.bold(`Cleanup target: ${targetRunId}`));
  console.log(
    `  ${closable.length} ticket${closable.length === 1 ? "" : "s"} eligible for removal`,
  );

  if (closable.length === 0) {
    console.log(
      chalk.dim(
        "  Nothing to do — every ticket in this run is already closed.",
      ),
    );
    return summary;
  }

  if (options.apply) {
    console.log(chalk.dim(`run-id: ${cleanupRunId}`));
  }

  for (const entry of closable) {
    const label = `#${entry.workItemId} (${entry.candidate.package} in ${entry.candidate.repo})`;
    if (!options.apply) {
      console.log(`  ${chalk.cyan("[DRY RUN]")} would close ${label}`);
      summary.skipped++;
      continue;
    }
    const spinner = ora(`Closing ${label}...`).start();
    try {
      await closeADOWorkItem({
        id: entry.workItemId,
        comment: `Removed by \`auro version-tickets cleanup\` on ${new Date().toISOString().slice(0, 10)} (cleanup run-id ${cleanupRunId}; original run ${targetRunId}).`,
      });
      spinner.succeed(`Closed ${label}`);
      appendAuditEntry({
        runId: cleanupRunId,
        timestamp: new Date().toISOString(),
        action: "closed",
        workItemId: entry.workItemId,
        workItemUrl: entry.workItemUrl,
        candidate: entry.candidate,
        note: `cleanup of run ${targetRunId}`,
      });
      summary.closed++;
    } catch (error) {
      spinner.fail(
        `${label} — ${error instanceof Error ? error.message : error}`,
      );
      summary.failed++;
    }
  }

  return summary;
}
