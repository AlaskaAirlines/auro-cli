import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";
import { AURO_COMPONENT_PACKAGES } from "#static/auroComponents.js";
import type { Manifest } from "#utils/cem.js";
import { fetchManifest } from "#utils/fetchManifest.js";
import { type ManifestSource, mergeManifests } from "#utils/mergeManifests.js";

export default program
  .command("cem")
  .description(
    "Fetch every published Auro component's custom-elements.json and merge them into a single aggregated manifest",
  )
  .option(
    "-o, --output <file>",
    "Path to write the aggregated manifest",
    "custom-elements.aggregate.json",
  )
  .action(async (options) => {
    const spinner = ora(
      `Fetching manifests for ${AURO_COMPONENT_PACKAGES.length} components...`,
    ).start();

    // Aggregate the canonical latest published manifests, not whatever happens
    // to be installed locally, so the index doesn't mix versions per machine.
    const outcomes = await Promise.all(
      AURO_COMPONENT_PACKAGES.map((pkg) =>
        fetchManifest(pkg, { preferLocal: false }),
      ),
    );

    const sources: ManifestSource[] = [];
    for (const outcome of outcomes) {
      if (outcome.manifest) {
        sources.push({
          pkg: outcome.target,
          manifest: outcome.manifest as Manifest,
        });
      }
    }

    if (sources.length === 0) {
      spinner.fail("No component manifests could be fetched.");
      process.exit(1);
    }

    spinner.text = "Merging manifests...";
    const aggregate = mergeManifests(sources);

    const outputPath = path.resolve(process.cwd(), options.output);
    try {
      await writeFile(
        outputPath,
        `${JSON.stringify(aggregate, null, 2)}\n`,
        "utf-8",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(`Failed to write ${options.output}: ${message}`);
      process.exit(1);
    }

    spinner.succeed(
      `Aggregated ${sources.length}/${AURO_COMPONENT_PACKAGES.length} component manifests (${aggregate.modules?.length ?? 0} modules) to ${options.output}`,
    );

    // Report skips after the spinner so output isn't garbled. Genuine 404s are
    // expected (not every component publishes a CEM yet); transient failures
    // mean the aggregate is incomplete and are treated as an error.
    const skipped = outcomes.filter((outcome) => !outcome.manifest);
    const transientFailures = skipped.filter((outcome) => outcome.transient);

    for (const outcome of skipped) {
      Logger.info(`Skipped ${outcome.target}: ${outcome.reason}`);
    }

    if (transientFailures.length > 0) {
      Logger.error(
        `${transientFailures.length} component(s) failed to fetch transiently; the aggregate may be incomplete. Re-run to retry.`,
      );
      process.exit(1);
    }
  });
