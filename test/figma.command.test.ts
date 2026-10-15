import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { codeConnect } from "../src/scripts/figma/code-connect.ts";
import { figmaNodesFor } from "../src/scripts/figma/figma-connector.config.ts";
import { captureError, tempCwd } from "./support.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/figma", import.meta.url));

/** Every Code Connect run fetches, so serve the saved snapshots in `cwd` as the Figma API (404 for a node with none). */
function mockFigmaApi(t: TestContext, cwd: string) {
  const original = process.env.FIGMA_ACCESS_TOKEN;
  process.env.FIGMA_ACCESS_TOKEN = "test-token";
  t.after(() => {
    if (original === undefined) {
      delete process.env.FIGMA_ACCESS_TOKEN;
    } else {
      process.env.FIGMA_ACCESS_TOKEN = original;
    }
  });
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(String(url));
    const id = new URL(String(url)).searchParams.get("ids") ?? "";
    try {
      const file = path.join(
        cwd,
        "figma",
        "snapshots",
        `${id.replace(":", "-")}.json`,
      );
      return new Response(await readFile(file, "utf-8"), { status: 200 });
    } catch {
      return new Response("{}", { status: 404, statusText: "Not Found" });
    }
  });
  return urls;
}

/** Copy a fixture (`button`: one Figma set; `hyperlink`: three sets) into a temp dir, as a standalone repo. */
async function stage(t: TestContext, name: "button" | "hyperlink") {
  const root = await tempCwd(t);
  await cp(path.join(FIXTURES, name), root, { recursive: true });
  const cwd = root;
  const urls = mockFigmaApi(t, cwd);
  if (name === "button") {
    // Committed in a real repo, including the hand-written note kept below the generated sections.
    await cp(
      path.join(FIXTURES, name, "expected", "auro-button.mismatch.md"),
      path.join(cwd, "figma", "auro-button.mismatch.md"),
    );
  }
  return { root, cwd, tag: `auro-${name}`, urls };
}

const read = (...p: string[]) => readFile(path.join(...p), "utf-8");
const expected = (name: string, file: string) =>
  read(FIXTURES, name, "expected", file);

test("standalone repo: docs --cem matches the reference output", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});

  assert.equal(await codeConnect({}, cwd), 0);

  assert.equal(
    await read(cwd, "figma", `${tag}.cem-map.json`),
    await expected("button", `${tag}.cem-map.json`),
  );
  assert.equal(
    await read(cwd, "figma", `${tag}.mismatch.md`),
    await expected("button", `${tag}.mismatch.md`),
  );
  assert.equal(
    await read(cwd, "figma", `${tag}.figma.ts`),
    await expected("button", `${tag}.figma.ts`),
  );
});

test("component with several Figma sets: docs --cem matches the reference output", async (t) => {
  const { cwd, tag } = await stage(t, "hyperlink");
  t.mock.method(console, "log", () => {});

  assert.equal(await codeConnect({}, cwd), 0);

  assert.equal(
    await read(cwd, "figma", `${tag}.cem-map.json`),
    await expected("hyperlink", `${tag}.cem-map.json`),
  );
  assert.equal(
    await read(cwd, "figma", `${tag}.mismatch.md`),
    await expected("hyperlink", `${tag}.mismatch.md`),
  );
  assert.equal(
    await read(cwd, "figma", `${tag}.figma.ts`),
    await expected("hyperlink", `${tag}.figma.ts`),
  );
});

for (const name of ["button", "hyperlink"] as const) {
  test(`${name}: every figma.connect has an imports entry with the install version and the package import`, async (t) => {
    const { cwd, tag } = await stage(t, name);
    t.mock.method(console, "log", () => {});
    assert.equal(await codeConnect({}, cwd), 0);

    const out = await read(cwd, "figma", `${tag}.figma.ts`);
    const pkg = `@aurodesignsystem/${tag}`;
    const connects = out.match(/^figma\.connect\(/gm)?.length ?? 0;
    const installs = out.match(
      new RegExp(`^ {4}"// npm install ${pkg}@\\d+\\.\\d+\\.\\d+\\S*",$`, "gm"),
    )?.length;
    const imports = out.split(`    "import '${pkg}';",`).length - 1;

    assert.ok(connects > 0);
    assert.equal(installs, connects);
    assert.equal(imports, connects);
  });
}

test("--check exits 0 when up to date and never writes the committed files", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  await codeConnect({}, cwd);

  const before = await read(cwd, "figma", `${tag}.mismatch.md`);
  assert.equal(await codeConnect({ check: true }, cwd), 0);
  assert.equal(await read(cwd, "figma", `${tag}.mismatch.md`), before);
});

