/**
 * Shared Custom Elements Manifest (CEM) types and helpers used by the commands
 * that read `custom-elements.json` (cem, component, context). Keeping one copy
 * here avoids the shapes drifting across commands.
 */

export interface CemType {
  text?: string;
}

export type Deprecated = boolean | string | undefined;

export interface CemAttribute {
  name: string;
  fieldName?: string;
  type?: CemType;
  default?: string;
  description?: string;
  summary?: string;
  deprecated?: Deprecated;
}

export interface CemMember {
  kind: string;
  name: string;
  privacy?: string;
  static?: boolean;
  type?: CemType;
  default?: string;
  description?: string;
  summary?: string;
  deprecated?: Deprecated;
  return?: { type?: CemType };
}

export interface CemSlot {
  name: string;
  description?: string;
  summary?: string;
  // The analyzer does not emit this for inline `@slot` tags (v0.11.0); optional so
  // a custom plugin that maps `@deprecated` onto slots stays type-compatible.
  deprecated?: Deprecated;
}

export interface CemEvent {
  name: string;
  type?: CemType;
  description?: string;
  summary?: string;
  // The analyzer does not emit this for inline `@event`/`@fires` tags (v0.11.0);
  // optional so a custom plugin mapping `@deprecated` onto events stays compatible.
  deprecated?: Deprecated;
}

export interface CemNamed {
  name: string;
  description?: string;
}

export interface CemDeclaration {
  kind?: string;
  name: string;
  tagName?: string;
  customElement?: boolean;
  description?: string;
  summary?: string;
  superclass?: { name?: string };
  attributes?: CemAttribute[];
  members?: CemMember[];
  slots?: CemSlot[];
  events?: CemEvent[];
  cssParts?: CemNamed[];
  cssProperties?: CemNamed[];
}

export interface CemModule {
  path?: string;
  declarations?: CemDeclaration[];
  [key: string]: unknown;
}

export interface Manifest {
  schemaVersion?: string;
  modules?: CemModule[];
  [key: string]: unknown;
}

/**
 * Collapse whitespace (including embedded newlines from JSDoc descriptions) to a
 * single space so descriptions render on one line.
 */
export function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/gu, " ").trim();
}
