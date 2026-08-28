/**
 * Teardown for `auro init --reset`: reverse everything a previous `auro init`
 * run produced. Two phases so the command can show an accurate confirm list
 * before touching disk (mirroring registry.ts's plan/apply split):
 *
 *  - {@link planReset} — READ-ONLY. Stats each known artifact path, signature-
 *    guards the grounding files (`AGENTS.md`/`CLAUDE.md`) and the CLI config so an
 *    unrelated or hand-authored file is never deleted, and computes the two
 *    config un-merges (`.vscode/settings.json`, `tsconfig.json`/`jsconfig.json`).
 *  - {@link applyReset} — the only mutating step: delete the guarded files, write
 *    the un-merged configs, prune the now-empty `auro-types/` and `.vscode/` dirs.
 *
 * Sweeps the frozen artifact paths directly (layout constants) rather than
 * trusting `auro.config.json`, so a reset still works when that file was deleted
 * or corrupted. Deliberately does NOT reverse the one-way `auro-formkit`
 * migration codemod — that edits package.json + import specifiers and is not
 * safely reversible; the command notes this rather than guessing.
 *
 * @see docs/pt-m2-completion-plan.md and the `auro init` inventory in the
 *   `--reset` plan.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { CONFIG_FILENAME } from "#init/config.js";
import {
  CSS_SNIPPETS_PATH,
  FRAMEWORK_TYPES_DIR,
  HTML_CUSTOM_DATA_PATH,
  JSX_TYPES_PATH,
  SVELTE_TYPES_PATH,
  VSCODE_DIR,
  VSCODE_SETTINGS_FILENAME,
} from "#init/editors/layout.js";
import {
  type MergeResult,
  unmergeTsconfigInclude,
  unmergeVsCodeSettings,
} from "#init/editors/settings.js";
import {
  AGENTS_FILENAME,
  CLAUDE_FILENAME,
  CLAUDE_MD,
  GROUNDING_MARKER,
} from "#init/layout.js";
import { loadConfig, RegistryError } from "#init/registry.js";

/** A generated file that exists but did not pass its signature guard. */
export interface SkippedFile {
  /** Project-root-relative path (forward slashes). */
  path: string;
  /** Why it was left in place (shown to the user). */
  reason: string;
}

/** An un-merge to apply to one existing config file. */
interface ConfigUnmerge {
  /** Project-root-relative path (forward slashes). */
  path: string;
  /** The un-merge result (contents to write when `changed`). */
  result: MergeResult;
}

/** The read-only plan of what a reset will remove and un-merge. */
export interface ResetPlan {
  /** Root-relative paths that exist and passed their guard — safe to delete. */
  filesToRemove: string[];
  /** Files that exist but were left in place (failed a signature/parse guard). */
  filesToSkip: SkippedFile[];
  /** Config un-merges that actually change a file (only `changed` results). */
  unmerges: ConfigUnmerge[];
  /** Warnings from an un-merge that had to be skipped (unparseable config). */
  warnings: string[];
  /** Dirs to remove if empty after file removal, most-nested first. */
  dirsToPrune: string[];
}

/** What {@link applyReset} actually did. */
export interface ResetReport {
  /** Root-relative paths removed. */
  removed: string[];
  /** Root-relative config paths whose Auro entry was un-merged. */
  unmerged: string[];
  /** Root-relative dirs pruned because they were left empty. */
  prunedDirs: string[];
  /** Files left in place (carried through from the plan). */
  skipped: SkippedFile[];
  /** Advisory warnings (carried from the plan). */
  warnings: string[];
}

/** Absolute path for a forward-slash, root-relative artifact path. */
function toAbsolute(cwd: string, rel: string): string {
  return path.join(cwd, ...rel.split("/"));
}

/** True when `source` is JSONC for an object with no keys (`{}`, comments aside). */
function isEmptyObject(source: string): boolean {
  const data = parseJsonc(source, [], { allowTrailingComma: true }) as unknown;
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    Object.keys(data).length === 0
  );
}

