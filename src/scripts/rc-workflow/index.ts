import { Git } from "#utils/gitUtils.ts";
import { Octokit } from "@octokit/rest";
import { generateReleaseNotes, filterCommitList } from "#scripts/check-commits/commit-analyzer.ts";

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const LABEL = "Release Candidate";
const DATE = new Date().toISOString().split("T")[0];

export class RCWorkflow {
  private repoInfo: { owner: string; repo: string };
  private octokit: Octokit;

  constructor(owner: string, repo: string, octokit: Octokit) {
    this.repoInfo = { owner, repo };
    this.octokit = octokit;
  }

  // Static factory method for convenience
  static async create(): Promise<RCWorkflow> {
    const info = await Git.getRepoOwnerAndName();
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    
    if (!info) {
      throw new Error("Failed to retrieve repository information. Ensure you're in a valid git repository.");
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
    console.log(`Owner: ${this.repoInfo.owner}, Repo: ${this.repoInfo.repo}`);
    console.log("Checking for commits ready in dev branch...", await this.hasCommitsReadyInDev());

    const rcIssueNumber = await this.hasRcIssues();

    console.log("Existing RC Issue Number:", rcIssueNumber, typeof rcIssueNumber);  

    if (typeof rcIssueNumber === "number") {
      this.createRcIssue();
    }
  }

  async hasCommitsReadyInDev(): Promise<boolean> {
    const commitList = await Git.getCommitMessages('dev');

    const filteredCommits = filterCommitList(commitList);

    return filteredCommits.length > 0;
  }

  async hasRcIssues(): Promise<number | undefined> {
    // search repo for issues with label "Release Candidate"
    return this.octokit.rest.issues.listForRepo({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      labels: LABEL,
    }).then(({ data }) => {
      if (data.length === 0) {
        console.log(`No open Release Candidate issues found in ${this.repoInfo.repo}`);
        return undefined;
      } else {
        console.log(`Open Release Candidate issues in ${this.repoInfo.repo}:`);
        return data[0].number;
      }
    });
  }

  async createRcIssue() {
    const releaseNotes = await this.getReleaseNotes();
    
    await this.octokit.rest.issues.create({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      title: "RC " + DATE,
      labels: [LABEL],
      body: releaseNotes,
    }).then(async ({ data }) => {
      console.log(`Created Release Candidate issue: #${data.number} (${data.html_url})`);
      await this.createRcBranch(data.number);
      await this.createRcPr(data.number);
    });
  }

  async createRcBranch(issueNumber: number) {
    console.log(`Creating RC branch: rc/${issueNumber}`);
    // Get the SHA of the dev branch
    const { data: devBranch } = await this.octokit.rest.repos.getBranch({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      branch: "dev",
    });

    // Create a new branch from dev
    const { data } = await this.octokit.rest.git.createRef({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      ref: `refs/heads/rc/${issueNumber}`,
      sha: devBranch.commit.sha,
    });
  }

  async createRcPr(issueNumber: number) {
    await this.octokit.request(`POST /repos/${this.repoInfo.owner}/${this.repoInfo.repo}/pulls`, {
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      title: 'RC ' + DATE,
      body: 'This pull request is for the release candidate ' + DATE + '.',
      head: 'rc/' + issueNumber,
      base: 'main',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }).then(({ data }) => {
      console.log(`Created Release Candidate pull request: #${data.number} (${data.html_url})`);
    });
  }
  async getReleaseNotes(): Promise<string> {
    const commitList = await Git.getCommitMessages('dev');

    const filteredCommits = filterCommitList(commitList);

    return generateReleaseNotes(filteredCommits);
  }
}
