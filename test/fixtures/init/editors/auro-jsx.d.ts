
import type { AuroButton } from "@aurodesignsystem/auro-button";
import type { AuroInput } from "@aurodesignsystem/auro-formkit/auro-input";

/**
 * This type can be used to create scoped tags for your components.
 *
 * Usage:
 *
 * ```ts
 * import type { ScopedElements } from "path/to/library/jsx-integration";
 *
 * declare module "my-library" {
 *   namespace JSX {
 *     interface IntrinsicElements
 *       extends ScopedElements<'test-', ''> {}
 *   }
 * }
 * ```
 *
 * @deprecated Runtime scoped elements result in duplicate types and can confusing for developers. It is recommended to use the `prefix` and `suffix` options to generate new types instead.
 */
export type ScopedElements<
  Prefix extends string = "",
  Suffix extends string = ""
> = {
  [Key in keyof CustomElements as `${Prefix}${Key}${Suffix}`]: CustomElements[Key];
};



type BaseProps<T extends HTMLElement> = {

  /** Content added between the opening and closing tags of the element */
  children?: any;
  /** Used for declaratively styling one or more elements using CSS (Cascading Stylesheets) */
  class?: string;
  /** Used for declaratively styling one or more elements using CSS (Cascading Stylesheets) */
  className?: string;
  /** Takes an object where the key is the class name(s) and the value is a boolean expression. When true, the class is applied, and when false, it is removed. */
  classList?: Record<string, boolean | undefined>;
  /** Specifies the text direction of the element. */
  dir?: "ltr" | "rtl";
  /** Contains a space-separated list of the part names of the element that should be exposed on the host element. */
  exportparts?: string;
  /** For <label> and <output>, lets you associate the label with some control. */
  htmlFor?: string;
  /** Specifies whether the element should be hidden. */
  hidden?: boolean | string;
  /** A unique identifier for the element. */
  id?: string;
  /** Keys tell React which array item each component corresponds to */
  key?: string | number;
  /** Specifies the language of the element. */
  lang?: string;
  /** Defines the element's semantic role for accessibility APIs. */
  role?: string;
  /** Contains a space-separated list of the part names of the element. Part names allows CSS to select and style specific elements in a shadow tree via the ::part pseudo-element. */
  part?: string;
  /** Use the ref attribute with a variable to assign a DOM element to the variable once the element is rendered. */
  ref?: T | ((e: T) => void);
  /** Adds a reference for a custom element slot */
  slot?: string;
  /** Prop for setting inline styles */
  style?: Record<string, string | number>;
  /** Overrides the default Tab button behavior. Avoid using values other than -1 and 0. */
  tabIndex?: number;
  /** Specifies the tooltip text for the element. */
  title?: string;
  /** Passing 'no' excludes the element content from being translated. */
  translate?: "yes" | "no";
  /** The popover global attribute is used to designate an element as a popover element. */
  popover?: "auto" | "hint" | "manual";
  /** Turns an element element into a popover control button; takes the ID of the popover element to control as its value. */
  popovertarget?: "top" | "bottom" | "left" | "right" | "auto";
  /** Specifies the action to be performed on a popover element being controlled by a control element. */
  popovertargetaction?: "show" | "hide" | "toggle";

} ;

type BaseEvents = {


};




export type AuroButtonProps = {
  /** Defines whether the button will be on lighter or darker backgrounds. */
        "appearance"?: AuroButton['appearance'];
  /** This Boolean attribute lets you specify that the button should have input focus when the page loads, unless overridden by the user. */
        "autofocus"?: AuroButton['autofocus'];
  /**  */
        "buttonHref"?: AuroButton['buttonHref'];
  /**  */
        "buttonRel"?: AuroButton['buttonRel'];
  /**  */
        "buttonTarget"?: AuroButton['buttonTarget'];
  /**  */
          "data-active"?: AuroButton['onActive'];
  /**  */
        "onActive"?: AuroButton['onActive'];
  /**  */
          "data-hover"?: AuroButton['onHover'];
  /**  */
        "onHover"?: AuroButton['onHover'];
  /** If set to true, button will become disabled and not allow for interactions. */
        "disabled"?: AuroButton['disabled'];
  /** Alters the shape of the button to be full width of its parent container. */
        "fluid"?: AuroButton['fluid'];
  /** Defines the layout of an element. */
        "layout"?: AuroButton['layout'];
  /** If set to true button text will be replaced with `auro-loader` and become disabled. */
        "loading"?: AuroButton['loading'];
  /** DEPRECATED - Use `slot="ariaLabel.loading"` instead. */
        "loadingText"?: AuroButton['loadingText'];
  /** DEPRECATED - use `appearance` attribute. */
          "ondark"?: AuroButton['onDark'];
  /** DEPRECATED - use `appearance` attribute. */
        "onDark"?: AuroButton['onDark'];
  /** Defines the shape of an element. */
        "shape"?: AuroButton['shape'];
  /** Defines the size of an element. */
        "size"?: AuroButton['size'];
  /** If true, the button will be static and not respond to user interactions. */
        "static"?: AuroButton['static'];
  /** Populates `tabindex` to define the focusable sequence in keyboard navigation.
Must be used with "." to ensure the host element does not retain a reference to the `tabindex` attribute.
Example: `<auro-button .tabindex="${this.disabled ? '-1' : '0'}"></auro-button>`. */
        "tabindex"?: AuroButton['tabindex'];
  /** Populates `tabindex` to define the focusable sequence in keyboard navigation. */
        "tIndex"?: AuroButton['tIndex'];
  /** Sets title attribute. The information is most often shown as a tooltip text when the mouse moves over the element. */
        "title"?: AuroButton['title'];
  /**  */
        "type"?: AuroButton['type'];
  /** Defines the value associated with the button which is submitted with the form data. */
        "value"?: AuroButton['value'];
  /**  */
        "variant"?: AuroButton['variant'];


}

