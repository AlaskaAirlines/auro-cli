import chalk from "chalk";
import { program } from "commander";
import { runCreateTickets } from "#scripts/version-bot/create-tickets.ts";

interface VersionTicketsOptions {
  minMajors: string;
  apply: boolean;
  limit?: string;
  repo?: string;
  candidates?: string;
  previewDir?: string;
}

export const versionTicketsCommand = program
  .command("version-tickets")
  .description(
    "Create ADO User Stories for Auro upgrade candidates. Defaults to dry-run; pass --apply to actually write to ADO.",
  )
  .option(
    "--min-majors <n>",
    "Only ticket candidates at or above this majors-behind threshold",
    "2",
  )
  .option(
    "--apply",
    "Actually create tickets in ADO (otherwise dry-run)",
    false,
  )
  .option("--limit <n>", "Maximum number of tickets to process this run")
  .option("--repo <name>", "Only process candidates from this consumer repo")
  .option(
    "--candidates <file>",
    "Read candidates from a custom JSON file instead of ~/.auro/version-bot/auro-upgrade-candidates.json",
  )
  .option(
    "--preview-dir <dir>",
    "During dry-run, write one styled HTML preview file per candidate to this directory",
  )
  .action(async (options: VersionTicketsOptions) => {
    try {
      const minMajors = Number.parseInt(options.minMajors, 10);
      if (Number.isNaN(minMajors) || minMajors < 1) {
        throw new Error("--min-majors must be an integer >= 1");
      }
      const limit =
        options.limit !== undefined
          ? Number.parseInt(options.limit, 10)
          : undefined;
      if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
        throw new Error("--limit must be an integer >= 1");
      }

      const summary = await runCreateTickets({
        minMajors,
        apply: options.apply,
        limit,
        repo: options.repo,
        candidatesPath: options.candidates,
        previewDir: options.previewDir,
      });

      console.log("");
      console.log(
        chalk.bold(options.apply ? "Tickets applied." : "Dry run complete."),
      );
      console.log(`  Total candidates in JSON: ${summary.totalCandidates}`);
      console.log(`  After filters:            ${summary.afterFilter}`);
      if (options.apply) {
        console.log(
          `  Applied: ${chalk.green(summary.applied)}  failed: ${chalk.red(summary.failed)}`,
        );
      } else {
        console.log(`  Dry-run printed: ${chalk.cyan(summary.dryRun)}`);
        console.log(
          chalk.dim(
            "\n  Re-run with --apply to actually create tickets in ADO.",
          ),
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `version-tickets failed: ${error instanceof Error ? error.message : error}`,
        ),
      );
      process.exit(1);
    }
  });
