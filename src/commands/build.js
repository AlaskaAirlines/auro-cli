import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import { startDevServer } from "@web/dev-server";
import { hmrPlugin } from "@web/dev-server-hmr";
import { program } from "commander";
import { glob } from "glob";
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
    ora().succeed("Cleaned up dist folder");
  } catch (error) {
    ora().fail(`Failed to cleanup dist/ folder: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Creates Rollup plugins configuration.
 * @param {string[]} loadPaths - Paths to include in litScss.
 * @returns {object[]} - Array of Rollup plugins.
 */
function getPluginsConfig(modulePaths = []) {
  return [
    nodeResolve({
      dedupe: ["lit", "lit-element", "lit-html"],
      preferBuiltins: false,
      moduleDirectories: ["node_modules"],
    }),
    litScss({
      minify: { fast: true },
      options: {
        loadPaths: [
          "../../node_modules",
          "../node_modules",
          "node_modules",
          ...modulePaths,
        ],
      },
    }),
  ];
}

/**
 * Generates the Rollup configuration for the main bundle.
 * @param {object} options - Build options.
 * @param {string[]} options.modulePath - Path to the node_modules folder.
 * @returns {object} - Rollup configuration object.
 */
function getMainBundleConfig(options) {
  const { modulePaths = [] } = options;
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
    plugins: getPluginsConfig(modulePaths),
  };
}

/**
 * Creates Rollup configuration for demo files.
 * @param {string} entryPoint - The entry point file name without extension.
 * @returns {object} - Rollup configuration object.
 */
function createDemoConfig(options) {
  const { modulePaths = [] } = options;
  return {
    input: Object.fromEntries(
      glob.sync("./demo/*.js").map((file) => {
        const name = basename(file, ".js");
        return [`${name}.min`, file];
      }),
    ),
    output: {
      format: "esm",
      dir: "./demo/",
    },
    plugins: getPluginsConfig(modulePaths),
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
 * Creates output configuration objects for different bundle types
 * @returns {object} Configuration objects for main and d.ts outputs
 */
function getOutputConfigs() {
  return {
    // Configuration for the main bundle output
    mainOutputConfig: {
      format: "esm",
      dir: "./dist",
      entryFileNames: "[name].js",
    },
    // Configuration for the d.ts files output
    dtsOutputConfig: {
      format: "esm",
      dir: "./dist",
      entryFileNames: "[name].d.ts",
    },
  };
}

/**
 * Builds the main JavaScript bundle
 * @param {object} config - Rollup config for the main bundle
 * @param {object} outputConfig - Output configuration for the main bundle
 */
async function buildMainBundle(config, outputConfig) {
  const mainBundleSpinner = ora("Building main bundle...").start();

  try {
    const create_dist = await rollup(config);
    await create_dist.write(outputConfig);
    await create_dist.close();

    mainBundleSpinner.succeed("Main bundle built successfully");
  } catch (error) {
    mainBundleSpinner.fail("Failed to build main bundle");
    console.error("Error building main bundle:", error);
    throw new Error(`Main bundle build failed: ${error.message}`);
  }
}

/**
 * Builds the TypeScript definition files
 * @param {object} config - Rollup config for d.ts generation
 * @param {object} outputConfig - Output configuration for d.ts files
 */
async function buildTypeDefinitions(config, outputConfig) {
  const dtsSpinner = ora("Generating type definitions...").start();

  try {
    const create_dts = await rollup(config);
    await create_dts.write(outputConfig);
    await create_dts.close();

    dtsSpinner.succeed("Type definitions generated successfully");
  } catch (error) {
    dtsSpinner.fail("Failed to generate type definitions");
    console.error("Error building d.ts files:", error);
    throw new Error(`Type definitions build failed: ${error.message}`);
  }
}

/**
 * Builds the demo files
 * @param {Array<string>} demoFiles - Array of demo entry points
 */
async function buildDemoFiles(options) {
  const demoSpinner = ora("Building demo files...").start();

  try {
    const bundle = await rollup(createDemoConfig(options));

    await bundle.write(createDemoConfig(options).output);
    await bundle.close();

    demoSpinner.succeed("Demo files built successfully");
  } catch (error) {
    demoSpinner.fail("Failed to build demo files");
    console.error("Error building demo files:", error);
    throw new Error(`Demo files build failed: ${error.message}`);
  }
}

/**
 * Generates the Rollup configuration for watch mode.
 * @param {object} mainBundleConfig - The main bundle configuration
 * @param {object} mainOutputConfig - The output configuration
 * @returns {object} - Watch configuration for Rollup
 */
function getWatcherConfig(mainBundleConfig, mainOutputConfig) {
  return {
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
}

/**
 * Build the component using Rollup.
 */
async function buildWithRollup(options) {
  const { dev: isDevMode } = options;

  const mainBundleConfig = getMainBundleConfig(options);

  // Add terser plugin for minification in production mode
  if (!isDevMode) {
    mainBundleConfig.plugins.push(terser());
  }

  const dtsConfig = getDtsConfig();
  const { mainOutputConfig, dtsOutputConfig } = getOutputConfigs();

  try {
    if (!isDevMode) {
      await buildMainBundle(mainBundleConfig, mainOutputConfig);
      await buildTypeDefinitions(dtsConfig, dtsOutputConfig);
      await buildDemoFiles(options); // Build demo files in production mode
    } else {
      const watchModeSpinner = ora("Starting watch mode...").start();

      const watcherConfig = getWatcherConfig(
        mainBundleConfig,
        mainOutputConfig,
      );
      const watcher = watch(watcherConfig);

      try {
        handleWatcherEvents(watcher);
        watchModeSpinner.succeed("Watch mode started successfully");

        // Build demo files initially in dev mode
        await buildDemoFiles(options);

        // Start dev server in dev mode
        const serverSpinner = ora("Starting dev server...").start();
        try {
          const config = {
            port: Number(options.port) || undefined,
            open: options.closed ? undefined : options.open || "/",
            watch: true,
            nodeResolve: true,
            basePath: "/",
            rootDir: "./demo",
            middleware: [
              function rewriteIndex(context, next) {
                if (!context.url.endsWith("/") && !context.url.includes(".")) {
                  context.url += ".html";
                }
                return next();
              },
            ],
            plugins: [
              hmrPlugin({
                include: [
                  "src/**/*",
                  "demo/**/*",
                  "apiExamples/**/*",
                  "docs/**/*",
                ],
              }),
            ],
          };

          await startDevServer({
            config,
            readCliArgs: false,
            readFileConfig: false,
          });

          serverSpinner.succeed("Dev server started successfully");
        } catch (error) {
          serverSpinner.fail(`Failed to start dev server: ${error.message}`);
          console.error(error);
        }
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
  .option("-m, --module-paths [paths...]", "Path(s) to node_modules folder")
  .option("-d, --dev", "Development mode: rebuilds on file changes", false)
  .option("-p, --port <number>", "Port for the dev server")
  .option(
    "-b, --open <path>",
    "Path to open in the browser when dev server starts",
  )
  .option("-c, --closed", "Prevent browser from opening automatically")
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
