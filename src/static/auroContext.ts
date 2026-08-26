const AURO_CONTEXT_HEADER = `# Auro Design System — AI Assistant Context
Alaska Airlines open-source design system | https://auro.alaskaair.com

## What is Auro?
Auro is Alaska Airlines' design system built on Web Components (Custom Elements v1) using the Lit library.
- npm scope: \`@aurodesignsystem/\` (current), \`@alaskaairux/\` (legacy)
- Framework-agnostic: works with React, Angular, Vue, Svelte, or plain HTML
- Each component is a separate npm package
- All components use the \`<auro-*>\` custom element tag

## Rules for Writing Auro Code

1. **Use \`<auro-*>\` custom element tags — never plain HTML equivalents**
   - ✗ \`<button>\` → ✓ \`<auro-button>\`
   - ✗ \`<a href="...">\` → ✓ \`<auro-hyperlink href="...">\`
   - ✗ \`<input>\` → ✓ \`<auro-input>\` (from auro-formkit)

2. **Install and register each component before use**
   \`\`\`bash
   npm install @aurodesignsystem/auro-button
   \`\`\`
   \`\`\`js
   import "@aurodesignsystem/auro-button"; // registers <auro-button> globally
   \`\`\`

3. **Props are HTML attributes in templates; camelCase properties in JS**
   \`\`\`html
   <auro-button disabled loading>Save</auro-button>
   \`\`\`
   \`\`\`js
   document.querySelector('auro-button').loading = true;
   \`\`\`

4. **Content goes in named slots, not innerHTML**
   \`\`\`html
   <auro-dialog>
     <span slot="header">Title</span>
     <div slot="content">Body content here</div>
   </auro-dialog>
   \`\`\`

5. **Design tokens are CSS custom properties**
   \`\`\`bash
   npm install @aurodesignsystem/design-tokens
   \`\`\`
   \`\`\`css
   @import "@aurodesignsystem/design-tokens/dist/themes/CSSCustomProperties--bundled.css";
   \`\`\`
   Token naming: \`--ds-basic-*\` and \`--ds-advanced-*\` (e.g. \`--ds-advanced-color-*\`, \`--ds-basic-color-*\`)

## Component Reference

`;

/** The Markdown table header rows the component-reference body sits under. */
const COMPONENT_TABLE_HEADER = `| Element Tag | Package | Description |
|---|---|---|`;

/** A single component's entry in the curated Component Reference. */
export interface AuroComponent {
  /** The custom element tag, without angle brackets — e.g. \`auro-button\`. */
  tag: string;
  /** The npm package that publishes the component. */
  pkg: string;
  /** One-line description shown in the Component Reference table. */
  description: string;
}

/**
 * Curated component data, used as the offline fallback and as the base set the
 * \`auro context\` command enriches with live Custom Elements Manifest data.
 * Descriptions here are hand-written and may lag the published manifests —
 * \`auro context\` overrides them with live manifest data where available, but
 * always keeps every component listed so nothing is dropped before a component
 * publishes a CEM.
 */
