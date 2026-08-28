/**
 * Non-destructive, idempotent merges of the two consumer config files `auro init`
 * wires the editor artifacts into: `.vscode/settings.json` (registers the HTML
 * custom-data file) and `tsconfig.json` (puts the framework `.d.ts` bundles on
 * the TypeScript program). Both are pure `(existing, entry) → MergeResult`
 * string transforms — reading and writing are the caller's job.
 *
 * Comment- and formatting-preserving via `jsonc-parser`'s surgical `modify` /
 * `applyEdits` (never a parse-then-stringify round-trip, which would strip a
 * consumer's comments and reorder their keys). Every merge:
 *  - creates the key/file when absent, appends when present, and is a no-op when
 *    the Auro entry is already there (idempotent — re-running `init` never
 *    duplicates or reorders);
 *  - refuses to touch a file it cannot cleanly parse, returning a `warning`
 *    instead of throwing so the command can still write the artifact and print
 *    the manual one-liner.
 *
 * @see docs/pt-m2-completion-plan.md → "Frozen decisions → settings.json merge"
 *   and the tsconfig four-branch decision tree.
 */

import {
  applyEdits,
  modify,
  type ParseError,
  parse as parseJsonc,
} from "jsonc-parser";
import {
  HTML_CUSTOM_DATA_SETTINGS_ENTRY,
  HTML_CUSTOM_DATA_SETTINGS_KEY,
  TSCONFIG_INCLUDE_ENTRY,
  TSCONFIG_INCLUDE_KEY,
} from "#init/editors/layout.js";

/** The outcome of a config-file merge. */
export interface MergeResult {
  /**
   * The file contents to write. When {@link changed} is false this is the input
   * verbatim (the caller may skip the write entirely).
   */
  contents: string;
  /** True when the merge produced an edit the caller should write. */
  changed: boolean;
  /**
   * Set when the merge was skipped because the file could not be safely edited
   * (unparseable, or the target key holds an unexpected type). The caller surfaces
   * it as a warning and falls back to printing the manual wiring line.
   */
  warning?: string;
}

/** 2-space, spaces-not-tabs — the prevailing style for these config files. */
const FORMATTING = { tabSize: 2, insertSpaces: true } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse `source` as JSONC, returning the object or a reason it can't be edited.
 * An empty/whitespace-only file is treated as an empty object (the merge will
 * create it). Any syntax error, or a root that isn't an object, is refused —
 * we never guess at a malformed file's intent.
 */
function parseObject(
  source: string,
  label: string,
): { data: Record<string, unknown> } | { warning: string } {
  if (source.trim() === "") {
    return { data: {} };
  }
  const errors: ParseError[] = [];
  const data = parseJsonc(source, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    return { warning: `${label} is not valid JSON — leaving it untouched.` };
  }
  if (!isPlainObject(data)) {
    return { warning: `${label} is not a JSON object — leaving it untouched.` };
  }
  return { data };
}

/**
 * Apply a single value edit at `path` to `source` (an empty file becomes `{}`
 * first so `modify` has an object to edit into), preserving surrounding comments
 * and formatting.
 */
function applyValueEdit(
  source: string,
  path: string[],
  value: unknown,
): string {
  const base = source.trim() === "" ? "{}" : source;
  const edits = modify(base, path, value, { formattingOptions: FORMATTING });
  return applyEdits(base, edits);
}

/**
 * Surgically remove the property at `path` from `source`, preserving surrounding
 * comments and formatting. `modify(..., undefined, ...)` emits the delete edit;
 * `applyEdits` splices it in without a parse-then-stringify round-trip. The
 * inverse of {@link applyValueEdit}, used by the un-merge helpers below.
 */
function applyKeyDeletion(source: string, path: string[]): string {
  const edits = modify(source, path, undefined, {
    formattingOptions: FORMATTING,
  });
  return applyEdits(source, edits);
}

/**
 * Register the HTML custom-data file in `.vscode/settings.json` under
 * `html.customData`, appending non-destructively:
 *  - absent → create the key as a one-element array;
 *  - a string (VS Code allows a bare string) → normalise to `[existing, entry]`;
 *  - an array → append the entry if missing;
 *  - already present (string or array) → no-op;
 *  - any other type → refuse and warn.
 */
export function mergeVsCodeSettings(
  existing: string,
  entry: string = HTML_CUSTOM_DATA_SETTINGS_ENTRY,
): MergeResult {
  const parsed = parseObject(existing, ".vscode/settings.json");
  if ("warning" in parsed) {
    return { contents: existing, changed: false, warning: parsed.warning };
  }

  const current = parsed.data[HTML_CUSTOM_DATA_SETTINGS_KEY];

  let nextValue: string[];
  if (current === undefined) {
    nextValue = [entry];
  } else if (typeof current === "string") {
    if (current === entry) {
      return { contents: existing, changed: false };
    }
    nextValue = [current, entry];
  } else if (Array.isArray(current)) {
    if (current.includes(entry)) {
      return { contents: existing, changed: false };
    }
    nextValue = [...(current as string[]), entry];
  } else {
    return {
      contents: existing,
      changed: false,
      warning: `.vscode/settings.json "${HTML_CUSTOM_DATA_SETTINGS_KEY}" is not a string or array — leaving it untouched.`,
    };
  }

  const contents = applyValueEdit(
    existing,
    [HTML_CUSTOM_DATA_SETTINGS_KEY],
    nextValue,
  );
  return { contents, changed: true };
}

