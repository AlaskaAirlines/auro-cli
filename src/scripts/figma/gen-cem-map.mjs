// Writes <genDir>/<tag>.cem-map.json and .cem-map.md: the code-side inventory of one component from custom-elements.json.
// Scope: attributes and slots only. ctx: { tag, genDir, cemPath, modulePrefix? } (see binding-core.mjs).
import fs from "node:fs";
import path from "node:path";
import { ExitError, guard } from "./binding-core.mjs";

const unquote = (s) => s.replace(/^['"]|['"]$/g, "");
const enumValues = (t) => {
  if (!t) return null;
  const parts = t.split("|").map((s) => s.trim());
  return parts.every((p) => /^['"].*['"]$/.test(p)) ? parts.map(unquote) : null;
};
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
// category, relevantWhen and requiredWhen exist only in a CEM built with the logical CEM annotations; an older CEM has none of them and they are left out of the map.
const logicalFields = (x) =>
  Object.fromEntries(
    ["category", "relevantWhen", "requiredWhen"]
      .filter((k) => x[k] != null)
      .map((k) => [k, x[k]]),
  );

export function run(argv, ctx) {
  return guard("gen-cem-map", () => {
    const { tag, genDir, cemPath, modulePrefix } = ctx;
    const fail = (msg) => {
      console.error(`gen-cem-map: ${msg}`);
      throw new ExitError(2);
    };
    if (argv.length) fail(`unexpected argument: ${argv[0]}`);
    if (!fs.existsSync(cemPath))
      fail(`${cemPath} not found (run \`auro build\` first)`);
    const cem = JSON.parse(fs.readFileSync(cemPath, "utf8"));
    const modules = cem.modules.filter(
      (m) => !modulePrefix || (m.path ?? "").startsWith(modulePrefix),
    );
    const decl = modules
      .flatMap((m) => m.declarations ?? [])
      .find((d) => d.tagName === tag);
    if (!decl)
      fail(
        `${tag} not found in ${cemPath}${modulePrefix ? ` (modules under ${modulePrefix})` : ""}`,
      );

    const attributes = (decl.attributes ?? []).map((a) => {
      const values = enumValues(a.type?.text);
      const kind = values
        ? "enum"
        : a.type?.text === "boolean"
          ? "boolean"
          : (a.type?.text ?? "unknown");
      const def =
        a.default == null || a.default === "undefined"
          ? null
          : unquote(a.default);
      const member = (decl.members ?? []).find((m) => m.attribute === a.name);
      return {
        name: a.name,
        kind,
        values,
        default: def,
        description: clean(a.description),
        deprecated: a.deprecated
          ? a.deprecated === true
            ? true
            : clean(String(a.deprecated))
          : false,
        privacy: member?.privacy ?? "public",
        inheritedFrom: a.inheritedFrom?.name ?? null,
        ...logicalFields(a),
      };
    });
    const slots = (decl.slots ?? []).map((s) => ({
      name: s.name || "(default)",
      description: clean(s.description),
      ...logicalFields(s),
    }));

    const map = { tag, className: decl.name, attributes, slots };
    fs.mkdirSync(genDir, { recursive: true });
    fs.writeFileSync(
      path.join(genDir, `${tag}.cem-map.json`),
      `${JSON.stringify(map, null, 2)}\n`,
    );

    const flags = (a) =>
      [
        a.deprecated && "deprecated",
        a.privacy !== "public" && a.privacy,
        a.inheritedFrom && `inherited from ${a.inheritedFrom}`,
      ]
        .filter(Boolean)
        .join(", ");
    const md = [
      `# ${tag} — code-side map (from CEM)`,
      "",
      "Scope: attributes and slots only.",
      "",
      "## Attributes",
      "",
      "| attribute | kind | values | default | flags |",
      "|---|---|---|---|---|",
      ...attributes.map(
        (a) =>
          `| \`${a.name}\` | ${a.kind} | ${a.values ? a.values.map((v) => `\`${v}\``).join(", ") : ""} | ${a.default ?? ""} | ${flags(a)} |`,
      ),
      "",
      "## Slots",
      "",
      "| slot | description |",
      "|---|---|",
      ...slots.map((s) => `| \`${s.name}\` | ${s.description} |`),
      "",
    ].join("\n");
    fs.writeFileSync(path.join(genDir, `${tag}.cem-map.md`), md);
    console.log(
      `${tag}: ${attributes.length} attributes (${attributes.filter((a) => a.kind === "enum").length} enums), ${slots.length} slots`,
    );
  });
}
