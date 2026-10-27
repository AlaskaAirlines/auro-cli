/**
 * Classify the differences between two `custom-elements.json` manifests per the
 * TRD's CEM table (Verifying Release Versions Against Code Changes):
 *
 *  - Removing, renaming or privatizing an element or public member, narrowing a
 *    type, an attribute that stops reflecting, or any default-value change → major.
 *  - Adding an element or public member, publicizing a private member, or widening
 *    a type → minor.
 *
 * Only public API counts. Members are filtered on their `privacy` field, never on
 * name prefixes (most Auro private members don't start with `_`). Attributes carry
 * no `privacy` of their own, so an attribute is public unless it's `internal` or
 * its backing field is non-public.
 */

import type {
  CemAttribute,
  CemDeclaration,
  CemMember,
  CemNamed,
  Manifest,
} from "#utils/cem.js";
import type { ApiChange } from "./bump.ts";

/**
 * Usage metadata Auro's CEM plugins add, which tooling (including AI tools that
 * build pages from the manifest) acts on. The manifest is the contract, so these
 * count as API.
 */
interface Metadata {
  requiredWhen?: string;
  relevantWhen?: string;
  category?: string;
  minimum?: number;
  maximum?: number;
  readonly?: boolean;
  deprecated?: boolean | string;
}

/** A method parameter. */
interface Parameter {
  name: string;
  type?: { text?: string };
  optional?: boolean;
  rest?: boolean;
}

/** Member fields the comparison reads beyond the shared {@link CemMember} shape. */
interface DiffMember extends CemMember, Metadata {
  attribute?: string;
  reflects?: boolean;
  parameters?: Parameter[];
}

/** Attribute fields the comparison reads beyond the shared {@link CemAttribute} shape. */
interface DiffAttribute extends CemAttribute, Metadata {
  internal?: boolean;
}

/** A custom element declaration with the identity the comparison keys on. */
interface Element {
  tagName: string;
  className: string;
  declaration: CemDeclaration;
}

/** Collect every declaration that registers a tag, keyed by tag name. */
function collectElements(manifest: Manifest): Map<string, Element> {
  const elements = new Map<string, Element>();
  for (const mod of manifest.modules ?? []) {
    for (const declaration of mod.declarations ?? []) {
      const { tagName } = declaration;
      if (tagName && !elements.has(tagName)) {
        elements.set(tagName, {
          tagName,
          className: declaration.name,
          declaration,
        });
      }
    }
  }
  return elements;
}

/** A member counts as public API when it isn't marked private or protected. */
function isPublicMember(member: CemMember): boolean {
  return member.privacy === undefined || member.privacy === "public";
}

/** Members keyed by name, with statics kept apart from instance members. */
function memberKey(member: CemMember): string {
  return member.static ? `static ${member.name}` : member.name;
}

/** "property" for fields, the CEM kind otherwise ("method"). */
function memberLabel(member: CemMember): string {
  const kind = member.kind === "field" ? "property" : member.kind;
  return member.static ? `static ${kind}` : kind;
}

/**
 * Normalize a type or default value so formatting-only differences don't count:
 * the manifest stores string defaults in quotes, and the quote style or
 * whitespace may change without the value changing.
 */
