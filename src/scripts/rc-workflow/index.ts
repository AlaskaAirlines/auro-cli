import { Octokit } from "@octokit/rest";
import { simpleGit } from "simple-git";
import type { ReleaseTicket } from "#scripts/rc-workflow/ado-release-ticket.ts";
import {
  extractWorkItemIds,
  findReleaseTicket,
} from "#scripts/rc-workflow/ado-release-ticket.ts";
import { Git } from "#utils/gitUtils.ts";

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const RC_SOURCE_BRANCH = "dev";
const RC_BASE_BRANCH = "main";

type LinkedPr = {
  state: "open" | "closed";
  html_url?: string;
  multipleOpen?: boolean;
  number?: number;
};

export class RCWorkflow {
  private repoInfo: { owner: string; repo: string };
  private octokit: Octokit;

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

    if (!process.env.ADO_TOKEN) {
      throw new Error(
        "ADO_TOKEN is required to resolve the ADO Release ticket for the RC workflow.",
      );
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
    // Resolve the ADO Release ticket by inspecting the AB#<id> references on the
    // commits that are on `dev` but not yet on `main`. The Release ticket id is
    // used to name the RC branch (rc/<id>) and is referenced in the PR body.
    const releaseTicket = await this.resolveReleaseTicket();

    // No new commit links to a ticket that rolls up to a Release ticket, so there
    // is nothing to release yet — skip creating the RC branch/PR.
    if (!releaseTicket) {
      console.log(
        "No ADO Release ticket is linked to the new commits on `dev`. Skipping Release PR.",
      );
      return;
    }

    console.log(
      `Using ADO Release ticket #${releaseTicket.id} (${releaseTicket.title}) -> ${releaseTicket.url}`,
    );

    let linkedPr: LinkedPr | null = await this.getLinkedPrByHead(
      releaseTicket.id,
    );

    if (linkedPr?.multipleOpen) {
      throw new Error(
        "Multiple open RC PRs found for the same rc/<ticketId> branch.",
      );
    }

    if (linkedPr?.state === "closed") {
      console.log(
        "Linked RC PR is closed. Creating a new RC PR on the same branch.",
      );
      linkedPr = null;
    }

    await this.createOrUpdateRcBranch(releaseTicket.id);

    if (!linkedPr) {
      linkedPr = await this.createRcPr(releaseTicket);
    } else {
      await this.updateRcPr(releaseTicket, linkedPr.number!);
    }
  }

  /**
   * Resolve the single ADO Release ticket (tagged `auro-rcs`) linked to the work
   * items referenced by the RC commits. Returns null when the new commits do not
   * roll up to a Release ticket (nothing to release yet).
   */
  private async resolveReleaseTicket(): Promise<ReleaseTicket | null> {
    // Scan *all* commit types in the RC range (AB# refs also appear on ci/chore
    // commits), not just the release-note filtered list.
    const rcCommits = await Git.getCommitMessages(RC_SOURCE_BRANCH);
    const workItemIds = extractWorkItemIds(rcCommits);
    return findReleaseTicket(workItemIds);
  }

  private async createOrUpdateRcBranch(ticketId: number): Promise<void> {
    const branchRef = `heads/rc/${ticketId}`;
    const branchName = `rc/${ticketId}`;

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

  private async getLinkedPrByHead(ticketId: number): Promise<LinkedPr | null> {
    const head = `${this.repoInfo.owner}:rc/${ticketId}`;
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

  /**
   * Reference to the ADO Release ticket, shown in the PR body.
   *
   * Uses the Azure Boards mention token `AB#<id>` (as the link label) rather than
   * a plain markdown link so the Azure Boards ↔ GitHub integration parses it and
   * links this PR to the Release work item in ADO's Development section. The
   * markdown URL keeps it clickable for GitHub readers; the integration only cares
   * about the `AB#<id>` token in the body text.
   */
  private rcReference(releaseTicket: ReleaseTicket): string {
    return `Release candidate pull request. Tracked by ADO Release ticket [AB#${releaseTicket.id}](${releaseTicket.url}) — ${releaseTicket.title}.`;
  }

  private async buildPrBody(releaseTicket: ReleaseTicket): Promise<string> {
    const reference = this.rcReference(releaseTicket);

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

        // Replace the summary placeholder with the ADO Release ticket reference
        template = template.replace(
          "Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change.",
          reference,
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
    return reference;
  }

  private async createRcPr(releaseTicket: ReleaseTicket): Promise<LinkedPr> {
    try {
      const prBody = await this.buildPrBody(releaseTicket);

      const { data } = await this.octokit.request(
        `POST /repos/${this.repoInfo.owner}/${this.repoInfo.repo}/pulls`,
        {
          owner: this.repoInfo.owner,
          repo: this.repoInfo.repo,
          title: `RC #${releaseTicket.id}`,
          body: prBody,
          head: `rc/${releaseTicket.id}`,
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
    releaseTicket: ReleaseTicket,
    prNumber: number,
  ): Promise<void> {
    try {
      const prBody = await this.buildPrBody(releaseTicket);

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

  private static async getTriggerBranchName(): Promise<string | null> {
    if (process.env.GITHUB_REF_NAME) {
      return process.env.GITHUB_REF_NAME;
    }

    if (process.env.GITHUB_REF?.startsWith("refs/heads/")) {
      return process.env.GITHUB_REF.replace("refs/heads/", "");
    }

    return Git.getCurrentBranchName();
  }
}
