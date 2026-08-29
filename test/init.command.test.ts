import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import inquirer from "inquirer";
import { simpleGit } from "simple-git";
import { isValidCustomTag, runInit } from "../src/commands/init.ts";
import { findIgnored } from "../src/init/gitignore.ts";
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

  await runInit({ prefix: "myapp-", offline: true });

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

  await runInit({ offline: true });

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
  await assert.rejects(runInit({ offline: true }), (err: ExitError) => {
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
  await runInit({ offline: true });

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

  await assert.rejects(
    runInit({ prefix: "myapp-", offline: true }),
    (err: ExitError) => {
      assert.equal(err.code, 1);
      return true;
    },
  );
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

  await runInit({ prefix: "myapp-", offline: true });

  const err = stderr();
  assert.match(err, /registered by multiple installed packages/u);
  assert.match(err, /auro-button/u);
  assert.match(err, /auro-card/u);

  // The conflict is grounded once (first-detected package wins), not once per
  // registering package — the generator emits exactly one API section for it.
  const agents = await readOutput(cwd, "AGENTS.md");
  const sections = agents.match(/^### `<myapp-widget>`$/gmu) ?? [];
  assert.equal(
    sections.length,
    1,
    "the duplicated tag is grounded exactly once in AGENTS.md",
  );
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

  await runInit({ prefix: "myapp-", offline: true });
  const first = await readOutput(cwd, "AGENTS.md");

  // Second run without --prefix: the persisted config default carries the prefix,
  // so it neither prompts nor fails, and reproduces the same document.
  await runInit({ offline: true });
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
  await runInit({ prefix: "myapp-", offline: true });
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
  await runInit({ offline: true });
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
  await runInit({ offline: true });
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
  await assert.rejects(runInit({ offline: true }), (err: ExitError) => {
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

  await runInit({ offline: true });

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

  await runInit({ offline: true });

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

  await runInit({ prefix: "myapp-", offline: true });

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

  await runInit({ offline: true });

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

test("AST scan warns (never guesses) on default, computed, and auto-versioned registrations", async (t) => {
  const cwd = await tempCwd(t);
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-button",
    "1.0.0",
    elementManifest("auro-button"),
  );
  // A realistic consumer file mixing every AST-scan false-negative: the canonical
  // default register(), a computed template-literal tag, and Auro's auto-versioned
  // dependency registration (generateTag + customElements.define).
  await writeFile(
    path.join(cwd, "app.js"),
    [
      'import { AuroButton } from "@aurodesignsystem/auro-button";',
      'import { AuroDependencyVersioning } from "@aurodesignsystem/auro-library/scripts/runtime/dependencyTagVersioning.mjs";',
      "const versioning = new AuroDependencyVersioning();",
      'const inputTag = versioning.generateTag("auro-input", "3.0.0", AuroInput);',
      'customElements.define("auro-input-3_0_0", class extends AuroInput {});',
      "AuroButton.register();",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional — the scanner must skip this computed tag.
      "AuroSelect.register(`${prefix}-select`);",
      "",
    ].join("\n"),
  );
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("a settled --prefix must not exit");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({ prefix: "myapp-", offline: true });

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(
    agents,
    /<myapp-button>/u,
    "the installed component is grounded",
  );

  const errors = stderr();
  // Default no-arg register() vs the prefixed grounding: a mismatch to fix. The
  // reconciliation banner word-wraps, so assert on wrap-safe tokens (no internal
  // spaces) rather than a multi-word phrase that a line break could split.
  assert.match(errors, /AuroButton\.register\(\)/u);
  assert.match(errors, /'<auro-button>'/u);
  assert.match(errors, /'<myapp-button>'/u);
  // Computed tag is warned and skipped, never guessed.
  assert.match(errors, /non-literal tag/u);
  // The auto-versioned dependency tag is neither grounded nor guessed. (Narrow to
  // the versioned signals — bare "auro-input" appears in the static coding-rules
  // boilerplate, so assert the version suffix and a grounded <auro-input> tag are
  // absent rather than the substring.)
  assert.doesNotMatch(agents, /3_0_0/u);
  assert.doesNotMatch(agents, /<auro-input>/u);
  assert.doesNotMatch(errors, /3_0_0/u);
  assert.doesNotMatch(errors, /auro-input/u);
});

/**
 * A project on a legacy standalone form package: the component is installed (so
 * detection finds it) and declared in `package.json`, and consumer source imports
 * it from the standalone root. This is the shape the formkit migration acts on.
 */
async function installLegacyFormkitProject(cwd: string): Promise<void> {
  await installLocalPackage(
    cwd,
    "@aurodesignsystem/auro-input",
    "9.0.0",
    elementManifest("auro-input"),
  );
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify(
      { dependencies: { "@aurodesignsystem/auro-input": "^9.0.0" } },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(cwd, "app.js"),
    'import "@aurodesignsystem/auro-input";\n',
  );
}

test("legacy standalone: accepting the prompt migrates to formkit and stops before grounding", async (t) => {
  const cwd = await tempCwd(t);
  await installLegacyFormkitProject(cwd);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on a successful migration");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  forceInteractive(t);
  t.mock.method(inquirer, "prompt", async () => ({ migrate: true }));

  await runInit({ prefix: "myapp-", offline: true });

  // package.json swapped: legacy removed, formkit added.
  const pkg = JSON.parse(await readOutput(cwd, "package.json"));
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-input"], undefined);
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-formkit"], "latest");
  // Source rewritten to the formkit subpath.
  const app = await readFile(path.join(cwd, "app.js"), "utf-8");
  assert.match(app, /"@aurodesignsystem\/auro-formkit\/auro-input"/u);
  // Grounding is deferred until the user reinstalls and re-runs.
  await assert.rejects(
    readOutput(cwd, "AGENTS.md"),
    /ENOENT/u,
    "no grounding file is written in the migration run",
  );
  assert.match(stderr(), /run `npm install`/u);
});

test("legacy standalone: declining the prompt grounds the standalone as-is", async (t) => {
  const cwd = await tempCwd(t);
  await installLegacyFormkitProject(cwd);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  forceInteractive(t);
  t.mock.method(inquirer, "prompt", async () => ({ migrate: false }));

  await runInit({ prefix: "myapp-", offline: true });

  // Nothing migrated; normal grounding proceeded.
  const pkg = JSON.parse(await readOutput(cwd, "package.json"));
  assert.equal(
    pkg.dependencies["@aurodesignsystem/auro-input"],
    "^9.0.0",
    "declining leaves package.json untouched",
  );
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-formkit"], undefined);
  const app = await readFile(path.join(cwd, "app.js"), "utf-8");
  assert.match(
    app,
    /"@aurodesignsystem\/auro-input"/u,
    "declining leaves source untouched",
  );
  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(agents, /<myapp-input>/u, "the standalone is grounded as-is");
});

test("legacy standalone: a non-interactive run only advises, never migrates", async (t) => {
  const cwd = await tempCwd(t);
  await installLegacyFormkitProject(cwd);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  // No forceInteractive (runner is non-TTY) and no inquirer mock: prompting would
  // throw, proving the non-interactive path never prompts.

  await runInit({ prefix: "myapp-", offline: true });

  // Advisory printed; no edits made.
  assert.match(stderr(), /can be migrated to @aurodesignsystem\/auro-formkit/u);
  const pkg = JSON.parse(await readOutput(cwd, "package.json"));
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-input"], "^9.0.0");
  assert.equal(pkg.dependencies["@aurodesignsystem/auro-formkit"], undefined);
  // Grounding still proceeds.
  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(agents, /<myapp-input>/u);
});

// ---------------------------------------------------------------------------
// PT-M2: editor-IntelliSense targets (--vscode / --jsx / --svelte + wiring)
// ---------------------------------------------------------------------------

/** Standard mocks for a non-interactive editor-target run against a temp cwd. */
function stubEditorRun(t: TestContext, cwd: string): void {
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
}

test("--vscode writes the HTML custom-data artifact and wires settings.json", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", vscode: true, offline: true });

  // The artifact is keyed on the resolved (prefixed) tag, not the bare auro-* tag.
  const customData = await readOutput(
    cwd,
    ".vscode/auro.html-custom-data.json",
  );
  assert.match(customData, /myapp-button/u);
  assert.doesNotMatch(customData, /"auro-button"/u);

  // settings.json is created and registers the project-root-relative entry.
  const settings = JSON.parse(await readOutput(cwd, ".vscode/settings.json"));
  assert.deepEqual(settings["html.customData"], [
    "./.vscode/auro.html-custom-data.json",
  ]);

  // Only the VS Code target is on; the others default off (no signal — no
  // pre-existing .vscode/ at detection time, so cssSnippets is off too) and persist.
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(config.init.editors, {
    vscode: true,
    jsx: false,
    svelte: false,
    cssSnippets: false,
  });
  // The disabled targets create nothing.
  await assert.rejects(readOutput(cwd, "auro-types/auro-jsx.d.ts"), /ENOENT/u);
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.code-snippets"),
    /ENOENT/u,
  );
});

test("--jsx writes the JSX types with resolved tags and installed import paths", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", jsx: true, offline: true });

  const jsx = await readOutput(cwd, "auro-types/auro-jsx.d.ts");
  assert.match(jsx, /myapp-button/u, "tag is the resolved custom tag");
  assert.match(
    jsx,
    /import type \{ AuroButton \} from "@aurodesignsystem\/auro-button"/u,
    "class import points at the installed package",
  );
  // No tsconfig.json exists, so nothing is wired (default glob covers auro-types/).
  await assert.rejects(readOutput(cwd, "tsconfig.json"), /ENOENT/u);
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.html-custom-data.json"),
    /ENOENT/u,
  );

  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(config.init.editors.jsx, true);
  assert.equal(config.init.editors.vscode, false);
});