export function normalizeValue(value: string): string {
  return value.replace(/['`]/gu, '"').replace(/\s+/gu, " ").trim();
}

/**
 * Normalize a default value: as {@link normalizeValue}, and also unwrap a lone
 * literal the analyzer sometimes emits in braces (`{'default'}` for `'default'`).
 */
export function normalizeDefault(value: string): string {
  const normalized = normalizeValue(value);
  const braced =
    /^\{\s*("[^"]*"|-?\d+(?:\.\d+)?|true|false|null|undefined)\s*\}$/u.exec(
      normalized,
    );
  return braced ? braced[1] : normalized;
}

/**
 * Split a type on its top-level `|`, ignoring bars nested inside brackets or
 * string literals. Each part is normalized. A top-level `,` splits too: older
 * Auro JSDoc wrote unions as `{'a', 'b'}`, which the manifest records as
 * `'a', 'b'`.
 */
export function splitUnion(typeText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const char of typeText) {
    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if ("([{<".includes(char)) {
      depth++;
    } else if (
      ")]}>".includes(char) &&
      !(char === ">" && current.endsWith("="))
    ) {
      // The `>` of an arrow (`=>`) isn't a closing bracket.
      depth--;
    } else if ((char === "|" || char === ",") && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  // JSDoc sometimes names the wrapper (`String`) for the primitive (`string`).
  const primitives: Record<string, string> = {
    String: "string",
    Number: "number",
    Boolean: "boolean",
  };
  return parts
    .map(normalizeValue)
    .filter((part) => part.length > 0)
    .map((part) => primitives[part] ?? part);
}

/** The primitive a literal type belongs to (`"sm"` → `string`), or `null`. */
function primitiveOf(part: string): string | null {
  if (/^".*"$/u.test(part)) {
    return "string";
  }
  if (/^-?\d+(?:\.\d+)?$/u.test(part)) {
    return "number";
  }
  if (part === "true" || part === "false") {
    return "boolean";
  }
  return null;
}

/**
 * Whether a union accepts a type part: it lists the part, or the primitive a
 * literal part belongs to, so `'a' | 'b'` → `string` widens instead of replacing.
 */
function covers(union: string[], part: string): boolean {
  const primitive = primitiveOf(part);
  return (
    union.includes(part) || (primitive !== null && union.includes(primitive))
  );
}

/**
 * Classify a type change on one public attribute or property. Missing type
 * information on either side isn't a change (it's a documentation gap).
 */
function compareType(
  what: string,
  baseText: string | undefined,
  headText: string | undefined,
): ApiChange | null {
  if (baseText === undefined || headText === undefined) {
    return null;
  }
  const base = splitUnion(baseText);
  const head = splitUnion(headText);
  const removed = base.filter((part) => !covers(head, part));
  const added = head.filter((part) => !covers(base, part));
  if (removed.length === 0 && added.length === 0) {
    return null;
  }
  const list = (parts: string[]) => parts.map((p) => `\`${p}\``).join(", ");
  if (removed.length > 0 && added.length > 0) {
    return {
      bump: "major",
      source: "manifest",
      message: `Changed type of ${what} from \`${normalizeValue(baseText)}\` to \`${normalizeValue(headText)}\``,
    };
  }
  if (removed.length > 0) {
    return {
      bump: "major",
      source: "manifest",
      message: `Narrowed type of ${what} (removed ${list(removed)})`,
    };
  }
  return {
    bump: "minor",
    source: "manifest",
    message: `Widened type of ${what} (added ${list(added)})`,
  };
}

/**
 * Classify a default-value change on one public attribute or property: a
 * different value is major; documenting a default or removing its documentation
 * is minor.
 */
function compareDefault(
  what: string,
  baseDefault: string | undefined,
  headDefault: string | undefined,
): ApiChange | null {
  // A default of `undefined` is the same as no default.
  const normalize = (value: string | undefined) => {
    const normalized =
      value === undefined ? undefined : normalizeDefault(value);
    return normalized === "undefined" ? undefined : normalized;
  };
  const base = normalize(baseDefault);
  const head = normalize(headDefault);
  if (base === head) {
    return null;
  }
  // Documenting a default, or dropping its documentation, is guidance: markup
  // that worked before still does, but tooling may now write different markup.
  // A different value changes what markup that omits it does.
  if (base === undefined) {
    return {
      bump: "minor",
      source: "manifest",
      message: `Added default \`${head}\` to ${what}`,
    };
  }
  if (head === undefined) {
    return {
      bump: "minor",
      source: "manifest",
      message: `Removed default \`${base}\` from ${what}`,
    };
  }
  return {
    bump: "major",
    source: "manifest",
    message: `Changed default of ${what} from \`${base}\` to \`${head}\``,
  };
}

/** Whether a manifest entry has a usable name (the analyzer sometimes emits none). */
function isNamed(entry: { name?: unknown }): boolean {
  return typeof entry.name === "string" && entry.name !== "";
}

/**
 * Classify changes to the usage metadata of one property, attribute, slot or
 * method. The test is whether markup that was valid before still is: a new or
 * broader requirement, a tighter bound, or becoming read-only breaks it (major);
 * looser rules, deprecations and guidance (`relevantWhen`, `category`) don't, but
 * are new information tooling acts on (minor).
 */
export function compareMetadata(
  what: string,
  base: Metadata,
  head: Metadata,
): ApiChange[] {
  const changes: ApiChange[] = [];
  const push = (bump: ApiChange["bump"], message: string) =>
    changes.push({ bump, source: "manifest", message });

  const fromReq = base.requiredWhen;
  const toReq = head.requiredWhen;
  if (fromReq !== toReq) {
    if (fromReq === undefined) {
      push("major", `Made ${what} required when \`${toReq}\``);
    } else if (toReq === undefined) {
      push("minor", `Made ${what} no longer required`);
    } else if (fromReq === "always") {
      push("minor", `Made ${what} required only when \`${toReq}\``);
    } else {
      // Always required, or required under a different condition: markup that
      // met the old condition can now be missing it.
      push(
        "major",
        `Changed when ${what} is required from \`${fromReq}\` to \`${toReq}\``,
      );
    }
  }

  const bound = (
    key: "minimum" | "maximum",
    tighter: (a: number, b: number) => boolean,
  ) => {
    const from = base[key];
    const to = head[key];
    if (from === to) {
      return;
    }
    const label = key === "minimum" ? "minimum" : "maximum";
    if (from === undefined) {
      push("major", `Added ${label} \`${to}\` to ${what}`);
    } else if (to === undefined) {
      push("minor", `Removed ${label} \`${from}\` from ${what}`);
    } else if (tighter(to, from)) {
      push(
        "major",
        `Tightened ${label} of ${what} from \`${from}\` to \`${to}\``,
      );
    } else {
      push(
        "minor",
        `Loosened ${label} of ${what} from \`${from}\` to \`${to}\``,
      );
    }
  };
  bound("minimum", (to, from) => to > from);
  bound("maximum", (to, from) => to < from);

  if (!base.readonly && head.readonly) {
    push("major", `Made ${what} read-only`);
  } else if (base.readonly && !head.readonly) {
    push("minor", `Made ${what} writable`);
  }

  if (!base.deprecated && head.deprecated) {
    push("minor", `Deprecated ${what}`);
  } else if (base.deprecated && !head.deprecated) {
    push("minor", `Removed the deprecation of ${what}`);
  }

  for (const key of ["relevantWhen", "category"] as const) {
    const from = base[key];
    const to = head[key];
    if (from === to) {
      continue;
    }
    if (from === undefined) {
      push("minor", `Added \`${key}\` \`${to}\` to ${what}`);
    } else if (to === undefined) {
      push("minor", `Removed \`${key}\` \`${from}\` from ${what}`);
    } else {
      push(
        "minor",
        `Changed \`${key}\` of ${what} from \`${from}\` to \`${to}\``,
      );
    }
  }

  return changes;
}

/**
 * Compare a method's parameters by position (JavaScript calls don't use the
 * names): removing one, adding a required one, or making one required breaks
 * existing calls; adding an optional one doesn't.
 */
function compareParameters(
  what: string,
  base: Parameter[] = [],
  head: Parameter[] = [],
): ApiChange[] {
  const changes: ApiChange[] = [];
  const push = (bump: ApiChange["bump"], message: string) =>
    changes.push({ bump, source: "manifest", message });
  const isOptional = (p: Parameter) => Boolean(p.optional || p.rest);
  for (let i = 0; i < Math.max(base.length, head.length); i++) {
    const from = base[i];
    const to = head[i];
    if (from && !to) {
      push("major", `Removed parameter \`${from.name}\` from ${what}`);
    } else if (!from && to) {
      push(
        isOptional(to) ? "minor" : "major",
        `Added ${isOptional(to) ? "optional" : "required"} parameter \`${to.name}\` to ${what}`,
      );
    } else if (from && to) {
      const param = `parameter \`${to.name}\` of ${what}`;
      if (isOptional(from) && !isOptional(to)) {
        push("major", `Made ${param} required`);
      } else if (!isOptional(from) && isOptional(to)) {
        push("minor", `Made ${param} optional`);
      }
      const typeChange = compareType(param, from.type?.text, to.type?.text);
      if (typeChange) {
        changes.push(typeChange);
      }
    }
  }
  return changes;
}

/** Index a declaration's members by {@link memberKey}, skipping nameless ones. */
function indexMembers(declaration: CemDeclaration): Map<string, DiffMember> {
  const members = new Map<string, DiffMember>();
  for (const member of declaration.members ?? []) {
    if (!isNamed(member)) {
      continue;
    }
    members.set(memberKey(member), member);
  }
  return members;
}

/**
 * Public attributes of a declaration, keyed by lower-cased name: HTML attribute
 * names are case-insensitive, so `tIndex` and `tindex` are the same attribute.
 */
function publicAttributes(
  declaration: CemDeclaration,
  members: Map<string, DiffMember>,
): Map<string, DiffAttribute> {
  const attributes = new Map<string, DiffAttribute>();
  for (const attr of (declaration.attributes ?? []) as DiffAttribute[]) {
    const backing = attr.fieldName ? members.get(attr.fieldName) : undefined;
    if (
      !isNamed(attr) ||
      attr.internal ||
      (backing && !isPublicMember(backing))
    ) {
      continue;
    }
    attributes.set(attr.name.toLowerCase(), attr);
  }
  return attributes;
}

/** Compare the members (properties and methods) of one element. */
function diffMembers(
  tag: string,
  baseMembers: Map<string, DiffMember>,
  headMembers: Map<string, DiffMember>,
): ApiChange[] {
  const changes: ApiChange[] = [];
  const on = `\`<${tag}>\``;

  for (const [key, base] of baseMembers) {
    if (!isPublicMember(base)) {
      continue;
    }
    const head = headMembers.get(key);
    const label = memberLabel(base);
    if (!head) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: `Removed ${label} \`${base.name}\` from ${on}`,
      });
      continue;
    }
    if (!isPublicMember(head)) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: `Made ${label} \`${base.name}\` on ${on} ${head.privacy}`,
      });
      continue;
    }
    if (head.kind !== base.kind) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: `Changed \`${base.name}\` on ${on} from a ${label} to a ${memberLabel(head)}`,
      });
      continue;
    }
    const what = `${label} \`${base.name}\` on ${on}`;
    changes.push(...compareMetadata(what, base, head));
    if (base.kind === "method") {
      changes.push(
        ...compareParameters(what, base.parameters, head.parameters),
      );
    }
    if (base.kind !== "field") {
      continue;
    }
    if (base.reflects && !head.reflects) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: `Attribute \`${base.attribute ?? base.name}\` on ${on} no longer reflects`,
      });
    }
    for (const change of [
      compareType(what, base.type?.text, head.type?.text),
      compareDefault(what, base.default, head.default),
    ]) {
      if (change) {
        changes.push(change);
      }
    }
  }

  for (const [key, head] of headMembers) {
    if (!isPublicMember(head)) {
      continue;
    }
    const base = baseMembers.get(key);
    const label = memberLabel(head);
    if (!base) {
      changes.push({
        bump: "minor",
        source: "manifest",
        message: `Added ${label} \`${head.name}\` to ${on}`,
      });
    } else if (!isPublicMember(base)) {
      changes.push({
        bump: "minor",
        source: "manifest",
        message: `Made ${base.privacy} ${label} \`${head.name}\` on ${on} public`,
      });
    }
  }

  return changes;
}

