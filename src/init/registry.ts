/**
 * Resolve each installed component's canonical `auro-*` tag to the tag the
 * consumer project actually registers, producing the `resolvedTags`
 * `Map<canonical-tag, custom-tag>` the generator (`generator.ts`) consumes.
 *
 * Resolution precedence is **config → AST scan → default prefix** (the frozen
 * decision): an explicit `auro.config.json` override wins; else a
 * statically-detected `register('<tag>')` in consumer source; else the default
 * prefix is applied. Anything unresolvable is **warned, never guessed**.
 *
 * This module is a PURE PLANNER plus two thin IO wrappers (`loadConfig`/
 * `saveConfig`, `scanProject`). It performs no prompting: the interactive prefix
 * prompt, the majority-confirm, and the non-interactive TTY/CI guard live in the
 * `init` command (build-order step 6), which consumes {@link planTagResolution}.
 *
 * **Two-phase caller contract.** Call {@link planTagResolution} once. If the plan
 * reports `needsDefaultPrefix`, obtain a prefix (prompt/confirm `suggestedDefault`,
 * take `--prefix`, or fail cleanly in CI) and **re-call** with that `prefix` to get
 * the authoritative `resolvedTags` + `config`. Only persist (`saveConfig`) a plan
 * whose `needsDefaultPrefix` is `false`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import ts from "typescript";
import {
  type AuroConfig,
  CONFIG_FILENAME,
  CONFIG_VERSION,
} from "#init/config.js";
import type { ResolvedComponent } from "#init/resolver.js";

const AURO_PREFIX = "auro-";

/** A registry-layer failure with a caller-presentable message. */
export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

// ---------------------------------------------------------------------------
// Config IO
// ---------------------------------------------------------------------------

/** A fresh, empty config with the given default prefix (`""` = bare/no prefix). */
export function emptyConfig(defaultPrefix = ""): AuroConfig {
  return {
    version: CONFIG_VERSION,
    init: { prefix: { default: defaultPrefix, overrides: {} } },
  };
}

/**
 * Structurally validate a parsed value against the frozen {@link AuroConfig}
 * shape. Returns the narrowed config or throws {@link RegistryError} — a newer
 * `version` is an explicit, actionable failure (the format-freeze contract), not
 * a silent best-effort read.
 */
function assertConfig(value: unknown, source: string): AuroConfig {
  const obj = value as Partial<AuroConfig> | null;
  if (!obj || typeof obj !== "object") {
    throw new RegistryError(`${source}: not a JSON object.`);
  }
  if (obj.version !== CONFIG_VERSION) {
    throw new RegistryError(
      `${source}: unsupported config version ${String(obj.version)} (expected ${CONFIG_VERSION}). Upgrade the CLI or remove the file.`,
    );
  }
  const prefix = obj.init?.prefix;
  if (
    !prefix ||
    typeof prefix.default !== "string" ||
    typeof prefix.overrides !== "object" ||
    prefix.overrides === null
  ) {
    throw new RegistryError(`${source}: malformed init.prefix block.`);
  }
  return obj as AuroConfig;
}

/**
 * Read `<cwd>/auro.config.json`. Returns `null` when the file is absent (a
 * first-run project), or the validated {@link AuroConfig}. Throws
 * {@link RegistryError} on malformed or unsupported-version JSON.
 */
export function loadConfig(cwd: string): AuroConfig | null {
  const file = path.join(cwd, CONFIG_FILENAME);
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegistryError(`${CONFIG_FILENAME}: invalid JSON.`);
  }
  return assertConfig(parsed, CONFIG_FILENAME);
}

/** Write `<cwd>/auro.config.json` as pretty JSON with a trailing newline. */
export function saveConfig(cwd: string, config: AuroConfig): void {
  const file = path.join(cwd, CONFIG_FILENAME);
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// AST scan — read-only detection of existing register('<tag>') calls
// ---------------------------------------------------------------------------

/** A statically-resolvable `<Class>.register('<tag>')` found in consumer source. */
export interface RegistrationMatch {
  /** The callee object identifier (e.g. `AuroInput`), when it is a plain name. */
  className?: string;
  /** The literal tag passed to `register(...)`. */
  tag: string;
}

/** The result of scanning source: resolvable matches plus skip/parse warnings. */
export interface RegistrationScan {
  matches: RegistrationMatch[];
  /**
   * Callee class names that called `register()` with **no argument** — the
   * canonical default-tag registration (e.g. `AuroButton.register()` registers
   * `<auro-button>`). Optional so callers may omit it; the planner reads it to
   * warn when a default registration is grounded under a custom prefix.
   */
  defaultRegistrations?: string[];
  warnings: string[];
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".ts":
    case ".mts":
    case ".cts":
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.JS;
  }
}

