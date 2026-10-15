import { createConditionTagPlugin } from "./conditionTagPlugin.mjs";

/**
 * Promote a `@relevantWhen` JSDoc tag into a CEM `relevantWhen` field.
 *
 * Some properties only have an effect in a particular mode, such as bib placement
 * options that only apply when the element renders as a dropdown. This plugin
 * reads `@relevantWhen <booleanProperty>` from a property's JSDoc and writes it
 * onto the property's field and attribute entries, meaning the property only
 * applies while that boolean property on the same element is `true`
 * (e.g. `@relevantWhen isDropdown` → `"relevantWhen": "isDropdown"`).
 *
 * A warning is reported if the referenced property does not exist on the element
 * or is not typed `boolean`.
 *
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function, packageLinkPhase: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function relevantWhenPlugin() {
  return createConditionTagPlugin({
    name: "relevant-when",
    tagName: "relevantWhen",
  });
}
