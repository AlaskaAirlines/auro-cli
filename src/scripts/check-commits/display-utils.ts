import chalk from "chalk";

// Configuration constants for display
export const MAX_SUBJECT_LENGTH = 60;
export const MAX_BODY_LENGTH = 100;

export interface CommitInfo {
  type: string;
  hash: string;
  date: string;
  subject: string;
  body: string;
  message: string;
  author_name: string;
}

// Define valid commit types for better type checking
export type CommitType =
  | "breaking"
  | "feat"
  | "fix"
  | "perf"
  | "docs"
  | "style"
  | "refactor"
  | "test"
  | "build"
  | "ci"
  | "chore"
  | "unknown";

/**
 * Get colored text for commit type using a more harmonious color scheme
 */
export function getColoredType(type: string): string {
  switch (type) {
    case "breaking":
      return chalk.bold.red(type);
    case "feat":
      return chalk.bold.green(type);
    case "fix":
      return chalk.bold.green(type);
    case "perf":
      return chalk.bold.green(type);
    case "docs":
      return chalk.bold.cyan(type);
    case "style":
      return chalk.bold.cyan(type);
    case "refactor":
      return chalk.bold.cyan(type);
    case "test":
      return chalk.bold.cyan(type);
    case "build":
      return chalk.bold.cyan(type);
    case "ci":
      return chalk.bold.cyan(type);
    case "chore":
      return chalk.bold.cyan(type);
    default:
      return chalk.bold.white(type);
  }
}

/**
 * Helper function to wrap long strings to new lines
 */
export function wrapString(str: string, maxLength: number): string {
  if (!str) {
    return "";
  }

  // If the string is shorter than maxLength, return it as is
  if (str.length <= maxLength) {
    return str;
  }

  // Split the string into words
  const words = str.split(" ");
  let result = "";
  let currentLine = "";

  // Build wrapped text with line breaks
  for (const word of words) {
    // If adding this word would exceed maxLength, start a new line
    if ((currentLine + word).length > maxLength && currentLine.length > 0) {
      result += `${currentLine.trim()}\n`;
      currentLine = "";
    }
    currentLine = `${currentLine}${word} `;
  }

  // Add the last line
  if (currentLine.length > 0) {
    result += currentLine.trim();
  }

  return result;
}

/**
 * Display commits in a debug format with detailed information
 */
export function displayDebugView(
  commitList: CommitInfo[],
  verbose = false,
): void {
  for (const commit of commitList) {
    console.log("─".repeat(60));

    // Use a consistent color theme for metadata
    const subject = verbose
      ? commit.subject
      : wrapString(commit.subject, MAX_SUBJECT_LENGTH);
    const body = verbose
      ? commit.body
      : wrapString(commit.body, MAX_BODY_LENGTH);

    // Display commit info in a more compact format
    console.log(chalk.bold(`${getColoredType(commit.type)}`));
    console.log(
      chalk.dim(`${commit.hash} | ${commit.date} | ${commit.author_name}`),
    );
    console.log(chalk.bold(`${chalk.white(subject)}`));

    // Only add body if it exists and keep it more compact
    if (commit.body) {
      console.log(chalk.dim(body));
    }
  }
  console.log("─".repeat(60));
  console.log("\n");
}
