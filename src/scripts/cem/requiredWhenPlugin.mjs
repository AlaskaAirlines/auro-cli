import { createConditionTagPlugin } from "./conditionTagPlugin.mjs";

/**
 * Promote a `@requiredWhen` JSDoc tag into a CEM `requiredWhen` field.
 *
 * The CEM schema has no way to mark a property or attribute as required. This
 * plugin reads `@requiredWhen` from a property's JSDoc and writes its value onto
 * the property's field and attribute entries:
 *
 * - `@requiredWhen always` – the property is always required (`"requiredWhen": "always"`).
 * - `@requiredWhen <booleanProperty>` – the property is required whenever that
 *   boolean property on the same element is `true`
 *   (e.g. `@requiredWhen isDropdown` → `"requiredWhen": "isDropdown"`).
 *
 * A warning is reported if the referenced property does not exist on the element
 * or is not typed `boolean`.
 *
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function, packageLinkPhase: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function requiredWhenPlugin() {
  return createConditionTagPlugin({
    name: "required-when",
    tagName: "requiredWhen",
    keywords: ["always"],
  });
}
