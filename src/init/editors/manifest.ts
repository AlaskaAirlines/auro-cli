/**
 * Shared plumbing for the three per-target editor builders
 * (./htmlCustomData.ts, ./jsxTypes.ts, ./svelteTypes.ts). It owns the two seams
 * every builder needs — the resolved-tag lookup and the synthetic manifest the
 * community tools consume — plus the temp-dir shim that discards the files those
 * tools insist on writing. The builders stay pure functions of
 * `(components, resolvedTags)`; all the "turn our model into their input" glue
 * lives here so it is defined once and cannot drift between targets.
 *
 * @see docs/pt-m2-completion-plan.md → "Frozen decisions → Tag-swap seam /
 *   Class-import seam" and build-order step 2.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedComponent } from "#init/resolver.js";
import type { CemAttribute, CemDeclaration, Manifest } from "#utils/cem.js";

/**
 * True when every bracket pair (`()[]{}<>`) in `text` is balanced, treating a
 * `=>` arrow as text rather than a generic close. The community JSX/Svelte tools
 * splice a CEM `type.text` verbatim into generated TypeScript, so a truncated or
 * garbled type — e.g. auro-formkit's `auroDropdown-idAdded` event ships the type
 * `"Object<key"` — yields output no parser (prettier/tsc) can read. A cheap
 * balance check is enough to catch these real-world defects without trying to be
 * a TypeScript parser; anything that fails it is dropped so the generator falls
 * back to its default handler/prop type.
 */
function hasBalancedDelimiters(text: string): boolean {
  const closeToOpen: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
    ">": "<",
  };
  const stack: string[] = [];
  let prev = "";
  for (const ch of text) {
    if (ch === ">" && prev === "=") {
      // `=>` arrow — not a generic close.
      prev = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") {
      stack.push(ch);
    } else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") {
      if (stack.pop() !== closeToOpen[ch]) {
        return false;
      }
    }
    prev = ch;
  }
  return stack.length === 0;
}

/**
 * Strip an entry's `type` when its `type.text` is present but malformed (see
 * {@link hasBalancedDelimiters}), leaving a well-formed entry the generators can
 * fall back to a default type for. A slightly looser type (`CustomEvent`,
 * `unknown`) beats an artifact no compiler accepts.
 */
function withSafeType<T extends { type?: { text?: string } }>(entry: T): T {
  const text = entry.type?.text;
  if (typeof text === "string" && text !== "" && !hasBalancedDelimiters(text)) {
    const { type: _dropped, ...rest } = entry;
    return rest as T;
  }
  return entry;
}

/**
 * True when `attribute` merely reflects an internal (private or omitted) property
 * and carries no documentation of its own — e.g. auro-button's `data-hover` /
 * `data-active`, reflected from its `@private onHover` / `onActive` members. The
 * CEM analyzer derives an attribute from a property's `attribute:` / `reflect:`
 * options **independently of the property's `privacy`**, so `@private` (or
 * `@ignore`) on the source suppresses the *member* but still emits the
 * *attribute* as a public, description-less entry — which then leaks into editor
 * autocomplete as something a consumer might set, when it never should.
 *
 * We treat an attribute as such a leak when its backing member (`fieldName`) is
 * private/protected, or absent from the (pruned) member list — meaning the
 * property was intentionally omitted, e.g. dropped as `@private` — **and** the
 * attribute has no description. The no-description guard deliberately preserves
 * documented reflections a component *does* expose on purpose (e.g. a11y
 * `role` / `aria-*` attributes carrying real descriptions). An attribute with no
 * `fieldName` has no backing member to judge and is always kept.
 *
 * @see docs/pt-m2-completion-plan.md → Risks/open questions, "Private-reflected
 *   attributes leak into autocomplete".
 */
function isPrivateReflection(
  attribute: CemAttribute,
  memberPrivacyByName: ReadonlyMap<string, string | undefined>,
): boolean {
  const { fieldName, description } = attribute;
  if (typeof fieldName !== "string" || fieldName === "") {
    return false; // no backing member to judge — keep it
  }
  if (typeof description === "string" && description !== "") {
    return false; // deliberately documented — keep it
  }
  if (!memberPrivacyByName.has(fieldName)) {
    return true; // backing property omitted (e.g. pruned as @private)
  }
  const privacy = memberPrivacyByName.get(fieldName);
  return privacy === "private" || privacy === "protected";
}

/**
 * Normalise a CEM declaration into something the community JSX/Svelte/HTML
 * generators reliably accept:
 *
 * 1. Drop entries whose `name` is not a string from every named collection
 *    (members, attributes, slots, events, css parts/properties). The schema
 *    types these as required, but real manifests ship the odd nameless entry —
 *    e.g. auro-formkit's `auro-menu` has a `{ kind: "field", type, default }`
 *    member with no `name` — and the tools call `member.name.startsWith("#")`,
 *    throwing mid-generation. A nameless member can't become a typed prop anyway.
 *    (An empty-string name is kept — it is the valid default-slot name.)
 * 2. Drop a malformed `type.text` from members/attributes/events (see
 *    {@link withSafeType}) so a garbled type can't produce unparseable output.
 * 3. Drop attributes that merely reflect a private/omitted property and carry no
 *    description (see {@link isPrivateReflection}) so an internal reflection like
 *    `data-hover` never leaks into editor autocomplete as a settable attribute.
 *
 * Everything else on the declaration is preserved verbatim.
 */
