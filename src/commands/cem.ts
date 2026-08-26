import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";
import { AURO_COMPONENT_PACKAGES } from "#static/auroComponents.js";
import type { CemModule, Manifest } from "#utils/cem.js";
import { fetchManifest } from "#utils/fetchManifest.js";

interface ManifestSource {
  pkg: string;
  manifest: Manifest;
}

/**
 * Recursively namespace every local module reference in a CEM node with the
 * owning package. A reference is local only when it has a `module` string and
 * no `package` sibling (a `package` means it points at an external package, so
 * its `module` must be left untouched). This keeps the merged manifest's
 * internal references (exports' `declaration.module`, `references[].module`,
 * etc.) pointing at the same paths as their now-namespaced modules.
 */
function namespaceReferences(node: unknown, pkg: string): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => namespaceReferences(item, pkg));
  }

  if (node && typeof node === "object") {
    const source = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (
        key === "module" &&
        typeof value === "string" &&
        source.package == null
      ) {
        result[key] = `${pkg}/${value}`;
      } else {
        result[key] = namespaceReferences(value, pkg);
      }
    }
    return result;
  }

  return node;
}

/**
 * Merge per-package manifests into a single Custom Elements Manifest.
 * Every module (and its internal references) is namespaced with its package so
 * paths stay unique and every declaration remains traceable to its component.
 */
function mergeManifests(sources: ManifestSource[]): Manifest {
  const modules: CemModule[] = [];

  for (const { pkg, manifest } of sources) {
    for (const module of manifest.modules ?? []) {
      const namespaced = namespaceReferences(module, pkg) as CemModule;
      namespaced.path = `${pkg}/${module.path}`;
      modules.push(namespaced);
    }
  }

  const schemaVersions = new Set(
    sources.map((source) => source.manifest.schemaVersion).filter(Boolean),
  );
  if (schemaVersions.size > 1) {
    Logger.warn(
      `Merging mixed CEM schema versions: ${[...schemaVersions].join(", ")}`,
    );
  }

  return {
    schemaVersion: sources[0]?.manifest.schemaVersion ?? "1.0.0",
    modules,
  };
}

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