/**
 * Put the framework types dir on the TypeScript program via a `tsconfig.json` or
 * `jsconfig.json` (identical `include`/`files` schema — a JS Svelte/JSX project
 * uses the `jsconfig.json` variant), following the four-branch decision tree that
 * keeps the default `**` + `/*` include working:
 *  1. `include` present (array) → append the entry if missing.
 *  2. `files` present, no `include` → specifying `files` suppresses the default
 *     glob, so add `include: [entry]` to bring the types back in.
 *  3. neither `files` nor `include` → the default glob already picks up the
 *     non-dotted types dir; **do not edit** (no-op, no warning).
 *  4. `include` present but not an array, or the file is unparseable → refuse
 *     and warn.
 *
 * `configName` is used only for the parse/refusal messages so they name the file
 * actually being merged. Idempotent: an entry already in `include` is a no-op.
 */
export function mergeTsconfigInclude(
  existing: string,
  entry: string = TSCONFIG_INCLUDE_ENTRY,
  configName = "tsconfig.json",
): MergeResult {
  const parsed = parseObject(existing, configName);
  if ("warning" in parsed) {
    return { contents: existing, changed: false, warning: parsed.warning };
  }

  const { data } = parsed;
  const include = data[TSCONFIG_INCLUDE_KEY];

  // Branch 1: an existing include array — append if the entry isn't there.
  if (Array.isArray(include)) {
    if (include.includes(entry)) {
      return { contents: existing, changed: false };
    }
    const contents = applyValueEdit(
      existing,
      [TSCONFIG_INCLUDE_KEY],
      [...(include as string[]), entry],
    );
    return { contents, changed: true };
  }

  // Branch 4a: include present but the wrong type — don't guess at it.
  if (include !== undefined) {
    return {
      contents: existing,
      changed: false,
      warning: `${configName} "${TSCONFIG_INCLUDE_KEY}" is not an array — leaving it untouched.`,
    };
  }

  // Branch 2: `files` suppresses the default glob, so an include is required.
  if ("files" in data) {
    const contents = applyValueEdit(existing, [TSCONFIG_INCLUDE_KEY], [entry]);
    return { contents, changed: true };
  }

  // Branch 3: neither key — the default glob already covers the non-dotted dir.
  return { contents: existing, changed: false };
}

/**
 * Reverse {@link mergeVsCodeSettings}: remove the HTML custom-data entry from
 * `.vscode/settings.json` `html.customData`, the un-merge `auro init --reset`
 * applies. Non-destructive and idempotent — only our own entry is touched:
 *  - an array containing `entry` → drop it; if that empties the array, delete
 *    the whole key (so no dangling `"html.customData": []` is left behind);
 *  - a bare string equal to `entry` → delete the key;
 *  - `entry` absent, key absent, or the value is some other type → no-op (there
 *    is nothing of ours to remove);
 *  - unparseable file → refuse and warn, same contract as the merge.
 */
export function unmergeVsCodeSettings(
  existing: string,
  entry: string = HTML_CUSTOM_DATA_SETTINGS_ENTRY,
): MergeResult {
  const parsed = parseObject(existing, ".vscode/settings.json");
  if ("warning" in parsed) {
    return { contents: existing, changed: false, warning: parsed.warning };
  }

  const current = parsed.data[HTML_CUSTOM_DATA_SETTINGS_KEY];

  if (typeof current === "string") {
    if (current !== entry) {
      return { contents: existing, changed: false };
    }
    const contents = applyKeyDeletion(existing, [
      HTML_CUSTOM_DATA_SETTINGS_KEY,
    ]);
    return { contents, changed: true };
  }

  if (Array.isArray(current)) {
    if (!current.includes(entry)) {
      return { contents: existing, changed: false };
    }
    const remaining = (current as string[]).filter((v) => v !== entry);
    const contents =
      remaining.length === 0
        ? applyKeyDeletion(existing, [HTML_CUSTOM_DATA_SETTINGS_KEY])
        : applyValueEdit(existing, [HTML_CUSTOM_DATA_SETTINGS_KEY], remaining);
    return { contents, changed: true };
  }

  // Absent or an unexpected type — nothing of ours to remove.
  return { contents: existing, changed: false };
}

/**
 * Reverse {@link mergeTsconfigInclude}: remove the framework-types entry from a
 * `tsconfig.json`/`jsconfig.json` `include` array, the un-merge
 * `auro init --reset` applies. Non-destructive and idempotent:
 *  - an `include` array containing `entry` → drop it; if that empties the array,
 *    delete the `include` key entirely (restoring the default-glob branch the
 *    merge relied on when it created a single-entry include);
 *  - `include` not an array, absent, or without `entry` → no-op;
 *  - unparseable file → refuse and warn.
 */
export function unmergeTsconfigInclude(
  existing: string,
  entry: string = TSCONFIG_INCLUDE_ENTRY,
  configName = "tsconfig.json",
): MergeResult {
  const parsed = parseObject(existing, configName);
  if ("warning" in parsed) {
    return { contents: existing, changed: false, warning: parsed.warning };
  }

  const include = parsed.data[TSCONFIG_INCLUDE_KEY];
  if (!Array.isArray(include) || !include.includes(entry)) {
    return { contents: existing, changed: false };
  }

  const remaining = (include as string[]).filter((v) => v !== entry);
  const contents =
    remaining.length === 0
      ? applyKeyDeletion(existing, [TSCONFIG_INCLUDE_KEY])
      : applyValueEdit(existing, [TSCONFIG_INCLUDE_KEY], remaining);
  return { contents, changed: true };
}
