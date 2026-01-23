import { program } from "commander";
import { Octokit } from "@octokit/rest";

export default program
  .command("rc-workflow")
  .description("Generate RC issue and pull request")
  .option("-r, --repo <repository>", "Specify the repository", "")
  .action(async (option) => {
    
// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Compare: https://docs.github.com/en/rest/reference/users#get-the-authenticated-user
const {
  data: { login },
} = await octokit.rest.users.getAuthenticated();

// search repo for issues with label "Release Candidate"
octokit.rest.issues.listForRepo({
  owner: "AlaskaAirlines",
  repo: option.repo,
  labels: "Release Candidate",
}).then(({ data }) => {
  if (data.length === 0) {
    console.log(`No open Release Candidate issues found in ${option.repo}`);
  } else {
    console.log(`Open Release Candidate issues in ${option.repo}:`);
    data.forEach((issue) => {
      console.log(`#${issue.number}: ${issue.title} (${issue.html_url})`);
    });
  }
});

console.log(option.repo);
console.log("Hello, %s", login);


  });
