import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  detectLegacyFormkit,
  migrateToFormkit,
} from "../src/init/migrateFormkit.ts";
import { tempCwd } from "./support.ts";

/** Write `<cwd>/package.json` from a plain object. */
async function writePackageJson(cwd: string, pkg: unknown): Promise<void> {
  await writeFile(path.join(cwd, "package.json"), JSON.stringify(pkg, null, 2));
}

/** Write a source file (creating parent dirs) and return its absolute path. */
async function writeSource(
  cwd: string,
  rel: string,
  source: string,
): Promise<string> {
  const file = path.join(cwd, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source);
  return file;
}

const read = (file: string): Promise<string> => readFile(file, "utf-8");

test("detectLegacyFormkit reads legacy packages from dependencies and devDependencies", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, {
    dependencies: {
      "@aurodesignsystem/auro-input": "^9.0.0",
      "@aurodesignsystem/auro-button": "^12.0.0", // not legacy
    },
    devDependencies: { "@aurodesignsystem/auro-select": "^8.1.0" },
  });

  const legacy = detectLegacyFormkit(cwd);

  assert.deepEqual(
    legacy,
    [
      {
        pkg: "@aurodesignsystem/auro-input",
        version: "^9.0.0",
        field: "dependencies",
      },
      {
        pkg: "@aurodesignsystem/auro-select",
        version: "^8.1.0",
        field: "devDependencies",
      },
    ],
    "auro-button is excluded; select is found in devDependencies",
  );
});

test("detectLegacyFormkit returns [] with no package.json and throws on malformed JSON", async (t) => {
  const cwd = await tempCwd(t);
  assert.deepEqual(detectLegacyFormkit(cwd), [], "no manifest → nothing");

  await writeFile(path.join(cwd, "package.json"), "{ not json");
  assert.throws(() => detectLegacyFormkit(cwd), /invalid JSON/);
});

test("migrateToFormkit swaps package.json deps and rewrites bare imports", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, {
    name: "app",
    dependencies: {
      "@aurodesignsystem/auro-input": "^9.0.0",
      "@aurodesignsystem/auro-button": "^12.0.0",
    },
    devDependencies: { "@aurodesignsystem/auro-select": "^8.1.0" },
  });
  const appFile = await writeSource(
    cwd,
    "src/app.js",
    [
      `import "@aurodesignsystem/auro-input";`,
      `import { AuroSelect } from '@aurodesignsystem/auro-select';`,
      `import { AuroButton } from "@aurodesignsystem/auro-button";`,
    ].join("\n"),
  );

  const report = migrateToFormkit(cwd, detectLegacyFormkit(cwd));

  // package.json: legacy removed, button kept, formkit added.
  const pkg = JSON.parse(await read(path.join(cwd, "package.json")));
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-input"], undefined);
  assert.equal(pkg.devDependencies["@aurodesignsystem/auro-select"], undefined);
  assert.equal(
    pkg.dependencies["@aurodesignsystem/auro-button"],
    "^12.0.0",
    "a true standalone is left untouched",
  );
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-formkit"], "latest");
  assert.equal(report.formkit, "added");
  assert.deepEqual([...report.packagesMigrated].sort(), [
    "@aurodesignsystem/auro-input",
    "@aurodesignsystem/auro-select",
  ]);

  // Source: bare legacy specifiers rewritten, button import untouched.
  const src = await read(appFile);
  assert.match(src, /"@aurodesignsystem\/auro-formkit\/auro-input"/);
  assert.match(src, /'@aurodesignsystem\/auro-formkit\/auro-select'/);
  assert.match(src, /"@aurodesignsystem\/auro-button"/);
  assert.equal(report.rewriteCount, 2);
  assert.deepEqual(report.filesChanged, ["src/app.js"]);
});

test("migrateToFormkit keeps an existing formkit dependency version", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, {
    dependencies: {
      "@aurodesignsystem/auro-input": "^9.0.0",
      "@aurodesignsystem/auro-formkit": "^6.1.0",
    },
  });

  const report = migrateToFormkit(cwd, detectLegacyFormkit(cwd));

  const pkg = JSON.parse(await read(path.join(cwd, "package.json")));
  assert.equal(
    pkg.dependencies["@aurodesignsystem/auro-formkit"],
    "^6.1.0",
    "an already-declared formkit version is preserved",
  );
  assert.equal(report.formkit, "present");
});

test("migrateToFormkit rewrites imports inside a Svelte <script> block", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, {
    dependencies: { "@aurodesignsystem/auro-checkbox": "^7.0.0" },
  });
  const svelte = await writeSource(
    cwd,
    "src/Form.svelte",
    [
      `<script lang="ts">`,
      `  import "@aurodesignsystem/auro-checkbox";`,
      "</script>",
      "<auro-checkbox></auro-checkbox>",
    ].join("\n"),
  );

  const report = migrateToFormkit(cwd, detectLegacyFormkit(cwd));

  const src = await read(svelte);
  assert.match(src, /"@aurodesignsystem\/auro-formkit\/auro-checkbox"/);
  assert.match(src, /<auro-checkbox>/, "template markup is left untouched");
  assert.equal(report.rewriteCount, 1);
});

test("migrateToFormkit leaves deep imports untouched and reports them", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, {
    dependencies: { "@aurodesignsystem/auro-input": "^9.0.0" },
  });
  const file = await writeSource(
    cwd,
    "src/deep.js",
    `import "@aurodesignsystem/auro-input/dist/registered.js";`,
  );

  const report = migrateToFormkit(cwd, detectLegacyFormkit(cwd));

  const src = await read(file);
  assert.match(
    src,
    /"@aurodesignsystem\/auro-input\/dist\/registered\.js"/,
    "a deep import is not rewritten (formkit's deep layout can't be guessed)",
  );
  assert.equal(report.rewriteCount, 0);
  assert.deepEqual(report.deepImports, [
    {
      file: "src/deep.js",
      specifier: "@aurodesignsystem/auro-input/dist/registered.js",
    },
  ]);
});

test("migrateToFormkit is idempotent — a second run changes nothing", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, {
    dependencies: { "@aurodesignsystem/auro-input": "^9.0.0" },
  });
  const file = await writeSource(
    cwd,
    "src/app.js",
    `import "@aurodesignsystem/auro-input";`,
  );

  migrateToFormkit(cwd, detectLegacyFormkit(cwd));
  const afterFirst = await read(file);
  const pkgAfterFirst = await read(path.join(cwd, "package.json"));

  // After migration there are no legacy deps left to detect.
  assert.deepEqual(detectLegacyFormkit(cwd), []);
  const second = migrateToFormkit(cwd, detectLegacyFormkit(cwd));

  assert.equal(second.rewriteCount, 0);
  assert.deepEqual(second.packagesMigrated, []);
  assert.equal(await read(file), afterFirst, "source unchanged on re-run");
  assert.equal(
    await read(path.join(cwd, "package.json")),
    pkgAfterFirst,
    "package.json unchanged on re-run",
  );
});