test("--jsx appends auro-types to an existing tsconfig include", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src"] },
      null,
      2,
    ),
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", jsx: true, offline: true });

  const tsconfig = JSON.parse(await readOutput(cwd, "tsconfig.json"));
  assert.deepEqual(tsconfig.include, ["src", "auro-types"], "entry appended");
  assert.equal(
    tsconfig.compilerOptions.strict,
    true,
    "pre-existing options preserved",
  );
});

test("--svelte appends auro-types to an existing jsconfig include", async (t) => {
  // A JS-based Svelte project keeps a jsconfig.json (not tsconfig.json); its
  // explicit `include` won't cover auro-types/ until init appends it. This is the
  // manual jsconfig edit consumers had to make by hand before.
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await writeFile(
    path.join(cwd, "jsconfig.json"),
    JSON.stringify(
      { compilerOptions: { checkJs: true }, include: ["src/**/*"] },
      null,
      2,
    ),
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", svelte: true, offline: true });

  const jsconfig = JSON.parse(await readOutput(cwd, "jsconfig.json"));
  assert.deepEqual(
    jsconfig.include,
    ["src/**/*", "auro-types"],
    "entry appended to jsconfig include",
  );
  assert.equal(
    jsconfig.compilerOptions.checkJs,
    true,
    "pre-existing options preserved",
  );
});

test("tsconfig wins over jsconfig when both exist", async (t) => {
  // TypeScript ignores jsconfig.json when a tsconfig.json is present, so init
  // wires the tsconfig and leaves the jsconfig untouched.
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({ include: ["src"] }, null, 2),
  );
  const jsconfigRaw = JSON.stringify({ include: ["js"] }, null, 2);
  await writeFile(path.join(cwd, "jsconfig.json"), jsconfigRaw);
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", svelte: true, offline: true });

  const tsconfig = JSON.parse(await readOutput(cwd, "tsconfig.json"));
  assert.deepEqual(tsconfig.include, ["src", "auro-types"], "tsconfig wired");
  assert.equal(
    await readOutput(cwd, "jsconfig.json"),
    jsconfigRaw,
    "jsconfig left byte-for-byte untouched",
  );
});

