/**
 * Per-package policy catalog for the version-bot.
 *
 * Scope note: the catalog is a *policy* surface, not a *discovery* surface.
 * The bot continues to discover packages dynamically via namespace-prefix
 * match in scan.ts. Today the seed list carries 12 standing deprecations
 * (formkit successors + @alaskaairux retirements); all other packages
 * still ticket against npm latest.
 *
 * The `notes` field is the incident knob: an engineer can pin
 * `targetVersion` + add `notes` inline to roll the bot's recommendation
 * off a regressed release, with the notes rendering as a warning callout
 * in every ticket the bot files for that package.
 */

export interface PolicyException {
  expiresAt?: string;
  reason: string;
  repositoryPattern?: string;
}

export interface PackagePolicyRecord {
  packageName: string;
  /** Pinned target version. When set, overrides npm latest in the bot. */
  targetVersion?: string;
  /** Versions below this are flagged Unsupported by evaluatePackage. */
  minimumVersion?: string;
  /** Successor package; presence flags this entry as Unsupported. */
  replacedBy?: string;
  exceptions?: PolicyException[];
  /**
   * Incident / advisory text. Renders as a warning callout above breaking
   * changes in the ticket body. Plain text; HTML-escaped at render time.
   * Example: "Skip 13.0 — regression in focus-trap, see #1234."
   */
  notes?: string;
}

/**
 * Standing-deprecation seeds. All entries leave `targetVersion`,
 * `minimumVersion`, and `notes` unset — the bot still resolves the
 * target from npm latest and files normal upgrade tickets. The
 * `replacedBy` pointer tells `evaluatePackage` to surface these as
 * Unsupported so the ticket carries a `compliance-unsupported` tag.
 *
 * Engineers add `targetVersion`/`notes` inline during an incident; the
 * file is the only commit needed to roll the bot's recommendation off
 * a bad release.
 */
export const PACKAGE_POLICY_CATALOG: PackagePolicyRecord[] = [
  // Formkit successors — standalone packages superseded by @aurodesignsystem/auro-formkit.
  {
    packageName: "@aurodesignsystem/auro-checkbox",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-combobox",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-datepicker",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-dropdown",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-form",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-input",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-menu",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-radio",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },
  {
    packageName: "@aurodesignsystem/auro-select",
    replacedBy: "@aurodesignsystem/auro-formkit",
  },

  // Legacy @alaskaairux/* retirements — scope migrations to @aurodesignsystem/*.
  // Note: @alaskaairux/icons is intentionally omitted (canonical legacy per
  // Decision 11; no successor). @aurodesignsystem/auro-counter is also omitted
  // pending confirmation with Lindsey that a standalone npm publish exists.
  {
    packageName: "@alaskaairux/auro-button",
    replacedBy: "@aurodesignsystem/auro-button",
  },
  {
    packageName: "@alaskaairux/auro-icon",
    replacedBy: "@aurodesignsystem/auro-icon",
  },
  {
    packageName: "@alaskaairux/auro-popover",
    replacedBy: "@aurodesignsystem/auro-popover",
  },
];

export const findPackagePolicy = (
  packageName: string,
): PackagePolicyRecord | undefined =>
  PACKAGE_POLICY_CATALOG.find((record) => record.packageName === packageName);
