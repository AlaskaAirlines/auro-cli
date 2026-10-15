import { createPropertyTagPlugin } from "./propertyTagPlugin.mjs";

const IDENT = "[A-Za-z_$][\\w$]*";
const BOOLEAN_FORM = new RegExp(`^(!?)(${IDENT})$`, "u");
const COMPARISON_FORM = new RegExp(`^(${IDENT})\\s*(===|!==)\\s*(.+)$`, "u");
const INVALID = Symbol("invalid");

// Converts the right-hand side of a comparison into a JS value, or INVALID.
const parseLiteral = (text) => {
  const quoted = text.match(/^(?<quote>['"])(?<inner>.*)\k<quote>$/u);
  const literals = {
    true: true,
    false: false,
    null: null,
    undefined,
  };

  if (quoted) {
    return quoted.groups.inner;
  }
  if (Object.hasOwn(literals, text)) {
    return literals[text];
  }
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) {
    return Number(text);
  }
  if (/^[\w$.-]+$/u.test(text)) {
    return text;
  }
  return INVALID;
};

const formatLiteral = (value) => {
  if (typeof value === "string") {
    return value.includes("'") ? `"${value}"` : `'${value}'`;
  }
  return String(value);
};

/**
 * Parses a condition such as `isDropdown`, `!noValidate` or `layout === 'snowflake'`.
 * @param {string} text - The condition text.
 * @returns {{ property: string, negated?: boolean, operator?: string, value?: unknown } | undefined} The parsed condition, or undefined when it is malformed.
 */
const parseCondition = (text) => {
  const bool = text.match(BOOLEAN_FORM);
  if (bool) {
    return {
      property: bool[2],
      negated: bool[1] === "!",
    };
  }

  const comparison = text.match(COMPARISON_FORM);
  const value = comparison ? parseLiteral(comparison[3].trim()) : INVALID;
  if (value === INVALID) {
    return undefined;
  }

  return {
    property: comparison[1],
    operator: comparison[2],
    value,
  };
};

const formatCondition = (condition) => {
  if (condition.operator) {
    return `${condition.property} ${condition.operator} ${formatLiteral(condition.value)}`;
  }
  return `${condition.negated ? "!" : ""}${condition.property}`;
};

/**
 * Checks a condition against the CEM type text of the property it references.
 * @param {ReturnType<typeof parseCondition>} condition - The parsed condition.
 * @param {string | undefined} typeText - The referenced field's `type.text`.
 * @returns {string | undefined} A description of the mismatch, or undefined when the condition fits the type.
 */
const checkType = (condition, typeText) => {
  if (!condition.operator) {
    return typeText === "boolean"
      ? undefined
      : `that field is typed "${typeText ?? "unknown"}", not "boolean"`;
  }

  const { value } = condition;
  if (!typeText || value === null || value === undefined) {
    return undefined;
  }

  const parts = typeText.split("|").map((part) => part.trim());
  const kind = typeof value;

  if (
    parts.includes(kind) ||
    parts.includes(formatLiteral(value)) ||
    parts.includes(`"${value}"`)
  ) {
    return undefined;
  }

  const stringLiterals = parts.filter((part) =>
    /^(?<quote>['"]).*\k<quote>$/u.test(part),
  );
  if (kind === "string" && stringLiterals.length) {
    return `${formatLiteral(value)} is not one of ${stringLiterals.join(" | ")}`;
  }

  return `that field is typed "${typeText}", which does not accept ${kind} ${formatLiteral(value)}`;
};

/**
 * Build a Custom Elements Manifest analyzer plugin for a JSDoc tag whose value
 * is a condition on another property of the same element, such as
 * `@requiredWhen isDropdown`.
 *
 * Conditions take one of these forms:
 *
 * - `prop` – a boolean property is true, for example `@relevantWhen isDropdown`.
 * - `!prop` – a boolean property is false, for example `@relevantWhen !noValidate`.
 * - `prop === value` / `prop !== value` – a property does or does not equal a
 * value, for example `@relevantWhen layout === 'snowflake'`. The value can be a
 * quoted or bare string, a number, `true`, `false`, `null`, or `undefined`.
 *
 * On a property, the tag is a block tag. Its value is written to a CEM field of
 * the same name on the property's field and attribute entries, for example
 * `"relevantWhen": "layout === 'snowflake'"`. On a slot, the tag is written
 * inline in the `@slot` description, since JSDoc tags cannot be attached to
 * another tag, for example `@slot label - The label content. {@requiredWhen isDropdown}`.
 * The inline tag is removed from the slot's CEM description and its value is
 * written to a field of the same name on the slot entry. Comparisons are
 * normalized to strict operators and single-quoted strings.
 *
 * `keywords` lists extra values that are accepted as-is, such as `always`. Once
 * inheritance has been applied, each referenced property is checked: a warning
 * is reported if the element has no such field, if a bare or `!` condition
 * references a field that is not typed `boolean`, or if a comparison value does
 * not fit the field's type (for example a string that is not one of the field's
 * string literals). Only one tag is allowed per property or slot.
 *
 * @param {object} options - Plugin options.
 * @param {string} options.name - Plugin name, also used to prefix warnings.
 * @param {string} options.tagName - JSDoc tag name without the `@`; also the CEM field name.
 * @param {string[]} [options.keywords] - Values accepted without being resolved to a property.
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function, packageLinkPhase: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function createConditionTagPlugin({ name, tagName, keywords = [] }) {
  const expected = [
    ...keywords.map((keyword) => `"${keyword}"`),
    '"prop", "!prop", "prop === value", or "prop !== value"',
  ].join(" or ");

  return createPropertyTagPlugin({
    name,
    tagNames: [tagName],
    toFields(tags, { warn }) {
      if (tags.length > 1) {
        warn(
          `has ${tags.length} @${tagName} tags; only one is allowed. Using "${tags[0].text}".`,
        );
      }

      const [{ text }] = tags;

      if (keywords.includes(text)) {
        return { [tagName]: text };
      }

      const condition = parseCondition(text);
      if (!condition) {
        warn(
          `has an invalid @${tagName} "${text}"; expected ${expected}. Skipping.`,
        );
        return {};
      }

      return { [tagName]: formatCondition(condition) };
    },
    packageLinkPhase({ customElementsManifest, warn }) {
      (customElementsManifest.modules ?? []).forEach((mod) => {
        (mod.declarations ?? []).forEach((declaration) => {
          const tagged = [
            ...(declaration.members ?? []).map((member) => ({
              entry: member,
              label: `${declaration.name}.${member.name}`,
            })),
            ...(declaration.slots ?? []).map((slot) => ({
              entry: slot,
              label: `${declaration.name} slot "${slot.name}"`,
            })),
          ].filter(
            ({ entry }) =>
              entry[tagName] &&
              !keywords.includes(entry[tagName]) &&
              !entry.inheritedFrom,
          );

          tagged.forEach(({ entry, label }) => {
            const condition = parseCondition(entry[tagName]);
            const field = (declaration.members ?? []).find(
              (other) =>
                other.kind === "field" && other.name === condition.property,
            );
            const prefix = `${mod.path}: ${label} is @${tagName} "${entry[tagName]}", but`;
            const mismatch = field
              ? checkType(condition, field.type?.text)
              : `${declaration.name} has no field named "${condition.property}"`;

            if (mismatch) {
              warn(`${prefix} ${mismatch}.`);
            }
          });
        });
      });
    },
  });
}
