import { rmSync } from "node:fs";
import { join } from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { program } from "commander";
import ora from "ora";
import { rollup, watch } from "rollup";
import { dts } from "rollup-plugin-dts";
import { litScss } from "rollup-plugin-scss-lit";

/**
 * Clean up the dist folder
 */
function cleanupDist() {
  const distPath = join("./dist");

  try {
    rmSync(distPath, { recursive: true, force: true });
    ora().succeed("Cleaned up dist/ folder");
  } catch (error) {
    ora().fail(`Failed to cleanup dist/ folder: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Generates the Rollup configuration for the main bundle.
 * @param {string} modulePath - Path to the node_modules folder.
 * @returns {object} - Rollup configuration object.
 */
function getMainBundleConfig(options) {
  const { modulePath } = options;
  return {
    input: ["./src/index.js", "./src/registered.js"],
    external: [
      "lit",
      "@lit/reactive-element",
      "lit-html",
      "lit/decorators.js",
      "lit/static-html.js",
      "lit/directives/repeat.js",
      "lit/directives/class-map.js",
      "lit/directives/if-defined.js",
    ],
    plugins: [
      nodeResolve({
        dedupe: ["lit", "lit-element", "lit-html"],
        preferBuiltins: false,
        moduleDirectories: ["node_modules"],
      }),
      litScss({
        minify: { fast: true },
        options: { loadPaths: [modulePath] },
      }),
    ],
  };
}

/**
 * Generates the Rollup configuration for the d.ts files.
 * @returns {object} - Rollup configuration object.
 */
function getDtsConfig() {
  return {
    input: ["./dist/index.js"],
    plugins: [dts()],
  };
}

/**
 * Handles the watcher events.
 * @param {object} watcher - Rollup watcher object.
 */
async function handleWatcherEvents(watcher) {
  // Track if a d.ts build is in progress
  let dtsBuildInProgress = false;

  // Function to build d.ts files
  const buildDts = async () => {
    if (dtsBuildInProgress) {
      ora().info("D.ts build already in progress, skipping...");
      return;
    }

    try {
      dtsBuildInProgress = true;
      const dtsSpinner = ora("Building d.ts files in watch mode...").start();

      try {
        const create_dts = await rollup(getDtsConfig());
        await create_dts.write({
          format: "esm",
          dir: "./dist",
          entryFileNames: "[name].d.ts",
        });
        await create_dts.close();

        dtsSpinner.succeed("d.ts files built successfully");
      } catch (error) {
        dtsSpinner.fail("Failed to build d.ts files");
        console.error("d.ts build error:", error);
      } finally {
        dtsBuildInProgress = false;
      }
    } catch (error) {
      console.error("Error building d.ts files:", error);
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
        bundleSpinner = ora(
          `Bundling ${Array.isArray(event.input) ? event.input.join(", ") : event.input}...`,
        ).start();
        break;
      case "BUNDLE_END":
        if (bundleSpinner) {
          bundleSpinner.succeed(`Bundle completed in ${event.duration}ms`);
        }
        break;
      case "END":
        // Generate d.ts files after the main bundle is complete
        await buildDts();
        break;
      case "ERROR":
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
 * Build the component using Rollup.
 */
async function buildWithRollup(options) {
  const { dev: isDevMode } = options;

  const mainBundleConfig = getMainBundleConfig(options);
  const dtsConfig = getDtsConfig();

  // Common output config for the main bundle
  const mainOutputConfig = {
    format: "esm",
    dir: "./dist",
    entryFileNames: "[name].js",
  };

  // Common output config for the d.ts files
  const dtsOutputConfig = {
    format: "esm",
    dir: "./dist",
    entryFileNames: "[name].d.ts",
  };

  try {
    if (!isDevMode) {
      // Main bundle spinner
      const mainBundleSpinner = ora("Building main bundle...").start();

      try {
        const create_dist = await rollup(mainBundleConfig);
        await create_dist.write(mainOutputConfig);
        await create_dist.close();

        mainBundleSpinner.succeed("Main bundle built successfully");
      } catch (error) {
        mainBundleSpinner.fail("Failed to build main bundle");
        console.error("Error building main bundle:", error);
        throw error;
      }

      // D.ts files spinner
      const dtsSpinner = ora("Generating type definitions...").start();

      try {
        const create_dts = await rollup(dtsConfig);
        await create_dts.write(dtsOutputConfig);
        await create_dts.close();

        dtsSpinner.succeed("Type definitions generated successfully");
      } catch (error) {
        dtsSpinner.fail("Failed to generate type definitions");
        console.error("Error building d.ts files:", error);
        throw error;
      }
    } else {
      const watchModeSpinner = ora("Starting watch mode...").start();

      const watcherConfig = {
        ...mainBundleConfig,
        output: [mainOutputConfig],
        watch: {
          clearScreen: false,
          buildDelay: 200,
          chokidar: {
            ignoreInitial: true,
          },
        },
      };

      const watcher = watch(watcherConfig);

      try {
        handleWatcherEvents(watcher);
        watchModeSpinner.succeed("Watch mode started successfully");
      } catch (error) {
        watchModeSpinner.fail("Watch mode initialization failed");
        throw error;
      }

      process.on("SIGINT", () => {
        const closeSpinner = ora("Closing watcher...").start();
        watcher.close();
        closeSpinner.succeed("Watcher closed successfully");
        process.exit(0);
      });

      return watcher;
    }
  } catch (error) {
    throw new Error(`Rollup build failed: ${error.message}`);
  }
}

export default program
  .command("build")
  .description("Builds auro components")
  .option(
    "-p, --module-path <string>",
    "Path to node_modules folder",
    "node_modules",
  )
  .option("-d, --dev", "Development mode: rebuilds on file changes", false)
  .action(async (options) => {
    try {
      const build = ora("Initializing...");

      if (options.dev) {
        build.text = "Waiting for changes...";
        build.spinner = "bouncingBar";
        build.color = "green";
      } else {
        build.text = "Building component";
      }

      build.start();

      cleanupDist();

      await buildWithRollup(options);

      if (!options.dev) {
        build.succeed("Build completed successfully!");
      }
    } catch (error) {
      // If there's any active spinner, we need to fail it
      ora().fail(`Build failed: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  });
