/**
 * `auro api-diff <baseRef> [headRef]` — works out the smallest version bump the
 * code changes between two refs require and checks it against the bump their
 * commits declare (Semantic Release Governance, phase 1).
 *
 * Exit contract: `0` when the analysis ran (even if the declared bump is too low,
 * so the check can run report-only); `1` with `--enforce` when the declared bump
 * is lower than the required one; `2` when the analysis couldn't run (bad ref,
 * head doesn't build, commit-analyzer not installed in the repo). `--json` writes the result to stdout; human output goes to
 * stderr so stdout stays machine-parseable.
 *
 * @see https://github.com/orgs/AlaskaAirlines/discussions/661
 */

import process from "node:process";
import { program } from "commander";
import ora from "ora";
import { DEFAULT_COMMANDS, runApiDiff } from "#scripts/api-diff/index.js";

/** Options accepted by the `api-diff` action. */
export interface ApiDiffCommandOptions {
  /** Emit the result as JSON on stdout instead of human text. */
  json?: boolean;
  /** Exit 1 when the declared bump is lower than the required bump. */
  enforce?: boolean;
  /** Rebuild the manifest at both refs (commander sets false for `--no-rebuild`). */
  rebuild?: boolean;
  manifest?: string;
  installCommand?: string;
  buildCommand?: string;
}

const OUTCOME_MARK = { pass: "✔", warn: "⚠", fail: "✖" } as const;

/** Run the analysis and report it per the exit contract. */
export async function runApiDiffCommand(
  baseRef: string,
  headRef: string | undefined,
  options: ApiDiffCommandOptions = {},
): Promise<void> {
  // In `--json` mode nothing may touch stdout but the JSON payload, so the ora
  // spinner is suppressed and errors go to stderr.
  const spinner = options.json
    ? null
    : ora(`Comparing ${baseRef}...${headRef ?? "HEAD"}...`).start();

  let result: Awaited<ReturnType<typeof runApiDiff>>;
  try {
    result = await runApiDiff(baseRef, headRef, {
      rebuild: options.rebuild,
      manifest: options.manifest,
      commands: {
        install: options.installCommand,
        build: options.buildCommand,
      },
    });
  } catch (error) {
    const message = `api-diff failed: ${(error as Error).message}`;
    if (spinner) {
      spinner.fail(message);
    } else {
      console.error(message);
    }
    process.exit(2);
  }

  const failed = Boolean(options.enforce) && result.outcome === "fail";

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    spinner?.stop();
    console.error(`${OUTCOME_MARK[result.outcome]} ${result.summary}`);
    if (result.changes.length > 0) {
      console.error("\nChanges:");
      for (const change of result.changes) {
        const from = change.cause === "generator" ? " (generator upgrade)" : "";
        console.error(`  [${change.bump}] ${change.message}${from}`);
      }
    }
    if (result.commits.length > 0) {
      console.error("\nCommits:");
      for (const commit of result.commits) {
        console.error(
          `  [${commit.bump}] ${commit.hash.slice(0, 7)} ${commit.subject}`,
        );
      }
    }
    for (const warning of result.warnings) {
      console.error(`\n⚠ ${warning}`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

export default program
  .command("api-diff <baseRef> [headRef]")
  .description(
    "Work out the smallest version bump the changes from baseRef to headRef (default HEAD) require, and check the commits declare at least that much.",
  )
  .option("--json", "Output the result as JSON on stdout", false)
  .option(
    "--enforce",
    "Exit 1 when the commits declare a smaller bump than the code requires",
    false,
  )
  .option(
    "--no-rebuild",
    "Compare the committed custom-elements.json files instead of rebuilding them",
  )
  .option(
    "--manifest <path>",
    "Manifest path relative to the repo root (default: package.json customElements, else custom-elements.json)",
  )
  .option(
    "--install-command <cmd>",
    "Command that installs dependencies in each rebuilt checkout",
    DEFAULT_COMMANDS.install,
  )
  .option(
    "--build-command <cmd>",
    "Command that writes the manifest in each rebuilt checkout",
    DEFAULT_COMMANDS.build,
  )
  .action(runApiDiffCommand);