/** Read a file as UTF-8, or `null` when it does not exist. */
function readOrNull(absolute: string): string | null {
  try {
    return readFileSync(absolute, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Editor artifacts carry unambiguous Auro-namespaced names, so their mere
 * presence is enough to remove them — no content signature needed.
 */
const UNCONDITIONAL_ARTIFACTS = [
  HTML_CUSTOM_DATA_PATH,
  CSS_SNIPPETS_PATH,
  JSX_TYPES_PATH,
  SVELTE_TYPES_PATH,
] as const;

/**
 * Classify a grounding file: `"remove"` when it carries the Auro signature,
 * `"skip"` with a reason when it exists but looks hand-authored/unrelated, or
 * `null` when it is absent. `AGENTS.md` is matched by the generated marker
 * comment; `CLAUDE.md` by exact equality with the thin generated body.
 */
function classifyGroundingFile(
  contents: string | null,
  kind: "agents" | "claude",
): "remove" | SkippedFile["reason"] | null {
  if (contents === null) {
    return null;
  }
  if (kind === "agents") {
    return contents.includes(GROUNDING_MARKER)
      ? "remove"
      : `not recognized as an \`auro init\` file (missing the "${GROUNDING_MARKER}" marker)`;
  }
  return contents.trim() === CLAUDE_MD.trim()
    ? "remove"
    : "contains content beyond the generated `@AGENTS.md` import";
}

/**
 * Plan a reset for `cwd` without touching disk. Sweeps every known artifact
 * path, signature-guards the grounding files and the CLI config, and computes
 * the two config un-merges against their current contents.
 */
export function planReset(cwd: string): ResetPlan {
  const filesToRemove: string[] = [];
  const filesToSkip: SkippedFile[] = [];
  const warnings: string[] = [];

  // Grounding files — signature-guarded so we never delete a file we cannot
  // confirm we authored.
  for (const [rel, kind] of [
    [AGENTS_FILENAME, "agents"],
    [CLAUDE_FILENAME, "claude"],
  ] as const) {
    const verdict = classifyGroundingFile(
      readOrNull(toAbsolute(cwd, rel)),
      kind,
    );
    if (verdict === "remove") {
      filesToRemove.push(rel);
    } else if (verdict !== null) {
      filesToSkip.push({ path: rel, reason: verdict });
    }
  }

  // auro.config.json — remove only when it parses as our config; a malformed or
  // unsupported-version file is surfaced, not nuked (it may not be ours).
  if (existsSync(toAbsolute(cwd, CONFIG_FILENAME))) {
    try {
      if (loadConfig(cwd)) {
        filesToRemove.push(CONFIG_FILENAME);
      }
    } catch (error) {
      const reason =
        error instanceof RegistryError ? error.message : String(error);
      filesToSkip.push({ path: CONFIG_FILENAME, reason });
    }
  }

  // Editor artifacts — unambiguous names, remove when present.
  for (const rel of UNCONDITIONAL_ARTIFACTS) {
    if (existsSync(toAbsolute(cwd, rel))) {
      filesToRemove.push(rel);
    }
  }

  // Config un-merges. settings.json is standalone; the TS include lives in the
  // first of tsconfig.json/jsconfig.json that exists (matches the write-side
  // "first existing wins" rule).
  const unmerges: ConfigUnmerge[] = [];
  const settingsRel = `${VSCODE_DIR}/${VSCODE_SETTINGS_FILENAME}`;
  const settingsContents = readOrNull(toAbsolute(cwd, settingsRel));
  if (settingsContents !== null) {
    const result = unmergeVsCodeSettings(settingsContents);
    if (result.warning) {
      warnings.push(result.warning);
    } else if (result.changed) {
      // Removing our entry emptied the object → the file held only our entry, so
      // `auro init` created it. Delete it (a faithful teardown, and so the
      // `.vscode/` prune below can reclaim a now-empty dir) rather than leaving a
      // stray `{}` that a later run only survives on by accident.
      if (isEmptyObject(result.contents)) {
        filesToRemove.push(settingsRel);
      } else {
        unmerges.push({ path: settingsRel, result });
      }
    }
  }
  for (const configRel of ["tsconfig.json", "jsconfig.json"]) {
    const contents = readOrNull(toAbsolute(cwd, configRel));
    if (contents === null) {
      continue;
    }
    const result = unmergeTsconfigInclude(contents, undefined, configRel);
    if (result.warning) {
      warnings.push(result.warning);
    } else if (result.changed) {
      unmerges.push({ path: configRel, result });
    }
    // Only the first existing config is authoritative; stop after it.
    break;
  }

  return {
    filesToRemove,
    filesToSkip,
    unmerges,
    warnings,
    dirsToPrune: [FRAMEWORK_TYPES_DIR, VSCODE_DIR],
  };
}

/** True when the directory exists and holds no entries. */
function isEmptyDir(absolute: string): boolean {
  try {
    return readdirSync(absolute).length === 0;
  } catch {
    return false;
  }
}

/**
 * Execute a {@link planReset} result: delete the guarded files, write the
 * un-merged configs, and prune the artifact dirs left empty. Idempotent — a
 * second run over an already-clean project removes nothing.
 */
export function applyReset(cwd: string, plan: ResetPlan): ResetReport {
  const removed: string[] = [];
  for (const rel of plan.filesToRemove) {
    rmSync(toAbsolute(cwd, rel), { force: true });
    removed.push(rel);
  }

  const unmerged: string[] = [];
  for (const { path: rel, result } of plan.unmerges) {
    writeFileSync(toAbsolute(cwd, rel), result.contents, "utf-8");
    unmerged.push(rel);
  }

  const prunedDirs: string[] = [];
  for (const rel of plan.dirsToPrune) {
    const absolute = toAbsolute(cwd, rel);
    if (isEmptyDir(absolute)) {
      rmdirSync(absolute);
      prunedDirs.push(rel);
    }
  }

  return {
    removed,
    unmerged,
    prunedDirs,
    skipped: plan.filesToSkip,
    warnings: plan.warnings,
  };
}
