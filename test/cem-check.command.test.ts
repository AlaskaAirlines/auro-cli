/**
 * `auro cem-check` command — the exit contract and finding output. Covers a clean
 * CEM (exit 0), the two error rules (nameless entry / unbalanced `type.text` → exit
 * 1), the warn-only enumerated-union rule (exit 0, but exit 1 under `--strict`), and
 * the `--json` machine-readable output.
 *
 * @see ../src/commands/cem-check.ts
 */

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { runCemCheck } from "../src/commands/cem-check.ts";
import {
  captureError,
  captureWrite,
  type ExitError,
  elementManifest,
  mockExit,
  tempCwd,
} from "./support.ts";

/** Write a CEM (and a sibling package.json) into a temp project; return its path. */
async function writeCem(
  t: import("node:test").TestContext,
  manifest: unknown,
): Promise<string> {
  const cwd = await tempCwd(t);
  const cemPath = path.join(cwd, "custom-elements.json");
  await writeFile(cemPath, JSON.stringify(manifest), "utf-8");
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ name: "@aurodesignsystem/auro-button", version: "1.0.0" }),
    "utf-8",
  );
  return cemPath;
}

/** Fail the test if the command exits (used by the exit-0 cases). */
function forbidExit(t: import("node:test").TestContext): void {
  t.mock.method(process, "exit", (code?: number): never => {
    throw new Error(`process.exit(${code}) should not have been called`);
  });
}

test("a clean CEM passes (does not exit)", async (t) => {
  forbidExit(t);
  captureError(t);
  const cemPath = await writeCem(t, elementManifest("auro-button"));
  await runCemCheck(cemPath, {}); // resolves — no throw means no exit
});

test("with no path, cem-check defaults to ./custom-elements.json in the cwd", async (t) => {
  forbidExit(t);
  captureError(t);
  // writeCem drops a custom-elements.json + package.json into a fresh temp dir;
  // chdir there so the default path resolves to it. `runCemCheck` runs to
  // completion synchronously (the generation smoke blocks via execFileSync), so
  // the cwd is restored before any sibling test can observe it.
  const cemPath = await writeCem(t, elementManifest("auro-button"));
  const origCwd = process.cwd();
  process.chdir(path.dirname(cemPath));
  t.after(() => process.chdir(origCwd));
  await runCemCheck(); // no path, no options — resolves via the default
});

test("a nameless member fails with a name-required error (exit 1)", async (t) => {
  mockExit(t);
  const stderr = captureError(t);
  const cemPath = await writeCem(
    t,
    elementManifest("auro-button", {
      members: [{ kind: "field", type: { text: "string" } }],
    }),
  );
  await assert.rejects(
    runCemCheck(cemPath, {}),
    (err: ExitError) => err.code === 1,
  );
  assert.match(stderr(), /name-required/);
});

test("an unbalanced type.text fails with a type-parseable error (exit 1)", async (t) => {
  mockExit(t);
  const stderr = captureError(t);
  const cemPath = await writeCem(
    t,
    elementManifest("auro-button", {
      attributes: [{ name: "config", type: { text: "Object<key" } }],
    }),
  );
  await assert.rejects(
    runCemCheck(cemPath, {}),
    (err: ExitError) => err.code === 1,
  );
  assert.match(stderr(), /type-parseable/);
});

test("an enumerated bare-string attr warns but does not fail (exit 0)", async (t) => {
  forbidExit(t);
  const stderr = captureError(t);
  const cemPath = await writeCem(
    t,
    elementManifest("auro-button", {
      attributes: [{ name: "variant", type: { text: "string" } }],
    }),
  );
  await runCemCheck(cemPath, {});
  assert.match(stderr(), /enumerated-union/);
});

test("--strict promotes the warning to a failure (exit 1)", async (t) => {
  mockExit(t);
  captureError(t);
  const cemPath = await writeCem(
    t,
    elementManifest("auro-button", {
      attributes: [{ name: "variant", type: { text: "string" } }],
    }),
  );
  await assert.rejects(
    runCemCheck(cemPath, { strict: true }),
    (err: ExitError) => err.code === 1,
  );
});

test("--json writes the findings as a parseable array on stdout", async (t) => {
  forbidExit(t);
  captureError(t);
  const cemPath = await writeCem(
    t,
    elementManifest("auro-button", {
      attributes: [{ name: "variant", type: { text: "string" } }],
    }),
  );
  // Install the stdout capture only after all async setup: node:test interleaves
  // sibling async tests at `await` points, and a global `process.stdout` mock held
  // across an await would swallow their output. `runCemCheck`'s JSON path never
  // yields (the generation smoke blocks via `execFileSync`), so from here the
  // capture sees only this command's own write.
  const stdout = captureWrite(t, process.stdout);
  await runCemCheck(cemPath, { json: true });

  const parsed = JSON.parse(stdout());
  assert.ok(Array.isArray(parsed), "stdout should be a JSON array");
  assert.ok(
    parsed.some(
      (f: { rule: string; severity: string }) =>
        f.rule === "enumerated-union" && f.severity === "warn",
    ),
    "the enumerated-union warning should be in the JSON output",
  );
});

test("an unreadable CEM path exits 1 before any rule runs", async (t) => {
  mockExit(t);
  captureError(t);
  await assert.rejects(
    runCemCheck("/no/such/custom-elements.json", {}),
    (err: ExitError) => err.code === 1,
  );
});

test("valid JSON that is not a CEM object (top-level null) exits 1 cleanly", async (t) => {
  // `null` parses without throwing but has no `.modules`; without the object
  // guard, resolveComponents throws an uncaught TypeError instead of exiting 1.
  mockExit(t);
  captureError(t);
  const cemPath = await writeCem(t, null);
  await assert.rejects(
    runCemCheck(cemPath, {}),
    (err: ExitError) => err.code === 1,
  );
});

test("in --json mode a non-object CEM exits 1 with the message on stderr", async (t) => {
  // The JSON path suppresses the spinner, so the guard's message lands on
  // console.error (stderr) — and stdout carries no payload, matching the
  // parse-failure contract.
  mockExit(t);
  const stderr = captureError(t);
  const cemPath = await writeCem(t, null);
  await assert.rejects(
    runCemCheck(cemPath, { json: true }),
    (err: ExitError) => err.code === 1,
  );
  assert.match(stderr(), /not a CEM object/);
});

test("a top-level JSON array is rejected as not a CEM object (exit 1)", async (t) => {
  mockExit(t);
  captureError(t);
  const cemPath = await writeCem(t, []);
  await assert.rejects(
    runCemCheck(cemPath, {}),
    (err: ExitError) => err.code === 1,
  );
});
