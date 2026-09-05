import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { runContext } from "../src/commands/context.ts";
import { AURO_COMPONENT_PACKAGES } from "../src/static/auroComponents.ts";
import {
  captureError,
  captureWrite,
  ExitError,
  elementManifest,
  installLocalPackage,
  tempCwd,
} from "./support.ts";

test("online run streams the context document to stdout", async (t) => {
  const cwd = await tempCwd(t); // empty → every package resolves via unpkg
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const pkg = AURO_COMPONENT_PACKAGES.find((p) => String(url).includes(p));
    const tag = pkg ? (pkg.split("/").pop() ?? "auro-x") : "auro-x";
    return new Response(JSON.stringify(elementManifest(tag)), { status: 200 });
  });

  await runContext({});

  const out = stdout();
  assert.match(out, /# Auro Design System/);
  assert.match(out, /## Component Reference/);
});

test("--output writes the document to a file with a confirmation", async (t) => {
  const cwd = await tempCwd(t);
  const output = path.join(cwd, "AURO_CONTEXT.md");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  // console.error carries the "paste this file" confirmation — advisory output
  // is kept off stdout so `--output FILE` captures stay clean.
  const log = t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const pkg = AURO_COMPONENT_PACKAGES.find((p) => String(url).includes(p));
    const tag = pkg ? (pkg.split("/").pop() ?? "auro-x") : "auro-x";
    return new Response(JSON.stringify(elementManifest(tag)), { status: 200 });
  });

  await runContext({ output });

  const written = await readFile(output, "utf-8");
  assert.match(written, /# Auro Design System/);
  const logged = log.mock.calls
    .map((c) => String(c.arguments[0] ?? ""))
    .join("\n");
  assert.match(logged, /Paste this file/);
});

test("--offline never fetches and still emits a document", async (t) => {
  const cwd = await tempCwd(t); // no node_modules
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline mode must not hit the network");
  });

  await runContext({ offline: true });

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.match(stdout(), /# Auro Design System/);
});

test("--offline reports an installed manifest that documents no description", async (t) => {
  const cwd = await tempCwd(t);
  const pkg = AURO_COMPONENT_PACKAGES[0];
  // A locally installed manifest that registers an element but carries no
  // summary/description — the local.size > 0, enriched === 0 branch. Empty
  // strings override elementManifest's default description.
  await installLocalPackage(
    cwd,
    pkg,
    "1.0.0",
    elementManifest("auro-accordion", { description: "", summary: "" }),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  // ora writes its spinner frames (including the final succeed line) to stderr.
  const stderr = captureWrite(t, process.stderr);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline mode must not hit the network");
  });

  await runContext({ offline: true });

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.match(stdout(), /# Auro Design System/, "document still on stdout");
  // Offline branch reports the count and the "no description" fallback, not the
  // package name — the point is that it does NOT claim nothing was found.
  assert.match(stderr(), /Read 1 installed component manifest\(s\)/);
  assert.match(stderr(), /none documented a description/);
});

test("a locally installed outdated component warns on stderr, doc on stdout", async (t) => {
  const cwd = await tempCwd(t);
  const pkg = AURO_COMPONENT_PACKAGES[0];
  await installLocalPackage(
    cwd,
    pkg,
    "1.0.0",
    elementManifest("auro-accordion"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  t.mock.method(globalThis, "fetch", async (url: string) => {
    // The installed package's registry lookup reports a newer release; every
    // other package 404s on unpkg (only the local one matters here).
    if (String(url).includes("registry.npmjs.org")) {
      return new Response(JSON.stringify({ version: "2.0.0" }), {
        status: 200,
      });
    }
    return new Response(null, { status: 404 });
  });

  await runContext({});

  assert.match(stdout(), /# Auro Design System/, "document still on stdout");
  const err = stderr();
  assert.match(err, /NOT on the latest release/);
  assert.ok(err.includes(pkg), "names the outdated package");
});

test("exits 1 with a write-failure message when the output path is unwritable", async (t) => {
  const cwd = await tempCwd(t);
  // A path under a directory that does not exist — fs.writeFile rejects with
  // ENOENT, exercising the --output failure branch deterministically.
  const output = path.join(cwd, "no-such-dir", "ctx.md");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  // Offline keeps the run network-free; the document still builds, then the
  // write is what fails. Capture the spinner's stderr output to assert on it.
  const stderr = captureWrite(t, process.stderr);

  await assert.rejects(
    runContext({ output, offline: true }),
    (err: ExitError) => {
      assert.equal(err.code, 1);
      return true;
    },
  );

  assert.match(stderr(), /Failed to write context/);
});
