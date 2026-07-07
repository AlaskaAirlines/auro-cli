export const AURO_CONTEXT = `# Auro Design System — AI Assistant Context
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

| Element Tag | Package | Description |
|---|---|---|
| \`<auro-accordion>\` | \`@aurodesignsystem/auro-accordion\` | Expandable content sections |
| \`<auro-alert>\` | \`@aurodesignsystem/auro-alert\` | Inline status messages: error, warning, success, information |
| \`<auro-avatar>\` | \`@aurodesignsystem/auro-avatar\` | User or entity avatar |
| \`<auro-background>\` | \`@aurodesignsystem/auro-background\` | Themed background wrapper |
| \`<auro-backtotop>\` | \`@aurodesignsystem/auro-backtotop\` | Scroll-to-top button |
| \`<auro-badge>\` | \`@aurodesignsystem/auro-badge\` | Status or count badge |
| \`<auro-banner>\` | \`@aurodesignsystem/auro-banner\` | Full-width promotional banner |
| \`<auro-button>\` | \`@aurodesignsystem/auro-button\` | Interactive button; supports \`loading\`, \`disabled\`, \`shape\` |
| \`<auro-card>\` | \`@aurodesignsystem/auro-card\` | Content card container |
| \`<auro-carousel>\` | \`@aurodesignsystem/auro-carousel\` | Horizontally scrollable carousel |
| \`<auro-datetime>\` | \`@aurodesignsystem/auro-datetime\` | Localized date and time formatting |
| \`<auro-dialog>\` | \`@aurodesignsystem/auro-dialog\` | Modal dialog; slots: header, content, footer |
| \`<auro-drawer>\` | \`@aurodesignsystem/auro-drawer\` | Slide-in panel; slots: header, content, footer |
| \`<auro-flight>\` | \`@aurodesignsystem/auro-flight\` | Flight segment display (origin, destination, stops) |
| \`<auro-flightline>\` | \`@aurodesignsystem/auro-flightline\` | Visual flight path/stop indicator |
| \`<auro-input>\` | \`@aurodesignsystem/auro-formkit\` | Text input field |
| \`<auro-select>\` | \`@aurodesignsystem/auro-formkit\` | Select/dropdown |
| \`<auro-datepicker>\` | \`@aurodesignsystem/auro-formkit\` | Date picker input |
| \`<auro-combobox>\` | \`@aurodesignsystem/auro-formkit\` | Combobox with search |
| \`<auro-checkbox>\` | \`@aurodesignsystem/auro-formkit\` | Checkbox input |
| \`<auro-radio>\` | \`@aurodesignsystem/auro-formkit\` | Radio button input |
| \`<auro-header>\` | \`@aurodesignsystem/auro-header\` | Page/section heading |
| \`<auro-hyperlink>\` | \`@aurodesignsystem/auro-hyperlink\` | Accessible anchor link |
| \`<auro-icon>\` | \`@aurodesignsystem/auro-icon\` | Alaska Airlines icon: \`category\` + \`name\` attributes |
| \`<auro-loader>\` | \`@aurodesignsystem/auro-loader\` | Loading spinner |
| \`<auro-lockup>\` | \`@aurodesignsystem/auro-lockup\` | Image + text layout lockup |
| \`<auro-nav>\` | \`@aurodesignsystem/auro-nav\` | Secondary navigation aid (relation to higher-level pages) |
| \`<auro-pane>\` | \`@aurodesignsystem/auro-pane\` | Selectable shoulder dates with associated prices |
| \`<auro-popover>\` | \`@aurodesignsystem/auro-popover\` | Tooltip-style popover |
| \`<auro-sidenav>\` | \`@aurodesignsystem/auro-sidenav\` | Vertical side navigation |
| \`<auro-skeleton>\` | \`@aurodesignsystem/auro-skeleton\` | Loading placeholder skeleton |
| \`<auro-slideshow>\` | \`@aurodesignsystem/auro-slideshow\` | Image/content slideshow |
| \`<auro-table>\` | \`@aurodesignsystem/auro-table\` | Accessible data table |
| \`<auro-tabs>\` | \`@aurodesignsystem/auro-tabs\` | Tabbed content panels |
| \`<auro-tail>\` | \`@aurodesignsystem/auro-tail\` | Alaska, Hawaiian, and partner airline tail graphics |
| \`<auro-toast>\` | \`@aurodesignsystem/auro-toast\` | Transient notification toast |

## Common Patterns

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
