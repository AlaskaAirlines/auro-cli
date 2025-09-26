import { basename } from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { glob } from "glob";
import { dts } from "rollup-plugin-dts";
import { litScss } from "rollup-plugin-scss-lit";
import { watchGlobs } from "./plugins.js";

// Default paths used across configurations
const DEFAULTS = {
  moduleDirectories: ["node_modules"],
  modulePaths: ["../../node_modules", "../node_modules", "node_modules"],
  watchPatterns: ["./apiExamples/**/*", "./docs/**/*"],
};

/**
 * Creates Rollup plugins configuration.
 * @param {string[]} modulePaths - Additional paths to include in litScss.
 * @param {object} options - Additional options for plugins
 * @returns {object[]} - Array of Rollup plugins.
 */
export function getPluginsConfig(modulePaths = [], options = {}) {
  const {
    watchPatterns = DEFAULTS.watchPatterns,
    dedupe = ["lit", "lit-element", "lit-html"],
  } = options;

  // Combine default paths with any user-provided paths
  const allModulePaths = [...DEFAULTS.modulePaths, ...modulePaths];

  return [
    nodeResolve({
      dedupe,
      preferBuiltins: false,
      moduleDirectories: DEFAULTS.moduleDirectories,
    }),
    litScss({
      minify: { fast: true },
      options: {
        loadPaths: [...allModulePaths, `${process.cwd()}/src/styles`, `${process.cwd()}/src`],
      },
    }),
    watchGlobs(watchPatterns),
  ];
}

/**
 * Creates Rollup configuration for the main bundle with output options.
 * @param {object} options - Build options.
 * @returns {object} - Complete Rollup configuration object with input and output.
 */
export function getMainBundleConfig(options = {}) {
  const {
    modulePaths = [],
    watch = false,
    input = ["./src/index.js", "./src/registered.js"],
    outputDir = "./dist",
    format = "esm",
  } = options;

  return {
    name: "Main",
    config: {
      input,
      output: {
        format,
        dir: outputDir,
        entryFileNames: "[name].js",
      },
      external: getExternalConfig(),
      plugins: getPluginsConfig(modulePaths),
      watch: getWatcherConfig(watch),
    },
  };
}

/**
 * Creates Rollup configuration for demo files.
 * @param {object} options - Build options.
 * @returns {object} - Rollup configuration object.
 */
export function getDemoConfig(options = {}) {
  const {
    modulePaths = [],
    watch = false,
    globPattern = "./demo/*.js",
    ignorePattern = ["./demo/*.min.js"],
    outputDir = "./demo",
  } = options;

  return {
    name: "Demo",
    config: {
      input: Object.fromEntries(
        glob.sync(globPattern, { ignore: ignorePattern }).map((file) => {
          const name = basename(file, ".js");
          return [name, file];
        }),
      ),
      output: {
        format: "esm",
        dir: outputDir,
        entryFileNames: "[name].min.js",
        chunkFileNames: "[name].min.js",
      },
      plugins: getPluginsConfig(modulePaths),
      watch: getWatcherConfig(watch),
    },
  };
}

/**
 * Creates Rollup configuration for the d.ts files with output options.
 * @param {object} options - Configuration options
 * @returns {object} - Complete Rollup configuration object with input and output.
 */
export function getDtsConfig(options = {}) {
  const { input = ["./dist/index.js"], outputDir = "./dist" } = options;

  return {
    name: "DTS",
    config: {
      input,
      output: {
        format: "esm",
        dir: outputDir,
        entryFileNames: "[name].d.ts",
      },
      plugins: [dts()],
    },
  };
}

/**
 * Creates Rollup configuration for watch mode.
 * @param {boolean|object} watchOptions - Whether to enable watch mode or watch options
 * @returns {object|false} - Watch configuration for Rollup or false if disabled
 */
export function getWatcherConfig(watchOptions) {
  // Return false if watch mode is disabled
  if (!watchOptions) {
    return false;
  }

  // Allow passing a configuration object or use defaults
  const options = typeof watchOptions === "object" ? watchOptions : {};

  return {
    clearScreen: options.clearScreen ?? true,
    buildDelay: options.buildDelay ?? 500,
    chokidar: {
      ignoreInitial: true,
      // Ignore common output files that cause feedback loops
      ignored: options.ignored ?? [
        "**/dist/**/*.d.ts",
        "**/custom-elements.json",
        "**/demo/*.md",
        "**/demo/**/*.min.js",
        "**/docs/api.md",
        "**/node_modules/**",
        "**/.git/**",
      ],
      // Reduce watcher's sensitivity to prevent loops
      awaitWriteFinish: options.awaitWriteFinish ?? {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    },
    include: options.include ?? [
      "./src/**/*.scss",
      "./src/**/*.js",
      "./src/**/*.ts",
      "./demo/**/*.js",
      "./apiExamples/**/*",
      "./docs/**/*.md",
    ],
    exclude: options.exclude ?? ["./dist/**/*", "./node_modules/**/*"],
  };
}

/**
 * Creates external configuration for Rollup.
 * @param {string[]} additional - Additional external patterns
 * @returns {(string|RegExp)[]} - Array of external dependencies.
 */
export function getExternalConfig(additional = []) {
  const defaults = [
    // externalize all lit dependencies
    /node_modules\/lit/,
    /node_modules\/lit-element/,
    /node_modules\/lit-html/,
    /node_modules\/@lit/,
  ];

  return [...defaults, ...additional];
}
