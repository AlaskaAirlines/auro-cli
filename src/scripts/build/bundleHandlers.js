import { rmSync } from "node:fs";
import { join } from "node:path";
import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import ora from "ora";
import { rollup } from "rollup";
import { analyzeComponents } from "#scripts/analyze.js";
import { runDefaultDocsBuild } from "#scripts/build/defaultDocsBuild.js";
import { generateComponentTypings } from "#scripts/componentTypingsGenerator.js";

/**
 * Clean up the dist folder
 * @returns {boolean} Success status
 */
export function cleanupDist() {
  const distPath = join("./dist");
  const spinner = ora("Cleaning dist folder...").start();

  try {
    rmSync(distPath, { recursive: true, force: true });
    spinner.succeed("All clean! Dist folder wiped.");
    return true;
  } catch (error) {
    spinner.fail(`Oops! Couldn't clean dist/ folder: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Run a build step with spinner feedback
 * @param {string} taskName - Name of the task for spinner text
 * @param {Function} taskFn - Async function to execute the task
 * @param {string} successMsg - Message to show on success
 * @param {string} failMsg - Message to show on failure
 * @returns {Promise<any>} - Result of the task function or throws error
 */
async function runBuildStep(taskName, taskFn, successMsg, failMsg) {
  const spinner = ora(taskName).start();

  try {
    const result = await taskFn();
    spinner.succeed(successMsg);
    return result;
  } catch (error) {
    spinner.fail(failMsg);
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

/**
 * Builds the TypeScript definition files
 * @param {object} config - Rollup config for d.ts generation
 * @param {object} outputConfig - Output configuration for d.ts files
 */
export async function buildTypeDefinitions(config, outputConfig) {
  return runBuildStep(
    "Creating type definitions...",
    async () => {
      const bundle = await rollup(config);
      await bundle.write(outputConfig);
      await bundle.close();
    },
    "Types files built.",
    "Darn! Type definitions failed.",
  );
}

/**
 * Builds both the main bundle and demo files in one operation
 * @param {object} mainConfig - Rollup config for the main bundle
 * @param {object} demoConfig - Rollup config for the demo files
 */
export async function buildCombinedBundle(mainConfig, demoConfig) {
  return runBuildStep(
    `Bundling ${mainConfig.name || "main"} and ${demoConfig.name || "demo"}...`,
    async () => {
      // Build main bundle
      const mainBundle = await rollup(mainConfig);
      await mainBundle.write(mainConfig.output);
      await mainBundle.close();

      // Build demo files
      const demoBundle = await rollup(demoConfig);
      await demoBundle.write(demoConfig.output);
      await demoBundle.close();
    },
    `Bundles ready! ${mainConfig.name || "Main"} and ${demoConfig.name || "demo"} built.`,
    "Bundle hiccup! Build failed.",
  );
}

/**
 * Analyzes web components and generates API documentation.
 * @param {object} options - Options containing wcaInput and wcaOutput
 */
export async function generateDocs(options) {
  const { wcaInput: sourceFiles, wcaOutput: outFile, skipDocs } = options;

  if (skipDocs) {
    const skipSpinner = ora("Skipping docs generation...").start();

    setTimeout(() => {
      skipSpinner.succeed("Docs generation skipped.");
    }, 0);
    return;
  }

  return runBuildStep(
    "Analyzing components and making docs...",
    async () => {
      await analyzeComponents(sourceFiles, outFile);
      await runDefaultDocsBuild();
    },
    "Docs ready! Looking good.",
    "Doc troubles!",
  );
}

/**
 * Generates TypeScript declaration files for component properties
 * @param {object} options - Options containing component analysis parameters
 */
export async function generateTypings(options = {}) {
  const {
    wcaInput: sourceFiles = ["./src/auro-*.js"],
    skipTypings = false
  } = options;

  if (skipTypings) {
    const skipSpinner = ora("Skipping typings generation...").start();

    setTimeout(() => {
      skipSpinner.succeed("Typings generation skipped.");
    }, 0);
    return;
  }

  return runBuildStep(
    "Generating component typings...",
    async () => {
      await generateComponentTypings({
        input: sourceFiles,
        output: "./dist",
        frameworkDeclarations: true
      });
    },
    "Typings ready! Framework declarations generated.",
    "Typings trouble! Generation failed.",
  );
}

/**
 * Merges all .d.ts files in the dist directory into a single index.d.ts file
 */
export async function mergeTypeDefinitions() {
  return runBuildStep(
    "Merging TypeScript declarations...",
    async () => {
      // Find all .d.ts files in the dist directory
      const dtsFiles = await glob(path.join("./dist", "*.d.ts"));
      
      if (dtsFiles.length === 0) {
        console.log("No .d.ts files found to merge");
        return;
      }

      // Filter out any existing index.d.ts to avoid circular references
      const filesToMerge = dtsFiles.filter(file => 
        !path.basename(file).startsWith("index.")
      );

      if (filesToMerge.length === 0) {
        console.log("No .d.ts files to merge (excluding index files)");
        return;
      }

      let mergedContent = `/**
 * Merged TypeScript declarations
 * This file combines all component type definitions
 * Generated automatically during build
 */

`;

      // Process each .d.ts file
      let hasModuleDeclarations = false;
      const allImports = new Set();
      
      for (const file of filesToMerge) {
        const fileName = path.basename(file);
        const content = await fs.promises.readFile(file, "utf-8");
        
        // Check if this file has module declarations
        if (content.includes('declare module')) {
          hasModuleDeclarations = true;
        }
        
        // Extract imports separately but keep content structure intact
        const lines = content.split('\n');
        const contentLines = [];
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('import ')) {
            // Only preserve imports that reference local files or are needed for types
            if (trimmedLine.includes('./') || trimmedLine.includes('../') || 
                trimmedLine.includes('ComponentProps') || trimmedLine.includes('Component')) {
              allImports.add(line);
            }
          } else if (trimmedLine !== 'export {};') {
            contentLines.push(line);
          }
        }
        
        // Add a comment indicating the source file
        mergedContent += `// ===== ${fileName} =====\n`;
        
        // Add the content with JSDoc comments preserved inline
        if (contentLines.length > 0) {
          mergedContent += contentLines.join('\n') + '\n\n';
        }
      }

      // Add imports at the top of the file by prepending them
      let finalContent = mergedContent;
      if (allImports.size > 0) {
        const importsSection = Array.from(allImports).join('\n') + '\n\n';
        // Insert imports after the header comment but before the first content section
        const headerEnd = finalContent.indexOf('// ===== ');
        if (headerEnd > 0) {
          finalContent = finalContent.substring(0, headerEnd) + importsSection + finalContent.substring(headerEnd);
        } else {
          finalContent = importsSection + finalContent;
        }
      }
      
      mergedContent = finalContent;

      // Only add export {} if we have module declarations that require it
      if (hasModuleDeclarations) {
        mergedContent += '\nexport {};';
      }

      // Write the merged index.d.ts file
      const indexPath = path.join("./dist", "index.d.ts");
      await fs.promises.writeFile(indexPath, mergedContent);
      
      // Remove the individual .d.ts files after merging
      for (const file of filesToMerge) {
        try {
          await fs.promises.unlink(file);
          console.log(`Removed ${path.basename(file)}`);
        } catch (error) {
          console.warn(`Warning: Could not remove ${file}: ${error.message}`);
        }
      }
      
      console.log(`Merged ${filesToMerge.length} .d.ts files into index.d.ts`);
    },
    "Type definitions merged successfully!",
    "Failed to merge type definitions!",
  );
}
