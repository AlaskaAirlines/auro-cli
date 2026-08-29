/**
 * PT-M2 build-order step 4 — Svelte type-check smoke.
 *
 * Sibling of the JSX smoke test: the Svelte `.d.ts` the CLI emits is only useful
 * if a real `tsc` accepts it. Unlike the JSX artifact it imports no package
 * classes (it inlines CEM `type.text`), so there is nothing to resolve — but it
 * DOES carry a hand-authored native-DOM-event block ({@link NATIVE_DOM_EVENTS} in
 * svelteTypes.ts) whose lib.dom event types the byte-exact golden can't prove are
 * valid TypeScript. This compiles a freshly built artifact under the project's
 * own pinned `tsc`; a non-zero exit fails the test with the compiler's own
 * diagnostics.
 *
 * The only external references in the artifact are `JSX.Element` /
 * `JSX.CSSProperties` (svelte2tsx supplies these in a real project); a tiny global
 * `JSX` shim stands in for them here, exactly as the JSX smoke test stubs the
 * component package's class.
 *
 * @see test/init.editors.tsc-smoke.test.ts (the JSX counterpart).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { buildSvelteTypes } from "../src/init/editors/svelteTypes.ts";
import { COMPONENTS, RESOLVED_TAGS } from "./support.editors.ts";
import { tempCwd } from "./support.ts";

const require = createRequire(import.meta.url);
/** The project's own pinned `tsc` entry — no global/PATH dependency. */
const TSC = require.resolve("typescript/bin/tsc");

test("the emitted Svelte .d.ts type-checks under tsc --noEmit", async (t) => {
  const cwd = await tempCwd(t);

  // Build the artifact exactly as `init` would, over the shared synthetic set.
  const artifact = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS);
  const typesDir = path.join(cwd, path.dirname(artifact.filename));
  await mkdir(typesDir, { recursive: true });
  await writeFile(
    path.join(cwd, artifact.filename),
    artifact.contents,
    "utf-8",
  );

  // Stand in for svelte2tsx's global JSX namespace (the artifact's only external
  // reference: `children?: JSX.Element` and `style?: JSX.CSSProperties`). A
  // module-free `.d.ts` declares the namespace globally.
  await mkdir(path.join(cwd, "stubs"), { recursive: true });
  await writeFile(
    path.join(cwd, "stubs", "jsx-shim.d.ts"),
    "declare namespace JSX {\n" +
      "  type Element = unknown;\n" +
      "  interface CSSProperties {}\n" +
      "}\n",
    "utf-8",
  );

  // skipLibCheck MUST be false: the artifact is itself a `.d.ts`, so only an
  // un-skipped lib check actually type-checks it (and its native-event block).
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          noEmit: true,
          skipLibCheck: false,
          strict: false,
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2020", "DOM"],
          types: [],
        },
        include: [artifact.filename, "stubs/jsx-shim.d.ts"],
      },
      null,
      2,
    ),
    "utf-8",
  );

  try {
    execFileSync(process.execPath, [TSC, "-p", "tsconfig.json"], {
      cwd,
      stdio: "pipe",
    });
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer };
    const output = `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`;
    assert.fail(`tsc rejected the emitted Svelte .d.ts:\n${output}`);
  }
});
