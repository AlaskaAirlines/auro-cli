/**
 * Regression — a component's own CEM event must win over the shared native
 * `BaseEvents` block when their names collide.
 *
 * The Svelte artifact maps each element as
 * `Partial<<Name>Props & BaseProps & Omit<BaseEvents, keyof <Name>Props>>`. The
 * `Omit` (added by `overrideCollidingBaseEvents` in svelteTypes.ts) is what makes
 * a CEM-declared event named like a native one (`click`, `input`, …) resolve to
 * the component's `CustomEvent` handler rather than the intersection of that
 * handler with the native `(e: Event | MouseEvent) => void` — which used to reject
 * a legitimate `CustomEvent` handler outright.
 *
 * The byte-exact golden ({@link ../src/init/editors/svelteTypes.ts} → builders
 * test) locks the mapping-line *shape*; this test proves the *semantics* by
 * compiling a consumer against the real artifact. It uses `strictFunctionTypes`
 * (svelte2tsx checks handler assignability contravariantly — that strictness is
 * why the collision surfaced in the field; the sibling tsc-smoke test runs
 * non-strict and would not reproduce it).
 *
 * The synthetic `AuroButton` in {@link ./support.editors.ts} declares a `click`
 * event, so `myapp-button`'s `onclick` is the collision fixture — no bespoke
 * component needed.
 *
 * @see test/init.editors.svelte-tsc-smoke.test.ts (the artifact-compiles smoke).
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

test("a CEM event wins over the colliding native BaseEvents handler", async (t) => {
  const cwd = await tempCwd(t);

  // Build the artifact exactly as `init` would, over the shared synthetic set.
  const artifact = buildSvelteTypes(COMPONENTS, RESOLVED_TAGS);
  await mkdir(path.join(cwd, path.dirname(artifact.filename)), {
    recursive: true,
  });
  await writeFile(path.join(cwd, artifact.filename), artifact.contents, "utf-8");

  // Stand in for svelte2tsx's global JSX namespace (the artifact's only external
  // reference), exactly as the smoke test does.
  await mkdir(path.join(cwd, "stubs"), { recursive: true });
  await writeFile(
    path.join(cwd, "stubs", "jsx-shim.d.ts"),
    "declare namespace JSX {\n" +
      "  type Element = unknown;\n" +
      "  interface CSSProperties {}\n" +
      "}\n",
    "utf-8",
  );

  // Consumer asserting the fix at the type level. `myapp-button` declares a CEM
  // `click` event, so after the Omit fix its `onclick` is the CustomEvent handler
  // alone; the native `(e: MouseEvent)` half is gone.
  await writeFile(
    path.join(cwd, "consumer.ts"),
    [
      'type OnClick = NonNullable<svelteHTML.IntrinsicElements["myapp-button"]["onclick"]>;',
      "// The component's own CustomEvent handler must be accepted.",
      "const good: OnClick = (e: CustomEvent) => { void e.detail; };",
      "void good;",
      "// @ts-expect-error native MouseEvent handler is intentionally rejected now (component event wins).",
      "const bad: OnClick = (e: MouseEvent) => { void e.clientX; };",
      "void bad;",
      "",
    ].join("\n"),
    "utf-8",
  );

  // strictFunctionTypes ON so handler params are checked contravariantly (the
  // condition under which the collision is a real error); the rest stays lax so
  // the artifact itself compiles as it does in the smoke test.
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          noEmit: true,
          skipLibCheck: false,
          strict: false,
          strictFunctionTypes: true,
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2020", "DOM"],
          types: [],
        },
        include: [artifact.filename, "stubs/jsx-shim.d.ts", "consumer.ts"],
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
    assert.fail(
      "component-event-wins regression failed — a CEM CustomEvent handler was " +
        `rejected, or the native handler was NOT rejected:\n${output}`,
    );
  }
});