test("--svelte writes the Svelte types artifact", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", svelte: true, offline: true });

  const svelte = await readOutput(cwd, "auro-types/auro-svelte.d.ts");
  assert.match(svelte, /myapp-button/u);
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(config.init.editors.svelte, true);
});

test("--css-snippets writes a ::part snippets file from the CEM cssParts", async (t) => {
  const cwd = await tempCwd(t);
  // auro-formkit's components ship real cssParts (auro-input: wrapper, label, …),
  // so the snippets builder produces output for them.
  await installRealPackage(cwd, "auro-formkit");
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", cssSnippets: true, offline: true });

  // The artifact is auto-discovered under .vscode/ — no settings.json entry.
  const snippets = JSON.parse(
    await readOutput(cwd, ".vscode/auro.code-snippets"),
  ) as Record<string, { scope: string; prefix: string; body: string[] }>;
  const input = snippets["Auro <myapp-input> ::part"];
  assert.ok(input, "a snippet is emitted for the resolved auro-input tag");
  assert.equal(input.scope, "css,scss,less");
  assert.equal(input.prefix, "myapp-input::part");
  assert.match(
    input.body[0],
    /myapp-input::part\(\$\{1\|/u,
    "choice placeholder",
  );

  // No settings.json is written for this target (nothing to register).
  await assert.rejects(readOutput(cwd, ".vscode/settings.json"), /ENOENT/u);

  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(config.init.editors.cssSnippets, true);
});

test("--no-* flags write no editor artifacts even when signals are present", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  // Present every detection signal: a .vscode/ dir, a jsx tsconfig, a svelte dep.
  await mkdir(path.join(cwd, ".vscode"), { recursive: true });
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }, null, 2),
  );
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ devDependencies: { svelte: "^4.0.0" } }, null, 2),
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({
    prefix: "myapp-",
    vscode: false,
    jsx: false,
    svelte: false,
    cssSnippets: false,
    offline: true,
  });

  await assert.rejects(
    readOutput(cwd, ".vscode/auro.html-custom-data.json"),
    /ENOENT/u,
  );
  await assert.rejects(readOutput(cwd, "auro-types/auro-jsx.d.ts"), /ENOENT/u);
  await assert.rejects(
    readOutput(cwd, "auro-types/auro-svelte.d.ts"),
    /ENOENT/u,
  );
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.code-snippets"),
    /ENOENT/u,
  );
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(config.init.editors, {
    vscode: false,
    jsx: false,
    svelte: false,
    cssSnippets: false,
  });
});

