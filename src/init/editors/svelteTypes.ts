/**
 * Build the Svelte type declarations (`auro-types/auro-svelte.d.ts`) that give
 * Svelte markup tag + prop IntelliSense through the Svelte language server.
 * Pure: `(components, resolvedTags) → EditorArtifact`.
 *
 * The Svelte tool has no per-tag rename hook (no `tagFormatter`), so — like the
 * HTML target — the resolved tags are baked in by pre-swapping the manifest
 * ({@link buildManifest} with `resolvedTags`). `componentTypePath` still points
 * each emitted class import at the component's installed `importPath`. Unlike the
 * other two tools this one returns `void` and only writes a file, so we point it
 * at a scratch dir and read the result back.
 *
 * @see docs/pt-m2-completion-plan.md → build-order step 2.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateSvelteTypes } from "custom-element-svelte-integration";
import {
  SVELTE_TYPES_FILENAME,
  SVELTE_TYPES_PATH,
} from "#init/editors/layout.js";
import {
  buildManifest,
  type EditorArtifact,
  ensureTrailingNewline,
  importPathsByClass,
  withTempDir,
} from "#init/editors/manifest.js";
import type { ResolvedComponent } from "#init/resolver.js";

/**
 * Render the Svelte `.d.ts` for the resolved component set. Returns the
 * artifact's project-root-relative path plus its contents; writing is the
 * caller's job.
 */
export function buildSvelteTypes(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string>,
): EditorArtifact {
  const manifest = buildManifest(components, resolvedTags);
  const importPaths = importPathsByClass(components);

  const contents = withTempDir((outdir) => {
    generateSvelteTypes(manifest, {
      outdir,
      fileName: SVELTE_TYPES_FILENAME,
      hideLogs: true,
      componentTypePath: (name) => importPaths.get(name) ?? name,
    });
    return readFileSync(join(outdir, SVELTE_TYPES_FILENAME), "utf-8");
  });

  return {
    filename: SVELTE_TYPES_PATH,
    contents: ensureTrailingNewline(contents),
  };
}
