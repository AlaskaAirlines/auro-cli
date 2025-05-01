import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// Core Node.js modules that should remain external
export const nodeBuiltins = [
  "node:path",
  "node:process",
  "node:fs",
  "node:child_process",
  "node:fs/promises",
  "node:url",
  "node:util",
  "path",
  "fs",
  "util",
  "process",
  "url",
  "child_process",
  "fs/promises",
];

// List of external dependencies that should not be bundled
export const externalDependencies = [
  "@aurodesignsystem/auro-library/*",
  "commander",
  "@web/dev-server",
  "@open-wc/dev-server-hmr",
  "gradient-string",
  "figlet",
  "inquirer",
  "simple-git",
  "glob",
  "web-component-analyzer",
];

// Create the final list of external packages
export const externalPackages = [...nodeBuiltins, ...externalDependencies];

// Import aliases for bundling
export const aliases = {
  "#configs": resolve(projectRoot, "src/configs"),
  "#commands": resolve(projectRoot, "src/commands"),
  "#scripts": resolve(projectRoot, "src/scripts"),
  "#utils": resolve(projectRoot, "src/utils"),
};

// Function to parse command line arguments
export function parseArgs() {
  return {
    isWatchMode:
      process.argv.includes("--watch") || process.argv.includes("-w"),
    isDevelopmentMode: process.argv.includes("--dev"),
  };
}

// Function to get build config based on development mode
export function getBuildConfig(isDev) {
  const config = {
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: "dist/auro-cli.js",
    format: "esm",
    banner: {
      js: "#!/usr/bin/env node",
    },
    external: [
      ...externalPackages,
      "./migrations/*",
      "../migrations/*",
      "node:*",
    ],
    packages: "external",
    loader: {
      ".node": "file",
    },
    mainFields: ["module", "main"],
    metafile: true,
    allowOverwrite: true,
    alias: aliases,
  };

  if (isDev) {
    config.minify = false;
    config.sourcemap = true;
    config.logLevel = "debug";
    config.treeShaking = false;
  } else {
    config.minify = true;
    config.sourcemap = "external";
    config.logLevel = "info";
    config.treeShaking = true;
    config.legalComments = "none";
  }

  return config;
}