test("a detected signal enables its target on a non-interactive run", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await mkdir(path.join(cwd, ".vscode"), { recursive: true }); // VS Code signal
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  // No flags, no persisted config: the non-interactive run takes the detected
  // default and records every target. The .vscode/ signal enables BOTH the VS
  // Code and cssSnippets targets (they share it); jsx/svelte have no signal.
  await runInit({ prefix: "myapp-", offline: true });

  await readOutput(cwd, ".vscode/auro.html-custom-data.json"); // exists
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(config.init.editors, {
    vscode: true,
    jsx: false,
    svelte: false,
    cssSnippets: true,
  });
  // cssSnippets is enabled, but this real package's CEM exposes no cssParts, so
  // the builder returns null and no snippets file is written (empty-file guard).
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.code-snippets"),
    /ENOENT/u,
  );
});

test("a persisted editor choice is honored without a flag", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await writeFile(
    path.join(cwd, "auro.config.json"),
    JSON.stringify({
      version: 1,
      init: {
        prefix: { default: "myapp-", overrides: {} },
        editors: { vscode: true, jsx: false, svelte: false },
      },
    }),
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ offline: true });

  await readOutput(cwd, ".vscode/auro.html-custom-data.json"); // vscode:true honored
  await assert.rejects(readOutput(cwd, "auro-types/auro-jsx.d.ts"), /ENOENT/u);
});

test("interactive run prompts for unsettled targets, seeds detection defaults, and persists the answers", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await mkdir(path.join(cwd, ".vscode"), { recursive: true }); // VS Code signal only
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);
  forceInteractive(t);

  // Capture the batched confirm so we can assert each question's default is the
  // detected signal, then answer *against* those defaults — decline the detected
  // VS Code target, opt into the undetected JSX one, leave Svelte off.
  let askedDefaults: Record<string, unknown> | undefined;
  t.mock.method(
    inquirer,
    "prompt",
    async (questions: Array<{ name: string; default?: unknown }>) => {
      if (questions.some((q) => q.name === "vscode")) {
        askedDefaults = Object.fromEntries(
          questions.map((q) => [q.name, q.default]),
        );
      }
      return { vscode: false, jsx: true, svelte: false, cssSnippets: false };
    },
  );

  // No editor flags and no persisted editors: every target is unsettled and must
  // be prompted for.
  await runInit({ prefix: "myapp-", offline: true });

  // Detection seeds each prompt's default. The .vscode/ dir is present, so both
  // the VS Code and cssSnippets confirms default true; JSX/Svelte have no signal.
  assert.deepEqual(
    askedDefaults,
    { vscode: true, jsx: false, svelte: false, cssSnippets: true },
    "each confirm defaults to its detected signal",
  );

  // The answers — not the detected defaults — drive what gets written…
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.html-custom-data.json"),
    /ENOENT/u,
    "declined despite the VS Code signal",
  );
  await readOutput(cwd, "auro-types/auro-jsx.d.ts"); // opted in despite no signal
  await assert.rejects(
    readOutput(cwd, "auro-types/auro-svelte.d.ts"),
    /ENOENT/u,
  );

  // …and every answered target persists as a concrete boolean.
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(config.init.editors, {
    vscode: false,
    jsx: true,
    svelte: false,
    cssSnippets: false,
  });
});

