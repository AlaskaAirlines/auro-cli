/**
 * `auro api-diff` CEM classification — one test per row of the TRD's
 * `custom-elements.json` table, plus the privacy filtering and default-value
 * normalization the table depends on. Runs against the vendored auro-button
 * manifest as well as synthetic ones.
 *
 * @see ../src/scripts/api-diff/manifest-diff.ts
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  diffManifests,
  normalizeDefault,
  normalizeValue,
  splitUnion,
} from "../src/scripts/api-diff/manifest-diff.ts";
import type { Manifest } from "../src/utils/cem.ts";
import { elementManifest } from "./support.ts";

/** A single-element manifest with the given API surface. */
function manifest(extra: Record<string, unknown> = {}, tag = "auro-button") {
  return elementManifest(tag, extra) as Manifest;
}

/** The `[bump, message]` pairs of a diff, for compact assertions. */
function diff(base: Manifest, head: Manifest): Array<[string, string]> {
  return diffManifests(base, head).map((c) => [c.bump, c.message]);
}

const field = (name: string, extra: Record<string, unknown> = {}) => ({
  kind: "field",
  name,
  ...extra,
});

test("identical manifests have no changes", () => {
  const m = manifest({ attributes: [{ name: "ondark" }] });
  assert.deepEqual(diff(m, m), []);
});

test("the real auro-button manifest compared with itself has no changes", async () => {
  const raw = await readFile(
    new URL(
      "./fixtures/packages/auro-button/custom-elements.json",
      import.meta.url,
    ),
    "utf-8",
  );
  assert.deepEqual(diff(JSON.parse(raw), JSON.parse(raw)), []);
});

test("removing an attribute from the real auro-button manifest is major", async () => {
  const raw = await readFile(
    new URL(
      "./fixtures/packages/auro-button/custom-elements.json",
      import.meta.url,
    ),
    "utf-8",
  );
  const head = JSON.parse(raw) as Manifest;
  const button = head
    .modules!.flatMap((m) => m.declarations ?? [])
    .find((d) => d.tagName === "auro-button")!;
  button.attributes = button.attributes!.filter((a) => a.name !== "fluid");
  assert.deepEqual(diff(JSON.parse(raw), head), [
    ["major", "Removed attribute `fluid` from `<auro-button>`"],
  ]);
});

test("element removed is major; element added is minor", () => {
  const a = manifest({}, "auro-a");
  const b = manifest({}, "auro-b");
  assert.deepEqual(diff(a, { modules: [] }), [
    ["major", "Removed element `<auro-a>`"],
  ]);
  assert.deepEqual(diff({ modules: [] }, b), [
    ["minor", "Added element `<auro-b>`"],
  ]);
});

test("a tag name change on the same class is reported once, as a major rename", () => {
  const base = manifest({ name: "AuroThing" }, "auro-thing");
  const head = manifest({ name: "AuroThing" }, "auro-widget");
  assert.deepEqual(diff(base, head), [
    ["major", "Renamed element `<auro-thing>` to `<auro-widget>`"],
  ]);
});

test("declarations without a tag name (base classes) are ignored", () => {
  const base: Manifest = {
    modules: [
      { declarations: [{ name: "AuroElement", members: [field("x")] }] },
    ],
  };
  assert.deepEqual(diff(base, { modules: [] }), []);
});

test("removing or renaming any public API surface is major", () => {
  const base = manifest({
    attributes: [{ name: "ondark" }],
    members: [
      field("onDark"),
      { kind: "method", name: "focus" },
      field("register", { static: true }),
    ],
    events: [{ name: "auroButton-click" }],
    slots: [{ name: "" }, { name: "icon" }],
    cssParts: [{ name: "button" }],
    cssProperties: [{ name: "--ds-button-color" }],
  });
  assert.deepEqual(diff(base, manifest()), [
    ["major", "Removed attribute `ondark` from `<auro-button>`"],
    ["major", "Removed property `onDark` from `<auro-button>`"],
    ["major", "Removed method `focus` from `<auro-button>`"],
    ["major", "Removed static property `register` from `<auro-button>`"],
    ["major", "Removed event `auroButton-click` from `<auro-button>`"],
    ["major", "Removed default slot from `<auro-button>`"],
    ["major", "Removed slot `icon` from `<auro-button>`"],
    ["major", "Removed CSS part `button` from `<auro-button>`"],
    [
      "major",
      "Removed CSS custom property `--ds-button-color` from `<auro-button>`",
    ],
  ]);
});

