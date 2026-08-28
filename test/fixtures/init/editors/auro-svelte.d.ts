import type { AuroButton } from "@aurodesignsystem/auro-button";
import type { AuroInput, CustomEvent } from "@aurodesignsystem/auro-formkit/auro-input";

type BaseProps = {
  /** Content added between the opening and closing tags of the element */
  children?: JSX.Element;
  /** Used for declaratively styling one or more elements using CSS (Cascading Stylesheets) */
  class?: string;
  /** Takes an object where the key is the class name(s) and the value is a boolean expression. When true, the class is applied, and when false, it is removed. */
  classList?: Record<string, boolean | undefined>;
  /** Specifies the text direction of the element. */
  dir?: "ltr" | "rtl";
  /** Contains a space-separated list of the part names of the element that should be exposed on the host element. */
  exportparts?: string;
  /** Specifies whether the element should be hidden. */
  hidden?: boolean | string;
  /** A unique identifier for the element. */
  id?: string;
  /** Sets the HTML or XML markup contained within the element. */
  innerHTML?: string;
  /** Specifies the language of the element. */
  lang?: string;
  /** Contains a space-separated list of the part names of the element. Part names allows CSS to select and style specific elements in a shadow tree via the ::part pseudo-element. */
  part?: string;
  /** Use the ref attribute with a variable to assign a DOM element to the variable once the element is rendered. */
  ref?: unknown | ((e: unknown) => void);
  /** Adds a reference for a custom element slot */
  slot?: string;
  /** Prop for setting inline styles */
  style?: JSX.CSSProperties;
  /** Overrides the default Tab button behavior. Avoid using values other than -1 and 0. */
  tabIndex?: number;
  /** Sets the text content of the element */
  textContent?: string;
  /** Specifies the tooltip text for the element. */
  title?: string;
  /** Passing 'no' excludes the element content from being translated. */
  translate?: "yes" | "no";
};

type BaseEvents = {};

type AuroButtonProps = {
  /** Defines whether the button will be on lighter or darker backgrounds. */
  appearance?: AuroButton["appearance"];
  /** This Boolean attribute lets you specify that the button should have input focus when the page loads, unless overridden by the user. */
  autofocus?: AuroButton["autofocus"];
  /**  */
  buttonHref?: AuroButton["buttonHref"];
  /**  */
  buttonRel?: AuroButton["buttonRel"];
  /**  */
  buttonTarget?: AuroButton["buttonTarget"];
  /**  */
  "data-active"?: AuroButton["onActive"];
  /**  */
  "data-hover"?: AuroButton["onHover"];
  /** If set to true, button will become disabled and not allow for interactions. */
  disabled?: AuroButton["disabled"];
  /** Alters the shape of the button to be full width of its parent container. */
  fluid?: AuroButton["fluid"];
  /** Defines the layout of an element. */
  layout?: AuroButton["layout"];
  /** If set to true button text will be replaced with `auro-loader` and become disabled. */
  loading?: AuroButton["loading"];
  /** DEPRECATED - Use `slot="ariaLabel.loading"` instead. */
  loadingText?: AuroButton["loadingText"];
  /** DEPRECATED - use `appearance` attribute. */
  ondark?: AuroButton["onDark"];
  /** Defines the shape of an element. */
  shape?: AuroButton["shape"];
  /** Defines the size of an element. */
  size?: AuroButton["size"];
  /** If true, the button will be static and not respond to user interactions. */
  static?: AuroButton["static"];
  /** Populates `tabindex` to define the focusable sequence in keyboard navigation.
Must be used with "." to ensure the host element does not retain a reference to the `tabindex` attribute.
Example: `<auro-button .tabindex="${this.disabled ? '-1' : '0'}"></auro-button>`. */
  tabindex?: AuroButton["tabindex"];
  /** Populates `tabindex` to define the focusable sequence in keyboard navigation. */
  tIndex?: AuroButton["tIndex"];
  /** Sets title attribute. The information is most often shown as a tooltip text when the mouse moves over the element. */
  title?: AuroButton["title"];
  /**  */
  type?: AuroButton["type"];
  /** Defines the value associated with the button which is submitted with the form data. */
  value?: AuroButton["value"];
  /**  */
  variant?: AuroButton["variant"];
};

