import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuroConfig } from "../src/init/config.ts";
import {
  emptyConfig,
  inferPrefixFromTag,
  loadConfig,
  planTagResolution,
  RegistryError,
  saveConfig,
  scanSource,
  suggestDefaultPrefix,
} from "../src/init/registry.ts";
import type { ResolvedComponent } from "../src/init/resolver.ts";
import { tempCwd } from "./support.ts";

const BUTTON = "@aurodesignsystem/auro-button";
const FORMKIT = "@aurodesignsystem/auro-formkit";

/** A minimal ResolvedComponent — only the fields the registry reads. */
function component(
  tagName: string,
  className: string,
  extra: Partial<ResolvedComponent> = {},
): ResolvedComponent {
  return {
    pkg: BUTTON,
    version: "1.0.0",
    tagName,
    importPath: BUTTON,
    isMonorepo: false,
    declaration: {
      kind: "class",
      name: className,
      tagName,
      customElement: true,
    },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// AST scan
// ---------------------------------------------------------------------------

test("scanSource captures a static register() tag with its class name", () => {
  const scan = scanSource(
    "app.ts",
    `import { AuroButton } from "@aurodesignsystem/auro-button";
     AuroButton.register("myapp-button");`,
  );
  assert.deepEqual(scan.matches, [
    { className: "AuroButton", tag: "myapp-button" },
  ]);
  assert.deepEqual(scan.warnings, []);
});

test("scanSource parses JSX and a no-substitution template literal tag", () => {
  const scan = scanSource(
    "app.jsx",
    "AuroInput.register(`legacy-input`);\nconst el = <div />;",
  );
  assert.deepEqual(scan.matches, [
    { className: "AuroInput", tag: "legacy-input" },
  ]);
  assert.deepEqual(scan.warnings, []);
});

test("scanSource warns and skips a non-literal register() tag", () => {
  const scan = scanSource(
    "app.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional — this is source-under-test containing a template literal the scanner must skip.
    "AuroButton.register(`${prefix}-button`);\nAuroInput.register(tagVar);",
  );
  assert.deepEqual(scan.matches, [], "neither tag is statically resolvable");
  assert.equal(scan.warnings.length, 2, "both are warned");
  assert.ok(scan.warnings.every((w) => w.includes("non-literal")));
});

test("scanSource warns rather than throwing on a syntax error", () => {
  const scan = scanSource("broken.ts", "AuroButton.register('x'  <<< ;;;");
  // The tolerant parser still recovers the call here; the point is it never
  // throws — matches or warnings, but no crash.
  assert.ok(Array.isArray(scan.matches) && Array.isArray(scan.warnings));
});

test("scanSource records a no-arg register() as a default registration, not a warning", () => {
  const scan = scanSource(
    "app.ts",
    `import { AuroButton } from "@aurodesignsystem/auro-button";
     AuroButton.register();`,
  );
  assert.deepEqual(scan.matches, [], "a no-arg call is not a static-tag match");
  assert.deepEqual(scan.defaultRegistrations, ["AuroButton"]);
  assert.deepEqual(scan.warnings, [], "the default tag is known, not guessed");
});

test("scanSource ignores Auro's auto-versioned dependency registration", () => {
  const scan = scanSource(
    "combobox.ts",
    `import { AuroDependencyVersioning } from "@aurodesignsystem/auro-library/scripts/runtime/dependencyTagVersioning.mjs";
     const versioning = new AuroDependencyVersioning();
     const inputTag = versioning.generateTag("auro-input", "3.0.0", AuroInput);
     customElements.define("auro-input-3_0_0", class extends AuroInput {});`,
  );
  // generateTag()/customElements.define() are not .register() — never matched,
  // never guessed, never warned (no false positive on the versioning internals).
  assert.deepEqual(scan.matches, []);
  assert.deepEqual(scan.defaultRegistrations, []);
  assert.deepEqual(scan.warnings, []);
});

// ---------------------------------------------------------------------------
// Config IO
// ---------------------------------------------------------------------------

test("saveConfig then loadConfig round-trips the config", async (t) => {
  const cwd = await tempCwd(t);
  const config = emptyConfig("myapp-");
  config.init.prefix.overrides["auro-input"] = "legacy-input";
  saveConfig(cwd, config);

  const loaded = loadConfig(cwd);
  assert.deepEqual(loaded, config);
});

test("loadConfig returns null when no config file is present", async (t) => {
  const cwd = await tempCwd(t);
  assert.equal(loadConfig(cwd), null);
});

test("loadConfig throws RegistryError on malformed JSON", async (t) => {
  const cwd = await tempCwd(t);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(`${cwd}/auro.config.json`, "{ not valid json", "utf-8");
  assert.throws(() => loadConfig(cwd), RegistryError);
});

test("loadConfig throws RegistryError on an unsupported version", async (t) => {
  const cwd = await tempCwd(t);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${cwd}/auro.config.json`,
    JSON.stringify({
      version: 99,
      init: { prefix: { default: "", overrides: {} } },
    }),
    "utf-8",
  );
  assert.throws(() => loadConfig(cwd), RegistryError);
});

// ---------------------------------------------------------------------------
// Prefix inference
// ---------------------------------------------------------------------------

test("inferPrefixFromTag extracts the prefix from a prefixed tag", () => {
  assert.equal(inferPrefixFromTag("auro-input", "legacy-input"), "legacy-");
  assert.equal(inferPrefixFromTag("auro-button", "myapp-button"), "myapp-");
});

test("inferPrefixFromTag returns null for a full rename", () => {
  assert.equal(inferPrefixFromTag("auro-input", "text-field"), null);
});

test("suggestDefaultPrefix picks the majority and flags a conflict", () => {
  assert.deepEqual(suggestDefaultPrefix(["myapp-", "myapp-", "legacy-"]), {
    suggestion: "myapp-",
    mixed: true,
  });
  assert.deepEqual(suggestDefaultPrefix(["myapp-", "myapp-"]), {
    suggestion: "myapp-",
    mixed: false,
  });
  assert.deepEqual(suggestDefaultPrefix([null, "auro-", ""]), { mixed: false });
});

// ---------------------------------------------------------------------------
// planTagResolution
// ---------------------------------------------------------------------------

test("planTagResolution: config override wins over scan and default", () => {
  const components = [component("auro-input", "AuroInput")];
  const config: AuroConfig = {
    version: 1,
    init: {
      prefix: {
        default: "myapp-",
        overrides: { "auro-input": "config-input" },
      },
    },
  };
  const scan = {
    matches: [{ className: "AuroInput", tag: "scan-input" }],
    warnings: [],
  };

  const plan = planTagResolution(components, { config, scan, prefix: "cli-" });
  assert.equal(
    plan.resolvedTags.get("auro-input"),
    "config-input",
    "config precedence beats scan and --prefix",
  );
  assert.equal(plan.needsDefaultPrefix, false);
});

test("planTagResolution: a scan match is honored and persisted into the config", () => {
  const components = [component("auro-input", "AuroInput")];
  const scan = {
    matches: [{ className: "AuroInput", tag: "legacy-input" }],
    warnings: [],
  };

  const plan = planTagResolution(components, { scan, prefix: "myapp-" });
  assert.equal(plan.resolvedTags.get("auro-input"), "legacy-input");
  assert.equal(
    plan.config.init.prefix.overrides["auro-input"],
    "legacy-input",
    "the detected registration is persisted so regeneration honors it",
  );
});

test("planTagResolution: an explicit prefix is applied to every un-overridden component", () => {
  const components = [
    component("auro-button", "AuroButton"),
    component("auro-input", "AuroInput", {
      pkg: FORMKIT,
      isMonorepo: true,
      importPath: `${FORMKIT}/auro-input`,
    }),
  ];

  const plan = planTagResolution(components, { prefix: "myapp-" });
  assert.deepEqual(
    [...plan.resolvedTags.entries()],
    [
      ["auro-button", "myapp-button"],
      ["auro-input", "myapp-input"],
    ],
    "the prefix replaces auro- for both standalone and monorepo tags",
  );
  assert.equal(plan.needsDefaultPrefix, false);
  assert.deepEqual(plan.warnings, []);
});

test("planTagResolution: a bare default keeps auro-* tags and warns", () => {
  const components = [component("auro-button", "AuroButton")];

  const plan = planTagResolution(components, { prefix: "" });
  assert.equal(plan.resolvedTags.get("auro-button"), "auro-button");
  assert.equal(plan.warnings.length, 1);
  assert.ok(plan.warnings[0].includes("bare 'auro-*'"));
});

test("planTagResolution: mixed inferred prefixes suggest the majority and preserve overrides", () => {
  const components = [
    component("auro-button", "AuroButton"),
    component("auro-input", "AuroInput"),
    component("auro-select", "AuroSelect"),
  ];
  const scan = {
    matches: [
      { className: "AuroButton", tag: "myapp-button" },
      { className: "AuroInput", tag: "myapp-input" },
      { className: "AuroSelect", tag: "legacy-select" },
    ],
    warnings: [],
  };

  const plan = planTagResolution(components, { scan });
  assert.equal(plan.mixedPrefixes, true);
  assert.equal(
    plan.suggestedDefault,
    "myapp-",
    "the majority prefix is suggested",
  );
  // Every existing registration is grounded under its actual tag...
  assert.equal(plan.resolvedTags.get("auro-select"), "legacy-select");
  // ...and preserved as a per-component override for deterministic regen.
  assert.equal(
    plan.config.init.prefix.overrides["auro-select"],
    "legacy-select",
  );
  assert.equal(
    plan.needsDefaultPrefix,
    false,
    "every component was covered by a scan match",
  );
});

test("planTagResolution: no determinable default flags needsDefaultPrefix", () => {
  const components = [
    component("auro-button", "AuroButton"),
    component("auro-input", "AuroInput"),
  ];
  const scan = {
    matches: [{ className: "AuroButton", tag: "myapp-button" }],
    warnings: [],
  };

  const plan = planTagResolution(components, { scan });
  assert.equal(
    plan.needsDefaultPrefix,
    true,
    "auro-input has no override/default",
  );
  assert.deepEqual(plan.needingDefault, ["auro-input"]);
  assert.equal(plan.resolvedTags.get("auro-button"), "myapp-button");
  assert.equal(
    plan.resolvedTags.has("auro-input"),
    false,
    "left for phase two",
  );
  assert.equal(
    plan.suggestedDefault,
    "myapp-",
    "inferred from the one registration",
  );
});

test("planTagResolution: a register() that ties to no component is warned and ignored", () => {
  const components = [component("auro-button", "AuroButton")];
  const scan = {
    matches: [{ className: "SomeOtherThing", tag: "x-widget" }],
    warnings: [],
  };

  const plan = planTagResolution(components, { scan, prefix: "myapp-" });
  assert.equal(plan.resolvedTags.get("auro-button"), "myapp-button");
  assert.equal(plan.warnings.length, 1);
  assert.ok(plan.warnings[0].includes("could not tie it to an installed"));
});

test("planTagResolution: a default register() grounded under a prefix warns about the mismatch", () => {
  const components = [component("auro-button", "AuroButton")];
  const scan = {
    matches: [],
    defaultRegistrations: ["AuroButton"],
    warnings: [],
  };

  const plan = planTagResolution(components, { scan, prefix: "myapp-" });
  assert.equal(plan.resolvedTags.get("auro-button"), "myapp-button");
  const warning = plan.warnings.find((w) =>
    w.includes("AuroButton.register()"),
  );
  assert.ok(warning, "the app-vs-grounding mismatch is surfaced");
  assert.ok(warning?.includes("<auro-button>"), "names the default tag");
  assert.ok(warning?.includes("<myapp-button>"), "names the grounded tag");
});

test("planTagResolution: a default register() at the bare canonical tag does not warn", () => {
  const components = [component("auro-button", "AuroButton")];
  const scan = {
    matches: [],
    defaultRegistrations: ["AuroButton"],
    warnings: [],
  };

  // No prefix — the component keeps its bare auro-button tag, so the no-arg
  // register() already matches the grounding and there is nothing to fix.
  const plan = planTagResolution(components, { scan, prefix: "" });
  assert.equal(plan.resolvedTags.get("auro-button"), "auro-button");
  assert.ok(
    !plan.warnings.some((w) => w.includes("AuroButton.register()")),
    "no mismatch warning when the default tag is what we grounded",
  );
});
