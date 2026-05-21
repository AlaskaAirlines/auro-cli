/**
 * Maps legacy `@alaskaairux/*` packages to their `@aurodesignsystem/*`
 * successors when the underlying library was republished under the new
 * scope. Used to cross-namespace the "latest version" resolution so a
 * consumer pinned on `@alaskaairux/auro-button@4` doesn't appear "up to
 * date" at the last `@alaskaairux` version when active development moved
 * to `@aurodesignsystem/auro-button` (currently at 12+).
 *
 * Hand-curated — not every legacy package migrated, and a couple stayed
 * under the original scope (e.g. `@alaskaairux/icons` is still the
 * canonical name; there's no `@aurodesignsystem/icons` on npm). Add a new
 * entry only after confirming both packages exist on the npm registry
 * AND the `@aurodesignsystem` side is actively published.
 */
export const PACKAGE_ALIASES: Readonly<Record<string, string>> = {
  "@alaskaairux/auro-button": "@aurodesignsystem/auro-button",
  "@alaskaairux/auro-icon": "@aurodesignsystem/auro-icon",
  "@alaskaairux/auro-popover": "@aurodesignsystem/auro-popover",
};

/**
 * Returns the `@aurodesignsystem` successor name for a legacy
 * `@alaskaairux` package if the migration is known, else null.
 */
export function aliasFor(pkg: string): string | null {
  return PACKAGE_ALIASES[pkg] ?? null;
}
