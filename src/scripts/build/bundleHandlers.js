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
    ora().succeed("All clean! Dist folder wiped.");
  } catch (error) {
    ora().fail(`Oops! Couldn't clean dist/ folder: ${error.message}`);
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
  const dtsSpinner = ora("Creating type definitions...").start();

  try {
    const create_dts = await rollup(config);
    await create_dts.write(outputConfig);
    await create_dts.close();

    dtsSpinner.succeed("Types files built.");
  } catch (error) {
    dtsSpinner.fail("Darn! Type definitions failed.");
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
  const combinedSpinner = ora(
    `Bundling ${mainConfig.name || "main"} and ${demoConfig.name || "demo"}...`,
  ).start();

  try {
    // Build main bundle
    const mainBundle = await rollup(mainConfig);
    await mainBundle.write(mainConfig.output);
    await mainBundle.close();
    combinedSpinner.text = `${mainConfig.name || "Main bundle"} done!`;

    // Build demo files
    const demoBundle = await rollup(demoConfig);
    await demoBundle.write(demoConfig.output);
    await demoBundle.close();

    combinedSpinner.succeed(
      `Bundles ready! ${mainConfig.name || "Main"} and ${demoConfig.name || "demo"} built.`,
    );
  } catch (error) {
    combinedSpinner.fail("Bundle hiccup! Build failed.");
    console.error("Error building combined bundle:", error);
    throw new Error(`Combined bundle build failed: ${error.message}`);
  }
}

/**
 * Analyzes web components and generates API documentation.
 */
export async function generateDocs(options) {
  const { wcaInput: sourceFiles, wcaOutput: outFile } = options;
  const analyzeSpinner = ora("Analyzing components and making docs...").start();

  try {
    await analyzeComponents(sourceFiles, outFile);
    await runDefaultDocsBuild();

    analyzeSpinner.succeed("Docs ready! Looking good.");
  } catch (error) {
    analyzeSpinner.fail(`Doc troubles! ${error.message}`);
    console.error("Error generating documentation:", error);
    throw new Error(`Documentation generation failed: ${error.message}`);
  }
}
