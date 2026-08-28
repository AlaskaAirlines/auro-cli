import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";
import { buildHtmlCustomData } from "../src/init/editors/htmlCustomData.ts";
import { buildJsxTypes } from "../src/init/editors/jsxTypes.ts";
import {
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
