// Writes/updates a placeholder <figmaDir>/<tag>.translate.md deterministically (no AI, no network, no timestamps).
// It lists every gap left by the name-match rules (the same gaps build-mismatch.mjs reports in Part 2) as a `TBD` row for a human to fill in.
//
// Flags: [--check] [--prune]
//
// Merge only: an existing file is never overwritten. Rows already present (matched by their first two cells) are left exactly as they are,
// including TBD / n/a / filled-in translations and notes. Only rows that are missing are appended to the end of their table; a missing
// table is added. Nothing is reordered.
// A row that no longer matches a gap (the Figma option, code value or attribute is gone, or the name-match rules now cover it) is a prune
// candidate. By default it is kept and an HTML comment saying why is added to its Notes cell (and removed again if it stops being a candidate).
// --prune removes the candidates whose Figma option, code value or attribute is gone (and any table left with no rows), keeping the original
// file as <translate file>.bak. A row the name-match rules merely cover now may be an intentional override, so it is kept (and commented).
// A literal "|" in a cell is written "\|".
// A "## Source" table in an older file is left alone and ignored. The Figma component sets come from the config, and their data
// must already be saved by fetch-figma.mjs. With several component sets, a row is a placeholder when any of them leaves that option unaddressed.
// --check writes nothing; exits 1 if the file is missing or rows would be added or removed.   Exit codes: 0 ok, 1 stale (--check only), 2 bad input.
import fs from "node:fs";
import path from "node:path";
import {
  escCell,
  gaps,
  guard,
  loadComponent,
  splitRow,
} from "./binding-core.mjs";

