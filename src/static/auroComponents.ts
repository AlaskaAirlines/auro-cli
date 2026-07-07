/**
 * Candidate Auro component packages to check for a Custom Elements Manifest
 * (`custom-elements.json`) at their package root. Not every component publishes
 * one yet — the `auro cem` command fetches each and skips those that 404, so
 * this list can safely include components ahead of their CEM adoption.
 *
 * Keep this list in sync with the components published under the
 * `@aurodesignsystem/` npm scope.
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
  "@aurodesignsystem/auro-datetime",
  "@aurodesignsystem/auro-dialog",
  "@aurodesignsystem/auro-drawer",
  "@aurodesignsystem/auro-flight",
  "@aurodesignsystem/auro-flightline",
  "@aurodesignsystem/auro-formkit",
  "@aurodesignsystem/auro-header",
  "@aurodesignsystem/auro-hyperlink",
  "@aurodesignsystem/auro-icon",
  "@aurodesignsystem/auro-loader",
  "@aurodesignsystem/auro-lockup",
  "@aurodesignsystem/auro-nav",
  "@aurodesignsystem/auro-pane",
  "@aurodesignsystem/auro-popover",
  "@aurodesignsystem/auro-sidenav",
  "@aurodesignsystem/auro-skeleton",
  "@aurodesignsystem/auro-slideshow",
  "@aurodesignsystem/auro-table",
  "@aurodesignsystem/auro-tabs",
  "@aurodesignsystem/auro-tail",
  "@aurodesignsystem/auro-toast",
  "@aurodesignsystem/auro-tokenlist",
];
