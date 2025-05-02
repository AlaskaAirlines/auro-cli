import terser from "@rollup/plugin-terser";
import { watch } from "rollup";
import {
  buildCombinedBundle,
  buildTypeDefinitions,
  cleanupDist,
  generateDocs,
} from "./bundleHandlers.js";
import {
  getDemoConfig,
  getDtsConfig,
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
  const dtsConfig = getDtsConfig();

  // Add terser for minification in production
  mainBundleConfig.config.plugins.push(terser());

  // Generate docs if enabled
  await generateDocs(options);

  // Build main and demo bundles
  await buildCombinedBundle(mainBundleConfig.config, demoConfig.config);

  // Build TypeScript definitions
  await buildTypeDefinitions(dtsConfig.config, dtsConfig.config.output);
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

  // Create and configure the watcher
  const watcher = watch([mainBundleConfig.config, demoConfig.config]);

  // Set up watcher event handlers
  handleWatcherEvents(
    watcher,
    options,
    isDevMode ? async () => startDevelopmentServer(options) : undefined,
  );

  // Set up clean shutdown
  setupWatchModeListeners(watcher);

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
    const { dev: isDevMode = false, watch: isWatchMode = isDevMode } = options;

    // Clean output directory
    cleanupDist();

    // Run production build once or set up watch mode
    if (!isDevMode && !isWatchMode) {
      return await runProductionBuild(options);
      // biome-ignore lint/style/noUselessElse: This else is the difference between build or dev.
    } else {
      return await setupWatchMode(options);
    }
  } catch (error) {
    throw new Error(`Build failed: ${error.message}`);
  }
}

// Re-export utilities for backward compatibility
export { cleanupDist };
