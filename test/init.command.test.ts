import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import inquirer from "inquirer";
import { runInit } from "../src/commands/init.ts";
import {
  captureWrite,
  ExitError,
  elementManifest,
  forceInteractive,
  installLocalPackage,
  installRealPackage,
  tempCwd,
} from "./support.ts";

/** Read a grounding file the command wrote into the fixture cwd. */
async function readOutput(cwd: string, name: string): Promise<string> {
  return readFile(path.join(cwd, name), "utf-8");
}

/**
 * Install two synthetic standalone Auro packages whose consumer source registers
 * them under two *different* prefixes (`legacy-button`, `brand-card`) — a
 * first-run mixed-prefix project with no `auro.config.json`. The class names in
 * the written source match each `elementManifest`'s PascalCase declaration name,
 * so the AST scan ties them to the installed components. Majority is `legacy-`
 * (first-seen among two singletons).
 */
async function installMixedScanProject(cwd: string): Promise<void> {
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-button",
    "1.0.0",
    elementManifest("auro-button"),
  );
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-card",
    "2.0.0",
    elementManifest("auro-card"),
  );
  await writeFile(
    path.join(cwd, "app.js"),
    "AuroButton.register('legacy-button');\nAuroCard.register('brand-card');\n",
  );
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

test("regeneration after removing a dependency drops it and stays idempotent", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button"); // standalone (kept)
  await installRealPackage(cwd, "auro-formkit"); // monorepo (removed below)
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  // First run grounds both packages and persists the default prefix.
  await runInit({ prefix: "myapp-" });
  const withBoth = await readOutput(cwd, "AGENTS.md");
  assert.match(
    withBoth,
    /<myapp-button>/u,
    "standalone present before removal",
  );
  assert.match(
    withBoth,
    /<myapp-input>/u,
    "monorepo component present before removal",
  );

  // Uninstall the monorepo package, then regenerate WITHOUT --prefix: the
  // persisted config default carries the prefix, so it neither prompts nor fails.
  await rm(
    path.join(cwd, "node_modules", "@aurodesignsystem", "auro-formkit"),
    {
      recursive: true,
      force: true,
    },
  );
  await runInit({});
  const afterRemoval = await readOutput(cwd, "AGENTS.md");

  assert.match(
    afterRemoval,
    /<myapp-button>/u,
    "remaining component still grounded",
  );
  // The removed component's resolved tag only appears when it is actually
  // grounded, so its absence is the reliable removal signal. (The bare package
  // name still appears in the frozen coding-rules boilerplate regardless.)
  assert.doesNotMatch(
    afterRemoval,
    /<myapp-input>/u,
    "removed component's tag is gone",
  );
  assert.doesNotMatch(
    afterRemoval,
    /import "@aurodesignsystem\/auro-formkit\/auro-input";/u,
    "removed component's install snippet is gone",
  );

  // The persisted default survives the removal (its override lingers harmlessly,
  // but no formkit component remains to apply it to).
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(config.init.prefix.default, "myapp-");

  // A third run against the same reduced deps reproduces the document byte-for-byte.
  await runInit({});
  const third = await readOutput(cwd, "AGENTS.md");
  assert.equal(third, afterRemoval, "post-removal regeneration is idempotent");
});

test("mixed existing prefixes fail cleanly (exit 1) in a non-interactive run", async (t) => {
  const cwd = await tempCwd(t);
  await installMixedScanProject(cwd); // no config, no --prefix
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", (code?: number): never => {
    throw new ExitError(code);
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  // The runner has no TTY → non-interactive. A mixed-prefix conflict with no
  // settled default cannot be resolved without a prompt, so init must fail.
  await assert.rejects(runInit({}), (err: ExitError) => {
    assert.equal(err.code, 1);
    return true;
  });
  const err = stderr();
  assert.match(err, /inconsistent prefixes/u);
  assert.match(err, /Re-run with --prefix/u);
  await assert.rejects(readOutput(cwd, "AGENTS.md"), /ENOENT/u);
});

test("mixed prefixes: interactive confirm adopts the majority as the default", async (t) => {
  const cwd = await tempCwd(t);
  await installMixedScanProject(cwd);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  forceInteractive(t);
  // Accept the suggested majority (`legacy-`) at the confirm prompt.
  t.mock.method(inquirer, "prompt", async () => ({ accept: true }));

  await runInit({});

  const agents = await readOutput(cwd, "AGENTS.md");
  // Per-component scan overrides are honored regardless of the chosen default.
  assert.match(agents, /<legacy-button>/u, "button keeps its registered tag");
  assert.match(agents, /<brand-card>/u, "card keeps its registered tag");
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(
    config.init.prefix.default,
    "legacy-",
    "majority adopted as default",
  );
});

test("mixed prefixes: declining the confirm falls back to an entered prefix", async (t) => {
  const cwd = await tempCwd(t);
  await installMixedScanProject(cwd);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  forceInteractive(t);
  // Decline the majority confirm, then type a fresh default at the input prompt.
  t.mock.method(
    inquirer,
    "prompt",
    async (questions: Array<{ type?: string }>) =>
      questions[0]?.type === "confirm"
        ? { accept: false }
        : { prefix: "custom-" },
  );

  await runInit({});

  const agents = await readOutput(cwd, "AGENTS.md");
  // The entered default governs only unregistered components; the two scanned
  // registrations still win per-component.
  assert.match(agents, /<legacy-button>/u);
  assert.match(agents, /<brand-card>/u);
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(
    config.init.prefix.default,
    "custom-",
    "entered prefix is persisted",
  );
});

test("mixed prefixes: an explicit --prefix bypasses the prompt and CI fail", async (t) => {
  const cwd = await tempCwd(t);
  await installMixedScanProject(cwd); // non-interactive runner, but --prefix settles it
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit when --prefix is given");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  // No inquirer mock: if the command tried to prompt, the real prompt would hang
  // or throw — proving --prefix short-circuits the decision entirely.

  await runInit({ prefix: "myapp-" });

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(
    agents,
    /<legacy-button>/u,
    "scanned tags still win over the default",
  );
  assert.match(agents, /<brand-card>/u);
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(config.init.prefix.default, "myapp-");
});

test("a committed mixed-prefix config regenerates cleanly without prompting or failing", async (t) => {
  const cwd = await tempCwd(t);
  // Two installed components pinned to two different prefixes in a *settled*
  // config (default already chosen). No source scan needed.
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-button",
    "1.0.0",
    elementManifest("auro-button"),
  );
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-card",
    "2.0.0",
    elementManifest("auro-card"),
  );
  await writeFile(
    path.join(cwd, "auro.config.json"),
    JSON.stringify({
      version: 1,
      init: {
        prefix: {
          default: "myapp-",
          overrides: {
            "auro-button": "legacy-button",
            "auro-card": "brand-card",
          },
        },
      },
    }),
  );
  t.mock.method(process, "cwd", () => cwd);
  // A settled default means the non-interactive runner must NOT fail: regeneration
  // of a mixed-prefix project has to stay deterministic.
  t.mock.method(process, "exit", () => {
    throw new Error("mixed but settled config must not exit");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({});

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(agents, /<legacy-button>/u);
  assert.match(agents, /<brand-card>/u);
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(
    config.init.prefix.default,
    "myapp-",
    "settled default is preserved",
  );
});
