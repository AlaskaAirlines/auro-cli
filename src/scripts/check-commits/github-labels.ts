import github from "@actions/github";

/**
 * Get existing labels from the current pull request in a GitHub Actions environment
 * @returns Promise that resolves with an array of label names
 */
export async function getExistingLabels(): Promise<string[]> {
  try {
    // Get the GitHub token from environment
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is not set");
    }

    // Check if we're in a GitHub Actions environment
    if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_EVENT_PATH) {
      throw new Error(
        "This function can only be used in a GitHub Actions environment",
      );
    }

    const octokit = github.getOctokit(token);
    const { context } = github;

    // Make sure we're in a pull request context
    if (!context.payload.pull_request) {
      throw new Error("No pull request found in the GitHub context");
    }

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    const prNumber = context.payload.pull_request.number;

    // Get existing labels
    const { data: existingLabels } =
      await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: prNumber,
      });

    // Return array of label names
    return existingLabels.map((label) => label.name);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get existing labels: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Apply a label to the current pull request in a GitHub Actions environment
 * @param label The label to apply to the pull request
 * @returns Promise that resolves when the label is applied
 */
export async function applyLabelToPR(label: string): Promise<void> {
  try {
    // Get the GitHub token from environment
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is not set");
    }

    // Check if we're in a GitHub Actions environment
    if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_EVENT_PATH) {
      throw new Error(
        "This function can only be used in a GitHub Actions environment",
      );
    }

    const octokit = github.getOctokit(token);
    const { context } = github;

    // Make sure we're in a pull request context
    if (!context.payload.pull_request) {
      throw new Error("No pull request found in the GitHub context");
    }

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    const prNumber = context.payload.pull_request.number;

    // Add prefix to the label
    const prefixedLabel = `semantic-status: ${label}`;

    // Get existing labels
    const existingLabels = await getExistingLabels();

    // If the label we want to apply already exists, do nothing
    if (existingLabels.includes(prefixedLabel)) {
      return;
    }

    // Find existing semantic status labels that are different from the one we want to apply
    const existingSemanticLabels = existingLabels.filter(
      (existingLabel) =>
        existingLabel.startsWith("semantic-status:") &&
        existingLabel !== prefixedLabel,
    );

    // Remove existing semantic status labels that don't match the new one
    for (const existingLabel of existingSemanticLabels) {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: existingLabel,
      });
    }

    // Add the new semantic status label
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [prefixedLabel],
    });

    return;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to apply label: ${error.message}`);
    }
    throw error;
  }
}
