/**
 * The authoritative half of `auro cem-check`: run auro-cli's **real** editor-type
 * builders against the candidate CEM and `tsc --noEmit` their output. Because it
 * exercises the exact consumer path (`buildJsxTypes` / `buildSvelteTypes` → the
 * emitted `.d.ts` → the pinned TypeScript compiler), a CEM change that breaks
 * generation surfaces here as a non-zero result — even when the static rules pass.
 *
 * The mechanism (temp project + stubs + `execFileSync(tsc)`) is the runtime
 * counterpart of the test smokes
 * ([init.editors.tsc-smoke.test.ts](../../../test/init.editors.tsc-smoke.test.ts),
 * [init.editors.svelte-event-collision.test.ts](../../../test/init.editors.svelte-event-collision.test.ts));
 * JSX and Svelte compile in separate throwaway projects, exactly as those tests do,
 * so neither artifact's global augmentations contaminate the other.
 *
 * @see docs/cem-contract-enforcement.md → "End-to-end generation smoke".
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import type { CemFinding } from "#init/cem-check/rules.js";
import { buildJsxTypes } from "#init/editors/jsxTypes.js";
import type { EditorArtifact } from "#init/editors/manifest.js";
import { withTempDir } from "#init/editors/manifest.js";
import { buildSvelteTypes } from "#init/editors/svelteTypes.js";
import type { ResolvedComponent } from "#init/resolver.js";

const require = createRequire(import.meta.url);
/** The project's own pinned `tsc` — versioned with the CLI, no PATH dependency. */
const TSC = require.resolve("typescript/bin/tsc");

/** The global-JSX shim svelte2tsx output references (its only external symbol). */
const JSX_SHIM =
  "declare namespace JSX {\n" +
  "  type Element = unknown;\n" +
  "  interface CSSProperties {}\n" +
  "}\n";

/** Turn an import specifier into a safe stub filename. */
function stubFileFor(importPath: string): string {
  return `${importPath.replace(/[^a-zA-Z0-9]+/gu, "_")}.d.ts`;
}

/**
 * Parse the `import type { A, B as C } from "path"` statements the JSX artifact
 * emits into `path → {exported names}`. Driving the stubs off the artifact's real
 * imports (rather than only the component classes) means a cross-package type
 * reference the CEM points at another subpath — common in a monorepo like
 * auro-formkit — gets a matching stub too, instead of a false `no exported member`
 * failure. Only import statements at the start of a line are matched, so the
 * `import type { ScopedElements } …` example inside the tool's doc comment is
 * ignored. Each name is stubbed as a real class (usable both as a value and, as the
 * artifact does with `BaseProps<AuroButton>`, as a type).
 */
function importedNamesByPath(source: string): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();
  const re =
    /^[ \t]*import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gmu;
  for (const match of source.matchAll(re)) {
    const names = match[1]
      .split(",")
      .map((entry) =>
        entry
          .trim()
          .split(/\s+as\s+/u)[0]
          .trim(),
      )
      .filter(Boolean);
    if (names.length === 0) {
      continue;
    }
    const set = byPath.get(match[2]) ?? new Set<string>();
    for (const name of names) {
      set.add(name);
    }
    byPath.set(match[2], set);
  }
  return byPath;
}

