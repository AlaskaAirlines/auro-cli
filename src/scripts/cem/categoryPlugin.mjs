import { createPropertyTagPlugin } from "./propertyTagPlugin.mjs";

/**
 * Promote a `@category` JSDoc tag into a CEM `category` field.
 *
 * Categories group related properties, slots, CSS parts, and CSS custom
 * properties, such as everything that affects accessibility. On a property, use
 * the block tag `@category a11y`; on a slot, CSS part, or CSS custom property,
 * write it inline in the `@slot`, `@csspart`, or `@cssprop` description, for
 * example `@slot ariaLabel.bib.close - Close button label. {@category a11y}`.
 * Either way the value is written to a `category` field on the property's field
 * and attribute entries, or on the entry itself (`"category": "a11y"`).
 *
 * Values are free-form text. Each property or entry has a single category; extra
 * tags are reported and only the first is used.
 *
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function categoryPlugin() {
  return createPropertyTagPlugin({
    name: "category",
    tagNames: ["category"],
    toFields(tags, { warn }) {
      if (tags.length > 1) {
        warn(
          `has ${tags.length} @category tags; only one is allowed. Using "${tags[0].text}".`,
        );
      }

      const [{ text }] = tags;

      if (text === "") {
        warn("has an empty @category; skipping.");
        return {};
      }

      return { category: text };
    },
  });
}
