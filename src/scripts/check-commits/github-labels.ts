import github from "@actions/github";

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
    const { data: existingLabels } =
      await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: prNumber,
      });

    // Find existing semantic status labels
    const existingSemanticLabels = existingLabels
      .filter((existingLabel) =>
        existingLabel.name.startsWith("semantic-status:"),
      )
      .map((existingLabel) => existingLabel.name);

    // Remove existing semantic status labels
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