/**
 * Compare the attributes of one element. Type and default changes are only
 * reported here for attributes with no public backing property; otherwise the
 * property comparison already reports them.
 */
function diffAttributes(
  tag: string,
  base: CemDeclaration,
  head: CemDeclaration,
  baseMembers: Map<string, DiffMember>,
  headMembers: Map<string, DiffMember>,
): ApiChange[] {
  const changes: ApiChange[] = [];
  const on = `\`<${tag}>\``;
  const basePublic = publicAttributes(base, baseMembers);
  const headPublic = publicAttributes(head, headMembers);
  const allNames = (declaration: CemDeclaration) =>
    new Set(
      (declaration.attributes ?? [])
        .filter(isNamed)
        .map((a) => a.name.toLowerCase()),
    );
  const headAll = allNames(head);
  const baseAll = allNames(base);

  const hasPublicBacking = (
    attr: DiffAttribute,
    members: Map<string, DiffMember>,
  ) => {
    const backing = attr.fieldName ? members.get(attr.fieldName) : undefined;
    return backing !== undefined && isPublicMember(backing);
  };

  for (const [key, baseAttr] of basePublic) {
    const { name } = baseAttr;
    const headAttr = headPublic.get(key);
    if (!headAttr) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: headAll.has(key)
          ? `Made attribute \`${name}\` on ${on} private`
          : `Removed attribute \`${name}\` from ${on}`,
      });
      continue;
    }
    if (
      hasPublicBacking(baseAttr, baseMembers) ||
      hasPublicBacking(headAttr, headMembers)
    ) {
      continue;
    }
    const what = `attribute \`${name}\` on ${on}`;
    for (const change of [
      compareType(what, baseAttr.type?.text, headAttr.type?.text),
      compareDefault(what, baseAttr.default, headAttr.default),
    ]) {
      if (change) {
        changes.push(change);
      }
    }
    changes.push(...compareMetadata(what, baseAttr, headAttr));
  }

  for (const [key, { name }] of headPublic) {
    if (basePublic.has(key)) {
      continue;
    }
    changes.push({
      bump: "minor",
      source: "manifest",
      message: baseAll.has(key)
        ? `Made private attribute \`${name}\` on ${on} public`
        : `Added attribute \`${name}\` to ${on}`,
    });
  }

  return changes;
}