function withNamedEntriesPruned(declaration: CemDeclaration): CemDeclaration {
  const hasName = (entry: { name?: unknown }): boolean =>
    typeof entry.name === "string";
  const members = declaration.members?.filter(hasName).map(withSafeType);
  // Backing-member privacy for the private-reflection guard, keyed by member
  // name. Built from the pruned members (nameless entries can't be a fieldName
  // target); an attribute whose fieldName is missing here reflects an omitted
  // property.
  const memberPrivacyByName = new Map<string, string | undefined>(
    (members ?? []).map((member) => [member.name, member.privacy]),
  );
  return {
    ...declaration,
    ...(members && { members }),
    ...(declaration.attributes && {
      attributes: declaration.attributes
        .filter(hasName)
        .filter(
          (attribute) => !isPrivateReflection(attribute, memberPrivacyByName),
        )
        .map(withSafeType),
    }),
    ...(declaration.slots && { slots: declaration.slots.filter(hasName) }),
    ...(declaration.events && {
      events: declaration.events.filter(hasName).map(withSafeType),
    }),
    ...(declaration.cssParts && {
      cssParts: declaration.cssParts.filter(hasName),
    }),
    ...(declaration.cssProperties && {
      cssProperties: declaration.cssProperties.filter(hasName),
    }),
  };
}

/** An editor artifact `auro init` writes: its project-root-relative path + body. */
export interface EditorArtifact {
  /**
   * The file to write, relative to the project root, using forward slashes
   * (e.g. `.vscode/auro.html-custom-data.json`). `init` splits on `/` to join it
   * onto the target OS's path separator.
   */
  filename: string;
  /** The complete file contents, newline-terminated. */
  contents: string;
}

/**
 * The tag a consumer actually registers for a component: its resolved
 * custom/prefixed tag when the registry provided one (keyed by the canonical
 * bare `auro-*` tag), else the canonical tag itself. Mirrors the generator's
 * `displayTag` so every target keys on the same resolved tag — never the bare
 * `auro-*` tag — and an absent entry simply means "no custom registration".
 */
export function resolvedTagFor(
  component: ResolvedComponent,
  resolvedTags: ReadonlyMap<string, string>,
): string {
  return resolvedTags.get(component.tagName) ?? component.tagName;
}

/**
 * A map from each component's class name to the module specifier it should be
 * imported from — the component's `importPath` (package root for a standalone,
 * subpath export for a monorepo component). The JSX and Svelte tools take a
 * `componentTypePath` callback keyed by class name; this feeds it so the emitted
 * `import type { AuroButton } from "…"` points at the installed package, not the
 * CEM's internal `src/auro-button.js` path.
 */
export function importPathsByClass(
  components: readonly ResolvedComponent[],
): Map<string, string> {
  return new Map(components.map((c) => [c.declaration.name, c.importPath]));
}

/**
 * Assemble a Custom Elements Manifest the community tools can consume from our
 * flat `ResolvedComponent[]`: one `javascript-module` per component, its `path`
 * set to the component's `importPath` so any manifest-derived import resolves to
 * the installed package. Each declaration is emitted verbatim EXCEPT its
 * `tagName`, which is set via {@link resolvedTagFor} when `resolvedTags` is
 * given — the pre-swap seam the HTML and Svelte targets rely on (they have no
 * per-tag formatter hook). The JSX target omits `resolvedTags` (keeping the bare
 * `auro-*` tags) and swaps via the tool's `tagFormatter` instead.
 */
export function buildManifest(
  components: readonly ResolvedComponent[],
  resolvedTags?: ReadonlyMap<string, string>,
): Manifest {
  return {
    schemaVersion: "1.0.0",
    modules: components.map((component) => {
      const declaration: CemDeclaration = withNamedEntriesPruned({
        ...component.declaration,
        tagName: resolvedTags
          ? resolvedTagFor(component, resolvedTags)
          : component.tagName,
      });
      return {
        kind: "javascript-module",
        path: component.importPath,
        declarations: [declaration],
        exports: [
          {
            kind: "js",
            name: declaration.name,
            declaration: {
              name: declaration.name,
              module: component.importPath,
            },
          },
        ],
      };
    }),
  };
}

/**
 * Run `fn` with a throwaway temp directory, always removing it afterward. The
 * three community tools each insist on writing their output to a file on disk;
 * the builders point them at this scratch dir and either use the string they
 * also return (HTML/JSX) or read the written file back (Svelte), so nothing ever
 * lands in the consumer's project except the artifact `init` writes itself.
 */
export function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "auro-editors-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Guarantee exactly one trailing newline, matching the grounding-file convention. */
export function ensureTrailingNewline(contents: string): string {
  return contents.endsWith("\n") ? contents : `${contents}\n`;
}