test("--vscode preserves unrelated settings and is idempotent across runs", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await mkdir(path.join(cwd, ".vscode"), { recursive: true });
  await writeFile(
    path.join(cwd, ".vscode", "settings.json"),
    '{\n  // team defaults\n  "editor.tabSize": 2\n}\n',
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", vscode: true, offline: true });
  await runInit({ prefix: "myapp-", vscode: true, offline: true }); // second run must not duplicate

  // The merge is comment-preserving (JSONC), so assert on the raw text.
  const settingsRaw = await readOutput(cwd, ".vscode/settings.json");
  assert.match(settingsRaw, /team defaults/u, "comment preserved");
  assert.match(settingsRaw, /"editor\.tabSize": 2/u, "unrelated key preserved");
  const entryCount = (settingsRaw.match(/auro\.html-custom-data\.json/gu) ?? [])
    .length;
  assert.equal(entryCount, 1, "the entry appears exactly once across two runs");
});

test("all three editor targets regenerate byte-identically and drop a removed dependency's tag", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button"); // standalone (kept)
  await installRealPackage(cwd, "auro-formkit"); // monorepo (removed below)
  // A pre-existing tsconfig so the JSX/Svelte include merge participates too.
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      { compilerOptions: { strict: true }, include: ["src"] },
      null,
      2,
    ),
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  const artifacts = [
    ".vscode/auro.html-custom-data.json",
    "auro-types/auro-jsx.d.ts",
    "auro-types/auro-svelte.d.ts",
  ];
  const editorFlags = { vscode: true, jsx: true, svelte: true } as const;

  // First run emits all three artifacts plus the settings/tsconfig merges.
  await runInit({ prefix: "myapp-", ...editorFlags, offline: true });
  const firstRun = await Promise.all(artifacts.map((f) => readOutput(cwd, f)));
  // Both components are present across every target before removal.
  for (const contents of firstRun) {
    assert.match(contents, /myapp-button/u);
    assert.match(contents, /myapp-input/u);
  }

  // Second run over identical deps: every artifact is byte-for-byte identical…
  await runInit({ prefix: "myapp-", ...editorFlags, offline: true });
  const secondRun = await Promise.all(artifacts.map((f) => readOutput(cwd, f)));
  for (const [i, contents] of secondRun.entries()) {
    assert.equal(
      contents,
      firstRun[i],
      `${artifacts[i]} regenerates identically`,
    );
  }
  // …and neither the settings entry nor the tsconfig include is duplicated.
  const settingsRaw = await readOutput(cwd, ".vscode/settings.json");
  assert.equal(
    (settingsRaw.match(/auro\.html-custom-data\.json/gu) ?? []).length,
    1,
    "html.customData entry appears exactly once",
  );
  const tsconfig = JSON.parse(await readOutput(cwd, "tsconfig.json"));
  assert.equal(
    tsconfig.include.filter((entry: string) => entry === "auro-types").length,
    1,
    "the auro-types include appears exactly once",
  );

  // Remove the monorepo package, then regenerate: the removed component's tag
  // disappears from *every* target while the standalone stays.
  await rm(
    path.join(cwd, "node_modules", "@aurodesignsystem", "auro-formkit"),
    { recursive: true, force: true },
  );
  await runInit({ prefix: "myapp-", ...editorFlags, offline: true });
  const afterRemoval = await Promise.all(
    artifacts.map((f) => readOutput(cwd, f)),
  );
  for (const [i, contents] of afterRemoval.entries()) {
    assert.match(
      contents,
      /myapp-button/u,
      `${artifacts[i]} keeps the standalone`,
    );
    assert.doesNotMatch(
      contents,
      /myapp-input/u,
      `${artifacts[i]} drops the removed component`,
    );
  }

  // A further run against the reduced deps reproduces each artifact exactly.
  await runInit({ prefix: "myapp-", ...editorFlags, offline: true });
  const finalRun = await Promise.all(artifacts.map((f) => readOutput(cwd, f)));
  for (const [i, contents] of finalRun.entries()) {
    assert.equal(
      contents,
      afterRemoval[i],
      `${artifacts[i]} post-removal regeneration is idempotent`,
    );
  }
});

