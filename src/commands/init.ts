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
 * Its generated files are committed artifacts — `auro.config.json` and the rest
 * are meant to be checked in so regeneration is deterministic across a team and in
 * CI. To protect that, a post-write check asks git whether any file it wrote is
 * ignored and, with consent, appends the `.gitignore` negations that keep it
 * tracked (it never *adds* ignore rules). See `reconcileGitignore`/`gitignore.ts`.
 *
 * After writing, `init` runs the same best-effort **outdated-release check** as
 * `auro context`/`auro component` (a bordered banner on stderr for any installed
 * package behind its latest release). This is the one network touch in an otherwise
 * offline command; `--offline` skips it and keeps the run fully network-free.
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
import {
  detectEditorSignals,
  EDITOR_TARGETS,
  type EditorSelection,
  type EditorTarget,
} from "#init/editors/detect.js";
import { verifyEditorWiring } from "#init/editors/verify.js";
import {
  type EditorWriteReport,
  writeEditorArtifacts,
} from "#init/editors/write.js";
import { groundingFiles } from "#init/generator.js";
import { findIgnored, unignore } from "#init/gitignore.js";
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
import { applyReset, planReset, type ResetPlan } from "#init/reset.js";
import { type ResolvedComponent, resolveInstalled } from "#init/resolver.js";
import { renderWarningBanner } from "#utils/banner.js";
import { checkOutdated, renderOutdatedBanner } from "#utils/outdated.js";

