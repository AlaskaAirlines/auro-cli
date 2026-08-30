/**
 * The static half of `auro cem-check`: read the **raw** CEM declarations and
 * *report* what auro-cli's defensive prune ([manifest.ts](../editors/manifest.ts)
 * `buildManifest`) would otherwise drop in silence. The prune is a safety net that
 * keeps generation working but hides the defect from the component team; these
 * rules surface the same conditions as a producer-visible signal.
 *
 * Every rule that mirrors a prune reuses the **exact predicate the prune uses**
 * (`hasBalancedDelimiters`, `isPrivateReflection`), so the check and the silent
 * drop can never disagree — if the check passes, nothing gets pruned, and vice
 * versa.
 *
 * @see docs/cem-contract-enforcement.md → "Build the contract as an executable
 *   check" (the static-validation rule set).
 */

import {
  hasBalancedDelimiters,
  isPrivateReflection,
} from "#init/editors/manifest.js";
import type {
  CemAttribute,
  CemDeclaration,
  CemEvent,
  CemMember,
  CemSlot,
  Deprecated,
  Manifest,
} from "#utils/cem.js";

/** Severity of a contract finding: `error` fails the check, `warn` is advisory. */
export type CemSeverity = "error" | "warn";

/** One contract violation found in a CEM. */
export interface CemFinding {
  /** Stable rule id (e.g. `name-required`) for `--json` consumers and docs. */
  rule: string;
  /** `error` blocks the PR; `warn` is advisory unless `--strict`. */
  severity: CemSeverity;
  /** The registered element the finding belongs to (its tag), when applicable. */
  element?: string;
  /** A dotted locator within the declaration (e.g. `attributes[2].type.text`). */
  path?: string;
  /** Human-readable description of what is wrong and why it matters. */
  message: string;
}

/**
 * Attribute names conventionally backed by a fixed value set. When one is typed as
 * a bare `"string"` (no union) every value is accepted and nothing completes — the
 * `variant`-widening class of bug. Warn-only for now (curated set is deliberately
 * conservative); a future slice may make a core subset fatal once the
 * enumerated-attr scope is settled.
 *
 * @see docs/cem-contract-enforcement.md → Open questions, "Union-rule scope".
 */
export const ENUMERATED_ATTRS: ReadonlySet<string> = new Set([
  "variant",
  "shape",
  "size",
  "type",
  "appearance",
]);

/**
 * `type.text` spellings that carry no value information — a curated enumerated
 * attribute typed as any of these accepts every value and completes nothing. Covers
 * the lowercase TS `string`, the capitalized boxed `String` (valid TS, so
 * `type-not-typescript` ignores it — the shape most auro CEMs actually ship), and
 * `any`. Compared after trimming.
 */
const UNINFORMATIVE_STRING_TYPES: ReadonlySet<string> = new Set([
  "string",
  "String",
  "any",
]);

/**
 * Lowercase JS / JSDoc spellings that are **not** valid TypeScript types — the
 * `variant` → `Cannot find name 'array'` class seen across auro-formkit. Inlined
 * verbatim by the JSX/Svelte builders (`useCemTypes`), they make the emitted
 * `.d.ts` fail to compile. Value = the fix to suggest. (`string`/`number`/
 * `boolean`/`object`/`symbol`/`bigint`/`null`/`undefined`/`void`/`any`/`unknown`/
 * `never` are real lowercase TS types and are deliberately absent.)
 */
const INVALID_PRIMITIVE_TYPES: ReadonlyMap<string, string> = new Map([
  ["array", "use `unknown[]`, `T[]`, or `Array<T>`"],
  ["function", "use `Function` or an explicit call signature `(…) => …`"],
]);

/**
 * Generic built-ins that require a type argument — a **bare** `type.text` of one of
 * these (`Array`, not `Array<string>`) fails to compile (`Generic type 'Array<T>'
 * requires 1 type argument(s)`). Value = the shape to suggest.
 */
