/**
 * Frozen schema for the CLI-owned `auro.config.json` file that `auro init` reads
 * and rewrites on every regeneration.
 *
 * See docs/pt-m1-completion-plan.md → "Frozen decisions → CLI-owned config
 * location/shape". This shape is FROZEN: do not change it without bumping
 * {@link CONFIG_VERSION} and shipping a migration. The top-level `version` field
 * exists from v1 precisely so any future change is an explicit migration rather
 * than a guess (the ticket's "freeze the format early / bus-factor" requirement).
 *
 * The one sanctioned exception is adding an **optional** field: a v1 reader treats
 * its absence as "unresolved", so a v1 file written before the field existed stays
 * valid without migration. {@link EditorsConfig} (PT-M2) is such a field — see
 * docs/pt-m2-completion-plan.md → "Frozen decisions → Config schema extension is
 * additive — no version bump". A *breaking* change still requires the bump above.
 */

/** Current on-disk config format version. Bump only alongside a migration. */
export const CONFIG_VERSION = 1 as const;

/** The dedicated project-root file `auro init` reads and writes. */
export const CONFIG_FILENAME = "auro.config.json";

/**
 * Custom-element registration prefixing.
 * - `default` applies to every installed component that has no override.
 * - `overrides` map a bare `auro-*` tag (the stable component identity, and the
 *   resolver's canonical `tagName`) to the resolved custom tag.
 */
export interface PrefixConfig {
  /** Prefix applied to unregistered components, e.g. `"myapp-"`. */
  default: string;
  /** Per-component custom tags, keyed by the bare `auro-*` tag. */
  overrides: Record<string, string>;
}

/**
 * Per-editor-target opt-in for the IntelliSense artifacts `auro init` can
 * additionally emit (PT-M2). Each key is **optional and tri-state**: `true` /
 * `false` is a settled choice that later runs (including CI) honor without
 * re-detecting or re-prompting; **absence means "unresolved"** — the target is
 * auto-detected/prompted on the next interactive run. The whole block is optional
 * so a PT-M1 v1 file that predates it stays valid (see {@link AuroConfig} doc).
 *
 * @see docs/pt-m2-completion-plan.md → "Frozen decisions → Detection / prompt / flags".
 */
export interface EditorsConfig {
  /** VS Code HTML custom-data (`.vscode/auro.html-custom-data.json`). */
  vscode?: boolean;
  /** JSX/React type declarations (`auro-types/auro-jsx.d.ts`). */
  jsx?: boolean;
  /** Svelte type declarations (`auro-types/auro-svelte.d.ts`). */
  svelte?: boolean;
}

/** The `init`-namespaced settings block. Future commands get sibling keys. */
export interface InitConfig {
  prefix: PrefixConfig;
  /**
   * Optional per-editor opt-in (PT-M2). Additive; absence is valid and means
   * "no editor target settled yet". See {@link EditorsConfig}.
   */
  editors?: EditorsConfig;
}

/** Top-level shape of `auro.config.json`, namespaced per command. */
export interface AuroConfig {
  /** Format version; equals {@link CONFIG_VERSION} for files this CLI writes. */
  version: typeof CONFIG_VERSION;
  init: InitConfig;
}
