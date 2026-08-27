/**
 * Render the grounding files `auro init` writes — the canonical `AGENTS.md` and
 * the thin `CLAUDE.md` — from a resolved component set plus the resolved custom
 * tags. Pure, side-effect-free string builders: detection, resolution, and tag
 * resolution happen upstream (`resolver.ts` / `registry.ts`); this module only
 * assembles the frozen scaffolding (`layout.ts` / `rules.ts`) around each
 * component's resolved tag, prefix/subpath-aware install lines, and API body.
 *
 * The generator takes resolved tags as an INPUT — it never computes prefixes
 * itself (that is `registry.ts`). Structured as a set of per-target renderers so
 * future targets (e.g. `copilot-instructions.md`) are additive over the same
 * `ResolvedComponent[]` model, per build-order step 4 / task #11.
 */

import {
  AGENTS_FILENAME,
  CLAUDE_FILENAME,
  CLAUDE_MD,
  GROUNDING_HEADER,
  INSTALLED_TABLE_HEADER,
  REGENERATION_NOTE,
} from "#init/layout.js";
import type { ResolvedComponent } from "#init/resolver.js";
import { AURO_CODING_RULES } from "#init/rules.js";
import { clean } from "#utils/cem.js";
import { apiBodyLines } from "#utils/formatComponent.js";

/** A file `auro init` writes: its name and full contents. */
export interface GroundingFile {
  /** The file to write, relative to the project root (e.g. `AGENTS.md`). */
  filename: string;
  /** The complete file contents. */
  contents: string;
}

/**
 * The tag to display for a component: its resolved custom/prefixed tag when the
 * registry provided one (keyed by the canonical bare `auro-*` tag), else the
 * canonical tag itself. The generator never derives prefixes — an absent entry
 * simply means "no custom registration", so the bare tag stands.
 */
function displayTag(
  component: ResolvedComponent,
  resolvedTags: ReadonlyMap<string, string>,
): string {
  return resolvedTags.get(component.tagName) ?? component.tagName;
}

/**
 * Render one component's fenced grounding block: a resolved-tag header, the
 * prefix/subpath-aware install + register snippet, and the shared API body. The
 * import line uses the component's `importPath` (package root for a standalone,
 * subpath export for a monorepo component); the register line uses the resolved
 * tag so an assistant copies the exact call this project expects.
 */
function componentBlock(component: ResolvedComponent, tag: string): string {
  const { pkg, importPath, declaration: decl } = component;
  const lines: string[] = [`${tag}  (${pkg})`];

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
  lines.push(`  import "${importPath}";`);
  lines.push(`  ${decl.name}.register('${tag}');`);

  lines.push(...apiBodyLines(decl));

  return lines.join("\n");
}

/**
 * Render the canonical `AGENTS.md`: the frozen header + coding rules, an
 * Installed Components table with one row per component, a fenced API section per
 * component (with its resolved tag + install/register snippet), and the frozen
 * Regeneration note. Components are emitted in the order given, so a caller
 * controls listing order by ordering the input. Passing an empty list yields a
 * valid document with just the table header and no component rows/sections.
 */
export function generateAgentsMd(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string> = new Map(),
): string {
  const rows = components.map((component) => {
    const tag = displayTag(component, resolvedTags);
    return `| \`<${tag}>\` | \`${component.pkg}\` | ${component.version} | \`${component.importPath}\` |`;
  });

  const sections = components.map((component) => {
    const tag = displayTag(component, resolvedTags);
    return `### \`<${tag}>\`\n\n\`\`\`\n${componentBlock(component, tag)}\n\`\`\``;
  });

  const installedLines = [
    "## Installed Components",
    "",
    INSTALLED_TABLE_HEADER,
    ...rows,
  ];
  if (sections.length > 0) {
    installedLines.push("", sections.join("\n\n"));
  }
  const installedSection = installedLines.join("\n");

  // Join the frozen sections with a single blank line between each, then one
  // trailing newline. Each constant's own trailing whitespace is trimmed so the
  // spacing is governed here, not by the constants.
  return `${[
    GROUNDING_HEADER.trimEnd(),
    AURO_CODING_RULES.trimEnd(),
    installedSection,
    REGENERATION_NOTE.trimEnd(),
  ].join("\n\n")}\n`;
}

/** Render the thin `CLAUDE.md` — the frozen `@AGENTS.md` import. */
export function generateClaudeMd(): string {
  return CLAUDE_MD;
}

/**
 * Render every grounding file `auro init` writes for v1: the canonical
 * `AGENTS.md` and the thin `CLAUDE.md` that imports it. Returned as a list so the
 * command writes them uniformly and future targets are additive here.
 */
export function groundingFiles(
  components: readonly ResolvedComponent[],
  resolvedTags: ReadonlyMap<string, string> = new Map(),
): GroundingFile[] {
  return [
    {
      filename: AGENTS_FILENAME,
      contents: generateAgentsMd(components, resolvedTags),
    },
    { filename: CLAUDE_FILENAME, contents: generateClaudeMd() },
  ];
}
