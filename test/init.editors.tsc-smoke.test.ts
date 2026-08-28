/**
 * PT-M2 build-order step 4 — JSX type-check smoke.
 *
 * The JSX `.d.ts` the CLI emits is only useful if a real `tsc` accepts it: the
 * self-contained prop/element types must be valid TypeScript, and — the one thing
 * the byte-exact golden test can't prove — the `import type { AuroButton } from
 * "<pkg>"` specifiers it generates must actually *resolve*. This spawns the
 * project's own `typescript` against a freshly built artifact in a throwaway
 * project, with the component class import satisfied by a stub (standing in for
 * the installed package's shipped types). A non-zero `tsc` exit fails the test
 * with the compiler's own diagnostics.
 *
 * @see docs/pt-m2-completion-plan.md → build-order step 4 and "Testing plan → JSX
 *   class-import resolution".
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { buildJsxTypes } from "../src/init/editors/jsxTypes.ts";
import { BUTTON, RESOLVED_TAGS } from "./support.editors.ts";
import { tempCwd } from "./support.ts";

const require = createRequire(import.meta.url);
/** The project's own pinned `tsc` entry — no global/PATH dependency. */
const TSC = require.resolve("typescript/bin/tsc");

test("the emitted JSX .d.ts type-checks under tsc --noEmit (imports resolve)", async (t) => {
  const cwd = await tempCwd(t);

  // Build the artifact exactly as `init` would, over the shared synthetic button.
  const artifact = buildJsxTypes([BUTTON], RESOLVED_TAGS);
  const typesDir = path.join(cwd, path.dirname(artifact.filename));
  await mkdir(typesDir, { recursive: true });
  await writeFile(
    path.join(cwd, artifact.filename),
    artifact.contents,
    "utf-8",
  );

  // Stand in for the installed package's shipped class types so the emitted
  // `import type { AuroButton } from "@aurodesignsystem/auro-button"` resolves.
  // A tsconfig `paths` mapping makes resolution deterministic and offline,
  // independent of node_modules layout / package `exports` conditions.
  await mkdir(path.join(cwd, "stubs"), { recursive: true });
  await writeFile(
    path.join(cwd, "stubs", "auro-button.d.ts"),
    "export declare class AuroButton extends HTMLElement {}\n",
    "utf-8",
  );

  // skipLibCheck MUST be false: the artifact is itself a `.d.ts`, so only an
  // un-skipped lib check actually type-checks it.
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
          baseUrl: ".",
          paths: {
            "@aurodesignsystem/auro-button": ["./stubs/auro-button.d.ts"],
          },
          lib: ["ES2020", "DOM"],
          types: [],
        },
        include: [artifact.filename, "stubs/auro-button.d.ts"],
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
    assert.fail(`tsc rejected the emitted JSX .d.ts:\n${output}`);
  }
});
