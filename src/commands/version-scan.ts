import chalk from "chalk";
import { program } from "commander";
import { runScan } from "#scripts/version-bot/scan.ts";

interface VersionScanOptions {
  org: string;
  force: boolean;
  outputDir?: string;
}

export const versionScanCommand = program
  .command("version-scan")
  .description(
    "Scan a GitHub org for repos using outdated Auro packages and write upgrade candidates JSON.",
  )
  .option(
    "--org <name>",
    "GitHub org to scan (overrides ECOM_ORG env var)",
    process.env.ECOM_ORG ?? "Alaska-ECommerce",
  )
  .option(
    "--force",
    "Re-scan all repos, ignoring the pushed_at incremental short-circuit",
    false,
  )
  .option(
    "--output-dir <dir>",
    "Directory to write the cache + candidates JSON files (default: ./.cache/version-bot/)",
  )
  .action(async (options: VersionScanOptions) => {
    try {
      const summary = await runScan({
        org: options.org,
        force: options.force,
        outputDir: options.outputDir,
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
