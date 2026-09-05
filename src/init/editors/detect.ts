/**
 * Read-only detection heuristics that pick a sensible **default** for each
 * editor-IntelliSense target when the consumer hasn't settled it via a flag or a
 * persisted `auro.config.json` choice. Every probe is a cheap, offline filesystem
 * look — never a network call, never a write — so it is safe to run on every
 * `auro init`, interactive or CI.
 *
 * These signals are only ever a *default*: the frozen precedence is
 * flag → persisted config → **detection** → interactive prompt. On an interactive
 * TTY the detected value seeds the confirm prompt; on a non-interactive/CI run
 * with no flag and no persisted choice it is taken as-is and recorded (an editor
 * target has a safe default, so — unlike the prefix — `init` never CI-fails over
 * it). See docs/pt-m2-completion-plan.md → "Frozen decisions → Detection / prompt
 * / flags".
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { VSCODE_DIR } from "#init/editors/layout.js";

/** Per-target on/off selection — the shape persisted under `init.editors`. */
export interface EditorSelection {
  /** VS Code HTML custom-data (`.vscode/auro.html-custom-data.json`). */
  vscode: boolean;
  /** JSX/React type declarations (`auro-types/auro-jsx.d.ts`). */
  jsx: boolean;
  /** Svelte type declarations (`auro-types/auro-svelte.d.ts`). */
  svelte: boolean;
  /** VS Code CSS `::part()` snippets (`.vscode/auro.code-snippets`). */
  cssSnippets: boolean;
}

/** The editor targets, in the order `init` resolves and reports them. */
export const EDITOR_TARGETS = [
  "vscode",
  "jsx",
  "svelte",
  "cssSnippets",
] as const;

/** One editor target key (`"vscode" | "jsx" | "svelte" | "cssSnippets"`). */
export type EditorTarget = (typeof EDITOR_TARGETS)[number];

/** True when `<cwd>/<rel>` exists and is a directory. */
function isDir(cwd: string, rel: string): boolean {
  try {
    return statSync(path.join(cwd, rel)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The union of `dependencies` + `devDependencies` names from `<cwd>/package.json`,
 * or an empty set when the file is absent or unreadable/malformed (detection never
 * throws — a bad manifest just yields no dependency signal).
 */
function dependencyNames(cwd: string): Set<string> {
  try {
    const raw = readFileSync(path.join(cwd, "package.json"), "utf-8");
    const pkg = parseJsonc(raw, [], { allowTrailingComma: true }) as
      | {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        }
      | undefined;
    if (typeof pkg !== "object" || pkg === null) {
      return new Set();
    }
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

/**
 * VS Code target signal: the project already keeps a `.vscode/` directory (it
 * uses VS Code workspace settings), so wiring HTML custom-data into it is apt.
 */
export function detectVsCode(cwd: string): boolean {
  return isDir(cwd, VSCODE_DIR);
}

/**
 * CSS `::part()` snippets target signal: the project keeps a `.vscode/`
 * directory, so it uses VS Code, which auto-discovers the `.code-snippets` file
 * we write there. Same signal as {@link detectVsCode} — the snippets are a VS
 * Code feature — kept as its own named probe so the target reads independently.
 */
export function detectCssSnippets(cwd: string): boolean {
  return isDir(cwd, VSCODE_DIR);
}

/**
 * JSX/React target signal: the TypeScript config turns on JSX
 * (`compilerOptions.jsx` is set) **or** `react` is a (dev)dependency. Either means
 * the project authors `.tsx`/`.jsx` and would benefit from the JSX `.d.ts`.
 */
export function detectJsx(cwd: string): boolean {
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    try {
      const raw = readFileSync(tsconfigPath, "utf-8");
      const tsconfig = parseJsonc(raw, [], { allowTrailingComma: true }) as
        | { compilerOptions?: { jsx?: unknown } }
        | undefined;
      if (
        typeof tsconfig === "object" &&
        tsconfig !== null &&
        tsconfig.compilerOptions?.jsx !== undefined
      ) {
        return true;
      }
    } catch {
      // Unparseable tsconfig — fall through to the dependency signal.
    }
  }
  return dependencyNames(cwd).has("react");
}

/**
 * Svelte target signal: `svelte` is a (dev)dependency **or** a `svelte.config.*`
 * lives at the project root — either means a Svelte project whose language server
 * consumes the Svelte `.d.ts`.
 */
export function detectSvelte(cwd: string): boolean {
  if (dependencyNames(cwd).has("svelte")) {
    return true;
  }
  return ["js", "ts", "mjs", "cjs"].some((ext) =>
    existsSync(path.join(cwd, `svelte.config.${ext}`)),
  );
}

/** Run every target probe against `cwd` and return the detected defaults. */
export function detectEditorSignals(cwd: string): EditorSelection {
  return {
    vscode: detectVsCode(cwd),
    jsx: detectJsx(cwd),
    svelte: detectSvelte(cwd),
    cssSnippets: detectCssSnippets(cwd),
  };
}