/**
 * A statically-resolvable tag argument is a plain string literal or a backtick
 * string with no `${}` substitutions (a `NoSubstitutionTemplateLiteral`).
 */
function staticTag(arg: ts.Expression | undefined): string | null {
  if (!arg) {
    return null;
  }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return arg.text;
  }
  return null;
}

/**
 * Scan one source string for `<Class>.register('<tag>')` calls. Purely syntactic
 * (`ts.createSourceFile`, no type-checker): captures every call whose first
 * argument is a static tag. A `register()` with **no argument** is the canonical
 * default-tag registration — recorded (by callee class name) in
 * `defaultRegistrations`, never warned, since the tag is known (the component's
 * `auro-*` tag). Any `.register(...)` whose tag is a template with substitutions,
 * an identifier, a call, or a spread is warned and skipped — the scan never
 * guesses a computed tag. A parse failure warns and yields no matches for that
 * file rather than throwing.
 */
export function scanSource(filePath: string, source: string): RegistrationScan {
  const matches: RegistrationMatch[] = [];
  const defaultRegistrations: string[] = [];
  const warnings: string[] = [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.ES2022,
      /* setParentNodes */ true,
      scriptKindFor(filePath),
    );
  } catch {
    return {
      matches,
      defaultRegistrations,
      warnings: [`${filePath}: could not be parsed; skipped.`],
    };
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "register"
    ) {
      const object = node.expression.expression;
      const className = ts.isIdentifier(object) ? object.text : undefined;

      if (node.arguments.length === 0) {
        // A no-arg register() uses the component's canonical default tag. Record
        // it (when the callee is a plain class name) so the planner can flag an
        // app-vs-grounding mismatch under a custom prefix; a callee we cannot name
        // is not actionable, so drop it silently.
        if (className) {
          defaultRegistrations.push(className);
        }
      } else {
        const tag = staticTag(node.arguments[0]);
        if (tag === null) {
          warnings.push(
            `${filePath}: register() with a non-literal tag could not be resolved; skipped.`,
          );
        } else {
          matches.push({ className, tag });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { matches, defaultRegistrations, warnings };
}

/**
 * Scan the project's own sources under `cwd` for existing registrations. Globs
 * `**\/*.{js,jsx,ts,tsx,mjs,cjs}` (excluding `node_modules`/`dist`/`build`/
 * `coverage` — Auro's own `static register` defaults would be false positives),
 * reads each file, and aggregates {@link scanSource}. A read failure on one file
 * warns and continues.
 */
export function scanProject(cwd: string): RegistrationScan {
  const files = globSync("**/*.{js,jsx,ts,tsx,mjs,cjs}", {
    cwd,
    absolute: true,
    nodir: true,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
    ],
  });

  const matches: RegistrationMatch[] = [];
  const defaultRegistrations: string[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf-8");
    } catch {
      warnings.push(`${file}: could not be read; skipped.`);
      continue;
    }
    const scan = scanSource(file, source);
    matches.push(...scan.matches);
    defaultRegistrations.push(...(scan.defaultRegistrations ?? []));
    warnings.push(...scan.warnings);
  }
  return { matches, defaultRegistrations, warnings };
}

// ---------------------------------------------------------------------------
// Prefix inference
// ---------------------------------------------------------------------------

/** The bare component base of a canonical tag: `auro-input` → `input`. */
function baseOf(canonicalTag: string): string {
  return canonicalTag.startsWith(AURO_PREFIX)
    ? canonicalTag.slice(AURO_PREFIX.length)
    : canonicalTag;
}

/**
 * Infer the prefix that turns a canonical tag into a custom tag: for
 * `auro-input` → `legacy-input` the prefix is `legacy-`. Returns `null` when the
 * custom tag is a full rename (does not end with the component base), and so
 * carries no reusable prefix.
 */
