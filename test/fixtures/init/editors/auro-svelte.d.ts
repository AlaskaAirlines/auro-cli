type BaseProps = {
  /** Defines the element's semantic role for accessibility APIs. */
  role?: string;
  /** The position of the element in the sequential keyboard navigation order. */
  tabindex?: number;
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

type BaseEvents = {
  // Mouse events
  "on:click"?: (e: MouseEvent) => void;
  "onclick"?: (e: MouseEvent) => void;
  "on:contextmenu"?: (e: MouseEvent) => void;
  "oncontextmenu"?: (e: MouseEvent) => void;
  "on:dblclick"?: (e: MouseEvent) => void;
  "ondblclick"?: (e: MouseEvent) => void;
  "on:mousedown"?: (e: MouseEvent) => void;
  "onmousedown"?: (e: MouseEvent) => void;
  "on:mouseenter"?: (e: MouseEvent) => void;
  "onmouseenter"?: (e: MouseEvent) => void;
  "on:mouseleave"?: (e: MouseEvent) => void;
  "onmouseleave"?: (e: MouseEvent) => void;
  "on:mousemove"?: (e: MouseEvent) => void;
  "onmousemove"?: (e: MouseEvent) => void;
  "on:mouseout"?: (e: MouseEvent) => void;
  "onmouseout"?: (e: MouseEvent) => void;
  "on:mouseover"?: (e: MouseEvent) => void;
  "onmouseover"?: (e: MouseEvent) => void;
  "on:mouseup"?: (e: MouseEvent) => void;
  "onmouseup"?: (e: MouseEvent) => void;
  // Drag events
  "on:drag"?: (e: DragEvent) => void;
  "ondrag"?: (e: DragEvent) => void;
  "on:dragend"?: (e: DragEvent) => void;
  "ondragend"?: (e: DragEvent) => void;
  "on:dragenter"?: (e: DragEvent) => void;
  "ondragenter"?: (e: DragEvent) => void;
  "on:dragexit"?: (e: DragEvent) => void;
  "ondragexit"?: (e: DragEvent) => void;
  "on:dragleave"?: (e: DragEvent) => void;
  "ondragleave"?: (e: DragEvent) => void;
  "on:dragover"?: (e: DragEvent) => void;
  "ondragover"?: (e: DragEvent) => void;
  "on:dragstart"?: (e: DragEvent) => void;
  "ondragstart"?: (e: DragEvent) => void;
  "on:drop"?: (e: DragEvent) => void;
  "ondrop"?: (e: DragEvent) => void;
  // Keyboard events
  "on:keydown"?: (e: KeyboardEvent) => void;
  "onkeydown"?: (e: KeyboardEvent) => void;
  "on:keyup"?: (e: KeyboardEvent) => void;
  "onkeyup"?: (e: KeyboardEvent) => void;
  "on:keypress"?: (e: KeyboardEvent) => void;
  "onkeypress"?: (e: KeyboardEvent) => void;
  // Focus events
  "on:focus"?: (e: FocusEvent) => void;
  "onfocus"?: (e: FocusEvent) => void;
  "on:blur"?: (e: FocusEvent) => void;
  "onblur"?: (e: FocusEvent) => void;
  // Form events
  "on:change"?: (e: Event) => void;
  "onchange"?: (e: Event) => void;
  "on:input"?: (e: Event) => void;
  "oninput"?: (e: Event) => void;
  "on:submit"?: (e: Event) => void;
  "onsubmit"?: (e: Event) => void;
  "on:reset"?: (e: Event) => void;
  "onreset"?: (e: Event) => void;
  // Scroll / wheel events
  "on:scroll"?: (e: UIEvent) => void;
  "onscroll"?: (e: UIEvent) => void;
  "on:wheel"?: (e: WheelEvent) => void;
  "onwheel"?: (e: WheelEvent) => void;
  // Animation / transition events
  "on:animationstart"?: (e: AnimationEvent) => void;
  "onanimationstart"?: (e: AnimationEvent) => void;
  "on:animationend"?: (e: AnimationEvent) => void;
  "onanimationend"?: (e: AnimationEvent) => void;
  "on:animationiteration"?: (e: AnimationEvent) => void;
  "onanimationiteration"?: (e: AnimationEvent) => void;
  "on:transitionend"?: (e: TransitionEvent) => void;
  "ontransitionend"?: (e: TransitionEvent) => void;
  // Resource events
  "on:load"?: (e: Event) => void;
  "onload"?: (e: Event) => void;
  "on:error"?: (e: Event) => void;
  "onerror"?: (e: Event) => void;
  // Clipboard events
  "on:copy"?: (e: ClipboardEvent) => void;
  "oncopy"?: (e: ClipboardEvent) => void;
  "on:cut"?: (e: ClipboardEvent) => void;
  "oncut"?: (e: ClipboardEvent) => void;
  "on:paste"?: (e: ClipboardEvent) => void;
  "onpaste"?: (e: ClipboardEvent) => void;
};

type AuroButtonProps = {
  /** 【myapp-button】 Disables the button. */
  disabled?: boolean;
  /** 【myapp-button】 Stretches to full width. */
  fluid?: boolean;
  /** 【myapp-button】 Visual style variant. */
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "flat";

  /** 【myapp-button】 Fired on activation. */
  "on:click"?: (e: CustomEvent<never>) => void;
  "onclick"?: (e: CustomEvent<never>) => void;
};

type AuroInputProps = {
  /** 【legacy-input】 Marks the field as required. */
  required?: boolean;
};

export type CustomElements = {
  /**
   * A clickable button styled per the Auro Design System.
   * ---
   *
   *
   * ### **Events:**
   *  - **click** - Fired on activation.
   *
   * ### **Slots:**
   *  - _default_ - Button label content.
   *
   * ### **CSS Parts:**
   *  - **button** - The native button element.
   * - **contentWrapper** - Wraps the slotted label.
   * - **link** - The anchor when rendered as a link.
   * - **loader** - The loading indicator.
   * - **text** - The button label text.
   */
  "myapp-button": Partial<Omit<AuroButtonProps, keyof BaseProps> & BaseProps & Omit<BaseEvents, keyof AuroButtonProps>>;

  /**
   * A text input field with built-in validation.
   * ---
   *
   *
   * ### **Slots:**
   *  - **label** - The field label.
   */
  "legacy-input": Partial<Omit<AuroInputProps, keyof BaseProps> & BaseProps & Omit<BaseEvents, keyof AuroInputProps>>;
};

declare global {
  namespace svelteHTML {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IntrinsicElements extends CustomElements {}
  }
}