/** Compare a name-only API surface (slots, events, CSS parts, CSS custom properties). */
function diffNamed(
  tag: string,
  label: string,
  base: CemNamed[] | undefined,
  head: CemNamed[] | undefined,
): ApiChange[] {
  const describe = (name: string) =>
    label === "slot" && name === "" ? "default slot" : `${label} \`${name}\``;
  const on = `\`<${tag}>\``;
  // Nameless entries are analyzer noise, except the default slot (`""`).
  const names = (entries: CemNamed[] | undefined) =>
    new Set(
      (entries ?? [])
        .map((entry) => entry.name)
        .filter((name) => typeof name === "string"),
    );
  const baseNames = names(base);
  const headNames = names(head);
  const changes: ApiChange[] = [];
  for (const name of baseNames) {
    if (!headNames.has(name)) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: `Removed ${describe(name)} from ${on}`,
      });
    }
  }
  for (const name of headNames) {
    if (!baseNames.has(name)) {
      changes.push({
        bump: "minor",
        source: "manifest",
        message: `Added ${describe(name)} to ${on}`,
      });
    }
  }
  return changes;
}

/** Compare the usage metadata of slots present in both manifests. */
function diffSlotMetadata(
  tag: string,
  base: CemDeclaration,
  head: CemDeclaration,
): ApiChange[] {
  const headSlots = new Map(
    (head.slots ?? []).map((slot) => [slot.name, slot as Metadata]),
  );
  return (base.slots ?? []).flatMap((slot) => {
    const match = headSlots.get(slot.name);
    if (typeof slot.name !== "string" || !match) {
      return [];
    }
    const what =
      slot.name === ""
        ? `default slot of \`<${tag}>\``
        : `slot \`${slot.name}\` on \`<${tag}>\``;
    return compareMetadata(what, slot as Metadata, match);
  });
}

