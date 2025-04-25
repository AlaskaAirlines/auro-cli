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
 * Build the component using Rollup.
 */
export async function buildWithRollup(options) {
  const {
    dev: isDevMode,
    watch: isWatchMode = isDevMode,
    docs = true,
  } = options;

  const mainBundleConfig = getMainBundleConfig(options);
  const demoConfig = getDemoConfig(options);

  // Add terser plugin for minification in production mode
  if (!isDevMode) {
    mainBundleConfig.config.plugins.push(terser());
  }

  const dtsConfig = getDtsConfig();

  try {
    // not dev and not watch = run exactly once. break early with a return
    if (!isDevMode && !isWatchMode) {
      if (docs) {
        await generateDocs(options); // Generate documentation only if not disabled
      }
      await buildCombinedBundle(mainBundleConfig.config, demoConfig.config); // Combined build for main and demo files
      await buildTypeDefinitions(dtsConfig.config, dtsConfig.config.output);
      return;
    }

    // Set up watcher
    const watcher = watch([mainBundleConfig.config, demoConfig.config]);

    handleWatcherEvents(
      watcher,
      options,
      isDevMode
        ? async () => {
            startDevelopmentServer(options);
          }
        : undefined,
    );

    setupWatchModeListeners(watcher);

    return watcher;
  } catch (error) {
    throw new Error(`Oops! Build hit a snag: ${error.message}`);
  }
}

// Re-export cleanupDist for backward compatibility
export { cleanupDist };
