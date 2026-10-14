/**
 * Where the Code Connect scripts read and write, resolved from the directory the
 * command runs in (see binding-core.mjs for what each path is used for).
 *
 * Standalone repo (`auro-button`): `figma/` at the repo root, source = repo root.
 * Monorepo component (`auro-formkit/components/input`): `figma/` inside the component
 * directory, source = monorepo root (one version, one CHANGELOG), and the root
 * `custom-elements.json` limited to that component's modules.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  COMMON_DESIGN_ATTRIBUTES,
  COMMON_IGNORED_ATTRIBUTES,
  designAttributesFor,
  figmaNodesFor,
} from "./figma-connector.config.js";

export interface FigmaContext {
  cwd: string;
  tag: string;
  /** Committed: `<tag>.translate.md`, `<tag>.mismatch.md`. */
  figmaDir: string;
  /** Committed: the saved Figma data, `<node-id>.json`. */
  snapshotDir: string;
  /** Generated, not committed: `<tag>.cem-map.json`, `<tag>.figma.ts`. */
  genDir: string;
  /** Where `package.json` and `CHANGELOG.md` of the released code are read. */
  sourceDir: string;
  cemPath: string;
  /** Figma component set URLs (each with `?node-id=`) from the config. */
  figmaNodes: string[];
  /** Design-related attribute names from the config; undefined splits nothing. */
  designAttributes?: string[];
  /** The part of `designAttributes` shared by every component; not required to be in a CEM. */
  commonDesignAttributes?: string[];
  /** Attributes left out of every count and binding, whatever the component. */
  ignoredAttributes?: string[];
  /** Limits the CEM to one component's modules in a monorepo. */
  modulePrefix?: string;
}

export type Resolution =
  | { kind: "ready"; ctx: FigmaContext }
  | { kind: "skip"; reason: string }
  | { kind: "error"; message: string };

/** Nearest ancestor (or self) whose package.json has `workspaces`; the start directory if none. */
function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        if (JSON.parse(readFileSync(pkgPath, "utf8")).workspaces) {
          return dir;
        }
      } catch {
        // malformed package.json: keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

interface CemDeclaration {
  customElement?: boolean;
  tagName?: string;
}
interface CemModule {
  path?: string;
  declarations?: CemDeclaration[];
}

function customElementTags(cemPath: string, prefix?: string): string[] {
  const cem = JSON.parse(readFileSync(cemPath, "utf8")) as {
    modules?: CemModule[];
  };
  const tags = (cem.modules ?? [])
    .filter((m) => !prefix || (m.path ?? "").startsWith(prefix))
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.customElement && d.tagName)
    .map((d) => d.tagName as string);
  return [...new Set(tags)];
}

/**
 * Work out the paths, the tag and the Figma component set(s). Only a tag in the
 * config is acted on; anything else resolves to `skip`, so the command can be
 * wired into CI everywhere without breaking repos that have not opted in.
 */
export function resolveFigmaContext(cwd: string): Resolution {
  const root = findMonorepoRoot(cwd);
  const inMonorepo = path.resolve(root) !== path.resolve(cwd);
  const figmaDir = path.join(cwd, "figma");
  const ownCem = path.join(cwd, "custom-elements.json");
  const cemPath = existsSync(ownCem)
    ? ownCem
    : path.join(root, "custom-elements.json");
  const modulePrefix = inMonorepo
    ? `${path.relative(root, cwd).split(path.sep).join("/")}/`
    : undefined;

  const notRegistered = (what: string): Resolution => ({
    kind: "skip",
    reason: `${what} not in the Figma connector config`,
  });

  if (!existsSync(cemPath)) {
    if (!existsSync(figmaDir)) {
      return {
        kind: "skip",
        reason: "no custom-elements.json and no figma/ directory",
      };
    }
    return {
      kind: "error",
      message: `${cemPath} not found. Run \`auro build\` first.`,
    };
  }
  const tags = customElementTags(cemPath, modulePrefix);
  const known = tags.filter((t) => figmaNodesFor(t).length);
  if (!known.length) {
    return notRegistered(
      tags.length
        ? `${tags.join(", ")} is`
        : "no custom element found, and none is",
    );
  }
  if (known.length > 1) {
    return {
      kind: "error",
      message: `more than one custom element in the config here (${known.join(", ")}); expected one per component directory.`,
    };
  }
  const tag = known[0];
  const figmaNodes = figmaNodesFor(tag);

  return {
    kind: "ready",
    ctx: {
      cwd,
      tag,
      figmaDir,
      snapshotDir: path.join(figmaDir, "snapshots"),
      genDir: path.join(cwd, "dist", "figma"),
      sourceDir: inMonorepo ? root : cwd,
      cemPath,
      figmaNodes,
      designAttributes: designAttributesFor(tag),
      commonDesignAttributes: COMMON_DESIGN_ATTRIBUTES,
      ignoredAttributes: COMMON_IGNORED_ATTRIBUTES,
      modulePrefix,
    },
  };
}

export type Step = (argv: string[], ctx: FigmaContext) => Promise<number>;

/**
 * Run the steps in order and return the worst exit code. A bad-input failure (2)
 * stops the run; a stale result (1, `--check` only) lets the later steps still report.
 */
export async function runSteps(
  steps: { argv: string[]; step: Step }[],
  ctx: FigmaContext,
): Promise<number> {
  let worst = 0;
  for (const { argv, step } of steps) {
    const code = await step(argv, ctx);
    worst = Math.max(worst, code);
    if (code === 2) {
      break;
    }
  }
  return worst;
}