export type AuroButtonSolidJsProps = {
  /** Defines whether the button will be on lighter or darker backgrounds. */
        "prop:appearance"?: AuroButton['appearance'];
  /** This Boolean attribute lets you specify that the button should have input focus when the page loads, unless overridden by the user. */
        "prop:autofocus"?: AuroButton['autofocus'];
  /**  */
        "prop:buttonHref"?: AuroButton['buttonHref'];
  /**  */
        "prop:buttonRel"?: AuroButton['buttonRel'];
  /**  */
        "prop:buttonTarget"?: AuroButton['buttonTarget'];
  /**  */
        "bool:data-active"?: AuroButton['onActive'];
  /**  */
        "prop:onActive"?: AuroButton['onActive'];
  /**  */
        "bool:data-hover"?: AuroButton['onHover'];
  /**  */
        "prop:onHover"?: AuroButton['onHover'];
  /** If set to true, button will become disabled and not allow for interactions. */
        "prop:disabled"?: AuroButton['disabled'];
  /** Alters the shape of the button to be full width of its parent container. */
        "prop:fluid"?: AuroButton['fluid'];
  /** Defines the layout of an element. */
        "prop:layout"?: AuroButton['layout'];
  /** If set to true button text will be replaced with `auro-loader` and become disabled. */
        "prop:loading"?: AuroButton['loading'];
  /** DEPRECATED - Use `slot="ariaLabel.loading"` instead. */
        "prop:loadingText"?: AuroButton['loadingText'];
  /** DEPRECATED - use `appearance` attribute. */
        "bool:ondark"?: AuroButton['onDark'];
  /** DEPRECATED - use `appearance` attribute. */
        "prop:onDark"?: AuroButton['onDark'];
  /** Defines the shape of an element. */
        "prop:shape"?: AuroButton['shape'];
  /** Defines the size of an element. */
        "prop:size"?: AuroButton['size'];
  /** If true, the button will be static and not respond to user interactions. */
        "prop:static"?: AuroButton['static'];
  /** Populates `tabindex` to define the focusable sequence in keyboard navigation.
Must be used with "." to ensure the host element does not retain a reference to the `tabindex` attribute.
Example: `<auro-button .tabindex="${this.disabled ? '-1' : '0'}"></auro-button>`. */
        "prop:tabindex"?: AuroButton['tabindex'];
  /** Populates `tabindex` to define the focusable sequence in keyboard navigation. */
        "prop:tIndex"?: AuroButton['tIndex'];
  /** Sets title attribute. The information is most often shown as a tooltip text when the mouse moves over the element. */
        "prop:title"?: AuroButton['title'];
  /**  */
        "prop:type"?: AuroButton['type'];
  /** Defines the value associated with the button which is submitted with the form data. */
        "prop:value"?: AuroButton['value'];
  /**  */
        "prop:variant"?: AuroButton['variant'];

  /** Set the innerHTML of the element */
  innerHTML?: string;
  /** Set the textContent of the element */
  textContent?: string | number;
}



