/**
 * Orchestration seam for the editor-IntelliSense targets: given the resolved
 * component set, the tag map, and the settled per-target selection, build the
 * enabled artifacts, write them under the project root, and merge their wiring
 * into `.vscode/settings.json` / `tsconfig.json`. Returns a report the command
 * turns into its success summary and stderr warnings.
 *
 * This is the "impure" bookend to the pure per-target builders
 * (./htmlCustomData.ts, ./jsxTypes.ts, ./svelteTypes.ts) and the pure config
 * merges (./settings.ts): those decide *what* the files should contain; this
 * module decides *where* they land and *whether* a merge is safe, doing the actual
 * `mkdir`/`writeFile`/`readFile`. Every merge is non-destructive and idempotent
 * (see ./settings.ts); a merge that can't be applied cleanly degrades to a warning
 * carrying the manual one-liner, and the artifact is still written regardless.
 *
 * @see docs/pt-m2-completion-plan.md → "Frozen decisions → Artifact locations +
 *   editor wiring / settings.json merge / tsconfig four-branch tree" and
 *   build-order step 3.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { EditorSelection } from "#init/editors/detect.js";
import { buildHtmlCustomData } from "#init/editors/htmlCustomData.js";
import { buildJsxTypes } from "#init/editors/jsxTypes.js";
import {
  HTML_CUSTOM_DATA_SETTINGS_ENTRY,
  HTML_CUSTOM_DATA_SETTINGS_KEY,
  TSCONFIG_INCLUDE_ENTRY,
  TSCONFIG_INCLUDE_KEY,
  VSCODE_DIR,
  VSCODE_SETTINGS_FILENAME,
} from "#init/editors/layout.js";
import type { EditorArtifact } from "#init/editors/manifest.js";
import {
  mergeTsconfigInclude,
  mergeVsCodeSettings,
} from "#init/editors/settings.js";
import { buildSvelteTypes } from "#init/editors/svelteTypes.js";
import type { ResolvedComponent } from "#init/resolver.js";

/** Outcome of writing the enabled editor artifacts and wiring. */
export interface EditorWriteReport {
  /**
   * Project-root-relative paths of the files created or updated (artifacts plus
   * any settings/tsconfig files a merge actually changed), in write order — the
   * command lists these in its success message.
   */
  written: string[];
  /**
   * Advisory warnings for merges that were skipped (unparseable file, or the
   * target key held an unexpected type). Each already includes the manual wiring
   * one-liner; the command prints them on stderr. The artifact itself is still
   * written, so IntelliSense works once the consumer adds the line by hand.
   */
  warnings: string[];
}

/** Absolute path for an artifact's forward-slash, root-relative `filename`. */
function toAbsolute(cwd: string, filename: string): string {
  return path.join(cwd, ...filename.split("/"));
}

/** Write one artifact, creating its parent directory if needed. */
async function writeArtifact(
  cwd: string,
  artifact: EditorArtifact,
): Promise<string> {
  const absolute = toAbsolute(cwd, artifact.filename);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, artifact.contents, "utf-8");
  return artifact.filename;
}

/** Read a file, or `""` when it does not exist (any other error propagates). */
async function readOrEmpty(absolute: string): Promise<string> {
  try {
    return await fs.readFile(absolute, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

/**
 * Build, write, and wire every **enabled** editor target. Disabled targets are
 * skipped entirely — no artifact, no directory, no merge (so `init` never creates
 * `.vscode/` or `auro-types/` for a target the consumer turned off). The tsconfig
 * merge runs once when either the JSX or Svelte target is on, and only when a
 * `tsconfig.json` already exists (absent → the default program glob already picks
 * up the non-dotted `auro-types/`, so there is nothing to wire).
 */
export async function writeEditorArtifacts(
  cwd: string,
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string>,
  selection: EditorSelection,
): Promise<EditorWriteReport> {
  const written: string[] = [];
  const warnings: string[] = [];

  if (selection.vscode) {
    written.push(
      await writeArtifact(cwd, buildHtmlCustomData(components, resolvedTags)),
    );

    // Register the custom-data file in .vscode/settings.json (created if absent).
    const settingsRel = `${VSCODE_DIR}/${VSCODE_SETTINGS_FILENAME}`;
    const settingsAbs = toAbsolute(cwd, settingsRel);
    const merged = mergeVsCodeSettings(await readOrEmpty(settingsAbs));
    if (merged.warning) {
      warnings.push(
        `${merged.warning} Add "${HTML_CUSTOM_DATA_SETTINGS_ENTRY}" to "${HTML_CUSTOM_DATA_SETTINGS_KEY}" in ${settingsRel} by hand.`,
      );
    } else if (merged.changed) {
      await fs.mkdir(path.dirname(settingsAbs), { recursive: true });
      await fs.writeFile(settingsAbs, merged.contents, "utf-8");
      written.push(settingsRel);
    }
  }

  if (selection.jsx) {
    written.push(
      await writeArtifact(cwd, buildJsxTypes(components, resolvedTags)),
    );
  }

  if (selection.svelte) {
    written.push(
      await writeArtifact(cwd, buildSvelteTypes(components, resolvedTags)),
    );
  }

  // A single tsconfig wiring covers both TS-consuming targets. Only touch an
  // existing tsconfig.json — its absence is the "default glob covers it" branch.
  if (selection.jsx || selection.svelte) {
    const tsconfigRel = "tsconfig.json";
    const tsconfigAbs = path.join(cwd, tsconfigRel);
    const existing = await readOrEmpty(tsconfigAbs);
    if (existing !== "") {
      const merged = mergeTsconfigInclude(existing);
      if (merged.warning) {
        warnings.push(
          `${merged.warning} Add "${TSCONFIG_INCLUDE_ENTRY}" to "${TSCONFIG_INCLUDE_KEY}" in ${tsconfigRel} by hand.`,
        );
      } else if (merged.changed) {
        await fs.writeFile(tsconfigAbs, merged.contents, "utf-8");
        written.push(tsconfigRel);
      }
    }
  }

  return { written, warnings };
}
