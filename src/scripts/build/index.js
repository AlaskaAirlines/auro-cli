import terser from "@rollup/plugin-terser";
import ora from "ora";
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
  const { dev: isDevMode, watch: isWatchMode = isDevMode } = options;

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
      await generateDocs(options); // Generate documentation
      await buildCombinedBundle(mainBundleConfig.config, demoConfig.config); // Combined build for main and demo files
      await buildTypeDefinitions(dtsConfig.config, dtsConfig.config.output);
      return;
    }

    // Set up watcher for dev mode or watch mode
    const watcher = watch([mainBundleConfig.config, demoConfig.config]);
    // Pass options to handleWatcherEvents so we can access them for rebuilding docs and restarting dev server
    // For dev mode, provide a callback that starts the dev server after initial builds are complete
    handleWatcherEvents(
      watcher,
      options,
      isDevMode
        ? async () => {
            const serverSpinner = ora(
              "Initial builds complete, starting development server...",
            ).start();
            try {
              await startDevelopmentServer(options);
              serverSpinner.succeed("Development server started successfully");
            } catch (error) {
              serverSpinner.fail(
                `Failed to start development server: ${error.message}`,
              );
              throw error;
            }
          }
        : undefined,
    );

    // Don't start the dev server immediately anymore - we'll start it in the callback
    // when the initial builds are complete

    setupWatchModeListeners(watcher);

    return watcher;
  } catch (error) {
    throw new Error(`Rollup build failed: ${error.message}`);
  }
}

// Re-export cleanupDist for backward compatibility
export { cleanupDist };
