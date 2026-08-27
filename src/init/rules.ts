/**
 * The static "Auro coding rules" block embedded in every generated `AGENTS.md`.
 *
 * FROZEN per docs/pt-m1-completion-plan.md → "Frozen decisions" (the ticket's
 * bus-factor note: freeze the file format early). This is input-independent
 * prose; the per-component API bodies and the resolved tag/import lines are
 * assembled around it by the generator (build-order step 4). Edit here — never
 * inline in the generator — so the rules stay in one place.
 *
 * The block owns its own `## Auro Coding Rules` heading so it can be dropped into
 * the document (or reused for future targets) as a self-contained unit.
 */
export const AURO_CODING_RULES = `## Auro Coding Rules

These rules apply to every Auro component in this project. Use the exact
registered tags listed under **Installed Components** below: this project uses
custom registration, so a component's tag may differ from its default \`auro-*\`
name.

1. **Use Auro custom-element tags, never plain HTML equivalents.**
   - ✗ \`<button>\` → ✓ the registered Auro button tag
   - ✗ \`<input>\` → ✓ the registered Auro input tag (from \`auro-formkit\`)

   Only use components listed under **Installed Components**. Do not invent tags
   or reference components this project has not installed.

2. **Import and register each component before use.** Each component ships its
   own import, and this project registers components under custom tags. The exact
   \`import\` + \`register(...)\` snippet for each component is shown in its section
   below. \`auro-formkit\` has no root export — always import the specific
   sub-component via its subpath export (e.g.
   \`@aurodesignsystem/auro-formkit/auro-input\`).

3. **Attributes in markup, camelCase properties in JS.** The same field is a
   kebab-case attribute in HTML and a camelCase property in JavaScript.
   \`\`\`html
   <!-- attribute -->
   <auro-button disabled>Save</auro-button>
   \`\`\`
   \`\`\`js
   element.loading = true; // property
   \`\`\`

4. **Put content in named slots, not \`innerHTML\`.** Each component's slot names
   are listed in its API section below.

5. **Use design tokens for color, spacing, and type.** Install
   \`@aurodesignsystem/design-tokens\` and use the \`--ds-basic-*\` /
   \`--ds-advanced-*\` CSS custom properties rather than hard-coded values.

6. **Accessibility is built in — don't override it.** Auro components ship WCAG
   2.1 AA behavior (focus management, ARIA, error messaging). Prefer the provided
   slots and attributes over custom ARIA.
`;
