import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { glob } from "glob";

/**
 * Analyzes web components using WCA and extracts component properties
 * @param {string[]} sourceFiles - Array of source files to analyze (will use scripts/wca/* if they exist)
 * @returns {Promise<object>} - Component analysis data
 */
async function analyzeComponentProperties(sourceFiles) {
  // Create temporary directory for analysis
  const tempDir = path.resolve(process.cwd(), ".temp-wca");
  
  try {
    // Ensure temp directory exists
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    // Check if WCA-prepared files exist first (preferred)
    const wcaDir = path.resolve(process.cwd(), "scripts/wca");
    let filesToAnalyze = sourceFiles;
    
    try {
      await fs.promises.access(wcaDir);
      const wcaFiles = await glob(path.join(wcaDir, "*.js"));
      if (wcaFiles.length > 0) {
        console.log("Using WCA-prepared files from scripts/wca/");
        filesToAnalyze = wcaFiles;
      }
    } catch {
      console.log("No scripts/wca directory found, using source files directly");
    }
    
    // Check if files exist
    const existingFiles = [];
    for (const file of filesToAnalyze) {
      try {
        await fs.promises.access(file);
        existingFiles.push(file);
      } catch {
        console.warn(`Warning: File not found: ${file}`);
      }
    }
    
    if (existingFiles.length === 0) {
      throw new Error(`No valid files found to analyze. Checked: ${filesToAnalyze.join(", ")}`);
    }
    
    // Run WCA to get component data as JSON (capture output directly instead of writing to file)
    const wcaCommand = `npx --package=web-component-analyzer -y -- wca analyze "${existingFiles.join('" "')}" --format json`;
    
    console.log(`Running WCA for JSON analysis: ${wcaCommand}`);
    
    let wcaOutput;
    try {
      wcaOutput = execSync(wcaCommand, { encoding: 'utf8' });
      console.log(`WCA completed successfully, output length: ${wcaOutput.length} chars`);
    } catch (error) {
      console.error(`WCA stderr: ${error.stderr}`);
      console.error(`WCA stdout: ${error.stdout}`);
      throw new Error(`Web Component Analyzer failed: ${error.message}. Command: ${wcaCommand}`);
    }
    
    // Parse the JSON output directly (strip any warning messages)
    let analysisData;
    try {
      // WCA sometimes outputs warning messages before the JSON, so we need to extract just the JSON part
      let jsonOutput = wcaOutput;
      
      // Look for the start of JSON (first '{' character)
      const jsonStart = wcaOutput.indexOf('{');
      if (jsonStart > 0) {
        jsonOutput = wcaOutput.substring(jsonStart);
        console.log(`Stripped warning messages, JSON starts at position ${jsonStart}`);
      }
      
      // Look for the end of JSON (last '}' character)  
      const jsonEnd = jsonOutput.lastIndexOf('}');
      if (jsonEnd > 0 && jsonEnd < jsonOutput.length - 1) {
        jsonOutput = jsonOutput.substring(0, jsonEnd + 1);
        console.log(`Extracted JSON content, length: ${jsonOutput.length} chars`);
      }
      
      analysisData = JSON.parse(jsonOutput);
      console.log("Successfully parsed WCA analysis data");
    } catch (error) {
      console.error(`WCA output that failed to parse: ${wcaOutput.substring(0, 500)}...`);
      throw new Error(`Failed to parse WCA JSON output: ${error.message}`);
    }
    
    return analysisData;
  } finally {
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extracts component name from package.json or source files
 * @returns {string} - Component name
 */
function getComponentName() {
  try {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
    const name = packageJson.name;
    
    // Extract component name from @aurodesignsystem/auro-component format
    if (name.startsWith("@aurodesignsystem/")) {
      return name.replace("@aurodesignsystem/", "");
    }
    
    return name;
  } catch {
    // Fallback to analyzing source files for component name
    try {
      const sourceFiles = glob.sync("./src/auro-*.js");
      if (sourceFiles.length > 0) {
        const content = fs.readFileSync(sourceFiles[0], "utf-8");
        const tagMatch = content.match(/static register\(name \= ['"`]([^'"`]+)['"`]\)/);
        if (tagMatch) {
          return tagMatch[1];
        }
      }
    } catch {
      // Ignore
    }
    
    return "unknown-component";
  }
}

/**
 * Converts WCA property data to TypeScript interface
 * @param {object} component - Component data from WCA
 * @returns {string} - TypeScript interface definition
 */
function generateTypeScriptInterface(component) {
  const properties = component.members?.filter(member => 
    member.kind === "field" && member.privacy !== "private"
  ) || [];
  
  const attributes = component.attributes || [];
  
  // Combine properties and attributes, avoiding duplicates
  const allProps = new Map();
  
  // Add properties
  properties.forEach(prop => {
    allProps.set(prop.name, {
      name: prop.name,
      type: prop.type?.text || "any",
      description: prop.description || "",
      optional: !prop.required,
      attribute: prop.attribute
    });
  });
  
  // Add attributes that aren't already properties
  attributes.forEach(attr => {
    if (!allProps.has(attr.name)) {
      allProps.set(attr.name, {
        name: attr.name,
        type: attr.type?.text || "string",
        description: attr.description || "",
        optional: !attr.required,
        attribute: true
      });
    }
  });
  
  // Generate interface properties with detailed comments
  const interfaceProps = Array.from(allProps.values()).map(prop => {
    let comment = "";
    if (prop.description) {
      comment = `  /**\n   * ${prop.description}\n   */\n`;
    }
    const optional = prop.optional ? "?" : "";
    return `${comment}  ${prop.name}${optional}: ${prop.type};`;
  }).join("\n\n");
  
  return `/**
 * Component properties interface
 * Generated from web component analysis
 */
export interface ComponentProps {
${interfaceProps}
}`;
}

/**
 * Generates JavaScript Lit component class for component properties
 * @param {object} component - Component data from WCA
 * @param {string} componentName - Name of the component for the class
 * @returns {string} - Lit component class definition
 */
function generateJavaScriptExport(component, componentName) {
  const properties = component.members?.filter(member => 
    member.kind === "field" && member.privacy !== "private"
  ) || [];
  
  const attributes = component.attributes || [];
  
  // Create property definitions object
  const propDefs = new Map();
  
  properties.forEach(prop => {
    propDefs.set(prop.name, {
      type: prop.type?.text || "any",
      attribute: prop.attribute !== false,
      required: prop.required || false,
      description: prop.description || ""
    });
  });
  
  attributes.forEach(attr => {
    if (!propDefs.has(attr.name)) {
      propDefs.set(attr.name, {
        type: attr.type?.text || "string",
        attribute: true,
        required: attr.required || false,
        description: attr.description || ""
      });
    }
  });

  // Generate static properties object for Lit with JSDoc comments inline
  const litProperties = Array.from(propDefs.entries()).map(([name, def]) => {
    const attributeConfig = def.attribute ? "attribute: true" : "attribute: false";
    let typeConfig = '';
    
    // Map WCA types to Lit property types
    if (def.type === 'string' || def.type === 'String') {
      typeConfig = 'type: String';
    } else if (def.type === 'number' || def.type === 'Number') {
      typeConfig = 'type: Number';
    } else if (def.type === 'boolean' || def.type === 'Boolean') {
      typeConfig = 'type: Boolean';
    } else if (def.type === 'array' || def.type === 'Array') {
      typeConfig = 'type: Array';
    } else if (def.type === 'object' || def.type === 'Object') {
      typeConfig = 'type: Object';
    } else {
      typeConfig = 'type: String'; // default fallback
    }

    // Build the property configuration
    let propertyConfig = `{ ${typeConfig}`;
    if (def.attribute) {
      propertyConfig += `, ${attributeConfig}`;
    }
    propertyConfig += ' }';

    // Add JSDoc comment above the property
    const jsdocComment = def.description ? 
      `      /**\n       * ${def.description}\n       */` : 
      '';
    
    if (jsdocComment) {
      return `${jsdocComment}\n      ${name}: ${propertyConfig}`;
    }
    return `      ${name}: ${propertyConfig}`;
  }).join(',\n\n');

  // Convert component name to PascalCase class name
  const className = componentName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') + 'Properties';

  return `import { LitElement } from 'lit';

/**
 * Base class containing all ${componentName} properties with proper JSDoc comments
 * This class can be extended by other components to inherit property definitions
 * Generated from web component analysis
 */
export class ${className} extends LitElement {
  static get properties() {
    return {

${litProperties}
    };
  }

}`;
}

/**
 * Generates a JSDoc-only properties list for easy copying/documentation
 * @param {object} component - Component data from WCA
 * @returns {string} - JSDoc properties list
 */
function generateJSDocPropertiesList(component) {
  const properties = component.members?.filter(member => 
    member.kind === "field" && member.privacy !== "private"
  ) || [];
  
  const attributes = component.attributes || [];
  
  // Create property definitions object
  const propDefs = new Map();
  
  properties.forEach(prop => {
    propDefs.set(prop.name, {
      type: prop.type?.text || "any",
      description: prop.description || "",
      attribute: prop.attribute !== false
    });
  });
  
  attributes.forEach(attr => {
    if (!propDefs.has(attr.name)) {
      propDefs.set(attr.name, {
        type: attr.type?.text || "string",
        description: attr.description || "",
        attribute: true
      });
    }
  });

  // Generate JSDoc formatted properties list
  const jsdocProperties = Array.from(propDefs.entries()).map(([name, def]) => {
    return `  /**
   * ${def.description || `${name} property`}
   * @type {${def.type}}
   */
  ${name};`;
  }).join('\n\n');

  return `/**
 * Component Properties JSDoc List
 * Copy and paste these JSDoc comments into your component class
 * Generated from web component analysis
 */

${jsdocProperties}`;
}

/**
 * Generates framework-specific TypeScript declarations
 * @param {string} tagName - HTML tag name of the component
 * @param {string} className - Class name of the component
 * @returns {string} - Framework declarations
 */
function generateFrameworkDeclarations(tagName, className) {
  return `import { * as Component} from "./index.js";
import { ComponentProps } from './properties';

/**
 * Framework integration declarations for ${tagName}
 * Provides type support for React, Svelte, and global HTML elements
 */

declare module 'svelte/elements' {
  interface SvelteHTMLElements {
    /**
     * ${tagName} component for Svelte
     */
    '${tagName}': ComponentProps;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * ${tagName} component for React
       */
      '${tagName}': ComponentProps;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    /**
     * ${tagName} web component
     */
    "${tagName}": ${className};
  }
  
  namespace JSX {
    interface IntrinsicElements {
      /**
       * ${tagName} component for JSX
       */
      '${tagName}': ComponentProps;
    }
  }
  
  namespace svelteHTML {
    interface IntrinsicElements {
      /**
       * ${tagName} component for Svelte HTML
       */
      '${tagName}': ComponentProps;
    }
  }
}

export {};`;
}

/**
 * Main function to generate component typings
 * @param {object} options - Generation options
 */
export async function generateComponentTypings(options = {}) {
  const {
    input = ["./src/auro-*.js"],
    output = "./dist",
    componentName: providedName,
    frameworkDeclarations = true
  } = options;
  
  // Resolve input files using glob patterns
  const sourceFiles = [];
  const inputPatterns = Array.isArray(input) ? input : [input];
  
  for (const pattern of inputPatterns) {
    try {
      const matchedFiles = await glob(pattern);
      sourceFiles.push(...matchedFiles);
    } catch (error) {
      console.warn(`Warning: Failed to resolve pattern "${pattern}": ${error.message}`);
    }
  }
  
  // Remove duplicates
  const uniqueSourceFiles = [...new Set(sourceFiles)];
  
  if (uniqueSourceFiles.length === 0) {
    throw new Error(`No source files found matching patterns: ${inputPatterns.join(", ")}`);
  }
  
  console.log(`Analyzing ${uniqueSourceFiles.length} source file(s): ${uniqueSourceFiles.join(", ")}`);
  
  // Analyze components
  const analysisData = await analyzeComponentProperties(uniqueSourceFiles);
  
  if (!analysisData.tags || analysisData.tags.length === 0) {
    throw new Error("No web components found in the analyzed files. Make sure the files contain valid web component definitions.");
  }
  
  // Use the first component found (most common case)
  const component = analysisData.tags[0];
  const componentName = providedName || getComponentName();
  const tagName = component.name;
  const className = component.declaration?.name || "Component";
  
  console.log(`Found component: ${tagName} (class: ${className})`);
  
  // Ensure output directory exists
  await fs.promises.mkdir(output, { recursive: true });
  
  // Generate TypeScript interface file
  const interfaceContent = generateTypeScriptInterface(component);
  await fs.promises.writeFile(
    path.join(output, "properties.d.ts"), 
    interfaceContent
  );
  
  // Generate JavaScript properties file
  const jsContent = generateJavaScriptExport(component, tagName);
  await fs.promises.writeFile(
    path.join(output, "properties.js"), 
    jsContent
  );
  
  // Generate JSDoc properties list file
  const jsdocContent = generateJSDocPropertiesList(component);
  await fs.promises.writeFile(
    path.join(output, "properties.jsdoc.js"), 
    jsdocContent
  );
  
  // Generate framework declarations if requested
  if (frameworkDeclarations) {
    const frameworkContent = generateFrameworkDeclarations(tagName, className);
    await fs.promises.writeFile(
      path.join(output, "framework.d.ts"), 
      frameworkContent
    );
  }
  
  return {
    componentName,
    tagName,
    className,
    outputDir: output,
    filesGenerated: [
      path.join(output, "properties.d.ts"),
      path.join(output, "properties.js"),
      path.join(output, "properties.jsdoc.js"),
      ...(frameworkDeclarations ? [path.join(output, "framework.d.ts")] : [])
    ]
  };
}
