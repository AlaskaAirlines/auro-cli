/**
 * Build the VS Code HTML custom-data artifact (`.vscode/auro.html-custom-data.json`)
 * that drives tag/attribute IntelliSense in `.html` files via VS Code's HTML
 * Language Server. Pure: `(components, resolvedTags) → EditorArtifact`.
 *
 * The HTML tool has no per-tag rename hook, so the resolved tags are baked in by
 * pre-swapping the manifest ({@link buildManifest} with `resolvedTags`) — the
 * emitted custom-data is keyed on the tags a consumer actually registers
 * (`<myapp-button>`), never the bare `auro-*` tags. The tool insists on writing
 * its output to disk as well as returning it; we point it at a scratch dir and
 * keep only the returned string.
 *
 * @see docs/pt-m2-completion-plan.md → build-order step 2.
 */

import { getVsCodeHtmlCustomData } from "custom-element-vs-code-integration";
import { HTML_CUSTOM_DATA_PATH } from "#init/editors/layout.js";
import {
  buildManifest,
  type EditorArtifact,
  ensureTrailingNewline,
  withTempDir,
} from "#init/editors/manifest.js";
import type { ResolvedComponent } from "#init/resolver.js";

/**
 * Render the HTML custom-data JSON for the resolved component set. Returns the
 * artifact's project-root-relative path plus its contents; writing is the
 * caller's job (`init`).
 */
export function buildHtmlCustomData(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string>,
): EditorArtifact {
  const manifest = buildManifest(components, resolvedTags);
  const contents = withTempDir((outdir) =>
    // The tool types its manifest param as the strict `custom-elements-manifest`
    // CEM; our loose Manifest is compatible at runtime, so cast to the tool's own
    // parameter type rather than reshaping our model.
    getVsCodeHtmlCustomData(
      manifest as unknown as Parameters<typeof getVsCodeHtmlCustomData>[0],
      {
        outdir,
        htmlFileName: "auro.html-custom-data.json",
        hideLogs: true,
      },
    ),
  );
  return {
    filename: HTML_CUSTOM_DATA_PATH,
    contents: ensureTrailingNewline(contents),
  };
}
