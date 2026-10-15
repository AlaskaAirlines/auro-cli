/**
 * Build a Custom Elements Manifest analyzer plugin that turns custom JSDoc tags
 * on a property or slot into custom fields on its CEM entries.
 *
 * The analyzer (v0.11.0) drops JSDoc tags it does not recognize. Plugins built
 * with this helper read their tags from Lit `static get properties()` /
 * `static properties` entries, class field declarations, get/set accessors,
 * and `this.<name> = …` assignments, convert them with `toFields`, and write the result onto the
 * matching field in `members` and, when the field has one, its entry in
 * `attributes`.
 *
 * Slots are declared with a single `@slot` tag, so their tags are written inline
 * in the slot description instead, for example `@slot label - The label. {@category a11y}`.
 * Inline tags are removed from the slot's CEM description and converted with the
 * same `toFields`.
 *
 * Tag values may be written with or without a leading colon (`@category a11y`
 * or `@category: a11y`). Fields are applied in the module link phase, before the
 * analyzer applies inheritance, so subclasses carry them too. An optional
 * `packageLinkPhase` runs after inheritance, for checks that need the full set
 * of members.
 *
 * @param {object} options - Plugin options.
 * @param {string} options.name - Plugin name, also used to prefix warnings.
 * @param {string[]} options.tagNames - JSDoc tag names to collect, without the `@`.
 * @param {(tags: Array<{ name: string, text: string }>, context: { warn: (message: string) => void }) => Record<string, unknown>} options.toFields
 *   Converts the collected tags into the fields to add. Return an empty object to add nothing.
 * @param {(context: { customElementsManifest: object, warn: (message: string) => void }) => void} [options.packageLinkPhase]
 *   Optional hook that runs after inheritance has been applied.
 * @returns {{ name: string, analyzePhase: Function, moduleLinkPhase: Function, packageLinkPhase?: Function }}
 *   A Custom Elements Manifest analyzer plugin.
 */
export function createPropertyTagPlugin({
  name,
  tagNames,
  toFields,
  packageLinkPhase,
}) {
  /** @type {WeakMap<object, Array<{ className: string, propName: string, fields: Record<string, unknown> }>>} */
  const pending = new WeakMap();

  const warn = (message) => {
    console.warn(`[${name}] ${message}`); // eslint-disable-line no-console
  };

  const inlineTag = new RegExp(
    `\\{@(${tagNames.join("|")})(?=[\\s:}])[:\\s]*([^}]*)\\}`,
    "gu",
  );

  const cleanValue = (text) => (text ?? "").trim().replace(/^:\s*/u, "");

  const findClassName = (ts, node) => {
    let current = node.parent;
    while (current) {
      if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
        return current.name?.text;
      }
      current = current.parent;
    }
    return undefined;
  };

  // True when `node` is the object literal backing Lit's `static get properties()` / `static properties`.
  const isLitPropertiesObject = (ts, node) => {
    const holder = ts.isReturnStatement(node.parent)
      ? node.parent.parent?.parent
      : node.parent;

    return (
      Boolean(holder) &&
      (ts.isGetAccessorDeclaration(holder) ||
        ts.isPropertyDeclaration(holder)) &&
      holder.name?.getText() === "properties" &&
      Boolean(
        holder.modifiers?.some(
          (mod) => mod.kind === ts.SyntaxKind.StaticKeyword,
        ),
      )
    );
  };

  const getPropName = (ts, node) => {
    if (
      ts.isPropertyAssignment(node) &&
      isLitPropertiesObject(ts, node.parent)
    ) {
      return node.name.getText().replace(/^['"]|['"]$/gu, "");
    }

    if (
      ts.isPropertyDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      return node.name.getText();
    }

    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression)
    ) {
      const { left } = node.expression;
      if (
        ts.isPropertyAccessExpression(left) &&
        left.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        return left.name.getText();
      }
    }

    return undefined;
  };

  const plugin = {
    name,

    analyzePhase({ ts, node, moduleDoc }) {
      const tags = ts
        .getJSDocTags(node)
        .filter((tag) => tagNames.includes(tag.tagName.text));
      const propName = tags.length ? getPropName(ts, node) : undefined;
      const className = propName ? findClassName(ts, node) : undefined;

      if (className) {
        const fields = toFields(
          tags.map((tag) => ({
            name: tag.tagName.text,
            text: cleanValue(ts.getTextOfJSDocComment(tag.comment)),
          })),
          {
            warn: (message) =>
              warn(`${moduleDoc.path}: ${className}.${propName} ${message}`),
          },
        );

        if (Object.keys(fields).length) {
          const entries = pending.get(moduleDoc) ?? [];
          entries.push({
            className,
            propName,
            fields,
          });
          pending.set(moduleDoc, entries);
        }
      }
    },

    moduleLinkPhase({ moduleDoc }) {
      (pending.get(moduleDoc) ?? []).forEach(
        ({ className, propName, fields }) => {
          const declaration = (moduleDoc.declarations ?? []).find(
            (decl) => decl.name === className,
          );
          const field = declaration?.members?.find(
            (member) => member.kind === "field" && member.name === propName,
          );

          if (field) {
            Object.assign(field, fields);
            (declaration.attributes ?? [])
              .filter((attr) => attr.fieldName === propName)
              .forEach((attr) => {
                Object.assign(attr, fields);
              });
          } else {
            warn(
              `${moduleDoc.path}: no field "${propName}" found on ${className}; @${tagNames.join("/@")} not applied.`,
            );
          }
        },
      );

      (moduleDoc.declarations ?? []).forEach((declaration) => {
        (declaration.slots ?? [])
          .filter((slot) => typeof slot.description === "string")
          .forEach((slot) => {
            const tags = [...slot.description.matchAll(inlineTag)].map(
              (match) => ({
                name: match[1],
                text: cleanValue(match[2]),
              }),
            );

            if (tags.length) {
              slot.description = slot.description
                .replace(inlineTag, "")
                .replace(/\s{2,}/gu, " ")
                .trim();

              Object.assign(
                slot,
                toFields(tags, {
                  warn: (message) =>
                    warn(
                      `${moduleDoc.path}: ${declaration.name} slot "${slot.name}" ${message}`,
                    ),
                }),
              );
            }
          });
      });
    },
  };

  if (packageLinkPhase) {
    plugin.packageLinkPhase = ({ customElementsManifest }) =>
      packageLinkPhase({
        customElementsManifest,
        warn,
      });
  }

  return plugin;
}
