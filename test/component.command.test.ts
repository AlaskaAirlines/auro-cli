import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { runComponent } from "../src/commands/component.ts";
import {
  captureError,
  captureWrite,
  ExitError,
  elementManifest,
  installLocalPackage,
  tempCwd,
} from "./support.ts";

const PKG = "@aurodesignsystem/auro-button";

test("prints the formatted API to stdout on an unpkg hit", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd); // empty → forces network
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify(elementManifest("auro-button")), {
        status: 200,
      }),
  );

  await runComponent("button", {});

  const out = stdout();
  assert.match(out, /auro-button/);
  assert.match(out, /Attributes/);
});

test("--json writes a parseable JSON array to stdout", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify(elementManifest("auro-button")), {
        status: 200,
      }),
  );

  await runComponent("button", { json: true });

  const parsed = JSON.parse(stdout());
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].tagName, "auro-button");
});

test("exits 1 with a not-published message on a genuine 404", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  await assert.rejects(runComponent("button", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("exits 1 with a fetch-failed message on a transient error", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(runComponent("button", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("exits 1 when the manifest documents no registered elements", async (t) => {
  const cwd = await tempCwd(t);
  t.mock.method(process, "cwd", () => cwd);
  captureError(t);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  // A manifest with a declaration that is not a registered custom element.
  const manifest = {
    schemaVersion: "1.0.0",
    modules: [
      {
        path: "base.js",
        declarations: [{ kind: "class", name: "BaseThing" }],
      },
    ],
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(manifest), { status: 200 }),
  );

  await assert.rejects(runComponent("button", {}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
});

test("a locally installed but outdated component warns on stderr, API on stdout", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(cwd, PKG, "12.3.0", elementManifest("auro-button"));
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stdout = captureWrite(t, process.stdout);
  const stderr = captureError(t);
  // Only the registry latest lookup should hit the network (manifest is local).
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ version: "13.0.0" }), { status: 200 }),
  );

  await runComponent("button", {});

  assert.match(stdout(), /auro-button/, "API renders on stdout");
  const err = stderr();
  assert.match(err, /NOT on the latest release/, "outdated banner on stderr");
  assert.match(err, /12\.3\.0/);
  assert.match(err, /13\.0\.0/);
  assert.equal(
    fetchMock.mock.callCount(),
    1,
    "only the registry lookup fetched",
  );
});
