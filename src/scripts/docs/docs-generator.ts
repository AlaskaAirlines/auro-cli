import fs from "node:fs";
import path from "node:path";
import { markdownTable } from "markdown-table";
import type {
  Package,
  Module,
  Declaration,
  CustomElementDeclaration,
  ClassMember,
  Parameter,
  Attribute
} from 'custom-elements-manifest';

interface GenerateOptions {
  outDir?: string;
  outFile?: string;
  manifestPath?: string;
}

interface MergedTableData {
  name: string;
  properties: string;
  attributes: string;
  modifiers: string;
  type: string;
  default: string;
  description: string;
}

export default class Docs {
  private static manifest: Package = { schemaVersion: "1.0.0", readme: "", modules: [] };

  /**
   * Generate markdown documentation for all components
   */
  static generate(options: GenerateOptions = {}): void {
    const {
      outDir = "./docs",
      outFile = "api.md",
      manifestPath = "./custom-elements.json",
    } = options;

    const { getElements, renderAllElements } = Docs;

    // Use provided manifest or fallback to default
    if (manifestPath) {
      try {
        const manifestContent = fs.readFileSync(manifestPath, "utf8");
        Docs.manifest = JSON.parse(manifestContent) as Package;
      } catch (error) {
        console.error(`Error reading manifest file at ${manifestPath}:`, error);
        throw error;
      }
    }

    const elements = getElements();

    // Create docs directory if it doesn't exist
    const docsDir = outDir;
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Generate combined API documentation
    const apiMarkdown = renderAllElements(elements);
    const apiFilename = path.join(docsDir, outFile);
    fs.writeFileSync(apiFilename, apiMarkdown);
    console.log(`Generated combined API documentation at ${apiFilename}`);
  }

  /**
   * Extract custom elements from the manifest
   */
  static getElements(): CustomElementDeclaration[] {

    // if wca exists, use only wca modules
    const wcaModules = Docs.manifest.modules.filter(Docs.isWcaModule);

    return Docs.manifest.modules.reduce(
      (els: CustomElementDeclaration[], module: Module) =>
        els.concat(
          module.declarations?.filter(
            (dec: Declaration): dec is CustomElementDeclaration => 
              'customElement' in dec && dec.customElement === true && 'tagName' in dec && 
              (wcaModules.length > 0 ? Docs.isWcaModule(module) : true),
          ) ?? [],
        ),
      [],
    );
  }

  /**
   * Check if a module has a path that matches the WCA pattern
   */
  static isWcaModule(module: Module): boolean {
    // Check if the module path matches "scripts/wca/auro-*.js"
    const { path } = module;

    if (!path) {
      return false;
    }
    
    // Match the pattern: starts with "scripts/wca/auro-" and ends with ".js"
    return path.startsWith('scripts/wca/auro-') && path.endsWith('.js');
  }

  /**
   * Render all elements into a single markdown document
   */
  static renderAllElements(elements: CustomElementDeclaration[]): string {
    return `${elements
      .sort((a, b) => (a.tagName || '').localeCompare(b.tagName || ''))
      .map((element: CustomElementDeclaration) => Docs.renderElement(element, true))
      .join("\n\n")}`;
  }

