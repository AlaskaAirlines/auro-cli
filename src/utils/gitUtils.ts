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
      const mainBranch = "main";

      // Check if main branch exists locally, if not fetch it
      // This is critical for GitHub Actions with shallow clones
      try {
        await git.raw(["rev-parse", "--verify", mainBranch]);
      } catch (error) {
        // Main branch doesn't exist locally, fetch it
        Logger.info(`Fetching ${mainBranch} branch...`);
        await git.fetch("origin", mainBranch);
      }

      // Try to get merge base, but handle potential failure in shallow clones
      let commonAncestor: string;
      try {
        const mergeBase = await git.raw([
          "merge-base",
          mainBranch,
          currentBranch.current,
        ]);
        commonAncestor = mergeBase.trim();
      } catch (error) {
        Logger.warn(`Failed to find merge base: ${error}`);
        // Fallback strategy for shallow clones
        // Use the most recent commit on main as reference point
        const mainCommit = await git.raw(["rev-parse", mainBranch]);
        commonAncestor = mainCommit.trim();
      }

      // Use a different format that will let us parse each commit separately
      // %H = hash, %ad = author date, %an = author name, %s = subject, %b = body
      // Separate each commit with a custom delimiter we can split on
      const branchCommitsRaw = await git.raw([
        "log",
        "--pretty=format:COMMIT_START%n%H%n%ad%n%an%n%s%n%b%nCOMMIT_END",
        "--date=short",
        `${commonAncestor}..HEAD`,
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
    } catch (err) {
      Logger.error(`Error getting commit messages: ${err}`);
      return [];
    }
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