/** Options accepted by the `init` action. */
export interface InitOptions {
  /** Default tag prefix (e.g. `myapp-`) for components without an existing registration. */
  prefix?: string;
  /** Never prompt; take the prefix from `--prefix` or fail cleanly. */
  nonInteractive?: boolean;
  /** Alias for {@link nonInteractive}. */
  yes?: boolean;
  /**
   * Editor-target opt-ins. Each is **tri-state**: `true` (`--vscode`) forces the
   * target on, `false` (`--no-vscode`) forces it off, and `undefined` (neither
   * flag) leaves it to the persisted config → detection → prompt precedence. An
   * explicit flag always wins and is persisted for later runs.
   */
  vscode?: boolean;
  jsx?: boolean;
  svelte?: boolean;
  cssSnippets?: boolean;
  /**
   * Skip the best-effort network check for newer component releases. `init` is
   * otherwise offline; the release-check is its one network touch, so `--offline`
   * keeps the whole run network-free (useful in CI or air-gapped environments).
   */
  offline?: boolean;
  /**
   * Teardown mode: remove every file and config entry a previous `auro init` run
   * produced instead of generating. A pure reverse operation — needs no installed
   * components, prefix resolution, or network. See {@link runReset}.
   */
  reset?: boolean;
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

/** Human-facing label + artifact path for each editor target's confirm prompt. */
const EDITOR_TARGET_META: Record<
  EditorTarget,
  { label: string; artifact: string }
> = {
  vscode: {
    label: "VS Code HTML custom-data",
    artifact: ".vscode/auro.html-custom-data.json",
  },
  jsx: {
    label: "JSX/React type declarations",
    artifact: "auro-types/auro-jsx.d.ts",
  },
  svelte: {
    label: "Svelte type declarations",
    artifact: "auro-types/auro-svelte.d.ts",
  },
  cssSnippets: {
    label: "CSS ::part() snippets",
    artifact: ".vscode/auro.code-snippets",
  },
};

/**
 * Settle each editor target on/off under the frozen precedence
 * flag → persisted config → detection → interactive prompt. An explicit
 * `--vscode`/`--no-vscode` flag wins outright; else a settled `init.editors.*`
 * choice from a prior run is honored (no re-detect/re-prompt); else the target is
 * unsettled and its detected default is either offered as a confirm (interactive)
 * or taken as-is (non-interactive/CI — an editor target has a safe default, so
 * `init` never prompts or fails over it here). Every target is returned as a
 * concrete boolean so the caller can persist all three and later runs stay
 * deterministic.
 */
async function resolveEditorTargets(
  cwd: string,
  options: InitOptions,
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<EditorSelection> {
  const persisted = config?.init.editors;
  const signals = detectEditorSignals(cwd);
  const interactive = !isNonInteractive(options);

  const selection: EditorSelection = {
    vscode: false,
    jsx: false,
    svelte: false,
    cssSnippets: false,
  };
  const pending: Array<{
    type: "confirm";
    name: EditorTarget;
    message: string;
    default: boolean;
  }> = [];

  for (const target of EDITOR_TARGETS) {
    const flag = options[target];
    if (flag !== undefined) {
      selection[target] = flag; // explicit flag — highest precedence, persisted.
      continue;
    }
    const saved = persisted?.[target];
    if (saved !== undefined) {
      selection[target] = saved; // settled last run — honored as-is.
      continue;
    }
    // Unsettled: prompt on an interactive TTY, else take the detected default.
    if (interactive) {
      const { label, artifact } = EDITOR_TARGET_META[target];
      pending.push({
        type: "confirm",
        name: target,
        message: `Generate ${label} (${artifact})?`,
        default: signals[target],
      });
    } else {
      selection[target] = signals[target];
    }
  }

  if (pending.length > 0) {
    const answers =
      await inquirer.prompt<Record<EditorTarget, boolean>>(pending);
    for (const { name } of pending) {
      selection[name] = Boolean(answers[name]);
    }
  }

  return selection;
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
 * Compare each resolved component's installed version against the latest published
 * release and, for any that are behind, print the shared outdated banner on stderr
 * (advisory — stdout stays clean). Best-effort and network-dependent: a package
 * whose latest can't be resolved is treated as current (`checkOutdated`), so a flaky
 * or absent network simply yields no banner and never fails `init`. Mirrors
 * `auro context`'s `reportOutdated`; the pkg→version map is derived from the
 * components init already resolved (a monorepo pkg repeats with one shared version,
 * de-duped by the Map).
 */
async function reportOutdated(components: ResolvedComponent[]): Promise<void> {
  const installed = new Map(components.map((c) => [c.pkg, c.version]));
  const spinner = ora("Checking for newer component releases...").start();
  const outdated = await checkOutdated(installed);

  if (outdated.length === 0) {
    spinner.succeed("All installed Auro components are on the latest release.");
    return;
  }

  // Stop the spinner without its own icon/line — the banner below carries the
  // warning, and a leftover spinner line would dilute it.
  spinner.stop();
  console.error(renderOutdatedBanner(outdated));
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

  // Teardown short-circuit: reset is a pure reverse operation, so it runs before
  // any detection/resolution/network — it must work even when no components are
  // installed or the config is gone.
  if (options.reset) {
    await runReset(cwd, options);
    return;
  }

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

  // Settle the editor targets (may prompt) before the spinner so the confirm UI
  // and the spinner never fight for the terminal, then record all three in the
  // config we are about to persist so later runs honor them without re-detecting.
  const editorSelection = await resolveEditorTargets(cwd, options, config);
  plan.config.init.editors = editorSelection;

  const writeSpinner = ora("Writing generated files...").start();
  let editorReport: EditorWriteReport = { written: [], warnings: [] };
  try {
    for (const file of groundingFiles(components, plan.resolvedTags)) {
      await fs.writeFile(path.join(cwd, file.filename), file.contents, "utf-8");
    }
    // Write + wire the enabled editor artifacts (no-op when all targets are off).
    editorReport = await writeEditorArtifacts(
      cwd,
      components,
      plan.resolvedTags,
      editorSelection,
    );
    // Persist the authoritative config so regeneration is idempotent.
    saveConfig(cwd, plan.config);
    const editorNote =
      editorReport.written.length > 0
        ? ` Editor IntelliSense: ${editorReport.written.join(", ")}.`
        : "";
    writeSpinner.succeed(
      `Wrote ${AGENTS_FILENAME}, ${CLAUDE_FILENAME}, and ${CONFIG_FILENAME} for ${components.length} component(s).${editorNote}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeSpinner.fail(`Failed to write generated files: ${message}`);
    process.exit(1);
  }

  // Advisory only — keep warnings on stderr so a caller capturing stdout gets a
  // clean run. Warn, never guess: unresolvable registrations and bare fallbacks.
  // Editor-wiring merges that were skipped (malformed target file) warn too, with
  // the manual one-liner already baked in.
  for (const warning of editorReport.warnings) {
    console.error(`⚠ ${warning}`);
  }
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

  // Tag-reconciliation advisories (a grounded tag that may not match what the app
  // registers at runtime) silently break IntelliSense and are easy to miss among
  // the plain warnings above — surface them in a prominent red bordered banner,
  // the cousin of the outdated-release banner below.
  if (plan.reconciliationWarnings.length > 0) {
    console.error(
      renderWarningBanner(
        `⚠  ${plan.reconciliationWarnings.length} component tag(s) may not match your app's registered tags`,
        plan.reconciliationWarnings,
        "red",
      ),
    );
  }

  // Bare `auro-*` groundings — self-consistent but collision-prone. Less severe
  // than a reconciliation mismatch, so a yellow banner rather than red, but still
  // promoted above the plain-line noise so a missing prefix is hard to overlook.
  if (plan.noPrefixWarnings.length > 0) {
    console.error(
      renderWarningBanner(
        `⚠  ${plan.noPrefixWarnings.length} component(s) grounded under bare 'auro-*' tags — pass a prefix to avoid collisions`,
        plan.noPrefixWarnings,
        "yellow",
      ),
    );
  }

  // IntelliSense health check. `writeEditorArtifacts` above already wrote every
  // enabled target, but a merge can no-op against stale wiring whose artifact was
  // externally removed — leaving a settings pointer to a missing file. Read back
  // what actually landed; on a gap, re-run the idempotent writer once to self-heal,
  // then re-verify. A surviving gap is a red banner; a disabled markup target is a
  // yellow one, so absent `<auro-*>` completions are never a silent surprise.
  let verdict = verifyEditorWiring(cwd, editorSelection);
  if (verdict.inconsistencies.length > 0) {
    await writeEditorArtifacts(
      cwd,
      components,
      plan.resolvedTags,
      editorSelection,
    );
    verdict = verifyEditorWiring(cwd, editorSelection);
  }
  if (verdict.inconsistencies.length > 0) {
    console.error(
      renderWarningBanner(
        "⚠  Editor IntelliSense wiring is incomplete after writing",
        verdict.inconsistencies,
        "red",
      ),
    );
  }
  if (verdict.markupDisabled) {
    console.error(
      renderWarningBanner(
        "⚠  VS Code markup IntelliSense is off — no <auro-*> completions or hover docs",
        [
          "Type-checking may still work, but tag/attribute completions will not.",
          "Re-run `auro init --vscode` to generate them.",
        ],
        "yellow",
      ),
    );
  }

  // Git-ignore reconciliation. Every file above is meant to be committed so a team
  // and CI share one deterministic set; a `.gitignore` rule (commonly `.vscode/`)
  // silently drops one from version control. Detect any ignored path and — with
  // consent — append the negations that keep it tracked. Advisory: never fails.
  const touched = [
    ...new Set([
      AGENTS_FILENAME,
      CLAUDE_FILENAME,
      CONFIG_FILENAME,
      ...editorReport.written,
    ]),
  ];
  await reconcileGitignore(cwd, touched, options);

  // Advisory, network-dependent — mirror `auro context`. Warn last so it's the
  // final thing on screen, not scrolled off by the write summary and warnings.
  // `--offline` skips it, keeping the run fully network-free.
  if (!options.offline) {
    await reportOutdated(components);
  }
}

/**
 * Detect files `auro init` wrote that git would ignore (so they'd never be
 * committed) and, with consent, append `.gitignore` negations to re-include them.
 * A prominent red banner surfaces the problem; the fix is offered interactively
 * (confirm, default yes) or applied straight away under `--yes`. A pure
 * non-interactive/CI run without `--yes` only warns — it never edits `.gitignore`
 * unprompted. Advisory throughout: never throws, never exits. See `gitignore.ts`.
 */
async function reconcileGitignore(
  cwd: string,
  touched: string[],
  options: InitOptions,
): Promise<void> {
  const ignored = await findIgnored(cwd, touched);
  if (ignored.length === 0) {
    return;
  }

  console.error(
    renderWarningBanner(
      `⚠  ${ignored.length} file(s) auro init wrote are git-ignored and won't be committed`,
      [
        ...ignored,
        "These are meant to be committed so your team and CI share the same grounding/IntelliSense.",
      ],
      "red",
    ),
  );

  // Pure CI/non-interactive without --yes: warn only, never edit .gitignore unasked.
  if (isNonInteractive(options) && !options.yes) {
    console.error(
      "⚠ Un-ignore them in .gitignore (or re-run with --yes) so they get committed.",
    );
    return;
  }

  // Interactive without --yes: confirm before touching .gitignore. --yes: proceed.
  if (!options.yes) {
    const { fix } = await inquirer.prompt<{ fix: boolean }>([
      {
        type: "confirm",
        name: "fix",
        message:
          "Add entries to .gitignore so these files stay tracked (committed)?",
        default: true,
      },
    ]);
    if (!fix) {
      return;
    }
  }

  const { fixed, unfixable } = await unignore(cwd, ignored);
  if (fixed.length > 0) {
    console.error(
      `✔ Un-ignored ${fixed.length} file(s) in .gitignore so they will be committed.`,
    );
  }
  if (unfixable.length > 0) {
    console.error(
      renderWarningBanner(
        `⚠  ${unfixable.length} file(s) are still git-ignored — un-ignore them by hand`,
        [
          ...unfixable,
          "A parent directory is ignored by a rule auro init won't rewrite; edit .gitignore to re-include these paths.",
        ],
        "red",
      ),
    );
  }
}

/** True when a plan would remove or un-merge nothing (a no-op reset). */
function isEmptyResetPlan(plan: ResetPlan): boolean {
  return plan.filesToRemove.length === 0 && plan.unmerges.length === 0;
}

/**
 * Teardown for `auro init --reset`: reverse a previous `auro init` run. Plans the
 * removals read-only, shows them for an interactive confirm (skippable with
 * `--yes`/`--non-interactive`/CI), then applies and summarizes. Signature-guarded
 * files that could not be confirmed as ours are reported, not deleted; the one-way
 * formkit migration is never reversed (a note says so). See `reset.ts`.
 */
async function runReset(cwd: string, options: InitOptions): Promise<void> {
  const plan = planReset(cwd);

  if (isEmptyResetPlan(plan)) {
    // Nothing of ours on disk. Still surface skips (e.g. a hand-edited AGENTS.md)
    // so the user understands why an expected file was left alone.
    console.log("Nothing to reset — no `auro init` output found.");
    for (const skip of plan.filesToSkip) {
      console.error(`⚠ Left ${skip.path} in place: ${skip.reason}.`);
    }
    return;
  }

  // Show the exact teardown before touching disk.
  console.log("`auro init --reset` will:");
  for (const file of plan.filesToRemove) {
    console.log(`  • remove ${file}`);
  }
  for (const unmerge of plan.unmerges) {
    console.log(`  • remove the Auro entry from ${unmerge.path}`);
  }
  for (const dir of plan.dirsToPrune) {
    console.log(`  • remove ${dir}/ if it is left empty`);
  }
  for (const skip of plan.filesToSkip) {
    console.log(`  • keep ${skip.path} (${skip.reason})`);
  }

  if (!isNonInteractive(options)) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: "Remove these files and config entries?",
        default: false,
      },
    ]);
    if (!confirm) {
      console.log("Reset aborted — nothing was changed.");
      return;
    }
  }

  const resetSpinner = ora("Removing `auro init` output...").start();
  let report: ReturnType<typeof applyReset>;
  try {
    report = applyReset(cwd, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    resetSpinner.fail(`Failed to reset: ${message}`);
    process.exit(1);
  }

  const removedNote =
    report.removed.length > 0
      ? `Removed ${report.removed.length} file(s)`
      : "Removed no files";
  const unmergedNote =
    report.unmerged.length > 0
      ? `, un-merged ${report.unmerged.join(", ")}`
      : "";
  const prunedNote =
    report.prunedDirs.length > 0
      ? `, pruned ${report.prunedDirs.map((d) => `${d}/`).join(", ")}`
      : "";
  resetSpinner.succeed(`${removedNote}${unmergedNote}${prunedNote}.`);

  for (const warning of report.warnings) {
    console.error(`⚠ ${warning}`);
  }
  for (const skip of report.skipped) {
    console.error(`⚠ Left ${skip.path} in place: ${skip.reason}.`);
  }

  // `--reset` never reverses the one-way formkit migration (package.json edits +
  // import rewrites) — say so rather than leave the user assuming a clean slate.
  console.error(
    "ℹ Reset does not undo an `auro-formkit` migration. If you migrated a legacy standalone form package, revert those package.json and import changes with git.",
  );
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
  .option(
    "--offline",
    "Skip the network check for newer component releases",
    false,
  )
  .option(
    "--vscode",
    "Generate VS Code HTML custom-data IntelliSense (use --no-vscode to skip; default: auto-detect)",
  )
  .option("--no-vscode", "Skip the VS Code HTML custom-data artifact")
  .option(
    "--jsx",
    "Generate JSX/React type declarations (use --no-jsx to skip; default: auto-detect)",
  )
  .option("--no-jsx", "Skip the JSX/React type declarations")
  .option(
    "--svelte",
    "Generate Svelte type declarations (use --no-svelte to skip; default: auto-detect)",
  )
  .option("--no-svelte", "Skip the Svelte type declarations")
  .option(
    "--css-snippets",
    "Generate VS Code CSS ::part() snippets (use --no-css-snippets to skip; default: auto-detect)",
  )
  .option("--no-css-snippets", "Skip the VS Code CSS ::part() snippets")
  .option(
    "--reset",
    "Remove every file and config entry a previous `auro init` run created (does not undo an auro-formkit migration)",
    false,
  )
  .action(runInit);
