import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";
import { buildCssSnippets } from "../src/init/editors/cssSnippets.ts";
import { buildHtmlCustomData } from "../src/init/editors/htmlCustomData.ts";
import { buildJsxTypes } from "../src/init/editors/jsxTypes.ts";
import {
  CSS_SNIPPETS_PATH,
  HTML_CUSTOM_DATA_PATH,
  JSX_TYPES_PATH,
  SVELTE_TYPES_PATH,
} from "../src/init/editors/layout.ts";
import {
  mergeTsconfigInclude,
  mergeVsCodeSettings,
} from "../src/init/editors/settings.ts";
import { buildSvelteTypes } from "../src/init/editors/svelteTypes.ts";
import type { ResolvedComponent } from "../src/init/resolver.ts";
import { BUTTON, COMPONENTS, INPUT, RESOLVED_TAGS } from "./support.editors.ts";

/**
 * Build-order step 2: the three pure per-target builders and the two config
 * merges. The byte-exact golden tests below are the ones the step-1 format freeze
 * deferred ("the builders don't exist yet") — they pin real community-tool output
 * over the SAME synthetic components the PT-M1 AGENTS.md fixture uses, so the
 * editor artifacts and grounding docs stay on one consistent resolved manifest.
 */

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/init/editors/${name}`, import.meta.url)),
    "utf-8",
  );

const basename = (path: string): string => path.split("/").pop() as string;

// ---------------------------------------------------------------------------
// Byte-exact golden output (builders are the source of truth for the fixtures)
// ---------------------------------------------------------------------------

test("buildHtmlCustomData reproduces the golden HTML custom-data byte-for-byte", () => {
  const artifact = buildHtmlCustomData(COMPONENTS, RESOLVED_TAGS);
  assert.equal(artifact.filename, HTML_CUSTOM_DATA_PATH);
  assert.equal(artifact.contents, fixture(basename(HTML_CUSTOM_DATA_PATH)));
});

test("buildJsxTypes reproduces the golden JSX types byte-for-byte", () => {
  const artifact = buildJsxTypes(COMPONENTS, RESOLVED_TAGS);
  assert.equal(artifact.filename, JSX_TYPES_PATH);
  assert.equal(artifact.contents, fixture(basename(JSX_TYPES_PATH)));
});

test("buildSvelteTypes reproduces the golden Svelte types byte-for-byte", () => {
  const artifact = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS);
  assert.equal(artifact.filename, SVELTE_TYPES_PATH);
  assert.equal(artifact.contents, fixture(basename(SVELTE_TYPES_PATH)));
});

test("buildCssSnippets reproduces the golden CSS snippets byte-for-byte", () => {
  const artifact = buildCssSnippets(COMPONENTS, RESOLVED_TAGS);
  assert.ok(artifact, "BUTTON exposes cssParts, so an artifact is produced");
  assert.equal(artifact.filename, CSS_SNIPPETS_PATH);
  assert.equal(artifact.contents, fixture(basename(CSS_SNIPPETS_PATH)));
});

test("buildSvelteTypes wraps the svelteHTML augmentation in `declare global`", () => {
  // The tool emits a module-scoped `declare namespace svelteHTML`, which is
  // inert in a module file — the Svelte language server reads the *global*
  // namespace. buildSvelteTypes must globalize it, or element completion never
  // appears. Regression guard for the wiring fix.
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  assert.match(
    svelte,
    /declare global \{\s*namespace svelteHTML \{/u,
    "svelteHTML augmentation must be wrapped in declare global",
  );
  assert.doesNotMatch(
    svelte,
    /^declare namespace svelteHTML/mu,
    "no bare module-scoped declare namespace should remain",
  );
});

test("every builder emits a single trailing newline", () => {
  for (const artifact of [
    buildHtmlCustomData(COMPONENTS, RESOLVED_TAGS),
    buildJsxTypes(COMPONENTS, RESOLVED_TAGS),
    buildSvelteTypes(COMPONENTS, RESOLVED_TAGS),
  ]) {
    assert.equal(artifact.contents.endsWith("\n"), true);
    assert.equal(artifact.contents.endsWith("\n\n"), false);
  }
});

// ---------------------------------------------------------------------------
// Tag-swap seam: default prefix, arbitrary override, bare fallback
// ---------------------------------------------------------------------------

test("HTML custom-data keys on the resolved tag, across all three targets", () => {
  // Default-prefix (myapp-) and per-component override (legacy-input) both land.
  const html = buildHtmlCustomData(COMPONENTS, RESOLVED_TAGS).contents;
  const jsx = buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents;
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  for (const out of [html, jsx, svelte]) {
    assert.match(out, /myapp-button/u);
    assert.match(out, /legacy-input/u);
    assert.doesNotMatch(out, /"auro-button"/u, "bare tag not registered");
  }
});

test("an arbitrary override tag flows through every builder", () => {
  const override = new Map([["auro-button", "x-anything"]]);
  const html = buildHtmlCustomData([BUTTON], override).contents;
  const jsx = buildJsxTypes([BUTTON], override).contents;
  const svelte = buildSvelteTypes([BUTTON], override).contents;
  for (const out of [html, jsx, svelte]) {
    assert.match(out, /x-anything/u, "arbitrary custom tag honored");
  }
});

test("a component with no resolved tag falls back to its bare auro-* tag", () => {
  const empty = new Map<string, string>();
  const html = buildHtmlCustomData([BUTTON], empty).contents;
  const jsx = buildJsxTypes([BUTTON], empty).contents;
  const svelte = buildSvelteTypes([BUTTON], empty).contents;
  for (const out of [html, jsx, svelte]) {
    assert.match(out, /auro-button/u, "bare tag used when unresolved");
    assert.doesNotMatch(out, /myapp-button/u);
  }
});

// ---------------------------------------------------------------------------
// Type source: JSX imports each class from its installed importPath (for events
// / named references); Svelte inlines CEM types with no package import at all.
// Both target the CEM's `type.text` for prop VALUES — never `Component['prop']`,
// which resolves to `any` against the packages' unresolvable class .d.ts.
// ---------------------------------------------------------------------------

test("JSX routes class imports through the resolved importPath", () => {
  const jsx = buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents;
  // Standalone → package root; monorepo → per-component subpath export.
  assert.match(
    jsx,
    /import type \{ AuroButton \} from "@aurodesignsystem\/auro-button"/u,
  );
  assert.match(
    jsx,
    /import type \{ AuroInput \} from "@aurodesignsystem\/auro-formkit\/auro-input"/u,
  );
});

test("Svelte inlines CEM types and emits no package class import", () => {
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  // With no componentTypePath the Svelte tool inlines `type.text` instead of
  // `Component['field']` — so there is no `import type { Auro… } from "…"` line
  // and nothing depends on the packages' (broken) shipped class declarations.
  assert.doesNotMatch(
    svelte,
    /import type \{[^}]*\} from "@aurodesignsystem\//u,
    "Svelte artifact must not import any component class",
  );
});

// ---------------------------------------------------------------------------
// Event handlers: the tool emits only the Svelte 4 `on:event` directive form;
// Svelte 5 uses handler *properties* (`onclick={…}`). buildSvelteTypes emits BOTH
// so a component that uses either syntax type-checks against the same event type.
// ---------------------------------------------------------------------------

test("Svelte emits both the Svelte 4 directive and Svelte 5 property event handler", () => {
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  const handler = String.raw`\?: \(e: CustomEvent<never>\) => void;`;
  // Svelte 4 directive form (what the community tool emits).
  assert.match(
    svelte,
    new RegExp(`"on:click"${handler}`, "u"),
    "Svelte 4 `on:click` directive handler present",
  );
  // Svelte 5 property form (the sibling we add) — identical signature.
  assert.match(
    svelte,
    new RegExp(`"onclick"${handler}`, "u"),
    "Svelte 5 `onclick` property handler present",
  );
});

// ---------------------------------------------------------------------------
// Native DOM events: a CEM only declares a component's OWN events, so native
// handlers (onClick/onFocus/…) must be folded in explicitly — JSX via the tool's
// includeDefaultDOMEvents flag, Svelte via the NATIVE_DOM_EVENTS globalEvents
// splice. Guards the option wiring beyond the opaque byte-exact golden.
// ---------------------------------------------------------------------------

test("JSX includes native DOM event handlers on every element", () => {
  const jsx = buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents;
  // A representative native handler absent from any Auro CEM, typed to the DOM
  // event (not a CustomEvent) — proves includeDefaultDOMEvents is wired.
  assert.match(jsx, /onFocus\?: \(event: FocusEvent\) => void;/u);
  assert.match(jsx, /onKeyDown\?: \(event: KeyboardEvent\) => void;/u);
});

test("Svelte includes native DOM events in both the directive and property form", () => {
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  // Svelte 4 directive form (what NATIVE_DOM_EVENTS injects) …
  assert.match(svelte, /"on:focus"\?: \(e: FocusEvent\) => void;/u);
  // … and the Svelte 5 property sibling addSvelte5EventHandlers derives from it.
  assert.match(svelte, /"onfocus"\?: \(e: FocusEvent\) => void;/u);
});

// ---------------------------------------------------------------------------
// Global attributes: the generated element type REPLACES the tag's intrinsic
// type, and the tools' hardcoded BaseProps omits aria-*/data-* (Svelte also omits
// `role` and the lowercase `tabindex`, spelling tab order as React's `tabIndex`).
// injectGlobalAttributes splices the standard ARIA + data-* set in, so valid a11y
// markup (`aria-label`) type-checks without loosening component-prop validation.
// Guards the injection beyond the opaque byte-exact golden.
// ---------------------------------------------------------------------------

test("JSX includes ARIA and data-* global attributes", () => {
  const jsx = buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents;
  assert.match(jsx, /"aria-label"\?: string;/u);
  assert.match(jsx, /\[key: `data-\$\{string\}`\]:/u);
});

test("Svelte includes role, lowercase tabindex, ARIA, and data-* global attributes", () => {
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  // Svelte's BaseProps lacks `role` entirely and spells tab order as React's
  // camelCase `tabIndex`, so the injection adds the lowercase HTML forms Svelte
  // markup writes (`role`, `tabindex`).
  assert.match(svelte, /\n {2}role\?: string;/u);
  assert.match(svelte, /\n {2}tabindex\?: number;/u);
  assert.match(svelte, /"aria-label"\?: string;/u);
  assert.match(svelte, /\[key: `data-\$\{string\}`\]:/u);
});

// ---------------------------------------------------------------------------
// Member labeling: the Svelte language server flattens each element's type into
// one completion list where a component's own members are indistinguishable from
// inherited global HTML attributes. buildSvelteTypes marks component members in
// their JSDoc (docs pane) with the tag the consumer writes — the registered tag,
// or the class name when the default tag was kept — while leaving BaseProps bare.
// ---------------------------------------------------------------------------

test("Svelte marks component-owned members with the registered tag, not inherited HTML attrs", () => {
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;

  // Component members carry the marker using the *registered* tag (myapp-button,
  // legacy-input), not the component's default auro-* tag.
  assert.match(
    svelte,
    /\/\*\* 【myapp-button】 Visual style variant\. \*\//u,
    "component attribute JSDoc is prefixed with the registered tag marker",
  );
  assert.match(
    svelte,
    /\/\*\* 【legacy-input】 Marks the field as required\. \*\//u,
    "each component's members use that component's own registered tag",
  );
  // Events are component-owned too, so they are marked as well.
  assert.match(
    svelte,
    /\/\*\* 【myapp-button】 Fired on activation\. \*\//u,
    "component event JSDoc is marked",
  );
  // Inherited global HTML attributes (BaseProps) stay unmarked — they are the
  // visual "other" group the marker distinguishes component members from.
  assert.match(
    svelte,
    /\/\*\* A unique identifier for the element\. \*\/\s*\n\s*id\?: string;/u,
    "inherited BaseProps attributes are left unmarked",
  );
  assert.doesNotMatch(
    svelte,
    /【[^】]*】[^\n]*unique identifier/u,
    "no marker leaks onto inherited HTML attributes",
  );
});

test("Svelte member marker falls back to the class name when the default tag is kept", () => {
  // No custom registration: the resolved tag equals the component's default
  // auro-* tag, so the marker should show the class name instead of echoing the
  // obvious default tag.
  const identityTags = new Map([[BUTTON.tagName, BUTTON.tagName]]);
  const svelte = buildSvelteTypes([BUTTON], identityTags).contents;
  assert.match(
    svelte,
    /\/\*\* 【AuroButton】 Visual style variant\. \*\//u,
    "marker falls back to the class name for a default-tagged component",
  );
  assert.doesNotMatch(
    svelte,
    new RegExp(`【${BUTTON.tagName}】`, "u"),
    "marker does not echo the default auro-* tag",
  );
});

// ---------------------------------------------------------------------------
// CSS `::part()` snippets: one choice-placeholder snippet per component that
// exposes shadow parts, keyed and prefixed on the resolved tag. The ONLY target
// that assists shadow-part styling (CSS custom-data can't enumerate part names).
// ---------------------------------------------------------------------------

/** Parse the snippets artifact as its `name → snippet` JSON map. */
type Snippet = {
  scope: string;
  prefix: string;
  body: string[];
  description: string;
};
const cssSnippets = (contents: string): Record<string, Snippet> =>
  JSON.parse(contents) as Record<string, Snippet>;

test("buildCssSnippets keys the snippet, prefix, and body on the resolved tag", () => {
  const artifact = buildCssSnippets(COMPONENTS, RESOLVED_TAGS);
  assert.ok(artifact, "an artifact is produced when a component has parts");
  const snippets = cssSnippets(artifact.contents);

  // Keyed on the resolved tag (myapp-button), never the bare auro-button.
  assert.deepEqual(Object.keys(snippets), ["Auro <myapp-button> ::part"]);
  assert.ok(!("Auro <auro-button> ::part" in snippets), "bare tag not keyed");

  const snippet = snippets["Auro <myapp-button> ::part"];
  assert.equal(snippet.scope, "css,scss,less", "fires in CSS + SCSS + LESS");
  assert.equal(snippet.prefix, "myapp-button::part");
  // The body opens with a `::part(` selector whose choice placeholder lists the
  // component's parts, in declared order. Asserted piecewise (a `$`-then-`{1|`
  // choice, then the part list) so no literal snippet-choice syntax sits in a
  // plain string; the exact bytes are pinned by the byte-exact golden above.
  assert.equal(snippet.body.length, 3);
  const choiceOpen = `${"$"}{1|`;
  assert.equal(
    snippet.body[0],
    `myapp-button::part(${choiceOpen}button,contentWrapper,link,loader,text|}) {`,
    "the selector opens with a choice of the part names in order",
  );
  assert.equal(snippet.body[1], "\t$0", "the block indents to the tab stop");
  assert.equal(snippet.body[2], "}");
  assert.match(
    snippet.description,
    /button, contentWrapper, link, loader, text/u,
    "the description lists the part names",
  );
});

test("buildCssSnippets flows an arbitrary override tag into the snippet", () => {
  const override = new Map([["auro-button", "x-anything"]]);
  const artifact = buildCssSnippets([BUTTON], override);
  assert.ok(artifact);
  const snippets = cssSnippets(artifact.contents);
  assert.deepEqual(Object.keys(snippets), ["Auro <x-anything> ::part"]);
  assert.equal(snippets["Auro <x-anything> ::part"].prefix, "x-anything::part");
});

test("buildCssSnippets omits components with no cssParts", () => {
  // INPUT declares no cssParts, so the mixed set yields only the button snippet.
  const artifact = buildCssSnippets(COMPONENTS, RESOLVED_TAGS);
  assert.ok(artifact);
  const snippets = cssSnippets(artifact.contents);
  assert.equal(Object.keys(snippets).length, 1, "only the part-bearing button");
  assert.ok(!("Auro <legacy-input> ::part" in snippets));
});

test("buildCssSnippets returns null when no component exposes any parts", () => {
  // A partless component (INPUT) alone → nothing to write, so `init` skips it
  // rather than emitting an empty `{}` snippets file.
  assert.equal(buildCssSnippets([INPUT], RESOLVED_TAGS), null);
});

test("buildCssSnippets emits a single trailing newline", () => {
  const artifact = buildCssSnippets(COMPONENTS, RESOLVED_TAGS);
  assert.ok(artifact);
  assert.equal(artifact.contents.endsWith("\n"), true);
  assert.equal(artifact.contents.endsWith("\n\n"), false);
});

// ---------------------------------------------------------------------------
// Value completion/validation: a string-literal union survives to every target
// as a real union (not `any`), so editors complete + validate attribute values.
// ---------------------------------------------------------------------------

test("a string-literal union attribute is inlined as a real union in every target", () => {
  const union =
    /"primary"\s*\|\s*"secondary"\s*\|\s*"tertiary"\s*\|\s*"ghost"\s*\|\s*"flat"/u;
  const jsx = buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents;
  const svelte = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents;
  assert.match(jsx, union, "JSX inlines the union, not AuroButton['variant']");
  assert.match(svelte, union, "Svelte inlines the union, not any");
  // Neither target should degrade a typed attribute to the class-indexed form.
  assert.doesNotMatch(jsx, /AuroButton\['variant'\]/u);
  assert.doesNotMatch(svelte, /AuroButton\["variant"\]/u);

  // HTML custom-data exposes the same union as value completions.
  const data = JSON.parse(
    buildHtmlCustomData(COMPONENTS, RESOLVED_TAGS).contents,
  ) as {
    tags: {
      name: string;
      attributes?: { name: string; values?: { name: string }[] }[];
    }[];
  };
  const variant = data.tags
    .find((t) => t.name === "myapp-button")
    ?.attributes?.find((a) => a.name === "variant");
  assert.deepEqual(
    variant?.values?.map((v) => v.name),
    ["primary", "secondary", "tertiary", "ghost", "flat"],
    "HTML custom-data lists the union members as value completions",
  );
});

// ---------------------------------------------------------------------------
// HTML hover payload carries attributes, slots, and events
// ---------------------------------------------------------------------------

test("HTML custom-data carries attributes and hover docs for slots + events", () => {
  const data = JSON.parse(
    buildHtmlCustomData(COMPONENTS, RESOLVED_TAGS).contents,
  ) as {
    tags: {
      name: string;
      description?: string;
      attributes?: { name: string }[];
    }[];
  };

  const button = data.tags.find((t) => t.name === "myapp-button");
  assert.ok(button, "button tag present");
  assert.deepEqual(
    button?.attributes?.map((a) => a.name),
    ["disabled", "fluid", "variant"],
    "all public attributes emitted",
  );
  // Slots + events surface in the hover description, not as separate keys.
  assert.match(button?.description ?? "", /Slots/u);
  assert.match(
    button?.description ?? "",
    /click/u,
    "event named in hover docs",
  );
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("builders are deterministic across repeated invocations", () => {
  assert.equal(
    buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents,
    buildJsxTypes(COMPONENTS, RESOLVED_TAGS).contents,
  );
  assert.equal(
    buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents,
    buildSvelteTypes(COMPONENTS, RESOLVED_TAGS).contents,
  );
});

// ---------------------------------------------------------------------------
// mergeVsCodeSettings — non-destructive, comment-preserving, idempotent
// ---------------------------------------------------------------------------

const ENTRY = "./.vscode/auro.html-custom-data.json";

const settingsCustomData = (raw: string): unknown =>
  (parseJsonc(raw) as Record<string, unknown>)["html.customData"];

test("mergeVsCodeSettings creates the key in an empty object", () => {
  const { contents, changed } = mergeVsCodeSettings("{}", ENTRY);
  assert.equal(changed, true);
  assert.deepEqual(settingsCustomData(contents), [ENTRY]);
});

test("mergeVsCodeSettings treats an empty file as an empty object", () => {
  const { contents, changed } = mergeVsCodeSettings("", ENTRY);
  assert.equal(changed, true);
  assert.deepEqual(settingsCustomData(contents), [ENTRY]);
});

test("mergeVsCodeSettings adds the key while preserving comments + unrelated keys", () => {
  const raw = fixture("settings/unrelated-keys.json");
  const { contents, changed } = mergeVsCodeSettings(raw, ENTRY);
  assert.equal(changed, true);
  assert.match(contents, /\/\/ Team formatting prefs/u, "comment preserved");
  const parsed = parseJsonc(contents) as Record<string, unknown>;
  assert.equal(parsed["editor.tabSize"], 2, "unrelated key preserved");
  assert.equal(parsed["editor.formatOnSave"], true);
  assert.deepEqual(parsed["html.customData"], [ENTRY]);
});

test("mergeVsCodeSettings appends to a pre-existing array without clobbering", () => {
  const raw = fixture("settings/preexisting-custom-data.json");
  const { contents, changed } = mergeVsCodeSettings(raw, ENTRY);
  assert.equal(changed, true);
  assert.deepEqual(settingsCustomData(contents), [
    "./.vscode/team.html-custom-data.json",
    ENTRY,
  ]);
});

test("mergeVsCodeSettings normalizes a bare string value to an array", () => {
  const { contents, changed } = mergeVsCodeSettings(
    '{ "html.customData": "./team.json" }',
    ENTRY,
  );
  assert.equal(changed, true);
  assert.deepEqual(settingsCustomData(contents), ["./team.json", ENTRY]);
});

test("mergeVsCodeSettings is idempotent — a second run is a no-op", () => {
  const once = mergeVsCodeSettings(fixture("settings/empty.json"), ENTRY);
  const twice = mergeVsCodeSettings(once.contents, ENTRY);
  assert.equal(twice.changed, false);
  assert.equal(twice.contents, once.contents);
});

test("mergeVsCodeSettings is a no-op when the entry is already the sole string", () => {
  const source = `{ "html.customData": "${ENTRY}" }`;
  const { contents, changed } = mergeVsCodeSettings(source, ENTRY);
  assert.equal(changed, false);
  assert.equal(contents, source);
});

test("mergeVsCodeSettings refuses to touch an unparseable file", () => {
  const source = "{ this is not json ";
  const { contents, changed, warning } = mergeVsCodeSettings(source, ENTRY);
  assert.equal(changed, false);
  assert.equal(contents, source, "left byte-identical");
  assert.match(warning ?? "", /not valid JSON/u);
});

test("mergeVsCodeSettings warns when html.customData is an unexpected type", () => {
  const { changed, warning } = mergeVsCodeSettings(
    '{ "html.customData": 42 }',
    ENTRY,
  );
  assert.equal(changed, false);
  assert.match(warning ?? "", /not a string or array/u);
});

// ---------------------------------------------------------------------------
// mergeTsconfigInclude — the four-branch decision tree
// ---------------------------------------------------------------------------

const tsconfigInclude = (raw: string): unknown =>
  (parseJsonc(raw) as Record<string, unknown>).include;

test("mergeTsconfigInclude branch 1: appends to an existing include array", () => {
  const { contents, changed } = mergeTsconfigInclude(
    fixture("tsconfig/has-include.json"),
  );
  assert.equal(changed, true);
  assert.deepEqual(tsconfigInclude(contents), ["src", "auro-types"]);
  assert.match(contents, /Branch 1/u, "comment preserved");
});

test("mergeTsconfigInclude branch 2: appends when both files and include are set", () => {
  const { contents, changed } = mergeTsconfigInclude(
    fixture("tsconfig/files-and-include.json"),
  );
  assert.equal(changed, true);
  assert.deepEqual(tsconfigInclude(contents), ["src/**/*.ts", "auro-types"]);
  const parsed = parseJsonc(contents) as { files?: unknown };
  assert.deepEqual(parsed.files, ["src/main.ts"], "files left untouched");
});

test("mergeTsconfigInclude branch 3: adds include when only files is set", () => {
  const { contents, changed } = mergeTsconfigInclude(
    fixture("tsconfig/files-only.json"),
  );
  assert.equal(changed, true);
  assert.deepEqual(tsconfigInclude(contents), ["auro-types"]);
  const parsed = parseJsonc(contents) as { files?: unknown };
  assert.deepEqual(
    parsed.files,
    ["src/main.ts"],
    "files preserved (they combine)",
  );
});

test("mergeTsconfigInclude branch 4: no-op when neither files nor include is set", () => {
  const raw = fixture("tsconfig/neither.json");
  const { contents, changed, warning } = mergeTsconfigInclude(raw);
  assert.equal(
    changed,
    false,
    "default glob already covers the non-dotted dir",
  );
  assert.equal(warning, undefined, "not a warning — a legitimate no-op");
  assert.equal(contents, raw, "left byte-identical");
});

test("mergeTsconfigInclude is idempotent — a second run is a no-op", () => {
  const once = mergeTsconfigInclude(fixture("tsconfig/has-include.json"));
  const twice = mergeTsconfigInclude(once.contents);
  assert.equal(twice.changed, false);
  assert.equal(twice.contents, once.contents);
});

test("mergeTsconfigInclude warns when include is present but not an array", () => {
  const { changed, warning } = mergeTsconfigInclude('{ "include": "src" }');
  assert.equal(changed, false);
  assert.match(warning ?? "", /not an array/u);
});

test("mergeTsconfigInclude refuses to touch an unparseable file", () => {
  const source = "{ broken";
  const { contents, changed, warning } = mergeTsconfigInclude(source);
  assert.equal(changed, false);
  assert.equal(contents, source);
  assert.match(warning ?? "", /not valid JSON/u);
});

// ---------------------------------------------------------------------------
// A component set is not mutated by any builder (pure inputs)
// ---------------------------------------------------------------------------

test("builders do not mutate the caller's component declarations", () => {
  const snapshot: ResolvedComponent = structuredClone(INPUT);
  buildHtmlCustomData([INPUT], RESOLVED_TAGS);
  buildJsxTypes([INPUT], RESOLVED_TAGS);
  buildSvelteTypes([INPUT], RESOLVED_TAGS);
  assert.deepEqual(
    INPUT,
    snapshot,
    "input declaration unchanged (tag not swapped in place)",
  );
});

// ---------------------------------------------------------------------------
// Malformed-CEM hardening — real manifests ship the odd nameless member or a
// truncated type.text (e.g. auro-formkit's auro-menu / auro-dropdown); the
// community tools splice those in verbatim and crash. buildManifest prunes them
// so a single bad entry can't break the whole artifact.
// ---------------------------------------------------------------------------

/** A component carrying both real-world CEM defects at once. */
function componentWithCemDefects(): ResolvedComponent {
  const component = structuredClone(BUTTON);
  const declaration = component.declaration as {
    members?: unknown[];
    events?: unknown[];
  };
  // A `field` member with no `name` — auro-menu ships one; the tools call
  // `member.name.startsWith("#")` and throw.
  declaration.members = [
    { kind: "field", type: { text: "number" }, default: "1" },
  ];
  // An event whose `type.text` is truncated — auro-dropdown ships `Object<key`;
  // emitted verbatim it yields TypeScript no parser accepts.
  declaration.events = [
    { name: "auroButton-idAdded", type: { text: "Object<key" } },
    { name: "click", description: "Fired on activation." },
  ];
  return component;
}

test("builders tolerate a nameless member and a malformed event type", () => {
  const components = [componentWithCemDefects()];
  // None of the three generators throw on the malformed manifest…
  const html = buildHtmlCustomData(components, RESOLVED_TAGS).contents;
  const jsx = buildJsxTypes(components, RESOLVED_TAGS).contents;
  const svelte = buildSvelteTypes(components, RESOLVED_TAGS).contents;

  // …and the truncated type never reaches the emitted output.
  for (const out of [html, jsx, svelte]) {
    assert.match(out, /myapp-button/u, "the component is still emitted");
    assert.doesNotMatch(out, /Object<key/u, "the malformed type is dropped");
  }
  // The well-formed sibling event still lands in the JSX handler map.
  assert.match(jsx, /onauroButton-idAdded/u, "the defective event still binds");
});

// ---------------------------------------------------------------------------
// Private-reflection hardening — the CEM analyzer emits an attribute for a
// reflected property regardless of the property's `privacy`, so an internal
// `@private onHover` still surfaces `data-hover` as a public, description-less
// attribute that would leak into autocomplete. buildManifest drops such
// attributes (private/omitted backing member + no description) while keeping
// documented reflections and public attributes.
// ---------------------------------------------------------------------------

/** A button whose CEM mixes a private-reflection leak with legit attributes. */
function componentWithPrivateReflection(): ResolvedComponent {
  const component = structuredClone(BUTTON);
  const declaration = component.declaration as {
    attributes?: unknown[];
    members?: unknown[];
  };
  declaration.members = [
    // The internal hover flag: reflected to `data-hover`, marked @private.
    { kind: "field", name: "onHover", privacy: "private" },
    // A documented a11y reflection the component exposes on purpose.
    { kind: "field", name: "ariaPressed", privacy: "private" },
  ];
  declaration.attributes = [
    // Public, documented — always kept.
    {
      name: "disabled",
      description: "Disables the button.",
      type: { text: "boolean" },
    },
    // Reflects a @private member, no description → dropped.
    { name: "data-hover", fieldName: "onHover" },
    // Reflects an *omitted* member (no such member documented), no description →
    // dropped (the property was pruned as @private upstream).
    { name: "data-active", fieldName: "onActive" },
    // Reflects a @private member but IS documented → kept (deliberate a11y API).
    {
      name: "aria-pressed",
      fieldName: "ariaPressed",
      description: "Whether the toggle is pressed.",
    },
  ];
  return component;
}

test("builders drop private-reflected description-less attributes but keep documented ones", () => {
  const components = [componentWithPrivateReflection()];
  const html = buildHtmlCustomData(components, RESOLVED_TAGS).contents;
  const jsx = buildJsxTypes(components, RESOLVED_TAGS).contents;
  const svelte = buildSvelteTypes(components, RESOLVED_TAGS).contents;

  for (const out of [html, jsx, svelte]) {
    assert.match(out, /myapp-button/u, "the component is still emitted");
    assert.doesNotMatch(
      out,
      /data-hover/u,
      "the private reflection is dropped",
    );
    assert.doesNotMatch(
      out,
      /data-active/u,
      "the omitted-member reflection is dropped",
    );
    assert.match(out, /disabled/u, "the documented public attribute is kept");
    assert.match(
      out,
      /aria-pressed/u,
      "the documented private reflection is deliberately kept",
    );
  }
});

test("the delimiter-balance guard keeps well-formed types and drops only broken ones", () => {
  const component = structuredClone(BUTTON);
  (component.declaration as { events?: unknown[] }).events = [
    // A balanced arrow type: the `=>` must be read as text, not an unbalanced
    // generic close, so the whole signature survives verbatim.
    { name: "pickArrow", type: { text: "(e: CustomEvent) => void" } },
    // A balanced *nested* generic — legitimate and must be preserved.
    { name: "pickGeneric", type: { text: "Map<string, number>" } },
    // A *mismatched* pair (`<` closed by `]`) — distinct from a truncation; it
    // must be caught and dropped so no unparseable type reaches the output.
    { name: "pickMismatch", type: { text: "Array<string]" } },
  ];
  const jsx = buildJsxTypes([component], RESOLVED_TAGS).contents;

  // Balanced types flow through untouched…
  assert.match(jsx, /CustomEvent/u, "the arrow type is preserved (=> is text)");
  assert.match(jsx, /Map<string, number>/u, "the nested generic is preserved");
  // …while the mismatched one is dropped (the generator falls back to Event).
  assert.doesNotMatch(
    jsx,
    /Array<string/u,
    "a mismatched bracket pair is dropped, not emitted",
  );
});
