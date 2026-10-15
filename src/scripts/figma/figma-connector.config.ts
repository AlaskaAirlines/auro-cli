/**
 * Code Connect config: which components have it, and where each one is designed in
 * Figma. `auro docs --cem` only acts on a tag listed here, so repos that are not
 * listed are skipped.
 *
 * Adding a component or changing a node id needs an auro-cli release.
 */

/**
 * The Figma file every component set is read from. Currently the fork used for
 * verification; the production file is
 * https://www.figma.com/design/VpUz89Ov6ImBpY5YvzYbZW/Auro-toolkit
 */
export const FIGMA_FILE =
  "https://www.figma.com/design/if5kIJr2x6Jv9aXpq1ANOp/Auro-toolkit---Fork---Code-Connect-Test";

/**
 * Component set node ids per tag, in the dashed form of the `?node-id=` URL
 * parameter. A component with several sets lists each one. An entry that is a full
 * URL is used as is, for a set in another Figma file.
 */
export const FIGMA_COMPONENTS: Record<string, string[]> = {
  "auro-accordion": ["11755-19978"],
  "auro-alert": ["22104-1968"],
  "auro-badge": ["2143-10490"],
  "auro-button": ["1571-3356"],
  "auro-checkbox": ["1643-7158"],
  "auro-checkbox-group": ["1643-7070", "1643-7183"],
  "auro-combobox": ["2364-15054"],
  "auro-counter": ["12249-4009"],
  "auro-counter-group": ["12249-5173"],
  "auro-datepicker": ["3770-15527", "7244-26936"],
  "auro-dialog": ["22366-5736"],
  "auro-drawer": ["22366-7080"],
  "auro-hyperlink": ["5640-15548", "21546-558", "21546-579"],
  "auro-input": ["1608-2812"],
  "auro-radio": ["2158-10682"],
  "auro-radio-group": ["2158-10718"],
  "auro-select": ["3626-13755"],
};

/**
 * Design-related attributes shared across components: always design-related, whatever the
 * component. `layout`, `required`, `shape` and `size` are decided; the rest are the names
 * that appear in the design lists of three or more components (appearance, disabled, error,
 * fluid, placeholder, type, variant), added 2026-10-13 and not yet confirmed by Design. They
 * are added to each tag's list below, so a tag only lists the ones specific to it. A name the
 * component's CEM does not have is simply never matched.
 */
export const COMMON_DESIGN_ATTRIBUTES: string[] = [
  "appearance",
  "disabled",
  "error",
  "fluid",
  "layout",
  "placeholder",
  "required",
  "shape",
  "size",
  "type",
  "variant",
];

/**
 * Attributes ignored in every component: left out of the bindings, the counts and the
 * mismatch file.
 * Names are matched like everything else: lowercased and trimmed.
 */
export const COMMON_IGNORED_ATTRIBUTES: string[] = ["fullscreenBreakpoint"];

/**
 * Design-related attributes per tag, beyond the common ones: the ones that change how the component looks or
 * a state shown in Figma. `mismatch.md` lists unmatched attributes from this list
 * first and the rest (functionality, accessibility, form, validation) in a separate
 * section. A tag with no entry gets one list, not split.
 *
 * Button and Input are decided. The other components are drafts, chosen with the same
 * rule as Input (a name is here when it changes how the component looks or a state
 * shown in Figma; popup positioning, validation, form and browser attributes are not).
 * Design should confirm them.
 */
export const DESIGN_ATTRIBUTES: Record<string, string[]> = {
  "auro-button": ["loading"],
  "auro-input": ["simple", "readonly", "icon", "activelabel", "nested"],
  // Drafts, not yet reviewed by Design.
  "auro-accordion": ["chevron", "alignright", "expandup"],
  "auro-alert": ["noicon"],
  "auro-badge": ["label", "pill", "target"],
  "auro-checkbox": ["checked"],
  "auro-checkbox-group": ["horizontal"],
  "auro-combobox": ["checkmark", "triggericon"],
  "auro-counter": [],
  "auro-counter-group": ["isdropdown"],
  "auro-datepicker": ["range", "stacked"],
  "auro-dialog": ["close-button-appearance", "sm", "md", "lg", "modal"],
  "auro-drawer": ["close-button-appearance", "modal"],
  "auro-hyperlink": [],
  "auro-radio": ["checked", "label"],
  "auro-radio-group": ["horizontal"],
  "auro-select": ["nocheckmark"],
};

/** Design-related attribute names for a tag; undefined if the tag has no list. */
export function designAttributesFor(tag: string): string[] | undefined {
  const own = DESIGN_ATTRIBUTES[tag];
  return own && [...new Set([...own, ...COMMON_DESIGN_ATTRIBUTES])];
}

/** Full component set URLs (each with `?node-id=`) for a tag; empty if it is not listed. */
export function figmaNodesFor(tag: string): string[] {
  return (FIGMA_COMPONENTS[tag] ?? []).map((n) =>
    /^https?:\/\//.test(n) ? n : `${FIGMA_FILE}?node-id=${n}`,
  );
}
