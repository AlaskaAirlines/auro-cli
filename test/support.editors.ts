/**
 * Shared synthetic inputs for the PT-M2 editor-artifact tests. These are the SAME
 * two components the PT-M1 golden AGENTS.md is assembled from (see
 * generator.test.ts): a standalone `auro-button` prefixed to `<myapp-button>`,
 * and a `auro-formkit` monorepo `auro-input` imported via its subpath export and
 * overridden to `<legacy-input>`. Keeping the editor golden fixtures on the same
 * inputs means every `auro init` artifact — grounding docs and editor types alike
 * — is pinned against one consistent resolved manifest.
 *
 * This is a `.ts` support module, not a `*.test.ts`, so importing it never runs a
 * test; the golden test and the throwaway fixture-regen script share it as the
 * single source of truth for what the builders are fed.
 */

import type { ResolvedComponent } from "../src/init/resolver.ts";

/** Standalone package → imports from the package root, prefixed tag. */
export const BUTTON: ResolvedComponent = {
  pkg: "@aurodesignsystem/auro-button",
  version: "12.3.0",
  tagName: "auro-button",
  importPath: "@aurodesignsystem/auro-button",
  isMonorepo: false,
  declaration: {
    kind: "class",
    name: "AuroButton",
    tagName: "auro-button",
    customElement: true,
    description: "A clickable button styled per the Auro Design System.",
    superclass: { name: "LitElement" },
    attributes: [
      {
        name: "disabled",
        description: "Disables the button.",
        type: { text: "boolean" },
      },
      {
        name: "fluid",
        description: "Stretches to full width.",
        type: { text: "boolean" },
      },
      {
        // A reflected, string-literal-union attribute — proves value
        // completion/validation survives across all three targets (the class
        // -indexed form would collapse this to `any`). fieldName + description
        // keep it past the private-reflection guard as a documented public attr.
        name: "variant",
        fieldName: "variant",
        description: "Visual style variant.",
        type: {
          text: '"primary" | "secondary" | "tertiary" | "ghost" | "flat"',
        },
      },
    ],
    slots: [{ name: "", description: "Button label content." }],
    events: [{ name: "click", description: "Fired on activation." }],
  },
};

/** Monorepo package → imports via its subpath export, overridden tag. */
export const INPUT: ResolvedComponent = {
  pkg: "@aurodesignsystem/auro-formkit",
  version: "6.1.0",
  tagName: "auro-input",
  importPath: "@aurodesignsystem/auro-formkit/auro-input",
  isMonorepo: true,
  declaration: {
    kind: "class",
    name: "AuroInput",
    tagName: "auro-input",
    customElement: true,
    description: "A text input field with built-in validation.",
    superclass: { name: "LitElement" },
    attributes: [
      {
        name: "required",
        description: "Marks the field as required.",
        type: { text: "boolean" },
      },
    ],
    slots: [{ name: "label", description: "The field label." }],
    events: [],
  },
};

/** Canonical bare `auro-*` tag → the tag a consumer actually registers. */
export const RESOLVED_TAGS: ReadonlyMap<string, string> = new Map([
  ["auro-button", "myapp-button"],
  ["auro-input", "legacy-input"],
]);

/** Both components in PT-M1 detection order. */
export const COMPONENTS: ResolvedComponent[] = [BUTTON, INPUT];
