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
 * Three post-processing passes fix what the community tool can't express on its
 * own: {@link labelComponentMembers} (mark component-owned members so IntelliSense
 * distinguishes them from inherited global HTML attributes),
 * {@link addSvelte5EventHandlers} (Svelte 4 *and* 5 event syntax), and
 * {@link globalizeSvelteNamespace} (global vs module-scoped augmentation).
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
 * The community tool emits every event handler in Svelte 4 *directive* form only
 * — `"on:${event.name}"?: (e: CustomEvent<…>) => void;` (its index.js:295). Svelte
 * 5 replaced the `on:event` directive with plain event-handler **properties**
 * (`<el onclick={…}>`), so a Svelte 5 component that writes `onclick={…}` finds no
 * matching member on the element type and the language server flags it.
 *
 * For each emitted `"on:NAME"?: <handler>;` line, emit an additional sibling
 * `"onNAME"?: <handler>;` carrying the identical `CustomEvent` signature, so both
 * the Svelte 4 directive and the Svelte 5 property form resolve against the same
 * event type. The `on` + verbatim-name convention matches what the JSX tool
 * already emits. Components with no events produce no matches and pass through
 * unchanged, so this is a safe no-op when there is nothing to augment.
 */
const SVELTE4_EVENT_HANDLER = /^([ \t]*)"on:([^"]+)"(\?:.*=> void;)$/gmu;

function addSvelte5EventHandlers(contents: string): string {
  return contents.replace(
    SVELTE4_EVENT_HANDLER,
    (_match, indent, name, handler) =>
      `${indent}"on:${name}"${handler}\n${indent}"on${name}"${handler}`,
  );
}

/**
 * Matches one generated per-component props block —
 * `type <ClassName>Props = {\n …members… \n};` — capturing the class-name stem
 * (group 1, e.g. `AuroButton` from `AuroButtonProps`) and the block body (group
 * 2). The trailing `\n};` at column 0 bounds the block; member lines are indented
 * so the non-greedy body stops at the first closing brace. This also matches the
 * fixed `BaseProps` block, which {@link labelComponentMembers} filters out by
 * class name (`BaseEvents` has no `Props` suffix, so it never matches).
 */
const PROPS_BLOCK = /^type (\w+)Props = \{\n([\s\S]*?)\n\};$/gm;

/** Start of every single-line JSDoc the tool emits for a component member. */
const MEMBER_JSDOC_OPEN = /\/\*\* /g;

/**
 * The Svelte language server flattens each element's type
 * (`Partial<<Name>Props & BaseProps & BaseEvents>`) into one alphabetized
 * completion list with identical icons, so a component's own members (`variant`,
 * `shape`) are visually indistinguishable from the inherited global HTML
 * attributes (`id`, `class`, `title`). We can't change the icon or grouping (the
 * language server owns those), but we *can* prefix a marker into the JSDoc that
 * shows in the hover/completion docs pane.
 *
 * For every member inside a per-component `type <Name>Props` block, prefix
 * `【<label>】 ` onto its JSDoc. `<label>` is the tag the consumer actually
 * writes in markup — the registered tag when the project renamed it, falling back
 * to the component class name when it kept the default `auro-*` tag (so the marker
 * never just echoes the obvious default). `markerByClass` is keyed by class name
 * (`declaration.name`), which is exactly the `<Name>` stem of each props block.
 * Blocks whose stem is not a known component — `BaseProps` — are returned
 * untouched, so inherited attributes stay unmarked and remain the visual "other"
 * group. Members without JSDoc (e.g. the Svelte 5 `"onNAME"` handler sibling) have
 * nothing to prefix and pass through unchanged.
 */
function labelComponentMembers(
  contents: string,
  markerByClass: ReadonlyMap<string, string>,
): string {
  return contents.replace(PROPS_BLOCK, (whole, className, body) => {
    const label = markerByClass.get(className);
    if (label === undefined) {
      return whole;
    }
    const marked = body.replace(MEMBER_JSDOC_OPEN, `/** 【${label}】 `);
    return `type ${className}Props = {\n${marked}\n};`;
  });
}

/**
 * Build the class-name → marker-label map {@link labelComponentMembers} consumes.
 * The label is the registered tag (what the consumer writes in markup); when the
 * project kept the component's default `auro-*` tag we fall back to the class name
 * rather than repeat the obvious default. Keyed by `declaration.name` to match the
 * `<Name>Props` block stems the tool emits.
 */
function markerLabelsByClass(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string>,
): Map<string, string> {
  return new Map(
    components.map((component) => {
      const defaultTag = component.tagName;
      const resolvedTag = resolvedTags.get(defaultTag) ?? defaultTag;
      const label =
        resolvedTag === defaultTag ? component.declaration.name : resolvedTag;
      return [component.declaration.name, label];
    }),
  );
}

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
  const markerByClass = markerLabelsByClass(components, resolvedTags);

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
    contents: ensureTrailingNewline(
      globalizeSvelteNamespace(
        addSvelte5EventHandlers(labelComponentMembers(contents, markerByClass)),
      ),
    ),
  };
}
