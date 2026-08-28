/**
 * Build the VS Code CSS snippets artifact (`.vscode/auro.code-snippets`) that
 * gives editor-assisted `::part()` completion for the installed components'
 * shadow parts. Pure: `(components, resolvedTags) → EditorArtifact | null`.
 *
 * This is the ONLY target that assists shadow-part styling. The other artifacts
 * can't: VS Code CSS custom-data (`css.customData`) has no field to enumerate an
 * element's `::part()` argument names, and the JSX/Svelte `.d.ts` describe
 * attributes, not the CSS the language service resolves `::part()` against. The
 * source data — each component's CEM `cssParts` (`{ name, description? }`) — is
 * already installed, so we emit one snippet per component whose body is a
 * `${1|…|}` choice placeholder of that component's part names, keyed and prefixed
 * on the **resolved tag** the consumer actually writes in a stylesheet.
 *
 * VS Code auto-discovers any `.vscode/*.code-snippets` file, so — unlike the HTML
 * custom-data target — nothing registers this in `settings.json`; writing the
 * file is the whole wiring. `scope: "css,scss,less"` fires it across plain CSS
 * and the SCSS/LESS preprocessors (and Svelte `<style>`, which is CSS-language —
 * a part there needs a `:global(...)` wrapper because of Svelte's style scoping).
 *
 * Returns `null` when no installed component exposes any `cssParts`, so `init`
 * writes nothing rather than an empty `{}` snippets file.
 *
 * @see docs/pt-m2-completion-plan.md → the CSS `::part()` snippets decision.
 */

import { CSS_SNIPPETS_PATH } from "#init/editors/layout.js";
import {
  type EditorArtifact,
  ensureTrailingNewline,
  resolvedTagFor,
} from "#init/editors/manifest.js";
import type { ResolvedComponent } from "#init/resolver.js";

/** One VS Code snippet entry (the value side of a `.code-snippets` map). */
interface CodeSnippet {
  scope: string;
  prefix: string;
  body: string[];
  description: string;
}

/**
 * The stylesheet languages the snippet fires in. Plain CSS plus the two
 * preprocessors that share `::part()` selector syntax; Svelte `<style>` is
 * CSS-language and picks it up too (with a documented `:global(...)` caveat).
 */
const SNIPPET_SCOPE = "css,scss,less";

/**
 * A part name is dropped when it contains a character that would corrupt the
 * `${1|a,b,c|}` choice placeholder (`,` and `|` are its delimiters, `}` closes
 * it). Real CSS part names are identifiers, so this only guards against a
 * malformed CEM — it never trims a legitimate name.
 */
function isChoiceSafe(name: string): boolean {
  return !/[,|}]/u.test(name);
}

/**
 * Part names for one component: its declared `cssParts`, each pruned to a
 * non-empty, choice-safe string name (mirrors the manifest's `hasName` guard).
 * Order is preserved so the choice list reads in the component's declared order.
 */
function partNames(component: ResolvedComponent): string[] {
  return (component.declaration.cssParts ?? [])
    .map((part) => part.name)
    .filter((name): name is string => typeof name === "string" && name !== "")
    .filter(isChoiceSafe);
}

/** Build the `${1|…|}` choice-placeholder snippet for one tag + its part names. */
function snippetFor(tag: string, parts: string[]): CodeSnippet {
  const choice = `\${1|${parts.join(",")}|}`;
  return {
    scope: SNIPPET_SCOPE,
    prefix: `${tag}::part`,
    body: [`${tag}::part(${choice}) {`, "\t$0", "}"],
    description: `Style a shadow part of <${tag}> (${parts.join(", ")})`,
  };
}

/**
 * Render the CSS `::part()` snippets for the resolved component set. Each
 * component with at least one usable part contributes one snippet keyed
 * `Auro <tag> ::part`; components with no parts are omitted. Returns the
 * artifact's project-root-relative path plus its contents, or `null` when no
 * component exposes any parts (so the caller writes nothing). Writing is the
 * caller's job.
 */
export function buildCssSnippets(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string>,
): EditorArtifact | null {
  const snippets: Record<string, CodeSnippet> = {};

  for (const component of components) {
    const parts = partNames(component);
    if (parts.length === 0) {
      continue;
    }
    const tag = resolvedTagFor(component, resolvedTags);
    snippets[`Auro <${tag}> ::part`] = snippetFor(tag, parts);
  }

  if (Object.keys(snippets).length === 0) {
    return null;
  }

  return {
    filename: CSS_SNIPPETS_PATH,
    contents: ensureTrailingNewline(JSON.stringify(snippets, null, 2)),
  };
}