test("--check exits 1 when the mismatch file is stale", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  captureError(t);
  await codeConnect({}, cwd);
  const file = path.join(cwd, "figma", `${tag}.mismatch.md`);
  await writeFile(
    file,
    (await readFile(file, "utf-8")).replace(
      "| `autofocus` |",
      "| `autofocusX` |",
    ),
  );

  assert.equal(await codeConnect({ check: true }, cwd), 1);
});

test("--check exits 1 when the translate file lacks a row for a gap, and a run adds it", async (t) => {
  const { cwd, tag } = await stage(t, "hyperlink");
  t.mock.method(console, "log", () => {});
  captureError(t);
  await codeConnect({}, cwd);

  const file = path.join(cwd, "figma", `${tag}.translate.md`);
  const text = await readFile(file, "utf-8");
  const row = text.split("\n").find((l) => /^\| `download` \|/.test(l));
  assert.ok(
    row,
    "the generated translate file has a row for the download attribute",
  );
  await writeFile(file, text.replace(`${row}\n`, ""));

  assert.equal(await codeConnect({ check: true }, cwd), 1);
  assert.equal(await codeConnect({}, cwd), 0);
  assert.ok((await read(file)).includes(row));
});

test("a bad translate row exits 2", async (t) => {
  const { cwd, tag } = await stage(t, "hyperlink");
  t.mock.method(console, "log", () => {});
  const errors = captureError(t);
  const file = path.join(cwd, "figma", `${tag}.translate.md`);
  const text = await readFile(file, "utf-8");
  await writeFile(file, text.replace('`size="md"`', '`bogus="x"`'));

  assert.equal(await codeConnect({}, cwd), 2);
  assert.match(errors(), /bogus/);
});

test("a repo without figma/ is skipped with exit 0", async (t) => {
  const cwd = await tempCwd(t);
  const log = t.mock.method(console, "log", () => {});

  assert.equal(await codeConnect({}, cwd), 0);
  assert.match(String(log.mock.calls[0].arguments[0]), /not configured/);
});

test("a repo without figma/ is skipped silently with quiet (the build path)", async (t) => {
  const cwd = await tempCwd(t);
  const log = t.mock.method(console, "log", () => {});

  assert.equal(await codeConnect({ quiet: true }, cwd), 0);
  assert.equal(log.mock.calls.length, 0);
});

test("a component that is not in the config is skipped, even with a figma/ directory", async (t) => {
  const { cwd } = await stage(t, "button");
  const log = t.mock.method(console, "log", () => {});
  const cemFile = path.join(cwd, "custom-elements.json");
  const cem = JSON.parse(await readFile(cemFile, "utf-8"));
  for (const m of cem.modules) {
    for (const d of m.declarations ?? []) {
      if (d.tagName === "auro-button") d.tagName = "auro-other";
    }
  }
  await writeFile(cemFile, JSON.stringify(cem));

  assert.equal(await codeConnect({}, cwd), 0);
  assert.match(String(log.mock.calls[0].arguments[0]), /not in the Figma/);
  assert.equal(await codeConnect({ check: true }, cwd), 0);
});

test("a component in the config with no translate file: --check exits 1, a run creates it with TBD rows", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  const errors = captureError(t);
  const file = path.join(cwd, "figma", `${tag}.translate.md`);
  await rm(file);

  assert.equal(await codeConnect({ check: true }, cwd), 1);
  assert.match(errors(), /translate\.md is missing/);

  assert.equal(await codeConnect({}, cwd), 0);
  const created = await readFile(file, "utf-8");
  assert.match(created, /\| TBD \|/);
  assert.doesNotMatch(created, /## Source/);
});

test("more than one custom element in the config exits 2", async (t) => {
  const { cwd } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  const errors = captureError(t);
  const cemFile = path.join(cwd, "custom-elements.json");
  const cem = JSON.parse(await readFile(cemFile, "utf-8"));
  cem.modules[0].declarations.push({
    kind: "class",
    name: "Hyperlink",
    tagName: "auro-hyperlink",
    customElement: true,
  });
  await writeFile(cemFile, JSON.stringify(cem));

  assert.equal(await codeConnect({}, cwd), 2);
  assert.match(errors(), /more than one custom element/);
});

