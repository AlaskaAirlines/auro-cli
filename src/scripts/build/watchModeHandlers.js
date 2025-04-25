import path from "node:path";
import ora from "ora";
import { rollup } from "rollup";
import { analyzeComponents } from "#scripts/analyze.js";
import { generateDocs } from "./bundleHandlers.js";
import { getDtsConfig } from "./configUtils.js";

// Track if any build is in progress to prevent overlapping operations
let buildInProgress = false;

// Track build states and times in a single object for cleaner management
const builds = {
  dts: { active: false, lastTime: 0 },
  analyze: { active: false, lastTime: 0 },
  docs: { active: false, lastTime: 0 },
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
 * Runs a build task with proper tracking of state
 * @param {string} taskName - Type of task (dts, analyze, docs)
 * @param {Function} taskFn - The actual task function to run
 * @returns {Promise<boolean>} - Success status
 */
async function runBuildTask(taskName, taskFn) {
  const task = builds[taskName];

  // Skip if build is active or within throttle time
  if (task.active || Date.now() - task.lastTime < MIN_BUILD_INTERVAL) {
    return false;
  }

  try {
    task.active = true;
    task.lastTime = Date.now();
    return await taskFn();
  } catch (error) {
    console.error(`Error in ${taskName} task:`, error);
    return false;
  } finally {
    task.active = false;
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
  // biome-ignore lint/style/useConst: This is an object that is mutated.
  let buildTasksResults = { dts: false, analyze: false, docs: false };
  let scheduledTasksTimer = null;
  let bundleSpinner;

  // Create a spinner for watch mode
  const watchSpinner = ora("Activating watch mode...").start();

  // The actual task functions
  const buildTasks = {
    // Function to build d.ts files
    dts: async () => {
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
      }
    },

    // Function to analyze components
    analyze: async () => {
      const { wcaInput: sourceFiles, wcaOutput: outFile, skipDocs } = options;
      if (skipDocs) {
        const skipSpinner = ora("Skipping component analysis...").start();
        setTimeout(() => {
          skipSpinner.succeed("Component analysis skipped.");
        }, 0);
        return true;
      }

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
    },

    // Function to rebuild documentation
    docs: async () => {
      // Skip if main bundle is still building
      if (buildInProgress) {
        return false;
      }

      // Check if docs generation is skipped
      if (options.skipDocs) {
        const skipSpinner = ora("Skipping docs generation...").start();
        setTimeout(() => {
          skipSpinner.succeed("Docs generation skipped.");
        }, 0);
        return true;
      }

      const docsSpinner = ora("Refreshing docs...").start();
      try {
        await generateDocs(options);
        docsSpinner.succeed("Documentation refreshed!");
        return true;
      } catch (error) {
        docsSpinner.fail("Docs stumble! Couldn't refresh.");
        console.error("Documentation rebuild error:", error);
      }
    },
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

  // Schedule the post-bundle tasks with proper sequencing
  function schedulePostBundleTasks(delay = 1000) {
    if (scheduledTasksTimer) {
      clearTimeout(scheduledTasksTimer);
    }

    scheduledTasksTimer = setTimeout(async () => {
      // Run tasks with delays between them to avoid race conditions
      buildTasksResults.dts = await runBuildTask("dts", buildTasks.dts);

      setTimeout(async () => {
        buildTasksResults.analyze = await runBuildTask(
          "analyze",
          buildTasks.analyze,
        );

        setTimeout(async () => {
          buildTasksResults.docs = await runBuildTask("docs", buildTasks.docs);
          checkInitialBuildComplete();
        }, 1000);
      }, 1000);
    }, delay);
  }

  // Set up event handlers for the watcher
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
          bundleSpinner.succeed(
            `Bundle ${Array.isArray(event.input) ? `of ${event.input.join("& ")} ` : ""}done in ${event.duration}ms! 🚀`,
          );
        }
        buildInProgress = false;

        // Schedule post-bundle tasks if source files triggered this build
        if (sourceEventPaths.size > 0) {
          schedulePostBundleTasks();
        }
        break;

      case "END":
        // We've already scheduled tasks in BUNDLE_END, nothing to do here
        break;

      case "ERROR":
        buildInProgress = false;
        if (bundleSpinner) {
          bundleSpinner.fail(`Oops! Bundle hit a snag: ${event.error.message}`);
        } else {
          ora().fail(`Watch mode hiccup: ${event.error.message}`);
        }
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
