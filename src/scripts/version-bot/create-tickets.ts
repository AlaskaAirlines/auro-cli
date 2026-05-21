import fs from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { closeADOWorkItem, createADOWorkItem } from "#scripts/ado/index.ts";
import {
  findOpenBotTickets,
  type OpenBotTicket,
  parseLatestFromTitle,
} from "#scripts/ado/wiql.ts";
import { appendAuditEntry, newRunId } from "./audit-log.ts";
import { readUpgradeCandidates } from "./cache.ts";
import {
  type BreakingChange,
  extractBreakingChanges,
  fetchChangelogStructured,
} from "./changelog.ts";
import { writePreviewFile } from "./html-preview.ts";
import { compareSemver } from "./npm-registry.ts";
import {
  buildAcceptanceCriteria,
  buildStoryBody,
  buildStoryTitle,
} from "./template.ts";
import type { ComplianceStatus, UpgradeCandidate } from "./types.ts";
import { findUsageInRepo } from "./usage-inventory.ts";

export interface CreateTicketsOptions {
  minMajors: number;
  apply: boolean;
  limit?: number;
  repo?: string;
  candidatesPath?: string;
  previewDir?: string;
  noTags?: boolean;
}

export interface CreateTicketsSummary {
  runId: string;
  totalCandidates: number;
  afterFilter: number;
  applied: number;
  dryRun: number;
  failed: number;
  /** Skipped because an open bot ticket already covers the same `latest`. */
  dedupeSkipped: number;
  /** Closed-and-recreated because an open bot ticket was behind the new `latest`. */
  dedupeReplaced: number;
  /**
   * Candidates dropped pre-loop because GitHub Code Search found zero
   * references to the package in the repo — the dep is declared but dead.
   * `null` usage results (missing GH_TOKEN, search failed) are NOT counted
   * here; they pass through to the ticket-creation path so transient
   * failures don't silently suppress tickets.
   */
  notUsedSkipped: number;
}

export async function runCreateTickets(
  options: CreateTicketsOptions,
): Promise<CreateTicketsSummary> {
  const all = options.candidatesPath
    ? readCandidatesFromPath(options.candidatesPath)
    : readUpgradeCandidates();
  const filtered = all.filter((c) => {
    if (c.majorsBehind < options.minMajors) return false;
    if (options.repo && c.repo !== options.repo) return false;
    return true;
  });

  // Not-used filter runs BEFORE `--limit` so the cap reflects post-filter
  // candidates. Skipped candidates won't burn slots, and the filter populates
  // the findUsageInRepo cache so processCandidate's later call is free.
  const { kept, notUsedSkipped } = await applyNotUsedFilter(filtered);
  const selected =
    options.limit !== undefined ? kept.slice(0, options.limit) : kept;

  const runId = newRunId();
  const summary: CreateTicketsSummary = {
    runId,
    totalCandidates: all.length,
    afterFilter: kept.length,
    applied: 0,
    dryRun: 0,
    failed: 0,
    dedupeSkipped: 0,
    dedupeReplaced: 0,
    notUsedSkipped,
  };

  if (options.apply) {
    console.log(chalk.dim(`run-id: ${runId}`));
  }

  for (const candidate of selected) {
    await processCandidate(candidate, options, summary);
  }

  return summary;
}

function readCandidatesFromPath(filePath: string): UpgradeCandidate[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Candidates file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as UpgradeCandidate[];
}