export function inferPrefixFromTag(
  canonicalTag: string,
  customTag: string,
): string | null {
  const base = baseOf(canonicalTag);
  if (!customTag.endsWith(base)) {
    return null;
  }
  return customTag.slice(0, customTag.length - base.length);
}

/** The most common default prefix suggested by existing registrations. */
export interface PrefixSuggestion {
  /** The majority real prefix, or `undefined` when none is inferable. */
  suggestion?: string;
  /** True when two or more distinct real prefixes were seen (a conflict). */
  mixed: boolean;
}

/**
 * Suggest a default prefix from a set of inferred prefixes. Empty and bare
 * (`auro-`) prefixes are not real custom registrations and are ignored. Returns
 * the most frequent remaining prefix and whether the real prefixes disagree.
 */
export function suggestDefaultPrefix(
  prefixes: readonly (string | null)[],
): PrefixSuggestion {
  const counts = new Map<string, number>();
  for (const prefix of prefixes) {
    if (!prefix || prefix === AURO_PREFIX) {
      continue;
    }
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return { mixed: false };
  }
  let suggestion: string | undefined;
  let best = -1;
  for (const [prefix, count] of counts) {
    if (count > best) {
      best = count;
      suggestion = prefix;
    }
  }
  return { suggestion, mixed: counts.size > 1 };
}

// ---------------------------------------------------------------------------
// Tag-resolution planner
// ---------------------------------------------------------------------------

/** Existing registrations reconciled to their component's canonical tag. */
interface Reconciled {
  /** canonical `auro-*` tag → the custom tag detected for it. */
  overrides: Map<string, string>;
  /** canonical `auro-*` tag → callee class name that registered its default tag. */
  defaultRegistered: Map<string, string>;
  warnings: string[];
}

/**
 * Tie each scanned registration to an installed component by matching the
 * callee class name against the component's declaration `name`. A static-tag
 * match whose class name is missing or unknown among the components is warned (a
 * `register()` we cannot attribute to an installed component) and dropped. No-arg
 * default registrations are tied the same way, but an untieable one is dropped
 * silently — a bare `register()` on an unknown class is not actionable.
 */
function reconcileRegistrations(
  components: readonly ResolvedComponent[],
  matches: readonly RegistrationMatch[],
  defaultRegistrations: readonly string[] = [],
): Reconciled {
  const byClassName = new Map<string, string>();
  for (const component of components) {
    byClassName.set(component.declaration.name, component.tagName);
  }

  const overrides = new Map<string, string>();
  const warnings: string[] = [];
  for (const match of matches) {
    const canonical = match.className
      ? byClassName.get(match.className)
      : undefined;
    if (!canonical) {
      warnings.push(
        `Found register('${match.tag}')${match.className ? ` on ${match.className}` : ""} but could not tie it to an installed Auro component; ignored.`,
      );
      continue;
    }
    overrides.set(canonical, match.tag);
  }

  const defaultRegistered = new Map<string, string>();
  for (const className of defaultRegistrations) {
    const canonical = byClassName.get(className);
    if (canonical) {
      defaultRegistered.set(canonical, className);
    }
  }
  return { overrides, defaultRegistered, warnings };
}

/** Options controlling {@link planTagResolution}. */
export interface PlanOptions {
  /** The loaded `auro.config.json`, if the project has one. */
  config?: AuroConfig | null;
  /** The result of scanning consumer source for existing registrations. */
  scan?: RegistrationScan;
  /** An explicit default prefix (from `--prefix`), overriding the config default. */
  prefix?: string;
}

/** The outcome of planning tag resolution for an installed component set. */
export interface TagResolutionPlan {
  /** canonical `auro-*` tag → resolved custom tag, for every resolvable component. */
  resolvedTags: Map<string, string>;
  /** The config to persist once `needsDefaultPrefix` is `false`. */
  config: AuroConfig;
  /** Canonical tags with no override/scan match, awaiting a default prefix. */
  needingDefault: string[];
  /** True when components await a default prefix but none is known yet. */
  needsDefaultPrefix: boolean;
  /** Majority prefix suggested from existing registrations, when any. */
  suggestedDefault?: string;
  /** True when existing registrations imply two or more distinct prefixes. */
  mixedPrefixes: boolean;
  /** Non-fatal warnings (bare `auro-*` defaults, unresolvable registrations). */
  warnings: string[];
}

