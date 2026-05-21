import { program } from "commander";
import { RCWorkflow } from "#scripts/rc-workflow/index.ts";

export default program
  .command("rc-workflow")
  .description("Generate RC issue and pull request")
  .action(async () => {
    const workflow = await RCWorkflow.create();
    await workflow.createReleaseCandidate();
  });
