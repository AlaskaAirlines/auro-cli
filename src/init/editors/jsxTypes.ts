/**
 * Build the JSX / React type declarations (`auro-types/auro-jsx.d.ts`) that give
 * `.tsx` files tag + prop IntelliSense through the TypeScript language service.
 * Pure: `(components, resolvedTags) → EditorArtifact`.
 *
 * Two seams, both via the tool's own hooks (so the manifest keeps its canonical
 * `auro-*` tags here, unlike the HTML/Svelte pre-swap path):
 *  - `tagFormatter` renames each canonical tag to the tag the consumer registers,
 *    so the augmented `JSX.IntrinsicElements` / `react/jsx-runtime` keys match.
 *  - `componentTypePath` routes the emitted class/event/reference `import type`
 *    specifiers at the component's installed `importPath` (package root or monorepo
 *    subpath), not the CEM's internal source path.
 *
 * Prop types come from `useCemTypes: true`, which inlines each attribute's CEM
 * `type.text` (real string-literal unions like `variant` →
 * `"primary" | "secondary" | …`). Without it the tool would type props as
 * `Component['prop']`, which resolves to `any` because the shipped Auro packages
 * ship unresolvable class declarations — so values would never complete/validate.
 * The class import the tool still emits is then unused but harmless.
 *
 * `includeDefaultDOMEvents: true` folds the tool's built-in native DOM event
 * handlers (`onClick`, `onFocus`, `onKeyDown`, … — all lib.dom event types) into
 * the shared `BaseEvents` type every element intersects. A CEM only declares a
 * component's *own* events, so without this native handlers are absent and
 * `<auro-button onFocus={…} />` is flagged as an unknown prop. No collision with
 * a CEM `click` event: React camelCase `onClick` never clashes with the custom
 * event's `onclick`.
 *
 * The tool's `BaseProps` covers `role` but no `aria-*` or `data-*` attributes, and
 * the generated element type *replaces* the tag's intrinsic type — so
 * {@link injectGlobalAttributes} splices the standard ARIA / `data-*` set into
 * `BaseProps` (no tool option exposes it; `allowUnknownProps` would disable all
 * prop validation). `role: false` here — the tool already emits `role`.
 *
 * `generateJsxTypes` both writes a file to `outdir` and returns the source; we
 * discard the write (scratch dir) and keep the returned string.
 *
 * @see docs/pt-m2-completion-plan.md → build-order step 2.
 */

import { generateJsxTypes } from "@wc-toolkit/jsx-types";
import { JSX_TYPES_FILENAME, JSX_TYPES_PATH } from "#init/editors/layout.js";
import {
  buildManifest,
  type EditorArtifact,
  ensureTrailingNewline,
  importPathsByClass,
  injectGlobalAttributes,
  withTempDir,
} from "#init/editors/manifest.js";
import type { ResolvedComponent } from "#init/resolver.js";

/**
 * Render the JSX `.d.ts` for the resolved component set. Returns the artifact's
 * project-root-relative path plus its contents; writing is the caller's job.
 */
export function buildJsxTypes(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string>,
): EditorArtifact {
  // Canonical tags — the swap happens through `tagFormatter`, not the manifest.
  const manifest = buildManifest(components);
  const importPaths = importPathsByClass(components);

  const contents = withTempDir((outdir) =>
    // The tool types its manifest param as the strict `custom-elements-manifest`
    // Package; our loose Manifest is structurally compatible at runtime, so cast
    // to the tool's own parameter type rather than reshaping our model.
    generateJsxTypes(
      manifest as unknown as Parameters<typeof generateJsxTypes>[0],
      {
        outdir,
        fileName: JSX_TYPES_FILENAME,
        tagFormatter: (tagName) => resolvedTags.get(tagName) ?? tagName,
        componentTypePath: (name) => importPaths.get(name) ?? name,
        // Inline CEM `type.text` for props instead of `Component['prop']`, which
        // resolves to `any` against the packages' unresolvable class .d.ts.
        useCemTypes: true,
        // Fold native DOM event handlers (onClick/onFocus/…) into BaseEvents; a
        // CEM only declares a component's own events, so without this they are
        // absent and native handlers flag as unknown props.
        includeDefaultDOMEvents: true,
      },
    ),
  );

  if (typeof contents !== "string") {
    throw new Error(
      "JSX type generation returned no output for the resolved components.",
    );
  }

  return {
    filename: JSX_TYPES_PATH,
    // The tool already emits `role`, so inject ARIA / data-* only (role: false).
    contents: ensureTrailingNewline(
      injectGlobalAttributes(contents, { role: false }),
    ),
  };
}