export const STATIC_COMPONENTS: AuroComponent[] = [
  {
    tag: "auro-accordion",
    pkg: "@aurodesignsystem/auro-accordion",
    description: "Expandable content sections",
  },
  {
    tag: "auro-alert",
    pkg: "@aurodesignsystem/auro-alert",
    description: "Inline status messages: error, warning, success, information",
  },
  {
    tag: "auro-avatar",
    pkg: "@aurodesignsystem/auro-avatar",
    description: "User or entity avatar",
  },
  {
    tag: "auro-background",
    pkg: "@aurodesignsystem/auro-background",
    description: "Themed background wrapper",
  },
  {
    tag: "auro-backtotop",
    pkg: "@aurodesignsystem/auro-backtotop",
    description: "Scroll-to-top button",
  },
  {
    tag: "auro-badge",
    pkg: "@aurodesignsystem/auro-badge",
    description: "Status or count badge",
  },
  {
    tag: "auro-banner",
    pkg: "@aurodesignsystem/auro-banner",
    description: "Full-width promotional banner",
  },
  {
    tag: "auro-button",
    pkg: "@aurodesignsystem/auro-button",
    description: "Interactive button; supports `loading`, `disabled`, `shape`",
  },
  {
    tag: "auro-card",
    pkg: "@aurodesignsystem/auro-card",
    description: "Content card container",
  },
  {
    tag: "auro-carousel",
    pkg: "@aurodesignsystem/auro-carousel",
    description: "Horizontally scrollable carousel",
  },
  {
    tag: "auro-datetime",
    pkg: "@aurodesignsystem/auro-datetime",
    description: "Localized date and time formatting",
  },
  {
    tag: "auro-dialog",
    pkg: "@aurodesignsystem/auro-dialog",
    description: "Modal dialog; slots: header, content, footer",
  },
  {
    tag: "auro-drawer",
    pkg: "@aurodesignsystem/auro-drawer",
    description: "Slide-in panel; slots: header, content, footer",
  },
  {
    tag: "auro-flight",
    pkg: "@aurodesignsystem/auro-flight",
    description: "Flight segment display (origin, destination, stops)",
  },
  {
    tag: "auro-flightline",
    pkg: "@aurodesignsystem/auro-flightline",
    description: "Visual flight path/stop indicator",
  },
  {
    tag: "auro-input",
    pkg: "@aurodesignsystem/auro-formkit",
    description: "Text input field",
  },
  {
    tag: "auro-select",
    pkg: "@aurodesignsystem/auro-formkit",
    description: "Select/dropdown",
  },
  {
    tag: "auro-datepicker",
    pkg: "@aurodesignsystem/auro-formkit",
    description: "Date picker input",
  },
  {
    tag: "auro-combobox",
    pkg: "@aurodesignsystem/auro-formkit",
    description: "Combobox with search",
  },
  {
    tag: "auro-checkbox",
    pkg: "@aurodesignsystem/auro-formkit",
    description: "Checkbox input",
  },
  {
    tag: "auro-radio",
    pkg: "@aurodesignsystem/auro-formkit",
    description: "Radio button input",
  },
  {
    tag: "auro-header",
    pkg: "@aurodesignsystem/auro-header",
    description: "Page/section heading",
  },
  {
    tag: "auro-hyperlink",
    pkg: "@aurodesignsystem/auro-hyperlink",
    description: "Accessible anchor link",
  },
  {
    tag: "auro-icon",
    pkg: "@aurodesignsystem/auro-icon",
    description: "Alaska Airlines icon: `category` + `name` attributes",
  },
  {
    tag: "auro-loader",
    pkg: "@aurodesignsystem/auro-loader",
    description: "Loading spinner",
  },
  {
    tag: "auro-lockup",
    pkg: "@aurodesignsystem/auro-lockup",
    description: "Image + text layout lockup",
  },
  {
    tag: "auro-nav",
    pkg: "@aurodesignsystem/auro-nav",
    description: "Secondary navigation aid (relation to higher-level pages)",
  },
  {
    tag: "auro-pane",
    pkg: "@aurodesignsystem/auro-pane",
    description: "Selectable shoulder dates with associated prices",
  },
  {
    tag: "auro-popover",
    pkg: "@aurodesignsystem/auro-popover",
    description: "Tooltip-style popover",
  },
  {
    tag: "auro-sidenav",
    pkg: "@aurodesignsystem/auro-sidenav",
    description: "Vertical side navigation",
  },
  {
    tag: "auro-skeleton",
    pkg: "@aurodesignsystem/auro-skeleton",
    description: "Loading placeholder skeleton",
  },
  {
    tag: "auro-slideshow",
    pkg: "@aurodesignsystem/auro-slideshow",
    description: "Image/content slideshow",
  },
  {
    tag: "auro-table",
    pkg: "@aurodesignsystem/auro-table",
    description: "Accessible data table",
  },
  {
    tag: "auro-tabs",
    pkg: "@aurodesignsystem/auro-tabs",
    description: "Tabbed content panels",
  },
  {
    tag: "auro-tail",
    pkg: "@aurodesignsystem/auro-tail",
    description: "Alaska, Hawaiian, and partner airline tail graphics",
  },
  {
    tag: "auro-toast",
    pkg: "@aurodesignsystem/auro-toast",
    description: "Transient notification toast",
  },
  {
    tag: "auro-tokenlist",
    pkg: "@aurodesignsystem/auro-tokenlist",
    description: "Design token display utilities",
  },
];