type AuroInputProps = {
  /** The value for the role attribute. */
  a11yRole?: AuroInput["a11yRole"];
  /** The value for the aria-controls attribute. */
  a11yControls?: AuroInput["a11yControls"];
  /** The value for the aria-expanded attribute. */
  a11yExpanded?: AuroInput["a11yExpanded"];
  /** The value for the aria-activedescendant attribute.
Points to the ID of the currently active/highlighted option in a listbox. */
  a11yActivedescendant?: AuroInput["a11yActivedescendant"];
  /** If set, the label will remain fixed in the active position.
Only applies to the classic/default layout; the emphasized and snowflake
layouts always render the label inside the field, so this has no effect there. */
  activeLabel?: AuroInput["activeLabel"];
  /** Defines whether the component will be on lighter or darker backgrounds. */
  appearance?: AuroInput["appearance"];
  /** An enumerated attribute that controls whether and how text input is automatically capitalized as it is entered/edited by the user. [off/none, on/sentences, words, characters]. */
  autocapitalize?: AuroInput["autocapitalize"];
  /** An enumerated attribute that defines what the user agent can suggest for autofill. At this time, only `autocomplete="off"` is supported. */
  autocomplete?: AuroInput["autocomplete"];
  /** When set to `off`, stops iOS from auto-correcting words when typed into a text box. */
  autocorrect?: AuroInput["autocorrect"];
  /** Custom help text message for email type validity. */
  customValidityTypeEmail?: AuroInput["customValidityTypeEmail"];
  /** If set, disables the input. */
  disabled?: AuroInput["disabled"];
  /** If defined, the display value slot content will only mask the HTML5 input element. The input's label will not be masked. */
  dvInputOnly?: AuroInput["dvInputOnly"];
  /** When defined, sets persistent validity to `customError` and sets `setCustomValidity` = attribute value. */
  error?: AuroInput["error"];
  /** Contains the help text message for the current validity error. */
  errorMessage?: AuroInput["errorMessage"];
  /** Overrides LitElement's generated accessor so we can track whether the
consumer explicitly set `format`. Locale-derived updates use
`_setFormatFromLocale` instead, which skips this flag. */
  format?: AuroInput["format"];
  /** If set, the label will be hidden visually but still accessible to assistive technologies. */
  hideLabelVisually?: AuroInput["hideLabelVisually"];
  /** If set, will render an icon inside the input to the left of the value. Support is limited to auro-input instances with credit card format. */
  icon?: AuroInput["icon"];
  /** The id global attribute defines an identifier (ID) which must be unique in the whole document. */
  id?: AuroInput["id"];
  /** Exposes inputmode attribute for input. */
  inputmode?: AuroInput["inputmode"];
  /** Defines the language of an element. */
  lang?: AuroInput["lang"];
  /** Defines the locale of an element.
Used for locale-specific formatting, such as date formats. */
  locale?: AuroInput["locale"];
  /** The maximum value allowed. This only applies for inputs with a type of `number` and ISO format. */
  max?: AuroInput["max"];
  /** The maximum number of characters the user can enter into the text input. This must be an integer value `0` or higher.
   **Note**: This attribute is not intended to be used with a `type` or `format` that already has a defined length, such as credit-cards, dates or phone numbers. */
  maxLength?: AuroInput["maxLength"];
  /** The minimum value allowed. This only applies for inputs with a type of `number` and ISO date format. */
  min?: AuroInput["min"];
  /** The minimum number of characters the user can enter into the text input. This must be a non-negative integer value smaller than or equal to the value specified by `maxlength`. */
  minLength?: AuroInput["minLength"];
  /** Populates the `name` attribute on the input. */
  name?: AuroInput["name"];
  /** Sets styles for nested operation - removes borders, hides help + error text, and
hides accents. */
  nested?: AuroInput["nested"];
  /** If set, disables auto-validation on blur. */
  noValidate?: AuroInput["noValidate"];
  /** DEPRECATED - use `appearance="inverse"` instead. */
  onDark?: AuroInput["onDark"];
  /** Specifies a regular expression the form control's value should match. */
  pattern?: AuroInput["pattern"];
  /** Define custom placeholder text. */
  placeholder?: AuroInput["placeholder"];
  /** Makes the input read-only, but can be set programmatically. */
  readonly?: AuroInput["readonly"];
  /** Populates the `required` attribute on the input. Used for client-side validation. */
  required?: AuroInput["required"];
  /** Sets a custom help text message to display for all validityStates. */
  setCustomValidity?: AuroInput["setCustomValidity"];
  /** Custom help text message to display when validity = `badInput`. */
  setCustomValidityBadInput?: AuroInput["setCustomValidityBadInput"];
  /** Custom help text message to display when validity = `customError`. */
  setCustomValidityCustomError?: AuroInput["setCustomValidityCustomError"];
  /** Custom help text message to display for the declared element `type` and type validity fails. */
  setCustomValidityForType?: AuroInput["setCustomValidityForType"];
  /** Custom help text message to display when validity = `patternMismatch`. */
  setCustomValidityPatternMismatch?: AuroInput["setCustomValidityPatternMismatch"];
  /** Custom help text message to display when validity = `rangeOverflow`. */
  setCustomValidityRangeOverflow?: AuroInput["setCustomValidityRangeOverflow"];
  /** Custom help text message to display when validity = `rangeUnderflow`. */
  setCustomValidityRangeUnderflow?: AuroInput["setCustomValidityRangeUnderflow"];
  /** Custom help text message to display when validity = `tooLong`. */
  setCustomValidityTooLong?: AuroInput["setCustomValidityTooLong"];
  /** Custom help text message to display when validity = `tooShort`. */
  setCustomValidityTooShort?: AuroInput["setCustomValidityTooShort"];
  /** Custom help text message to display when validity = `valueMissing`. */
  setCustomValidityValueMissing?: AuroInput["setCustomValidityValueMissing"];
  /**  */
  showPassword?: AuroInput["showPassword"];
  /** Simple makes the input render without a border. */
  simple?: AuroInput["simple"];
  /** An enumerated attribute defines whether the element may be checked for spelling errors. [true, false]. When set to `false` the attribute `autocorrect` is set to `off` and `autocapitalize` is set to `none`. */
  spellcheck?: AuroInput["spellcheck"];
  /** Populates the `type` attribute on the input. */
  type?: AuroInput["type"];
  /** Sets validation mode to re-eval with each input. */
  validateOnInput?: AuroInput["validateOnInput"];
  /** Specifies the `validityState` this element is in. */
  validity?: AuroInput["validity"];
  /** Populates the `value` attribute on the input. Can also be read to retrieve the current value of the input.
For `date` type inputs using a full date format (year/month/day), the `value` should be ISO (YYYY-MM-DD). Partial date formats use the display format. */
  value?: AuroInput["value"];
  /** Defines the language of an element. */
  layout?: AuroInput["layout"];
  /**  */
  shape?: AuroInput["shape"];
  /**  */
  size?: AuroInput["size"];
  /**  */
  ondark?: AuroInput["onDark"];
  /** Read-only Date object representation of `value` for full date formats. */
  "bind:valueObject"?: AuroInput["valueObject"];
  /** Read-only Date object representation of `min` for full date formats. */
  "bind:minObject"?: AuroInput["minObject"];
  /** Read-only Date object representation of `max` for full date formats. */
  "bind:maxObject"?: AuroInput["maxObject"];
  /** Flag to indicate if the input currently has value. */
  "bind:hasValue"?: AuroInput["hasValue"];
  /**  */
  "bind:_format"?: AuroInput["_format"];
  /** Flag to indicate if the input currently has focus. */
  "bind:hasFocus"?: AuroInput["hasFocus"];
  /**  */
  "on:auroInput-validityChange"?: (e: CustomEvent<CustomEvent>) => void;
  /** Event fires when the value of an `auro-input` has been changed. */
  "on:input"?: (e: CustomEvent<never>) => void;
  /** Notifies that the `validity` and `errorMessage` value has changed. */
  "on:auroFormElement-validated"?: (e: CustomEvent<never>) => void;
};

