/**
 * `auro init` — generate the AI grounding files (`AGENTS.md` + the thin
 * `CLAUDE.md`) for the Auro components a project actually has installed, plus the
 * CLI-owned `auro.config.json` that records how each component's tag is resolved.
 *
 * This command is the orchestration seam that wires the PT-M1 data modules
 * together: detect + resolve installed components (`resolver.ts`), plan each
 * component's custom tag under the frozen **config → AST scan → default prefix**
 * precedence (`registry.ts`), render the grounding files (`generator.ts`), then
 * write them and persist the config. It owns the two policy concerns the pure
 * planner deliberately excludes: the interactive prefix prompt/confirm and the
 * non-interactive TTY/CI guard.
 *
 * It never touches `.gitignore` — `auro.config.json` is a committed artifact so
 * regeneration is deterministic across a team and in CI.
 *
 * **One opt-in codemod exception.** `init` otherwise documents, never rewrites,
 * consumer source. The sole exception is the legacy-standalone → `auro-formkit`
 * migration: when a project depends on a deprecated standalone form package, an
 * interactive run offers to migrate it (edit `package.json`, rewrite import
 * specifiers). This is gated behind an explicit TTY confirm and fully skipped in a
 * non-interactive/CI run (which only advises). See `migrateFormkit.ts`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { program } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { CONFIG_FILENAME } from "#init/config.js";
import { groundingFiles } from "#init/generator.js";
import { AGENTS_FILENAME, CLAUDE_FILENAME } from "#init/layout.js";
import {
  detectLegacyFormkit,
  type LegacyDependency,
  migrateToFormkit,
} from "#init/migrateFormkit.js";
import {
  loadConfig,
  planTagResolution,
  RegistryError,
  saveConfig,
  scanProject,
  type TagResolutionPlan,
} from "#init/registry.js";
import { resolveInstalled } from "#init/resolver.js";

/** Options accepted by the `init` action. */
export interface InitOptions {
  /** Default tag prefix (e.g. `myapp-`) for components without an existing registration. */
  prefix?: string;
  /** Never prompt; take the prefix from `--prefix` or fail cleanly. */
  nonInteractive?: boolean;
  /** Alias for {@link nonInteractive}. */
  yes?: boolean;
}

/**
 * Is this run non-interactive? True when stdin is not a TTY, when `CI` is set, or
 * when the user passed `--non-interactive`/`--yes`. A non-interactive run never
 * calls `inquirer` (which would throw on a closed stdin) — it takes the prefix
 * from `--prefix` or fails cleanly.
 */
function isNonInteractive(options: InitOptions): boolean {
  return (
    !process.stdin.isTTY ||
    Boolean(process.env.CI) ||
    Boolean(options.nonInteractive) ||
    Boolean(options.yes)
  );
}

/**
 * Interactively resolve the default prefix for components that have no config or
 * scan-detected tag. Offers the majority `suggestedDefault` (when one was
 * inferred from existing registrations) as a `confirm`, falling back to a free
 * `input` — a blank answer keeps the bare `auro-*` tags (the planner warns).
 * Only called on an interactive TTY.
 */
async function promptDefaultPrefix(plan: TagResolutionPlan): Promise<string> {
  if (plan.suggestedDefault) {
    const { accept } = await inquirer.prompt<{ accept: boolean }>([
      {
        type: "confirm",
        name: "accept",
        message: plan.mixedPrefixes
          ? `Existing registrations use more than one prefix. Use the most common, '${plan.suggestedDefault}', as the default for the remaining components?`
          : `Use the detected prefix '${plan.suggestedDefault}' as the default for the remaining components?`,
        default: true,
      },
    ]);
    if (accept) {
      return plan.suggestedDefault;
    }
  }

  const { prefix } = await inquirer.prompt<{ prefix: string }>([
    {
      type: "input",
      name: "prefix",
      message:
        "Prefix for Auro custom-element tags (e.g. myapp-; blank keeps the bare auro-* tags):",
      default: plan.suggestedDefault ?? "",
    },
  ]);
  return String(prefix).trim();
}

/**
 * Offer to migrate legacy standalone form packages (now shipped by `auro-formkit`)
 * to formkit. Returns `true` when a migration was applied — the caller then stops
 * this run, because the standalone is still in `node_modules` and grounding it now
 * would document the very imports the codemod just rewrote; the user reinstalls and
 * re-runs to ground formkit. Returns `false` when there is nothing to migrate, the
 * user declines, or the run is non-interactive (which only advises), so the caller
 * continues with normal grounding.
 */
async function offerFormkitMigration(
  cwd: string,
  options: InitOptions,
): Promise<boolean> {
  let legacy: LegacyDependency[];
  try {
    legacy = detectLegacyFormkit(cwd);
  } catch (error) {
    // A malformed package.json is surfaced but must not abort grounding.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`⚠ Skipping formkit migration check: ${message}`);
    return false;
  }
  if (legacy.length === 0) {
    return false;
  }

  const names = legacy.map((l) => l.pkg).join(", ");
  if (isNonInteractive(options)) {
    console.error(
      `⚠ ${legacy.length} legacy standalone package(s) can be migrated to @aurodesignsystem/auro-formkit: ${names}. Run \`auro init\` interactively to apply the migration.`,
    );
    return false;
  }

  const { migrate } = await inquirer.prompt<{ migrate: boolean }>([
    {
      type: "confirm",
      name: "migrate",
      message: `${legacy.length} legacy standalone package(s) now live in auro-formkit (${names}). Migrate to auro-formkit now? This edits package.json and rewrites import specifiers.`,
      default: false,
    },
  ]);
  if (!migrate) {
    return false;
  }

  const spinner = ora("Migrating to auro-formkit...").start();
  const report = migrateToFormkit(cwd, legacy);
  spinner.succeed(
    `Migrated ${report.packagesMigrated.length} package(s) to auro-formkit; rewrote ${report.rewriteCount} import(s) across ${report.filesChanged.length} file(s).`,
  );

  // Deep imports can't be remapped 1:1 to a formkit subpath — flag for follow-up.
  for (const { file, specifier } of report.deepImports) {
    console.error(
      `⚠ ${file}: left deep import '${specifier}' unchanged — update it to an @aurodesignsystem/auro-formkit subpath by hand.`,
    );
  }
  console.error(
    "Next: run `npm install`, then re-run `auro init` to regenerate grounding for auro-formkit.",
  );
  return true;
}