/**
 * Render a set of components as the Markdown Component Reference body (the
 * \`| tag | package | description |\` rows, without the header). Pipes in
 * descriptions are escaped so they don't break the table.
 */
export function renderComponentRows(
  components: readonly AuroComponent[],
): string {
  return components
    .map(
      (component) =>
        `| \`<${component.tag}>\` | \`${component.pkg}\` | ${component.description.replace(/\|/gu, "\\|")} |`,
    )
    .join("\n");
}

/**
 * Hand-written component-reference table body, used as the offline fallback
 * when the live Custom Elements Manifests can't be fetched.
 */
export const STATIC_COMPONENT_TABLE = renderComponentRows(STATIC_COMPONENTS);

const AURO_CONTEXT_FOOTER = `## Common Patterns

### Button (default, secondary, tertiary)
\`\`\`html
<auro-button>Primary</auro-button>
<auro-button variant="secondary">Secondary</auro-button>
<auro-button variant="tertiary">Tertiary</auro-button>
<auro-button loading>Saving...</auro-button>
\`\`\`

### Alert
\`\`\`html
<auro-alert type="success">Changes saved.</auro-alert>
<auro-alert type="error">Something went wrong.</auro-alert>
<auro-alert type="warning">Please review before continuing.</auro-alert>
<auro-alert type="information">Your flight departs at 9am.</auro-alert>
\`\`\`

### Form inputs (auro-formkit)
auro-formkit has no root export — always import the specific sub-component.
The field label is a **slot**, not an attribute.
\`\`\`js
import "@aurodesignsystem/auro-formkit/auro-input";
import "@aurodesignsystem/auro-formkit/auro-select";
\`\`\`
\`\`\`html
<auro-input required>
  <span slot="label">First name</span>
</auro-input>
<auro-select>
  <span slot="label">Seat preference</span>
  <auro-menu>
    <auro-menuoption value="window">Window</auro-menuoption>
    <auro-menuoption value="aisle">Aisle</auro-menuoption>
  </auro-menu>
</auro-select>
\`\`\`

### Icon
Set \`category\` and \`name\`. Icon names are exact — check the icon library for the correct name.
\`\`\`html
<auro-icon category="interface" name="arrow-right"></auro-icon>
<auro-icon category="terminal" name="plane-side-fill"></auro-icon>
\`\`\`

### Hyperlink
\`\`\`html
<auro-hyperlink href="/flights">View flights</auro-hyperlink>
<auro-hyperlink href="https://example.com" target="_blank">External link</auro-hyperlink>
\`\`\`

### Dialog (modal)
\`\`\`js
document.querySelector('#confirmDialog').show();
\`\`\`
\`\`\`html
<auro-dialog id="confirmDialog">
  <span slot="header">Confirm booking</span>
  <div slot="content">Are you sure you want to book this flight?</div>
  <div slot="footer">
    <auro-button>Confirm</auro-button>
    <auro-button variant="secondary">Cancel</auro-button>
  </div>
</auro-dialog>
\`\`\`

## Accessibility Notes
- Use the \`ariaLabel\` slot on \`<auro-button>\` for icon-only buttons
- \`<auro-hyperlink>\` adds rel="noopener noreferrer" automatically for external links
- All \`auro-formkit\` components handle aria-invalid and error messaging built-in
- All components meet WCAG 2.1 AA

## Documentation
- Component docs: https://auro.alaskaair.com
- Component status: https://auro.alaskaair.com/component-status
- Design tokens: https://auro.alaskaair.com/getting-started/developers/token-usage
- Contributing: https://auro.alaskaair.com/getting-started/developers/contributing
- GitHub: https://github.com/AlaskaAirlines
`;

/**
 * Assemble the full AI-assistant context document from a Component Reference
 * table body (the \`| tag | package | description |\` rows, without the header).
 * The surrounding prose — rules, patterns, accessibility notes — is static; only
 * the component table varies between the live-manifest and fallback versions.
 */
export function buildAuroContext(componentTable: string): string {
  return `${AURO_CONTEXT_HEADER}${COMPONENT_TABLE_HEADER}\n${componentTable}\n\n${AURO_CONTEXT_FOOTER}`;
}

/**
 * Fully static context document using the hand-written component table. Used as
 * the offline fallback when live manifests can't be fetched.
 */
export const AURO_CONTEXT = buildAuroContext(STATIC_COMPONENT_TABLE);