test("a missing custom-elements.json exits 2 with a hint", async (t) => {
  const { cwd } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  const errors = captureError(t);
  await rm(path.join(cwd, "custom-elements.json"));

  assert.equal(await codeConnect({}, cwd), 2);
  assert.match(errors(), /auro build/);
});

test("a run fetches the Figma data from the API, and --check does not", async (t) => {
  const { cwd, urls } = await stage(t, "button");
  t.mock.method(console, "log", () => {});

  assert.equal(await codeConnect({}, cwd), 0);
  assert.ok(urls.length > 0, "the Figma API was called");
  assert.ok(urls.every((u) => u.startsWith("https://api.figma.com/")));

  const calls = urls.length;
  assert.equal(await codeConnect({ check: true }, cwd), 0);
  assert.equal(urls.length, calls, "--check does not call the Figma API");
});

test("a run without FIGMA_ACCESS_TOKEN warns and skips, writing nothing", async (t) => {
  const { cwd, tag, urls } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  const warn = t.mock.method(console, "warn", () => {});
  delete process.env.FIGMA_ACCESS_TOKEN;

  assert.equal(await codeConnect({}, cwd), 0);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /FIGMA_ACCESS_TOKEN/);
  assert.equal(urls.length, 0, "the Figma API was not called");
  await assert.rejects(read(cwd, "figma", `${tag}.figma.ts`));
});

test("the config turns a node id into a Figma URL and leaves other tags empty", () => {
  const [button] = figmaNodesFor("auro-button");
  assert.equal(
    button,
    "https://www.figma.com/design/if5kIJr2x6Jv9aXpq1ANOp/Auro-toolkit---Fork---Code-Connect-Test?node-id=1571-3356",
  );
  assert.deepEqual(figmaNodesFor("auro-unknown"), []);
});

test("a variant option that holds one code value as a whole word binds it when the property is named like the attribute", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  const snap = path.join(cwd, "figma", "snapshots", "1571-3356.json");
  const text = await readFile(snap, "utf-8");
  await writeFile(snap, text.replaceAll("Large [56px]", "lg [56px]"));
  // drop the translate row that used to carry this option, so only the name rule can bind it
  const tr = path.join(cwd, "figma", `${tag}.translate.md`);
  const rows = (await readFile(tr, "utf-8"))
    .split("\n")
    .filter((l) => !l.startsWith("| Size | ") && !l.startsWith("| `size` | "))
    .join("\n");
  await writeFile(tr, rows);
  assert.equal(await codeConnect({}, cwd), 0);

  const ts = await read(cwd, "figma", `${tag}.figma.ts`);
  assert.match(ts, /'lg \[56px\]': 'size="lg"'/);
  assert.doesNotMatch(ts, /'Default \[48px\]'/);
  assert.doesNotMatch(ts, /'X-Large \[72px\]'/);
});

test("mismatch.md lists design-related attributes in PART 2 and the rest in PART 3", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  assert.equal(await codeConnect({}, cwd), 0);

  const md = await read(cwd, "figma", `${tag}.mismatch.md`);
  const part3 = md.indexOf("# PART 3");
  assert.ok(part3 > 0);
  const [main, functionality] = [md.slice(0, part3), md.slice(part3)];
  assert.match(main, /\| `fluid` \|/);
  assert.doesNotMatch(main, /\| `autofocus` \|/);
  assert.match(functionality, /\| `autofocus` \|/);
  assert.doesNotMatch(functionality, /\| `fluid` \|/);
});

/** Rewrite the staged `custom-elements.json` of the button fixture: `edit` gets each attribute of `auro-button`. */
async function editCem(
  cwd: string,
  edit: (attr: Record<string, unknown>) => void,
) {
  const file = path.join(cwd, "custom-elements.json");
  const cem = JSON.parse(await readFile(file, "utf-8"));
  for (const m of cem.modules)
    for (const d of m.declarations ?? [])
      if (d.tagName === "auro-button") d.attributes.forEach(edit);
  await writeFile(file, JSON.stringify(cem, null, 2));
}