/** Write `tsconfig.json` into `cwd` with the shared smoke compiler options. */
function writeTsconfig(
  cwd: string,
  include: string[],
  paths?: Record<string, string[]>,
): void {
  writeFileSync(
    join(cwd, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          noEmit: true,
          // The artifacts are themselves `.d.ts`, so only an un-skipped lib check
          // actually type-checks them.
          skipLibCheck: false,
          strict: false,
          // The condition under which the native-vs-CEM event collision surfaces
          // as a real error (handler params checked contravariantly).
          strictFunctionTypes: true,
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          ...(paths && { baseUrl: ".", paths }),
          lib: ["ES2020", "DOM"],
          types: [],
        },
        include,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

/** Write an artifact into `cwd`, creating its parent directory. */
function writeArtifact(cwd: string, artifact: EditorArtifact): void {
  const dest = join(cwd, artifact.filename);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, artifact.contents, "utf-8");
}

/**
 * Compile `artifact` under a throwaway `tsc` project. Returns `null` on success, or
 * one `error` finding carrying the compiler diagnostics on failure.
 */
function compile(
  label: string,
  artifact: EditorArtifact,
  setup: (cwd: string) => void,
): CemFinding | null {
  return withTempDir((cwd) => {
    writeArtifact(cwd, artifact);
    setup(cwd);
    try {
      execFileSync(process.execPath, [TSC, "-p", "tsconfig.json"], {
        cwd,
        stdio: "pipe",
      });
      return null;
    } catch (error) {
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      const output = `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`;
      return {
        rule: "generation-smoke",
        severity: "error" as const,
        element: label,
        message: `the generated ${label} \`.d.ts\` does not type-check — this CEM breaks the editor tooling:\n${output.trim()}`,
      };
    }
  });
}

/**
 * Build the JSX and Svelte artifacts from `components` and type-check each. A build
 * throw or a `tsc` rejection becomes an `error` finding; a clean run returns `[]`.
 * Tags are passed through unchanged (identity map) — `cem-check` validates the CEM
 * as authored, without a consumer's tag overrides.
 */
export function runGenerationSmoke(
  components: readonly ResolvedComponent[],
): CemFinding[] {
  if (components.length === 0) {
    return [];
  }
  const identityTags = new Map(components.map((c) => [c.tagName, c.tagName]));
  const findings: CemFinding[] = [];

  // JSX — the artifact emits `import type { <Class> } from "<importPath>"` (and, in a
  // monorepo, cross-package type references). Stub every imported name as a real class
  // via a `paths` mapping (deterministic, offline, independent of node_modules layout).
  // The names come from the artifact itself, so a cross-package reference resolves too
  // — the smoke validates the generated structure and inlined `type.text`, not whether
  // the real package happens to export that symbol (the shipped Auro packages ship
  // unresolvable class types anyway; the class import is unused under `useCemTypes`).
  try {
    const jsx = buildJsxTypes(components, identityTags);
    const importsByPath = importedNamesByPath(jsx.contents);
    const jsxFinding = compile("JSX", jsx, (cwd) => {
      mkdirSync(join(cwd, "stubs"), { recursive: true });
      const paths: Record<string, string[]> = {};
      const include = [jsx.filename];
      for (const [importPath, names] of importsByPath) {
        const file = stubFileFor(importPath);
        writeFileSync(
          join(cwd, "stubs", file),
          `${[...names]
            .map(
              (name) => `export declare class ${name} extends HTMLElement {}`,
            )
            .join("\n")}\n`,
          "utf-8",
        );
        paths[importPath] = [`./stubs/${file}`];
        include.push(`stubs/${file}`);
      }
      writeTsconfig(cwd, include, paths);
    });
    if (jsxFinding) {
      findings.push(jsxFinding);
    }
  } catch (error) {
    findings.push({
      rule: "generation-build",
      severity: "error",
      element: "JSX",
      message: `JSX type generation threw for this CEM: ${(error as Error).message}`,
    });
  }

  // Svelte — inlines CEM `type.text`, so it imports no package class; its only
  // external reference is svelte2tsx's global JSX namespace, satisfied by the shim.
  try {
    const svelte = buildSvelteTypes(components, identityTags);
    const svelteFinding = compile("Svelte", svelte, (cwd) => {
      mkdirSync(join(cwd, "stubs"), { recursive: true });
      writeFileSync(join(cwd, "stubs", "jsx-shim.d.ts"), JSX_SHIM, "utf-8");
      writeTsconfig(cwd, [svelte.filename, "stubs/jsx-shim.d.ts"]);
    });
    if (svelteFinding) {
      findings.push(svelteFinding);
    }
  } catch (error) {
    findings.push({
      rule: "generation-build",
      severity: "error",
      element: "Svelte",
      message: `Svelte type generation threw for this CEM: ${(error as Error).message}`,
    });
  }

  return findings;
}
