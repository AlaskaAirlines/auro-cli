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

/**
 * The standard WAI-ARIA state/property attributes plus a `data-*` catch-all — the
 * accessibility/data global attributes the community JSX/Svelte tools omit from
 * their hardcoded `BaseProps`. Each generated element type
 * (`Partial<Props & BaseProps & BaseEvents>`) *replaces* the tag's intrinsic
 * element type, so any attribute absent here is flagged as unknown — without this
 * block `<auro-button aria-label="Save" />` errors as an unknown prop.
 *
 * Value types mirror React's `AriaAttributes`; boolean-ish unions are inlined
 * (`boolean | "true" | "false"`) so the whole block is a single splice needing no
 * extra top-level alias. The `data-*` entry is a **template-literal** index
 * signature (not `[key: string]`), so it constrains only `data-*` keys and does
 * not force the tools' existing `style` / `ref` / `tabIndex` members to conform.
 * Lines are 2-space indented to match the tools' prettier output. `role` is not
 * here — the JSX tool already emits it; {@link injectGlobalAttributes} prepends it
 * for the Svelte target, whose `BaseProps` lacks it.
 */
const GLOBAL_ARIA_ATTRS = `  /** Identifies the currently active descendant of a composite widget. */
  "aria-activedescendant"?: string;
  /** Whether assistive technologies present all, or only parts of, changed regions. */
  "aria-atomic"?: boolean | "true" | "false";
  /** Whether inputting text triggers display of one or more predictions. */
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  /** Defines a string value that labels the current element (braille). */
  "aria-braillelabel"?: string;
  /** Defines a human-readable, author-localized abbreviated role description (braille). */
  "aria-brailleroledescription"?: string;
  /** Whether an element is being modified and assistive technologies may wait. */
  "aria-busy"?: boolean | "true" | "false";
  /** The current "checked" state of checkboxes, radio buttons, and other widgets. */
  "aria-checked"?: boolean | "false" | "mixed" | "true";
  /** Defines the total number of columns in a table, grid, or treegrid. */
  "aria-colcount"?: number;
  /** Defines an element's column index or position within a table, grid, or treegrid. */
  "aria-colindex"?: number;
  /** A human-readable text alternative of aria-colindex. */
  "aria-colindextext"?: string;
  /** Defines the number of columns spanned by a cell or gridcell. */
  "aria-colspan"?: number;
  /** Identifies the element(s) whose contents or presence are controlled by this element. */
  "aria-controls"?: string;
  /** The element that represents the current item within a container or set. */
  "aria-current"?: boolean | "false" | "true" | "page" | "step" | "location" | "date" | "time";
  /** Identifies the element(s) that describes the object. */
  "aria-describedby"?: string;
  /** Defines a string value that describes or annotates the current element. */
  "aria-description"?: string;
  /** Identifies the element that provides a detailed, extended description. */
  "aria-details"?: string;
  /** Whether the element is perceivable but disabled, so not editable or operable. */
  "aria-disabled"?: boolean | "true" | "false";
  /** What functions can be performed when a dragged object is released. */
  "aria-dropeffect"?: "none" | "copy" | "execute" | "link" | "move" | "popup";
  /** Identifies the element that provides an error message for the object. */
  "aria-errormessage"?: string;
  /** Whether the element, or another grouping element it controls, is expanded. */
  "aria-expanded"?: boolean | "true" | "false";
  /** The next element(s) in an alternate reading order of content. */
  "aria-flowto"?: string;
  /** Whether an element is in a "grabbed" state in a drag-and-drop operation. */
  "aria-grabbed"?: boolean | "true" | "false";
  /** Indicates the availability and type of an interactive popup element. */
  "aria-haspopup"?: boolean | "false" | "true" | "menu" | "listbox" | "tree" | "grid" | "dialog";
  /** Whether the element is exposed to an accessibility API. */
  "aria-hidden"?: boolean | "true" | "false";
  /** Whether the entered value does not conform to the expected format. */
  "aria-invalid"?: boolean | "false" | "true" | "grammar" | "spelling";
  /** Keyboard shortcuts an author has implemented to activate or focus an element. */
  "aria-keyshortcuts"?: string;
  /** A string value that labels the current element. */
  "aria-label"?: string;
  /** Identifies the element(s) that labels the current element. */
  "aria-labelledby"?: string;
  /** Defines the hierarchical level of an element within a structure. */
  "aria-level"?: number;
  /** Indicates that an element will be updated, and how live updates are described. */
  "aria-live"?: "off" | "assertive" | "polite";
  /** Whether an element is modal when displayed. */
  "aria-modal"?: boolean | "true" | "false";
  /** Whether a text box accepts multiple lines of input or only a single line. */
  "aria-multiline"?: boolean | "true" | "false";
  /** Whether the user may select more than one item from the current selectable descendants. */
  "aria-multiselectable"?: boolean | "true" | "false";
  /** Whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  "aria-orientation"?: "horizontal" | "vertical";
  /** Identifies an element in order to define a visual, functional, or contextual relationship. */
  "aria-owns"?: string;
  /** A short hint intended to aid the user with data entry when the control has no value. */
  "aria-placeholder"?: string;
  /** The number or position of an item in the current set of listitems or treeitems. */
  "aria-posinset"?: number;
  /** The current "pressed" state of toggle buttons. */
  "aria-pressed"?: boolean | "false" | "mixed" | "true";
  /** Whether the element is not editable but is otherwise operable. */
  "aria-readonly"?: boolean | "true" | "false";
  /** What notifications the user agent triggers when the accessibility tree is modified. */
  "aria-relevant"?: "additions" | "additions removals" | "additions text" | "all" | "removals" | "removals additions" | "removals text" | "text" | "text additions" | "text removals";
  /** Whether user input is required on the element before a form may be submitted. */
  "aria-required"?: boolean | "true" | "false";
  /** A human-readable, author-localized description for the role of an element. */
  "aria-roledescription"?: string;
  /** Defines the total number of rows in a table, grid, or treegrid. */
  "aria-rowcount"?: number;
  /** Defines an element's row index or position within a table, grid, or treegrid. */
  "aria-rowindex"?: number;
  /** A human-readable text alternative of aria-rowindex. */
  "aria-rowindextext"?: string;
  /** Defines the number of rows spanned by a cell or gridcell. */
  "aria-rowspan"?: number;
  /** The current "selected" state of various widgets. */
  "aria-selected"?: boolean | "true" | "false";
  /** Defines the number of items in the current set of listitems or treeitems. */
  "aria-setsize"?: number;
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  "aria-sort"?: "none" | "ascending" | "descending" | "other";
  /** Defines the maximum allowed value for a range widget. */
  "aria-valuemax"?: number;
  /** Defines the minimum allowed value for a range widget. */
  "aria-valuemin"?: number;
  /** Defines the current value for a range widget. */
  "aria-valuenow"?: number;
  /** Defines the human-readable text alternative of aria-valuenow. */
  "aria-valuetext"?: string;
  /** Custom data-* attributes for the element. */
  [key: \`data-\${string}\`]: string | number | boolean | null | undefined;
`;

