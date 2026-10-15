// Shared by the Code Connect build scripts: reads the flags from argv and the paths from ctx, loads the CEM map, the saved Figma
// snapshots (one per Figma component set listed in ctx.figmaNodes) and <tag>.translate.md, validates them, and works out the bindings (rules in binding-rule.md).
// No output is written here.
//
// ctx: { tag, figmaDir, snapshotDir, genDir, sourceDir, cemPath, modulePrefix? }
//   figmaDir     committed: <tag>.translate.md, <tag>.mismatch.md
//   snapshotDir  committed: the saved Figma data, <node-id>.json
//   genDir       generated, not committed: <tag>.cem-map.json, <tag>.figma.ts
//   sourceDir    where package.json and CHANGELOG.md of the released code are read
//   cemPath      custom-elements.json; modulePrefix limits it to one component's modules in a monorepo
import fs from "node:fs";
import path from "node:path";

// Thrown instead of process.exit so the scripts can run in-process. 0 ok, 1 stale (--check only), 2 bad input.
export class ExitError extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

// Runs a script body and turns every outcome into an exit code. An unexpected throw must not become 1, which means "stale" under --check.
export async function guard(scriptName, body) {
  try {
    return (await body()) ?? 0;
  } catch (e) {
    if (e instanceof ExitError) return e.code;
    console.error(`${scriptName}: unexpected error: ${e.stack ?? e}`);
    return 2;
  }
}

