
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
  /** Identifies the currently active descendant of a composite widget. */
  "aria-activedescendant"?: string;
  /** Whether assistive technologies present all, or only parts of, changed regions. */
  "aria-atomic"?: boolean | "true" | "false";
  /** Whether inputting text triggers display of one or more predictions. */
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  /** Defines a string value that labels the current element (braille). */
  "aria-braillelabel"?: string;
  /** Defines a human-readable, author-localized abbreviated role description (braille). */
  "aria-brailleroledescription"?: string;
  /** Whether an element is being modified and assistive technologies may wait. */
  "aria-busy"?: boolean | "true" | "false";
  /** The current "checked" state of checkboxes, radio buttons, and other widgets. */
  "aria-checked"?: boolean | "false" | "mixed" | "true";
  /** Defines the total number of columns in a table, grid, or treegrid. */
  "aria-colcount"?: number;
  /** Defines an element's column index or position within a table, grid, or treegrid. */
  "aria-colindex"?: number;
  /** A human-readable text alternative of aria-colindex. */
  "aria-colindextext"?: string;
  /** Defines the number of columns spanned by a cell or gridcell. */
  "aria-colspan"?: number;
  /** Identifies the element(s) whose contents or presence are controlled by this element. */
  "aria-controls"?: string;
  /** The element that represents the current item within a container or set. */
  "aria-current"?: boolean | "false" | "true" | "page" | "step" | "location" | "date" | "time";
  /** Identifies the element(s) that describes the object. */
  "aria-describedby"?: string;
  /** Defines a string value that describes or annotates the current element. */
  "aria-description"?: string;
  /** Identifies the element that provides a detailed, extended description. */
  "aria-details"?: string;
  /** Whether the element is perceivable but disabled, so not editable or operable. */
  "aria-disabled"?: boolean | "true" | "false";
  /** What functions can be performed when a dragged object is released. */
  "aria-dropeffect"?: "none" | "copy" | "execute" | "link" | "move" | "popup";
  /** Identifies the element that provides an error message for the object. */
  "aria-errormessage"?: string;
  /** Whether the element, or another grouping element it controls, is expanded. */
  "aria-expanded"?: boolean | "true" | "false";
  /** The next element(s) in an alternate reading order of content. */
  "aria-flowto"?: string;
  /** Whether an element is in a "grabbed" state in a drag-and-drop operation. */
  "aria-grabbed"?: boolean | "true" | "false";
  /** Indicates the availability and type of an interactive popup element. */
  "aria-haspopup"?: boolean | "false" | "true" | "menu" | "listbox" | "tree" | "grid" | "dialog";
  /** Whether the element is exposed to an accessibility API. */
  "aria-hidden"?: boolean | "true" | "false";
  /** Whether the entered value does not conform to the expected format. */
  "aria-invalid"?: boolean | "false" | "true" | "grammar" | "spelling";
  /** Keyboard shortcuts an author has implemented to activate or focus an element. */
  "aria-keyshortcuts"?: string;
  /** A string value that labels the current element. */
  "aria-label"?: string;
  /** Identifies the element(s) that labels the current element. */
  "aria-labelledby"?: string;
  /** Defines the hierarchical level of an element within a structure. */
  "aria-level"?: number;
  /** Indicates that an element will be updated, and how live updates are described. */
  "aria-live"?: "off" | "assertive" | "polite";
  /** Whether an element is modal when displayed. */
  "aria-modal"?: boolean | "true" | "false";
  /** Whether a text box accepts multiple lines of input or only a single line. */
  "aria-multiline"?: boolean | "true" | "false";
  /** Whether the user may select more than one item from the current selectable descendants. */
  "aria-multiselectable"?: boolean | "true" | "false";
  /** Whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  "aria-orientation"?: "horizontal" | "vertical";
  /** Identifies an element in order to define a visual, functional, or contextual relationship. */
  "aria-owns"?: string;
  /** A short hint intended to aid the user with data entry when the control has no value. */
  "aria-placeholder"?: string;
  /** The number or position of an item in the current set of listitems or treeitems. */
  "aria-posinset"?: number;
  /** The current "pressed" state of toggle buttons. */
  "aria-pressed"?: boolean | "false" | "mixed" | "true";
  /** Whether the element is not editable but is otherwise operable. */
  "aria-readonly"?: boolean | "true" | "false";
  /** What notifications the user agent triggers when the accessibility tree is modified. */
  "aria-relevant"?: "additions" | "additions removals" | "additions text" | "all" | "removals" | "removals additions" | "removals text" | "text" | "text additions" | "text removals";
  /** Whether user input is required on the element before a form may be submitted. */
  "aria-required"?: boolean | "true" | "false";
  /** A human-readable, author-localized description for the role of an element. */
  "aria-roledescription"?: string;
  /** Defines the total number of rows in a table, grid, or treegrid. */
  "aria-rowcount"?: number;
  /** Defines an element's row index or position within a table, grid, or treegrid. */
  "aria-rowindex"?: number;
  /** A human-readable text alternative of aria-rowindex. */
  "aria-rowindextext"?: string;
  /** Defines the number of rows spanned by a cell or gridcell. */
  "aria-rowspan"?: number;
  /** The current "selected" state of various widgets. */
  "aria-selected"?: boolean | "true" | "false";
  /** Defines the number of items in the current set of listitems or treeitems. */
  "aria-setsize"?: number;
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  "aria-sort"?: "none" | "ascending" | "descending" | "other";
  /** Defines the maximum allowed value for a range widget. */
  "aria-valuemax"?: number;
  /** Defines the minimum allowed value for a range widget. */
  "aria-valuemin"?: number;
  /** Defines the current value for a range widget. */
  "aria-valuenow"?: number;
  /** Defines the human-readable text alternative of aria-valuenow. */
  "aria-valuetext"?: string;
  /** Custom data-* attributes for the element. */
  [key: `data-${string}`]: string | number | boolean | null | undefined;

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

  // Mouse Events

  /** Triggered when the element is clicked by the user by mouse or keyboard. */
  onClick?: (event: MouseEvent) => void;
  /** Fired when the context menu is triggered, often by right-clicking. */
  onContextMenu?: (event: MouseEvent) => void;
  /** Fired when the element is double-clicked. */
  onDoubleClick?: (event: MouseEvent) => void;
  /** Fired repeatedly as the draggable element is being dragged. */
  onDrag?: (event: DragEvent) => void;
  /** Fired when the dragging of a draggable element is finished. */
  onDragEnd?: (event: DragEvent) => void;
  /** Fired when a dragged element or text selection enters a valid drop target. */
  onDragEnter?: (event: DragEvent) => void;
  /** Fired when a dragged element or text selection leaves a valid drop target. */
  onDragExit?: (event: DragEvent) => void;
  /** Fired when a dragged element or text selection leaves a valid drop target. */
  onDragLeave?: (event: DragEvent) => void;
  /** Fired when an element or text selection is being dragged over a valid drop target (every few hundred milliseconds). */
  onDragOver?: (event: DragEvent) => void;
  /** Fired when a draggable element starts being dragged. */
  onDragStart?: (event: DragEvent) => void;
  /** Fired when a dragged element is dropped onto a drop target. */
  onDrop?: (event: DragEvent) => void;
  /** Fired when a mouse button is pressed down on the element. */
  onMouseDown?: (event: MouseEvent) => void;
  /** Fired when the mouse cursor enters the element. */
  onMouseEnter?: (event: MouseEvent) => void;
  /** Triggered when the mouse cursor leaves the element. */
  onMouseLeave?: (event: MouseEvent) => void;
  /** Fired at an element when a pointing device (usually a mouse) is moved while the cursor's hotspot is inside it. */
  onMouseMove?: (event: MouseEvent) => void;
  /** Fired at an Element when a pointing device (usually a mouse) is used to move the cursor so that it is no longer contained within the element or one of its children. */
  onMouseOut?: (event: MouseEvent) => void;
  /** Fired at an Element when a pointing device (such as a mouse or trackpad) is used to move the cursor onto the element or one of its child elements. */
  onMouseOver?: (event: MouseEvent) => void;
  /** Fired when a mouse button is released on the element. */
  onMouseUp?: (event: MouseEvent) => void;

  // Keyboard Events

  /** Fired when a key is pressed down. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Fired when a key is released.. */
  onKeyUp?: (event: KeyboardEvent) => void;
  /** Fired when a key is pressed down. */
  onKeyPressed?: (event: KeyboardEvent) => void;

  // Focus Events

  /** Fired when the element receives focus, often triggered by tab navigation. */
  onFocus?: (event: FocusEvent) => void;
  /** Fired when the element loses focus. */
  onBlur?: (event: FocusEvent) => void;

  // Form Events

  /** Fired when the value of an input element changes, such as with text inputs or select elements. */
  onChange?: (event: Event) => void;
  /** Fires when the value of an <input>, <select>, or <textarea> element has been changed. */
  onInput?: (event: Event) => void;
  /** Fired when a form is submitted, usually on pressing Enter in a text input. */
  onSubmit?: (event: Event) => void;
  /** Fired when a form is reset. */
  onReset?: (event: Event) => void;

  // UI Events

  /** Fired when the content of an element is scrolled. */
  onScroll?: (event: UIEvent) => void;

  // Wheel Events

  /** Fired when the mouse wheel is scrolled while the element is focused. */
  onWheel?: (event: WheelEvent) => void;

  // Animation Events

  /** Fired when a CSS animation starts. */
  onAnimationStart?: (event: AnimationEvent) => void;
  /** Fired when a CSS animation completes. */
  onAnimationEnd?: (event: AnimationEvent) => void;
  /** Fired when a CSS animation completes one iteration. */
  onAnimationIteration?: (event: AnimationEvent) => void;

  // Transition Events

  /** Fired when a CSS transition has completed. */
  onTransitionEnd?: (event: TransitionEvent) => void;

  // Media Events

  /** Fired when an element (usually an image) finishes loading */
  onLoad?: (event: Event) => void;
  /** Fired when an error occurs during the loading of an element, like an image not being found. */
  onError?: (event: Event) => void;

  // Clipboard Events

  /** Fires when the user initiates a copy action through the browser's user interface. */
  onCopy?: (event: ClipboardEvent) => void;
  /** Fired when the user has initiated a "cut" action through the browser's user interface. */
  onCut?: (event: ClipboardEvent) => void;
  /** Fired when the user has initiated a "paste" action through the browser's user interface. */
  onPaste?: (event: ClipboardEvent) => void;


};