/** Matches the opening of the tool-generated `BaseProps` block (JSX form is generic). */
const BASE_PROPS_OPEN = /(type BaseProps(?:<[^>]*>)? = \{\n)/;

/** The `role` member, prepended for the Svelte target whose `BaseProps` omits it. */
const ROLE_MEMBER =
  "  /** Defines the element's semantic role for accessibility APIs. */\n  role?: string;\n";

/**
 * Splice the standard ARIA / `data-*` global attributes ({@link GLOBAL_ARIA_ATTRS})
 * into a generated file's `BaseProps` block, immediately after its opening brace —
 * mirroring how `NATIVE_DOM_EVENTS` is folded into `BaseEvents`. Pass `role: true`
 * for the Svelte target (its `BaseProps` lacks `role`); the JSX tool already emits
 * `role`, so pass `role: false` there to avoid a duplicate member.
 *
 * Throws if the `BaseProps` opening is absent (e.g. an upstream reflow of the
 * community tool) rather than returning the string unchanged — a silent no-op
 * would ship element types that reject `aria-*`, so we surface the drift as a
 * loud, test-caught failure, matching `globalizeSvelteNamespace`'s convention.
 */
export function injectGlobalAttributes(
  contents: string,
  { role }: { role: boolean },
): string {
  if (!BASE_PROPS_OPEN.test(contents)) {
    throw new Error(
      "the JSX/Svelte generator no longer emits a recognizable `type BaseProps = {` " +
        "block; the global-attribute injection in manifest.ts must be updated to match.",
    );
  }
  const block = `${role ? ROLE_MEMBER : ""}${GLOBAL_ARIA_ATTRS}`;
  return contents.replace(BASE_PROPS_OPEN, `$1${block}`);
}
