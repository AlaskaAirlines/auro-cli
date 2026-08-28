/**
 * Build the JSX / React type declarations (`auro-types/auro-jsx.d.ts`) that give
 * `.tsx` files tag + prop IntelliSense through the TypeScript language service.
 * Pure: `(components, resolvedTags) → EditorArtifact`.
 *
 * Two seams, both via the tool's own hooks (so the manifest keeps its canonical
 * `auro-*` tags here, unlike the HTML/Svelte pre-swap path):
 *  - `tagFormatter` renames each canonical tag to the tag the consumer registers,
 *    so the augmented `JSX.IntrinsicElements` / `react/jsx-runtime` keys match.
 *  - `componentTypePath` points each emitted `import type { AuroButton }` at the
 *    component's installed `importPath` (package root or monorepo subpath), not
 *    the CEM's internal source path.
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
    contents: ensureTrailingNewline(contents),
  };
}