export function run(argv, runCtx) {
  return guard("build-translate", () => {
    const ctx = loadComponent(
      "build-translate",
      argv,
      runCtx,
      ["check", "prune"],
      { baseline: true, translateOptional: true },
    );
    const { args, tag, norm, translatePath, attrByNorm, props, mappedSlots } =
      ctx;
    const { coveredValues, unAttrs, unOptions, unSlots, unFigma } = gaps(ctx);
    const slotNames = new Set(ctx.map.slots.map((s) => norm(s.name)));

    const unq = (c) => c.trim().replace(/^`|`$/g, "");
    const SECTIONS = {
      forward: {
        re: /^##\s+Figma variant options\b/i,
        title: "## Figma variant options -> code",
        head: [
          "| Figma property | Figma option | Translation (attribute = value) | Notes |",
          "|---|---|---|---|",
        ],
        key: (c) => `${norm(c[0])}|${c[1]}`,
      },
      values: {
        re: /^##\s+Code enum values\b/i,
        title: "## Code enum values on paired attributes -> Figma",
        head: [
          "| Attribute | Code value | Translation (Figma property = option) | Notes |",
          "|---|---|---|---|",
        ],
        key: (c) => `${unq(c[0])}|${unq(c[1])}`,
      },
      attrs: {
        re: /^##\s+Code (?:enum )?attributes\b/i,
        title: "## Code attributes with no Figma counterpart -> Figma",
        head: [
          "| Attribute | Code value | Translation (Figma property = option) | Notes |",
          "|---|---|---|---|",
        ],
        key: (c) => `${unq(c[0])}|${unq(c[1])}`,
      },
      slots: {
        re: /^##\s+Code slots\b/i,
        title: "## Code slots with no Figma counterpart -> Figma",
        cols: 3,
        head: [
          "| Slot | Translation (n/a; a slot a Figma text property maps to is in the text table) | Notes |",
          "|---|---|---|",
        ],
        key: (c) => unq(c[0]),
      },
      text: {
        re: /^##\s+Figma text properties\b/i,
        title: "## Figma text properties -> slots",
        cols: 3,
        head: [
          "| Figma property | Slot (or n/a) | Notes |",
          "|---|---|---|",
        ],
        key: (c) => norm(c[0]),
      },
      other: {
        re: /^##\s+Figma boolean\b/i,
        title: "## Figma boolean and instance properties -> code",
        cols: 3,
        head: [
          "| Figma property | Translation (n/a for now) | Notes |",
          "|---|---|---|",
        ],
        key: (c) => norm(c[0]),
      },
    };

    // ---------- the placeholder rows ----------
    const rows = {
      forward: [],
      values: [],
      attrs: [],
      slots: [],
      text: [],
      other: [],
    };
    const add = (sec, cells, key) =>
      rows[sec].push({ key, line: `| ${cells.join(" | ")} |` });
    for (const { p, o } of unOptions)
      if (!rows.forward.some((r) => r.key === `${norm(p.name)}|${o}`))
        add(
          "forward",
          [escCell(p.name), escCell(o), "TBD", ""],
          `${norm(p.name)}|${o}`,
        );
    for (const [attr, covered] of coveredValues)
      for (const v of attrByNorm.get(norm(attr)).values)
        if (!covered.has(v))
          add(
            "values",
            [`\`${attr}\``, `\`${escCell(v)}\``, "TBD", ""],
            `${attr}|${v}`,
          );
    // every attribute with no Figma counterpart: one row per enum value, or one row for a boolean ("true") or any other kind ("(any)")
    for (const a of unAttrs)
      for (const v of a.kind === "enum"
        ? a.values
        : [a.kind === "boolean" ? "true" : "(any)"])
        add(
          "attrs",
          [`\`${a.name}\``, `\`${escCell(v)}\``, "TBD", ""],
          `${a.name}|${v}`,
        );
    for (const s of unSlots)
      if (!mappedSlots.has(norm(s.name)))
        add("slots", [`\`${escCell(s.name)}\``, "TBD", ""], s.name);
    for (const p of unFigma)
      if (p.type !== "VARIANT")
        add(
          p.type === "TEXT" ? "text" : "other",
          [escCell(p.name), "TBD", ""],
          norm(p.name),
        );

    // ---------- merge ----------
    const exists = fs.existsSync(translatePath);
    const text = exists ? fs.readFileSync(translatePath, "utf8") : "";
    const lines = exists
      ? text.replace(/\n$/, "").split("\n")
      : [
          `# ${tag} — translation of unaddressed options (placeholder)`,
          "",
          'Judgement-based translations, not name-matched ones, so none of this is bound yet. Replace each `TBD` with `attr="value"` (forward table) or `Property = Option` (reverse tables), or `n/a` if there is no code equivalent. Items marked **verify** are lower confidence and should be checked against the design or the component source before binding. Rows are generated by `build-translate.mjs`, which only adds missing rows and never edits existing ones (it only comments rows that look obsolete; `--prune` removes those whose target is gone).',
        ];
    const isData = (c) =>
      !c.every((x) => /^:?-+:?$/.test(x)) &&
      !["Figma property", "Attribute", "Setting"].includes(c[0]);
    const cellsOf = splitRow;
    let added = 0;
    let removed = 0;
    const stale = [];
    const pruned = [];
    let commented = 0;
    const prune = !!args.prune;

    // prune-candidate comment, kept inside the Notes cell so the row keeps its shape
    const MARK = / <!-- build-translate: prune candidate.*?-->/;
    const markOf = (reason) =>
      ` <!-- build-translate: prune candidate: ${reason} -->`;
    const unmark = (l) => l.replace(MARK, "");
    const mark = (line, reason, cols = 4) => {
      const l = unmark(line);
      const n = cellsOf(l).length;
      return n < cols
        ? `${l}${" |".repeat(cols - 1 - n)}${markOf(reason)} |`
        : l.replace(/(\s*\|\s*)$/, `${markOf(reason)}$1`);
    };
    const codeValue = (c) => {
      const a = attrByNorm.get(norm(unq(c[0])));
      return a?.kind === "enum" && a.values.includes(unq(c[1]));
    };
    const attrValue = (c) => {
      const a = attrByNorm.get(norm(unq(c[0])));
      return a?.kind === "enum" ? a.values.includes(unq(c[1])) : !!a;
    };
    const figmaProp = (c, text) =>
      props.some(
        (p) => (p.type === "TEXT") === text && p.type !== "VARIANT" && norm(p.name) === norm(c[0]),
      );
    const gone = {
      forward: (c) =>
        !props.some(
          (p) =>
            p.type === "VARIANT" &&
            norm(p.name) === norm(c[0]) &&
            p.variantOptions.includes(c[1]),
        ),
      values: (c) => !codeValue(c),
      attrs: (c) => !attrValue(c),
      slots: (c) => !slotNames.has(norm(unq(c[0]))),
      text: (c) => !figmaProp(c, true),
      other: (c) => !figmaProp(c, false),
    };
    const reasonOf = (name, c) =>
      gone[name](c)
        ? name === "forward" || name === "text" || name === "other"
          ? "the Figma property or option no longer exists"
          : name === "slots"
            ? "the code slot no longer exists"
            : "the code attribute or value no longer exists, or is deprecated or private"
        : "the name-match rules now cover this, so it is no longer a gap (keep it if it is an intentional override of that match)";

    for (const [name, sec] of Object.entries(SECTIONS)) {
      const h = lines.findIndex((l) => sec.re.test(l));
      const block = (missing) => [
        sec.title,
        "",
        ...(sec.preface ? [sec.preface, ""] : []),
        ...sec.head,
        ...missing.map((r) => r.line),
      ];
      if (h < 0) {
        if (!rows[name].length) continue;
        added += rows[name].length;
        if (lines.at(-1) !== "") lines.push("");
        lines.push(...block(rows[name]));
        continue;
      }
      const scan = () => {
        let e = lines.findIndex((l, i) => i > h && /^##\s/.test(l));
        if (e < 0) e = lines.length;
        const tableIdx = [];
        for (let i = h + 1; i < e; i++)
          if (lines[i].startsWith("|")) tableIdx.push(i);
        return {
          e,
          tableIdx,
          data: tableIdx.filter((i) => isData(cellsOf(lines[i]))),
        };
      };
      const want = new Set(rows[name].map((r) => r.key));
      let { e, tableIdx, data } = scan();
      {
        const dead = data.filter((i) => !want.has(sec.key(cellsOf(lines[i]))));
        const removable = [];
        for (const i of dead) {
          const c = cellsOf(lines[i]);
          const k = sec.key(c).replace("|", " / ");
          const why = reasonOf(name, c);
          const isGone = gone[name](c);
          if (prune && isGone) {
            removable.push(i);
            pruned.push(
              `${path.basename(translatePath)}: removed "${k}" from "${sec.title}" (${why})`,
            );
            continue;
          }
          stale.push(
            `${path.basename(translatePath)}: "${k}" in "${sec.title}" is a prune candidate: ${why} (kept; ${isGone ? "--prune removes it" : "--prune keeps it, it may be an intentional override"})`,
          );
          const l = mark(lines[i], why, sec.cols);
          if (l !== lines[i]) {
            lines[i] = l;
            commented++;
          }
        }
        for (const i of data)
          if (!dead.includes(i) && MARK.test(lines[i])) {
            lines[i] = unmark(lines[i]);
            commented++;
          }
        if (removable.length) {
          for (const i of removable.reverse()) lines.splice(i, 1);
          removed += removable.length;
          ({ e, tableIdx, data } = scan());
        }
      }
      const have = new Set(data.map((i) => sec.key(cellsOf(lines[i]))));
      const missing = rows[name].filter((r) => !have.has(r.key));
      if (
        !missing.length &&
        !data.length &&
        lines.slice(h + 1, e).every((l) => l.trim() === "" || l.startsWith("|"))
      ) {
        lines.splice(h, e - h);
        while (lines.at(-1) === "") lines.pop();
        continue;
      }
      if (!missing.length) continue;
      added += missing.length;
      if (tableIdx.length)
        lines.splice(tableIdx.at(-1) + 1, 0, ...missing.map((r) => r.line));
      else
        lines.splice(h + 1, 0, "", ...sec.head, ...missing.map((r) => r.line));
    }

    // ---------- write ----------
    const result = `${lines.join("\n")}\n`;
    for (const w of stale) console.error(`build-translate: warning: ${w}`);
    if (!args.check) {
      for (const w of pruned) console.error(`build-translate: ${w}`);
    }
    const tbd = lines.filter((l) => /^\|.*\|\s*TBD\s*\|/.test(l)).length;
    if (args.check) {
      if (exists && result === text) {
        console.log(`${tag}: ${translatePath} is up to date`);
        return 0;
      }
      console.error(
        `${tag}: ${translatePath} is ${exists ? `out of date (+${added} / -${removed} rows${commented ? `, ${commented} prune-candidate comment${commented === 1 ? "" : "s"} to update` : ""})` : "missing"}. Run \`auro docs --figma\` and commit the result.`,
      );
      return 1;
    }
    if (result !== text) {
      fs.mkdirSync(path.dirname(translatePath), { recursive: true });
      if (removed) fs.writeFileSync(`${translatePath}.bak`, text);
      fs.writeFileSync(translatePath, result);
    }
    const candidates = lines.filter((l) => MARK.test(l)).length;
    console.log(
      `${tag}: ${path.basename(translatePath)} ${!exists ? "created" : result === text ? "unchanged" : "updated"} (+${added} / -${removed} rows, ${tbd} TBD to fill in${candidates ? `, ${candidates} prune candidate${candidates === 1 ? "" : "s"} (see the comments in the file; --prune removes the ones whose target is gone)` : ""}${removed ? `; original saved as ${path.basename(translatePath)}.bak` : ""})`,
    );
  });
}
