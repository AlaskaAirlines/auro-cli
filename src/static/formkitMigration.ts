/**
 * The legacy-standalone → `auro-formkit` relationship, in one place.
 *
 * Nine Auro form components were first published as **standalone** packages
 * (`@aurodesignsystem/auro-input`, `-select`, …) and were later absorbed into the
 * `@aurodesignsystem/auro-formkit` monorepo, which re-exports each under a
 * per-component subpath (`@aurodesignsystem/auro-formkit/auro-<x>`). A project on a
 * standalone is on the *legacy* form of that component and should migrate to
 * formkit — the standalone import path (`@aurodesignsystem/auro-<x>`) maps 1:1 to a
 * formkit subpath.
 *
 * `auro-button` is a genuine standalone that was **never** part of formkit, so it is
 * deliberately absent from {@link LEGACY_FORMKIT_PACKAGES}. This is the same overlap
 * documented in [auroComponents.ts](./auroComponents.ts); keep the two lists in sync.
 */

/** The monorepo that absorbed the legacy standalone form components. */
export const FORMKIT_PACKAGE = "@aurodesignsystem/auro-formkit";

/**
 * The legacy standalone form packages that now live inside {@link FORMKIT_PACKAGE}.
 * A project depending on any of these should migrate to the formkit subpath.
 * Excludes `@aurodesignsystem/auro-button` (a true standalone, not in formkit).
 */
export const LEGACY_FORMKIT_PACKAGES: readonly string[] = [
  "@aurodesignsystem/auro-input",
  "@aurodesignsystem/auro-select",
  "@aurodesignsystem/auro-combobox",
  "@aurodesignsystem/auro-menu",
  "@aurodesignsystem/auro-checkbox",
  "@aurodesignsystem/auro-radio",
  "@aurodesignsystem/auro-datepicker",
  "@aurodesignsystem/auro-dropdown",
  "@aurodesignsystem/auro-form",
];

const LEGACY_SET = new Set(LEGACY_FORMKIT_PACKAGES);

/** True when `pkg` is a legacy standalone that formkit now ships. */
export function isLegacyFormkitPackage(pkg: string): boolean {
  return LEGACY_SET.has(pkg);
}

/**
 * The bare `auro-*` element name a legacy standalone contributes to formkit:
 * `@aurodesignsystem/auro-input` → `auro-input`. Assumes {@link isLegacyFormkitPackage}
 * — the standalone's package basename *is* its canonical tag.
 */
export function formkitTagFor(pkg: string): string {
  return pkg.slice("@aurodesignsystem/".length);
}

/**
 * The formkit subpath import specifier that replaces a legacy standalone import:
 * `@aurodesignsystem/auro-input` → `@aurodesignsystem/auro-formkit/auro-input`.
 */
export function formkitSubpathFor(pkg: string): string {
  return `${FORMKIT_PACKAGE}/${formkitTagFor(pkg)}`;
}
