<!--
The demo.md file is a compiled document. No edits should be made directly to this file.
README.md is created by running `npm run build:docs`.
This file is generated based on a template fetched from `./docs/partials/demo.md`
-->

# {{ capitalize name }}

<!-- AURO-GENERATED-CONTENT:START (FILE:src=../docs/partials/description.md) -->
<!-- AURO-GENERATED-CONTENT:END -->

## {{ auroDashCase name }} use cases

<!-- AURO-GENERATED-CONTENT:START (FILE:src=../docs/partials/useCases.md) -->
<!-- AURO-GENERATED-CONTENT:END -->

## Example(s)

### Basic example

<div class="exampleWrapper">
  <!-- AURO-GENERATED-CONTENT:START (FILE:src=../apiExamples/basic.html) -->
  <!-- AURO-GENERATED-CONTENT:END -->
</div>

<auro-accordion lowProfile justifyRight>
  <span slot="trigger">See code</span>

<!-- AURO-GENERATED-CONTENT:START (CODE:src=../apiExamples/basic.html) -->
<!-- AURO-GENERATED-CONTENT:END -->
</auro-accordion>

## Custom tab content

Auro tab also supports rich content inside a tab. Instead of passing simple text, use html markup as needed to fit
your design spec. The wrapper `auro-tabgroup` also exposes two css parts for custom sliders (active indicator) -
`slider` and the parent `slider-positioner`.

Note: `slider` css is not overwritten by the JavaScript logic, while `slider-positioner` **width** and **left** properties
are used internally to position the slider and will be automatically overwritten.

<div class="exampleWrapper">
  <!-- AURO-GENERATED-CONTENT:START (FILE:src=../apiExamples/custom-content.html) -->
  <!-- AURO-GENERATED-CONTENT:END -->
</div>

<auro-accordion lowProfile justifyRight>
  <span slot="trigger">See code</span>

<!-- AURO-GENERATED-CONTENT:START (CODE:src=../apiExamples/custom-content.html) -->
<!-- AURO-GENERATED-CONTENT:END -->

</auro-accordion>

CSS used in the example above:

<!-- AURO-GENERATED-CONTENT:START (CODE:src=../apiExamples/custom-content.css) -->
<!-- AURO-GENERATED-CONTENT:END -->

## Generated (looped) tab groups

<div class="exampleWrapper">
  <!-- AURO-GENERATED-CONTENT:START (FILE:src=../apiExamples/example-tab-group.html) -->
  <!-- AURO-GENERATED-CONTENT:END -->
</div>

<auro-accordion lowProfile justifyRight>
  <span slot="trigger">See code</span>

<!-- AURO-GENERATED-CONTENT:START (CODE:src=../apiExamples/example-tab-group.html) -->
<!-- AURO-GENERATED-CONTENT:END -->

</auro-accordion>

## Accessibility

### Tab Role

Each of `auro-tabgroup`, `auro-tab`, and `auro-tabpanel` have predefined role as tablist, button, or tabpanel. Except for auro-tab which is an extension of `auro-hyperlink`. If `href` property is defined, then the `auro-tab` role is not set.

Q: Why `auro-tab`'s role assigned as 'button' instead of 'tab' ?

A: Because auro-tab is currently extends the [auro-hyperlink](https://auro.alaskaair.com/components/auro/hyperlink) component,  it is either to be rendered as `<a>` element or return as its given slot. The element needs to be a [focusable element](https://allyjs.io/data-tables/focusable.html), and left & right arrow can be used to navigate through the tab items, for that reason we give it role 'button'.

<div class="exampleWrapper">
  <!-- AURO-GENERATED-CONTENT:START (FILE:src=../apiExamples/role.html) -->
  <!-- AURO-GENERATED-CONTENT:END -->
</div>

<auro-accordion lowProfile justifyRight>
  <span slot="trigger">See code</span>

<!-- AURO-GENERATED-CONTENT:START (CODE:src=../apiExamples/role.html) -->
<!-- AURO-GENERATED-CONTENT:END -->

</auro-accordion>

## Recommended Use and Version Control

There are two important parts of every Auro component. The <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes">class</a> and the custom clement. The class is exported and then used as part of defining the Web Component. When importing this component as described in the <a href="#install">install</a> section, the class is imported and the `{{ auroDashCase }}` custom element is defined automatically.

To protect from versioning conflicts with other instances of the component being loaded, it is recommended to use our `registerComponent(name, type)` method and pass in a unique name.

```js
import '@aurodesignsystem/{{ auroDashCase name }}';
registerComponent('custom-{{ lowercase name }}');
```
