import chalk from "chalk";
import ora from "ora";
import type { Ora } from "ora";
import { Git } from "#utils/gitUtils.ts";
import type { CommitInfo } from "./display-utils.ts";
import { displayDebugView, getColoredType } from "./display-utils.ts";
import { applyLabelToPR, getExistingLabels } from "./github-labels.ts";

/**
 * Generate release notes in the specified format
 * First tries to show only feat, fix, and breaking commits
 * If none found, shows all commits for user selection
 * @param commitList The list of commits to process
 */
function generateReleaseNotes(commitList: CommitInfo[]): void {
  const releaseCommitTypes = ["feat", "fix", "breaking"];
  
  // Filter for preferred commit types first
  const releaseCommits = commitList.filter(commit => 
    releaseCommitTypes.includes(commit.type)
  );
  
  // Use filtered commits if any found, otherwise use all commits
  const commitsToShow = releaseCommits.length > 0 ? releaseCommits : commitList;
  
  if (commitsToShow.length === 0) {
    console.log("No commits found to include in release notes.\n");
    return;
  }
  
  console.log("\n------\n");
  console.log("### In this release\n");
  
  for (const commit of commitsToShow) {
    // Format: - {short commit hash} {commit message}
    console.log(`- ${commit.hash} ${commit.subject}`);
    
    // Add extra commit message content if body exists
    if (commit.body?.trim()) {
      // Split body into meaningful chunks, handling different separators
      const bodyText = commit.body.trim();
      
      // Split by common separators and clean up
      const bodyLines = bodyText
        .split(/\n+/)  // Split on one or more newlines
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      for (const line of bodyLines) {
        // Handle issue references and add proper spacing
        let formattedLine = line;
        
        // Add spaces before issue references like AlaskaAirlines/auro-cli#108
        formattedLine = formattedLine.replace(
          /([^\s])(AlaskaAirlines\/[a-zA-Z0-9-]+#\d+)/g, 
          '$1 $2'
        );
        
        // Add spaces between consecutive issue references
        formattedLine = formattedLine.replace(
          /(AlaskaAirlines\/[a-zA-Z0-9-]+#\d+)([^\s])/g, 
          '$1 $2'
        );
        
        console.log(`  - ${formattedLine}`);
      }
    }
  }
  
  console.log("\n------\n");
  
  // Show helpful info about what was included
  if (releaseCommits.length > 0) {
    console.log(chalk.green(`✓ Showing ${releaseCommits.length} commits of types: ${releaseCommitTypes.join(", ")}`));
  } else {
    console.log(chalk.yellow(`⚠ No feat/fix/breaking commits found. Showing all ${commitList.length} commits for your selection.`));
  }
}

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
  releaseNotes = false,
): Promise<void> {
  const spinner = ora("Checking commits...\n").start();

  try {
    const commitList = await Git.getCommitMessages();

    // Generate release notes if requested
    if (releaseNotes) {
      spinner.succeed(`Total commits analyzed: ${commitList.length}`);
      generateReleaseNotes(commitList);
      return;
    }

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

  const foundCommitTypes = commitList
    .map((commit) => commit.type)
    .filter((type) => validCommitTypes.includes(type));

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
    const labelSpinner = ora(
      "Checking existing labels on pull request...",
    ).start();
    try {
      const existingLabels = await getExistingLabels();

      if (existingLabels.includes(`semantic-status: ${selectedLabel}`)) {
        labelSpinner.info(
          `Label "semantic-status: ${getColoredType(selectedLabel)}" already exists on the pull request.`,
        );
        return;
      }

      labelSpinner.text = "Applying label to pull request...";
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
