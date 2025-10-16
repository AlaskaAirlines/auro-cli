/**
 * This page generates markdown documentation from the custom-element.json file.
 * Based on the HTML template generator but outputs markdown format.
 */
/** biome-ignore-all lint/complexity/noThisInStatic: not confusing */
import fs from "node:fs";
import path from "node:path";

export default class Docs {
  constructor() {
    this.manifest = {};
  }

  /**
   * Generate markdown documentation for all components
   */
  static generate(options = {}) {
    const {
      outDir = "./docs",
      outFile = "api.md",
      manifestPath = "./custom-elements.json",
    } = options;

    // Use provided manifest or fallback to default
    if (manifestPath) {
      try {
        const manifestContent = fs.readFileSync(manifestPath, "utf8");
        this.manifest = JSON.parse(manifestContent);
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
  static getElements() {
    return this.manifest.modules.reduce(
      (els, module) =>
        els.concat(
          module.declarations?.filter(
            (dec) => dec.customElement && dec.tagName && 
            this.isWcaModule(module),
          ) ?? [],
        ),
      [],
    );
  }

  /**
   * Check if a module has a path that matches the WCA pattern
   */
  static isWcaModule(module) {
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
  static renderAllElements(elements) {
    return `${elements
      .map((element) => this.renderElement(element, false))
      .join("\n\n---\n\n")}
    `;
  }

  /**
   * Render a single element as markdown
   */
  static renderElement(element, includeTitle = true) {
    return `${includeTitle ? `# ${element.tagName}\n\n` : `# ${element.tagName}\n\n`}${element.description ? `${element.description}\n\n` : ""}${this.renderPropertiesAttributesTable(element)}${this.renderTable(
      "Methods",
      ["name", "parameters", "return.type.text", "description"],
      (element.members || [])
        .filter(
          (m) =>
            m.kind === "method" && m.privacy !== "private" && m.name[0] !== "_",
        )
        .map((m) => ({
          ...m,
          parameters: this.renderParameters(m.parameters),
        })),
    )}${this.renderTable(
      "Events",
      ["name", "description"],
      element.events,
    )}${this.renderTable(
      "Slots",
      [["name", "(default)"], "description"],
      element.slots,
    )}${this.renderTable(
      "CSS Shadow Parts",
      ["name", "description"],
      element.cssParts,
    )}${this.renderTable(
      "CSS Custom Properties",
      ["name", "description"],
      element.cssProperties,
    )}`;
  }

  /**
   * Render combined properties and attributes table
   */
  static renderPropertiesAttributesTable(element) {
    const properties = element.members?.filter((m) => m.kind === "field") || [];
    const attributes = element.attributes || [];

    // Create a merged dataset
    const mergedData = [];
    const processedNames = new Set();

    // Process properties first (only include those with descriptions)
    properties.forEach((prop) => {
      if (prop.description?.trim()) {
        mergedData.push({
          name: prop.name,
          properties: prop.name,
          attributes: prop.attribute || "",
          type: this.get(prop, "type.text") || "",
          default: prop.default || "",
          description: prop.description || "",
        });
      }
      processedNames.add(prop.name);
      if (prop.attribute) {
        processedNames.add(prop.attribute);
      }
    });

    // Process attributes that don't have corresponding properties (only include those with descriptions)
    attributes.forEach((attr) => {
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
      .map((item) =>
        [
          item.properties,
          item.attributes,
          item.type,
          item.default,
          item.description,
        ]
          .map((value) =>
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
  static renderParameters(parameters) {
    if (!parameters || parameters.length === 0) {
      return "None";
    }

    return parameters
      .map(
        (param) =>
          `\`${param.name}\` (${this.get(param, "type.text") || "any"})${param.description ? ` - ${param.description}` : ""}`,
      )
      .join("<br>");
  }

  /**
   * Renders a markdown table of data, plucking the given properties from each item in `data`.
   */
  static renderTable(name, properties, data) {
    if (data === undefined || data.length === 0) {
      return "";
    }

    // Filter out items without descriptions
    const filteredData = data.filter((item) => item.description?.trim());

    if (filteredData.length === 0) {
      return "";
    }

    const headers = properties
      .map((p) => this.capitalize((Array.isArray(p) ? p[0] : p).split(".")[0]))
      .join(" | ");

    const separator = properties.map(() => "---").join(" | ");

    const rows = filteredData
      .map((item) =>
        properties
          .map((p) => {
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
  static get(obj, pathInput) {
    let fallback = "";
    let path = pathInput;
    if (Array.isArray(pathInput)) {
      [path, fallback] = pathInput;
    }
    const parts = path.split(".");
    let current = obj;
    while (current && parts.length) {
      current = current[parts.shift()];
    }
    return current == null || current === "" ? fallback : current;
  }

  /**
   * Capitalize the first letter of a string
   */
  static capitalize(s) {
    return s[0].toUpperCase() + s.substring(1);
  }
}
