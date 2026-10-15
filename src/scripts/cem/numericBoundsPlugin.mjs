import { createPropertyTagPlugin } from "./propertyTagPlugin.mjs";

/**
 * Promote `@minimum` / `@maximum` JSDoc tags into CEM `minimum` / `maximum` fields.
 *
 * JSDoc has no standard way to describe the allowed range of a numeric property.
 * This plugin reads `@minimum <number>` and `@maximum <number>` from a property's
 * JSDoc and writes them onto the property's field and attribute entries. For
 * example, a Lit property documented with `@minimum 1` and `@maximum 12` gets
 * `"minimum": 1, "maximum": 12` in the manifest. Values must be finite numbers;
 * anything else is reported and skipped.
 *
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function numericBoundsPlugin() {
  return createPropertyTagPlugin({
    name: "numeric-bounds",
    tagNames: ["minimum", "maximum"],
    toFields(tags, { warn }) {
      const bounds = {};

      tags.forEach((tag) => {
        const value = Number(tag.text);

        if (tag.text === "" || !Number.isFinite(value)) {
          warn(`has a non-numeric @${tag.name} "${tag.text}"; skipping.`);
        } else {
          bounds[tag.name] = value;
        }
      });

      return bounds;
    },
  });
}