async function processCandidate(
  candidate: UpgradeCandidate,
  options: CreateTicketsOptions,
  summary: CreateTicketsSummary,
): Promise<void> {
  const title = buildStoryTitle(candidate);
  const changelogUrl = buildChangelogUrl(candidate.package);
  const tags = options.noTags ? [] : buildTags(candidate);

  const fetchSpinner = ora(
    `Fetching changelog for ${candidate.package}...`,
  ).start();
  const changelogSlice = await fetchChangelogStructured(
    candidate.package,
    candidate.pinned,
    candidate.latest,
  );
  fetchSpinner.stop();
  const breakingChanges: BreakingChange[] = changelogSlice
    ? extractBreakingChanges(changelogSlice)
    : [];

  const usage = await fetchUsageInventory(candidate);

  // Dry-run: print preview + return. WIQL/ADO writes only happen in --apply.
  if (!options.apply) {
    const { descriptionHtml, usedChangelogSlice } = buildBodyWithinLimit(
      {
        candidate,
        changelogSlice,
        changelogUrl,
        breakingChanges,
        usage,
      },
      title,
    );
    const acceptanceCriteriaHtml = buildAcceptanceCriteria(
      candidate,
      breakingChanges,
    );
    console.log("");
    console.log(chalk.bold.cyan(`[DRY RUN] ${title}`));
    console.log(`  ${chalk.dim("tags:")}      ${tags.join(", ")}`);
    console.log(
      `  ${chalk.dim("changelog:")} ${usedChangelogSlice ? chalk.green("inlined") : chalk.yellow("link only")}`,
    );
    console.log(
      `  ${chalk.dim("breaking:")} ${breakingChanges.length} change${breakingChanges.length === 1 ? "" : "s"} detected`,
    );
    console.log(
      `  ${chalk.dim("usage:")}     ${usage ? `${usage.totalCount} file${usage.totalCount === 1 ? "" : "s"} reference${usage.totalCount === 1 ? "s" : ""} this package` : "(not searched)"}`,
    );
    console.log(`  ${chalk.dim("body:")}      ${descriptionHtml.length} chars`);
    console.log(
      `  ${chalk.dim("AC:")}        ${acceptanceCriteriaHtml.length} chars`,
    );
    if (options.previewDir) {
      const filePath = writePreviewFile(options.previewDir, {
        candidate,
        title,
        bodyHtml: descriptionHtml,
        acceptanceCriteriaHtml,
        tags,
        changelogInlined: usedChangelogSlice,
      });
      console.log(`  ${chalk.dim("preview:")}   ${filePath}`);
    }
    summary.dryRun++;
    return;
  }

  // --apply path: dedupe gate first, then create (or close-and-recreate).
  const dedupe = await resolveDedupeAction(candidate);
  if (dedupe.action === "skip") {
    console.log(
      chalk.yellow(
        `  ↩ Skipped (dupe of #${dedupe.existing.id}): ${candidate.repo} / ${candidate.package}`,
      ),
    );
    summary.dedupeSkipped++;
    return;
  }

  const supersedes =
    dedupe.action === "replace" ? dedupe.existing.id : undefined;
  const { descriptionHtml } = buildBodyWithinLimit(
    {
      candidate,
      changelogSlice,
      changelogUrl,
      breakingChanges,
      usage,
      supersedes,
    },
    title,
  );
  const acceptanceCriteriaHtml = buildAcceptanceCriteria(
    candidate,
    breakingChanges,
  );

  const spinner = ora(`Creating: ${title}`).start();
  try {
    const workItem = await createADOWorkItem({
      title,
      descriptionHtml,
      acceptanceCriteriaHtml,
      tags,
    });
    const newId = workItem.id;
    const url = workItem._links?.html?.href ?? "(no URL returned)";
    if (typeof newId !== "number") {
      spinner.fail(`${title} - work item create returned no id`);
      summary.failed++;
      return;
    }
    spinner.succeed(`Created #${newId} -> ${url}`);
    summary.applied++;
    appendAuditEntry({
      runId: summary.runId,
      timestamp: new Date().toISOString(),
      action: "created",
      workItemId: newId,
      workItemUrl: url,
      candidate: {
        repo: candidate.repo,
        package: candidate.package,
        pinned: candidate.pinned,
        latest: candidate.latest,
        majorsBehind: candidate.majorsBehind,
      },
      supersedes,
    });

    if (dedupe.action === "replace") {
      const oldId = dedupe.existing.id;
      const closeSpinner = ora(`Closing superseded #${oldId}...`).start();
      try {
        await closeADOWorkItem({
          id: oldId,
          comment: `Closed because a newer version of ${candidate.package} has shipped (now at ${candidate.latest}). Replaced by #${newId}: ${url}`,
        });
        closeSpinner.succeed(`Closed superseded #${oldId}`);
        summary.dedupeReplaced++;
        appendAuditEntry({
          runId: summary.runId,
          timestamp: new Date().toISOString(),
          action: "closed",
          workItemId: oldId,
          workItemUrl: dedupe.existing.url,
          candidate: {
            repo: candidate.repo,
            package: candidate.package,
            pinned: candidate.pinned,
            latest: candidate.latest,
            majorsBehind: candidate.majorsBehind,
          },
          replacedBy: newId,
          note: "close-and-recreate",
        });
      } catch (error) {
        closeSpinner.fail(
          `Failed to close superseded #${oldId} — ${error instanceof Error ? error.message : error}`,
        );
        // Don't fail the candidate: the new ticket was created successfully.
      }
    }
  } catch (error) {
    spinner.fail(
      `${title} - ${error instanceof Error ? error.message : error}`,
    );
    console.log(chalk.dim(`  retry candidate: ${JSON.stringify([candidate])}`));
    console.log(
      chalk.dim(
        "  (save that JSON line to a file, then re-run with --candidates <file>)",
      ),
    );
    summary.failed++;
  }
}

