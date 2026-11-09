import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import {
  buildDependencyMap,
  type DependencyMap,
  transitiveDependents,
} from "#scripts/dependencyMap/buildMap.js";
import { extractFromWorkspace } from "#scripts/dependencyMap/extractBundledDeps.js";
import {
  renderDependencyMapMarkdown,
  shortName,
} from "#scripts/dependencyMap/renderMarkdown.js";

/** Options shared by every `deps` subcommand. */
interface WorkspaceOptions {
  local: string;
}

/** Options accepted by `deps map`. */
export interface DepsMapOptions extends WorkspaceOptions {
  out?: string;
  format: "json" | "md" | "both";
}

/** Options accepted by `deps dependents`. */
export interface DepsDependentsOptions extends WorkspaceOptions {
  json?: boolean;
}

const JSON_FILE = "auro-dependency-map.json";
const MARKDOWN_FILE = "auro-dependency-map.md";

async function loadMap(options: WorkspaceOptions): Promise<DependencyMap> {
  const workspace = path.resolve(process.cwd(), options.local);
  const repos = await extractFromWorkspace(workspace);
  if (repos.length === 0) {
    Logger.error(`No @aurodesignsystem repos found under ${workspace}.`);
    process.exit(1);
  }
  return buildDependencyMap(repos);
}

/**
 * Build the bundled-component map from a folder of Auro checkouts. Writes
 * `auro-dependency-map.{json,md}` to `--out`, or prints the chosen format to
 * stdout when no `--out` is given.
 */
export async function runDepsMap(options: DepsMapOptions): Promise<void> {
  const map = await loadMap(options);
  const json = `${JSON.stringify(map, null, 2)}\n`;
  const markdown = renderDependencyMapMarkdown(map);

  if (!options.out) {
    process.stdout.write(options.format === "json" ? json : markdown);
    return;
  }

  const outDir = path.resolve(process.cwd(), options.out);
  await mkdir(outDir, { recursive: true });
  if (options.format !== "md") {
    await writeFile(path.join(outDir, JSON_FILE), json, "utf-8");
  }
  if (options.format !== "json") {
    await writeFile(path.join(outDir, MARKDOWN_FILE), markdown, "utf-8");
  }

  Logger.success(
    `Mapped ${Object.keys(map.packages).length} packages in ${map.releaseOrder.length} release batches to ${outDir}`,
  );
  for (const warning of map.warnings) Logger.warn(warning);
}

/** Print every package that must release after `pkg` does, in release order. */
export async function runDepsDependents(
  pkg: string,
  options: DepsDependentsOptions,
): Promise<void> {
  const name = pkg.includes("/") ? pkg : `@aurodesignsystem/${pkg}`;
  const map = await loadMap(options);
  if (!map.packages[name]) {
    Logger.error(`${name} neither bundles nor is bundled by another package.`);
    process.exit(1);
  }

  const batches = transitiveDependents(map, name);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(batches, null, 2)}\n`);
    return;
  }
  if (batches.length === 0) {
    process.stdout.write(`Nothing bundles ${shortName(name)}.\n`);
    return;
  }
  const text = batches
    .map(
      (batch, i) =>
        `Batch ${i + 1}\n${batch.map((p) => `  - ${shortName(p)}`).join("\n")}`,
    )
    .join("\n\n");
  process.stdout.write(`${text}\n`);
}

const deps = program
  .command("deps")
  .description(
    "Map which Auro components bundle which, and who must release after a component releases",
  );

deps
  .command("map")
  .description(
    "Generate the bundled-component dependency map from a folder of Auro repo checkouts",
  )
  .option(
    "-l, --local <dir>",
    "Folder containing Auro repo checkouts",
    process.cwd(),
  )
  .option(
    "-o, --out <dir>",
    "Write auro-dependency-map.{json,md} here instead of stdout",
  )
  .option("-f, --format <format>", "json, md, or both", "both")
  .action(runDepsMap);

deps
  .command("dependents <package>")
  .description(
    "List every package that must rebuild and release after <package> releases, in release order",
  )
  .option(
    "-l, --local <dir>",
    "Folder containing Auro repo checkouts",
    process.cwd(),
  )
  .option("--json", "Print release batches as JSON")
  .action(runDepsDependents);

export default deps;
