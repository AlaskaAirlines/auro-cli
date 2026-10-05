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

  static async getCommitMessages(sourceBranch = ""): Promise<
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
      // Use the provided branch parameter, or fall back to current branch if not specified
      let branch = sourceBranch;
      if (!branch) {
        // In GitHub Actions PR context, GITHUB_HEAD_REF contains the actual PR branch name.
        // branchLocal().current returns "pull/<n>/merge" in detached HEAD state, which is
        // not a valid remote-tracking ref (it maps to refs/remotes/pull/<n>/merge, not origin/).
        if (process.env.GITHUB_ACTIONS && process.env.GITHUB_HEAD_REF) {
          branch = process.env.GITHUB_HEAD_REF;
        } else {
          const currentBranch = await git.branchLocal();
          branch = currentBranch.current;
        }
      }

      // ---- Get target branch (main) and PR commits ----
      let targetBranch = "main";
      let commitRange = "";

      // Check if we're in a GitHub Actions environment
      const isGitHubAction = !!process.env.GITHUB_ACTIONS;

      if (isGitHubAction) {
        // In GitHub Actions, we can use environment variables to determine the PR branch and base
        targetBranch = process.env.GITHUB_BASE_REF || "main";

        try {
          // Ensure target branch is fetched
          await git.fetch("origin", targetBranch);

          // Ensure source branch is available
          if (branch !== "HEAD") {
            try {
              await git.raw(["rev-parse", "--verify", `origin/${branch}`]);
            } catch {
              await git.fetch("origin", branch);
            }
          }

          // Use remote refs consistently since we're in CI
          const sourceBranchRef = branch === "HEAD" ? "HEAD" : `origin/${branch}`;

          // Use the merge base between target branch and source branch to get commits
          const mergeBase = await git.raw([
            "merge-base",
            `origin/${targetBranch}`,
            sourceBranchRef,
          ]);

          // Get commits between merge base and source branch
          commitRange = `${mergeBase.trim()}..${sourceBranchRef}`;
        } catch (error) {
          Logger.warn(`Error setting up commit range in CI: ${error}`);
          // Fall back to simpler approach (just compare with origin/targetBranch)
          const sourceBranchRef = branch === "HEAD" ? "HEAD" : `origin/${branch}`;
          commitRange = `origin/${targetBranch}..${sourceBranchRef}`;
        }
      } else {
        // Local environment - try to determine commits

        try {
          // First check if origin/main exists, fetch it if needed
          try {
            await git.raw(["rev-parse", "--verify", `origin/${targetBranch}`]);
          } catch {
            Logger.info(`Fetching ${targetBranch} from origin`);
            await git.fetch("origin", targetBranch);
          }

          // Ensure source branch is available
          if (branch !== "HEAD") {
            try {
              await git.raw(["rev-parse", "--verify", branch]);
            } catch {
              await git.fetch("origin", branch);
            }
          }

          // Find merge base between source branch and target branch
          const mergeBase = await git.raw([
            "merge-base",
            `origin/${targetBranch}`,
            branch,
          ]);

          commitRange = `${mergeBase.trim()}..${branch}`;
        } catch (error) {
          Logger.warn(`Error determining commits locally: ${error}`);

          // Fallback - use last few commits from source branch
          commitRange = `${branch}~10..${branch}`;
        }
      }

      // Get and format the PR commits
      return await Git.getFormattedCommits(commitRange);
    } catch (err) {
      Logger.error(`Error getting commit messages: ${err}`);
      return [];
    }
  }

  static async getRepoOwnerAndName(): Promise<{ owner: string; repo: string } | null> {
    try {
      // Get remote URLs
      const remotes = await git.getRemotes(true);
      
      if (remotes.length === 0) {
        Logger.warn("No remotes found");
        return null;
      }

      // Get the origin remote (or first available)
      const originRemote = remotes.find(remote => remote.name === 'origin') || remotes[0];
      const remoteUrl = originRemote.refs.fetch || originRemote.refs.push;

      return Git.parseGitUrl(remoteUrl);
    } catch (err) {
      Logger.error(`Error getting repo owner and name: ${err}`);
      return null;
    }
  }

  static async getCurrentBranchName(): Promise<string | null> {
    try {
      const branchInfo = await git.branchLocal();
      return branchInfo.current || null;
    } catch (err) {
      Logger.error(`Error getting current branch name: ${err}`);
      return null;
    }
  }

  private static parseGitUrl(url: string): { owner: string; repo: string } | null {
    // Handle different URL formats
    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    // HTTPS with auth: https://user:token@github.com/owner/repo.git

    let match: RegExpMatchArray | null;

    // SSH format
    if (url.includes('@') && url.includes(':')) {
      match = url.match(/@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
      if (match) {
        return { owner: match[2], repo: match[3] };
      }
    }

    // HTTPS format
    match = url.match(/https?:\/\/(?:[^@]+@)?[^/]+\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    Logger.warn(`Could not parse git URL: ${url}`);
    return null;
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
