import fs from "node:fs/promises";
import path from "node:path";
import { program } from "commander";
import ora from "ora";
import { AURO_COMPONENT_PACKAGES } from "#static/auroComponents.js";
import {
  type AuroComponent,
  buildAuroContext,
  renderComponentRows,
  STATIC_COMPONENTS,
} from "#static/auroContext.js";
import { clean, type Manifest } from "#utils/cem.js";
import { fetchLatestVersion, fetchManifest } from "#utils/fetchManifest.js";

/**
 * Build the Component Reference body, starting from the curated component set
 * and overriding each component's package and description with Custom Elements
 * Manifest data — preferring a locally installed copy, falling back to unpkg.
 * Seeding from the curated set guarantees every component is listed even before
 * it publishes a CEM, while live data keeps the descriptions of those that do
 * current. Returns the assembled table body, how many components were enriched,
 * and the installed version of every package resolved from local node_modules.
 */
async function buildComponentTable(allowNetwork: boolean): Promise<{
  rows: string;
  enriched: number;
  local: Map<string, string>;
}> {
  // Curated set is the base — keyed by tag, insertion order preserved so the
  // reference stays stable and no component is ever dropped.
  const byTag = new Map<string, AuroComponent>();
  for (const component of STATIC_COMPONENTS) {
    byTag.set(component.tag, { ...component });
  }

  const outcomes = await Promise.all(
    AURO_COMPONENT_PACKAGES.map((pkg) => fetchManifest(pkg, { allowNetwork })),
  );

  const local = new Map<string, string>();
  let enriched = 0;
  for (const outcome of outcomes) {
    if (!outcome.manifest) {
      continue;
    }
    if (outcome.source === "local" && outcome.version) {
      local.set(outcome.target, outcome.version);
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

  return { rows: renderComponentRows([...byTag.values()]), enriched, local };
}

/**
 * Compare each locally installed package against the latest published release
 * and report any that are behind. Best-effort and network-dependent — advisory
 * output goes to stderr so it never pollutes the context document on stdout.
 */
async function reportOutdated(local: Map<string, string>): Promise<void> {
  const spinner = ora("Checking for newer component releases...").start();
  const entries = [...local.entries()];
  const latest = await Promise.all(
    entries.map(([pkg]) => fetchLatestVersion(pkg)),
  );

  const outdated: string[] = [];
  entries.forEach(([pkg, installed], index) => {
    const newest = latest[index];
    if (newest && newest !== installed) {
      outdated.push(`  ${pkg}: installed ${installed}, latest ${newest}`);
    }
  });

  if (outdated.length === 0) {
    spinner.succeed("All installed Auro components are on the latest release.");
    return;
  }

  spinner.warn(
    `${outdated.length} installed Auro component(s) are not on the latest release:`,
  );
  // stderr — keep the generated document (stdout) clean.
  console.error(outdated.join("\n"));
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
    "Skip network fetches; use locally installed manifests and the built-in table",
    false,
  )
  .action(async (options) => {
    const online = !options.offline;

    const spinner = ora(
      online
        ? "Resolving component manifests..."
        : "Reading installed component manifests...",
    ).start();
    const { rows, enriched, local } = await buildComponentTable(online);
    const context = buildAuroContext(rows);

    if (enriched > 0) {
      spinner.succeed(
        online
          ? `Enriched ${enriched} component description(s) (${local.size} from local node_modules).`
          : `Enriched ${enriched} component description(s) from local node_modules.`,
      );
    } else {
      spinner.warn(
        online
          ? "No manifests available; using the built-in component table."
          : "No installed component manifests found; using the built-in component table.",
      );
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

    // Advisory only, and needs the network — skip in offline mode.
    if (online && local.size > 0) {
      await reportOutdated(local);
    }
  });
