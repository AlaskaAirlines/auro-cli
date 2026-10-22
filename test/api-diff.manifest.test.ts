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

test("a default value changed, added or removed is major", () => {
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
    ["major", 'Added default `"md"` to property `size` on `<auro-button>`'],
  ]);
  assert.deepEqual(diff(md, none), [
    ["major", 'Removed default `"md"` from property `size` on `<auro-button>`'],
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