// translate.md table cells: a literal "|" inside a cell is written "\|"
export const splitRow = (l) =>
  l
    .trim()
    .replace(/^\||(?<!\\)\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((s) => s.trim().replace(/\\\|/g, "|"));
export const escCell = (s) => String(s).replace(/\|/g, "\\|");

// opts.baseline: ignore the translate tables (name-match rules only). opts.translateOptional: a missing translate file is treated as empty.
// ctx.noFigma: the component has no Figma component set yet; only the code side is reported (a missing translate file is fine, no Figma properties exist).
// opts.sourceOnly: stop once the Figma node URLs are resolved (used by fetch-figma.mjs, which runs before any snapshot exists).
export function loadComponent(
  scriptName,
  argv,
  ctx,
  flagsWithoutValue = [],
  opts = {},
) {
  const fail = (msg) => {
    console.error(`${scriptName}: ${msg}`);
    throw new ExitError(2);
  };
  // ---------- args ----------
  const args = { _: [] };
  {
    const a = argv;
    for (let i = 0; i < a.length; i++) {
      if (!a[i].startsWith("--")) {
        args._.push(a[i]);
        continue;
      }
      const k = a[i].slice(2);
      if (flagsWithoutValue.includes(k)) args[k] = true;
      else if (a[i + 1] === undefined) fail(`--${k} needs a value`);
      else args[k] = a[++i];
    }
  }
  if (args._.length) fail(`unexpected argument: ${args._[0]}`);
  const { tag, figmaDir, genDir } = ctx;

  const norm = (s) =>
    String(s)
      .replace(/#\d+:\d+$/, "")
      .trim()
      .toLowerCase();
  const display = (k) => k.replace(/#\d+:\d+$/, "");
  const q = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  const readText = (p) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch (e) {
      fail(`cannot read ${p}: ${e.message}`);
    }
  };
  const readJson = (p) => {
    try {
      return JSON.parse(readText(p));
    } catch (e) {
      fail(`cannot parse ${p}: ${e.message}`);
    }
  };

  const errors = [];
  const warnings = [];

  // ---------- translate.md ----------
  // A "## Source" table left over from older translate files is ignored: the Figma URLs come from ctx.figmaNodes and the source dir from ctx.
  // Forward table (Figma property | Figma option | Translation `attr="value"` | Notes) is the source of mappings.
  // The two reverse tables (code attribute | code value | Translation `Property = Option` | Notes) are only checked for consistency.
  const translatePath = path.join(figmaDir, `${tag}.translate.md`);
  const forward = []; // {prop, option, attr?, value?}
  const reverse = []; // {attr, value, prop?, option?}
  const text = []; // {prop, slot?, note?, where}: a Figma TEXT property written to a code slot, or n/a
  const tbdForward = new Set();
  const tbdReverse = new Set();
  const slotRows = []; // {slot, prop?, note, where}: a code slot with no Figma TEXT property of the same name: the Figma TEXT property it maps to, or n/a
  const other = []; // {prop, note, where}: a Figma BOOLEAN / INSTANCE_SWAP / SLOT property with no code counterpart, written n/a (nothing else can be bound yet)
  const tbdSlots = new Set();
  const tbdOther = new Set();
  {
    let section = null;
    const unq = (c) => c.trim().replace(/^`|`$/g, "");
    ((opts.translateOptional || ctx.noFigma) && !fs.existsSync(translatePath)
      ? ""
      : readText(translatePath)
    )
      .split("\n")
      .forEach((line, i) => {
        const h = line.match(/^##\s+(.*)$/);
        if (h) {
          section = /^Figma text properties\b/i.test(h[1])
            ? "text"
            : /^Figma (?:boolean|other)\b/i.test(h[1])
              ? "other"
              : /^Code slots\b/i.test(h[1])
                ? "slots"
                : h[1].includes("-> code")
                  ? "forward"
                  : h[1].includes("-> Figma")
                    ? "reverse"
                    : null;
          return;
        }
        if (!section || !line.startsWith("|")) return;
        const cells = splitRow(line);
        if (
          cells.every((c) => /^:?-+:?$/.test(c)) ||
          ["Figma property", "Attribute", "Setting", "Slot"].includes(cells[0])
        )
          return;
        const where = `${path.basename(translatePath)}:${i + 1}`;
        if (section === "other" || section === "slots") {
          const tr = unq(cells[1] ?? "");
          const note = (cells[2] ?? "")
            .replace(/\s*<!--.*?-->\s*/g, " ")
            .trim();
          const name = unq(cells[0]);
          if (/^TBD\b/i.test(tr)) {
            warnings.push(`${where}: TBD translation left unmapped`);
            (section === "other" ? tbdOther : tbdSlots).add(name);
          } else if (section === "other") {
            if (/^n\/a\b/i.test(tr)) other.push({ prop: name, note, where });
            else
              errors.push(
                `${where}: unrecognised translation ${cells[1]} (a Figma boolean or instance property can only be n/a for now)`,
              );
          } else
            slotRows.push({
              slot: name,
              prop: /^n\/a\b/i.test(tr) ? undefined : tr,
              note,
              where,
            });
          return;
        }
        if (section === "text") {
          const tr = unq(cells[1] ?? "");
          const note = (cells[2] ?? "")
            .replace(/\s*<!--.*?-->\s*/g, " ")
            .trim();
          if (/^n\/a\b/i.test(tr)) text.push({ prop: cells[0], note, where });
          else if (/^TBD\b/i.test(tr))
            warnings.push(`${where}: TBD translation left unmapped`);
          else if (/^[\w.-]+$/.test(tr))
            text.push({ prop: cells[0], slot: tr, note, where });
          else
            errors.push(
              `${where}: unrecognised translation ${cells[1]} (expected a slot name or n/a)`,
            );
          return;
        }
        const t = cells[2] ?? "";
        const note = (cells[3] ?? "").replace(/\s*<!--.*?-->\s*/g, " ").trim(); // build-translate's prune-candidate comments are not part of the note
        if (/^n\/a\b/i.test(t)) {
          section === "forward"
            ? forward.push({ prop: cells[0], option: cells[1], note, where })
            : reverse.push({
                attr: unq(cells[0]),
                value: unq(cells[1]),
                note,
                where,
              });
          return;
        }
        if (/^TBD\b/i.test(t)) {
          warnings.push(`${where}: TBD translation left unmapped`);
          (section === "forward" ? tbdForward : tbdReverse).add(
            section === "forward"
              ? `${cells[0].toLowerCase()}|${cells[1]}`
              : `${unq(cells[0])}|${unq(cells[1])}`,
          );
          return;
        }
        if (section === "forward") {
          const m = t.match(/^`([\w-]+)="([^"]*)"`$/);
          if (!m) {
            errors.push(
              `${where}: unrecognised translation ${t} (expected \`attr="value"\` or n/a)`,
            );
            return;
          }
          forward.push({
            prop: cells[0],
            option: cells[1],
            attr: m[1],
            value: m[2],
            where,
          });
        } else {
          const m = unq(t).match(/^(.+?) = (.+)$/);
          if (!m) {
            errors.push(
              `${where}: unrecognised translation ${t} (expected \`Property = Option\` or n/a)`,
            );
            return;
          }
          reverse.push({
            attr: unq(cells[0]),
            value: unq(cells[1]),
            prop: m[1],
            option: m[2],
            where,
          });
        }
      });
  }
  // baseline keeps the format errors found while parsing (a row that cannot be read), but not the checks against the CEM and Figma:
  // a row that points at something that is gone is what build-translate reports as a prune candidate
  // slots a text row maps a Figma property to: they need no row of their own in the slots table
  const mappedSlots = new Set(
    text.filter((x) => x.slot).map((x) => norm(x.slot)),
  );
  if (opts.baseline) {
    forward.length = 0;
    reverse.length = 0;
    text.length = 0;
    slotRows.length = 0;
    other.length = 0;
    warnings.length = 0;
    tbdForward.clear();
    tbdReverse.clear();
    tbdSlots.clear();
    tbdOther.clear();
  }
  const mappings = forward.filter((f) => f.attr);

  // ---------- resolve inputs ----------
  const { sourceDir, snapshotDir } = ctx;
  const cemMapPath = path.join(genDir, `${tag}.cem-map.json`);
  const packagePath = path.join(sourceDir, "package.json");
  const changelogPath = path.join(sourceDir, "CHANGELOG.md");
  // ctx.figmaNodes: one or more Figma URLs, each pointing at a component set (?node-id=), from the config. The saved REST data for each is <snapshotDir>/<node-id>.json (see fetch-figma.mjs).
  const parseNodeUrl = (raw) => {
    let u;
    try {
      u = new URL(raw);
    } catch {
      fail(`figma-nodes: not a URL: ${raw}`);
    }
    const dashed = u.searchParams.get("node-id");
    if (!dashed) fail(`figma-nodes: no node-id in ${raw}`);
    const m = u.pathname.match(
      /^\/(?:design|file)\/([^/]+)(?:\/branch\/([^/]+))?/,
    );
    if (!m)
      fail(
        `figma-nodes: expected a figma.com/design/<file key>/... URL, got ${raw}`,
      );
    return {
      base: u.origin + u.pathname,
      fileKey: m[2] ?? m[1],
      nodeId: dashed.replace(/-/g, ":"),
      dashed,
      snapshotPath: path.join(snapshotDir, `${dashed}.json`),
    };
  };
  if (!ctx.noFigma && !ctx.figmaNodes?.length)
    fail(
      `no Figma component set for ${tag}: it is not in the Figma connector config`,
    );
  const nodeRefs = (ctx.figmaNodes ?? []).map(parseNodeUrl);
  for (const r of nodeRefs)
    if (nodeRefs.filter((x) => x.nodeId === r.nodeId).length > 1)
      fail(`figma-nodes lists node ${r.nodeId} more than once`);
  if (opts.sourceOnly) return { args, tag, fail, nodeRefs };

  const map = readJson(cemMapPath);
  if (map.tag !== tag) fail(`${cemMapPath} is for ${map.tag}, expected ${tag}`);
  const nodes = nodeRefs.map((r) => {
    if (!fs.existsSync(r.snapshotPath))
      fail(
        `no saved Figma data for node ${r.nodeId}: ${r.snapshotPath} is missing. Run \`auro docs --cem\` and commit the result`,
      );
    const figmaJson = readJson(r.snapshotPath);
    const doc = figmaJson.nodes?.[r.nodeId]?.document;
    if (!doc) fail(`node ${r.nodeId} not found in ${r.snapshotPath}`);
    if (!doc.componentPropertyDefinitions)
      fail(
        `node ${r.nodeId} ("${doc.name}", ${doc.type}) in ${r.snapshotPath} has no componentPropertyDefinitions; expected a component set`,
      );
    return { ...r, figmaJson, doc };
  });

  const ignored = new Set((ctx.ignoredAttributes ?? []).map(norm));
  const bindable = map.attributes.filter(
    (a) =>
      !a.deprecated && a.privacy === "public" && !ignored.has(norm(a.name)),
  );
  // A CEM built with the logical CEM annotations puts a category on its attributes. Then only the ui ones and the design-related ones
  // from the config are bound; a CEM without categories keeps every bindable attribute.
  const categorized = map.attributes.some((a) => a.category);
  const designNames = new Set((ctx.designAttributes ?? []).map(norm));
  const inScope = (a) =>
    !categorized || a.category === "ui" || designNames.has(norm(a.name));
  const eligible = bindable.filter(inScope);
  const outOfScope = bindable.filter((a) => !inScope(a));
  const attrByNorm = new Map(eligible.map((a) => [norm(a.name), a]));
  const slotByNorm = new Map(map.slots.map((s) => [norm(s.name), s]));
  const props = nodes.flatMap((n) =>
    Object.entries(n.doc.componentPropertyDefinitions).map(([key, d]) => ({
      name: display(key),
      nodeId: n.nodeId,
      ...d,
    })),
  );
  const variantsByNorm = new Map();
  for (const p of props)
    if (p.type === "VARIANT")
      variantsByNorm.set(norm(p.name), [
        ...(variantsByNorm.get(norm(p.name)) ?? []),
        p,
      ]);

  // text rows: the Figma TEXT property and the slot must exist
  for (const x of text) {
    if (!props.some((p) => p.type === "TEXT" && norm(p.name) === norm(x.prop)))
      errors.push(`${x.where}: Figma text property "${x.prop}" not found`);
    if (x.slot && !slotByNorm.has(norm(x.slot)))
      errors.push(`${x.where}: slot "${x.slot}" is not a slot of ${tag}`);
  }
  for (const x of other)
    if (
      !props.some(
        (p) =>
          p.type !== "VARIANT" &&
          p.type !== "TEXT" &&
          norm(p.name) === norm(x.prop),
      )
    )
      errors.push(
        `${x.where}: Figma boolean or instance property "${x.prop}" not found`,
      );
  for (const x of slotRows) {
    if (!slotByNorm.has(norm(x.slot)))
      errors.push(`${x.where}: slot "${x.slot}" is not a slot of ${tag}`);
    else if (
      x.prop &&
      !text.some(
        (t) =>
          norm(t.prop) === norm(x.prop) && norm(t.slot ?? "") === norm(x.slot),
      )
    )
      errors.push(
        `${x.where}: slot "${x.slot}" -> ${x.prop}, but no row of the Figma text properties table maps ${x.prop} to it`,
      );
  }
  // validate forward mappings against the CEM map and Figma data
  // (n/a rows too: they must still name a real Figma property and option)
  const seen = new Set();
  for (const f of forward) {
    const ps = variantsByNorm.get(norm(f.prop));
    if (!ps)
      errors.push(`${f.where}: Figma variant property "${f.prop}" not found`);
    else if (!ps.some((p) => p.variantOptions.includes(f.option)))
      errors.push(`${f.where}: "${f.option}" is not an option of "${f.prop}"`);
    if (f.attr) {
      const a = attrByNorm.get(norm(f.attr));
      if (!a)
        errors.push(
          `${f.where}: attribute "${f.attr}" is not a bindable CEM attribute (missing, deprecated, private, or not ui and not design-related)`,
        );
      else if (a.kind === "enum" && !a.values.includes(f.value))
        errors.push(
          `${f.where}: "${f.value}" is not a value of ${f.attr} (${a.values.join(", ")})`,
        );
    }
    const id = `${norm(f.prop)}|${f.option}`;
    if (seen.has(id))
      errors.push(`${f.where}: ${f.prop} = ${f.option} is mapped twice`);
    seen.add(id);
  }
  // reverse tables must agree with the forward table
  for (const r of reverse) {
    const ra = attrByNorm.get(norm(r.attr));
    if (!ra)
      errors.push(
        `${r.where}: attribute "${r.attr}" is not a bindable CEM attribute (missing, deprecated, private, or not ui and not design-related)`,
      );
    else if (ra.kind === "enum" && !ra.values.includes(r.value))
      errors.push(
        `${r.where}: "${r.value}" is not a value of ${r.attr} (${ra.values.join(", ")})`,
      );
    const hit = mappings.find((f) => f.attr === r.attr && f.value === r.value);
    if (!r.prop) {
      if (hit)
        errors.push(
          `conflict: ${r.attr}="${r.value}" is n/a in a reverse table but ${hit.prop} = ${hit.option} maps to it`,
        );
      continue;
    }
    if (!hit)
      errors.push(
        `${r.where}: ${r.attr}="${r.value}" -> ${r.prop} = ${r.option}, but no forward row maps ${r.prop} = ${r.option} to it`,
      );
    else if (norm(hit.prop) !== norm(r.prop) || hit.option !== r.option)
      errors.push(
        `${r.where}: ${r.attr}="${r.value}" -> ${r.prop} = ${r.option}, but the forward table maps ${hit.prop} = ${hit.option}`,
      );
  }
  if (errors.length) {
    for (const e of errors) console.error(`${scriptName}: ${e}`);
    throw new ExitError(2);
  }

  // ---------- binding ----------
  // precedence is per Figma component set: a translate row only claims its attribute in the sets that have that property and option
  const translatedByNode = new Map(
    nodes.map((n) => [
      n.nodeId,
      new Set(
        mappings
          .filter((f) =>
            props.some(
              (p) =>
                p.nodeId === n.nodeId &&
                p.type === "VARIANT" &&
                norm(p.name) === norm(f.prop) &&
                p.variantOptions.includes(f.option),
            ),
          )
          .map((f) => attrByNorm.get(norm(f.attr)).name),
      ),
    ]),
  );
  // An attribute with requiredWhen must never be left empty (undefined or null) in the generated file. A boolean attribute has no
  // value for "off" other than leaving it out, so a required boolean is not bound at all; an enum is filled up (see below).
  const warnedRequired = new Set();
  const warnRequired = (message) => {
    if (warnedRequired.has(message)) return;
    warnedRequired.add(message);
    warnings.push(message);
  };
  const isBoolean = (a) => a?.kind === "boolean";
  const requiredBoolean = (a) => {
    if (!isBoolean(a) || !a.requiredWhen) return false;
    warnRequired(
      `${a.name} is required (requiredWhen ${a.requiredWhen}) and boolean, so a Figma state without it would leave it empty: not bound`,
    );
    return true;
  };
  const usedByNode = new Map(); // nodeId -> attributes already bound in that node (a second binding of the same attribute gets a suffixed key)
  const bound = []; // {kind:'enum'|'boolean'|'slot', ...}
  const stateBlocks = []; // {prop, option, attr}

  for (const p of props) {
    const used =
      usedByNode.get(p.nodeId) ??
      usedByNode.set(p.nodeId, new Set()).get(p.nodeId);
    const row =
      p.type === "TEXT"
        ? text.find((x) => norm(x.prop) === norm(p.name))
        : undefined;
    if (row) {
      // a translate row (mapped or n/a) owns the property, so no name match
      if (row.slot)
        bound.push({
          kind: "slot",
          nodeId: p.nodeId,
          figma: p.name,
          slot: slotByNorm.get(norm(row.slot)).name,
          basis: "translate",
        });
      continue;
    }
    if (other.some((x) => norm(x.prop) === norm(p.name))) continue; // an n/a row owns the property
    const s = slotByNorm.get(norm(p.name));
    const a = attrByNorm.get(norm(p.name));
    if (p.type === "TEXT" && s) {
      bound.push({
        kind: "slot",
        nodeId: p.nodeId,
        figma: p.name,
        slot: s.name,
      });
      continue;
    } // rule 4
    if (p.type === "BOOLEAN" && isBoolean(a) && !requiredBoolean(a)) {
      bound.push({
        kind: "boolean",
        nodeId: p.nodeId,
        figma: p.name,
        attr: a.name,
      });
      continue;
    } // rule 5
    if (p.type !== "VARIANT") continue;
    // rule 1 (name match) for attributes without a translation; translate.md wins for any attribute it mentions
    const pairsByAttr = new Map();
    for (const at of eligible)
      if (at.kind === "enum" && !translatedByNode.get(p.nodeId).has(at.name)) {
        const pairs = {};
        for (const o of p.variantOptions) {
          // generic "Default" and "True"/"False" options only pair when the property is named like the attribute (State=Default is not appearance="default", Border=True is not spellcheck="true")
          if (
            ["default", "true", "false"].includes(norm(o)) &&
            norm(p.name) !== norm(at.name)
          )
            continue;
          const v = at.values.find((v) => norm(v) === norm(o));
          if (v) {
            pairs[o] = v;
            continue;
          }
          // contains rule: when the property is named like the attribute, an option holding exactly one of its values as a whole word binds it (Size = "lg [56px]" -> size="lg")
          if (norm(p.name) === norm(at.name)) {
            const words = norm(o).split(/[^a-z0-9]+/);
            const hits = at.values.filter((v) => words.includes(norm(v)));
            if (hits.length === 1) pairs[o] = hits[0];
          }
        }
        for (const f of forward)
          if (norm(f.prop) === norm(p.name)) delete pairs[f.option]; // a translate row (mapped or n/a) owns its option, so no name match
        if (Object.keys(pairs).length) pairsByAttr.set(at.name, pairs);
      }
    for (const f of mappings)
      if (
        norm(f.prop) === norm(p.name) &&
        p.variantOptions.includes(f.option)
      ) {
        const at = attrByNorm.get(norm(f.attr));
        (pairsByAttr.get(at.name) ?? pairsByAttr.set(at.name, {}).get(at.name))[
          f.option
        ] = f.value;
      }
    for (const [attr, pairs] of pairsByAttr) {
      const cemAttr = attrByNorm.get(norm(attr));
      const fallback = [];
      if (cemAttr.requiredWhen) {
        if (requiredBoolean(cemAttr)) continue;
        // a required enum: an option no row maps takes the attribute's default, and with no default it stays empty and is reported
        for (const o of p.variantOptions) {
          if (o in pairs) continue;
          if (
            cemAttr.default != null &&
            cemAttr.values?.includes(cemAttr.default)
          ) {
            pairs[o] = cemAttr.default;
            fallback.push(o);
          } else
            warnRequired(
              `${cemAttr.name} is required (requiredWhen ${cemAttr.requiredWhen}) but has no default, so ${p.name} = ${o} leaves it empty`,
            );
        }
      }
      const ordered = Object.fromEntries(
        p.variantOptions.filter((o) => o in pairs).map((o) => [o, pairs[o]]),
      );
      if (!Object.keys(ordered).length) continue;
      const key = used.has(attr)
        ? `${attr}_${p.name.replace(/\W/g, "")}`
        : attr;
      used.add(attr);
      bound.push({
        kind: "enum",
        nodeId: p.nodeId,
        figma: p.name,
        attr,
        key,
        pairs: ordered,
        complete: p.variantOptions.every((o) => o in pairs),
        fallback,
      });
    }
    // rule 6: a True/False variant property named like a CEM boolean attribute binds it (True adds the bare attribute, False adds nothing); a translate row for the property owns it instead
    const trueOption = p.variantOptions.find((o) => norm(o) === "true");
    const falseOption = p.variantOptions.find((o) => norm(o) === "false");
    const namedBoolean = attrByNorm.get(norm(p.name));
    if (
      isBoolean(namedBoolean) &&
      !requiredBoolean(namedBoolean) &&
      trueOption &&
      falseOption &&
      p.variantOptions.length === 2 &&
      !forward.some((f) => norm(f.prop) === norm(p.name))
    ) {
      stateBlocks.push(
        {
          nodeId: p.nodeId,
          prop: p.name,
          option: trueOption,
          attr: namedBoolean.name,
        },
        { nodeId: p.nodeId, prop: p.name, option: falseOption, attr: null },
      );
      continue;
    }
    // rules 2 and 3: option name equals a CEM boolean attribute
    const matched = p.variantOptions.filter((o) => {
      const at = attrByNorm.get(norm(o));
      return isBoolean(at) && !requiredBoolean(at);
    });
    if (matched.length) {
      if (p.defaultValue !== undefined)
        stateBlocks.push({
          nodeId: p.nodeId,
          prop: p.name,
          option: p.defaultValue,
          attr: null,
        });
      for (const o of matched)
        stateBlocks.push({
          nodeId: p.nodeId,
          prop: p.name,
          option: o,
          attr: attrByNorm.get(norm(o)).name,
        });
    }
  }

  return {
    args,
    ctx,
    tag,
    norm,
    display,
    q,
    readText,
    readJson,
    fail,
    errors,
    warnings,
    translatePath,
    forward,
    reverse,
    text,
    tbdForward,
    tbdReverse,
    mappedSlots,
    slotRows,
    other,
    tbdSlots,
    tbdOther,
    mappings,
    cemMapPath,
    packagePath,
    changelogPath,
    figmaDir,
    genDir,
    map,
    nodes,
    eligible,
    outOfScope,
    categorized,
    ignored,
    attrByNorm,
    props,
    translatedByNode,
    bound,
    stateBlocks,
  };
}

// What the binding leaves unaddressed (and what it covers), shared by the mismatch and translate scripts.
export function gaps(c) {
  const {
    bound,
    stateBlocks,
    eligible,
    outOfScope,
    categorized,
    ignored,
    map,
    props,
    norm,
  } = c;
  const enumBound = bound.filter((x) => x.kind === "enum");
  const coveredValues = new Map(); // attr -> Set of values some Figma option emits
  for (const x of enumBound) {
    if (!coveredValues.has(x.attr)) coveredValues.set(x.attr, new Set());
    // an option bound only as the default of a required attribute is a fallback, not a match
    for (const [o, v] of Object.entries(x.pairs))
      if (!x.fallback?.includes(o)) coveredValues.get(x.attr).add(v);
  }
  const addressedAttrs = new Set([
    ...bound.filter((x) => x.kind !== "slot").map((x) => x.attr),
    ...stateBlocks.filter((b) => b.attr).map((b) => b.attr),
  ]);
  const unAttrs = eligible.filter((a) => !addressedAttrs.has(a.name));
  const excluded = map.attributes.filter(
    (a) =>
      (a.deprecated || a.privacy !== "public") && !ignored.has(norm(a.name)),
  );
  const boundSlots = new Set(
    bound.filter((x) => x.kind === "slot").map((x) => x.slot),
  );
  const unSlots = map.slots.filter((s) => !boundSlots.has(s.name));
  const boundFigma = new Set([
    ...bound.map((x) => `${x.nodeId}|${norm(x.figma)}`),
    ...stateBlocks.map((b) => `${b.nodeId}|${norm(b.prop)}`),
  ]); // nodeId|normalised property name
  const unFigma = props.filter(
    (p) => !boundFigma.has(`${p.nodeId}|${norm(p.name)}`),
  );
  const usedOptions = (p) =>
    new Set([
      ...enumBound
        .filter((x) => x.nodeId === p.nodeId && norm(x.figma) === norm(p.name))
        .flatMap((x) =>
          Object.keys(x.pairs).filter((o) => !x.fallback?.includes(o)),
        ),
      ...stateBlocks
        .filter((b) => b.nodeId === p.nodeId && norm(b.prop) === norm(p.name))
        .map((b) => b.option),
    ]);
  const unOptions = props
    .filter((p) => p.type === "VARIANT")
    .flatMap((p) =>
      p.variantOptions
        .filter((o) => !usedOptions(p).has(o))
        .map((o) => ({ p, o })),
    );
  return {
    enumBound,
    coveredValues,
    addressedAttrs,
    unAttrs,
    excluded,
    notBound: categorized ? outOfScope : [],
    unSlots,
    boundFigma,
    unFigma,
    unOptions,
  };
}