/**
 * Generate and write the grounding files for the installed Auro components. See
 * the module header for the detect → plan → generate → write pipeline. Exits
 * non-zero on a malformed config, an unresolvable prefix in a non-interactive
 * run, or a write failure; warns (never guesses) on unresolvable registrations,
 * bare `auro-*` fallbacks, and cross-package duplicate tags.
 */
export async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  const spinner = ora("Detecting installed Auro components...").start();
  const { components, duplicates } = await resolveInstalled();

  if (components.length === 0) {
    spinner.warn(
      "No installed Auro components found; nothing to ground. Install an Auro component package and re-run `auro init`.",
    );
    return;
  }
  spinner.succeed(
    `Detected ${components.length} installed component(s) to ground.`,
  );

  // Before grounding, offer to migrate any legacy standalone form package onto
  // auro-formkit. When a migration is applied, stop: the project must be
  // reinstalled and re-run so grounding reflects the formkit imports (see helper).
  if (await offerFormkitMigration(cwd, options)) {
    return;
  }

  // The persisted config is the source of truth for how tags were resolved last
  // run; a malformed or newer-version file is an explicit, actionable failure.
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = loadConfig(cwd);
  } catch (error) {
    const message =
      error instanceof RegistryError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`Cannot read ${CONFIG_FILENAME}: ${message}`);
    process.exit(1);
  }

  // Read-only scan of the project's own sources for existing register('<tag>')
  // calls — heuristic input to the config → scan → default-prefix precedence.
  const scan = scanProject(cwd);

  let plan = planTagResolution(components, {
    config,
    scan,
    prefix: options.prefix,
  });

  // Two-phase resolution: when some components still need a default prefix, or
  // existing registrations imply conflicting prefixes, resolve one and re-plan.
  //
  // The decision (confirm majority / prompt / CI-fail) is only needed while the
  // default is UNSETTLED — no --prefix and no persisted config default. A settled
  // default already governs unregistered components, so mixed per-component
  // overrides are simply honored and regeneration stays deterministic (no
  // re-prompt, no CI-fail on every run of a committed mixed-prefix project).
  const defaultSettled =
    options.prefix !== undefined || config?.init.prefix.default !== undefined;
  const needsDecision =
    !defaultSettled && (plan.needsDefaultPrefix || plan.mixedPrefixes);
  if (needsDecision) {
    if (isNonInteractive(options)) {
      const reason = plan.needsDefaultPrefix
        ? `${plan.needingDefault.length} component(s) have no resolvable tag and no default prefix`
        : "existing registrations use inconsistent prefixes";
      console.error(
        `Cannot resolve component tags non-interactively: ${reason}. Re-run with --prefix <prefix> (e.g. --prefix myapp-).`,
      );
      process.exit(1);
    }
    const chosen = await promptDefaultPrefix(plan);
    plan = planTagResolution(components, { config, scan, prefix: chosen });
  }

  // Defensive: a resolved prefix must clear needsDefaultPrefix before we persist.
  if (plan.needsDefaultPrefix) {
    console.error(
      "Unable to resolve a default prefix for every component. Re-run with --prefix <prefix>.",
    );
    process.exit(1);
  }

  const writeSpinner = ora("Writing grounding files...").start();
  try {
    for (const file of groundingFiles(components, plan.resolvedTags)) {
      await fs.writeFile(path.join(cwd, file.filename), file.contents, "utf-8");
    }
    // Persist the authoritative config so regeneration is idempotent.
    saveConfig(cwd, plan.config);
    writeSpinner.succeed(
      `Wrote ${AGENTS_FILENAME}, ${CLAUDE_FILENAME}, and ${CONFIG_FILENAME} for ${components.length} component(s).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeSpinner.fail(`Failed to write grounding files: ${message}`);
    process.exit(1);
  }

  // Advisory only — keep warnings on stderr so a caller capturing stdout gets a
  // clean run. Warn, never guess: unresolvable registrations and bare fallbacks.
  for (const warning of plan.warnings) {
    console.error(`⚠ ${warning}`);
  }
  // A tag registered by more than one installed package (legacy standalone vs
  // monorepo overlap) is grounded once; surface it so the user picks intentionally.
  for (const duplicate of duplicates) {
    console.error(
      `⚠ Tag <${duplicate.tagName}> is registered by multiple installed packages: ${duplicate.packages.join(", ")}. Grounded once — verify which package you intend to use.`,
    );
  }
}

export default program
  .command("init")
  .description(
    "Generate AI grounding files (AGENTS.md + CLAUDE.md) for the installed Auro components",
  )
  .option(
    "--prefix <prefix>",
    "Default custom-element tag prefix (e.g. myapp-) for components without an existing registration",
  )
  .option(
    "--non-interactive",
    "Never prompt; take the prefix from --prefix or fail cleanly (implied by a non-TTY stdin or CI)",
    false,
  )
  .option("--yes", "Alias for --non-interactive", false)
  .action(runInit);