type DedupeAction =
  | { action: "create" }
  | { action: "skip"; existing: OpenBotTicket }
  | { action: "replace"; existing: OpenBotTicket };

/**
 * Decides what to do with a candidate given any open bot tickets that
 * already exist for the same (repo, package):
 *
 * - No match → create
 * - Match in any non-`New` state (Active/Resolved/etc.) → skip (don't
 *   disturb in-progress work)
 * - Match in `New` state with title-latest >= current latest → skip (dupe)
 * - Match in `New` state with title-latest < current latest → replace
 *   (close old, create new with supersedes link)
 * - Match whose title doesn't parse → skip (treat as hand-edited, avoid
 *   stomping)
 */
async function resolveDedupeAction(
  candidate: UpgradeCandidate,
): Promise<DedupeAction> {
  let existing: OpenBotTicket[];
  try {
    existing = await findOpenBotTickets({
      repo: candidate.repo,
      pkg: candidate.package,
    });
  } catch (error) {
    console.log(
      chalk.yellow(
        `  ⚠ Dedupe check failed (${error instanceof Error ? error.message : error}). Proceeding with create.`,
      ),
    );
    return { action: "create" };
  }
  if (existing.length === 0) return { action: "create" };

  // If multiple matches, prefer the most recent (highest id) and let the
  // user clean up the older ones manually with `cleanup` if needed.
  const target = existing.reduce((a, b) => (a.id >= b.id ? a : b));

  if (target.state !== "New") {
    return { action: "skip", existing: target };
  }
  const existingLatest = parseLatestFromTitle(target.title);
  if (!existingLatest) {
    // Hand-edited title — be conservative and skip rather than stomp.
    return { action: "skip", existing: target };
  }
  const cmp = compareSemver(existingLatest, candidate.latest);
  if (cmp === null) return { action: "skip", existing: target };
  if (cmp >= 0) return { action: "skip", existing: target };
  return { action: "replace", existing: target };
}

