import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { runCem } from "../src/commands/cem.ts";
import { AURO_COMPONENT_PACKAGES } from "../src/static/auroComponents.ts";
import { ExitError, elementManifest, tempCwd } from "./support.ts";

/** A registered-element manifest for whichever package a URL refers to. */
function manifestFor(url: string): unknown {
  const pkg = AURO_COMPONENT_PACKAGES.find((p) => url.includes(p));
  const tag = pkg ? (pkg.split("/").pop() ?? "auro-x") : "auro-x";
  return elementManifest(tag);
}

test("writes the aggregated manifest and exits cleanly on success", async (t) => {
  const cwd = await tempCwd(t);
  const output = path.join(cwd, "custom-elements.aggregate.json");
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string) =>
      new Response(JSON.stringify(manifestFor(String(url))), { status: 200 }),
  );

  await runCem({ output });

  const written = JSON.parse(await readFile(output, "utf-8"));
  assert.ok(Array.isArray(written.modules));
  assert.ok(
    written.modules.length > 0,
    "aggregate has modules from all sources",
  );
});

test("exits 1 when no manifest can be fetched", async (t) => {
  const cwd = await tempCwd(t);
  const output = path.join(cwd, "out.json");
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  await assert.rejects(runCem({ output }), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("exits 1 when any fetch fails transiently, even if some succeed", async (t) => {
  const cwd = await tempCwd(t);
  const output = path.join(cwd, "out.json");
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  const failing = AURO_COMPONENT_PACKAGES[0];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    // One package 5xxs (transient); everything else resolves.
    if (String(url).includes(failing)) {
      return new Response(null, { status: 503 });
    }
    return new Response(JSON.stringify(manifestFor(String(url))), {
      status: 200,
    });
  });

  await assert.rejects(runCem({ output }), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });

  // The aggregate was still written before the transient failure forced exit 1.
  const written = JSON.parse(await readFile(output, "utf-8"));
  assert.ok(Array.isArray(written.modules));
});
