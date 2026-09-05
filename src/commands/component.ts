import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";
import {
  FORMKIT_PACKAGE,
  formkitSubpathFor,
  formkitTagFor,
  isLegacyFormkitPackage,
} from "#static/formkitMigration.js";
import type { Manifest } from "#utils/cem.js";
import {
  fetchManifest,
  type ManifestFetchResult,
} from "#utils/fetchManifest.js";
import { formatDeclaration, toPackageName } from "#utils/formatComponent.js";
import { checkOutdated, renderOutdatedBanner } from "#utils/outdated.js";

/** Options accepted by the `component` action. */
export interface ComponentOptions {
  tag?: string;
  json?: boolean;
}

/** How a component name resolved to a manifest source and its display metadata. */
interface ResolvedSource {
  /** Package to show in the `(pkg)` header and use for the outdated check. */
  headerPkg: string;
  /** Package the `Install:` snippet tells the user to `npm i`. */
  installPkg: string;
  /** Module specifier the `Install:` snippet tells the user to `import`. */
  importSpecifier: string;
  /** When set, keep only the declaration with this tag (monorepo aggregate CEM). */
  tagFilter?: string;
  /** True when a legacy standalone was redirected to the auro-formkit monorepo. */
  redirectedToFormkit: boolean;
  /** The resolved manifest fetch outcome. */
  result: ManifestFetchResult;
}

/**
 * Decide where a component's manifest comes from and how to present it.
 *
 * A legacy standalone form package (one `auro-formkit` now ships) is fetched from
 * the **monorepo** unless that standalone is *actually installed* in the current
 * project — matching what the user has, and steering everyone else onto formkit
 * rather than the deprecated standalone. An explicit `--tag` always pins the
 * standalone package (formkit versions its own line), so it bypasses the redirect.
 */
async function resolveSource(
  pkg: string,
  options: ComponentOptions,
): Promise<ResolvedSource> {
  const plain = (result: ManifestFetchResult): ResolvedSource => ({
    headerPkg: pkg,
    installPkg: pkg,
    importSpecifier: pkg,
    redirectedToFormkit: false,
    result,
  });

  if (options.tag) {
    return plain(await fetchManifest(`${pkg}@${options.tag}`));
  }

  if (isLegacyFormkitPackage(pkg)) {
    // Prefer the legacy standalone only when it's actually installed here.
    const localLegacy = await fetchManifest(pkg, { allowNetwork: false });
    if (localLegacy.manifest) {
      return plain(localLegacy);
    }
    // Otherwise show the monorepo copy (local formkit first, then unpkg).
    return {
      headerPkg: FORMKIT_PACKAGE,
      installPkg: FORMKIT_PACKAGE,
      importSpecifier: formkitSubpathFor(pkg),
      tagFilter: formkitTagFor(pkg),
      redirectedToFormkit: true,
      result: await fetchManifest(FORMKIT_PACKAGE),
    };
  }

  return plain(await fetchManifest(pkg));
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
  const spinner = ora(`Fetching ${pkg}...`).start();

  const source = await resolveSource(pkg, options);
  const { result } = source;
  const target = result.target;
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
  // yet be an internal base class with no tagName. When the source is the
  // monorepo aggregate CEM, narrow to the one requested tag so a lookup for
  // `input` shows `auro-input` alone, not every formkit element.
  const declarations = (manifest.modules ?? [])
    .flatMap((module) => module.declarations ?? [])
    .filter((decl) => decl.customElement && decl.tagName)
    .filter((decl) => !source.tagFilter || decl.tagName === source.tagFilter);

  if (declarations.length === 0) {
    spinner.fail(
      source.tagFilter
        ? `No <${source.tagFilter}> element found in ${target}.`
        : `No registered custom elements found for ${target}.`,
    );
    process.exit(1);
  }

  const origin =
    result.source === "local"
      ? ` (local${result.version ? ` v${result.version}` : ""})`
      : " (unpkg)";
  spinner.succeed(
    `${target} — ${declarations.length} custom element${declarations.length === 1 ? "" : "s"}${origin}`,
  );

  // A legacy standalone the user hasn't installed was redirected to the monorepo;
  // tell them why the package/import shown differs from what they typed. On stderr
  // (not Logger, which prints to stdout) so `--json` output stays machine-parseable.
  if (source.redirectedToFormkit) {
    console.error(
      `ℹ ${source.tagFilter} now ships in ${FORMKIT_PACKAGE} — showing the monorepo version (the legacy standalone isn't installed).`,
    );
  }

  // When the manifest came from a local install, check whether that install is
  // behind the latest published release and warn — mirroring `auro context`.
  // Only meaningful for a local read (unpkg already serves latest, and an
  // explicit --tag forces a network fetch, so source is never "local" then).
  let outdatedBanner: string | null = null;
  if (result.source === "local" && result.version) {
    const check = ora("Checking for a newer release...").start();
    const outdated = await checkOutdated(
      new Map([[source.headerPkg, result.version]]),
    );
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
    `\n${declarations
      .map((decl) =>
        formatDeclaration(source.headerPkg, decl, {
          installPkg: source.installPkg,
          importSpecifier: source.importSpecifier,
        }),
      )
      .join("\n\n---\n\n")}\n`,
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
    "npm dist-tag or version to look up (default: latest); pins the standalone package for a legacy form component",
  )
  .option("--json", "Output the raw manifest declaration(s) as JSON", false)
  .action(runComponent);
