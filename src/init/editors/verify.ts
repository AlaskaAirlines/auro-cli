/**
 * Post-write health check for the editor-IntelliSense targets. `auro init` writes
 * the artifacts and merges their wiring (./write.ts), then calls this to confirm
 * what actually landed on disk — so the command can **self-heal** a target whose
 * artifact or wiring went missing, and **loudly warn** when the markup-completion
 * (VS Code) target is off, instead of finishing "successfully" with silently-broken
 * IntelliSense.
 *
 * Read-only (mirrors reset.ts's `readOrNull`): it never writes. Two failure kinds:
 *  - {@link EditorWiringVerdict.inconsistencies} — an *enabled* target whose file or
 *    config wiring is absent/incomplete on disk. The caller re-runs the idempotent
 *    writer once to repair, then re-verifies.
 *  - {@link EditorWiringVerdict.markupDisabled} — the VS Code target resolved off, so
 *    `<auro-*>` tag/attribute completions and hover docs are not generated at all.
 *    The Svelte/JSX `.d.ts` type-checking layer can still be on, which masks this —
 *    the caller surfaces it so a missing markup layer is never a silent surprise.
 *
 * @see src/commands/init.ts (the caller), ./write.ts (the writer this guards),
 *   ./settings.ts (the merge whose result this reads back).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { EditorSelection } from "#init/editors/detect.js";
import {
  HTML_CUSTOM_DATA_PATH,
  HTML_CUSTOM_DATA_SETTINGS_ENTRY,
  HTML_CUSTOM_DATA_SETTINGS_KEY,
  JSX_TYPES_PATH,
  SVELTE_TYPES_PATH,
  TSCONFIG_INCLUDE_ENTRY,
  TSCONFIG_INCLUDE_KEY,
  VSCODE_DIR,
  VSCODE_SETTINGS_FILENAME,
} from "#init/editors/layout.js";

/** Outcome of a {@link verifyEditorWiring} pass. */
export interface EditorWiringVerdict {
  /**
   * One message per **enabled** target whose artifact or wiring is missing or
   * incomplete on disk. Empty when every enabled target is fully wired. The caller
   * treats a non-empty list as "re-run the writer to repair, then re-check".
   */
  inconsistencies: string[];
  /**
   * True when the VS Code (markup-completion) target is off. With Auro components
   * installed this means no `<auro-*>` completions/hover are generated — the caller
   * warns and points at `--vscode`.
   */
  markupDisabled: boolean;
}

/** Absolute path for a forward-slash, root-relative artifact path. */
function toAbsolute(cwd: string, rel: string): string {
  return path.join(cwd, ...rel.split("/"));
}

/** Read a file as UTF-8, or `null` when it does not exist / cannot be read. */
function readOrNull(absolute: string): string | null {
  try {
    return readFileSync(absolute, "utf-8");
  } catch {
    return null;
  }
}

/**
 * True when `.vscode/settings.json` registers the HTML custom-data entry under
 * `html.customData` (as a bare string or inside the array). A missing/unparseable
 * file, or the key holding some other type, counts as "not registered".
 */
function settingsHasPointer(cwd: string): boolean {
  const contents = readOrNull(
    toAbsolute(cwd, `${VSCODE_DIR}/${VSCODE_SETTINGS_FILENAME}`),
  );
  if (contents === null) {
    return false;
  }
  const data = parseJsonc(contents, [], { allowTrailingComma: true }) as
    | Record<string, unknown>
    | undefined;
  const value = data?.[HTML_CUSTOM_DATA_SETTINGS_KEY];
  if (typeof value === "string") {
    return value === HTML_CUSTOM_DATA_SETTINGS_ENTRY;
  }
  if (Array.isArray(value)) {
    return value.includes(HTML_CUSTOM_DATA_SETTINGS_ENTRY);
  }
  return false;
}

/**
 * True when the framework-types dir is on the TypeScript program: either no
 * `tsconfig.json`/`jsconfig.json` exists (the default glob already covers the
 * non-dotted `auro-types/`), or the first one that exists lists the entry in its
 * `include` array. A `files`-only or wrong-typed `include` config counts as "not
 * wired" — the writer would have had to add it, so its absence is a real gap.
 */
function tsProgramIncludesTypes(cwd: string): boolean {
  for (const configRel of ["tsconfig.json", "jsconfig.json"]) {
    const contents = readOrNull(path.join(cwd, configRel));
    if (contents === null) {
      continue;
    }
    const data = parseJsonc(contents, [], { allowTrailingComma: true }) as
      | Record<string, unknown>
      | undefined;
    // Only the first existing config is authoritative (matches the writer's
    // branch selection in `mergeTsconfigInclude`).
    const include = data?.[TSCONFIG_INCLUDE_KEY];
    if (Array.isArray(include)) {
      // Branch 1: include array — wired iff it lists the entry.
      return include.includes(TSCONFIG_INCLUDE_ENTRY);
    }
    if (include !== undefined) {
      // Branch 4a: wrong-typed include — the writer refuses, so it's not wired.
      return false;
    }
    if ("files" in (data ?? {})) {
      // Branch 2: `files` suppresses the default glob, so an include is
      // required; its absence here is a real gap.
      return false;
    }
    // Branch 3: neither key — the default glob already covers `auro-types/`.
    return true;
  }
  // Neither config exists — the default include glob picks up `auro-types/`.
  return true;
}

/**
 * Check that every **enabled** editor target's artifact and wiring is present on
 * disk, and report whether the markup-completion target is off. Pure reads — safe
 * to call after {@link writeEditorArtifacts} on any run.
 */
export function verifyEditorWiring(
  cwd: string,
  selection: EditorSelection,
): EditorWiringVerdict {
  const inconsistencies: string[] = [];

  if (selection.vscode) {
    if (!existsSync(toAbsolute(cwd, HTML_CUSTOM_DATA_PATH))) {
      inconsistencies.push(
        `${HTML_CUSTOM_DATA_PATH} is missing — VS Code markup completions will not work.`,
      );
    }
    if (!settingsHasPointer(cwd)) {
      inconsistencies.push(
        `${VSCODE_DIR}/${VSCODE_SETTINGS_FILENAME} does not register "${HTML_CUSTOM_DATA_SETTINGS_ENTRY}" under "${HTML_CUSTOM_DATA_SETTINGS_KEY}".`,
      );
    }
  }

  if (selection.svelte && !existsSync(toAbsolute(cwd, SVELTE_TYPES_PATH))) {
    inconsistencies.push(`${SVELTE_TYPES_PATH} is missing.`);
  }
  if (selection.jsx && !existsSync(toAbsolute(cwd, JSX_TYPES_PATH))) {
    inconsistencies.push(`${JSX_TYPES_PATH} is missing.`);
  }
  // A single include wires both TS targets — check it once when either is on.
  if ((selection.svelte || selection.jsx) && !tsProgramIncludesTypes(cwd)) {
    inconsistencies.push(
      `${TSCONFIG_INCLUDE_ENTRY} is not on the TypeScript program (missing from "${TSCONFIG_INCLUDE_KEY}").`,
    );
  }

  return { inconsistencies, markupDisabled: !selection.vscode };
}
