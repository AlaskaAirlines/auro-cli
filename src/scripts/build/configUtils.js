import { basename } from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { glob } from "glob";
import { dts } from "rollup-plugin-dts";
import { litScss } from "rollup-plugin-scss-lit";

/**
 * Creates Rollup plugins configuration.
 * @param {string[]} modulePaths - Paths to include in litScss.
 * @returns {object[]} - Array of Rollup plugins.
 */
export function getPluginsConfig(modulePaths = []) {
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
 * Creates Rollup configuration for the main bundle with output options.
 * @param {object} options - Build options.
 * @param {string[]} options.modulePaths - Path to the node_modules folder.
 * @returns {object} - Complete Rollup configuration object with input and output.
 */
export function getMainBundleConfig(options) {
  const { modulePaths = [], watch } = options;
  return {
    name: "Main",
    config: {
      input: ["./src/index.js", "./src/registered.js"],
      output: {
        format: "esm",
        dir: "./dist",
        entryFileNames: "[name].js",
      },
      external: [
        // externalize all lit dependencies
        /node_modules\/lit/,
        /node_modules\/lit-element/,
        /node_modules\/lit-html/,
        /node_modules\/@lit/,
      ],
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
export function getDemoConfig(options) {
  const { modulePaths = [], watch } = options;
  return {
    name: "Demo",
    config: {
      input: Object.fromEntries(
        glob
          .sync("./demo/*.js", { ignore: ["./demo/*.min.js"] })
          .map((file) => {
            const name = basename(file, ".js");
            return [name, file];
          }),
      ),
      output: {
        format: "esm",
        dir: "./demo/",
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
 * @returns {object} - Complete Rollup configuration object with input and output.
 */
export function getDtsConfig() {
  return {
    name: "DTS",
    config: {
      input: ["./dist/index.js"],
      output: {
        format: "esm",
        dir: "./dist",
        entryFileNames: "[name].d.ts",
      },
      plugins: [dts()],
    },
  };
}

/**
 * Creates Rollup configuration for watch mode.
 * @param {object} config - The bundle configuration to convert to watch mode
 * @returns {object} - Watch configuration for Rollup
 */
export function getWatcherConfig(hasWatcher) {
  // Check if this is a demo config by looking at the input patterns
  if (!hasWatcher) {
    return false;
  }
  return {
    clearScreen: false,
    buildDelay: 200,
    chokidar: {
      ignoreInitial: true,
    },
    include: ["./src/**/*", "./demo/**/*", "./apiExamples/**/*", "./docs/**/*"],
  };
}
