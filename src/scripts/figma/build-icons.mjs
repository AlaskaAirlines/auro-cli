// Builds the Code Connect mappings for the icon components of the Auro icon library in Figma: each one maps to
// <auro-icon category="..." name="..."> so a component whose icon is an instance swap (Button) shows the right icon.
// Runs for a tag in FIGMA_ICON_LIBRARIES (figma-connector.config.ts), i.e. in the auro-icon repo, after build-mismatch.
// It plays the part of build-translate and build-figma for the icons: it tops up <tag>.translate.md and writes <tag>.figma.ts.
//
// Flags: [--prune]
// ctx: { tag, figmaDir, genDir, sourceDir, iconLibrary: { file, frame, namePrefixes? } }
//   The published components of the library file whose containing frame is `frame` are read from the Figma API (needs
//   FIGMA_ACCESS_TOKEN). A component named `<category>/<name>` (category: before the first "/", name: after the last "/", with the
//   category's namePrefixes entry put in front of the name) is mapped when <sourceDir>/node_modules/@alaskaairux/icons/dist/icons/
//   <category>/<name>.svg exists. A name that does not match is never guessed.
//
// <figmaDir>/<tag>.translate.md is the input, like for every other component. Its "## Figma icons to auro-icon" table
// (Figma component | Icon (category/name) | Notes) has a row for every component without a match by name. build-icons only adds the
// missing rows, as `TBD`; an existing row is never edited. A person fills the second cell with `<category>/<name>` (an icon of the
// package) or `n/a`; the next run maps it. `TBD` only warns. A row whose component now matches by name, or is gone from Figma, is a
// prune candidate: kept with an HTML comment saying why; --prune removes the ones whose component is gone (original saved as .bak).
// The heading has no "->" on purpose: binding-core.mjs reads the tables with "-> code" / "-> Figma" in their title and skips this one.
//
// <figmaDir>/<tag>.mismatch.md is output only, never read: build-icons writes the components without a name match between
// <!-- build-icons:begin unmapped --> markers; the rest of that file is build-mismatch's.
// <genDir>/<tag>.figma.ts is generated and not committed. Sorted, no timestamps: the same inputs give the same files.
// Exit codes: 0 ok, 2 bad input, a missing token, a failed request, or a filled cell that is not an icon of the package.
import fs from "node:fs";
import path from "node:path";
import { escCell, ExitError, guard, splitRow } from "./binding-core.mjs";

const ICONS_PACKAGE = path.join(
  "node_modules",
  "@alaskaairux",
  "icons",
  "dist",
  "icons",
);
const BEGIN = "<!-- build-icons:begin unmapped -->";
const END = "<!-- build-icons:end unmapped -->";
const HEADING = /^##\s+Figma icons\b/i;
const TITLE = "## Figma icons to auro-icon";
const HEAD = [
  "| Figma component | Icon (category/name, or n/a) | Notes |",
  "|---|---|---|",
];
const MARK = / <!-- build-icons: prune candidate.*?-->/;