export type AuroButtonProps = {
  /** Disables the button. */
          "disabled"?: boolean;
  /** Disables the button. */
        "undefined"?: boolean;
  /** Stretches to full width. */
          "fluid"?: boolean;
  /** Visual style variant. */
        "variant"?: "primary" | "secondary" | "tertiary" | "ghost" | "flat";

  /** Fired on activation. */
  "onclick"?: (e: Event) => void;

}

export type AuroButtonSolidJsProps = {
  /** Disables the button. */
        "bool:disabled"?: boolean;
  /** Disables the button. */
        "prop:undefined"?: boolean;
  /** Stretches to full width. */
        "bool:fluid"?: boolean;
  /** Visual style variant. */
        "prop:variant"?: "primary" | "secondary" | "tertiary" | "ghost" | "flat";
  /** Fired on activation. */
  "on:click"?: (e: Event) => void;

  /** Set the innerHTML of the element */
  innerHTML?: string;
  /** Set the textContent of the element */
  textContent?: string | number;
}



export type AuroInputProps = {
  /** Marks the field as required. */
          "required"?: boolean;
  /** Marks the field as required. */
        "undefined"?: boolean;


}

export type AuroInputSolidJsProps = {
  /** Marks the field as required. */
        "bool:required"?: boolean;
  /** Marks the field as required. */
        "prop:undefined"?: boolean;

  /** Set the innerHTML of the element */
  innerHTML?: string;
  /** Set the textContent of the element */
  textContent?: string | number;
}

  export type CustomElements = {


  /**
     * A clickable button styled per the Auro Design System.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `disabled`/`undefined`: Disables the button. 
 * - `fluid`/`undefined`: Stretches to full width. 
 * - `variant`: Visual style variant. 
 * 
 * ## Events
 * 
 * Events that will be emitted by the component.
 * 
 * - `click`: Fired on activation.
 * 
 * ## Slots
 * 
 * Areas where markup can be added to the component.
 * 
 * - `(default)`: Button label content.
 * 
 * ## CSS Parts
 * 
 * Custom selectors for styling elements within the component.
 * 
 * - `button`: The native button element.
 * - `contentWrapper`: Wraps the slotted label.
 * - `link`: The anchor when rendered as a link.
 * - `loader`: The loading indicator.
 * - `text`: The button label text.
  */
    "myapp-button": Partial<AuroButtonProps & BaseProps<AuroButton> & BaseEvents>;


  /**
     * A text input field with built-in validation.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `required`/`undefined`: Marks the field as required. 
 * 
 * ## Slots
 * 
 * Areas where markup can be added to the component.
 * 
 * - `label`: The field label.
  */
    "legacy-input": Partial<AuroInputProps & BaseProps<AuroInput> & BaseEvents>;
  }

  export type CustomElementsSolidJs = {


  /**
     * A clickable button styled per the Auro Design System.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `disabled`/`undefined`: Disables the button. 
 * - `fluid`/`undefined`: Stretches to full width. 
 * - `variant`: Visual style variant. 
 * 
 * ## Events
 * 
 * Events that will be emitted by the component.
 * 
 * - `click`: Fired on activation.
 * 
 * ## Slots
 * 
 * Areas where markup can be added to the component.
 * 
 * - `(default)`: Button label content.
 * 
 * ## CSS Parts
 * 
 * Custom selectors for styling elements within the component.
 * 
 * - `button`: The native button element.
 * - `contentWrapper`: Wraps the slotted label.
 * - `link`: The anchor when rendered as a link.
 * - `loader`: The loading indicator.
 * - `text`: The button label text.
  */
    "myapp-button": Partial<AuroButtonProps & AuroButtonSolidJsProps & BaseProps<AuroButton> & BaseEvents>;


  /**
     * A text input field with built-in validation.
 * 
 * ## Attributes & Properties
 * 
 * Component attributes and properties that can be applied to the element or by using JavaScript.
 * 
 * - `required`/`undefined`: Marks the field as required. 
 * 
 * ## Slots
 * 
 * Areas where markup can be added to the component.
 * 
 * - `label`: The field label.
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