  /**
   * Render a single element as markdown
   */
  static renderElement(element: CustomElementDeclaration, includeTitle = true): string {
    const sections = [];
    const { renderTable, renderPropertiesAttributesTable, renderParameters, getType } = Docs;
    
    // Title and description
    sections.push(includeTitle ? `# ${element.tagName}` : '');

    if (element.description) {
      sections.push(element.description);
    }
    
    // Properties & Attributes table
    const propertiesTable = renderPropertiesAttributesTable(element);
    if (propertiesTable) {
      sections.push(propertiesTable.trim());
    }
    
    // Methods table
    const methodsTable = renderTable(
      "Methods",
      ["name", "parameters", "return", "description"],
      (element.members || [])
        .filter(
          (m: ClassMember) =>
            m.kind === "method" && ('privacy' in m ? m.privacy !== "private" : true) && m.name[0] !== "_",
        )
        .map((m: ClassMember) => ({
          ...m,
          parameters: renderParameters('parameters' in m ? m.parameters as Parameter[] : undefined),
          returnType: 'return' in m && m.return ? getType(m.return) : "",
        })),
    );
    if (methodsTable) {
      sections.push(methodsTable.trim());
    }
    
    // Events table
    const eventsTable = renderTable(
      "Events",
      ["name", "description"],
      element.events as unknown as Record<string, unknown>[],
    );
    if (eventsTable) {
      sections.push(eventsTable.trim());
    }
    
    // Slots table
    const slotsTable = renderTable(
      "Slots",
      [["name", "(default)"], "description"],
      element.slots as unknown as Record<string, unknown>[],
    );
    if (slotsTable) {
      sections.push(slotsTable.trim());
    }
    
    // CSS Shadow Parts table
    const cssPartsTable = renderTable(
      "CSS Shadow Parts",
      ["name", "description"],
      element.cssParts as unknown as Record<string, unknown>[],
    );
    if (cssPartsTable) {
      sections.push(cssPartsTable.trim());
    }
    
    // CSS Custom Properties table
    const cssPropertiesTable = renderTable(
      "CSS Custom Properties",
      ["name", "description"],
      element.cssProperties as unknown as Record<string, unknown>[],
    );
    if (cssPropertiesTable) {
      sections.push(cssPropertiesTable.trim());
    }
    
    return sections.join('\n\n');
  }