test("--vscode still writes the artifact when settings.json is unparseable, and warns", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await mkdir(path.join(cwd, ".vscode"), { recursive: true });
  await writeFile(
    path.join(cwd, ".vscode", "settings.json"),
    "{ not valid json",
  );
  stubEditorRun(t, cwd);
  const stderr = captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", vscode: true, offline: true });

  // The artifact is written regardless; only the merge is skipped.
  const customData = await readOutput(
    cwd,
    ".vscode/auro.html-custom-data.json",
  );
  assert.match(customData, /myapp-button/u);
  // The malformed settings file is left byte-for-byte untouched.
  assert.equal(
    await readOutput(cwd, ".vscode/settings.json"),
    "{ not valid json",
  );
  const err = stderr();
  assert.match(err, /settings\.json is not valid JSON/u);
  assert.match(err, /by hand/u, "the manual wiring line is surfaced");
});

test("--jsx still writes the artifact when tsconfig include is unmergeable, and warns", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  // A tsconfig whose `include` is a bare string, not an array — the merge can't
  // safely append to it (branch 4a), so it must warn rather than clobber it.
  await writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: "src" }),
  );
  stubEditorRun(t, cwd);
  const stderr = captureWrite(t, process.stderr);

  await runInit({ prefix: "myapp-", jsx: true, offline: true });

  // The JSX artifact is written regardless; only the tsconfig wiring is skipped.
  assert.match(
    await readOutput(cwd, "auro-types/auro-jsx.d.ts"),
    /myapp-button/u,
  );
  // The unmergeable tsconfig is left byte-for-byte untouched.
  assert.equal(
    await readOutput(cwd, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: "src" }),
  );
  const err = stderr();
  assert.match(err, /tsconfig\.json "include" is not an array/u);
  assert.match(err, /by hand/u, "the manual wiring line is surfaced");
});

test("an explicit flag overrides a conflicting persisted editor choice", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  // Persisted config turns VS Code ON; the flag turns it OFF. Per the frozen
  // precedence (flag → persisted → detection → prompt) the flag must win.
  await writeFile(
    path.join(cwd, "auro.config.json"),
    JSON.stringify({
      version: 1,
      init: {
        prefix: { default: "myapp-", overrides: {} },
        editors: { vscode: true, jsx: false, svelte: false },
      },
    }),
  );
  stubEditorRun(t, cwd);
  captureWrite(t, process.stderr);

  await runInit({ vscode: false, offline: true });

  // No artifact despite the persisted opt-in, and the override re-persists.
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.html-custom-data.json"),
    /ENOENT/u,
  );
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(
    config.init.editors.vscode,
    false,
    "the flag overrides the persisted choice and is written back",
  );
});

// ---------------------------------------------------------------------------
// Outdated-release banner — init mirrors `auro context`/`auro component`,
// warning (on stderr) when an installed package is behind its latest release.
// Online by default; `--offline` skips the network check entirely.
// ---------------------------------------------------------------------------

test("warns on stderr when an installed component is behind its latest release", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  // The installed package's registry lookup reports a much newer release; any
  // other URL 404s so only the release check drives the banner.
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (String(url).includes("registry.npmjs.org")) {
      return new Response(JSON.stringify({ version: "999.0.0" }), {
        status: 200,
      });
    }
    return new Response(null, { status: 404 });
  });

  // Online (no --offline): the check runs after the files are written.
  await runInit({ prefix: "myapp-" });

  // Grounding still happened.
  assert.match(await readOutput(cwd, "AGENTS.md"), /<myapp-button>/u);
  // The shared banner fired and named the outdated package.
  const err = stderr();
  assert.match(err, /NOT on the latest release/u);
  assert.ok(
    err.includes("auro-button"),
    "the banner names the outdated package",
  );
});