test("adding any public API surface is minor", () => {
  const head = manifest({
    attributes: [{ name: "ondark" }],
    members: [field("onDark"), { kind: "method", name: "focus" }],
    events: [{ name: "auroButton-click" }],
    slots: [{ name: "icon" }],
    cssParts: [{ name: "button" }],
    cssProperties: [{ name: "--ds-button-color" }],
  });
  assert.deepEqual(
    diff(manifest(), head).map(([bump]) => bump),
    Array(7).fill("minor"),
  );
});

test("privacy is read from the privacy field, not the name", () => {
  // `layout` is private despite having no underscore; `_internal` is public.
  const base = manifest({
    members: [field("layout", { privacy: "private" }), field("_internal")],
  });
  const head = manifest({ members: [field("_internal")] });
  assert.deepEqual(diff(base, head), []);
});

test("a public member made private is major; a private member made public is minor", () => {
  const pub = manifest({ members: [field("size", { privacy: "public" })] });
  const priv = manifest({ members: [field("size", { privacy: "private" })] });
  const prot = manifest({ members: [field("size", { privacy: "protected" })] });
  assert.deepEqual(diff(pub, priv), [
    ["major", "Made property `size` on `<auro-button>` private"],
  ]);
  assert.deepEqual(diff(pub, prot), [
    ["major", "Made property `size` on `<auro-button>` protected"],
  ]);
  assert.deepEqual(diff(priv, pub), [
    ["minor", "Made private property `size` on `<auro-button>` public"],
  ]);
});

test("an attribute backed by a private field isn't public API", () => {
  const base = manifest({
    attributes: [{ name: "buttonhref", fieldName: "buttonHref" }],
    members: [field("buttonHref", { privacy: "private" })],
  });
  const head = manifest({
    members: [field("buttonHref", { privacy: "private" })],
  });
  assert.deepEqual(diff(base, head), []);
});

test("an attribute whose backing field becomes private is major", () => {
  const attr = { name: "size", fieldName: "size" };
  const base = manifest({ attributes: [attr], members: [field("size")] });
  const head = manifest({
    attributes: [attr],
    members: [field("size", { privacy: "private" })],
  });
  assert.deepEqual(diff(base, head), [
    ["major", "Made attribute `size` on `<auro-button>` private"],
    ["major", "Made property `size` on `<auro-button>` private"],
  ]);
});

test("internal attributes aren't public API", () => {
  const base = manifest({ attributes: [{ name: "x", internal: true }] });
  assert.deepEqual(diff(base, manifest()), []);
});

test("narrowing a union type is major; widening it is minor", () => {
  const two = manifest({
    members: [field("variant", { type: { text: "'primary' | 'secondary'" } })],
  });
  const three = manifest({
    members: [
      field("variant", {
        type: { text: "'primary' | 'secondary' | 'tertiary'" },
      }),
    ],
  });
  assert.deepEqual(diff(three, two), [
    [
      "major",
      'Narrowed type of property `variant` on `<auro-button>` (removed `"tertiary"`)',
    ],
  ]);
  assert.deepEqual(diff(two, three), [
    [
      "minor",
      'Widened type of property `variant` on `<auro-button>` (added `"tertiary"`)',
    ],
  ]);
});

test("replacing a type is major; quoting and whitespace changes aren't changes", () => {
  const str = manifest({
    members: [field("tIndex", { type: { text: "string" } })],
  });
  const num = manifest({
    members: [field("tIndex", { type: { text: "number" } })],
  });
  assert.deepEqual(diff(str, num), [
    [
      "major",
      "Changed type of property `tIndex` on `<auro-button>` from `string` to `number`",
    ],
  ]);
  const single = manifest({
    members: [field("v", { type: { text: "'a'|'b'" } })],
  });
  const double = manifest({
    members: [field("v", { type: { text: '"a" | "b"' } })],
  });
  assert.deepEqual(diff(single, double), []);
});

test("missing type information on one side isn't a change", () => {
  const typed = manifest({
    members: [field("v", { type: { text: "string" } })],
  });
  const untyped = manifest({ members: [field("v")] });
  assert.deepEqual(diff(typed, untyped), []);
});

test("an attribute that stops reflecting is major; starting to reflect isn't a change", () => {
  const reflects = manifest({
    members: [field("fluid", { reflects: true, attribute: "fluid" })],
  });
  const plain = manifest({ members: [field("fluid", { attribute: "fluid" })] });
  assert.deepEqual(diff(reflects, plain), [
    ["major", "Attribute `fluid` on `<auro-button>` no longer reflects"],
  ]);
  assert.deepEqual(diff(plain, reflects), []);
});

