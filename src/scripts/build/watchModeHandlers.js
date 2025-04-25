import path from "node:path";
import ora from "ora";
import { rollup } from "rollup";
import { analyzeComponents } from "#scripts/analyze.js";
import { generateDocs } from "./bundleHandlers.js";
import { getDtsConfig } from "./configUtils.js";

// Track if any build is in progress to prevent overlapping operations
let buildInProgress = false;

// Store watch events that are currently being processed
const activeBuilds = {
  dts: false,
  analyze: false,
  docs: false,
};

// Keep track of time when last build of each type happened
const lastBuildTimes = {
  dts: 0,
  analyze: 0,
  docs: 0,
};

// Minimum time between builds of the same type (in ms)
const MIN_BUILD_INTERVAL = 5000;

// Track source paths of files that triggered a watch event
const sourceEventPaths = new Set();

// Known output files that should never trigger a rebuild
const OUTPUT_PATHS = [
  "/dist/index.d.ts",
  "/custom-elements.json",
  "/demo/api.md",
  "/docs/api.md",
  "/demo/index.min.js",
];

// Path matching checks - handle any non-string input safely
function isOutputFile(filePath) {
  if (!filePath || typeof filePath !== "string") return false;

  try {
    const normalizedPath = path.normalize(filePath);

    // Check if it's in our known output paths
    return (
      OUTPUT_PATHS.some((outputPath) => normalizedPath.endsWith(outputPath)) ||
      normalizedPath.includes("/dist/") ||
      normalizedPath.endsWith(".min.js") ||
      normalizedPath.endsWith(".d.ts")
    );
  } catch (error) {
    console.error(`Error checking path (${typeof filePath}):`, error.message);
    return false; // If any error occurs, assume it's not an output file
  }
}

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
  // Track if this is the first build
  let isInitialBuild = true;

  // Function to build d.ts files
  const buildDts = async () => {
    // Skip if a build is already in progress or if we're within the throttle time
    if (
      activeBuilds.dts ||
      Date.now() - lastBuildTimes.dts < MIN_BUILD_INTERVAL
    ) {
      return false;
    }

    try {
      activeBuilds.dts = true;
      lastBuildTimes.dts = Date.now();

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
        activeBuilds.dts = false;
      }
    } catch (error) {
      console.error("Error building TypeScript definition files:", error);
      activeBuilds.dts = false;
      return false;
    }
  };

  // Function to analyze components
  const runAnalyze = async () => {
    // Skip if a build is already in progress or if we're within the throttle time
    if (
      activeBuilds.analyze ||
      Date.now() - lastBuildTimes.analyze < MIN_BUILD_INTERVAL
    ) {
      return false;
    }

    const { wcaInput: sourceFiles, wcaOutput: outFile } = options;

    try {
      activeBuilds.analyze = true;
      lastBuildTimes.analyze = Date.now();

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
      } finally {
        activeBuilds.analyze = false;
      }
    } catch (error) {
      console.error("Error analyzing components:", error);
      activeBuilds.analyze = false;
      return false;
    }
  };

  // Function to rebuild documentation
  const rebuildDocs = async () => {
    // Skip if a build is already in progress, the main bundle is building,
    // or if we're within the throttle time
    if (
      buildInProgress ||
      activeBuilds.docs ||
      Date.now() - lastBuildTimes.docs < MIN_BUILD_INTERVAL
    ) {
      return false;
    }

    try {
      activeBuilds.docs = true;
      lastBuildTimes.docs = Date.now();

      const docsSpinner = ora("Refreshing docs...").start();

      try {
        await generateDocs(options);
        docsSpinner.succeed("Documentation refreshed!");
        return true;
      } catch (error) {
        docsSpinner.fail("Docs stumble! Couldn't refresh.");
        console.error("Documentation rebuild error:", error);
        return false;
      } finally {
        activeBuilds.docs = false;
      }
    } catch (error) {
      console.error("Error rebuilding documentation:", error);
      activeBuilds.docs = false;
      return false;
    }
  };

  // Create a spinner for watch mode
  const watchSpinner = ora("Activating watch mode...").start();
  let bundleSpinner;

  // Stores results of build tasks for initial build completion check
  const buildTasksResults = {
    dts: false,
    analyze: false,
    docs: false,
  };

  // Check if all initial build tasks completed successfully
  const checkInitialBuildComplete = () => {
    if (
      isInitialBuild &&
      buildTasksResults.dts &&
      buildTasksResults.analyze &&
      buildTasksResults.docs &&
      typeof onInitialBuildComplete === "function"
    ) {
      isInitialBuild = false;
      onInitialBuildComplete();
    }
  };

  // Create a function to safely schedule the post-bundle tasks
  function schedulePostBundleTasks(delay = 1000) {
    // Clear any pending timers
    if (schedulePostBundleTasks.timer) {
      clearTimeout(schedulePostBundleTasks.timer);
    }

    // Schedule the tasks sequentially with delays between them
    schedulePostBundleTasks.timer = setTimeout(async () => {
      // Run each task and capture its result
      buildTasksResults.dts = await buildDts();

      // Wait a bit between tasks to let the file system settle
      setTimeout(async () => {
        buildTasksResults.analyze = await runAnalyze();

        // Wait again before running docs
        setTimeout(async () => {
          buildTasksResults.docs = await rebuildDocs();
          checkInitialBuildComplete();
        }, 1000);
      }, 1000);
    }, delay);
  }

  watcher.on("event", async (event) => {
    switch (event.code) {
      case "START":
        watchSpinner.succeed("Watch mode active! Eyes peeled.");
        break;

      case "BUNDLE_START":
        // Clear source paths from the previous bundle operation
        sourceEventPaths.clear();

        // Store source file paths that triggered this build
        if (event.input) {
          try {
            // Handle different input formats safely
            const inputs = Array.isArray(event.input)
              ? event.input
              : typeof event.input === "string"
                ? [event.input]
                : typeof event.input === "object" && event.input !== null
                  ? Object.values(event.input)
                  : [];

            for (const input of inputs) {
              // Only process string inputs and skip non-string values
              if (typeof input === "string" && !isOutputFile(input)) {
                sourceEventPaths.add(path.normalize(input));
              }
            }
          } catch (error) {
            console.error("Error processing input paths:", error);
          }
        }

        bundleSpinner = ora("Weaving bundles...").start();
        buildInProgress = true;
        break;

      case "BUNDLE_END":
        if (bundleSpinner) {
          bundleSpinner.succeed(`Bundle done in ${event.duration}ms! 🚀`);
        }
        buildInProgress = false;

        // If there's at least one source file that triggered this build,
        // and none of them are output files, schedule the post-bundle tasks
        if (sourceEventPaths.size > 0) {
          schedulePostBundleTasks();
        }
        break;

      case "END":
        // The END event generally comes after BUNDLE_END
        // We've already scheduled our tasks in BUNDLE_END, so nothing to do here
        break;

      case "ERROR":
        buildInProgress = false;
        if (bundleSpinner) {
          bundleSpinner.fail(`Oops! Bundle hit a snag: ${event.error.message}`);
        } else {
          ora().fail(`Watch mode hiccup: ${event.error.message}`);
        }
        // Clear source paths since the build failed
        sourceEventPaths.clear();
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
