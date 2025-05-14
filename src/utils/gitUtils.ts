import { appendFile, readFile } from "node:fs/promises";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { simpleGit } from "simple-git";
import type { SimpleGit } from "simple-git";

// Initialize simple-git with proper typing
let git: SimpleGit;
try {
  git = simpleGit({
    baseDir: process.cwd(),
    binary: "git",
    maxConcurrentProcesses: 1,
  });
} catch (error) {
  Logger.error(`Failed to initialize git: ${error}`);
  // Provide a minimal implementation to prevent runtime errors
  git = {} as SimpleGit;
}

export class Git {
  static async checkGitignore(pattern: string) {
    if (pattern === "") {
      return false;
    }
    try {
      const fileContent = await readFile(".gitignore", "utf-8");
      return fileContent.includes(pattern);
    } catch (err) {
      Logger.error(`Error reading file: ${err}`);
      return false;
    }
  }

  static async getCommitMessages(): Promise<
    Array<{
      type: string;
      hash: string;
      date: string;
      subject: string;
      body: string;
      message: string;
      author_name: string;
    }>
  > {
    try {
      interface GitCommitType {
        hash: string;
        date: string;
        subject: string;
        body: string;
        message: string;
        author_name: string;
        type: string;
      }

      const currentBranch = await git.branchLocal();
      Logger.info(`Current branch: ${currentBranch.current}`);

      // ---- Get target branch (main) and PR commits ----
      let targetBranch = "main";
      let commitRange = "";

      // Check if we're in a GitHub Actions environment
      const isGitHubAction = !!process.env.GITHUB_ACTIONS;

      if (isGitHubAction) {
        Logger.info("Running in GitHub Actions environment");
        // In GitHub Actions, we can use environment variables to determine the PR branch and base
        targetBranch = process.env.GITHUB_BASE_REF || "main";

        try {
          // Ensure target branch is fetched
          await git.fetch("origin", targetBranch);
          Logger.info(`Fetched target branch: origin/${targetBranch}`);

          // Use the merge base between target branch and current HEAD to get PR-specific commits
          const mergeBase = await git.raw([
            "merge-base",
            `origin/${targetBranch}`,
            "HEAD",
          ]);

          // Get commits between merge base and HEAD - these are the PR commits
          commitRange = `${mergeBase.trim()}..HEAD`;
          Logger.info(`Using commit range: ${commitRange}`);
        } catch (error) {
          Logger.warn(`Error setting up commit range in CI: ${error}`);
          // Fall back to simpler approach (just compare with origin/targetBranch)
          commitRange = `origin/${targetBranch}..HEAD`;
          Logger.info(`Falling back to commit range: ${commitRange}`);
        }
      } else {
        // Local environment - try to determine PR commits
        Logger.info("Running in local environment");

        try {
          // First check if origin/main exists, fetch it if needed
          try {
            await git.raw(["rev-parse", "--verify", `origin/${targetBranch}`]);
          } catch {
            Logger.info(`Fetching ${targetBranch} from origin`);
            await git.fetch("origin", targetBranch);
          }

          // Find merge base between current branch and target branch
          const mergeBase = await git.raw([
            "merge-base",
            `origin/${targetBranch}`,
            currentBranch.current,
          ]);

          commitRange = `${mergeBase.trim()}..HEAD`;
          Logger.info(`Using commit range for PR commits: ${commitRange}`);
        } catch (error) {
          Logger.warn(`Error determining PR commits locally: ${error}`);

          // Fallback - use last few commits
          Logger.info("Falling back to analyzing recent commits");
          commitRange = "HEAD~10..HEAD";
          Logger.info(`Using fallback commit range: ${commitRange}`);
        }
      }

      // Get and format the PR commits
      return await Git.getFormattedCommits(commitRange);
    } catch (err) {
      Logger.error(`Error getting commit messages: ${err}`);
      return [];
    }
  }

  // Helper function to get formatted commits for a given git range
  static async getFormattedCommits(commitRange: string): Promise<
    Array<{
      type: string;
      hash: string;
      date: string;
      subject: string;
      body: string;
      message: string;
      author_name: string;
    }>
  > {
    interface GitCommitType {
      hash: string;
      date: string;
      subject: string;
      body: string;
      message: string;
      author_name: string;
      type: string;
    }

    // Use a format that will let us parse each commit separately
    // %H = hash, %ad = author date, %an = author name, %s = subject, %b = body
    const branchCommitsRaw = await git.raw([
      "log",
      "--pretty=format:COMMIT_START%n%H%n%ad%n%an%n%s%n%b%nCOMMIT_END",
      "--date=short",
      commitRange,
    ]);

    // Split by our custom delimiter to get individual commits
    const commitChunks = branchCommitsRaw
      .split("COMMIT_START\n")
      .filter((chunk: string) => chunk.trim() !== "");

    const commits: GitCommitType[] = [];

    for (const chunk of commitChunks) {
      const parts = chunk.split("\n");
      if (parts.length >= 4) {
        const hash = parts[0];
        const date = parts[1];
        const author_name = parts[2];
        const subject = parts[3];

        // The rest is the body (may contain breaking changes)
        // Filter out the COMMIT_END marker
        const bodyLines = parts
          .slice(4)
          .filter((line: string) => line !== "COMMIT_END");
        const body = bodyLines.length > 0 ? bodyLines.join("") : "";

        // Use a shorter hash format for better readability (7 characters)
        const shortHash = hash.substring(0, 7);

        // Determine commit type from subject
        const typeMatch = subject.match(
          /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?:/,
        );
        let type = typeMatch ? typeMatch[1] : "unknown";

        // Check for breaking changes
        if (body.includes("BREAKING CHANGE")) {
          type = "breaking";
        }

        commits.push({
          type,
          hash: shortHash,
          date,
          subject,
          body,
          message: `${subject}${body ? `\n\n${body}` : ""}`,
          author_name,
        });
      }
    }

    return commits;
  }

  // Function to add file to .gitignore
  static async addToGitignore(pattern: string, log = true) {
    await Git.checkGitignore(pattern).then(async (result) => {
      if (result) {
        Logger.warn(`${pattern} already exists`);
      } else {
        try {
          await appendFile(".gitignore", `\n${pattern}`);
          if (log) {
            Logger.success(`${pattern} added to .gitignore`);
          }
        } catch (err) {
          Logger.error(err);
        }
      }
    });
  }

  // Function to remove file from git cache
  static async removeFromGitCache(files: string[]) {
    try {
      await git.rmKeepLocal(files);
      Logger.success(`${files.join(", ")} are removed from git cache`);
    } catch (err) {
      Logger.error(err);
    }
  }

  static async createBranch(branchName: string) {
    try {
      await git.checkoutLocalBranch(branchName);
      Logger.success(`Created and switched to ${branchName} branch`);
    } catch (err) {
      Logger.error(err);
    }
  }

  static async commitStagedFiles(message: string) {
    try {
      await git.add(".");
      await git.commit(message);
      Logger.success(`Committed with message: ${message}`);
    } catch (err) {
      Logger.error(err);
    }
  }
}