export type AuroInputProps = {
  /** The value for the role attribute. */
        "a11yRole"?: AuroInput['a11yRole'];
  /** The value for the aria-controls attribute. */
        "a11yControls"?: AuroInput['a11yControls'];
  /** The value for the aria-expanded attribute. */
        "a11yExpanded"?: AuroInput['a11yExpanded'];
  /** The value for the aria-activedescendant attribute.
Points to the ID of the currently active/highlighted option in a listbox. */
        "a11yActivedescendant"?: AuroInput['a11yActivedescendant'];
  /** If set, the label will remain fixed in the active position.
Only applies to the classic/default layout; the emphasized and snowflake
layouts always render the label inside the field, so this has no effect there. */
        "activeLabel"?: AuroInput['activeLabel'];
  /** Defines whether the component will be on lighter or darker backgrounds. */
        "appearance"?: AuroInput['appearance'];
  /** An enumerated attribute that controls whether and how text input is automatically capitalized as it is entered/edited by the user. [off/none, on/sentences, words, characters]. */
        "autocapitalize"?: AuroInput['autocapitalize'];
  /** An enumerated attribute that defines what the user agent can suggest for autofill. At this time, only `autocomplete="off"` is supported. */
        "autocomplete"?: AuroInput['autocomplete'];
  /** When set to `off`, stops iOS from auto-correcting words when typed into a text box. */
        "autocorrect"?: AuroInput['autocorrect'];
  /** Custom help text message for email type validity. */
        "customValidityTypeEmail"?: AuroInput['customValidityTypeEmail'];
  /** If set, disables the input. */
        "disabled"?: AuroInput['disabled'];
  /** If defined, the display value slot content will only mask the HTML5 input element. The input's label will not be masked. */
        "dvInputOnly"?: AuroInput['dvInputOnly'];
  /** When defined, sets persistent validity to `customError` and sets `setCustomValidity` = attribute value. */
        "error"?: AuroInput['error'];
  /** Contains the help text message for the current validity error. */
        "errorMessage"?: AuroInput['errorMessage'];
  /** Overrides LitElement's generated accessor so we can track whether the
consumer explicitly set `format`. Locale-derived updates use
`_setFormatFromLocale` instead, which skips this flag. */
        "format"?: AuroInput['format'];
  /** If set, the label will be hidden visually but still accessible to assistive technologies. */
        "hideLabelVisually"?: AuroInput['hideLabelVisually'];
  /** If set, will render an icon inside the input to the left of the value. Support is limited to auro-input instances with credit card format. */
        "icon"?: AuroInput['icon'];
  /** The id global attribute defines an identifier (ID) which must be unique in the whole document. */
        "id"?: AuroInput['id'];
  /** Exposes inputmode attribute for input. */
        "inputmode"?: AuroInput['inputmode'];
  /** Defines the language of an element. */
        "lang"?: AuroInput['lang'];
  /** Defines the locale of an element.
Used for locale-specific formatting, such as date formats. */
        "locale"?: AuroInput['locale'];
  /** The maximum value allowed. This only applies for inputs with a type of `number` and ISO format. */
        "max"?: AuroInput['max'];
  /** The maximum number of characters the user can enter into the text input. This must be an integer value `0` or higher.
**Note**: This attribute is not intended to be used with a `type` or `format` that already has a defined length, such as credit-cards, dates or phone numbers. */
        "maxLength"?: AuroInput['maxLength'];
  /** The minimum value allowed. This only applies for inputs with a type of `number` and ISO date format. */
        "min"?: AuroInput['min'];
  /** The minimum number of characters the user can enter into the text input. This must be a non-negative integer value smaller than or equal to the value specified by `maxlength`. */
        "minLength"?: AuroInput['minLength'];
  /** Populates the `name` attribute on the input. */
        "name"?: AuroInput['name'];
  /** Sets styles for nested operation - removes borders, hides help + error text, and
hides accents. */
        "nested"?: AuroInput['nested'];
  /** If set, disables auto-validation on blur. */
        "noValidate"?: AuroInput['noValidate'];
  /** DEPRECATED - use `appearance="inverse"` instead. */
        "onDark"?: AuroInput['onDark'];
  /** Specifies a regular expression the form control's value should match. */
        "pattern"?: AuroInput['pattern'];
  /** Define custom placeholder text. */
        "placeholder"?: AuroInput['placeholder'];
  /** Makes the input read-only, but can be set programmatically. */
        "readonly"?: AuroInput['readonly'];
  /** Populates the `required` attribute on the input. Used for client-side validation. */
        "required"?: AuroInput['required'];
  /** Sets a custom help text message to display for all validityStates. */
        "setCustomValidity"?: AuroInput['setCustomValidity'];
  /** Custom help text message to display when validity = `badInput`. */
        "setCustomValidityBadInput"?: AuroInput['setCustomValidityBadInput'];
  /** Custom help text message to display when validity = `customError`. */
        "setCustomValidityCustomError"?: AuroInput['setCustomValidityCustomError'];
  /** Custom help text message to display for the declared element `type` and type validity fails. */
        "setCustomValidityForType"?: AuroInput['setCustomValidityForType'];
  /** Custom help text message to display when validity = `patternMismatch`. */
        "setCustomValidityPatternMismatch"?: AuroInput['setCustomValidityPatternMismatch'];
  /** Custom help text message to display when validity = `rangeOverflow`. */
        "setCustomValidityRangeOverflow"?: AuroInput['setCustomValidityRangeOverflow'];
  /** Custom help text message to display when validity = `rangeUnderflow`. */
        "setCustomValidityRangeUnderflow"?: AuroInput['setCustomValidityRangeUnderflow'];
  /** Custom help text message to display when validity = `tooLong`. */
        "setCustomValidityTooLong"?: AuroInput['setCustomValidityTooLong'];
  /** Custom help text message to display when validity = `tooShort`. */
        "setCustomValidityTooShort"?: AuroInput['setCustomValidityTooShort'];
  /** Custom help text message to display when validity = `valueMissing`. */
        "setCustomValidityValueMissing"?: AuroInput['setCustomValidityValueMissing'];
  /**  */
        "showPassword"?: AuroInput['showPassword'];
  /** Simple makes the input render without a border. */
        "simple"?: AuroInput['simple'];
  /** An enumerated attribute defines whether the element may be checked for spelling errors. [true, false]. When set to `false` the attribute `autocorrect` is set to `off` and `autocapitalize` is set to `none`. */
        "spellcheck"?: AuroInput['spellcheck'];
  /** Populates the `type` attribute on the input. */
        "type"?: AuroInput['type'];
  /** Sets validation mode to re-eval with each input. */
        "validateOnInput"?: AuroInput['validateOnInput'];
  /** Specifies the `validityState` this element is in. */
        "validity"?: AuroInput['validity'];
  /** Populates the `value` attribute on the input. Can also be read to retrieve the current value of the input.
For `date` type inputs using a full date format (year/month/day), the `value` should be ISO (YYYY-MM-DD). Partial date formats use the display format. */
        "value"?: AuroInput['value'];
  /** Defines the language of an element. */
        "layout"?: AuroInput['layout'];
  /**  */
        "shape"?: AuroInput['shape'];
  /**  */
        "size"?: AuroInput['size'];
  /**  */
          "ondark"?: AuroInput['onDark'];
  /** Flag to indicate if the input currently has value. */
        "hasValue"?: AuroInput['hasValue'];
  /**  */
        "_format"?: AuroInput['_format'];
  /** Flag to indicate if the input currently has focus. */
        "hasFocus"?: AuroInput['hasFocus'];

  /**  */
  "onauroInput-validityChange"?: (e: CustomEvent) => void;
  /** Event fires when the value of an `auro-input` has been changed. */
  "oninput"?: (e: Event) => void;
  /** Notifies that the `validity` and `errorMessage` value has changed. */
  "onauroFormElement-validated"?: (e: Event) => void;

}

