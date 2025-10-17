/** biome-ignore-all lint/complexity/noThisInStatic: not confusing */
import fs from "node:fs";
import path from "node:path";
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

    // Use provided manifest or fallback to default
    if (manifestPath) {
      try {
        const manifestContent = fs.readFileSync(manifestPath, "utf8");
        this.manifest = JSON.parse(manifestContent) as Package;
      } catch (error) {
        console.error(`Error reading manifest file at ${manifestPath}:`, error);
        throw error;
      }
    }

    const elements = this.getElements();

    // Create docs directory if it doesn't exist
    const docsDir = outDir;
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Generate combined API documentation
    const apiMarkdown = this.renderAllElements(elements);
    const apiFilename = path.join(docsDir, outFile);
    fs.writeFileSync(apiFilename, apiMarkdown);
    console.log(`Generated combined API documentation at ${apiFilename}`);
  }

  /**
   * Extract custom elements from the manifest
   */
  static getElements(): CustomElementDeclaration[] {
    return this.manifest.modules.reduce(
      (els: CustomElementDeclaration[], module: Module) =>
        els.concat(
          module.declarations?.filter(
            (dec: Declaration): dec is CustomElementDeclaration => 
              'customElement' in dec && dec.customElement === true && 'tagName' in dec && 
              this.isWcaModule(module),
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
    const path = module.path;
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
      .map((element: CustomElementDeclaration) => this.renderElement(element, false))
      .join("\n\n---\n\n")}
    `;
  }

  /**
   * Render a single element as markdown
   */
  static renderElement(element: CustomElementDeclaration, includeTitle = true): string {
    return `${includeTitle ? `# ${element.tagName}\n\n` : `# ${element.tagName}\n\n`}${element.description ? `${element.description}\n\n` : ""}${this.renderPropertiesAttributesTable(element)}${this.renderTable(
      "Methods",
      ["name", "parameters", "return.type.text", "description"],
      (element.members || [])
        .filter(
          (m: ClassMember) =>
            m.kind === "method" && ('privacy' in m ? m.privacy !== "private" : true) && m.name[0] !== "_",
        )
        .map((m: ClassMember) => ({
          ...m,
          parameters: this.renderParameters('parameters' in m ? m.parameters as Parameter[] : undefined),
        })),
    )}${this.renderTable(
      "Events",
      ["name", "description"],
      element.events as unknown as Record<string, unknown>[],
    )}${this.renderTable(
      "Slots",
      [["name", "(default)"], "description"],
      element.slots as unknown as Record<string, unknown>[],
    )}${this.renderTable(
      "CSS Shadow Parts",
      ["name", "description"],
      element.cssParts as unknown as Record<string, unknown>[],
    )}${this.renderTable(
      "CSS Custom Properties",
      ["name", "description"],
      element.cssProperties as unknown as Record<string, unknown>[],
    )}`;
  }

  /**
   * Render combined properties and attributes table
   */
  static renderPropertiesAttributesTable(element: CustomElementDeclaration): string {
    const properties = element.members?.filter((m: ClassMember) => m.kind === "field") || [];
    const attributes = element.attributes || [];

    // Create a merged dataset
    const mergedData: MergedTableData[] = [];
    const processedNames = new Set<string>();

    // Process properties first (only include those with descriptions)
    properties.forEach((prop: ClassMember) => {
      if (prop.description?.trim()) {
        mergedData.push({
          name: prop.name,
          properties: prop.name,
          attributes: ('attribute' in prop ? prop.attribute as string : '') || "",
          type: this.get(prop, "type.text") || "",
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
          type: this.get(attr, "type.text") || "",
          default: attr.default || "",
          description: attr.description || "",
        });
      }
    });

    if (mergedData.length === 0) {
      return "";
    }

    const headers = "Properties | Attributes | Type | Default | Description ";
    const separator = "--- | --- | --- | --- | ---";

    const rows = mergedData
      .map((item: MergedTableData) =>
        [
          item.properties,
          item.attributes,
          item.type,
          item.default,
          item.description,
        ]
          .map((value: string) =>
            String(value || "")
              .replace(/\|/g, "\\|")
              .replace(/\n/g, "<br>"),
          )
          .join(" | "),
      )
      .join("\n");

    return `
### Properties & Attributes

| ${headers} |
| ${separator} |
${rows}

`;
  }

  /**
   * Render method parameters as a formatted string
   */
  static renderParameters(parameters?: Parameter[]): string {
    if (!parameters || parameters.length === 0) {
      return "None";
    }

    return parameters
      .map(
        (param: Parameter) =>
          `\`${param.name}\` (${this.get(param, "type.text") || "any"})${param.description ? ` - ${param.description}` : ""}`,
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
    if (data === undefined || data.length === 0) {
      return "";
    }

    // Filter out items without descriptions
    const filteredData = data.filter((item: Record<string, unknown>) => {
      const description = item.description;
      return typeof description === 'string' && description.trim();
    });

    if (filteredData.length === 0) {
      return "";
    }

    const headers = properties
      .map((p: string | string[]) => this.capitalize((Array.isArray(p) ? p[0] : p).split(".")[0]))
      .join(" | ");

    const separator = properties.map(() => "---").join(" | ");

    const rows = filteredData
      .map((item: Record<string, unknown>) =>
        properties
          .map((p: string | string[]) => {
            const value = this.get(item, p);
            // Escape pipes in table cells and handle multiline content
            return String(value || "")
              .replace(/\|/g, "\\|")
              .replace(/\n/g, "<br>");
          })
          .join(" | "),
      )
      .join("\n");

    return `
### ${name}

| ${headers} |
| ${separator} |
${rows}

`;
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
   * Capitalize the first letter of a string
   */
  static capitalize(s: string): string {
    return s[0].toUpperCase() + s.substring(1);
  }
}