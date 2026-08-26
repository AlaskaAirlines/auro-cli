import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";
import {
  type CemDeclaration,
  clean,
  type Deprecated,
  type Manifest,
} from "#utils/cem.js";
import { fetchManifest } from "#utils/fetchManifest.js";

const SCOPE = "@aurodesignsystem";

/**
 * Normalize a user-supplied component name into a full npm package name.
 * Accepts "button", "auro-button", or "@aurodesignsystem/auro-button" (and
 * tolerates surrounding whitespace / casing). An explicit scope is respected.
 */
function toPackageName(name: string): string {
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
function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

/**
 * Render a `[deprecated]` (optionally with a reason) marker.
 */
function deprecatedTag(deprecated: Deprecated): string {
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
function renderList(rows: Array<[string, string]>): string {
  if (rows.length === 0) {
    return "  (none)";
  }
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, desc]) => `  ${label.padEnd(width)}  ${desc}`.trimEnd())
    .join("\n");
}

/**
 * Format one custom-element declaration into a readable summary.
 */
function formatDeclaration(pkg: string, decl: CemDeclaration): string {
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
  lines.push(`  npm i ${pkg}`);
  lines.push(`  import "${pkg}";`);

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

  return lines.join("\n");
}

export default program
  .command("component <name>")
  .description(
    "Look up an Auro component's API (attributes, properties, slots, events, CSS parts) from its published Custom Elements Manifest",
  )
  .option(
    "-t, --tag <version>",
    "npm dist-tag or version to look up (default: latest)",
  )
  .option("--json", "Output the raw manifest declaration(s) as JSON", false)
  .action(async (name, options) => {
    const pkg = toPackageName(name);
    const target = options.tag ? `${pkg}@${options.tag}` : pkg;
    const spinner = ora(`Fetching ${target}...`).start();

    const result = await fetchManifest(target);
    if (!result.manifest) {
      spinner.fail(
        result.transient
          ? `Failed to fetch ${target}: ${result.reason}.`
          : `No custom-elements.json published for ${target}. It may not exist or may not publish a manifest yet.`,
      );
      process.exit(1);
    }
    const manifest = result.manifest as Manifest;

    // Only real registered elements — a declaration can be customElement: true
    // yet be an internal base class with no tagName.
    const declarations = (manifest.modules ?? [])
      .flatMap((module) => module.declarations ?? [])
      .filter((decl) => decl.customElement && decl.tagName);

    if (declarations.length === 0) {
      spinner.fail(`No registered custom elements found for ${target}.`);
      process.exit(1);
    }

    spinner.succeed(
      `${target} — ${declarations.length} custom element${declarations.length === 1 ? "" : "s"}`,
    );

    if (options.json) {
      process.stdout.write(`${JSON.stringify(declarations, null, 2)}\n`);
      return;
    }

    process.stdout.write(
      `\n${declarations.map((decl) => formatDeclaration(pkg, decl)).join("\n\n---\n\n")}\n`,
    );
    Logger.info("\nFull docs: https://auro.alaskaair.com");
  });
