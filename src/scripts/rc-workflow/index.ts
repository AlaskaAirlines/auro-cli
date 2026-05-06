import { Octokit } from "@octokit/rest";
import { simpleGit } from "simple-git";
import {
  filterCommitList,
  generateReleaseNotes,
} from "#scripts/check-commits/commit-analyzer.ts";
import { Git } from "#utils/gitUtils.ts";

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const LABEL = "Release Candidate";
const RC_SOURCE_BRANCH = "dev";
const RC_BASE_BRANCH = "main";

type RcIssue = { number: number; title?: string; html_url?: string };
type LinkedPr = {
  state: "open" | "closed";
  html_url?: string;
  multipleOpen?: boolean;
  number?: number;
};

export class RCWorkflow {
  private repoInfo: { owner: string; repo: string };
  private octokit: Octokit;
  private filteredCommits: Array<{
    type: string;
    hash: string;
    date: string;
    subject: string;
    body: string;
    message: string;
    author_name: string;
  }> | null = null;

  constructor(owner: string, repo: string, octokit: Octokit) {
    this.repoInfo = { owner, repo };
    this.octokit = octokit;
  }

  /**
   * Static factory method to create an instance of RCWorkflow
   * @returns {Promise<RCWorkflow>} A promise that resolves to an instance of RCWorkflow
   */
  static async create(): Promise<RCWorkflow> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is required to run RC workflow.");
    }

    const info = await Git.getRepoOwnerAndName();
    const octokit = new Octokit({ auth: token });

    if (!info) {
      throw new Error(
        "Failed to retrieve repository information. Ensure you're in a valid git repository.",
      );
    }

    const triggerBranch = await RCWorkflow.getTriggerBranchName();
    if (triggerBranch && triggerBranch !== RC_SOURCE_BRANCH) {
      console.log(
        `Switching from ${triggerBranch} to ${RC_SOURCE_BRANCH} branch...`,
      );
      const git = simpleGit();
      await git.checkout(RC_SOURCE_BRANCH);
    }

    return new RCWorkflow(info.owner, info.repo, octokit);
  }

  // Getter for owner
  get owner(): string {
    return this.repoInfo.owner;
  }

  // Getter for repo name
  get repo(): string {
    return this.repoInfo.repo;
  }

  // Getter for full repo info
  get repoData(): { owner: string; repo: string } {
    return { ...this.repoInfo };
  }

  async createReleaseCandidate(): Promise<void> {
    const hasCommitsReady = await this.hasCommitsReadyInDev();
    if (!hasCommitsReady) {
      console.log(
        "No filtered commits found. Continuing to update RC issue/branch/PR.",
      );
    }

    let rcIssue: RcIssue | null = await this.getLatestOpenRcIssue();
    let linkedPr: LinkedPr | null = rcIssue
      ? await this.getLinkedPrByHead(rcIssue.number)
      : null;

    if (linkedPr?.multipleOpen) {
      throw new Error(
        "Multiple open RC PRs found for the same rc/<issueNumber> branch.",
      );
    }

    if (linkedPr?.state === "closed") {
      console.log("Linked RC PR is closed. Creating a new RC issue and PR.");
      rcIssue = await this.createRcIssue();
      linkedPr = null;
    }

    if (!rcIssue) {
      rcIssue = await this.createRcIssue();
    } else {
      await this.updateRcIssue(rcIssue.number);
    }

    if (!rcIssue) {
      throw new Error("Failed to resolve RC issue.");
    }

    await this.createOrUpdateRcBranch(rcIssue.number);

    if (!linkedPr) {
      linkedPr = await this.createRcPr(rcIssue.number);
    } else {
      await this.updateRcPr(rcIssue.number, linkedPr.number!);
    }
  }

  private async getFilteredCommits() {
    if (this.filteredCommits === null) {
      const commitList = await Git.getCommitMessages(RC_SOURCE_BRANCH);
      this.filteredCommits = filterCommitList(commitList);
    }
    return this.filteredCommits;
  }

  async hasCommitsReadyInDev(): Promise<boolean> {
    const filteredCommits = await this.getFilteredCommits();
    return filteredCommits.length > 0;
  }

  private async getLatestOpenRcIssue(): Promise<RcIssue | null> {
    const { data } = await this.octokit.rest.issues.listForRepo({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      labels: LABEL,
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: 30,
    });

    const openIssues = data.filter((issue) => !issue.pull_request);

    if (openIssues.length === 0) {
      console.log(
        `No open Release Candidate issues found in ${this.repoInfo.repo}`,
      );
      return null;
    }

    const latestIssue = openIssues[0];
    console.log(
      `Using latest open Release Candidate issue: #${latestIssue.number}`,
    );
    return { number: latestIssue.number, title: latestIssue.title || "" };
  }

  private async updateRcIssue(issueNumber: number): Promise<void> {
    const releaseNotes = await this.getReleaseNotes();
    const title = `RC ${this.getCurrentDate()}`;

    await this.octokit.rest.issues.update({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      issue_number: issueNumber,
      title,
      body: releaseNotes,
    });
  }

  private async createRcIssue(): Promise<RcIssue> {
    const releaseNotes = await this.getReleaseNotes();

    const { data } = await this.octokit.rest.issues.create({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      title: `RC ${this.getCurrentDate()}`,
      labels: [LABEL],
      body: releaseNotes,
    });

    console.log(
      `Created Release Candidate issue: #${data.number} (${data.html_url})`,
    );
    return { number: data.number, html_url: data.html_url };
  }

  private async createOrUpdateRcBranch(issueNumber: number): Promise<void> {
    const branchRef = `heads/rc/${issueNumber}`;
    const branchName = `rc/${issueNumber}`;

    const { data: devBranch } = await this.octokit.rest.repos.getBranch({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      branch: RC_SOURCE_BRANCH,
    });

    // Check if branch exists by listing matching refs
    const { data: matchingRefs } = await this.octokit.rest.git.listMatchingRefs(
      {
        owner: this.repoInfo.owner,
        repo: this.repoInfo.repo,
        ref: branchRef,
      },
    );

    const branchExists = matchingRefs.length > 0;

    try {
      if (branchExists) {
        console.log(`Updating existing RC branch: ${branchName}`);
        await this.octokit.rest.git.updateRef({
          owner: this.repoInfo.owner,
          repo: this.repoInfo.repo,
          ref: branchRef,
          sha: devBranch.commit.sha,
          force: true,
        });
      } else {
        console.log(`Creating new RC branch: ${branchName}`);
        await this.octokit.rest.git.createRef({
          owner: this.repoInfo.owner,
          repo: this.repoInfo.repo,
          ref: `refs/${branchRef}`,
          sha: devBranch.commit.sha,
        });
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to create or update ${branchName} branch: ${error}`,
      );
    }
  }

  private async getLinkedPrByHead(
    issueNumber: number,
  ): Promise<LinkedPr | null> {
    const head = `${this.repoInfo.owner}:rc/${issueNumber}`;
    const { data } = await this.octokit.rest.pulls.list({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      state: "all",
      head,
      per_page: 30,
    });

    const openPrs = data.filter((pr) => pr.state === "open");
    if (openPrs.length > 1) {
      return { state: "open", multipleOpen: true };
    }

    if (openPrs.length === 1) {
      return {
        state: "open",
        html_url: openPrs[0].html_url,
        number: openPrs[0].number,
      };
    }

    const closedPrs = data.filter((pr) => pr.state === "closed");
    if (closedPrs.length > 0) {
      return {
        state: "closed",
        html_url: closedPrs[0].html_url,
        number: closedPrs[0].number,
      };
    }

    return null;
  }

  private async fetchPrTemplate(issueNumber: number): Promise<string> {
    try {
      // Try to fetch the PR template from the current repo
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.repoInfo.owner,
        repo: this.repoInfo.repo,
        path: ".github/PULL_REQUEST_TEMPLATE.md",
      });

      // Check if data is a file (not a directory or submodule)
      if ("content" in data && data.type === "file") {
        // Decode the base64 content
        let template = Buffer.from(data.content, "base64").toString("utf-8");

        // Replace the summary placeholder with RC-specific text
        template = template.replace(
          "Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change.",
          `Release candidate pull request. See issue #${issueNumber} for details.`,
        );

        // Replace all <details> with <details open>
        template = template.replace(/<details>/g, "<details open>");

        return template;
      }
    } catch (error: unknown) {
      // Template doesn't exist or couldn't be fetched, use fallback
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        (error as { status?: number }).status === 404
      ) {
        console.log("No PR template found in repo, using default message.");
      } else {
        console.warn("Failed to fetch PR template:", error);
      }
    }

    // Fallback if template doesn't exist or fetch fails
    return `Release candidate pull request. See issue #${issueNumber} for details.`;
  }

  private async createRcPr(issueNumber: number): Promise<LinkedPr> {
    try {
      const prBody = await this.fetchPrTemplate(issueNumber);

      const { data } = await this.octokit.request(
        `POST /repos/${this.repoInfo.owner}/${this.repoInfo.repo}/pulls`,
        {
          owner: this.repoInfo.owner,
          repo: this.repoInfo.repo,
          title: `RC #${issueNumber}`,
          body: prBody,
          head: `rc/${issueNumber}`,
          base: RC_BASE_BRANCH,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      console.log(
        `Created Release Candidate pull request: #${data.number} (${data.html_url})`,
      );
      return { state: "open", html_url: data.html_url, number: data.number };
    } catch (error: unknown) {
      console.error("Failed to create RC PR:", error);
      throw error;
    }
  }

  private async updateRcPr(
    issueNumber: number,
    prNumber: number,
  ): Promise<void> {
    try {
      const prBody = await this.fetchPrTemplate(issueNumber);

      await this.octokit.rest.pulls.update({
        owner: this.repoInfo.owner,
        repo: this.repoInfo.repo,
        pull_number: prNumber,
        body: prBody,
      });

      console.log(`Updated Release Candidate pull request: #${prNumber}`);
    } catch (error: unknown) {
      console.error("Failed to update RC PR:", error);
      throw error;
    }
  }

  async getReleaseNotes(): Promise<string> {
    const filteredCommits = await this.getFilteredCommits();
    return generateReleaseNotes(filteredCommits, false);
  }

  private static async getTriggerBranchName(): Promise<string | null> {
    if (process.env.GITHUB_REF_NAME) {
      return process.env.GITHUB_REF_NAME;
    }

    if (process.env.GITHUB_REF?.startsWith("refs/heads/")) {
      return process.env.GITHUB_REF.replace("refs/heads/", "");
    }

    return Git.getCurrentBranchName();
  }

  private getCurrentDate(): string {
    return new Date().toISOString().split("T")[0];
  }
}
