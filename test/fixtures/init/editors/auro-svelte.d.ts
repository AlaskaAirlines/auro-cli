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
   */
  "myapp-button": Partial<AuroButtonProps & BaseProps & BaseEvents>;

  /**
   * A text input field with built-in validation.
   * ---
   *
   *
   * ### **Slots:**
   *  - **label** - The field label.
   */
  "legacy-input": Partial<AuroInputProps & BaseProps & BaseEvents>;
};

declare global {
  namespace svelteHTML {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IntrinsicElements extends CustomElements {}
  }
}
