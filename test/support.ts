/**
 * Shared helpers for the command-level tests. Not a test file itself (the runner
 * only picks up `*.test.ts`), so it can be imported freely.
 */

import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Sentinel thrown by the mocked `process.exit` so a test can assert the command
 * bailed with a given code without actually terminating the test process. The
 * real `process.exit` never returns, so throwing here faithfully halts the
 * command's control flow at the same point.
 */
export class ExitError extends Error {
  code: number | undefined;
  constructor(code: number | undefined) {
    super(`process.exit(${code})`);
    this.name = "ExitError";
    this.code = code;
  }
}

/** Replace `process.exit` with one that throws {@link ExitError}. */
export function mockExit(t: TestContext): void {
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
}

/**
 * Spy on a writable stream's `write`, suppressing real output and returning a
 * getter for everything written to it as a single string.
 */
export function captureWrite(
  t: TestContext,
  stream: NodeJS.WriteStream,
): () => string {
  const mock = t.mock.method(stream, "write", () => true);
  return () =>
    mock.mock.calls.map((call) => String(call.arguments[0] ?? "")).join("");
}

/** Spy on `console.error`, returning a getter for the joined output. */
export function captureError(t: TestContext): () => string {
  const mock = t.mock.method(console, "error", () => {});
  return () =>
    mock.mock.calls
      .map((call) => call.arguments.map((a) => String(a)).join(" "))
      .join("\n");
}

/**
 * Force the current run to look interactive so command code reaches its
 * `inquirer` branch under the (non-TTY) test runner: set `process.stdin.isTTY`
 * true and clear `process.env.CI`, both restored after the test. Pair with a
 * mock of `inquirer.prompt` so no real prompt is issued.
 */
export function forceInteractive(t: TestContext): void {
  const origIsTTY = process.stdin.isTTY;
  const origCI = process.env.CI;
  Object.defineProperty(process.stdin, "isTTY", {
    value: true,
    configurable: true,
  });
  delete process.env.CI;
  t.after(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: origIsTTY,
      configurable: true,
    });
    if (origCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = origCI;
    }
  });
}

/** Create a fresh temp directory to act as a fake project cwd, auto-removed. */
export async function tempCwd(t: TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "auro-cli-test-"));
  // Windows can briefly hold a lock on files a just-exited child (the pinned
  // `tsc` the cem-check smoke runs) wrote into this dir, so an immediate remove
  // throws EBUSY and crashes the whole run. Retry to let the handle release.
  t.after(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  );
  return dir;
}

/**
 * Write a package into `<cwd>/node_modules/<pkg>` with the given version and
 * custom-elements.json, mimicking a locally installed Auro component.
 */
export async function installLocalPackage(
  cwd: string,
  pkg: string,
  version: string,
  manifest: unknown,
  options: { customElements?: string; omitManifest?: boolean } = {},
): Promise<void> {
  const pkgDir = path.join(cwd, "node_modules", ...pkg.split("/"));
  await mkdir(pkgDir, { recursive: true });
  const manifestRel = options.customElements ?? "custom-elements.json";
  const pkgJson: Record<string, unknown> = { name: pkg, version };
  if (options.customElements) {
    pkgJson.customElements = options.customElements;
  }
  await writeFile(path.join(pkgDir, "package.json"), JSON.stringify(pkgJson));
  // Simulate a package that is installed but ships no manifest file.
  if (options.omitManifest) {
    return;
  }
  const manifestPath = path.join(pkgDir, manifestRel);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest));
}

/** Directory holding the vendored real-package fixtures (`packages/<name>/`). */
const FIXTURE_PACKAGES = fileURLToPath(
  new URL("./fixtures/packages", import.meta.url),
);

/**
 * Copy a vendored **real** Auro package fixture into `<cwd>/node_modules/<pkg>`,
 * mirroring a genuine local install. Unlike {@link installLocalPackage} (which
 * synthesises a minimal manifest), this stages the real published `package.json`
 * and its full custom-elements.json from `test/fixtures/packages/<name>/`, so
 * detection/resolution run against the exact shapes shipped on npm — offline and
 * deterministic. `name` is the fixture directory (e.g. `auro-button`,
 * `auro-formkit`); the destination package is taken from the fixture's own
 * `package.json` `name`, and the manifest is copied to the path its
 * `customElements` field points at.
 */
export async function installRealPackage(
  cwd: string,
  name: string,
): Promise<void> {
  const srcDir = path.join(FIXTURE_PACKAGES, name);
  const pkgJson = JSON.parse(
    await readFile(path.join(srcDir, "package.json"), "utf-8"),
  ) as { name: string; customElements?: string };

  const destDir = path.join(cwd, "node_modules", ...pkgJson.name.split("/"));
  await mkdir(destDir, { recursive: true });
  await copyFile(
    path.join(srcDir, "package.json"),
    path.join(destDir, "package.json"),
  );

  const manifestRel = pkgJson.customElements ?? "custom-elements.json";
  const manifestDest = path.join(destDir, manifestRel);
  await mkdir(path.dirname(manifestDest), { recursive: true });
  await copyFile(path.join(srcDir, manifestRel), manifestDest);
}

/** A minimal manifest documenting a single registered custom element. */
export function elementManifest(
  tagName: string,
  extra: Record<string, unknown> = {},
): unknown {
  return {
    schemaVersion: "1.0.0",
    modules: [
      {
        kind: "javascript-module",
        path: `${tagName}.js`,
        declarations: [
          {
            kind: "class",
            name: tagName
              .split("-")
              .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
              .join(""),
            tagName,
            customElement: true,
            description: `The ${tagName} element.`,
            ...extra,
          },
        ],
      },
    ],
  };
}
