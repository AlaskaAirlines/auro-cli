/**
 * Frozen locations and editor-wiring keys for the IntelliSense artifacts
 * `auro init` emits (PT-M2). This is the editor-target analogue of
 * ../layout.ts: it owns the input-INDEPENDENT shape only — the artifact
 * filenames, the directories they live in, and the settings/tsconfig keys the
 * command merges into — not the generated contents (the per-target builders in
 * ./htmlCustomData.ts, ./jsxTypes.ts, ./svelteTypes.ts fill those around these
 * constants, and must not re-derive them).
 *
 * FROZEN per docs/pt-m2-completion-plan.md → build-order step 1 ("Freeze the
 * filenames/paths/wiring-key shapes") and "Frozen decisions → Artifact locations
 * + editor wiring". Composite paths are DERIVED from their parts below so a single
 * edit can never leave the artifact path and its wiring entry disagreeing.
 *
 * @see test/fixtures/init/editors/ for the golden artifacts these pin.
 */

// ---------------------------------------------------------------------------
// VS Code HTML custom-data (HTML Language Server target)
// ---------------------------------------------------------------------------

/** Project-root directory VS Code reads editor data and settings from. */
export const VSCODE_DIR = ".vscode";

/** The VS Code settings file merged non-destructively for the HTML target. */
export const VSCODE_SETTINGS_FILENAME = "settings.json";

/**
 * Auro-namespaced HTML custom-data artifact. The `auro.` prefix keeps it from
 * colliding with a team's own or another tool's custom-data file.
 */
export const HTML_CUSTOM_DATA_FILENAME = "auro.html-custom-data.json";

/** The `settings.json` key that loads HTML custom-data files. */
export const HTML_CUSTOM_DATA_SETTINGS_KEY = "html.customData";

/**
 * Path recorded in `settings.json` under {@link HTML_CUSTOM_DATA_SETTINGS_KEY}.
 * Per VS Code's rule this is **relative to the project root**, not to the settings
 * file, and always uses forward slashes (JSON + VS Code, every OS). Derived from
 * the dir + filename so it cannot drift from the file we actually write.
 */
export const HTML_CUSTOM_DATA_SETTINGS_ENTRY = `./${VSCODE_DIR}/${HTML_CUSTOM_DATA_FILENAME}`;

/**
 * The HTML custom-data artifact's path **relative to the project root** — the
 * `filename` a builder returns and `init` writes. Same target as
 * {@link HTML_CUSTOM_DATA_SETTINGS_ENTRY} without the leading `./` (a path to
 * write vs. a settings-file entry). Forward slashes; `init` splits on `/` to join.
 */
export const HTML_CUSTOM_DATA_PATH = `${VSCODE_DIR}/${HTML_CUSTOM_DATA_FILENAME}`;

// ---------------------------------------------------------------------------
// Framework TypeScript types (TS + Svelte language-server targets)
// ---------------------------------------------------------------------------

/**
 * Directory holding the generated framework `.d.ts` bundles, at the project root.
 *
 * The **non-dotted** name is deliberate and evidence-driven: TypeScript's default
 * `include` glob (`**` + `/*`, used when a project sets neither `include` nor
 * `files`) skips dot-prefixed directories, so a `.auro/` dir would be silently
 * invisible to default-include projects — whereas `auro-types/` is auto-picked-up
 * with zero tsconfig edits. See docs/pt-m2-completion-plan.md → resolved Risk
 * "Consumer tsconfig variance".
 */
export const FRAMEWORK_TYPES_DIR = "auro-types";

/** JSX / React type declarations (augments `JSX.IntrinsicElements`). */
export const JSX_TYPES_FILENAME = "auro-jsx.d.ts";

/** Svelte type declarations (augments Svelte element types). */
export const SVELTE_TYPES_FILENAME = "auro-svelte.d.ts";

/**
 * The JSX `.d.ts` bundle's path **relative to the project root** — the `filename`
 * its builder returns and `init` writes. Derived from the types dir + filename so
 * it always lands where {@link TSCONFIG_INCLUDE_ENTRY} points. Forward slashes.
 */
export const JSX_TYPES_PATH = `${FRAMEWORK_TYPES_DIR}/${JSX_TYPES_FILENAME}`;

/**
 * The Svelte `.d.ts` bundle's path **relative to the project root** — the
 * `filename` its builder returns and `init` writes. Derived from the types dir +
 * filename so it always lands where {@link TSCONFIG_INCLUDE_ENTRY} points.
 */
export const SVELTE_TYPES_PATH = `${FRAMEWORK_TYPES_DIR}/${SVELTE_TYPES_FILENAME}`;

/** The `tsconfig.json` key that puts declaration files on the TypeScript program. */
export const TSCONFIG_INCLUDE_KEY = "include";

/**
 * Entry appended to `tsconfig.json` `include` to pull in the framework types.
 * Equal to {@link FRAMEWORK_TYPES_DIR} by construction so the wiring can never
 * point somewhere other than where the files are written.
 */
export const TSCONFIG_INCLUDE_ENTRY = FRAMEWORK_TYPES_DIR;