export function run(argv, ctx) {
  return guard("build-icons", async () => {
    const fail = (msg) => {
      console.error(`build-icons: ${msg}`);
      throw new ExitError(2);
    };
    const prune = argv.includes("--prune");
    for (const a of argv)
      if (a !== "--prune") fail(`unexpected argument: ${a}`);
    const token = process.env.FIGMA_ACCESS_TOKEN;
    if (!token)
      fail("FIGMA_ACCESS_TOKEN is not set (a Figma personal access token)");
    const { file: library, frame, namePrefixes = {} } = ctx.iconLibrary ?? {};
    if (!library)
      fail(`${ctx.tag} has no icon library in the Figma connector config`);
    const iconsDir = path.join(ctx.sourceDir, ICONS_PACKAGE);
    if (!fs.existsSync(iconsDir))
      fail(`${iconsDir} not found: install @alaskaairux/icons first`);

    const get = async (p) => {
      const res = await fetch(`https://api.figma.com${p}`, {
        headers: { "X-Figma-Token": token },
      });
      if (!res.ok)
        fail(
          `Figma API answered ${res.status} ${res.statusText} for ${p}${res.status === 403 ? " (check the token and that it can read this file)" : ""}`,
        );
      return res.json();
    };
    const file = await get(`/v1/files/${library}?depth=1`);
    const comps = (await get(`/v1/files/${library}/components`)).meta.components
      .filter((c) => c.containing_frame?.name === frame)
      .map((c) => ({ name: c.name.trim(), raw: c.name, id: c.node_id }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (!comps.length)
      fail(`no published component in the frame "${frame}" of file ${library}`);

    const hasIcon = (category, name) =>
      category && fs.existsSync(path.join(iconsDir, category, `${name}.svg`));

    // ---------- match by name ----------
    const byName = []; // { raw, id, category, name }
    const unmatched = []; // the components with no icon of the same name
    for (const c of comps) {
      const i = c.name.indexOf("/");
      const category = i === -1 ? "" : c.name.slice(0, i);
      const name =
        (namePrefixes[category] ?? "") +
        c.name.slice(c.name.lastIndexOf("/") + 1);
      if (hasIcon(category, name)) byName.push({ ...c, category, name });
      else unmatched.push(c);
    }
    const inFigma = new Set(comps.flatMap((c) => [c.raw, c.name]));
    const nameMatched = new Set(byName.flatMap((c) => [c.raw, c.name]));

    // ---------- <tag>.translate.md: read the rows, top up the missing ones ----------
    const translatePath = path.join(ctx.figmaDir, `${ctx.tag}.translate.md`);
    const exists = fs.existsSync(translatePath);
    const text = exists ? fs.readFileSync(translatePath, "utf8") : "";
    const lines = exists
      ? text.replace(/\n$/, "").split("\n")
      : [
          `# ${ctx.tag} — translation of the Figma icons that have no icon of the same name (placeholder)`,
          "",
        ];
    const unq = (c) => c.trim().replace(/^`|`$/g, "");
    const isData = (c) =>
      !c.every((x) => /^:?-+:?$/.test(x)) && c[0] !== "Figma component";
    const scan = () => {
      const h = lines.findIndex((l) => HEADING.test(l));
      if (h < 0) return { h, e: lines.length, table: [], data: [] };
      let e = lines.findIndex((l, i) => i > h && /^##\s/.test(l));
      if (e < 0) e = lines.length;
      const table = [];
      for (let i = h + 1; i < e; i++)
        if (lines[i].startsWith("|")) table.push(i);
      return { h, e, table, data: table.filter((i) => isData(splitRow(lines[i]))) };
    };
    const row = (c) => `| \`${escCell(c.raw)}\` | TBD | |`;
    const unmark = (l) => l.replace(MARK, "");
    const markOf = (reason) =>
      ` <!-- build-icons: prune candidate: ${reason} -->`;
    const mark = (line, reason) => {
      const l = unmark(line);
      const n = splitRow(l).length;
      return n < 3
        ? `${l}${" |".repeat(2 - n)}${markOf(reason)} |`
        : l.replace(/(\s*\|\s*)$/, `${markOf(reason)}$1`);
    };

    let added = 0;
    let removed = 0;
    let commented = 0;
    let { h, e, table, data } = scan();
    if (h >= 0) {
      const removable = [];
      for (const i of data) {
        const name = unq(splitRow(lines[i])[0]);
        const gone = !inFigma.has(name);
        if (gone || nameMatched.has(name)) {
          const why = gone
            ? "the Figma component no longer exists"
            : "the component now matches an icon by name, so it is no longer a gap (keep it if it is an intentional override of that match)";
          if (prune && gone) {
            removable.push(i);
            console.error(
              `build-icons: removed "${name}" from "${TITLE}" (${why})`,
            );
            continue;
          }
          console.error(
            `build-icons: warning: "${name}" in "${TITLE}" is a prune candidate: ${why} (kept; ${gone ? "--prune removes it" : "--prune keeps it, it may be an intentional override"})`,
          );
          const l = mark(lines[i], why);
          if (l !== lines[i]) {
            lines[i] = l;
            commented++;
          }
        } else if (MARK.test(lines[i])) {
          lines[i] = unmark(lines[i]);
          commented++;
        }
      }
      for (const i of removable.reverse()) lines.splice(i, 1);
      if (removable.length) {
        removed += removable.length;
        ({ h, e, table, data } = scan());
      }
    }
    const have = new Set(data.map((i) => unq(splitRow(lines[i])[0])));
    const missing = unmatched.filter((c) => !have.has(c.raw) && !have.has(c.name));
    if (missing.length) {
      added += missing.length;
      if (h < 0) {
        if (lines.at(-1) !== "") lines.push("");
        lines.push(TITLE, "", ...HEAD, ...missing.map(row));
      } else if (table.length)
        lines.splice(table.at(-1) + 1, 0, ...missing.map(row));
      else lines.splice(h + 1, 0, "", ...HEAD, ...missing.map(row));
    } else if (h >= 0 && !data.length) {
      // a table left with no rows is removed, like build-translate does
      const { h: h2, e: e2 } = scan();
      if (lines.slice(h2 + 1, e2).every((l) => l.trim() === "" || l.startsWith("|"))) {
        lines.splice(h2, e2 - h2);
        while (lines.at(-1) === "") lines.pop();
      }
    }
    const translated = `${lines.join("\n")}\n`;

    // ---------- the filled rows ----------
    const filled = new Map(); // Figma component -> { cell, where }
    {
      const s = scan();
      for (const i of s.data) {
        const c = splitRow(lines[i]);
        filled.set(unq(c[0]), {
          cell: unq(c[1] ?? "TBD"),
          where: `${path.basename(translatePath)}:${i + 1}`,
        });
      }
    }
    const matched = [...byName]; // { raw, id, category, name }
    const handMapped = [];
    let tbd = 0;
    for (const c of unmatched) {
      const r = filled.get(c.raw) ?? filled.get(c.name);
      const cell = r?.cell ?? "TBD";
      if (/^n\/a\b/i.test(cell)) continue;
      if (/^TBD\b/i.test(cell)) {
        tbd++;
        console.warn(`build-icons: ${c.raw}: TBD translation left unmapped`);
        continue;
      }
      const j = cell.indexOf("/");
      const cat = j === -1 ? "" : cell.slice(0, j);
      const nm = cell.slice(cell.lastIndexOf("/") + 1);
      if (!hasIcon(cat, nm))
        fail(
          `${r.where}: "${cell}" is not an icon of @alaskaairux/icons (expected <category>/<name> with <category>/<name>.svg in the package, or n/a)`,
        );
      handMapped.push({ ...c, category: cat, name: nm });
    }
    matched.push(...handMapped);
    matched.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    // ---------- the generated Code Connect file ----------
    const slug = encodeURIComponent(file.name.replace(/\s+/g, "-"));
    const url = (id) =>
      `https://www.figma.com/design/${library}/${slug}?node-id=${id.replace(":", "-")}`;
    const ts = [
      `// Generated by build-icons from the "${frame}" frame of the Figma file "${file.name}" (${library}), @alaskaairux/icons and ${path.basename(translatePath)}. Do not edit by hand.`,
      `// ${matched.length} icons mapped to <auro-icon> (${handMapped.length} by ${path.basename(translatePath)}); the other ${comps.length - matched.length} are in ${ctx.tag}.mismatch.md.`,
      `import figma, { html } from '@figma/code-connect/html'`,
      "",
      ...matched.flatMap((c) => [
        `// ${c.raw.trim()}`,
        `figma.connect('${url(c.id)}', {`,
        `  example: () => html\`<auro-icon customColor category="${c.category}" name="${c.name}"></auro-icon>\`,`,
        `  imports: ["import '@aurodesignsystem/auro-icon';"],`,
        "})",
        "",
      ]),
    ].join("\n");

    // ---------- the unmapped section of the mismatch file (output only) ----------
    const mismatchPath = path.join(ctx.figmaDir, `${ctx.tag}.mismatch.md`);
    const existing = fs.existsSync(mismatchPath)
      ? fs.readFileSync(mismatchPath, "utf8")
      : "";
    const section = [
      BEGIN,
      "# Figma icons with no icon of the same name in @alaskaairux/icons",
      "",
      `The Figma component \`<category>/<name>\` has no \`<category>/<name>.svg\` in the icons package (the category is what is before the first \`/\`, the name what is after the last one; \`hazmat\` names get the \`hazmat-\` prefix), so \`category\` and \`name\` would be a guess. ${unmatched.length} of ${comps.length} components. Each has a row in \`${path.basename(translatePath)}\` (an icon of the package, \`n/a\` or \`TBD\`); build-icons adds the missing ones.`,
      "",
      ...(unmatched.length
        ? [
            "| Figma component | Node |",
            "|---|---|",
            ...unmatched.map((u) => `| \`${escCell(u.raw)}\` | ${u.id} |`),
          ]
        : ["_none_"]),
      END,
    ].join("\n");
    const a = existing.indexOf(BEGIN);
    const b = existing.indexOf(END);
    const merged =
      a !== -1 && b > a
        ? existing.slice(0, a) + section + existing.slice(b + END.length)
        : `${existing.replace(/\n*$/, existing ? "\n\n" : "")}${section}\n`;

    // ---------- write ----------
    fs.mkdirSync(ctx.genDir, { recursive: true });
    fs.mkdirSync(ctx.figmaDir, { recursive: true });
    fs.writeFileSync(path.join(ctx.genDir, `${ctx.tag}.figma.ts`), ts);
    if (merged !== existing) fs.writeFileSync(mismatchPath, merged);
    if (translated !== text) {
      if (removed) fs.writeFileSync(`${translatePath}.bak`, text);
      fs.writeFileSync(translatePath, translated);
    }
    console.log(
      `${ctx.tag}: ${matched.length} icons mapped (${handMapped.length} by ${path.basename(translatePath)}), ${path.basename(translatePath)} ${!exists ? "created" : translated === text ? "unchanged" : "updated"} (+${added} / -${removed} rows${commented ? `, ${commented} prune-candidate comment${commented === 1 ? "" : "s"} to update` : ""}, ${tbd} TBD to fill in)`,
    );
  });
}
