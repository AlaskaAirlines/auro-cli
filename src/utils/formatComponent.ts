/**
 * Pure formatting/naming helpers for the `auro component` command. Kept separate
 * from the command wiring so they can be unit-tested without importing commander,
 * ora, or triggering the command's side effects.
 */

import { type CemDeclaration, clean, type Deprecated } from "#utils/cem.js";

const SCOPE = "@aurodesignsystem";

/**
 * Normalize a user-supplied component name into a full npm package name.
 * Accepts "button", "auro-button", or "@aurodesignsystem/auro-button" (and
 * tolerates surrounding whitespace / casing). An explicit scope is respected.
 */
export function toPackageName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("@")) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("auro-")) {
    return `${SCOPE}/${lower}`;
  }
  return `${SCOPE}/auro-${lower}`;
}

/**
 * Convert a kebab-case attribute name to its camelCase property form
 * (`no-validate` → `noValidate`), matching how Lit maps attributes to fields.
 */
export function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

/**
 * Render a `[deprecated]` (optionally with a reason) marker.
 */
export function deprecatedTag(deprecated: Deprecated): string {
  if (!deprecated) {
    return "";
  }
  return typeof deprecated === "string"
    ? ` [deprecated: ${clean(deprecated)}]`
    : " [deprecated]";
}

/**
 * Render a two-column list (name → description) with aligned padding.
 */
export function renderList(rows: Array<[string, string]>): string {
  if (rows.length === 0) {
    return "  (none)";
  }
  // Coerce label/description defensively: published manifests occasionally ship
  // an entry missing its `name` (the types promise a string but the data can
  // violate it), and one bad row must not crash the whole lookup.
  const width = Math.max(...rows.map(([label]) => (label ?? "").length));
  return rows
    .map(([label, desc]) =>
      `  ${(label ?? "").padEnd(width)}  ${desc ?? ""}`.trimEnd(),
    )
    .join("\n");
}

/** Overrides for the `Install:` lines when the import differs from the header package. */
export interface FormatDeclarationOptions {
  /** Package to `npm i` (defaults to the header `pkg`). */
  installPkg?: string;
  /** Module specifier to `import` (defaults to the header `pkg`). */
  importSpecifier?: string;
}

/**
 * Format one custom-element declaration into a readable summary. `pkg` heads the
 * declaration and drives the `Install:` lines by default; when the element is
 * fetched from a monorepo that re-exports it under a subpath (e.g. a legacy form
 * component now served by `@aurodesignsystem/auro-formkit`), pass `installPkg` /
 * `importSpecifier` so the install snippet points at the package to install and the
 * exact subpath to import.
 */
export function formatDeclaration(
  pkg: string,
  decl: CemDeclaration,
  options: FormatDeclarationOptions = {},
): string {
  const { installPkg = pkg, importSpecifier = pkg } = options;
  const lines: string[] = [];

  lines.push(`${decl.tagName}  (${pkg})`);
  const description = decl.summary || decl.description;
  if (description) {
    lines.push(clean(description));
  }
  const heritage = decl.superclass?.name
    ? `${decl.name} extends ${decl.superclass.name}`
    : decl.name;
  lines.push(`Class: ${heritage}`);

  lines.push("");
  lines.push("Install:");
  lines.push(`  npm i ${installPkg}`);
  lines.push(`  import "${importSpecifier}";`);

  lines.push(...apiBodyLines(decl));

  return lines.join("\n");
}

/**
 * Render the API sections of a declaration — Attributes, Properties & Methods,
 * Slots, Events, and (when present) CSS Parts / CSS Custom Properties — as a list
 * of lines, led by a blank separator. Shared by {@link formatDeclaration} (the
 * `component` command's full render) and `auro init`'s per-component grounding
 * sections, which wrap this same body under their own resolved-tag header and
 * prefix/subpath-aware install lines. Returns lines (not a joined string) so a
 * caller can splice them into a larger `lines` array.
 */
export function apiBodyLines(decl: CemDeclaration): string[] {
  const lines: string[] = [];

  const attributes = decl.attributes ?? [];
  lines.push("");
  lines.push(`Attributes (${attributes.length}):`);
  lines.push(
    renderList(
      attributes.map((a) => {
        const type = a.type?.text ? ` {${clean(a.type.text)}}` : "";
        const def = a.default ? ` = ${clean(a.default)}` : "";
        return [
          a.name,
          `${clean(a.description)}${type}${def}${deprecatedTag(a.deprecated)}`.trim(),
        ];
      }),
    ),
  );

  // Public properties/methods not already covered by an attribute. An
  // attribute's backing field is named by `fieldName`; when a manifest omits it
  // we fall back to the attribute `name` and its camelCase form (attribute
  // names are kebab-case, fields camelCase) so the field isn't listed a second
  // time under Properties & Methods.
  const attrFields = new Set(
    attributes.flatMap((a) =>
      a.fieldName ? [a.fieldName] : [a.name, kebabToCamel(a.name)],
    ),
  );
  const members = (decl.members ?? []).filter(
    (m) =>
      // A member with no name is malformed CEM data — it can't be referenced,
      // so drop it rather than list an unnamed row.
      m.name &&
      (m.privacy === undefined || m.privacy === "public") &&
      !m.static &&
      !(m.kind === "field" && attrFields.has(m.name)),
  );
  lines.push("");
  lines.push(`Properties & Methods (${members.length}):`);
  lines.push(
    renderList(
      members.map((m) => {
        const isMethod = m.kind === "method";
        const label = isMethod ? `${m.name}()` : m.name;
        const typeText = isMethod ? m.return?.type?.text : m.type?.text;
        const type = typeText ? ` {${clean(typeText)}}` : "";
        const def = !isMethod && m.default ? ` = ${clean(m.default)}` : "";
        return [
          label,
          `${clean(m.description)}${type}${def}${deprecatedTag(m.deprecated)}`.trim(),
        ];
      }),
    ),
  );

  const slots = decl.slots ?? [];
  lines.push("");
  lines.push(`Slots (${slots.length}):`);
  lines.push(
    renderList(slots.map((s) => [s.name || "(default)", clean(s.description)])),
  );

  const events = decl.events ?? [];
  lines.push("");
  lines.push(`Events (${events.length}):`);
  lines.push(
    renderList(
      events.map((e) => {
        const type = e.type?.text ? ` {${clean(e.type.text)}}` : "";
        return [e.name, `${clean(e.description)}${type}`.trim()];
      }),
    ),
  );

  const cssParts = decl.cssParts ?? [];
  if (cssParts.length > 0) {
    lines.push("");
    lines.push(`CSS Parts (${cssParts.length}):`);
    lines.push(renderList(cssParts.map((p) => [p.name, clean(p.description)])));
  }

  const cssProps = decl.cssProperties ?? [];
  if (cssProps.length > 0) {
    lines.push("");
    lines.push(`CSS Custom Properties (${cssProps.length}):`);
    lines.push(renderList(cssProps.map((p) => [p.name, clean(p.description)])));
  }

  return lines;
}