test("a changed default value is major; documenting a default or removing its documentation is minor", () => {
  const none = manifest({ members: [field("size")] });
  const md = manifest({ members: [field("size", { default: '"md"' })] });
  const lg = manifest({ members: [field("size", { default: '"lg"' })] });
  assert.deepEqual(diff(md, lg), [
    [
      "major",
      'Changed default of property `size` on `<auro-button>` from `"md"` to `"lg"`',
    ],
  ]);
  assert.deepEqual(diff(none, md), [
    ["minor", 'Added default `"md"` to property `size` on `<auro-button>`'],
  ]);
  assert.deepEqual(diff(md, none), [
    ["minor", 'Removed default `"md"` from property `size` on `<auro-button>`'],
  ]);
});

test("a quoting-only default difference isn't a change", () => {
  const single = manifest({ members: [field("size", { default: "'md'" })] });
  const double = manifest({ members: [field("size", { default: '"md"' })] });
  assert.deepEqual(diff(single, double), []);
});

test("attribute defaults are compared only when no public property backs the attribute", () => {
  const backed = (value: string) =>
    manifest({
      attributes: [{ name: "size", fieldName: "size", default: value }],
      members: [field("size", { default: value })],
    });
  // Reported once, on the property.
  assert.deepEqual(diff(backed('"md"'), backed('"lg"')), [
    [
      "major",
      'Changed default of property `size` on `<auro-button>` from `"md"` to `"lg"`',
    ],
  ]);
  const bare = (value: string) =>
    manifest({ attributes: [{ name: "size", default: value }] });
  assert.deepEqual(diff(bare('"md"'), bare('"lg"')), [
    [
      "major",
      'Changed default of attribute `size` on `<auro-button>` from `"md"` to `"lg"`',
    ],
  ]);
});

test("normalizeValue unifies quote style and whitespace", () => {
  assert.equal(normalizeValue("  'a'\n  "), '"a"');
  assert.equal(normalizeValue("{'default'}"), '{"default"}');
});

test("splitUnion splits only on top-level bars", () => {
  assert.deepEqual(splitUnion("'a' | Array<'b' | 'c'> | (d | e)"), [
    '"a"',
    'Array<"b" | "c">',
    "(d | e)",
  ]);
  assert.deepEqual(splitUnion("'x|y' | z"), ['"x|y"', "z"]);
  assert.deepEqual(splitUnion("((e: Event) => void) | null"), [
    "((e: Event) => void)",
    "null",
  ]);
});

test("widening a union that contains a function type is minor", () => {
  const nullable = manifest({
    members: [
      field("onChange", { type: { text: "((e: Event) => void) | null" } }),
    ],
  });
  const optional = manifest({
    members: [
      field("onChange", {
        type: { text: "((e: Event) => void) | null | undefined" },
      }),
    ],
  });
  assert.deepEqual(diff(nullable, optional), [
    [
      "minor",
      "Widened type of property `onChange` on `<auro-button>` (added `undefined`)",
    ],
  ]);
});

test("attribute names are compared case-insensitively, as HTML does", () => {
  const camel = manifest({ attributes: [{ name: "tIndex" }] });
  const lower = manifest({ attributes: [{ name: "tindex" }] });
  assert.deepEqual(diff(camel, lower), []);
  assert.deepEqual(diff(camel, manifest()), [
    ["major", "Removed attribute `tIndex` from `<auro-button>`"],
  ]);
});

test("nameless entries are ignored, but the default slot isn't", () => {
  const base = manifest({ slots: [{ name: "" }] });
  const head = manifest({
    attributes: [{}],
    members: [{ kind: "field" }],
    events: [{ description: "no name" }],
    slots: [{ name: "" }],
  });
  assert.deepEqual(diff(base, head), []);
});

test("a comma-separated literal list is the same type as a union", () => {
  const comma = manifest({
    members: [field("size", { type: { text: "'sm', 'md'" } })],
  });
  const union = manifest({
    members: [field("size", { type: { text: '"sm" | "md"' } })],
  });
  assert.deepEqual(diff(comma, union), []);
});

test("a braced lone literal default is the same default", () => {
  const braced = manifest({
    members: [field("layout", { default: "{'default'}" })],
  });
  const plain = manifest({
    members: [field("layout", { default: '"default"' })],
  });
  assert.deepEqual(diff(braced, plain), []);
  assert.equal(normalizeDefault("{null}"), "null");
  assert.equal(normalizeDefault("{ a: 1 }"), "{ a: 1 }");
});

