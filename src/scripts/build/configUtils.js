import { basename, join, resolve } from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { glob } from "glob";
import { litScss } from "rollup-plugin-scss-lit";
import { MODULE_DIRS } from "./paths.js";
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
    dev = false,
  } = options;

  // Combine default paths with any user-provided paths
  const allModulePaths = [...DEFAULTS.modulePaths, ...modulePaths];

  // Absolute fallback paths so nodeResolve finds workspace/hoisted packages
  // when the importer's auto-walkup chain doesn't reach the hoist root
  // (e.g. CLI invoked from a sibling repo, symlinked workspaces).
  const cwd = process.cwd();
  const absoluteModulePaths = MODULE_DIRS.map((dir) => resolve(cwd, dir));

  return [
    nodeResolve({
      dedupe,
      preferBuiltins: false,
      moduleDirectories: DEFAULTS.moduleDirectories,
      modulePaths: absoluteModulePaths,
    }),
    commonjs(),
    litScss({
      // Disable CSS minification in dev for readability and faster rebuilds
      minify: dev ? false : { fast: true },
      options: {
        loadPaths: [...allModulePaths, join(process.cwd(), "src", "styles"), join(process.cwd(), "src")],
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
    // When dev is true, avoid randomized filenames for easier debugging
    dev = false,
  } = options;

  return {
    name: "Main",
    config: {
      input,
      output: {
        format,
        dir: outputDir,
        // Stable names in dev; in production keep stable names for index/registered
        entryFileNames: (chunk) =>
          dev
            ? "[name].js"
            : ["index", "registered"].includes(chunk.name)
              ? "[name].js"
              : "[name]-[hash].js",
        chunkFileNames: dev ? "[name].js" : "[name]-[hash].js",
        assetFileNames: dev ? "[name][extname]" : "[name]-[hash][extname]",
      },
      external: getExternalConfig(),
      plugins: getPluginsConfig(modulePaths, { dev }),
      watch: getWatcherConfig(watch),
    },
  };
}

/**
 * Creates Rollup configurations for demo files. Each demo entry is built as
 * its own bundle with `inlineDynamicImports` so shared imports get duplicated
 * into each `<name>.min.js` rather than emitted as a separate `<name>2.min.js`
 * chunk. This guarantees demo HTML only needs to load its matching `.min.js`.
 * @param {object} options - Build options.
 * @returns {{name: string, configs: object[]}} - One Rollup config per demo entry.
 */
export function getDemoConfig(options = {}) {
  const {
    modulePaths = [],
    watch = false,
    globPattern = "./demo/*.js",
    ignorePattern = ["./demo/*.min.js"],
    outputDir = "./demo",
    dev = false,
  } = options;

  const entries = glob.sync(globPattern, { ignore: ignorePattern });
  const plugins = getPluginsConfig(modulePaths, { dev });
  const watcher = getWatcherConfig(watch);

  const configs = entries.map((file) => {
    const name = basename(file, ".js");
    return {
      input: { [name]: file },
      output: {
        format: "esm",
        dir: outputDir,
        entryFileNames: "[name].min.js",
        chunkFileNames: "[name].min.js",
        assetFileNames: dev ? "[name][extname]" : "[name]-[hash][extname]",
        inlineDynamicImports: true,
      },
      plugins,
      // Fail the build if any import can't be resolved instead of letting
      // Rollup silently externalize it — a bare specifier in a demo .min.js
      // breaks at runtime in the browser. Most common cause: a workspace
      // dep wasn't built yet (fix the build order, e.g. turbo `^build`).
      onwarn(warning, defaultHandler) {
        if (warning.code === "UNRESOLVED_IMPORT") {
          throw new Error(
            `Unresolved import "${warning.exporter ?? warning.source}" in ${warning.id ?? file}. ` +
              "Make sure workspace dependencies are built before bundling demos.",
          );
        }
        defaultHandler(warning);
      },
      watch: watcher,
    };
  });

  return { name: "Demo", configs };
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
        "**/demo/**/*.min.css",
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