test("--offline skips the release check and makes no network call", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init --offline must not hit the network");
  });

  await runInit({ prefix: "myapp-", offline: true });

  // Files written, but the release check never ran: no fetch, no banner.
  assert.match(await readOutput(cwd, "AGENTS.md"), /<myapp-button>/u);
  assert.equal(fetchMock.mock.callCount(), 0, "no network call with --offline");
  assert.doesNotMatch(stderr(), /NOT on the latest release/u);
});

// IntelliSense health check — never finish an init with silently-broken markup
// completions. See src/init/editors/verify.ts and the yellow/red banners in runInit.

test("warns with a yellow banner when the VS Code markup target is off", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  // Markup off, type-checking on — the masked-failure shape from the bug report.
  await runInit({
    prefix: "myapp-",
    offline: true,
    vscode: false,
    svelte: true,
  });

  // The Svelte layer landed, but no VS Code custom-data was generated.
  await readOutput(cwd, "auro-types/auro-svelte.d.ts");
  await assert.rejects(
    readOutput(cwd, ".vscode/auro.html-custom-data.json"),
    /ENOENT/u,
    "no markup custom-data is written when vscode is off",
  );
  // ...and the run said so loudly instead of finishing silently.
  assert.match(
    stderr(),
    /VS Code markup IntelliSense is off/u,
    "the yellow markup-off banner fires",
  );
});

// ---------------------------------------------------------------------------
// Git-ignore reconciliation — every file init writes is meant to be committed,
// so a `.gitignore` rule that silently drops one is surfaced (red banner) and,
// with consent (`--yes`), un-ignored. Advisory: the run never fails over it.
// See src/init/gitignore.ts and reconcileGitignore in runInit.
// ---------------------------------------------------------------------------

test("--yes un-ignores a .gitignore-hidden editor artifact and reports it", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  // A real repo whose .gitignore drops the whole .vscode/ dir — the classic case
  // where a --vscode artifact is written, works locally, and is never committed.
  await simpleGit({ baseDir: cwd }).init();
  await writeFile(path.join(cwd, ".gitignore"), ".vscode/\n");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("git-ignore reconciliation must never exit the run");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({ prefix: "myapp-", vscode: true, yes: true, offline: true });

  // The artifact was written under the ignored dir…
  const artifact = ".vscode/auro.html-custom-data.json";
  await readOutput(cwd, artifact);
  // …the red banner named it and the auto-fix reported success…
  const err = stderr();
  assert.match(err, /git-ignored and won't be committed/u);
  assert.ok(err.includes(artifact), "the banner names the ignored artifact");
  assert.match(err, /Un-ignored \d+ file\(s\)/u, "the fix reports success");
  // …the negations landed in .gitignore…
  const gitignore = await readOutput(cwd, ".gitignore");
  assert.match(gitignore, /Added by auro init/u);
  assert.match(gitignore, /!\.vscode\/auro\.html-custom-data\.json/u);
  // …and git itself now agrees the file is no longer ignored.
  assert.deepEqual(
    await findIgnored(cwd, [artifact]),
    [],
    "the artifact is tracked-eligible after the fix",
  );
});

test("no git-ignored banner when nothing init wrote is ignored", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  // A repo whose .gitignore targets something unrelated — none of init's output
  // is ignored, so the reconciliation is a silent no-op (no false positive).
  await simpleGit({ baseDir: cwd }).init();
  await writeFile(path.join(cwd, ".gitignore"), "node_modules/\n*.log\n");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({ prefix: "myapp-", vscode: true, yes: true, offline: true });

  await readOutput(cwd, ".vscode/auro.html-custom-data.json"); // written
  const err = stderr();
  assert.doesNotMatch(err, /git-ignored and won't be committed/u);
  // The reconciliation never appended its header to the untouched .gitignore.
  assert.doesNotMatch(
    await readOutput(cwd, ".gitignore"),
    /Added by auro init/u,
  );
});

test("a fully-wired vscode run emits no markup-off or wiring-incomplete banner", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  const stderr = captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });

  await runInit({
    prefix: "myapp-",
    offline: true,
    vscode: true,
    svelte: true,
  });

  // Both layers wired → the health check is quiet (no false-positive noise).
  await readOutput(cwd, ".vscode/auro.html-custom-data.json");
  const err = stderr();
  assert.doesNotMatch(err, /VS Code markup IntelliSense is off/u);
  assert.doesNotMatch(err, /wiring is incomplete/u);
});

