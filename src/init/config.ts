/**
 * Frozen schema for the CLI-owned `auro.config.json` file that `auro init` reads
 * and rewrites on every regeneration.
 *
 * See docs/pt-m1-completion-plan.md → "Frozen decisions → CLI-owned config
 * location/shape". This shape is FROZEN: do not change it without bumping
 * {@link CONFIG_VERSION} and shipping a migration. The top-level `version` field
 * exists from v1 precisely so any future change is an explicit migration rather
 * than a guess (the ticket's "freeze the format early / bus-factor" requirement).
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

/** The `init`-namespaced settings block. Future commands get sibling keys. */
export interface InitConfig {
  prefix: PrefixConfig;
}

/** Top-level shape of `auro.config.json`, namespaced per command. */
export interface AuroConfig {
  /** Format version; equals {@link CONFIG_VERSION} for files this CLI writes. */
  version: typeof CONFIG_VERSION;
  init: InitConfig;
}
