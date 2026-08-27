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