/** Diff one property whose metadata goes from `from` to `to`. */
function metadataDiff(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
): Array<[string, string]> {
  return diff(
    manifest({ members: [field("size", from)] }),
    manifest({ members: [field("size", to)] }),
  );
}
const SIZE = "property `size` on `<auro-button>`";

test("a new or broader requiredWhen is major; dropping or narrowing one is minor", () => {
  assert.deepEqual(metadataDiff({}, { requiredWhen: "isDropdown" }), [
    ["major", `Made ${SIZE} required when \`isDropdown\``],
  ]);
  assert.deepEqual(
    metadataDiff({ requiredWhen: "isDropdown" }, { requiredWhen: "always" }),
    [
      [
        "major",
        `Changed when ${SIZE} is required from \`isDropdown\` to \`always\``,
      ],
    ],
  );
  assert.deepEqual(
    metadataDiff({ requiredWhen: "isDropdown" }, { requiredWhen: "isModal" }),
    [
      [
        "major",
        `Changed when ${SIZE} is required from \`isDropdown\` to \`isModal\``,
      ],
    ],
  );
  assert.deepEqual(
    metadataDiff({ requiredWhen: "always" }, { requiredWhen: "isDropdown" }),
    [["minor", `Made ${SIZE} required only when \`isDropdown\``]],
  );
  assert.deepEqual(metadataDiff({ requiredWhen: "always" }, {}), [
    ["minor", `Made ${SIZE} no longer required`],
  ]);
});

test("tightening a bound is major; loosening or removing one is minor", () => {
  assert.deepEqual(metadataDiff({}, { minimum: 0 }), [
    ["major", `Added minimum \`0\` to ${SIZE}`],
  ]);
  assert.deepEqual(metadataDiff({ minimum: 0 }, { minimum: 1 }), [
    ["major", `Tightened minimum of ${SIZE} from \`0\` to \`1\``],
  ]);
  assert.deepEqual(metadataDiff({ maximum: 10 }, { maximum: 5 }), [
    ["major", `Tightened maximum of ${SIZE} from \`10\` to \`5\``],
  ]);
  assert.deepEqual(metadataDiff({ minimum: 1 }, { minimum: 0 }), [
    ["minor", `Loosened minimum of ${SIZE} from \`1\` to \`0\``],
  ]);
  assert.deepEqual(metadataDiff({ maximum: 5 }, {}), [
    ["minor", `Removed maximum \`5\` from ${SIZE}`],
  ]);
});

test("becoming read-only is major; becoming writable is minor", () => {
  assert.deepEqual(metadataDiff({}, { readonly: true }), [
    ["major", `Made ${SIZE} read-only`],
  ]);
  assert.deepEqual(metadataDiff({ readonly: true }, {}), [
    ["minor", `Made ${SIZE} writable`],
  ]);
});

test("deprecating, relevantWhen and category changes are minor guidance", () => {
  assert.deepEqual(metadataDiff({}, { deprecated: "Use variant" }), [
    ["minor", `Deprecated ${SIZE}`],
  ]);
  assert.deepEqual(
    metadataDiff({ deprecated: "Use variant" }, { deprecated: "Use shape" }),
    [],
  );
  assert.deepEqual(metadataDiff({}, { relevantWhen: "isDropdown" }), [
    ["minor", `Added \`relevantWhen\` \`isDropdown\` to ${SIZE}`],
  ]);
  assert.deepEqual(metadataDiff({ category: "layout" }, { category: "a11y" }), [
    ["minor", `Changed \`category\` of ${SIZE} from \`layout\` to \`a11y\``],
  ]);
  assert.deepEqual(metadataDiff({ relevantWhen: "isDropdown" }, {}), [
    ["minor", `Removed \`relevantWhen\` \`isDropdown\` from ${SIZE}`],
  ]);
});

test("slot and unbacked attribute metadata is compared; backed attributes report once", () => {
  assert.deepEqual(
    diff(
      manifest({ slots: [{ name: "label" }] }),
      manifest({ slots: [{ name: "label", requiredWhen: "always" }] }),
    ),
    [["major", "Made slot `label` on `<auro-button>` required when `always`"]],
  );
  assert.deepEqual(
    diff(
      manifest({ attributes: [{ name: "tindex" }] }),
      manifest({ attributes: [{ name: "tindex", minimum: -1 }] }),
    ),
    [["major", "Added minimum `-1` to attribute `tindex` on `<auro-button>`"]],
  );
  const backed = (extra: Record<string, unknown>) =>
    manifest({
      attributes: [{ name: "size", fieldName: "size", ...extra }],
      members: [field("size", extra)],
    });
  assert.deepEqual(diff(backed({}), backed({ readonly: true })), [
    ["major", `Made ${SIZE} read-only`],
  ]);
});

