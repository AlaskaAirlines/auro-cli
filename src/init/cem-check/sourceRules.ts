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

/** One line of prose in a JSDoc block: its index in `block.lines`, and its text. */
interface ProseLine {
  index: number;
  text: string;
}

/**
 * Tags whose value is code or a keyword, not prose, so the word rules skip them:
 * `@category a11y` is a category, not the word "a11y".
 */
const VALUE_TAGS = new Set([
  "category",
  "customElement",
  "default",
  "forcePrivate",
  "internal",
  "maximum",
  "minimum",
  "private",
  "relevantWhen",
  "requiredWhen",
  "see",
  "type",
]);

/** What the word rules ignore inside a line: code spans, URLs, and `{@tag …}` inline tags. */
const NOT_PROSE = [/`[^`]*`/gu, /\bhttps?:\/\/\S+/gu, /\{@[^}]*\}/gu];

/**
 * The prose lines of a block, with code removed. Skips `@example` sections, code
 * fences, and tags from `VALUE_TAGS`, then blanks out code spans, URLs, and inline
 * tags, so a rule only ever sees words a reader would read as text.
 */
function proseLines(block: JsDocBlock): ProseLine[] {
  const prose: ProseLine[] = [];
  let inExample = false;
  let inFence = false;

  block.lines.forEach((line, index) => {
    const text = line.trim();
    if (text.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    const tag = /^@(\w+)/u.exec(text)?.[1];
    if (tag !== undefined) {
      inExample = tag === "example";
      if (inExample || VALUE_TAGS.has(tag)) {
        return;
      }
    }
    // Blank lines carry no words, and skipping them keeps a block's first prose
    // line its real first line of text (a block usually opens with a bare `/**`).
    if (inFence || inExample || text === "") {
      return;
    }
    prose.push({
      index,
      text: NOT_PROSE.reduce(
        (rest, pattern) => rest.replace(pattern, " "),
        text,
      ),
    });
  });

  return prose;
}

/** Push one word-rule finding at `line` of the block. */
function pushWordFinding(
  findings: CemFinding[],
  modulePath: string,
  block: JsDocBlock,
  line: ProseLine,
  rule: string,
  message: string,
): void {
  findings.push({
    rule,
    severity: "warn",
    path: `${modulePath}:${block.line + line.index}`,
    message,
  });
}

/** Words the guidelines replace, with what to write instead (content guidelines › Word choices). */
const WORD_CHOICES: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\be\.g\./iu,
    message:
      'uses "e.g." — write "for example" or "such as". Some tools also end the summary at its first period (content guidelines › Word choices).',
  },
  {
    pattern: /\bi\.e\./iu,
    message:
      'uses "i.e." — write "that is". Some tools also end the summary at its first period (content guidelines › Word choices).',
  },
  {
    pattern: /\bHTML5\b/u,
    message:
      'uses "HTML5" — name the element instead, such as "the inner `<button>` element" (content guidelines › Word choices).',
  },
  {
    pattern: /\ba11y\b/iu,
    message:
      'uses "a11y" — write "accessibility", or name the people affected, such as "screen reader users" (content guidelines › Word choices).',
  },
];

/** A description that opens with filler instead of saying what the item does. */
const FILLER_OPENER =
  /^(?:This (?:property|attribute|Boolean|boolean)\b|Used to\b)/u;

/**
 * The places a description starts: the block's first prose line when it isn't a
 * tag, and the text after ` - ` on a tag line such as `@slot name - …`.
 */
function descriptionStarts(prose: ProseLine[]): ProseLine[] {
  return prose.flatMap((line, i) => {
    if (line.text.startsWith("@")) {
      const separator = line.text.indexOf(" - ");
      return separator === -1
        ? []
        : [{ index: line.index, text: line.text.slice(separator + 3).trim() }];
    }
    return i === 0 ? [line] : [];
  });
}

/**
 * Push the word-rule warnings for one block (content guidelines › Word choices,
 * Formatting › Dashes, Structure › No filler openers, Deprecations). These are the
 * checks a pattern can make without false positives; anything that needs judgment,
 * such as "will" for current behavior, stays with `/auro:doc-review`.
 */
function checkWords(
  findings: CemFinding[],
  modulePath: string,
  block: JsDocBlock,
): void {
  const prose = proseLines(block);

  for (const line of prose) {
    for (const { pattern, message } of WORD_CHOICES) {
      if (pattern.test(line.text)) {
        pushWordFinding(
          findings,
          modulePath,
          block,
          line,
          "word-choice",
          message,
        );
      }
    }
    if (line.text.includes(" — ")) {
      pushWordFinding(
        findings,
        modulePath,
        block,
        line,
        "spaced-em-dash",
        'has a spaced em dash (" — ") — use a colon or a new sentence, or an em dash with no spaces (content guidelines › Formatting › Dashes).',
      );
    }
    if (/\bDEPRECATED\b/u.test(line.text)) {
      pushWordFinding(
        findings,
        modulePath,
        block,
        line,
        "deprecated-casing",
        'writes "DEPRECATED" in capitals — use "Deprecated:" in sentence case, followed by what to use instead (content guidelines › Deprecations).',
      );
    }
  }

  for (const start of descriptionStarts(prose)) {
    if (FILLER_OPENER.test(start.text)) {
      pushWordFinding(
        findings,
        modulePath,
        block,
        start,
        "filler-opener",
        'starts with filler ("This property …" or "Used to …") — start with a verb that says what it does, such as "Sets the …" (content guidelines › Structure › No filler openers).',
      );
    }
  }
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
      checkWords(findings, modulePath, block);
    }
  }

  return findings;
}
