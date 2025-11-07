import { program } from "commander";
import { createADOItem } from "#scripts/ado/index.ts";

export const adoCommand = program
  .command("ado")
  .description("Generate ADO item from GitHub issue")
  .option("-g, --gh-issue <issue>", "What GitHub issue to use")
  .action(async (options) => {

    if (options.ghIssue) {
      await createADOItem(options.ghIssue);
    }
  });