test("method parameters: removing or requiring one is major; adding an optional one is minor", () => {
  const method = (...parameters: Record<string, unknown>[]) =>
    manifest({ members: [{ kind: "method", name: "focus", parameters }] });
  const FOCUS = "method `focus` on `<auro-button>`";
  assert.deepEqual(diff(method({ name: "options" }), method()), [
    ["major", `Removed parameter \`options\` from ${FOCUS}`],
  ]);
  assert.deepEqual(
    diff(method(), method({ name: "options", optional: true })),
    [["minor", `Added optional parameter \`options\` to ${FOCUS}`]],
  );
  assert.deepEqual(diff(method(), method({ name: "options" })), [
    ["major", `Added required parameter \`options\` to ${FOCUS}`],
  ]);
  assert.deepEqual(
    diff(method({ name: "a", optional: true }), method({ name: "a" })),
    [["major", `Made parameter \`a\` of ${FOCUS} required`]],
  );
  // Renaming a parameter doesn't change how it's called.
  assert.deepEqual(diff(method({ name: "a" }), method({ name: "b" })), []);
});

test("literal unions and their primitive: narrowing to literals is major, widening to the primitive is minor", () => {
  const typed = (text: string) =>
    manifest({ members: [field("size", { type: { text } })] });
  assert.deepEqual(diff(typed("string"), typed("'sm' | 'md'")), [
    ["major", `Narrowed type of ${SIZE} (removed \`string\`)`],
  ]);
  assert.deepEqual(diff(typed("'sm' | 'md'"), typed("string")), [
    ["minor", `Widened type of ${SIZE} (added \`string\`)`],
  ]);
  assert.deepEqual(diff(typed("1 | 2"), typed("number")), [
    ["minor", `Widened type of ${SIZE} (added \`number\`)`],
  ]);
  assert.deepEqual(diff(typed("'sm' | 'md'"), typed("number")), [
    ["major", `Changed type of ${SIZE} from \`"sm" | "md"\` to \`number\``],
  ]);
});

test("a wrapper type name is the primitive, and an `undefined` default is no default", () => {
  const typed = (text: string) =>
    manifest({ members: [field("role", { type: { text } })] });
  assert.deepEqual(diff(typed("String"), typed("string")), []);
  assert.deepEqual(
    diff(typed("Boolean | undefined"), typed("boolean | undefined")),
    [],
  );
  assert.deepEqual(metadataDiff({ default: "undefined" }, {}), []);
  assert.deepEqual(metadataDiff({}, { default: "undefined" }), []);
});

/**
 * Regression cases from the Phase 0 replay of past releases: the manifests each
 * release published to npm, stored minified in fixtures/api-diff/ (`.min.json`,
 * so Biome leaves them as they are).
 */
async function published(name: string): Promise<Manifest> {
  const raw = await readFile(
    new URL(`./fixtures/api-diff/${name}.min.json`, import.meta.url),
    "utf-8",
  );
  return JSON.parse(raw);
}

test("auro-button 12.4.0 → 12.4.1: only formatting and attribute case changed, so no API change", async () => {
  // Once flagged major: `tIndex` → `tindex` and `loadingText` → `loadingtext`
  // read as removed and added attributes.
  assert.deepEqual(
    diffManifests(
      await published("auro-button-12.4.0"),
      await published("auro-button-12.4.1"),
    ),
    [],
  );
});

test("auro-nav 4.1.0 → 4.1.1: hiding inherited hyperlink properties is major", async () => {
  // Released as a `perf:` patch; the JSDoc marked inherited properties private.
  const changes = diffManifests(
    await published("auro-nav-4.1.0"),
    await published("auro-nav-4.1.1"),
  );
  const majors = changes.filter((c) => c.bump === "major");
  assert.equal(majors.length, 52);
  assert.ok(
    majors.some(
      (c) =>
        c.message === "Removed attribute `download` from `<auro-anchorlink>`",
    ),
  );
  assert.ok(
    majors.some((c) =>
      /^Made property `\w+` on `<auro-anchorlink>` private$/u.test(c.message),
    ),
  );
});