/** Compare the full public API of one element present in both manifests. */
function diffElement(tag: string, base: CemDeclaration, head: CemDeclaration) {
  const baseMembers = indexMembers(base);
  const headMembers = indexMembers(head);
  return [
    ...diffSlotMetadata(tag, base, head),
    ...diffAttributes(tag, base, head, baseMembers, headMembers),
    ...diffMembers(tag, baseMembers, headMembers),
    ...diffNamed(tag, "event", base.events, head.events),
    ...diffNamed(tag, "slot", base.slots, head.slots),
    ...diffNamed(tag, "CSS part", base.cssParts, head.cssParts),
    ...diffNamed(
      tag,
      "CSS custom property",
      base.cssProperties,
      head.cssProperties,
    ),
  ];
}

/** Classify every public API difference between two manifests. */
export function diffManifests(base: Manifest, head: Manifest): ApiChange[] {
  const baseElements = collectElements(base);
  const headElements = collectElements(head);
  const changes: ApiChange[] = [];

  // A tag that disappeared while a tag with the same class name appeared is a
  // rename, reported once instead of as a removal plus an addition.
  const renamedTo = new Map<string, string>();
  for (const [tag, element] of baseElements) {
    if (headElements.has(tag)) {
      continue;
    }
    const renamed = [...headElements.values()].find(
      (candidate) =>
        candidate.className === element.className &&
        !baseElements.has(candidate.tagName),
    );
    if (renamed) {
      renamedTo.set(tag, renamed.tagName);
    }
  }
  const newTags = new Set(renamedTo.values());

  for (const [tag, element] of baseElements) {
    const head = headElements.get(tag);
    if (head) {
      changes.push(...diffElement(tag, element.declaration, head.declaration));
      continue;
    }
    const newTag = renamedTo.get(tag);
    changes.push({
      bump: "major",
      source: "manifest",
      message: newTag
        ? `Renamed element \`<${tag}>\` to \`<${newTag}>\``
        : `Removed element \`<${tag}>\``,
    });
  }

  for (const tag of headElements.keys()) {
    if (!baseElements.has(tag) && !newTags.has(tag)) {
      changes.push({
        bump: "minor",
        source: "manifest",
        message: `Added element \`<${tag}>\``,
      });
    }
  }

  return changes;
}
