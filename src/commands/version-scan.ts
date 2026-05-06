import chalk from "chalk";
import { program } from "commander";
import { runScan } from "#scripts/version-bot/scan.ts";

interface VersionScanOptions {
  org: string;
  force: boolean;
}

export const versionScanCommand = program
  .command("version-scan")
  .description(
    "Scan a GitHub org for repos using outdated Auro packages and write upgrade candidates JSON.",
  )
  .option("--org <name>", "GitHub org to scan", "Alaska-ECommerce")
  .option(
    "--force",
    "Re-scan all repos, ignoring the pushed_at incremental short-circuit",
    false,
  )
  .action(async (options: VersionScanOptions) => {
    try {
      const summary = await runScan({
        org: options.org,
        force: options.force,
      });

      console.log("");
      console.log(chalk.bold("Version scan complete."));
      console.log(
        `  Repos scanned: ${chalk.cyan(summary.reposScanned)}  skipped: ${chalk.gray(summary.reposSkipped)}  errored: ${chalk.yellow(summary.reposErrored)}`,
      );
      console.log(
        `  Upgrade candidates (>= 1 major behind): ${chalk.cyan(summary.candidatesFound)}`,
      );
      console.log(`  Cache:      ${summary.cachePath}`);
      console.log(`  Candidates: ${summary.candidatesPath}`);
    } catch (error) {
      console.error(
        chalk.red(
          `version-scan failed: ${error instanceof Error ? error.message : error}`,
        ),
      );
      process.exit(1);
    }
  });
