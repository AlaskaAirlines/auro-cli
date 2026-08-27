import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type AuroConfig,
  CONFIG_FILENAME,
  CONFIG_VERSION,
} from "../src/init/config.ts";
import {
  AGENTS_FILENAME,
  CLAUDE_MD,
  GROUNDING_HEADER,
  INSTALLED_TABLE_HEADER,
  REGENERATION_NOTE,
  SECTION_HEADINGS,
} from "../src/init/layout.ts";
import { AURO_CODING_RULES } from "../src/init/rules.ts";

/**
 * Freeze tests for the PT-M1 file format (build-order step 1). These assert the
 * golden fixtures embody the frozen decisions and stay in sync with the
 * input-independent constants the generator (step 4) will assemble around. They
 * do NOT assert byte-exact generator output (the generator doesn't exist yet) —
 * that golden test lands with the generator. Their job is to catch silent format
 * drift before generation is wired.
 */

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/init/${name}`, import.meta.url)),
    "utf-8",
  );

const AGENTS_MD = fixture("AGENTS.md");

test("auro.config.json fixture matches the frozen schema", () => {
  const raw = fixture(CONFIG_FILENAME);
  const config = JSON.parse(raw) as AuroConfig;

  assert.equal(config.version, CONFIG_VERSION, "top-level version is v1");
  assert.equal(typeof config.init.prefix.default, "string");
  assert.ok(config.init.prefix.default.length > 0, "a default prefix is set");
  assert.equal(typeof config.init.prefix.overrides, "object");

  // Override keys are the bare `auro-*` tag (the stable component identity), and
  // values are the resolved custom tag.
  for (const [key, value] of Object.entries(config.init.prefix.overrides)) {
    assert.match(key, /^auro-/u, `override key ${key} is a bare auro-* tag`);
    assert.ok(value.length > 0, `override ${key} maps to a non-empty tag`);
  }
});

test("CLAUDE.md fixture is the frozen thin @AGENTS.md import", () => {
  const claude = fixture("CLAUDE.md");
  assert.equal(
    claude,
    CLAUDE_MD,
    "fixture equals the frozen CLAUDE_MD constant",
  );
  assert.equal(
    claude.trim(),
    `@${AGENTS_FILENAME}`,
    "body is exactly the @AGENTS.md import",
  );
});

test("AGENTS.md fixture is built from the frozen scaffolding constants", () => {
  assert.ok(
    AGENTS_MD.startsWith(GROUNDING_HEADER),
    "opens with the frozen header + What is Auro? section",
  );
  assert.ok(
    AGENTS_MD.includes(AURO_CODING_RULES),
    "embeds the frozen Auro Coding Rules block verbatim",
  );
  assert.ok(
    AGENTS_MD.includes(INSTALLED_TABLE_HEADER),
    "includes the frozen Installed Components table header",
  );
  assert.ok(
    AGENTS_MD.trimEnd().endsWith(REGENERATION_NOTE.trimEnd()),
    "closes with the frozen Regeneration section",
  );
});

test("AGENTS.md emits the frozen top-level sections in order", () => {
  const indices = SECTION_HEADINGS.map((heading) =>
    AGENTS_MD.indexOf(`## ${heading}`),
  );
  for (const [i, index] of indices.entries()) {
    assert.ok(index >= 0, `section "${SECTION_HEADINGS[i]}" is present`);
    if (i > 0) {
      assert.ok(
        index > indices[i - 1],
        `section "${SECTION_HEADINGS[i]}" follows "${SECTION_HEADINGS[i - 1]}"`,
      );
    }
  }
});

test("AGENTS.md pins monorepo subpath imports and resolved custom tags", () => {
  // Monorepo component imported via its subpath export, not the package root.
  assert.match(
    AGENTS_MD,
    /@aurodesignsystem\/auro-formkit\/auro-input/u,
    "formkit component uses its subpath export",
  );
  // The resolved (prefixed / overridden) tags are used, not the bare auro-* tag.
  assert.match(AGENTS_MD, /<myapp-button>/u, "default-prefixed tag applied");
  assert.match(AGENTS_MD, /<legacy-input>/u, "per-component override applied");
  // Registration snippet uses the resolved tag.
  assert.match(AGENTS_MD, /AuroInput\.register\('legacy-input'\)/u);
});
