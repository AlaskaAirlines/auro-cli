/**
 * PT-M2 build-order step 3 — the editor-target **detection heuristics**
 * (src/init/editors/detect.ts). These pure, offline probes pick the *default*
 * for each target when a run hasn't settled it via a flag or a persisted choice
 * (precedence: flag → persisted → **detection** → prompt). The integration suite
 * exercises detection only through the VS Code signal; this suite pins every
 * branch directly — each positive trigger, the negatives, and the "never throws"
 * robustness of the manifest read — so the frozen heuristics can't drift
 * unnoticed.
 */

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  detectEditorSignals,
  detectJsx,
  detectSvelte,
  detectVsCode,
} from "../src/init/editors/detect.ts";
import { tempCwd } from "./support.ts";

/** Write `<cwd>/package.json` with the given dependency maps. */
async function writePackageJson(
  cwd: string,
  pkg: Record<string, unknown>,
): Promise<void> {
  await writeFile(path.join(cwd, "package.json"), JSON.stringify(pkg));
}

// ---------------------------------------------------------------------------
// detectVsCode — a `.vscode/` directory (workspace settings) is the signal
// ---------------------------------------------------------------------------

test("detectVsCode is true when a .vscode directory exists", async (t) => {
  const cwd = await tempCwd(t);
  await mkdir(path.join(cwd, ".vscode"), { recursive: true });
  assert.equal(detectVsCode(cwd), true);
});

test("detectVsCode is false with no .vscode directory", async (t) => {
  const cwd = await tempCwd(t);
  assert.equal(detectVsCode(cwd), false);
});

test("detectVsCode is false when .vscode is a file, not a directory", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(path.join(cwd, ".vscode"), "not a dir");
  assert.equal(detectVsCode(cwd), false);
});

// ---------------------------------------------------------------------------
// detectJsx — tsconfig `compilerOptions.jsx` OR a `react` (dev)dependency
// ---------------------------------------------------------------------------

test("detectJsx is true when tsconfig sets compilerOptions.jsx", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }),
  );
  assert.equal(detectJsx(cwd), true);
});

test("detectJsx is true when react is a dependency", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, { dependencies: { react: "^18.0.0" } });
  assert.equal(detectJsx(cwd), true);
});

test("detectJsx is true when react is only a devDependency", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, { devDependencies: { react: "^18.0.0" } });
  assert.equal(detectJsx(cwd), true);
});

test("detectJsx is false with a tsconfig that omits jsx and no react", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true } }),
  );
  await writePackageJson(cwd, { dependencies: { lit: "^3.0.0" } });
  assert.equal(detectJsx(cwd), false);
});

test("detectJsx falls through an unparseable tsconfig to the react signal", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(path.join(cwd, "tsconfig.json"), "{ not valid json");
  await writePackageJson(cwd, { dependencies: { react: "^18.0.0" } });
  assert.equal(detectJsx(cwd), true);
});

test("detectJsx is false with an unparseable tsconfig and no react", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(path.join(cwd, "tsconfig.json"), "{ not valid json");
  assert.equal(detectJsx(cwd), false);
});

// ---------------------------------------------------------------------------
// detectSvelte — a `svelte` (dev)dependency OR a svelte.config.* at the root
// ---------------------------------------------------------------------------

test("detectSvelte is true when svelte is a dependency", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, { dependencies: { svelte: "^4.0.0" } });
  assert.equal(detectSvelte(cwd), true);
});

test("detectSvelte is true when svelte is only a devDependency", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, { devDependencies: { svelte: "^4.0.0" } });
  assert.equal(detectSvelte(cwd), true);
});

for (const ext of ["js", "ts", "mjs", "cjs"]) {
  test(`detectSvelte is true with a svelte.config.${ext}`, async (t) => {
    const cwd = await tempCwd(t);
    await writeFile(
      path.join(cwd, `svelte.config.${ext}`),
      "export default {}",
    );
    assert.equal(detectSvelte(cwd), true);
  });
}

test("detectSvelte is false with neither a dep nor a config file", async (t) => {
  const cwd = await tempCwd(t);
  await writePackageJson(cwd, { dependencies: { lit: "^3.0.0" } });
  assert.equal(detectSvelte(cwd), false);
});

// ---------------------------------------------------------------------------
// detectEditorSignals — aggregate + never-throws robustness
// ---------------------------------------------------------------------------

test("detectEditorSignals reports every target from a project with all signals", async (t) => {
  const cwd = await tempCwd(t);
  await mkdir(path.join(cwd, ".vscode"), { recursive: true });
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }),
  );
  await writePackageJson(cwd, { devDependencies: { svelte: "^4.0.0" } });
  assert.deepEqual(detectEditorSignals(cwd), {
    vscode: true,
    jsx: true,
    svelte: true,
    // Shares the .vscode/ signal with the VS Code HTML custom-data target.
    cssSnippets: true,
  });
});

test("detectEditorSignals is all-false in a bare directory (no throw, no signal)", async (t) => {
  const cwd = await tempCwd(t);
  assert.deepEqual(detectEditorSignals(cwd), {
    vscode: false,
    jsx: false,
    svelte: false,
    cssSnippets: false,
  });
});

test("detectEditorSignals tolerates a malformed package.json without throwing", async (t) => {
  const cwd = await tempCwd(t);
  await writeFile(path.join(cwd, "package.json"), "{ not valid json");
  // The bad manifest yields no dependency signal rather than an exception.
  assert.deepEqual(detectEditorSignals(cwd), {
    vscode: false,
    jsx: false,
    svelte: false,
    cssSnippets: false,
  });
});
