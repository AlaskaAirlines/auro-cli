/**
 * Drop `@readonly` properties from each declaration's CEM `attributes` list.
 *
 * The analyzer (v0.11.0) lists every Lit property that has an attribute in
 * `attributes`, including read-only state the component only reflects outward
 * (e.g. `validity` with `reflect: true`). Listing those as attributes tells
 * consumers and editor tooling they can be authored in markup, which they can't.
 *
 * This post-processing plugin removes any attribute whose backing field is
 * marked `@readonly`. The field itself is left untouched, so the member entry
 * still records `readonly`, `attribute`, and `reflects` — the property is
 * documented as read-only state that is reflected to an attribute.
 *
 * @returns {{ name: string, packageLinkPhase: (context: { customElementsManifest: object }) => void }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function readonlyAttributesPlugin() {
  return {
    name: "readonly-attributes",
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules ?? []) {
        for (const declaration of mod.declarations ?? []) {
          if (Array.isArray(declaration.attributes)) {
            const readonlyFields = new Set(
              (declaration.members ?? [])
                .filter((member) => member.kind === "field" && member.readonly)
                .map((member) => member.name),
            );

            declaration.attributes = declaration.attributes.filter(
              (attr) => !attr.readonly && !readonlyFields.has(attr.fieldName),
            );
          }
        }
      }
    },
  };
}