export type CustomElements = {
  /**
   * AuroButton is a custom element that provides a styled, accessible button with support for various states and form association.
   * It is designed to be flexible, supporting loading states, icon slots, and integration with HTML5 forms.
   * ---
   *
   *
   * ### **Methods:**
   *  - **register(name: _string_)** - This will register this element with the browser.
   */
  "myapp-button": Partial<AuroButtonProps & BaseProps & BaseEvents>;

  /**
   * The `auro-input` element provides users a way to enter data into a text field.
   * ---
   *
   *
   * ### **Events:**
   *  - **auroInput-validityChange**
   * - **input** - Event fires when the value of an `auro-input` has been changed.
   * - **auroFormElement-validated** - Notifies that the `validity` and `errorMessage` value has changed.
   *
   * ### **Methods:**
   *  - **register(name: _string_)** - This will register this element with the browser.
   * - **focus(): _void_** - Function to set element focus.
   * - **validate(force: _boolean_)** - Validates value.
   * - **reset(): _void_** - Resets component to initial state, including resetting the touched state and validity.
   * - **clear()** - Clears the input value.
   *
   * ### **Slots:**
   *  - **ariaLabel.clear** - Sets aria-label on clear button for screen reader to read
   * - **ariaLabel.password.show** - Sets aria-label on password button to toggle on showing password
   * - **ariaLabel.password.hide** - Sets aria-label on password button to toggle off showing password
   * - **helpText** - Sets the help text displayed below the input.
   * - **label** - Sets the label text for the input.
   * - **optionalLabel** - Allows overriding the optional display text "(optional)", which appears next to the label.
   * - **displayValue** - Allows custom HTML content to display in place of the value when the input is not focused.
   *
   * ### **CSS Parts:**
   *  - **wrapper** - Use for customizing the style of the root element
   * - **label** - Use for customizing the style of the label element
   * - **helpText** - Use for customizing the style of the helpText element
   * - **input** - Use for customizing the style of the input element
   * - **accentIcon** - Use for customizing the style of the accentIcon element (e.g. credit card icon, calendar icon)
   * - **iconContainer** - Use for customizing the style of the iconContainer (e.g. X icon for clearing input value)
   * - **accent-left** - Use for customizing the style of the left accent element (e.g. padding, margin)
   * - **accent-right** - Use for customizing the style of the right accent element (e.g. padding, margin)
   * - **displayValue** - Use for customizing the style of the displayValue element
   * - **inputHelpText** - Use for customizing the style of the input help text wrapper
   */
  "legacy-input": Partial<AuroInputProps & BaseProps & BaseEvents>;
};

declare namespace svelteHTML {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface IntrinsicElements extends CustomElements {}
}
