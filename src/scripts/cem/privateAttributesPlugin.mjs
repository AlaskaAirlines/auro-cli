/**
 * Drop attributes backed by `@private` properties from each declaration's CEM
 * `attributes` list.
 *
 * The analyzer (v0.11.0) lists every Lit property that has an attribute in
 * `attributes`, even when the property is marked `@private`. Inheritance makes
 * this worse: when a subclass overrides an inherited property to hide it, the
 * analyzer copies the base class's attribute into the subclass, and lets the
 * base class's privacy win on the merged member. Listing those as attributes
 * tells consumers and editor tooling they're part of the public API, which they
 * aren't.
 *
 * This post-processing plugin removes any attribute whose backing field is
 * marked `@private`. The field itself is left untouched, so the member entry
 * still records `privacy: "private"`.
 *
 * Register it after the analyzer's own plugins have applied inheritance (any
 * position in the config's `plugins` array works, since user plugins run after
 * the core ones).
 *
 * @returns {{ name: string, packageLinkPhase: (context: { customElementsManifest: object }) => void }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function privateAttributesPlugin() {
  return {
    name: "private-attributes",
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules ?? []) {
        for (const declaration of mod.declarations ?? []) {
          if (Array.isArray(declaration.attributes)) {
            const privateFields = new Set(
              (declaration.members ?? [])
                .filter(
                  (member) =>
                    member.kind === "field" && member.privacy === "private",
                )
                .map((member) => member.name),
            );

            declaration.attributes = declaration.attributes.filter(
              (attr) => !privateFields.has(attr.fieldName),
            );
          }
        }
      }
    },
  };
}