test("a CEM with categories binds only ui attributes and the design list, and lists the rest as not bound", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  await editCem(cwd, (a) => {
    if (a.name === "title") a.category = "ui";
    if (a.name === "autofocus") a.category = "behavior";
  });
  assert.equal(await codeConnect({}, cwd), 0);

  const map = JSON.parse(
    await read(cwd, "figma", `${tag}.cem-map.json`),
  );
  assert.equal(
    map.attributes.find((a: { name: string }) => a.name === "title").category,
    "ui",
  );
  // design-related names stay bound whatever their category (here: none)
  const ts = await read(cwd, "figma", `${tag}.figma.ts`);
  assert.match(ts, /variant: figma\.enum\('Type'/);

  const md = await read(cwd, "figma", `${tag}.mismatch.md`);
  const notBound = md.slice(
    md.indexOf("## Code attributes not bound"),
    md.indexOf("## Code slots with no Figma counterpart"),
  );
  assert.match(notBound, /\| `autofocus` \| behavior \|/);
  assert.match(notBound, /\| `static` \| {2}\|/);
  assert.doesNotMatch(notBound, /\| `title` \|/);
  assert.doesNotMatch(notBound, /\| `fluid` \|/);
  assert.match(md.slice(md.indexOf("# PART 3")), /\| `title` \|/);
});

test("a CEM without categories keeps every bindable attribute and no not-bound section", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  assert.equal(await codeConnect({}, cwd), 0);
  const md = await read(cwd, "figma", `${tag}.mismatch.md`);
  assert.doesNotMatch(md, /not bound/);
});

test("a required enum never leaves an option empty: unmapped options take the default", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  await editCem(cwd, (a) => {
    if (a.name === "shape") a.requiredWhen = "always";
  });
  assert.equal(await codeConnect({}, cwd), 0);

  const ts = await read(cwd, "figma", `${tag}.figma.ts`);
  assert.match(
    ts,
    /shape: figma\.enum\('Rounded', \{\n {6}'False': 'rounded', \/\/ default value: shape is required\n {6}'True': 'rounded',/,
  );
  assert.match(ts, /shape="\$\{shape\}"/);
  assert.doesNotMatch(ts, /\$\{shape\}>/);
});

test("a required boolean is not bound, because off would leave it empty", async (t) => {
  const { cwd, tag } = await stage(t, "button");
  t.mock.method(console, "log", () => {});
  const errors = t.mock.method(console, "error", () => {});
  await editCem(cwd, (a) => {
    if (a.name === "disabled") a.requiredWhen = "always";
  });
  assert.equal(await codeConnect({}, cwd), 0);

  const ts = await read(cwd, "figma", `${tag}.figma.ts`);
  assert.doesNotMatch(ts, /disabled/);
  assert.ok(
    errors.mock.calls.some((c) =>
      String(c.arguments[0]).includes("disabled is required"),
    ),
  );
});

/** Run `figma connect parse` (the Code Connect html parser) over the generated file; it needs `@figma/code-connect` v1, the last major with framework parsers. */
async function parseWithCodeConnect(t: TestContext, cwd: string, tag: string) {
  const work = await tempCwd(t);
  await cp(
    path.join(cwd, "figma", `${tag}.figma.ts`),
    path.join(work, `${tag}.figma.ts`),
  );
  await symlink(
    path.join(REPO, "node_modules"),
    path.join(work, "node_modules"),
  );
  await writeFile(
    path.join(work, "figma.config.json"),
    JSON.stringify({
      codeConnect: { parser: "html", include: ["*.figma.ts"] },
    }),
  );
  const cli = path.join(
    REPO,
    "node_modules",
    "@figma",
    "code-connect",
    "bin",
    "figma",
  );
  return spawnSync(
    process.execPath,
    [
      cli,
      "connect",
      "parse",
      "--skip-update-check",
      "--exit-on-unreadable-files",
    ],
    { cwd: work, encoding: "utf-8" },
  );
}

for (const name of ["button", "hyperlink"] as const) {
  test(`${name}: the generated .figma.ts passes the Code Connect html parser`, async (t) => {
    const { cwd, tag } = await stage(t, name);
    t.mock.method(console, "log", () => {});
    assert.equal(await codeConnect({}, cwd), 0);

    const result = await parseWithCodeConnect(t, cwd, tag);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const docs = JSON.parse(result.stdout.slice(result.stdout.indexOf("[")));
    const connects = (
      await read(cwd, "figma", `${tag}.figma.ts`)
    ).match(/^figma\.connect\(/gm);
    assert.ok(connects?.length, "the file has figma.connect() calls");
    assert.equal(
      docs.length,
      connects.length,
      "every figma.connect() was parsed",
    );
  });
}
