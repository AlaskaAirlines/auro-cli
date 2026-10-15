import { createPropertyTagPlugin } from "./propertyTagPlugin.mjs";

/**
 * Remove properties tagged `@internal` from the CEM.
 *
 * The analyzer (v0.11.0) honors `@internal` on a class, leaving the class out of
 * the manifest, but ignores it on a Lit property: the property is still listed in
 * `members` and, when it has one, in `attributes`, which tells consumers and
 * editor tooling it's part of the public API. Use the tag for properties that
 * exist only for another Auro component to set, for example the link properties
 * `auro-hyperlink` passes to `auro-button`.
 *
 * The tag is read from the property's JSDoc (`@internal`, no value). Entries are
 * removed after the analyzer applies inheritance, so subclasses don't list them
 * either.
 *
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function, packageLinkPhase: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function internalPlugin() {
  return createPropertyTagPlugin({
    name: "internal",
    tagNames: ["internal"],
    toFields: () => ({ internal: true }),
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules ?? []) {
        for (const declaration of mod.declarations ?? []) {
          if (Array.isArray(declaration.members)) {
            declaration.members = declaration.members.filter(
              (member) => !member.internal,
            );
          }
          if (Array.isArray(declaration.attributes)) {
            declaration.attributes = declaration.attributes.filter(
              (attr) => !attr.internal,
            );
          }
        }
      }
    },
  });
}
