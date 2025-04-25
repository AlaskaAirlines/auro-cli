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
      ora().info("Types build already in progress, hang tight...");
      return false;
    }

    try {
      dtsBuildInProgress = true;
      const dtsSpinner = ora("Crafting type definitions...").start();

      try {
        const create_dts = await rollup(getDtsConfig().config);
        await create_dts.write(getDtsConfig().config.output);
        await create_dts.close();

        dtsSpinner.succeed("Type files built.");
        return true;
      } catch (error) {
        dtsSpinner.fail("Types trouble! Build failed.");
        console.error("TypeScript definition build error:", error);
        return false;
      } finally {
        dtsBuildInProgress = false;
      }
    } catch (error) {
      console.error("Error building TypeScript definition files:", error);
      return false;
    }
  };

  // Function to analyze components
  const runAnalyze = async () => {
    const { wcaInput: sourceFiles, wcaOutput: outFile } = options;
    const analyzeSpinner = ora(
      "Detective work: analyzing components...",
    ).start();

    try {
      await analyzeComponents(sourceFiles, outFile);
      analyzeSpinner.succeed("Component analysis complete! API generated.");
      return true;
    } catch (error) {
      analyzeSpinner.fail("Analysis hiccup! Something went wrong.");
      console.error("Component analysis error:", error);
      return false;
    }
  };

  // Function to rebuild documentation
  const rebuildDocs = async () => {
    if (buildInProgress) {
      ora().info("Another build in progress, docs queued up next...");
      return false;
    }

    try {
      buildInProgress = true;
      const docsSpinner = ora("Refreshing docs...").start();

      try {
        await generateDocs(options);
        docsSpinner.succeed("Docs fresh and ready!");
        return true;
      } catch (error) {
        docsSpinner.fail("Docs stumble! Couldn't refresh.");
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
  const watchSpinner = ora("Activating watch mode...").start();

  let bundleSpinner;

  watcher.on("event", async (event) => {
    switch (event.code) {
      case "START":
        watchSpinner.succeed("Watch mode active! Eyes peeled.");
        break;

      case "BUNDLE_START":
        bundleSpinner = ora("Weaving bundles...").start();
        buildInProgress = true;
        break;

      case "BUNDLE_END":
        if (bundleSpinner) {
          bundleSpinner.succeed(`Bundle done in ${event.duration}ms! 🚀`);
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
          bundleSpinner.fail(`Oops! Bundle hit a snag: ${event.error.message}`);
        } else {
          ora().fail(`Watch mode hiccup: ${event.error.message}`);
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
    const closeSpinner = ora("Wrapping up...").start();
    watcher.close();
    closeSpinner.succeed("All done! See you next time. ✨");
    process.exit(0);
  });

  return watcher;
}
