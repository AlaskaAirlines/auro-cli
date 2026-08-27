/**
 * Candidate Auro component packages to check for a Custom Elements Manifest
 * (`custom-elements.json`) at their package root. Not every component publishes
 * one yet — the `auro cem` command fetches each and skips those that 404, so
 * this list can safely include components ahead of their CEM adoption.
 *
 * Keep this list in sync with the components published under the
 * `@aurodesignsystem/` npm scope. It intentionally includes the **legacy
 * standalone** form packages (`auro-input`, `auro-select`, `auro-combobox`,
 * `auro-menu`, `auro-checkbox`, `auro-radio`, `auro-datepicker`, `auro-dropdown`,
 * `auro-form`) that `auro-formkit` later absorbed: a consumer may still have a
 * standalone installed alongside `auro-formkit`, and both register the same
 * `auro-*` tag. `resolveComponents` detects that overlap and grounds the tag once
 * (warning which packages collide) — so the legacy packages must be candidates for
 * the overlap to be seen at all.
 */
export const AURO_COMPONENT_PACKAGES = [
  "@aurodesignsystem/auro-accordion",
  "@aurodesignsystem/auro-alert",
  "@aurodesignsystem/auro-avatar",
  "@aurodesignsystem/auro-background",
  "@aurodesignsystem/auro-backtotop",
  "@aurodesignsystem/auro-badge",
  "@aurodesignsystem/auro-banner",
  "@aurodesignsystem/auro-button",
  "@aurodesignsystem/auro-card",
  "@aurodesignsystem/auro-carousel",
  "@aurodesignsystem/auro-checkbox",
  "@aurodesignsystem/auro-combobox",
  "@aurodesignsystem/auro-datepicker",
  "@aurodesignsystem/auro-datetime",
  "@aurodesignsystem/auro-dialog",
  "@aurodesignsystem/auro-drawer",
  "@aurodesignsystem/auro-dropdown",
  "@aurodesignsystem/auro-flight",
  "@aurodesignsystem/auro-flightline",
  "@aurodesignsystem/auro-form",
  "@aurodesignsystem/auro-formkit",
  "@aurodesignsystem/auro-header",
  "@aurodesignsystem/auro-hyperlink",
  "@aurodesignsystem/auro-icon",
  "@aurodesignsystem/auro-input",
  "@aurodesignsystem/auro-loader",
  "@aurodesignsystem/auro-lockup",
  "@aurodesignsystem/auro-menu",
  "@aurodesignsystem/auro-nav",
  "@aurodesignsystem/auro-pane",
  "@aurodesignsystem/auro-popover",
  "@aurodesignsystem/auro-radio",
  "@aurodesignsystem/auro-select",
  "@aurodesignsystem/auro-sidenav",
  "@aurodesignsystem/auro-skeleton",
  "@aurodesignsystem/auro-slideshow",
  "@aurodesignsystem/auro-table",
  "@aurodesignsystem/auro-tabs",
  "@aurodesignsystem/auro-tail",
  "@aurodesignsystem/auro-toast",
  "@aurodesignsystem/auro-tokenlist",
];
