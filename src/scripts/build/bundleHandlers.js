import { rmSync } from "node:fs";
import { join } from "node:path";
import ora from "ora";
import { rollup } from "rollup";
import { analyzeComponents } from "#scripts/analyze.js";
import { runDefaultDocsBuild } from "#scripts/build/defaultDocsBuild.js";

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