export type AuroInputSolidJsProps = {
  /** The value for the role attribute. */
        "prop:a11yRole"?: AuroInput['a11yRole'];
  /** The value for the aria-controls attribute. */
        "prop:a11yControls"?: AuroInput['a11yControls'];
  /** The value for the aria-expanded attribute. */
        "prop:a11yExpanded"?: AuroInput['a11yExpanded'];
  /** The value for the aria-activedescendant attribute.
Points to the ID of the currently active/highlighted option in a listbox. */
        "prop:a11yActivedescendant"?: AuroInput['a11yActivedescendant'];
  /** If set, the label will remain fixed in the active position.
Only applies to the classic/default layout; the emphasized and snowflake
layouts always render the label inside the field, so this has no effect there. */
        "prop:activeLabel"?: AuroInput['activeLabel'];
  /** Defines whether the component will be on lighter or darker backgrounds. */
        "prop:appearance"?: AuroInput['appearance'];
  /** An enumerated attribute that controls whether and how text input is automatically capitalized as it is entered/edited by the user. [off/none, on/sentences, words, characters]. */
        "prop:autocapitalize"?: AuroInput['autocapitalize'];
  /** An enumerated attribute that defines what the user agent can suggest for autofill. At this time, only `autocomplete="off"` is supported. */
        "prop:autocomplete"?: AuroInput['autocomplete'];
  /** When set to `off`, stops iOS from auto-correcting words when typed into a text box. */
        "prop:autocorrect"?: AuroInput['autocorrect'];
  /** Custom help text message for email type validity. */
        "prop:customValidityTypeEmail"?: AuroInput['customValidityTypeEmail'];
  /** If set, disables the input. */
        "prop:disabled"?: AuroInput['disabled'];
  /** If defined, the display value slot content will only mask the HTML5 input element. The input's label will not be masked. */
        "prop:dvInputOnly"?: AuroInput['dvInputOnly'];
  /** When defined, sets persistent validity to `customError` and sets `setCustomValidity` = attribute value. */
        "prop:error"?: AuroInput['error'];
  /** Contains the help text message for the current validity error. */
        "prop:errorMessage"?: AuroInput['errorMessage'];
  /** Overrides LitElement's generated accessor so we can track whether the
consumer explicitly set `format`. Locale-derived updates use
`_setFormatFromLocale` instead, which skips this flag. */
        "prop:format"?: AuroInput['format'];
  /** If set, the label will be hidden visually but still accessible to assistive technologies. */
        "prop:hideLabelVisually"?: AuroInput['hideLabelVisually'];
  /** If set, will render an icon inside the input to the left of the value. Support is limited to auro-input instances with credit card format. */
        "prop:icon"?: AuroInput['icon'];
  /** The id global attribute defines an identifier (ID) which must be unique in the whole document. */
        "prop:id"?: AuroInput['id'];
  /** Exposes inputmode attribute for input. */
        "prop:inputmode"?: AuroInput['inputmode'];
  /** Defines the language of an element. */
        "prop:lang"?: AuroInput['lang'];
  /** Defines the locale of an element.
Used for locale-specific formatting, such as date formats. */
        "prop:locale"?: AuroInput['locale'];
  /** The maximum value allowed. This only applies for inputs with a type of `number` and ISO format. */
        "prop:max"?: AuroInput['max'];
  /** The maximum number of characters the user can enter into the text input. This must be an integer value `0` or higher.
**Note**: This attribute is not intended to be used with a `type` or `format` that already has a defined length, such as credit-cards, dates or phone numbers. */
        "prop:maxLength"?: AuroInput['maxLength'];
  /** The minimum value allowed. This only applies for inputs with a type of `number` and ISO date format. */
        "prop:min"?: AuroInput['min'];
  /** The minimum number of characters the user can enter into the text input. This must be a non-negative integer value smaller than or equal to the value specified by `maxlength`. */
        "prop:minLength"?: AuroInput['minLength'];
  /** Populates the `name` attribute on the input. */
        "prop:name"?: AuroInput['name'];
  /** Sets styles for nested operation - removes borders, hides help + error text, and
hides accents. */
        "prop:nested"?: AuroInput['nested'];
  /** If set, disables auto-validation on blur. */
        "prop:noValidate"?: AuroInput['noValidate'];
  /** DEPRECATED - use `appearance="inverse"` instead. */
        "prop:onDark"?: AuroInput['onDark'];
  /** Specifies a regular expression the form control's value should match. */
        "prop:pattern"?: AuroInput['pattern'];
  /** Define custom placeholder text. */
        "prop:placeholder"?: AuroInput['placeholder'];
  /** Makes the input read-only, but can be set programmatically. */
        "prop:readonly"?: AuroInput['readonly'];
  /** Populates the `required` attribute on the input. Used for client-side validation. */
        "prop:required"?: AuroInput['required'];
  /** Sets a custom help text message to display for all validityStates. */
        "prop:setCustomValidity"?: AuroInput['setCustomValidity'];
  /** Custom help text message to display when validity = `badInput`. */
        "prop:setCustomValidityBadInput"?: AuroInput['setCustomValidityBadInput'];
  /** Custom help text message to display when validity = `customError`. */
        "prop:setCustomValidityCustomError"?: AuroInput['setCustomValidityCustomError'];
  /** Custom help text message to display for the declared element `type` and type validity fails. */
        "prop:setCustomValidityForType"?: AuroInput['setCustomValidityForType'];
  /** Custom help text message to display when validity = `patternMismatch`. */
        "prop:setCustomValidityPatternMismatch"?: AuroInput['setCustomValidityPatternMismatch'];
  /** Custom help text message to display when validity = `rangeOverflow`. */
        "prop:setCustomValidityRangeOverflow"?: AuroInput['setCustomValidityRangeOverflow'];
  /** Custom help text message to display when validity = `rangeUnderflow`. */
        "prop:setCustomValidityRangeUnderflow"?: AuroInput['setCustomValidityRangeUnderflow'];
  /** Custom help text message to display when validity = `tooLong`. */
        "prop:setCustomValidityTooLong"?: AuroInput['setCustomValidityTooLong'];
  /** Custom help text message to display when validity = `tooShort`. */
        "prop:setCustomValidityTooShort"?: AuroInput['setCustomValidityTooShort'];
  /** Custom help text message to display when validity = `valueMissing`. */
        "prop:setCustomValidityValueMissing"?: AuroInput['setCustomValidityValueMissing'];
  /**  */
        "prop:showPassword"?: AuroInput['showPassword'];
  /** Simple makes the input render without a border. */
        "prop:simple"?: AuroInput['simple'];
  /** An enumerated attribute defines whether the element may be checked for spelling errors. [true, false]. When set to `false` the attribute `autocorrect` is set to `off` and `autocapitalize` is set to `none`. */
        "prop:spellcheck"?: AuroInput['spellcheck'];
  /** Populates the `type` attribute on the input. */
        "prop:type"?: AuroInput['type'];
  /** Sets validation mode to re-eval with each input. */
        "prop:validateOnInput"?: AuroInput['validateOnInput'];
  /** Specifies the `validityState` this element is in. */
        "prop:validity"?: AuroInput['validity'];
  /** Populates the `value` attribute on the input. Can also be read to retrieve the current value of the input.
For `date` type inputs using a full date format (year/month/day), the `value` should be ISO (YYYY-MM-DD). Partial date formats use the display format. */
        "prop:value"?: AuroInput['value'];
  /** Defines the language of an element. */
        "prop:layout"?: AuroInput['layout'];
  /**  */
        "prop:shape"?: AuroInput['shape'];
  /**  */
        "prop:size"?: AuroInput['size'];
  /**  */
        "bool:ondark"?: AuroInput['onDark'];
  /** Flag to indicate if the input currently has value. */
        "prop:hasValue"?: AuroInput['hasValue'];
  /**  */
        "prop:_format"?: AuroInput['_format'];
  /** Flag to indicate if the input currently has focus. */
        "prop:hasFocus"?: AuroInput['hasFocus'];
  /**  */
  "on:auroInput-validityChange"?: (e: CustomEvent) => void;
  /** Event fires when the value of an `auro-input` has been changed. */
  "on:input"?: (e: Event) => void;
  /** Notifies that the `validity` and `errorMessage` value has changed. */
  "on:auroFormElement-validated"?: (e: Event) => void;

  /** Set the innerHTML of the element */
  innerHTML?: string;
  /** Set the textContent of the element */
  textContent?: string | number;
}

  export type CustomElements = {


  /**
     * AuroButton is a custom element that provides a styled, accessible button with support for various states and form association.
 * It is designed to be flexible, supporting loading states, icon slots, and integration with HTML5 forms.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `appearance`: Defines whether the button will be on lighter or darker backgrounds. 
 * - `autofocus`: This Boolean attribute lets you specify that the button should have input focus when the page loads, unless overridden by the user. 
 * - `buttonHref`: undefined 
 * - `buttonRel`: undefined 
 * - `buttonTarget`: undefined 
 * - `data-active`/`onActive`: undefined 
 * - `data-hover`/`onHover`: undefined 
 * - `disabled`: If set to true, button will become disabled and not allow for interactions. 
 * - `fluid`: Alters the shape of the button to be full width of its parent container. 
 * - `layout`: Defines the layout of an element. 
 * - `loading`: If set to true button text will be replaced with `auro-loader` and become disabled. 
 * - `loadingText`: DEPRECATED - Use `slot="ariaLabel.loading"` instead. 
 * - `ondark`/`onDark`: DEPRECATED - use `appearance` attribute. 
 * - `shape`: Defines the shape of an element. 
 * - `size`: Defines the size of an element. 
 * - `static`: If true, the button will be static and not respond to user interactions. 
 * - `tabindex`: Populates `tabindex` to define the focusable sequence in keyboard navigation.
 * Must be used with "." to ensure the host element does not retain a reference to the `tabindex` attribute.
 * Example: `<auro-button .tabindex="${this.disabled ? '-1' : '0'}"></auro-button>`. 
 * - `tIndex`: Populates `tabindex` to define the focusable sequence in keyboard navigation. 
 * - `title`: Sets title attribute. The information is most often shown as a tooltip text when the mouse moves over the element. 
 * - `type`: undefined 
 * - `value`: Defines the value associated with the button which is submitted with the form data. 
 * - `variant`: undefined 
 * 
 * ## Methods
 * 
 * Methods that can be called to access component functionality.
 * 
 * - `register(name?: string = "auro-button") => void`: This will register this element with the browser.
  */
    "myapp-button": Partial<AuroButtonProps & BaseProps<AuroButton> & BaseEvents>;


  /**
     * The `auro-input` element provides users a way to enter data into a text field.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `a11yRole`: The value for the role attribute. 
 * - `a11yControls`: The value for the aria-controls attribute. 
 * - `a11yExpanded`: The value for the aria-expanded attribute. 
 * - `a11yActivedescendant`: The value for the aria-activedescendant attribute.
 * Points to the ID of the currently active/highlighted option in a listbox. 
 * - `activeLabel`: If set, the label will remain fixed in the active position.
 * Only applies to the classic/default layout; the emphasized and snowflake
 * layouts always render the label inside the field, so this has no effect there. 
 * - `appearance`: Defines whether the component will be on lighter or darker backgrounds. 
 * - `autocapitalize`: An enumerated attribute that controls whether and how text input is automatically capitalized as it is entered/edited by the user. [off/none, on/sentences, words, characters]. 
 * - `autocomplete`: An enumerated attribute that defines what the user agent can suggest for autofill. At this time, only `autocomplete="off"` is supported. 
 * - `autocorrect`: When set to `off`, stops iOS from auto-correcting words when typed into a text box. 
 * - `customValidityTypeEmail`: Custom help text message for email type validity. 
 * - `disabled`: If set, disables the input. 
 * - `dvInputOnly`: If defined, the display value slot content will only mask the HTML5 input element. The input's label will not be masked. 
 * - `error`: When defined, sets persistent validity to `customError` and sets `setCustomValidity` = attribute value. 
 * - `errorMessage`: Contains the help text message for the current validity error. 
 * - `format`: Overrides LitElement's generated accessor so we can track whether the
 * consumer explicitly set `format`. Locale-derived updates use
 * `_setFormatFromLocale` instead, which skips this flag. 
 * - `hideLabelVisually`: If set, the label will be hidden visually but still accessible to assistive technologies. 
 * - `icon`: If set, will render an icon inside the input to the left of the value. Support is limited to auro-input instances with credit card format. 
 * - `id`: The id global attribute defines an identifier (ID) which must be unique in the whole document. 
 * - `inputmode`: Exposes inputmode attribute for input. 
 * - `lang`: Defines the language of an element. 
 * - `locale`: Defines the locale of an element.
 * Used for locale-specific formatting, such as date formats. 
 * - `max`: The maximum value allowed. This only applies for inputs with a type of `number` and ISO format. 
 * - `maxLength`: The maximum number of characters the user can enter into the text input. This must be an integer value `0` or higher.
 * **Note**: This attribute is not intended to be used with a `type` or `format` that already has a defined length, such as credit-cards, dates or phone numbers. 
 * - `min`: The minimum value allowed. This only applies for inputs with a type of `number` and ISO date format. 
 * - `minLength`: The minimum number of characters the user can enter into the text input. This must be a non-negative integer value smaller than or equal to the value specified by `maxlength`. 
 * - `name`: Populates the `name` attribute on the input. 
 * - `nested`: Sets styles for nested operation - removes borders, hides help + error text, and
 * hides accents. 
 * - `noValidate`: If set, disables auto-validation on blur. 
 * - `onDark`: DEPRECATED - use `appearance="inverse"` instead. 
 * - `pattern`: Specifies a regular expression the form control's value should match. 
 * - `placeholder`: Define custom placeholder text. 
 * - `readonly`: Makes the input read-only, but can be set programmatically. 
 * - `required`: Populates the `required` attribute on the input. Used for client-side validation. 
 * - `setCustomValidity`: Sets a custom help text message to display for all validityStates. 
 * - `setCustomValidityBadInput`: Custom help text message to display when validity = `badInput`. 
 * - `setCustomValidityCustomError`: Custom help text message to display when validity = `customError`. 
 * - `setCustomValidityForType`: Custom help text message to display for the declared element `type` and type validity fails. 
 * - `setCustomValidityPatternMismatch`: Custom help text message to display when validity = `patternMismatch`. 
 * - `setCustomValidityRangeOverflow`: Custom help text message to display when validity = `rangeOverflow`. 
 * - `setCustomValidityRangeUnderflow`: Custom help text message to display when validity = `rangeUnderflow`. 
 * - `setCustomValidityTooLong`: Custom help text message to display when validity = `tooLong`. 
 * - `setCustomValidityTooShort`: Custom help text message to display when validity = `tooShort`. 
 * - `setCustomValidityValueMissing`: Custom help text message to display when validity = `valueMissing`. 
 * - `showPassword`: undefined 
 * - `simple`: Simple makes the input render without a border. 
 * - `spellcheck`: An enumerated attribute defines whether the element may be checked for spelling errors. [true, false]. When set to `false` the attribute `autocorrect` is set to `off` and `autocapitalize` is set to `none`. 
 * - `type`: Populates the `type` attribute on the input. 
 * - `validateOnInput`: Sets validation mode to re-eval with each input. 
 * - `validity`: Specifies the `validityState` this element is in. 
 * - `value`: Populates the `value` attribute on the input. Can also be read to retrieve the current value of the input.
 * For `date` type inputs using a full date format (year/month/day), the `value` should be ISO (YYYY-MM-DD). Partial date formats use the display format. 
 * - `layout`: Defines the language of an element. 
 * - `shape`: undefined 
 * - `size`: undefined 
 * - `ondark`/`onDark`: undefined 
 * - `valueObject`: Read-only Date object representation of `value` for full date formats. (property only) (readonly)
 * - `minObject`: Read-only Date object representation of `min` for full date formats. (property only) (readonly)
 * - `maxObject`: Read-only Date object representation of `max` for full date formats. (property only) (readonly)
 * - `hasValue`: Flag to indicate if the input currently has value. (property only)
 * - `_format`: undefined (property only)
 * - `hasFocus`: Flag to indicate if the input currently has focus. (property only)
 * 
 * ## Events
 * 
 * Events that will be emitted by the component.
 * 
 * - `auroInput-validityChange`: undefined
 * - `input`: Event fires when the value of an `auro-input` has been changed.
 * - `auroFormElement-validated`: Notifies that the `validity` and `errorMessage` value has changed.
 * 
 * ## Slots
 * 
 * Areas where markup can be added to the component.
 * 
 * - `ariaLabel.clear`: Sets aria-label on clear button for screen reader to read
 * - `ariaLabel.password.show`: Sets aria-label on password button to toggle on showing password
 * - `ariaLabel.password.hide`: Sets aria-label on password button to toggle off showing password
 * - `helpText`: Sets the help text displayed below the input.
 * - `label`: Sets the label text for the input.
 * - `optionalLabel`: Allows overriding the optional display text "(optional)", which appears next to the label.
 * - `displayValue`: Allows custom HTML content to display in place of the value when the input is not focused.
 * 
 * ## Methods
 * 
 * Methods that can be called to access component functionality.
 * 
 * - `register(name?: string = "auro-input") => void`: This will register this element with the browser.
 * - `focus() => void`: Function to set element focus.
 * - `validate(force?: boolean = false) => void`: Validates value.
 * - `reset() => void`: Resets component to initial state, including resetting the touched state and validity.
 * - `clear() => void`: Clears the input value.
 * - `resetShapeClasses() => void`: undefined
 * - `resetLayoutClasses() => void`: undefined
 * - `updateComponentArchitecture() => void`: undefined
 * 
 * ## CSS Parts
 * 
 * Custom selectors for styling elements within the component.
 * 
 * - `wrapper`: Use for customizing the style of the root element
 * - `label`: Use for customizing the style of the label element
 * - `helpText`: Use for customizing the style of the helpText element
 * - `input`: Use for customizing the style of the input element
 * - `accentIcon`: Use for customizing the style of the accentIcon element (e.g. credit card icon, calendar icon)
 * - `iconContainer`: Use for customizing the style of the iconContainer (e.g. X icon for clearing input value)
 * - `accent-left`: Use for customizing the style of the left accent element (e.g. padding, margin)
 * - `accent-right`: Use for customizing the style of the right accent element (e.g. padding, margin)
 * - `displayValue`: Use for customizing the style of the displayValue element
 * - `inputHelpText`: Use for customizing the style of the input help text wrapper
  */
    "legacy-input": Partial<AuroInputProps & BaseProps<AuroInput> & BaseEvents>;
  }

  export type CustomElementsSolidJs = {


  /**
     * AuroButton is a custom element that provides a styled, accessible button with support for various states and form association.
 * It is designed to be flexible, supporting loading states, icon slots, and integration with HTML5 forms.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `appearance`: Defines whether the button will be on lighter or darker backgrounds. 
 * - `autofocus`: This Boolean attribute lets you specify that the button should have input focus when the page loads, unless overridden by the user. 
 * - `buttonHref`: undefined 
 * - `buttonRel`: undefined 
 * - `buttonTarget`: undefined 
 * - `data-active`/`onActive`: undefined 
 * - `data-hover`/`onHover`: undefined 
 * - `disabled`: If set to true, button will become disabled and not allow for interactions. 
 * - `fluid`: Alters the shape of the button to be full width of its parent container. 
 * - `layout`: Defines the layout of an element. 
 * - `loading`: If set to true button text will be replaced with `auro-loader` and become disabled. 
 * - `loadingText`: DEPRECATED - Use `slot="ariaLabel.loading"` instead. 
 * - `ondark`/`onDark`: DEPRECATED - use `appearance` attribute. 
 * - `shape`: Defines the shape of an element. 
 * - `size`: Defines the size of an element. 
 * - `static`: If true, the button will be static and not respond to user interactions. 
 * - `tabindex`: Populates `tabindex` to define the focusable sequence in keyboard navigation.
 * Must be used with "." to ensure the host element does not retain a reference to the `tabindex` attribute.
 * Example: `<auro-button .tabindex="${this.disabled ? '-1' : '0'}"></auro-button>`. 
 * - `tIndex`: Populates `tabindex` to define the focusable sequence in keyboard navigation. 
 * - `title`: Sets title attribute. The information is most often shown as a tooltip text when the mouse moves over the element. 
 * - `type`: undefined 
 * - `value`: Defines the value associated with the button which is submitted with the form data. 
 * - `variant`: undefined 
 * 
 * ## Methods
 * 
 * Methods that can be called to access component functionality.
 * 
 * - `register(name?: string = "auro-button") => void`: This will register this element with the browser.
  */
    "myapp-button": Partial<AuroButtonProps & AuroButtonSolidJsProps & BaseProps<AuroButton> & BaseEvents>;


  /**
     * The `auro-input` element provides users a way to enter data into a text field.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `a11yRole`: The value for the role attribute. 
 * - `a11yControls`: The value for the aria-controls attribute. 
 * - `a11yExpanded`: The value for the aria-expanded attribute. 
 * - `a11yActivedescendant`: The value for the aria-activedescendant attribute.
 * Points to the ID of the currently active/highlighted option in a listbox. 
 * - `activeLabel`: If set, the label will remain fixed in the active position.
 * Only applies to the classic/default layout; the emphasized and snowflake
 * layouts always render the label inside the field, so this has no effect there. 
 * - `appearance`: Defines whether the component will be on lighter or darker backgrounds. 
 * - `autocapitalize`: An enumerated attribute that controls whether and how text input is automatically capitalized as it is entered/edited by the user. [off/none, on/sentences, words, characters]. 
 * - `autocomplete`: An enumerated attribute that defines what the user agent can suggest for autofill. At this time, only `autocomplete="off"` is supported. 
 * - `autocorrect`: When set to `off`, stops iOS from auto-correcting words when typed into a text box. 
 * - `customValidityTypeEmail`: Custom help text message for email type validity. 
 * - `disabled`: If set, disables the input. 
 * - `dvInputOnly`: If defined, the display value slot content will only mask the HTML5 input element. The input's label will not be masked. 
 * - `error`: When defined, sets persistent validity to `customError` and sets `setCustomValidity` = attribute value. 
 * - `errorMessage`: Contains the help text message for the current validity error. 
 * - `format`: Overrides LitElement's generated accessor so we can track whether the
 * consumer explicitly set `format`. Locale-derived updates use
 * `_setFormatFromLocale` instead, which skips this flag. 
 * - `hideLabelVisually`: If set, the label will be hidden visually but still accessible to assistive technologies. 
 * - `icon`: If set, will render an icon inside the input to the left of the value. Support is limited to auro-input instances with credit card format. 
 * - `id`: The id global attribute defines an identifier (ID) which must be unique in the whole document. 
 * - `inputmode`: Exposes inputmode attribute for input. 
 * - `lang`: Defines the language of an element. 
 * - `locale`: Defines the locale of an element.
 * Used for locale-specific formatting, such as date formats. 
 * - `max`: The maximum value allowed. This only applies for inputs with a type of `number` and ISO format. 
 * - `maxLength`: The maximum number of characters the user can enter into the text input. This must be an integer value `0` or higher.
 * **Note**: This attribute is not intended to be used with a `type` or `format` that already has a defined length, such as credit-cards, dates or phone numbers. 
 * - `min`: The minimum value allowed. This only applies for inputs with a type of `number` and ISO date format. 
 * - `minLength`: The minimum number of characters the user can enter into the text input. This must be a non-negative integer value smaller than or equal to the value specified by `maxlength`. 
 * - `name`: Populates the `name` attribute on the input. 
 * - `nested`: Sets styles for nested operation - removes borders, hides help + error text, and
 * hides accents. 
 * - `noValidate`: If set, disables auto-validation on blur. 
 * - `onDark`: DEPRECATED - use `appearance="inverse"` instead. 
 * - `pattern`: Specifies a regular expression the form control's value should match. 
 * - `placeholder`: Define custom placeholder text. 
 * - `readonly`: Makes the input read-only, but can be set programmatically. 
 * - `required`: Populates the `required` attribute on the input. Used for client-side validation. 
 * - `setCustomValidity`: Sets a custom help text message to display for all validityStates. 
 * - `setCustomValidityBadInput`: Custom help text message to display when validity = `badInput`. 
 * - `setCustomValidityCustomError`: Custom help text message to display when validity = `customError`. 
 * - `setCustomValidityForType`: Custom help text message to display for the declared element `type` and type validity fails. 
 * - `setCustomValidityPatternMismatch`: Custom help text message to display when validity = `patternMismatch`. 
 * - `setCustomValidityRangeOverflow`: Custom help text message to display when validity = `rangeOverflow`. 
 * - `setCustomValidityRangeUnderflow`: Custom help text message to display when validity = `rangeUnderflow`. 
 * - `setCustomValidityTooLong`: Custom help text message to display when validity = `tooLong`. 
 * - `setCustomValidityTooShort`: Custom help text message to display when validity = `tooShort`. 
 * - `setCustomValidityValueMissing`: Custom help text message to display when validity = `valueMissing`. 
 * - `showPassword`: undefined 
 * - `simple`: Simple makes the input render without a border. 
 * - `spellcheck`: An enumerated attribute defines whether the element may be checked for spelling errors. [true, false]. When set to `false` the attribute `autocorrect` is set to `off` and `autocapitalize` is set to `none`. 
 * - `type`: Populates the `type` attribute on the input. 
 * - `validateOnInput`: Sets validation mode to re-eval with each input. 
 * - `validity`: Specifies the `validityState` this element is in. 
 * - `value`: Populates the `value` attribute on the input. Can also be read to retrieve the current value of the input.
 * For `date` type inputs using a full date format (year/month/day), the `value` should be ISO (YYYY-MM-DD). Partial date formats use the display format. 
 * - `layout`: Defines the language of an element. 
 * - `shape`: undefined 
 * - `size`: undefined 
 * - `ondark`/`onDark`: undefined 
 * - `valueObject`: Read-only Date object representation of `value` for full date formats. (property only) (readonly)
 * - `minObject`: Read-only Date object representation of `min` for full date formats. (property only) (readonly)
 * - `maxObject`: Read-only Date object representation of `max` for full date formats. (property only) (readonly)
 * - `hasValue`: Flag to indicate if the input currently has value. (property only)
 * - `_format`: undefined (property only)
 * - `hasFocus`: Flag to indicate if the input currently has focus. (property only)
 * 
 * ## Events
 * 
 * Events that will be emitted by the component.
 * 
 * - `auroInput-validityChange`: undefined
 * - `input`: Event fires when the value of an `auro-input` has been changed.
 * - `auroFormElement-validated`: Notifies that the `validity` and `errorMessage` value has changed.
 * 
 * ## Slots
 * 
 * Areas where markup can be added to the component.
 * 
 * - `ariaLabel.clear`: Sets aria-label on clear button for screen reader to read
 * - `ariaLabel.password.show`: Sets aria-label on password button to toggle on showing password
 * - `ariaLabel.password.hide`: Sets aria-label on password button to toggle off showing password
 * - `helpText`: Sets the help text displayed below the input.
 * - `label`: Sets the label text for the input.
 * - `optionalLabel`: Allows overriding the optional display text "(optional)", which appears next to the label.
 * - `displayValue`: Allows custom HTML content to display in place of the value when the input is not focused.
 * 
 * ## Methods
 * 
 * Methods that can be called to access component functionality.
 * 
 * - `register(name?: string = "auro-input") => void`: This will register this element with the browser.
 * - `focus() => void`: Function to set element focus.
 * - `validate(force?: boolean = false) => void`: Validates value.
 * - `reset() => void`: Resets component to initial state, including resetting the touched state and validity.
 * - `clear() => void`: Clears the input value.
 * - `resetShapeClasses() => void`: undefined
 * - `resetLayoutClasses() => void`: undefined
 * - `updateComponentArchitecture() => void`: undefined
 * 
 * ## CSS Parts
 * 
 * Custom selectors for styling elements within the component.
 * 
 * - `wrapper`: Use for customizing the style of the root element
 * - `label`: Use for customizing the style of the label element
 * - `helpText`: Use for customizing the style of the helpText element
 * - `input`: Use for customizing the style of the input element
 * - `accentIcon`: Use for customizing the style of the accentIcon element (e.g. credit card icon, calendar icon)
 * - `iconContainer`: Use for customizing the style of the iconContainer (e.g. X icon for clearing input value)
 * - `accent-left`: Use for customizing the style of the left accent element (e.g. padding, margin)
 * - `accent-right`: Use for customizing the style of the right accent element (e.g. padding, margin)
 * - `displayValue`: Use for customizing the style of the displayValue element
 * - `inputHelpText`: Use for customizing the style of the input help text wrapper
  */
    "legacy-input": Partial<AuroInputProps & AuroInputSolidJsProps & BaseProps<AuroInput> & BaseEvents>;
  }

export type CustomCssProperties = {

}


declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module '@builder.io/qwik' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module '@stencil/core' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module 'hono/jsx' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module 'react-native' {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements extends CustomElementsSolidJs {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends CustomElements {}
  }
  export interface CSSProperties extends CustomCssProperties {}
}
