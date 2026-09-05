/**
 * Regression — a component's own CEM member must win over the shared native
 * `BaseProps`/`BaseEvents` blocks when their names collide.
 *
 * The Svelte artifact maps each element as
 * `Partial<<Name>Props & Omit<BaseProps & BaseEvents, keyof <Name>Props>>`. The
 * `Omit` (added by `overrideCollidingBaseMembers` in svelteTypes.ts) is what makes
 * a member the component redeclares resolve to the component's own type rather than
 * the intersection of that type with the base copy. Two collision families, both
 * of which used to reject a legitimate value:
 *
 *   • Events — a CEM event named like a native one (`click`, `input`, …) would
 *     become `((e: CustomEvent) => void) & ((e: Event) => void)`, rejecting the
 *     component's CustomEvent handler (parameter contravariance).
 *   • Attributes — a CEM attribute whose type differs from the injected global
 *     (auro-button's `tabindex: string` vs the global `tabindex: number`) would
 *     become `string & number` = `never` → `undefined` under `Partial<>`, rejecting
 *     even a valid `tabindex="0"`. Here the winner is REVERSED — the global's
 *     coercion-aware `number` wins over the CEM's raw `string` (see
 *     `overrideCollidingBaseMembers`).
 *
 * The byte-exact golden ({@link ../src/init/editors/svelteTypes.ts} → builders
 * test) locks the mapping-line *shape*; this test proves the *semantics* by
 * compiling a consumer against the real artifact. It uses `strictFunctionTypes`
 * (svelte2tsx checks handler assignability contravariantly — that strictness is
 * why the event collision surfaced in the field; the sibling tsc-smoke test runs
 * non-strict and would not reproduce it).
 *
 * The event case rides the shared synthetic `AuroButton.click`
 * ({@link ./support.editors.ts}); the attribute case needs a component that
 * redeclares a global with a conflicting type, so it builds a bespoke component
 * that declares `tabindex: string` (mirroring real auro-button).
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
import type { ResolvedComponent } from "../src/init/resolver.ts";
import { COMPONENTS, RESOLVED_TAGS } from "./support.editors.ts";
import { tempCwd } from "./support.ts";

const require = createRequire(import.meta.url);
/** The project's own pinned `tsc` entry — no global/PATH dependency. */
const TSC = require.resolve("typescript/bin/tsc");

/**
 * Build the Svelte artifact for `components`/`tags`, drop it next to a `consumer.ts`
 * whose `lines` assert the fix at the type level, and compile both under a
 * `strictFunctionTypes` program. Throws (failing the test) on any tsc diagnostic —
 * an unsatisfied `@ts-expect-error` included.
 */
async function compileConsumer(
  t: import("node:test").TestContext,
  components: ResolvedComponent[],
  tags: ReadonlyMap<string, string>,
  lines: string[],
): Promise<void> {
  const cwd = await tempCwd(t);

  // Build the artifact exactly as `init` would.
  const artifact = buildSvelteTypes(components, tags);
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

  await writeFile(
    path.join(cwd, "consumer.ts"),
    `${lines.join("\n")}\n`,
    "utf-8",
  );

  // strictFunctionTypes ON so handler params are checked contravariantly (the
  // condition under which the event collision is a real error); the rest stays lax
  // so the artifact itself compiles as it does in the smoke test.
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
    assert.fail(`component-wins regression failed:\n${output}`);
  }
}

test("a CEM event wins over the colliding native BaseEvents handler", async (t) => {
  // `myapp-button` declares a CEM `click` event, so after the Omit its `onclick` is
  // the CustomEvent handler alone; the native `(e: MouseEvent)` half is gone.
  await compileConsumer(t, COMPONENTS, RESOLVED_TAGS, [
    'type OnClick = NonNullable<svelteHTML.IntrinsicElements["myapp-button"]["onclick"]>;',
    "// The component's own CustomEvent handler must be accepted.",
    "const good: OnClick = (e: CustomEvent) => { void e.detail; };",
    "void good;",
    "// @ts-expect-error native MouseEvent handler is intentionally rejected now (component event wins).",
    "const bad: OnClick = (e: MouseEvent) => { void e.clientX; };",
    "void bad;",
  ]);
});

test("a CEM attribute wins over the colliding injected global attribute", async (t) => {
  // A component that redeclares a global attribute with a conflicting type — real
  // auro-button documents `tabindex` as a `string` (its `.tabindex` property form),
  // which collides with the injected global `tabindex: number`. The global wins
  // (its coercion-aware `number` is what `tabindex="0"` needs), so the resolved
  // type is `number`. Without the fix the member intersects to `string & number` =
  // `never` → `undefined` under Partial, and the `good` assertion below fails.
  const WIDGET: ResolvedComponent = {
    pkg: "@aurodesignsystem/auro-widget",
    version: "1.0.0",
    tagName: "auro-widget",
    importPath: "@aurodesignsystem/auro-widget",
    isMonorepo: false,
    declaration: {
      kind: "class",
      name: "AuroWidget",
      tagName: "auro-widget",
      customElement: true,
      description: "A widget that documents tabindex as a string.",
      superclass: { name: "LitElement" },
      attributes: [
        {
          name: "tabindex",
          fieldName: "tabindex",
          description: "Tab order, as a string property form.",
          type: { text: "string" },
        },
      ],
      slots: [],
      events: [],
    },
  };
  const tags = new Map([["auro-widget", "myapp-widget"]]);

  await compileConsumer(t, [WIDGET], tags, [
    'type TabIndex = NonNullable<svelteHTML.IntrinsicElements["myapp-widget"]["tabindex"]>;',
    "// The injected global `number` must win — a numeric value is accepted.",
    "const good: TabIndex = 0;",
    "void good;",
    "// @ts-expect-error the CEM's `string` typing is dropped in favor of the global number.",
    'const bad: TabIndex = "0";',
    "void bad;",
  ]);
});
