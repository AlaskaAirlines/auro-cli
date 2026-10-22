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

/** Member fields the comparison reads beyond the shared {@link CemMember} shape. */
interface DiffMember extends CemMember {
  attribute?: string;
  reflects?: boolean;
}

/** Attribute fields the comparison reads beyond the shared {@link CemAttribute} shape. */
interface DiffAttribute extends CemAttribute {
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
 * Split a type on its top-level `|`, ignoring bars nested inside brackets or
 * string literals. Each part is normalized.
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
    } else if (char === "|" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map(normalizeValue).filter((part) => part.length > 0);
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
  const removed = base.filter((part) => !head.includes(part));
  const added = head.filter((part) => !base.includes(part));
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

/** Classify a default-value change on one public attribute or property. */
function compareDefault(
  what: string,
  baseDefault: string | undefined,
  headDefault: string | undefined,
): ApiChange | null {
  const base =
    baseDefault === undefined ? undefined : normalizeValue(baseDefault);
  const head =
    headDefault === undefined ? undefined : normalizeValue(headDefault);
  if (base === head) {
    return null;
  }
  let message: string;
  if (base === undefined) {
    message = `Added default \`${head}\` to ${what}`;
  } else if (head === undefined) {
    message = `Removed default \`${base}\` from ${what}`;
  } else {
    message = `Changed default of ${what} from \`${base}\` to \`${head}\``;
  }
  return { bump: "major", source: "manifest", message };
}

/** Index a declaration's members by {@link memberKey}. */
function indexMembers(declaration: CemDeclaration): Map<string, DiffMember> {
  const members = new Map<string, DiffMember>();
  for (const member of declaration.members ?? []) {
    members.set(memberKey(member), member);
  }
  return members;
}

/** Public attributes of a declaration, keyed by attribute name. */
function publicAttributes(
  declaration: CemDeclaration,
  members: Map<string, DiffMember>,
): Map<string, DiffAttribute> {
  const attributes = new Map<string, DiffAttribute>();
  for (const attr of (declaration.attributes ?? []) as DiffAttribute[]) {
    const backing = attr.fieldName ? members.get(attr.fieldName) : undefined;
    if (attr.internal || (backing && !isPublicMember(backing))) {
      continue;
    }
    attributes.set(attr.name, attr);
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
    if (base.kind !== "field") {
      continue;
    }
    const what = `${label} \`${base.name}\` on ${on}`;
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
  const headAll = new Set((head.attributes ?? []).map((a) => a.name));
  const baseAll = new Set((base.attributes ?? []).map((a) => a.name));

  const hasPublicBacking = (
    attr: DiffAttribute,
    members: Map<string, DiffMember>,
  ) => {
    const backing = attr.fieldName ? members.get(attr.fieldName) : undefined;
    return backing !== undefined && isPublicMember(backing);
  };

  for (const [name, baseAttr] of basePublic) {
    const headAttr = headPublic.get(name);
    if (!headAttr) {
      changes.push({
        bump: "major",
        source: "manifest",
        message: headAll.has(name)
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
  }

  for (const name of headPublic.keys()) {
    if (basePublic.has(name)) {
      continue;
    }
    changes.push({
      bump: "minor",
      source: "manifest",
      message: baseAll.has(name)
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
  const baseNames = new Set((base ?? []).map((entry) => entry.name));
  const headNames = new Set((head ?? []).map((entry) => entry.name));
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

/** Compare the full public API of one element present in both manifests. */
function diffElement(tag: string, base: CemDeclaration, head: CemDeclaration) {
  const baseMembers = indexMembers(base);
  const headMembers = indexMembers(head);
  return [
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