// ---------------------------------------------------------------------------
// Per-component custom tag prompt
// ---------------------------------------------------------------------------

/**
 * Answer inquirer for a custom-tag run: opt into customization, apply `tagFor`
 * to each per-component input (return the calculated `default` to mimic Enter),
 * and say no to every editor-target / gitignore confirm so output stays minimal.
 */
function mockCustomTagPrompts(
  t: TestContext,
  opts: {
    customize: boolean;
    tagFor?: (message: string, dflt: string) => string;
  },
): void {
  t.mock.method(
    inquirer,
    "prompt",
    async (
      questions: Array<{
        name?: string;
        type?: string;
        message?: string;
        default?: string;
      }>,
    ) => {
      const qs = Array.isArray(questions) ? questions : [questions];
      const answers: Record<string, unknown> = {};
      for (const q of qs) {
        const name = q.name ?? "";
        if (name === "customize") {
          answers.customize = opts.customize;
        } else if (name === "tag") {
          answers.tag = opts.tagFor
            ? opts.tagFor(q.message ?? "", q.default ?? "")
            : (q.default ?? "");
        } else {
          answers[name] = false; // editor-target confirms, gitignore fix, etc.
        }
      }
      return answers;
    },
  );
}

test("interactive: a typed custom tag becomes a per-component override", async (t) => {
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
  forceInteractive(t);
  // Opt in, then rename auro-button's tag to `nav-menu`; Enter (default) otherwise.
  mockCustomTagPrompts(t, {
    customize: true,
    tagFor: (message, dflt) =>
      message.includes("auro-button") ? "nav-menu" : dflt,
  });

  await runInit({ prefix: "myapp-", offline: true });

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(agents, /<nav-menu>/u, "grounding uses the typed tag");
  assert.doesNotMatch(agents, /<myapp-button>/u, "prefix tag did not win");
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.equal(
    config.init.prefix.overrides["auro-button"],
    "nav-menu",
    "typed tag persisted as an override",
  );
});

test("interactive: keeping every calculated tag (Enter) writes no overrides", async (t) => {
  const cwd = await tempCwd(t);
  await installRealPackage(cwd, "auro-button");
  await installRealPackage(cwd, "auro-formkit");
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(process, "exit", () => {
    throw new Error("should not exit on success");
  });
  captureWrite(t, process.stderr);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("init must not hit the network");
  });
  forceInteractive(t);
  // Opt in but accept the calculated default for every component (tagFor omitted).
  mockCustomTagPrompts(t, { customize: true });

  await runInit({ prefix: "myapp-", offline: true });

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(
    agents,
    /<myapp-button>/u,
    "prefix tag kept when Enter is pressed",
  );
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(
    config.init.prefix.overrides,
    {},
    "an unchanged component is not pinned as an override",
  );
});

test("interactive: declining customization leaves the prefixed tags untouched", async (t) => {
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
  forceInteractive(t);
  mockCustomTagPrompts(t, { customize: false });

  await runInit({ prefix: "myapp-", offline: true });

  const agents = await readOutput(cwd, "AGENTS.md");
  assert.match(agents, /<myapp-button>/u);
  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(config.init.prefix.overrides, {});
});

test("non-interactive runs never issue the custom-tag prompt", async (t) => {
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
  // No forceInteractive → non-TTY runner is non-interactive. Any prompt is a bug.
  t.mock.method(inquirer, "prompt", async () => {
    throw new Error("must not prompt in a non-interactive run");
  });

  await runInit({ prefix: "myapp-", offline: true });

  const config = JSON.parse(await readOutput(cwd, "auro.config.json"));
  assert.deepEqual(config.init.prefix.overrides, {});
});

test("isValidCustomTag accepts valid custom-element names and rejects the rest", () => {
  assert.equal(isValidCustomTag("nav-menu"), true);
  assert.equal(isValidCustomTag("auro-button"), true);
  assert.equal(isValidCustomTag("x-y-z"), true);
  // Uppercase, no hyphen, leading non-letter, and spaces are all rejected (string).
  assert.equal(typeof isValidCustomTag("MyButton"), "string");
  assert.equal(typeof isValidCustomTag("button"), "string");
  assert.equal(typeof isValidCustomTag("1-thing"), "string");
  assert.equal(typeof isValidCustomTag("nav menu"), "string");
});
