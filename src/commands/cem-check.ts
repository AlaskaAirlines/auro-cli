/**
 * `auro cem-check <path>` — the executable CEM contract (layer 1 of the CEM
 * contract-enforcement effort). Validates a `custom-elements.json` two ways:
 *
 *  - **Static rules** ([rules.ts](#init/cem-check/rules.ts)) report what auro-cli's
 *    defensive prune would otherwise drop in silence — the missing producer signal.
 *  - **Generation smoke** ([smoke.ts](#init/cem-check/smoke.ts)) runs the real
 *    editor-type builders + `tsc` against the CEM, the authoritative consumer-path
 *    check.
 *
 * Exit contract: `0` when no `error`-severity findings; `1` when any error (or, with
 * `--strict`, any warning). `--json` emits the findings array to stdout for the
 * `/auro` pr/code-review skills to parse; human output goes to stderr so stdout
 * stays machine-parseable.
 *
 * @see docs/cem-contract-enforcement.md
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { program } from "commander";
import ora from "ora";
import { type CemFinding, runContractRules } from "#init/cem-check/rules.js";
import { runGenerationSmoke } from "#init/cem-check/smoke.js";
import { resolveComponents } from "#init/resolver.js";
import type { Manifest } from "#utils/cem.js";
import type { InstalledComponent } from "#utils/detectInstalled.js";

/** Options accepted by the `cem-check` action. */
export interface CemCheckOptions {
  /** Emit the findings array as JSON on stdout instead of human text. */
  json?: boolean;
  /** Treat warnings as errors — any finding then fails the check. */
  strict?: boolean;
}

/**
 * Derive the package identity for the CEM at `cemPath` from the `package.json`
 * beside it (so import specifiers match what the package publishes). Falls back to
 * a placeholder when the CEM is checked in isolation — generation-smoke stubs the
 * imports regardless, so the placeholder never blocks the check.
 */
function readSiblingPackageJson(cemPath: string): {
  pkg: string;
  version: string;
} {
  try {
    const raw = readFileSync(
      join(dirname(resolve(cemPath)), "package.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    return {
      pkg: typeof parsed.name === "string" ? parsed.name : "cem-check-subject",
      version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
    };
  } catch {
    return { pkg: "cem-check-subject", version: "0.0.0" };
  }
}

/** Render one finding as a single stderr line. */
function formatFinding(finding: CemFinding): string {
  const mark = finding.severity === "error" ? "✖" : "⚠";
  const where = [finding.element, finding.path].filter(Boolean).join(" ");
  const locator = where ? ` ${where}` : "";
  return `${mark} [${finding.rule}]${locator}: ${finding.message}`;
}

/** The manifest looked for when no path is given — resolved against the cwd. */
const DEFAULT_CEM_PATH = "custom-elements.json";

/**
 * Validate the CEM at `cemPath` against the contract and exit per the exit
 * contract. `cemPath` defaults to `custom-elements.json` in the directory the
 * command runs from, so running `auro cem-check` inside a component repo just
 * works; pass an explicit path to check a CEM elsewhere. A read/parse failure
 * exits 1 before any rule runs (an unreadable CEM is itself a failure).
 */
export async function runCemCheck(
  cemPath: string = DEFAULT_CEM_PATH,
  options: CemCheckOptions = {},
): Promise<void> {
  // In `--json` mode nothing may touch stdout but the JSON payload, so the ora
  // spinner (which emits cursor/frame control bytes) is suppressed entirely and
  // progress/errors go to stderr instead.
  const spinner = options.json
    ? null
    : ora(`Checking ${cemPath} against the CEM contract...`).start();

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(cemPath), "utf-8")) as Manifest;
  } catch (error) {
    const message = `Could not read or parse ${cemPath}: ${(error as Error).message}`;
    if (spinner) {
      spinner.fail(message);
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  const { pkg, version } = readSiblingPackageJson(cemPath);
  const installed: InstalledComponent[] = [{ pkg, version, manifest }];
  const { components } = resolveComponents(installed);

  const findings: CemFinding[] = [
    ...runContractRules(manifest),
    ...runGenerationSmoke(components),
  ];

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");
  const failed =
    errors.length > 0 || (Boolean(options.strict) && warnings.length > 0);

  if (options.json) {
    // No spinner was started in JSON mode, so stdout carries only the payload.
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    if (failed) {
      process.exit(1);
    }
    return;
  }

  const summary = `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
  if (failed) {
    spinner?.fail(`CEM contract failed — ${summary}.`);
  } else if (warnings.length > 0) {
    spinner?.warn(`CEM contract passed with warnings — ${summary}.`);
  } else {
    spinner?.succeed("CEM contract clean — no violations.");
  }

  // Errors first, then warnings; each on its own stderr line.
  for (const finding of [...errors, ...warnings]) {
    console.error(formatFinding(finding));
  }

  if (failed) {
    process.exit(1);
  }
}

export default program
  .command("cem-check [path]")
  .description(
    "Validate a custom-elements.json against the CEM contract (structural + parseability rules and an end-to-end generation smoke). Defaults to ./custom-elements.json.",
  )
  .option("--json", "Output the findings as a JSON array on stdout", false)
  .option("--strict", "Treat warnings as errors (any finding fails)", false)
  .action(runCemCheck);
