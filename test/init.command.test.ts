import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { runInit } from "../src/commands/init.ts";
import {
  captureWrite,
  ExitError,
  elementManifest,
  installLocalPackage,
  installRealPackage,
  tempCwd,
} from "./support.ts";

/** Read a grounding file the command wrote into the fixture cwd. */
async function readOutput(cwd: string, name: string): Promise<string> {
  return readFile(path.join(cwd, name), "utf-8");
}

test("writes AGENTS.md, CLAUDE.md and config for the real installed components", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await installRealPackage(cwd, "auro-formkit");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr); // swallow ora spinner frames
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({ prefix: "myapp-" });

  const agents = await readOutput(cwd, "AGENTS.md");
  // The standalone button and a formkit monorepo component are both prefixed.
  assert.match(agents, /<myapp-button>/u, "standalone tag is prefixed");
  assert.match(agents, /<myapp-input>/u, "monorepo tag is prefixed");
  assert.match(
    agents,
    /import "@aurodesignsystem\/auro-formkit\/auro-input";/u,
    "monorepo component imports via its subpath export",
  );

  // The thin CLAUDE.md just imports AGENTS.md.
  const claude = await readOutput(cwd, "CLAUDE.md");
  assert.match(claude, /@AGENTS\.md/u);

  // The persisted config records the chosen default for idempotent regen.
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(config.version, 1);
  assert.equal(config.init.prefix.default, "myapp-");
});

test("with nothing installed, warns and writes no files", async (t) => {
  const cwd = await tempCwd(t); // no node_modules
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit when nothing is installed");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({});

  await assert.rejects(
    readOutput(cwd, "AGENTS.md"),
    /ENOENT/u,
    "no grounding file is written",
  );
  assert.match(stderr(), /No installed Auro components found/u);
});

test("exits 1 when a default prefix is needed but the run is non-interactive", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  // No --prefix, no config, no scan match → needsDefaultPrefix; the test runner
  // has no TTY, so the run is non-interactive and must fail cleanly.
  await assert.rejects(runInit({}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
  assert.match(stderr(), /Re-run with --prefix/u);
  await assert.rejects(readOutput(cwd, "AGENTS.md"), /ENOENT/u);
});

test("an existing config override wins over the default prefix", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  // A committed config: auro-button is pinned to a full rename, default is myapp-.
  await writeFile(
    path.join(cwd, "auro.config.json"),
    JSON.stringify({
      version: 1,
      init: {
        prefix: {
          default: "myapp-",
          overrides: { "auro-button": "brand-cta" },
        },
      },
    }),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  // A defined config default means no prompt is needed even without --prefix.
  await runInit({});

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(agents, /<brand-cta>/u, "config override is honored");
  assert.doesNotMatch(agents, /<myapp-button>/u, "default did not override it");
});

test("exits 1 on a malformed config", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await writeFile(path.join(cwd, "auro.config.json"), "{ not valid json");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await assert.rejects(runInit({ prefix: "myapp-" }), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
  assert.match(stderr(), /Cannot read auro\.config\.json/u);
});

test("warns when a tag is registered by more than one installed package", async (t) => {
  const cwd = await tempCwd(t);
  // Two candidate packages that both register the same tag → a dedupe conflict
  // the command must surface (the real legacy-standalone vs monorepo overlap).
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-button",
    "1.0.0",
    elementManifest("auro-widget"),
  );
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-card",
    "2.0.0",
    elementManifest("auro-widget"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({ prefix: "myapp-" });

  const err = stderr();
  assert.match(err, /registered by multiple installed packages/u);
  assert.match(err, /auro-button/u);
  assert.match(err, /auro-card/u);
});

test("regeneration is idempotent and reuses the persisted default", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({ prefix: "myapp-" });
  const first = await readOutput(cwd, "AGENTS.md");

  // Second run without --prefix: the persisted config default carries the prefix,
  // so it neither prompts nor fails, and reproduces the same document.
  await runInit({});
  const second = await readOutput(cwd, "AGENTS.md");

  assert.equal(second, first, "regeneration is byte-identical");
  assert.match(second, /<myapp-button>/u);
});
