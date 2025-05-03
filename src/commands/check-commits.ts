import { program } from "commander";
import { analyzeCommits } from "#scripts/check-commits/commit-analyzer.ts";

export default program
  .command("check-commits")
  .alias("cc")
  .option(
    "-l, --set-label",
    "Set label on the pull request based on the commit message type",
  )
  .option("-d, --debug", "Display detailed commit information for debugging")
  .option("-v, --verbose", "Show full commit messages without truncation")
  .description(
    "Check commits in the local repository for the types of semantic commit messages made and return the results.",
  )
  .action(async (option) => {
    await analyzeCommits(option.debug, option.verbose, option.setLabel);
  });