  /**
   * Render combined properties and attributes table
   */
  static renderPropertiesAttributesTable(element: CustomElementDeclaration): string {
    
    const { getType, escapeMarkdown } = Docs;
    
    const properties = element.members?.filter(
      (m: ClassMember) => 
        m.kind === "field" && 
        ('privacy' in m ? m.privacy !== "private" : true) && 
        m.name[0] !== "_"
    ) || [];
    const attributes = element.attributes || [];

    // Create a merged dataset
    const mergedData: MergedTableData[] = [];
    const processedNames = new Set<string>();

    // Process properties first (only include those with descriptions)
    properties.forEach((prop: ClassMember) => {
      if (prop.description?.trim()) {
        const propType = getType(prop) || "";
        const returnType = 'return' in prop && prop.return ? getType(prop.return) : "";
        const displayType = returnType || propType;
        
        mergedData.push({
          name: prop.name,
          properties: prop.name,
          attributes: ('attribute' in prop ? prop.attribute as string : '') || "",
          modifiers: ('readonly' in prop && prop.readonly ? 'readonly' : ''),
          type: displayType,
          default: ('default' in prop ? prop.default as string : '') || "",
          description: prop.description || "",
        });
      }
      processedNames.add(prop.name);
      if ('attribute' in prop && prop.attribute) {
        processedNames.add(prop.attribute as string);
      }
    });

    // Process attributes that don't have corresponding properties (only include those with descriptions)
    attributes.forEach((attr: Attribute) => {
      if (!processedNames.has(attr.name) && attr.description?.trim()) {
        mergedData.push({
          name: attr.name,
          properties: "",
          attributes: attr.name,
          modifiers: "",
          type: getType(attr) || "",
          default: attr.default || "",
          description: attr.description || "",
        });
      }
    });

    if (mergedData.length === 0) {
      return "";
    }

    const headers = ["Properties", "Attributes", "Modifiers", "Type", "Default", "Description"];
    const rows = mergedData.map((item: MergedTableData) => {
      const defaultRaw = item.default || "";
      const defaultTrimmed = defaultRaw.trim();
      // Remove surrounding single quotes from default values like 'foo'
      const defaultSanitized = defaultTrimmed.replace(/^'([^']+)'$/, "$1");
      // Remove surrounding double quotes from default values like "foo"
      const defaultDoubleSanitized = defaultSanitized.replace(/^"([^"]+)"$/, "$1");
      const defaultWrapped = defaultDoubleSanitized
        ? (defaultDoubleSanitized.startsWith('`') && defaultDoubleSanitized.endsWith('`')
            ? defaultDoubleSanitized
            : `\`${defaultDoubleSanitized}\``)
        : "";
      return [
        escapeMarkdown(item.properties),
        escapeMarkdown(item.attributes),
        escapeMarkdown(item.modifiers),
        escapeMarkdown(item.type),
        escapeMarkdown(defaultWrapped),
        escapeMarkdown(item.description),
      ];
    });

    const table = markdownTable([headers, ...rows]);

    return `### Properties & Attributes

${table}
`;
  }

  /**
   * Render method parameters as a formatted string
   */
  static renderParameters(parameters?: Parameter[]): string {

    const { escapeMarkdown, getType } = Docs;

    if (!parameters || parameters.length === 0) {
      return "None";
    }

    return parameters
      .map(
        (param: Parameter) => {
          const paramType = getType(param) || "any";
          const description = param.description ? ` - ${param.description}` : "";
          return `\`${param.name}\` (${escapeMarkdown(paramType)})${escapeMarkdown(description)}`;
        }
      )
      .join("<br>");
  }

  /**
   * Renders a markdown table of data, plucking the given properties from each item in `data`.
   */
  static renderTable(
    name: string, 
    properties: (string | string[])[], 
    data?: Array<Record<string, unknown>>
  ): string {

    const { escapeMarkdown, get, capitalize } = Docs;

    if (data === undefined || data.length === 0) {
      return "";
    }

    // Filter out items without descriptions
    const filteredData = data.filter((item: Record<string, unknown>) => {
      const { description } = item;
      return typeof description === 'string' && description.trim();
    });

    if (filteredData.length === 0) {
      return "";
    }

    const headers = properties
      .map((p: string | string[]) => capitalize((Array.isArray(p) ? p[0] : p).split(".")[0]));

    const rows = filteredData
      .map((item: Record<string, unknown>) =>
        properties
          .map((p: string | string[]) => {
            const value = get(item, p);
            // Handle multiline content and escape characters for markdown
            return escapeMarkdown(String(value || ""));
          })
      );

    const table = markdownTable([headers, ...rows]);

    return `### ${name}

${table}
`;
  }

  /**
   * Escape markdown special characters for table content
   */
  static escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "<br>")
      .replace(/\|/g, "\\|");
  }

  /**
   * Extract and format type information from a property or attribute according to custom-elements-manifest schema
   */
  // biome-ignore lint/suspicious/noExplicitAny: utility method needs to work with any object structure
  static getType(obj: any): string {
    if (!obj || !obj.type) {
      return "";
    }

    const { type } = obj;

    // Utility to normalize type text: fix union spacing and replace single quotes with backticks
    const normalizeType = (text: string): string => {
      return text
        // Normalize union separators to have spaces around |
        .replace(/\s*\|\s*/g, ' | ')
        // Replace any single-quoted type segments with backticks
        .replace(/'([^']+)'/g, '`$1`');
    };

    // Handle simple string type
    if (typeof type === 'string') {
      return normalizeType(type);
    }

    // Handle type with text property
    if (type.text) {
      return normalizeType(type.text);
    }

    // Handle union types or arrays of types
    if (Array.isArray(type)) {
      // biome-ignore lint/suspicious/noExplicitAny: handling dynamic type structures from manifest
      return type.map((t: any) => {
        if (typeof t === 'string') return t;
        if (t.text) return t.text;
        if (t.name) return t.name;
        return String(t);
      }).join(' \\| ');
    }

    // Handle complex type objects
    if (type.name) {
      return normalizeType(type.name);
    }

    // Handle references
    if (type.references && Array.isArray(type.references)) {
      // biome-ignore lint/suspicious/noExplicitAny: handling dynamic reference structures from manifest
      return type.references.map((ref: any) => ref.name || String(ref)).join(' \\| ');
    }

    // Fallback to string representation
    const result = String(type);
    return normalizeType(result);
  }

  /**
   * Reads a (possibly deep) path off of an object.
   */
  // biome-ignore lint/suspicious/noExplicitAny: utility method needs to work with any object structure
  static get(obj: any, pathInput: string | string[]): string {
    let fallback = "";
    let path: string = pathInput as string;
    if (Array.isArray(pathInput)) {
      [path, fallback] = pathInput;
    }
    const parts = path.split(".");
    // biome-ignore lint/suspicious/noExplicitAny: utility method needs to work with any object structure
    let current: any = obj;
    while (current && parts.length) {
      current = current[parts.shift() as string];
    }
    return current == null || current === "" ? fallback : String(current);
  }

  /**
   * Capitalize the first letter of a string and add spaces before capital letters in camelCase
   */
  static capitalize(s: string): string {
   
    // Add spaces before capital letters and capitalize first letter
    return s
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}