function buildChangelogUrl(pkg: string): string {
  const shortName = pkg.replace(/^@[^/]+\//, "");
  return `https://github.com/AlaskaAirlines/${shortName}/blob/main/CHANGELOG.md`;
}

/**
 * Base tags plus a `compliance-<status>` tag for any non-`Behind` status.
 * `Behind` is the bot's default — tagging it would mean every ticket is
 * tagged, which adds no signal. `Unsupported` / `Review needed` / etc.
 * carry real information that the ADO query can filter on.
 */
function buildTags(candidate: UpgradeCandidate): string[] {
  const tags = ["auro", "version-upgrade"];
  // `majors-behind-N` is meaningful for upgrades within the same package.
  // For deprecation tickets (Unsupported), the old and new packages are
  // different versions of different things — the number is misleading.
  // The `compliance-unsupported` tag carries the real signal there.
  if (candidate.status !== "Unsupported") {
    tags.push(`majors-behind-${candidate.majorsBehind}`);
  }
  if (candidate.status && candidate.status !== "Behind") {
    tags.push(`compliance-${complianceTagSlug(candidate.status)}`);
  }
  return tags;
}

function complianceTagSlug(status: ComplianceStatus): string {
  return status.toLowerCase().replace(/ /g, "-");
}

/**
 * Drops candidates whose package has zero GitHub Code Search hits in the
 * consumer repo. The dep is declared in package.json but never imported —
 * filing a ticket would point the engineer at dead code. `null` results
 * (missing GH_TOKEN, search failed) pass through so transient failures
 * don't silently suppress tickets.
 *
 * Side effect: warms findUsageInRepo's per-process cache. The same
 * (org, repo, packages-key) lookup inside processCandidate is then a
 * cache hit, so no API calls are duplicated.
 */
async function applyNotUsedFilter(
  candidates: UpgradeCandidate[],
): Promise<{ kept: UpgradeCandidate[]; notUsedSkipped: number }> {
  const kept: UpgradeCandidate[] = [];
  let notUsedSkipped = 0;
  for (const candidate of candidates) {
    const usage = await fetchUsageInventory(candidate);
    if (usage && usage.totalCount === 0) {
      notUsedSkipped++;
      continue;
    }
    kept.push(candidate);
  }
  return { kept, notUsedSkipped };
}

/**
 * Pulls org/repo from `candidate.repoUrl` and queries GitHub Code Search.
 * Searches for both the consumer's pinned package name AND the
 * `targetPackage` (when cross-namespace) so usage is counted across the
 * scope swap. Returns null on any failure — the body just omits the
 * "Where this package is used" section.
 */
async function fetchUsageInventory(
  candidate: UpgradeCandidate,
): Promise<Awaited<ReturnType<typeof findUsageInRepo>>> {
  let org: string;
  let repo: string;
  try {
    const url = new URL(candidate.repoUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    [org, repo] = segments;
  } catch {
    return null;
  }
  const packages = candidate.targetPackage
    ? [candidate.package, candidate.targetPackage]
    : [candidate.package];
  return findUsageInRepo({ org, repo, packages });
}

// ADO accepts up to ~1 MB for System.Description, but rendering performance
// suffers well before that. When the inlined CHANGELOG slice pushes a body
// over MAX_BODY_LENGTH, we rebuild without the slice — the template falls
// back to a link-only migration section. Breaking-change extraction is
// unaffected (we already pulled it out of the slice into `breakingChanges`
// before this guard runs), so the AC bullets remain CHANGELOG-aware.
const MAX_BODY_LENGTH = 50_000;

function buildBodyWithinLimit(
  input: Parameters<typeof buildStoryBody>[0],
  title: string,
): { descriptionHtml: string; usedChangelogSlice: boolean } {
  const initial = buildStoryBody(input);
  const hadSlice = input.changelogSlice !== null;
  if (initial.length <= MAX_BODY_LENGTH || !hadSlice) {
    return { descriptionHtml: initial, usedChangelogSlice: hadSlice };
  }
  const fallback = buildStoryBody({ ...input, changelogSlice: null });
  console.log(
    chalk.yellow(
      `  ⚠  ${title}: body was ${initial.length} chars with the inlined CHANGELOG (> ${MAX_BODY_LENGTH}). Dropped the slice; body is now ${fallback.length} chars with link-only migration section. Breaking-change AC bullets are preserved.`,
    ),
  );
  return { descriptionHtml: fallback, usedChangelogSlice: false };
}
