import terser from "@rollup/plugin-terser";
import { watch } from "rollup";
import {
  buildCombinedBundle,
  cleanupDist,
  compileDemoScss,
  generateDocs,
} from "./bundleHandlers.js";
import {
  getDemoConfig,
  getMainBundleConfig,
} from "./configUtils.js";
import { startDevelopmentServer } from "./devServerUtils.js";
import {
  handleWatcherEvents,
  setupWatchModeListeners,
} from "./watchModeHandlers.js";

/**
 * Run a production build once
 * @param {object} options - Build options
 * @returns {Promise<void>}
 */
async function runProductionBuild(options) {
  const mainBundleConfig = getMainBundleConfig(options);
  const demoConfig = getDemoConfig(options);

  // Add terser for minification in production
  if (!options.dev) {
    mainBundleConfig.config.plugins.push(terser());
  }

  // Generate docs if enabled
  await generateDocs(options);

  // Compile demo SCSS to CSS
  await compileDemoScss();

  // Build main and demo bundles
  await buildCombinedBundle(mainBundleConfig.config, demoConfig.configs);
}

/**
 * Set up watch mode for development
 * @param {object} options - Build options
 * @returns {Promise<object>} - Rollup watcher
 */
async function setupWatchMode(options) {
  const { dev: isDevMode } = options;
  const mainBundleConfig = getMainBundleConfig({ ...options, watch: true });
  const demoConfig = getDemoConfig({ ...options, watch: true });

  // Create and configure the watcher. Each demo entry is its own config so
  // shared imports inline into <name>.min.js rather than emitting a separate
  // <name>2.min.js chunk.
  const watcher = watch([mainBundleConfig.config, ...demoConfig.configs]);

  // Set up watcher event handlers
  handleWatcherEvents(
    watcher,
    options,
    isDevMode ? async () => startDevelopmentServer(options) : undefined,
  );

  // Watch demo SCSS files separately since they are not part of the rollup bundle
  const chokidar = await import("chokidar");
  let scssCompiling = false;
  let scssPending = false;
  let scssTimer = null;

  const scssWatcher = chokidar.watch("./demo/**/*.scss", {
    ignoreInitial: true,
    ignored: ["**/demo/**/*.min.css"],
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  scssWatcher.on("all", () => {
    if (scssTimer) clearTimeout(scssTimer);

    scssTimer = setTimeout(async () => {
      if (scssCompiling) {
        scssPending = true;
        return;
      }

      scssCompiling = true;
      try {
        await compileDemoScss();
      } catch (error) {
        console.error("Demo SCSS watch compilation error:", error);
      } finally {
        scssCompiling = false;
        if (scssPending) {
          scssPending = false;
          scssWatcher.emit("all");
        }
      }
    }, 500);
  });

  // Set up clean shutdown
  setupWatchModeListeners(watcher, scssWatcher);

  return watcher;
}

/**
 * Build the component using Rollup with the provided options
 * @param {object} options - Build configuration options
 * @param {boolean} [options.dev=false] - Whether to run in development mode
 * @param {boolean} [options.watch] - Whether to run in watch mode (defaults to value of dev)
 * @param {boolean} [options.docs=true] - Whether to generate documentation
 * @returns {Promise<object|void>} - Rollup watcher if in watch mode
 */
export async function buildWithRollup(options = {}) {
  try {
    const { watch } = options;

    // Clean output directory
    cleanupDist();

    // Run production build once or set up watch mode
    // Only use watch mode if explicitly enabled
    if (watch) {
      return await setupWatchMode(options);
    }

    return await runProductionBuild(options);
  } catch (error) {
    throw new Error(`Build failed: ${error.message}`);
  }
}

// Re-export utilities for backward compatibility
export { cleanupDist };
