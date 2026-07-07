import process from "node:process";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { program } from "commander";
import ora from "ora";

const UNPKG_BASE = "https://unpkg.com";
const SCOPE = "@aurodesignsystem";

interface CemType {
  text?: string;
}

interface CemAttribute {
  name: string;
  type?: CemType;
  default?: string;
  description?: string;
}

interface CemSlot {
  name: string;
  description?: string;
}

interface CemEvent {
  name: string;
  type?: CemType;
  description?: string;
}

interface CemNamed {
  name: string;
  description?: string;
}

interface CemDeclaration {
  kind: string;
  name: string;
  tagName?: string;
  customElement?: boolean;
  description?: string;
  summary?: string;
  attributes?: CemAttribute[];
  slots?: CemSlot[];
  events?: CemEvent[];
  cssParts?: CemNamed[];
  cssProperties?: CemNamed[];
}

interface CemModule {
  declarations?: CemDeclaration[];
}

interface Manifest {
  modules?: CemModule[];
}

/**
 * Normalize a user-supplied component name into a full npm package name.
 * Accepts "button", "auro-button", or "@aurodesignsystem/auro-button".
 */
function toPackageName(name: string): string {
  if (name.startsWith(`${SCOPE}/`)) {
    return name;
  }
  if (name.startsWith("auro-")) {
    return `${SCOPE}/${name}`;
  }
  return `${SCOPE}/auro-${name}`;
}

/**
 * Collapse whitespace (including embedded newlines from JSDoc) to keep each
 * entry on a single line so the aligned columns don't break.
 */
function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/gu, " ").trim();
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
  const tag = decl.tagName ?? decl.name;

  lines.push(`${tag}  (${pkg})`);
  const description = decl.summary || decl.description;
  if (description) {
    lines.push(description.trim());
  }

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
        return [a.name, `${clean(a.description)}${type}${def}`.trim()];
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
    "Look up an Auro component's API (attributes, slots, events, CSS parts) from its published Custom Elements Manifest",
  )
  .option("--json", "Output the raw manifest declaration(s) as JSON", false)
  .action(async (name, options) => {
    const pkg = toPackageName(name);
    const spinner = ora(`Fetching ${pkg}...`).start();

    let manifest: Manifest;
    try {
      const response = await fetch(`${UNPKG_BASE}/${pkg}/custom-elements.json`);
      if (response.status === 404) {
        spinner.fail(
          `No custom-elements.json published for ${pkg}. It may not exist or may not publish a manifest yet.`,
        );
        process.exit(1);
      }
      if (!response.ok) {
        spinner.fail(`Failed to fetch ${pkg} (HTTP ${response.status}).`);
        process.exit(1);
      }
      manifest = (await response.json()) as Manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(`Request failed for ${pkg}: ${message}`);
      process.exit(1);
      return;
    }

    const declarations = (manifest.modules ?? [])
      .flatMap((module) => module.declarations ?? [])
      .filter((decl) => decl.customElement);

    if (declarations.length === 0) {
      spinner.fail(`No custom elements found in the manifest for ${pkg}.`);
      process.exit(1);
    }

    spinner.succeed(
      `${pkg} — ${declarations.length} custom element${declarations.length === 1 ? "" : "s"}`,
    );

    if (options.json) {
      process.stdout.write(`${JSON.stringify(declarations, null, 2)}\n`);
      return;
    }

    process.stdout.write(
      `\n${declarations.map((decl) => formatDeclaration(pkg, decl)).join("\n\n---\n\n")}\n`,
    );
    Logger.info(`\nFull docs: https://auro.alaskaair.com`);
  });