const BARE_GENERIC_TYPES: ReadonlyMap<string, string> = new Map([
  ["Array", "Array<T>"],
  ["ReadonlyArray", "ReadonlyArray<T>"],
  ["Promise", "Promise<T>"],
  ["Map", "Map<K, V>"],
  ["WeakMap", "WeakMap<K, V>"],
  ["Set", "Set<T>"],
  ["WeakSet", "WeakSet<T>"],
  ["Record", "Record<K, V>"],
]);

/**
 * Valid-but-uninformative object types: they compile, but expose no properties so
 * nothing completes in the editor — an advisory, not a generation break.
 */
const VAGUE_OBJECT_TYPES: ReadonlySet<string> = new Set(["object", "Object"]);

/**
 * A bad token to scan for inside a `type.text`, with its compiled matcher and the
 * fix to suggest. The token is matched as a **whole word** so `myArray`/`ReadonlyArray`
 * never trip the `Array` rule; the trailing lookahead excludes legitimate uses:
 *  - primitives (`array`/`function`) skip a following `:` — a property **key** named
 *    `array` (`{ array: string }`) is valid, only a type **position** is not;
 *  - generics skip a following `<` (already parameterised, e.g. `Array<string>`) and
 *    `:` (a property key).
 */
interface BadTypeToken {
  token: string;
  re: RegExp;
  fix: string;
}

const INVALID_PRIMITIVE_RULES: readonly BadTypeToken[] = [
  ...INVALID_PRIMITIVE_TYPES,
].map(([token, fix]) => ({
  token,
  fix,
  re: new RegExp(`\\b${token}\\b(?!\\s*:)`, "u"),
}));

const BARE_GENERIC_RULES: readonly BadTypeToken[] = [...BARE_GENERIC_TYPES].map(
  ([token, shape]) => ({
    token,
    fix: shape,
    re: new RegExp(`\\b${token}\\b(?!\\s*[<:])`, "u"),
  }),
);

/**
 * Blank out string/template-literal contents so a quoted `"array"` (a valid
 * string-literal type member) or `'function'` isn't misread as a bad type token.
 * Replaced with a space to preserve the word boundaries the scanners rely on.
 */
function withoutStringLiterals(text: string): string {
  return text.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/gu, " ");
}

/** Phrase the locator: `is \`X\`` when the whole type is the token, else `uses \`X\``. */
function describeType(text: string, token: string): string {
  return text === token
    ? `\`type.text\` is \`${token}\``
    : `\`type.text\` (${JSON.stringify(text)}) uses \`${token}\``;
}

/**
 * Prose-level deprecation markers — a description/summary that *announces* the entry
 * is deprecated. Deliberately narrow: only a **leading** marker, a **bracketed** or
 * **bolded** `deprecated`, or an inline `@deprecated` tag counts. An incidental
 * mention ("replaces the deprecated `onDark`") is not at the start and is neither
 * bracketed nor bolded, so it never trips the rule.
 */
