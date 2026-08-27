import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";
import type { Manifest } from "#utils/cem.js";
import { fetchManifest } from "#utils/fetchManifest.js";
import { formatDeclaration, toPackageName } from "#utils/formatComponent.js";
import { checkOutdated, renderOutdatedBanner } from "#utils/outdated.js";

/** Options accepted by the `component` action. */
export interface ComponentOptions {
  tag?: string;
  json?: boolean;
}

/**
 * Look up a single component's API from its Custom Elements Manifest and print
 * it (formatted, or raw JSON with `--json`). Exits non-zero when the manifest
 * can't be resolved or documents no registered element.
 */
export async function runComponent(
  name: string,
  options: ComponentOptions,
): Promise<void> {
  const pkg = toPackageName(name);
  const target = options.tag ? `${pkg}@${options.tag}` : pkg;
  const spinner = ora(`Fetching ${target}...`).start();

  const result = await fetchManifest(target);
  if (!result.manifest) {
    spinner.fail(
      result.transient
        ? `Failed to fetch ${target}: ${result.reason}.`
        : `No custom-elements.json published for ${target}. It may not exist or may not publish a manifest yet.`,
    );
    process.exit(1);
  }
  const manifest = result.manifest as Manifest;

  // Only real registered elements — a declaration can be customElement: true
  // yet be an internal base class with no tagName.
  const declarations = (manifest.modules ?? [])
    .flatMap((module) => module.declarations ?? [])
    .filter((decl) => decl.customElement && decl.tagName);

  if (declarations.length === 0) {
    spinner.fail(`No registered custom elements found for ${target}.`);
    process.exit(1);
  }

  const origin =
    result.source === "local"
      ? ` (local${result.version ? ` v${result.version}` : ""})`
      : " (unpkg)";
  spinner.succeed(
    `${target} — ${declarations.length} custom element${declarations.length === 1 ? "" : "s"}${origin}`,
  );

  // When the manifest came from a local install, check whether that install is
  // behind the latest published release and warn — mirroring `auro context`.
  // Only meaningful for a local read (unpkg already serves latest, and an
  // explicit --tag forces a network fetch, so source is never "local" then).
  let outdatedBanner: string | null = null;
  if (result.source === "local" && result.version) {
    const check = ora("Checking for a newer release...").start();
    const outdated = await checkOutdated(new Map([[pkg, result.version]]));
    check.stop();
    if (outdated.length > 0) {
      outdatedBanner = renderOutdatedBanner(outdated);
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(declarations, null, 2)}\n`);
    // stderr — keep JSON on stdout machine-parseable.
    if (outdatedBanner) {
      console.error(outdatedBanner);
    }
    return;
  }

  process.stdout.write(
    `\n${declarations.map((decl) => formatDeclaration(pkg, decl)).join("\n\n---\n\n")}\n`,
  );
  Logger.info("\nFull docs: https://auro.alaskaair.com");
  // Warn last so it's the final thing on screen, not scrolled off by the API dump.
  if (outdatedBanner) {
    console.error(outdatedBanner);
  }
}

export default program
  .command("component <name>")
  .description(
    "Look up an Auro component's API (attributes, properties, slots, events, CSS parts) from its published Custom Elements Manifest",
  )
  .option(
    "-t, --tag <version>",
    "npm dist-tag or version to look up (default: latest)",
  )
  .option("--json", "Output the raw manifest declaration(s) as JSON", false)
  .action(runComponent);
