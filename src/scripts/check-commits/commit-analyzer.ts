import chalk from "chalk";
import ora from "ora";
import type { Ora } from "ora";
import { Git } from "#utils/gitUtils.ts";
import type { CommitInfo } from "./display-utils.ts";
import { displayDebugView, getColoredType } from "./display-utils.ts";
import { applyLabelToPR } from "./github-labels.ts";

/**
 * Analyze commit messages in the repository
 * @param debug Whether to display detailed debug information
 * @param verbose Whether to display verbose commit messages without truncation
 * @param setLabel Whether to apply a label to the PR based on commit types
 * @returns A promise that resolves when analysis is complete
 */
export async function analyzeCommits(
  debug = false,
  setLabel = false,
): Promise<void> {
  const spinner = ora("Checking commits...\n").start();

  try {
    const commitList = await Git.getCommitMessages();

    // Only display commit details if debug mode is enabled
    if (debug) {
      displayDebugView(commitList);
    }

    spinner.succeed(`Total commits analyzed: ${commitList.length}`);

    if (commitList.length !== 0) {
      const commitTypes = commitList.map((commit) => commit.type);
      const uniqueTypes = Array.from(new Set(commitTypes));
      const formattedTypes = uniqueTypes
        .map((type) => getColoredType(type))
        .join(", ");
      spinner.succeed(`Found commit types: ${formattedTypes}`);
    } else {
      spinner.info(
        "The list of commits is created by comparing the current branch\n" +
          "with the main branch. If you are on a new branch, please\n" +
          "make sure to commit some changes before running this command.",
      );
    }

    if (setLabel) {
      await handleLabels(commitList, spinner);
    }
  } catch (error) {
    spinner.fail("Error getting commit messages");
    console.error(error);
  }
}

/**
 * Handle applying labels based on commit types
 * @param commitList The list of commits to analyze
 * @param spinner The ora spinner instance for status updates
 */
async function handleLabels(
  commitList: CommitInfo[],
  spinner: Ora,
): Promise<void> {
  const validCommitTypes = [
    "breaking",
    "feat",
    "fix",
    "perf",
    "docs",
    "style",
    "refactor",
    "test",
    "build",
    "ci",
    "chore",
  ];

  // Extract all valid commit types from the commit list
  const foundCommitTypes = commitList
    .map((commit) => commit.type)
    .filter((type) => validCommitTypes.includes(type));

  // Select the highest priority commit type based on the order in validCommitTypes
  let selectedLabel = null;
  let highestPriorityIndex = Number.POSITIVE_INFINITY;

  for (const type of foundCommitTypes) {
    const priorityIndex = validCommitTypes.indexOf(type);
    if (priorityIndex < highestPriorityIndex) {
      highestPriorityIndex = priorityIndex;
      selectedLabel = type;
    }
  }

  if (selectedLabel) {
    const labelSpinner = ora("Applying label to pull request...").start();
    try {
      // Apply the label to the PR
      await applyLabelToPR(selectedLabel);
      labelSpinner.succeed(
        `Label "semantic-status: ${getColoredType(selectedLabel)}" applied to the pull request.`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      labelSpinner.fail(errorMessage);
    }
  } else {
    spinner.warn(
      chalk.yellow("No semantic commit type found to apply as label."),
    );
  }
}
