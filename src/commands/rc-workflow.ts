import { program } from "commander";
import { generateReleaseNotes, filterCommitList } from "#scripts/check-commits/commit-analyzer.ts";
import { RCWorkflow } from "#scripts/rc-workflow/index.ts";

const LABEL = "Release Candidate";

// YYYY-MM-DD
const DATE = new Date().toISOString().split("T")[0]; 

export default program
  .command("rc-workflow")
  .description("Generate RC issue and pull request")
  .option("-r, --repo <repository>", "Specify the repository", "")
  .action(async (option) => {

  const workflow = await RCWorkflow.create();
  await workflow.createReleaseCandidate();

  console.log(option.repo)
});

