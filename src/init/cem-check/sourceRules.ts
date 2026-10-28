/**
 * The source half of `auro cem-check`: read the JSDoc in each source file the
 * manifest lists and report problems the manifest itself can't show. Some
 * documentation rules depend on what the author wrote, not on what the analyzer
 * produced — for example, a `@default false` tag and a constructor that sets the
 * property to `false` both end up as `"default": "false"` in the CEM, so only the
 * source can tell them apart.
 *
 * Only files listed in `manifest.modules[].path` are read, so the check covers
 * exactly the sources that feed the published docs. A listed file that can't be
 * read (for example, a CEM checked away from its repo) is skipped, not reported.
 *
 * @see https://github.com/orgs/AlaskaAirlines/discussions/660 — the content
 *   guidelines these rules enforce.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CemFinding } from "#init/cem-check/rules.js";
import type { Manifest } from "#utils/cem.js";

/** A `/** … *\/` block in a source file, with the code that follows it. */
export interface JsDocBlock {
  /** 1-based line number of the block's opening `/**`. */
  line: number;
  /** The block's lines, with the leading `*` and surrounding whitespace removed. */
  lines: string[];
  /** The source text after the block, up to the next block: the code it documents. */
  following: string;
}

/** Matches one JSDoc block, capturing its body. `/**\/` is an empty comment, not JSDoc. */
const JSDOC_BLOCK = /\/\*\*(?!\/)([\s\S]*?)\*\//gu;

/** Source files the rules read; other module paths in the manifest are ignored. */
const SOURCE_FILE = /\.[cm]?[jt]s$/u;

/** How much of the code after a block to keep — enough for a property declaration. */
const FOLLOWING_LIMIT = 400;

/** Count the newlines before `index`, giving the 1-based line it sits on. */
function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Find every JSDoc block in `source`, in order. */
export function findJsDocBlocks(source: string): JsDocBlock[] {
  const matches = [...source.matchAll(JSDOC_BLOCK)];
  return matches.map((match, i) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const nextStart = matches[i + 1]?.index ?? source.length;
    return {
      line: lineAt(source, start),
      lines: (match[1] ?? "")
        .split("\n")
        .map((text) => text.replace(/^\s*\*?\s?/u, "").trimEnd()),
      following: source.slice(end, Math.min(nextStart, end + FOLLOWING_LIMIT)),
    };
  });
}

/** A `@default false` tag line (the value alone, as the analyzer reads it). */
const DEFAULT_FALSE = /^@default\s+false$/u;

/** A `@type {boolean}` tag in the block itself. */
const BOOLEAN_TYPE_TAG = /^@type\s+\{\s*boolean\s*\}/iu;

/**
 * The code after the block declares a Boolean property: a Lit `static properties`
 * entry (`name: { type: Boolean, … }`) or a `@property({ type: Boolean })` decorator.
 */
const BOOLEAN_DECLARATION = [
  /^\s*[\w$]+\s*:\s*\{[^}]*?\btype\s*:\s*Boolean\b/u,
  /^\s*@property\(\s*\{[^}]*?\btype\s*:\s*Boolean\b/u,
];

/** True when the block documents a boolean property, by its own tag or the code after it. */
function documentsBoolean(block: JsDocBlock): boolean {
  return (
    block.lines.some((text) => BOOLEAN_TYPE_TAG.test(text)) ||
    BOOLEAN_DECLARATION.some((pattern) => pattern.test(block.following))
  );
}

/**
 * Push a `redundant-boolean-default` warning when a boolean property's JSDoc has
 * `@default false`. A boolean attribute that isn't set is already off, and when the
 * constructor sets the property to `false` the manifest records that default on its
 * own, so the tag adds nothing (content guidelines › Defaults).
 */
function checkRedundantBooleanDefault(
  findings: CemFinding[],
  modulePath: string,
  block: JsDocBlock,
): void {
  const index = block.lines.findIndex((text) =>
    DEFAULT_FALSE.test(text.trim()),
  );
  if (index === -1 || !documentsBoolean(block)) {
    return;
  }
  findings.push({
    rule: "redundant-boolean-default",
    severity: "warn",
    path: `${modulePath}:${block.line + index}`,
    message:
      "`@default false` on a boolean property is redundant — a boolean that isn't set is already off, and the manifest picks up a constructor's `false` on its own. Remove the tag (content guidelines › Defaults).",
  });
}

/**
 * Run the source rules over every source file the manifest lists, resolving each
 * `modules[].path` against `rootDir` (the directory the CEM sits in). Returns every
 * finding; the caller maps them to an exit code, as for the static rules.
 */
export function runSourceRules(
  manifest: Manifest,
  rootDir: string,
): CemFinding[] {
  const findings: CemFinding[] = [];
  const seen = new Set<string>();

  for (const mod of manifest.modules ?? []) {
    const modulePath = mod.path;
    if (
      typeof modulePath !== "string" ||
      !SOURCE_FILE.test(modulePath) ||
      seen.has(modulePath)
    ) {
      continue;
    }
    seen.add(modulePath);

    let source: string;
    try {
      source = readFileSync(resolve(rootDir, modulePath), "utf-8");
    } catch {
      continue;
    }

    for (const block of findJsDocBlocks(source)) {
      checkRedundantBooleanDefault(findings, modulePath, block);
    }
  }

  return findings;
}
