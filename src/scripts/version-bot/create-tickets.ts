import chalk from "chalk";
import ora from "ora";
import { createADOWorkItem } from "#scripts/ado/index.ts";
import { readUpgradeCandidates } from "./cache.ts";
import { fetchChangelogSlice } from "./changelog.ts";
import { buildStoryBody, buildStoryTitle } from "./template.ts";
import type { UpgradeCandidate } from "./types.ts";

export interface CreateTicketsOptions {
  minMajors: number;
  apply: boolean;
  limit?: number;
  repo?: string;
}

export interface CreateTicketsSummary {
  totalCandidates: number;
  afterFilter: number;
  applied: number;
  dryRun: number;
  failed: number;
}

export async function runCreateTickets(
  options: CreateTicketsOptions,
): Promise<CreateTicketsSummary> {
  const all = readUpgradeCandidates();
  const filtered = all.filter((c) => {
    if (c.majorsBehind < options.minMajors) return false;
    if (options.repo && c.repo !== options.repo) return false;
    return true;
  });
  const selected =
    options.limit !== undefined ? filtered.slice(0, options.limit) : filtered;

  const summary: CreateTicketsSummary = {
    totalCandidates: all.length,
    afterFilter: filtered.length,
    applied: 0,
    dryRun: 0,
    failed: 0,
  };

  for (const candidate of selected) {
    await processCandidate(candidate, options.apply, summary);
  }

  return summary;
}

async function processCandidate(
  candidate: UpgradeCandidate,
  apply: boolean,
  summary: CreateTicketsSummary,
): Promise<void> {
  const title = buildStoryTitle(candidate);
  const changelogUrl = buildChangelogUrl(candidate.package);
  const tags = [
    "auro",
    "version-upgrade",
    `majors-behind-${candidate.majorsBehind}`,
  ];

  const fetchSpinner = ora(
    `Fetching changelog for ${candidate.package}...`,
  ).start();
  const changelogHtml = await fetchChangelogSlice(
    candidate.package,
    candidate.pinned,
    candidate.latest,
  );
  fetchSpinner.stop();

  const descriptionHtml = buildStoryBody({
    candidate,
    changelogHtml,
    changelogUrl,
  });

  if (!apply) {
    console.log("");
    console.log(chalk.bold.cyan(`[DRY RUN] ${title}`));
    console.log(`  ${chalk.dim("tags:")}      ${tags.join(", ")}`);
    console.log(
      `  ${chalk.dim("changelog:")} ${changelogHtml ? chalk.green("inlined") : chalk.yellow("link only")}`,
    );
    console.log(`  ${chalk.dim("body:")}      ${descriptionHtml.length} chars`);
    summary.dryRun++;
    return;
  }

  const spinner = ora(`Creating: ${title}`).start();
  try {
    const workItem = await createADOWorkItem({
      title,
      descriptionHtml,
      tags,
    });
    const url = workItem._links?.html?.href ?? "(no URL returned)";
    spinner.succeed(`Created #${workItem.id} -> ${url}`);
    summary.applied++;
  } catch (error) {
    spinner.fail(
      `${title} - ${error instanceof Error ? error.message : error}`,
    );
    summary.failed++;
  }
}

function buildChangelogUrl(pkg: string): string {
  const shortName = pkg.replace(/^@[^/]+\//, "");
  return `https://github.com/AlaskaAirlines/${shortName}/blob/main/CHANGELOG.md`;
}
