import { rmSync } from "node:fs";
import { join } from "node:path";
import ora from "ora";
import { rollup } from "rollup";
import { analyzeComponents } from "#scripts/analyze.js";
import { runDefaultDocsBuild } from "#scripts/build/defaultDocsBuild.js";

/**
 * Clean up the dist folder
 */
export function cleanupDist() {
  const distPath = join("./dist");

  try {
    rmSync(distPath, { recursive: true, force: true });
    ora().succeed("Cleaned up dist folder");
  } catch (error) {
    ora().fail(`Failed to cleanup dist/ folder: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Builds the TypeScript definition files
 * @param {object} config - Rollup config for d.ts generation
 * @param {object} outputConfig - Output configuration for d.ts files
 */
export async function buildTypeDefinitions(config, outputConfig) {
  const dtsSpinner = ora("Generating type definitions...").start();

  try {
    const create_dts = await rollup(config);
    await create_dts.write(outputConfig);
    await create_dts.close();

    dtsSpinner.succeed("Type definitions generated successfully");
  } catch (error) {
    dtsSpinner.fail("Failed to generate type definitions");
    console.error("Error building d.ts files:", error);
    throw new Error(`Type definitions build failed: ${error.message}`);
  }
}

/**
 * Builds both the main bundle and demo files in one operation
 * @param {object} mainConfig - Rollup config for the main bundle
 * @param {object} demoConfig - Rollup config for the demo files
 */
export async function buildCombinedBundle(mainConfig, demoConfig) {
  const combinedSpinner = ora("Building main bundle and demo files...").start();

  try {
    // Build main bundle
    const mainBundle = await rollup(mainConfig);
    await mainBundle.write(mainConfig.output);
    await mainBundle.close();
    combinedSpinner.text = `${mainConfig.name || "Main bundle"} built successfully`;

    // Build demo files
    const demoBundle = await rollup(demoConfig);
    await demoBundle.write(demoConfig.output);
    await demoBundle.close();

    combinedSpinner.succeed(
      `${mainConfig.name || "Main bundle"} and ${demoConfig.name || "Demo"} built successfully`,
    );
  } catch (error) {
    combinedSpinner.fail("Failed to build combined bundle");
    console.error("Error building combined bundle:", error);
    throw new Error(`Combined bundle build failed: ${error.message}`);
  }
}

/**
 * Analyzes web components and generates API documentation.
 */
export async function generateDocs(options) {
  const { wcaInput: sourceFiles, wcaOutput: outFile } = options;
  const analyzeSpinner = ora(
    "Analyzing components and generating documentation...",
  ).start();

  try {
    await analyzeComponents(sourceFiles, outFile);
    await runDefaultDocsBuild();

    analyzeSpinner.succeed("Documentation generated successfully");
  } catch (error) {
    analyzeSpinner.fail(`Failed to generate documentation: ${error.message}`);
    console.error("Error generating documentation:", error);
    throw new Error(`Documentation generation failed: ${error.message}`);
  }
}