const DEPRECATION_MARKERS: readonly RegExp[] = [
  /^[\s>*_~([-]*@?deprecated\b/iu, // leading: "DEPRECATED - use …", "- @deprecated …"
  /[([]\s*deprecated\b/iu, //          bracketed: "(Deprecated) Notifies …", "[deprecated]"
  /\*\*\s*deprecated\b/iu, //          bolded: "**deprecated**"
  /@deprecated\b/iu, //                inline JSDoc tag left in the prose
];

/** True when any supplied text carries a targeted prose deprecation marker. */
function hasDeprecationMarker(...texts: (string | undefined)[]): boolean {
  return texts.some(
    (text) =>
      typeof text === "string" &&
      DEPRECATION_MARKERS.some((re) => re.test(text.trim())),
  );
}

/** True when a structural `deprecated` field is present (bare `true` or a message). */
function isDeprecationFlagged(deprecated: Deprecated): boolean {
  return deprecated === true || isNonEmptyString(deprecated);
}

/**
 * Push a `deprecated-prose-unflagged` warning when a real class member (attribute /
 * property / field / method) reads as deprecated in its description or summary but
 * carries no structural `deprecated` field. Author-fixable: the analyzer honors an
 * `@deprecated` JSDoc tag on class members (v0.11.0), so adding the tag makes it emit
 * `deprecated` and clears the finding.
 */
function checkMemberDeprecation(
  findings: CemFinding[],
  element: string,
  path: string,
  entry: { description?: string; summary?: string; deprecated?: Deprecated },
): void {
  if (
    !isDeprecationFlagged(entry.deprecated) &&
    hasDeprecationMarker(entry.description, entry.summary)
  ) {
    findings.push({
      rule: "deprecated-prose-unflagged",
      severity: "warn",
      element,
      path,
      message:
        "described as deprecated but missing the `deprecated` field — add an `@deprecated` JSDoc tag so the generated JSX/Svelte types surface it with a strikethrough. (VS Code HTML custom-data has no deprecation field, so vanilla-HTML editors won't show it.)",
    });
  }
}

/**
 * Push a `deprecated-prose-unsupported` warning when an event or slot reads as
 * deprecated in prose but has no `deprecated` field. Unlike class members this is
 * **not** author-fixable with an `@deprecated` tag: the analyzer's inline
 * `@event`/`@fires`/`@slot` handling (v0.11.0) never emits `deprecated`, so editors
 * cannot surface it regardless of JSDoc. Reported under a distinct id so it can be
 * suppressed independently of the member rule.
 */
function checkEventSlotDeprecation(
  findings: CemFinding[],
  element: string,
  kind: "event" | "slot",
  path: string,
  entry: { description?: string; summary?: string; deprecated?: Deprecated },
): void {
  if (
    !isDeprecationFlagged(entry.deprecated) &&
    hasDeprecationMarker(entry.description, entry.summary)
  ) {
    findings.push({
      rule: "deprecated-prose-unsupported",
      severity: "warn",
      element,
      path,
      message: `this ${kind} reads as deprecated in prose, but the analyzer (v0.11.0) does not emit a \`deprecated\` field for inline \`@${kind}\` tags — editors cannot surface it. Track upstream or a mapping plugin; suppress this warning if the prose is intentional.`,
    });
  }
}

/**
 * Push a `deprecated-no-detail` warning when a `deprecated` field is a bare `true`
 * with no message — editors render a strikethrough but give consumers no migration
 * target. Low priority (a style nudge): prefer `@deprecated <what to use instead>`
 * over a bare `@deprecated`.
 */
function checkDeprecationDetail(
  findings: CemFinding[],
  element: string,
  path: string,
  entry: { deprecated?: Deprecated },
): void {
  if (entry.deprecated === true) {
    findings.push({
      rule: "deprecated-no-detail",
      severity: "warn",
      element,
      path,
      message:
        "`deprecated` is set but carries no message — editors show a strikethrough with no migration target. Prefer `@deprecated <what to use instead>`.",
    });
  }
}

/**
 * The registered custom elements in a manifest — the exact set the builders
 * process (mirrors `registeredElements` in [resolver.ts](../resolver.ts)): a
 * declaration counts only when it is `customElement` with a `tagName`.
 */
function registeredElements(manifest: Manifest): CemDeclaration[] {
  return (manifest.modules ?? [])
    .flatMap((module) => module.declarations ?? [])
    .filter((decl) => decl.customElement && decl.tagName);
}

/** True when `value` is a usable string identity (name/tag) — non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Push a `name-required` error for every entry in `entries` whose `name` is not a
 * string. Empty-string names are allowed (the valid default-slot name), matching
 * the prune's `hasName = typeof entry.name === "string"` guard.
 */
function checkNames(
  findings: CemFinding[],
  element: string,
  collection: string,
  entries: readonly { name?: unknown }[] | undefined,
): void {
  entries?.forEach((entry, index) => {
    if (typeof entry.name !== "string") {
      findings.push({
        rule: "name-required",
        severity: "error",
        element,
        path: `${collection}[${index}].name`,
        message: `${collection}[${index}] has no string \`name\` — community generators call \`.name.startsWith(…)\` and throw mid-generation.`,
      });
    }
  });
}

/**
 * Push a `type-parseable` error when `type.text` is a non-empty string with
 * unbalanced delimiters — the exact condition the prune's `withSafeType` strips,
 * which would otherwise splice unparseable TypeScript into the emitted `.d.ts`.
 */
function checkType(
  findings: CemFinding[],
  element: string,
  path: string,
  entry: { type?: { text?: string } },
): void {
  const text = entry.type?.text;
  if (typeof text === "string" && text !== "" && !hasBalancedDelimiters(text)) {
    findings.push({
      rule: "type-parseable",
      severity: "error",
      element,
      path: `${path}.type.text`,
      message: `\`type.text\` has unbalanced delimiters: ${JSON.stringify(text)} — the generated \`.d.ts\` would not parse.`,
    });
  }
}

/**
 * Push a finding when `type.text` contains a JS/JSDoc spelling that is not valid
 * TypeScript — a lowercase primitive (`array`, `function` → **error**) or a bare
 * generic missing its type argument (`Array`, `Promise`, … → **error**) — or, as a
 * whole, is a valid-but-uninformative object type (`object`/`Object` → **warn**).
 * These are the same defects the generation smoke catches, but reported with a
 * precise per-entry locator (`attributes[N].type.text`) instead of buried in bundled
 * `tsc` output.
 *
 * The bad-token scan matches whole words **inside** the type (so `"Array | null"`
 * and `"string | array"` are caught, not just the whole-string forms), after blanking
 * string literals — a quoted `"array"` member or a property key `{ array: string }`
 * is left untouched, keeping the rule free of false positives.
 */
function checkPrimitiveType(
  findings: CemFinding[],
  element: string,
  path: string,
  entry: { type?: { text?: string } },
): void {
  const raw = entry.type?.text;
  if (typeof raw !== "string") {
    return;
  }
  const text = raw.trim();
  if (text === "") {
    return;
  }
  const scannable = withoutStringLiterals(text);

  for (const { token, re, fix } of INVALID_PRIMITIVE_RULES) {
    if (re.test(scannable)) {
      findings.push({
        rule: "type-not-typescript",
        severity: "error",
        element,
        path: `${path}.type.text`,
        message: `${describeType(text, token)}, which is not a TypeScript type — ${fix}. The generated \`.d.ts\` would not compile.`,
      });
      return;
    }
  }

  for (const { token, re, fix } of BARE_GENERIC_RULES) {
    if (re.test(scannable)) {
      findings.push({
        rule: "type-not-typescript",
        severity: "error",
        element,
        path: `${path}.type.text`,
        message: `${describeType(text, token)}, a generic that requires a type argument — write \`${fix}\`. The generated \`.d.ts\` would not compile.`,
      });
      return;
    }
  }

  if (VAGUE_OBJECT_TYPES.has(text)) {
    findings.push({
      rule: "type-imprecise",
      severity: "warn",
      element,
      path: `${path}.type.text`,
      message: `\`type.text\` is \`${text}\` — a valid type, but it exposes no properties so nothing completes. Prefer an explicit shape (e.g. \`{ id: string }\`).`,
    });
  }
}

/**
 * Split a `type.text` on its **top-level** `|` union separators, ignoring any `|`
 * inside quotes or nested `()[]{}<>` (so `"a|b" | Array<x | y>` yields two members,
 * not four). Arrow `=>` is not treated as a closing angle. Members are trimmed and
 * empties dropped.
 */
function splitTopLevelUnion(text: string): string[] {
  const members: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === quote && text[i - 1] !== "\\") {
        quote = null;
      }
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{" || ch === "<") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
    } else if (ch === ">") {
      if (text[i - 1] !== "=") depth--; // ignore the `>` of an arrow `=>`
    } else if (ch === "|" && depth === 0) {
      members.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  members.push(text.slice(start).trim());
  return members.filter((member) => member !== "");
}

/** True when a union member is a string literal (`"x"` / `'x'` / `` `x` ``). */
function isStringLiteralMember(member: string): boolean {
  return /^(['"`]).*\1$/u.test(member);
}

/**
 * Push a `union-widened-by-string` warning when a `type.text` unions one or more
 * string literals with a bare `string`/`String` — the bare member widens the whole
 * type back to `string`, so the literals stop validating and completing (the
 * auro-tabs `"default" | "inverse" | string` class). Warn-only: the emitted `.d.ts`
 * still compiles, it just loses the completion the literals were meant to give.
 */
function checkWidenedUnion(
  findings: CemFinding[],
  element: string,
  path: string,
  entry: { type?: { text?: string } },
): void {
  const text = entry.type?.text?.trim();
  if (typeof text !== "string" || !text.includes("|")) {
    return;
  }
  const members = splitTopLevelUnion(text);
  const hasLiteral = members.some(isStringLiteralMember);
  const hasBareString = members.some((m) => m === "string" || m === "String");
  if (hasLiteral && hasBareString) {
    findings.push({
      rule: "union-widened-by-string",
      severity: "warn",
      element,
      path: `${path}.type.text`,
      message: `\`type.text\` (${JSON.stringify(text)}) unions string literals with a bare \`string\`, which widens the whole type back to \`string\` — drop the \`string\` member so the literals validate and complete.`,
    });
  }
}

/** True when a text field is absent or blank (nothing to drive an editor hover). */
function isMissingText(text: string | undefined): boolean {
  return typeof text !== "string" || text.trim() === "";
}

/**
 * Push a `missing-description` warning when neither `description` nor `summary`
 * carries text — editors then show no hover documentation for the entry. Warn-only;
 * applied to the component and its attributes/events (the surfaces the IntelliSense
 * audit measures). `kind` names the surface in the message.
 */
function checkDescription(
  findings: CemFinding[],
  element: string,
  kind: string,
  path: string | undefined,
  entry: { description?: string; summary?: string },
): void {
  if (isMissingText(entry.description) && isMissingText(entry.summary)) {
    findings.push({
      rule: "missing-description",
      severity: "warn",
      element,
      ...(path === undefined ? {} : { path }),
      message: `${kind} has no description or summary — editors show no hover documentation for it. Add a JSDoc description.`,
    });
  }
}

/** Run every static contract rule over one registered element. */
function checkDeclaration(findings: CemFinding[], decl: CemDeclaration): void {
  const element = isNonEmptyString(decl.tagName) ? decl.tagName : "<unknown>";

  // The declaration itself must carry a string class `name` (used as the export /
  // import-type identity); a non-string one breaks generation for this element.
  if (typeof decl.name !== "string") {
    findings.push({
      rule: "name-required",
      severity: "error",
      element,
      path: "name",
      message:
        "registered element has no string `name` — its generated import/export identity is undefined.",
    });
  }

  // Rule: missing-description (warn) — the component itself carries no hover docs.
  checkDescription(findings, element, "this component", undefined, decl);

  const members: readonly CemMember[] = decl.members ?? [];
  const attributes: readonly CemAttribute[] = decl.attributes ?? [];
  const events: readonly CemEvent[] = decl.events ?? [];
  const slots: readonly CemSlot[] = decl.slots ?? [];

  // Rule: name-required — every named collection.
  checkNames(findings, element, "members", members);
  checkNames(findings, element, "attributes", attributes);
  checkNames(findings, element, "slots", decl.slots);
  checkNames(findings, element, "events", events);
  checkNames(findings, element, "cssParts", decl.cssParts);
  checkNames(findings, element, "cssProperties", decl.cssProperties);

  // Rules: type-parseable (delimiters) + type-not-typescript / type-imprecise
  // (invalid or vague `type.text`) — members, attributes, events carry a `type.text`.
  members.forEach((m, i) => {
    checkType(findings, element, `members[${i}]`, m);
    checkPrimitiveType(findings, element, `members[${i}]`, m);
    checkMemberDeprecation(findings, element, `members[${i}]`, m);
    checkDeprecationDetail(findings, element, `members[${i}]`, m);
  });
  attributes.forEach((a, i) => {
    checkType(findings, element, `attributes[${i}]`, a);
    checkPrimitiveType(findings, element, `attributes[${i}]`, a);
    checkWidenedUnion(findings, element, `attributes[${i}]`, a);
    checkDescription(findings, element, "attribute", `attributes[${i}]`, a);
    checkMemberDeprecation(findings, element, `attributes[${i}]`, a);
    checkDeprecationDetail(findings, element, `attributes[${i}]`, a);
  });
  events.forEach((e, i) => {
    checkType(findings, element, `events[${i}]`, e);
    checkPrimitiveType(findings, element, `events[${i}]`, e);
    checkDescription(findings, element, "event", `events[${i}]`, e);
    checkEventSlotDeprecation(findings, element, "event", `events[${i}]`, e);
    checkDeprecationDetail(findings, element, `events[${i}]`, e);
  });
  slots.forEach((s, i) => {
    checkEventSlotDeprecation(findings, element, "slot", `slots[${i}]`, s);
    checkDeprecationDetail(findings, element, `slots[${i}]`, s);
  });

  // Backing-member privacy, keyed by name (built from raw members with a string
  // name — a nameless member can't be a `fieldName` target). Feeds both the
  // private-reflection warn below and mirrors the prune's own map.
  const memberPrivacyByName = new Map<string, string | undefined>(
    members
      .filter((m): m is CemMember => typeof m.name === "string")
      .map((m) => [m.name, m.privacy]),
  );

  attributes.forEach((attribute, index) => {
    // Rule: attribute-name-not-lowercase (warn) — the browser lowercases HTML
    // attribute names, so a camelCase `name` (e.g. `buttonHref`) never binds as
    // written. The JS property name lives in `fieldName`/the backing member; only
    // the reflected attribute `name` must be lowercase.
    if (isNonEmptyString(attribute.name) && /[A-Z]/u.test(attribute.name)) {
      findings.push({
        rule: "attribute-name-not-lowercase",
        severity: "warn",
        element,
        path: `attributes[${index}].name`,
        message: `attribute \`${attribute.name}\` has uppercase letters — HTML lowercases attribute names, so it never binds as written. Use \`${attribute.name.toLowerCase()}\` (the camelCase property name belongs in \`fieldName\`).`,
      });
    }

    // Rule: enumerated-union (warn) — a conventionally-enumerated attribute typed as
    // a bare uninformative string (`string`/`String`/`any`) accepts every value and
    // completes nothing.
    if (
      isNonEmptyString(attribute.name) &&
      ENUMERATED_ATTRS.has(attribute.name) &&
      UNINFORMATIVE_STRING_TYPES.has(attribute.type?.text?.trim() ?? "")
    ) {
      findings.push({
        rule: "enumerated-union",
        severity: "warn",
        element,
        path: `attributes[${index}].type.text`,
        message: `\`${attribute.name}\` is typed as bare \`${JSON.stringify(attribute.type?.text ?? "")}\` — an enumerated attribute should carry a string-literal union (e.g. \`"primary" | "secondary"\`) so values validate and complete.`,
      });
    }

    // Rule: private-reflection (warn) — an undescribed attribute reflected from a
    // private/omitted member leaks internal state into editor autocomplete.
    if (isPrivateReflection(attribute, memberPrivacyByName)) {
      findings.push({
        rule: "private-reflection",
        severity: "warn",
        element,
        path: `attributes[${index}]`,
        message: `\`${attribute.name ?? "<unnamed>"}\` reflects a private/omitted member and has no description — it leaks into editor autocomplete as a settable attribute (add a description if it is genuinely public).`,
      });
    }
  });
}

/**
 * Run the static contract rules over a parsed CEM, returning every finding (errors
 * and warnings). Pure and side-effect-free — the caller decides how findings map to
 * an exit code (see the `cem-check` command's exit contract).
 */
export function runContractRules(manifest: Manifest): CemFinding[] {
  const findings: CemFinding[] = [];

  // Rule: schema-version (warn) — a missing version means the generators can't
  // know which CEM shape they're reading.
  if (!isNonEmptyString(manifest.schemaVersion)) {
    findings.push({
      rule: "schema-version",
      severity: "warn",
      message:
        "manifest has no `schemaVersion` — declare the CEM schema version it targets.",
    });
  }

  for (const decl of registeredElements(manifest)) {
    checkDeclaration(findings, decl);
  }

  return findings;
}
