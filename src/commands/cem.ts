import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";
import { AURO_COMPONENT_PACKAGES } from "#static/auroComponents.js";

const UNPKG_BASE = "https://unpkg.com";

interface CemModule {
  path: string;
  [key: string]: unknown;
}

interface Manifest {
  schemaVersion?: string;
  modules?: CemModule[];
  [key: string]: unknown;
}

interface ManifestSource {
  pkg: string;
  manifest: Manifest;
}

/**
 * Fetch a single package's Custom Elements Manifest from unpkg.
 * Returns the parsed manifest, or null if the package does not publish one.
 */
async function fetchManifest(pkg: string): Promise<Manifest | null> {
  const url = `${UNPKG_BASE}/${pkg}/custom-elements.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.warn(`Skipping ${pkg}: request failed (${message})`);
    return null;
  }

  if (!response.ok) {
    Logger.warn(
      `Skipping ${pkg}: no custom-elements.json (HTTP ${response.status})`,
    );
    return null;
  }

  try {
    return (await response.json()) as Manifest;
  } catch (_error) {
    Logger.warn(`Skipping ${pkg}: custom-elements.json is not valid JSON`);
    return null;
  }
}

/**
 * Merge per-package manifests into a single Custom Elements Manifest.
 * Each source module's path is namespaced with its package so paths stay
 * unique and consumers can trace a declaration back to its component.
 */
function mergeManifests(sources: ManifestSource[]): Manifest {
  const modules: CemModule[] = [];

  for (const { pkg, manifest } of sources) {
    for (const module of manifest.modules ?? []) {
      modules.push({
        ...module,
        path: `${pkg}/${module.path}`,
      });
    }
  }

  return {
    schemaVersion: sources[0]?.manifest.schemaVersion ?? "1.0.0",
    readme: "",
    modules,
  };
}

export default program
  .command("cem")
  .description(
    "Aggregate the Custom Elements Manifests of all published Auro components into a single file",
  )
  .option("--aggregate", "Fetch and merge every component manifest", true)
  .option(
    "-o, --output <file>",
    "Path to write the aggregated manifest",
    "custom-elements.aggregate.json",
  )
  .action(async (options) => {
    const spinner = ora(
      `Fetching manifests for ${AURO_COMPONENT_PACKAGES.length} components...`,
    ).start();

    const results = await Promise.allSettled(
      AURO_COMPONENT_PACKAGES.map(async (pkg) => ({
        pkg,
        manifest: await fetchManifest(pkg),
      })),
    );

    const sources: ManifestSource[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.manifest) {
        sources.push({
          pkg: result.value.pkg,
          manifest: result.value.manifest,
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
  });