/**
 * Apply a default prefix to a canonical tag. A missing or bare (`auro-`) prefix
 * yields the canonical tag unchanged (the component keeps its `auro-*` tag);
 * otherwise the `auro-` prefix is replaced, e.g. `myapp-` + `auro-button` →
 * `myapp-button`.
 */
function applyPrefix(prefix: string, canonicalTag: string): string {
  if (!prefix || prefix === AURO_PREFIX) {
    return canonicalTag;
  }
  return prefix + baseOf(canonicalTag);
}

/**
 * Plan the resolved custom tag for every installed component, following the
 * frozen **config → scan → default prefix** precedence. Pure: performs no IO and
 * no prompting. When some components still need the default prefix and none is
 * known (`needsDefaultPrefix`), the caller resolves a prefix (prompt/`--prefix`/
 * CI-fail) and re-calls with it; the returned `config` is authoritative only once
 * `needsDefaultPrefix` is `false`.
 */
export function planTagResolution(
  components: readonly ResolvedComponent[],
  options: PlanOptions = {},
): TagResolutionPlan {
  const { config, scan, prefix } = options;
  const configOverrides = config?.init.prefix.overrides ?? {};
  const reconciled = reconcileRegistrations(
    components,
    scan?.matches ?? [],
    scan?.defaultRegistrations ?? [],
  );

  // The effective default: an explicit --prefix wins over a persisted config
  // default. `undefined` means "not yet known" (distinct from a bare "").
  const configDefault = config?.init.prefix.default;
  const effectiveDefault = prefix ?? configDefault;

  const resolvedTags = new Map<string, string>();
  const persistOverrides: Record<string, string> = { ...configOverrides };
  const needingDefault: string[] = [];
  const warnings = [...(scan?.warnings ?? []), ...reconciled.warnings];

  for (const component of components) {
    const tag = component.tagName;

    const fromConfig = configOverrides[tag];
    if (fromConfig !== undefined) {
      resolvedTags.set(tag, fromConfig);
      continue;
    }

    const fromScan = reconciled.overrides.get(tag);
    if (fromScan !== undefined) {
      resolvedTags.set(tag, fromScan);
      persistOverrides[tag] = fromScan; // detected registrations are persisted
      continue;
    }

    if (effectiveDefault === undefined) {
      needingDefault.push(tag);
      continue;
    }

    const resolved = applyPrefix(effectiveDefault, tag);
    resolvedTags.set(tag, resolved);
    if (resolved === tag) {
      warnings.push(
        `${tag}: no custom prefix — grounding it under its bare 'auro-*' tag. Pass a prefix to avoid registration collisions.`,
      );
    }
  }

  // A component the consumer registers with the default no-arg register() keeps
  // its canonical `auro-*` tag at runtime. If we grounded it under a custom tag
  // (a prefix or a config/scan override), the app and AGENTS.md diverge — warn so
  // the user updates their register() call. Never rewrite their source (v1 docs).
  for (const [canonical, className] of reconciled.defaultRegistered) {
    const resolved = resolvedTags.get(canonical);
    if (resolved !== undefined && resolved !== canonical) {
      warnings.push(
        `${className}.register() uses the default '<${canonical}>' tag, but this project grounds it as '<${resolved}>'. Update the register() call to '${resolved}' so your app matches AGENTS.md.`,
      );
    }
  }

  // Suggest a default from every real (config + scanned) custom registration.
  const inferred = [
    ...Object.entries(configOverrides),
    ...reconciled.overrides,
  ].map(([canonical, custom]) => inferPrefixFromTag(canonical, custom));
  const { suggestion, mixed } = suggestDefaultPrefix(inferred);

  const needsDefaultPrefix =
    needingDefault.length > 0 && effectiveDefault === undefined;

  const persistedDefault = effectiveDefault ?? suggestion ?? "";
  const persistConfig: AuroConfig = {
    version: CONFIG_VERSION,
    init: {
      prefix: { default: persistedDefault, overrides: persistOverrides },
    },
  };

  return {
    resolvedTags,
    config: persistConfig,
    needingDefault,
    needsDefaultPrefix,
    suggestedDefault: suggestion,
    mixedPrefixes: mixed,
    warnings,
  };
}
