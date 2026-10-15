// Writes <figmaDir>/<tag>.mismatch.md (what Figma and the code match on by name, and what they do not, before translate) deterministically: no AI, no network, no timestamps.
//
// Flags: [--check]
// Reads the same inputs as build-figma.mjs (CEM map, saved Figma snapshots, <tag>.translate.md) through binding-core.mjs, but binds with the name rules only (baseline), so the
// report is the gap before translate.md: a translate row never moves anything into PART 1, it only shows up as a note on the row it concerns. The translate file is still read and validated.
// It never overwrites an existing file: the generated parts sit between <!-- build-mismatch:begin ID --> and
// <!-- build-mismatch:end ID --> markers and a re-run replaces only those; anything outside them (hand-written notes) is kept.
// A file without markers is migrated once (see binding-rule.md, "The mismatch file").
//
// --check writes nothing; it exits 1 if the committed <tag>.mismatch.md differs from what would be written (use this in CI).
// Exit codes: 0 ok, 1 stale (--check only), 2 bad input or inconsistent translate file.
import fs from "node:fs";
import path from "node:path";
import { gaps, guard, loadComponent } from "./binding-core.mjs";

export function run(argv, runCtx) {
  return guard("build-mismatch", () => {
    // binds by name only and never reads the translate rows: this report runs before translate and build-translate derives its rows from it
    const ctx = loadComponent("build-mismatch", argv, runCtx, ["check"], {
      baseline: true,
      translateOptional: true,
    });
    const {
      args,
      fail,
      warnings,
      translatePath,
      cemMapPath,
      figmaDir,
      map,
      nodes,
      eligible,
      attrByNorm,
      props,
      bound,
      stateBlocks,
      norm,
    } = ctx;

    // ---------- <tag>.mismatch.md ----------
    // Generated parts sit between <!-- build-mismatch:begin ID --> and <!-- build-mismatch:end ID --> markers. A re-run replaces only
    // what is between the markers; anything outside them (hand-written notes) is kept. A file without markers (written by hand
    // or by the retired gen-from-cem.mjs) is migrated once: its PART 1 / PART 2 / intro are wrapped in markers, and hand-written prose and any section under
    // a heading this script does not generate are kept. The original is saved as <file>.bak.
    // with more than one Figma component set, Figma property names are prefixed with the set's name
    const setName = (nodeId) => nodes.find((n) => n.nodeId === nodeId).doc.name;
    const fig = (nodeId, name) =>
      nodes.length > 1 ? `${setName(nodeId)} / ${name}` : name;
    const flagsOf = (a) =>
      [
        a.deprecated && "deprecated",
        a.privacy !== "public" && a.privacy,
        a.inheritedFrom && `inherited from ${a.inheritedFrom}`,
      ]
        .filter(Boolean)
        .join(", ");
    const fmtValues = (a) =>
      a.values ? a.values.map((v) => `\`${v}\``).join(", ") : a.kind;
    const list = (vs) => vs.map((v) => `\`${v}\``).join(", ");
    const {
      enumBound,
      coveredValues,
      addressedAttrs,
      unAttrs,
      excluded,
      notBound,
      unSlots,
      boundFigma,
      unFigma,
      unOptions,
    } = gaps(ctx);
    const design = ctx.ctx.designAttributes
      ? new Set(ctx.ctx.designAttributes.map(norm))
      : null;
    const common = new Set((ctx.ctx.commonDesignAttributes ?? []).map(norm));
    for (const d of ctx.ctx.designAttributes ?? [])
      if (
        !common.has(norm(d)) &&
        !map.attributes.some((a) => norm(a.name) === norm(d))
      )
        warnings.push(
          `design-related attribute "${d}" is not in the CEM of ${map.tag}; remove it from the config`,
        );
    const isDesign = (a) => !design || design.has(norm(a.name));
    const designAttrs = unAttrs.filter(isDesign);
    const functionAttrs = unAttrs.filter((a) => !isDesign(a));
    const attrGapRows = (as) =>
      as.map(
        (a) =>
          `| \`${a.name}\` | ${fmtValues(a)} | ${a.default ?? ""} | ${flagsOf(a)} |`,
      );

    const attrRows = [
      ...enumBound.map((x) => {
        const a = attrByNorm.get(norm(x.attr));
        const un = (a.values || []).filter(
          (v) => !coveredValues.get(a.name).has(v),
        );
        const p = props.find(
          (p) => p.nodeId === x.nodeId && norm(p.name) === norm(x.figma),
        );
        const missing = p.variantOptions.filter((o) => !(o in x.pairs));
        const pairs =
          Object.entries(x.pairs)
            .map(([o, v]) => `${o} = \`${v}\``)
            .join(", ") +
          (missing.length
            ? ` (${missing.join(", ")} emit${missing.length === 1 ? "s" : ""} nothing)`
            : "");
        return `| \`${a.name}\` | Figma **${fig(x.nodeId, x.figma)}** (variant) | ${pairs} | ${un.length ? list(un) : "_none_"} | ${flagsOf(a)} |`;
      }),
      ...bound
        .filter((x) => x.kind === "boolean")
        .map((x) => {
          const a = attrByNorm.get(norm(x.attr));
          return `| \`${a.name}\` | Figma **${fig(x.nodeId, x.figma)}** (boolean) | true = \`${a.name}\` | n/a | ${flagsOf(a)} |`;
        }),
      ...stateBlocks
        .filter((b) => b.attr)
        .map((b) => {
          const a = attrByNorm.get(norm(b.attr));
          return `| \`${a.name}\` | Figma **${fig(b.nodeId, b.prop)}** = ${b.option} (own block) | bare \`${a.name}\` attribute | n/a | ${flagsOf(a)} |`;
        }),
    ];
    const slotRows = bound
      .filter((x) => x.kind === "slot")
      .map(
        (x) =>
          `| \`${x.slot}\` | Figma **${fig(x.nodeId, x.figma)}** (text) | \`<span slot="${x.slot}">\` |`,
      );
    const enumGaps = [...coveredValues].flatMap(([attr, cov]) => {
      const a = attrByNorm.get(norm(attr));
      const un = (a.values || []).filter((v) => !cov.has(v));
      if (!un.length) return [];
      const figma = enumBound.find((x) => x.attr === attr).figma;
      return [`- \`${attr}\`: ${list(un)} (no Figma \`${figma}\` option)`];
    });
    const stateBlockLines = stateBlocks.map(
      (b) =>
        `- ${nodes.length > 1 ? `**${setName(b.nodeId)}**: ` : ""}\`variant: { '${b.prop}': '${b.option}' }\`${b.attr ? ` + bare \`${b.attr}\`` : " (baseline, no added attribute)"}`,
    );

    const noFigma = nodes.length === 0;
    const gapSummary = `${design ? `Design-related code attributes with no Figma counterpart: **${designAttrs.length} of ${eligible.filter(isDesign).length}**; functionality-related ones are listed separately in PART 3 (${functionAttrs.length} of ${eligible.length - eligible.filter(isDesign).length})` : `Code attributes with no Figma counterpart: **${unAttrs.length} of ${eligible.length}**`} (${excluded.length} more excluded as deprecated or private${ctx.categorized ? `, ${notBound.length} more not bound because their category is not ui and they are not design-related` : ""}).`;
    const mdBlocks = {
      summary: [
        noFigma
          ? `# ${map.tag} — what is not addressed (no Figma component yet)`
          : `# ${map.tag} — what matches by name and what does not, before translate`,
        "",
        noFigma
          ? `Sources: CEM from \`origin/main\` (${path.basename(cemMapPath)}). There is no Figma component for ${map.tag} yet, so nothing can be bound and no \`${map.tag}.figma.ts\` is generated. This report lists every code attribute and slot that Figma will need to cover. Scope: attributes and slots only.`
          : `Sources: CEM from \`origin/main\` (${path.basename(cemMapPath)}) and Figma component set${nodes.length > 1 ? "s" : ""} ${nodes.map((n) => `**${n.doc.name}** (node ${n.nodeId})`).join(", ")}. Pairing: exact name equality after lowercasing and trimming, and nothing else. This is the gap before \`${path.basename(translatePath)}\`: nothing from that file is applied or noted here, and every item in PART 2 and PART 3 gets a row in it. Scope: attributes and slots only.`,
        "",
        noFigma
          ? gapSummary
          : `Matched by name: ${boundFigma.size} of ${props.length} Figma properties (${props
              .filter((p) => boundFigma.has(`${p.nodeId}|${norm(p.name)}`))
              .map((p) => `\`${p.name}\``)
              .join(
                ", ",
              )}), with ${stateBlocks.filter((b) => b.attr).length} extra state block${stateBlocks.filter((b) => b.attr).length === 1 ? "" : "s"}. ${gapSummary} Figma properties with no code counterpart: **${unFigma.length} of ${props.length}**.`,
      ],
      addressed: [
        noFigma
          ? "# PART 1 — Matched"
          : "# PART 1 — Matched by name (before translate)",
        "",
        `${addressedAttrs.size} of ${eligible.length} bindable attributes (${eligible.length + excluded.length + notBound.length} in the CEM; ${excluded.length} deprecated or private excluded${ctx.categorized ? `; ${notBound.length} not ui and not design-related left out` : ""}) and ${slotRows.length} of ${map.slots.length} slots match a Figma property by name. An attribute can appear more than once if more than one Figma property matches it.`,
        "",
        "### Attributes",
        "",
        ...(attrRows.length
          ? [
              "| attribute | matched to | Figma option -> code value | code values NOT covered | flags |",
              "|---|---|---|---|---|",
              ...attrRows,
            ]
          : ["_none_"]),
        "",
        "### Slots",
        "",
        ...(slotRows.length
          ? ["| slot | bound to | written as |", "|---|---|---|", ...slotRows]
          : ["_none_"]),
        "",
        "### Figma blocks (name matches only)",
        "",
        ...(noFigma
          ? [
              "- none: no Figma component, so no `figma.connect` block is emitted",
            ]
          : stateBlockLines.length
            ? stateBlockLines
            : ["- single block, no variant restriction"]),
        "",
        noFigma
          ? ""
          : nodes.length > 1
            ? "Every block of a component set also carries that set's non-state matches above."
            : `Every block also carries the ${bound.length} non-state match${bound.length === 1 ? "" : "es"} above.`,
      ],
      "not-addressed": [
        noFigma
          ? "# PART 2 — NOT addressed"
          : "# PART 2 — NOT matched by name (before translate)",
        "",
        noFigma
          ? "Everything below is missing in Figma: there is no Figma component for this element yet."
          : `Everything below has no Figma counterpart with an equal name. Each item has a row in \`${path.basename(translatePath)}\` (mapped, \`n/a\` or \`TBD\`); build-translate adds the missing ones.`,
        "",
        `## ${design ? "Design-related code attributes" : "Code attributes"} with no Figma counterpart`,
        "",
        ...(designAttrs.length
          ? [
              "| attribute | kind / values | default | flags |",
              "|---|---|---|---|",
              ...attrGapRows(designAttrs),
            ]
          : ["_none_"]),
        "",
        "## Code attributes excluded by rule (deprecated or private)",
        "",
        ...(excluded.length
          ? [
              "| attribute | kind / values | flags |",
              "|---|---|---|",
              ...excluded.map(
                (a) => `| \`${a.name}\` | ${fmtValues(a)} | ${flagsOf(a)} |`,
              ),
            ]
          : ["_none_"]),
        "",
        ...(ctx.categorized
          ? [
              "## Code attributes not bound (category is not ui and not design-related)",
              "",
              ...(notBound.length
                ? [
                    "| attribute | category | kind / values | flags |",
                    "|---|---|---|---|",
                    ...notBound.map(
                      (a) =>
                        `| \`${a.name}\` | ${a.category ?? ""} | ${fmtValues(a)} | ${flagsOf(a)} |`,
                    ),
                  ]
                : ["_none_"]),
              "",
            ]
          : []),
        "## Code slots with no Figma counterpart",
        "",
        ...(unSlots.length
          ? unSlots.map((s) => `- \`${s.name}\``)
          : ["_none_"]),
        "",
        "## Code enum values with no Figma counterpart (on paired properties)",
        "",
        ...(enumGaps.length ? enumGaps : ["_none_"]),
        "",
        "## Figma properties with no code counterpart",
        "",
        ...(unFigma.length
          ? [
              "| Figma property | type | options / default | why |",
              "|---|---|---|---|",
              ...unFigma.map(
                (p) =>
                  `| ${fig(p.nodeId, p.name)} | ${p.type} | ${p.type === "VARIANT" ? `${p.variantOptions.join(", ")} (default ${p.defaultValue})` : p.type === "SLOT" ? "" : p.defaultValue} | no CEM attribute or slot with this name |`,
              ),
            ]
          : ["_none_"]),
        "",
        "## Figma variant options with no code counterpart (all variant properties)",
        "",
        ...(unOptions.length
          ? unOptions.map(({ p, o }) => `- ${fig(p.nodeId, p.name)} = ${o}`)
          : ["_none_"]),
      ],
      ...(design
        ? {
            functionality: [
              noFigma
                ? "# PART 3 — Functionality-related, NOT addressed"
                : "# PART 3 — Functionality-related, NOT matched by name (before translate)",
              "",
              "Not design-related: these do not change how the component looks or a state shown in Figma (behaviour, accessibility, form, validation, browser hints). They are not part of the 100% design target.",
              "",
              ...(functionAttrs.length
                ? [
                    "| attribute | kind / values | default | flags |",
                    "|---|---|---|---|",
                    ...attrGapRows(functionAttrs),
                  ]
                : ["_none_"]),
            ],
          }
        : {}),
    };
    const mark = (id, lines) =>
      `<!-- build-mismatch:begin ${id} -->\n${lines.join("\n")}\n<!-- build-mismatch:end ${id} -->`;
    const markerRe = (id) =>
      new RegExp(
        `<!-- build-mismatch:begin ${id} -->[\\s\\S]*?<!-- build-mismatch:end ${id} -->`,
      );
    const generated = Object.fromEntries(
      Object.entries(mdBlocks).map(([id, lines]) => [id, mark(id, lines)]),
    );

    const mismatchFile = path.join(figmaDir, `${map.tag}.mismatch.md`);
    const existingMd = fs.existsSync(mismatchFile)
      ? fs.readFileSync(mismatchFile, "utf8")
      : null;
    let mergedMd;
    let mdNote;
    if (existingMd === null) {
      mergedMd = `${Object.values(generated).join("\n\n")}\n`;
      mdNote = "new";
    } else if (/<!-- build-mismatch:begin /.test(existingMd)) {
      mergedMd = existingMd;
      mdNote = "merged";
      for (const [id, text] of Object.entries(generated)) {
        if (markerRe(id).test(mergedMd))
          mergedMd = mergedMd.replace(markerRe(id), () => text);
        else {
          mergedMd = `${mergedMd.replace(/\n*$/, "\n\n") + text}\n`;
          warnings.push(
            `${path.basename(mismatchFile)} had no "${id}" block; appended it`,
          );
        }
      }
    } else {
      const lines = existingMd.split("\n");
      const p1 = lines.findIndex((l) => /^# PART 1\b/.test(l));
      const p2 = lines.findIndex((l) => /^# PART 2\b/.test(l));
      if (p1 < 0 || p2 < p1)
        fail(
          `${mismatchFile} has no markers and no "# PART 1" / "# PART 2" headings, so it cannot be migrated. Move it aside or add the markers by hand`,
        );
      const generatedProse =
        /^(Sources:|Bound in |Matched by name|Everything below|\d+ of \d+ bindable attributes|_none_$|- State =|Every block also)/;
      const knownHeading =
        /^(# (auro-\S+ — |PART [123]\b)|#{2,3} (Attributes|Slots|Figma blocks|Code attributes|Code slots|Code enum values|Figma properties|Figma variant options)\b)/;
      const handWritten = (ls) => {
        const out = [];
        let own = false; // own: inside a section whose heading is not one of ours; kept whole (tables, bullets, blank lines)
        for (const l of ls) {
          if (/^#{1,6}\s/.test(l)) own = !knownHeading.test(l);
          if (
            own ||
            (l.trim() && !/^(\||- |#)/.test(l) && !generatedProse.test(l))
          )
            out.push(l);
        }
        while (out.at(-1)?.trim() === "") out.pop();
        return out;
      };
      const regions = {
        summary: lines.slice(0, p1),
        addressed: lines.slice(p1, p2),
        "not-addressed": lines.slice(p2),
      };
      let kept = 0;
      mergedMd = `${Object.entries(regions)
        .map(([id, ls]) => {
          const h = handWritten(ls);
          kept += h.filter((l) => l.trim()).length;
          return [generated[id], ...(h.length ? ["", ...h] : [])].join("\n");
        })
        .concat(generated.functionality ?? [])
        .join("\n\n")}\n`;
      mdNote = `migrated, kept ${kept} hand-written line${kept === 1 ? "" : "s"}`;
    }

    for (const w of warnings) console.error(`build-mismatch: warning: ${w}`);
    if (args.check) {
      if (existingMd === mergedMd) {
        console.log(`${map.tag}: ${mismatchFile} is up to date`);
        return 0;
      }
      console.error(
        `${map.tag}: ${mismatchFile} is ${existingMd === null ? "missing" : "stale"}. Run \`auro docs --cem\` and commit the result.`,
      );
      return 1;
    }
    fs.mkdirSync(figmaDir, { recursive: true });
    const migrated = mdNote.startsWith("migrated");
    if (migrated) fs.writeFileSync(`${mismatchFile}.bak`, existingMd);
    if (existingMd !== mergedMd) fs.writeFileSync(mismatchFile, mergedMd);
    console.log(
      `${map.tag}: ${path.basename(mismatchFile)} ${existingMd === mergedMd ? "unchanged" : `written (${mdNote}${migrated ? `; original saved as ${path.basename(mismatchFile)}.bak` : ""})`}`,
    );
  });
}
