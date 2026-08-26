import fs from "node:fs/promises";
import path from "node:path";
import { program } from "commander";
import ora from "ora";
import { AURO_COMPONENT_PACKAGES } from "#static/auroComponents.js";
import {
  AURO_CONTEXT,
  type AuroComponent,
  buildAuroContext,
  renderComponentRows,
  STATIC_COMPONENTS,
} from "#static/auroContext.js";
import { clean, type Manifest } from "#utils/cem.js";
import { fetchManifest } from "#utils/fetchManifest.js";

/**
 * Build the Component Reference body, starting from the curated component set
 * and overriding each component's package and description with live Custom
 * Elements Manifest data wherever a manifest is published. Seeding from the
 * curated set guarantees every component is listed even before it publishes a
 * CEM, while live data keeps the descriptions of those that do current. Returns
 * the assembled table body and how many components were enriched from live data.
 */
async function buildComponentTable(): Promise<{
  rows: string;
  enriched: number;
}> {
  // Curated set is the base — keyed by tag, insertion order preserved so the
  // reference stays stable and no component is ever dropped.
  const byTag = new Map<string, AuroComponent>();
  for (const component of STATIC_COMPONENTS) {
    byTag.set(component.tag, { ...component });
  }

  const outcomes = await Promise.all(
    AURO_COMPONENT_PACKAGES.map((pkg) => fetchManifest(pkg)),
  );

  let enriched = 0;
  for (const outcome of outcomes) {
    if (!outcome.manifest) {
      continue;
    }
    // Only real registered elements — a declaration can be customElement: true
    // yet be an internal base class with no tagName.
    const declarations = ((outcome.manifest as Manifest).modules ?? [])
      .flatMap((module) => module.declarations ?? [])
      .filter((decl) => decl.customElement && decl.tagName);
    for (const decl of declarations) {
      const tag = decl.tagName as string;
      const liveDescription = clean(decl.summary || decl.description);
      const existing = byTag.get(tag);
      byTag.set(tag, {
        tag,
        pkg: outcome.target,
        description: liveDescription || existing?.description || "",
      });
      if (liveDescription) {
        enriched += 1;
      }
    }
  }

  return { rows: renderComponentRows([...byTag.values()]), enriched };
}

export default program
  .command("context")
  .description(
    "Generate an AI assistant context document for the Auro Design System",
  )
  .option(
    "-o, --output <path>",
    "Write context to a file instead of stdout (e.g. AURO_CONTEXT.md)",
  )
  .option(
    "--offline",
    "Skip fetching live manifests; use the built-in component table",
    false,
  )
  .action(async (options) => {
    let context = AURO_CONTEXT;

    if (!options.offline) {
      const spinner = ora("Fetching live component manifests...").start();
      const { rows, enriched } = await buildComponentTable();
      context = buildAuroContext(rows);
      if (enriched > 0) {
        spinner.succeed(
          `Enriched ${enriched} component description(s) from live manifests.`,
        );
      } else {
        spinner.warn(
          "No live manifests available; using the built-in component table.",
        );
      }
    }

    if (options.output) {
      const writeSpinner = ora(
        `Writing context to ${options.output}...`,
      ).start();
      try {
        const outputPath = path.resolve(process.cwd(), options.output);
        await fs.writeFile(outputPath, context, "utf-8");
        writeSpinner.succeed(`Auro context written to ${options.output}`);
        console.log(
          "\nPaste this file into your AI coding tool (Claude, Cursor, Copilot, etc.) to prime it on Auro components.",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeSpinner.fail(`Failed to write context: ${message}`);
        process.exit(1);
      }
    } else {
      process.stdout.write(context);
    }
  });
