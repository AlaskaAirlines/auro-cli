import ora from "ora";
import { rollup } from "rollup";
import { analyzeComponents } from "#scripts/analyze.js";
import { generateDocs } from "./bundleHandlers.js";
import { getDtsConfig } from "./configUtils.js";

// Track if any build is in progress to prevent overlapping operations
let buildInProgress = false;

/**
 * Handles the watcher events.
 * @param {object} watcher - Rollup watcher object.
 * @param {object} options - Build options.
 * @param {Function} [onInitialBuildComplete] - Callback to run after initial build completes.
 */
export async function handleWatcherEvents(
  watcher,
  options,
  onInitialBuildComplete,
) {
  // Track if a d.ts build is in progress
  let dtsBuildInProgress = false;

  // Track if this is the first build
  let isInitialBuild = true;

  // Function to build d.ts files
  const buildDts = async () => {
    if (dtsBuildInProgress) {
      ora().info("D.ts build already in progress, skipping...");
      return false;
    }

    try {
      dtsBuildInProgress = true;
      const dtsSpinner = ora("Building d.ts files in watch mode...").start();

      try {
        const create_dts = await rollup(getDtsConfig().config);
        await create_dts.write(getDtsConfig().config.output);
        await create_dts.close();

        dtsSpinner.succeed("d.ts files built successfully");
        return true;
      } catch (error) {
        dtsSpinner.fail("Failed to build d.ts files");
        console.error("d.ts build error:", error);
        return false;
      } finally {
        dtsBuildInProgress = false;
      }
    } catch (error) {
      console.error("Error building d.ts files:", error);
      return false;
    }
  };

  // Function to analyze components
  const runAnalyze = async () => {
    const { wcaInput: sourceFiles, wcaOutput: outFile } = options;
    const analyzeSpinner = ora("Analyzing components...").start();

    try {
      await analyzeComponents(sourceFiles, outFile);
      analyzeSpinner.succeed("Components analyzed successfully");
      return true;
    } catch (error) {
      analyzeSpinner.fail(`Failed to analyze components: ${error.message}`);
      console.error("Component analysis error:", error);
      return false;
    }
  };

  // Function to rebuild documentation
  const rebuildDocs = async () => {
    if (buildInProgress) {
      ora().info(
        "A build is already in progress, documentation rebuild queued...",
      );
      return false;
    }

    try {
      buildInProgress = true;
      const docsSpinner = ora("Rebuilding documentation...").start();

      try {
        await generateDocs(options);
        docsSpinner.succeed("Documentation rebuilt successfully");
        return true;
      } catch (error) {
        docsSpinner.fail("Failed to rebuild documentation");
        console.error("Documentation rebuild error:", error);
        return false;
      } finally {
        buildInProgress = false;
      }
    } catch (error) {
      console.error("Error rebuilding documentation:", error);
      buildInProgress = false;
      return false;
    }
  };

  // Create a spinner for watch mode
  const watchSpinner = ora("Starting watch mode...").start();

  let bundleSpinner;

  watcher.on("event", async (event) => {
    switch (event.code) {
      case "START":
        watchSpinner.succeed("Watching for changes");
        break;

      case "BUNDLE_START":
        // Use the bundle name from the config, fallback to "files" if name is not available
        bundleSpinner = ora(`Bundling ${event.name}...`).start();
        buildInProgress = true;
        break;

      case "BUNDLE_END":
        if (bundleSpinner) {
          // Use the same bundle name for completed message
          bundleSpinner.succeed(
            `${event.name} bundle completed in ${event.duration}ms`,
          );
        }
        buildInProgress = false;
        break;

      case "END": {
        // After the bundle is complete, perform these actions in sequence
        const dtsSuccess = await buildDts();
        const analyzeSuccess = await runAnalyze();
        const docsSuccess = await rebuildDocs();

        // If this is the initial build and all builds succeeded, trigger the callback
        if (
          isInitialBuild &&
          dtsSuccess &&
          analyzeSuccess &&
          docsSuccess &&
          typeof onInitialBuildComplete === "function"
        ) {
          isInitialBuild = false;
          onInitialBuildComplete();
        }
        break;
      }

      case "ERROR":
        buildInProgress = false;
        if (bundleSpinner) {
          bundleSpinner.fail(`Bundle failed: ${event.error.message}`);
        } else {
          ora().fail(`Watch error: ${event.error.message}`);
        }
        break;
    }
  });
}

/**
 * Setup watch mode for rollup
 * @param {object} watcher - Rollup watcher instance
 */
export function setupWatchModeListeners(watcher) {
  process.on("SIGINT", () => {
    const closeSpinner = ora("Closing watcher...").start();
    watcher.close();
    closeSpinner.succeed("Watcher closed successfully");
    process.exit(0);
  });

  return watcher;
}
