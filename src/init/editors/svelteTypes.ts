/**
 * Build the Svelte type declarations (`auro-types/auro-svelte.d.ts`) that give
 * Svelte markup tag + prop IntelliSense through the Svelte language server.
 * Pure: `(components, resolvedTags) → EditorArtifact`.
 *
 * The Svelte tool has no per-tag rename hook (no `tagFormatter`), so — like the
 * HTML target — the resolved tags are baked in by pre-swapping the manifest
 * ({@link buildManifest} with `resolvedTags`). We deliberately do NOT pass
 * `componentTypePath`: the tool types each attribute as `Component['field']` only
 * when that hook is set, else it inlines the CEM's own `type.text` — and the
 * class-indexed form resolves to `any` because the shipped Auro packages ship
 * unresolvable class declarations (auro-button's `dist/index.d.ts` imports from a
 * non-published `src/`; auro-formkit subpaths carry no `types` condition). Inlining
 * the CEM type keeps real string-literal unions (`variant` →
 * `"primary" | "secondary" | …`) so values actually complete/validate. Unlike the
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
  withTempDir,
} from "#init/editors/manifest.js";
import type { ResolvedComponent } from "#init/resolver.js";

/**
 * The exact module-scoped `svelteHTML` augmentation the community tool emits
 * (prettier-formatted, so this matches the bytes it writes). Because the
 * generated file has top-level `import`/`export`, it is a *module* — a plain
 * `declare namespace svelteHTML` inside it is module-scoped and never merges
 * into the global `svelteHTML` the Svelte language server actually reads, so
 * element completion silently does nothing. See {@link globalizeSvelteNamespace}.
 */
const MODULE_SCOPED_SVELTE_NAMESPACE = `declare namespace svelteHTML {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface IntrinsicElements extends CustomElements {}
}`;

/** The global-scoped replacement that merges into the language server's `svelteHTML`. */
const GLOBAL_SVELTE_NAMESPACE = `declare global {
  namespace svelteHTML {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IntrinsicElements extends CustomElements {}
  }
}`;

/**
 * Wrap the tool's module-scoped `declare namespace svelteHTML` in `declare
 * global { … }` so it augments the global `svelteHTML` namespace the Svelte
 * language server reads — the same pattern auro-cli's own per-component
 * `addDtsExportsPlugin` already emits. Without this the augmentation is inert in
 * a module file and Svelte element completion never appears.
 *
 * Throws if the expected block is absent (e.g. an upstream reflow of
 * `custom-element-svelte-integration`) rather than returning the string
 * unchanged — a silent no-op would ship the broken module-scoped form, so we
 * surface the drift as a loud, test-caught failure instead.
 */
function globalizeSvelteNamespace(contents: string): string {
  if (!contents.includes(MODULE_SCOPED_SVELTE_NAMESPACE)) {
    throw new Error(
      "custom-element-svelte-integration no longer emits the expected " +
        "`declare namespace svelteHTML` block; the global-augmentation rewrite " +
        "in svelteTypes.ts must be updated to match the new output.",
    );
  }
  return contents.replace(
    MODULE_SCOPED_SVELTE_NAMESPACE,
    GLOBAL_SVELTE_NAMESPACE,
  );
}

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

  const contents = withTempDir((outdir) => {
    generateSvelteTypes(manifest, {
      outdir,
      fileName: SVELTE_TYPES_FILENAME,
      hideLogs: true,
      // No `componentTypePath`: inline the CEM's `type.text` (real unions) instead
      // of `Component['field']`, which resolves to `any` against the packages'
      // unresolvable class .d.ts. See the module header for the full rationale.
    });
    return readFileSync(join(outdir, SVELTE_TYPES_FILENAME), "utf-8");
  });

  return {
    filename: SVELTE_TYPES_PATH,
    contents: ensureTrailingNewline(globalizeSvelteNamespace(contents)),
  };
}
