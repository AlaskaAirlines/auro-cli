import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { startDevServer } from "@web/dev-server";
import { hmrPlugin } from "@web/dev-server-hmr";
import * as esbuild from "esbuild";
import ora from "ora";

import { MODULE_DIRS } from "#scripts/build/paths.js";
const WDS_OUTSIDE_ROOT_RE = /^\/__wds-outside-root__\/(\d+)\/(.+)$/;

/**
 * Dev-server plugin that serves CSS files from node_modules when the URL
 * looks like a bare package specifier (e.g. /@scope/pkg/dist/file.css).
 * Handles CSS @import rules that reference node_modules packages.
 */
function nodeModulesCssPlugin() {
  return {
    name: "node-modules-css",

    serve(context) {
      if (!context.path.endsWith(".css")) return;
      if (!context.path.startsWith("/@") && !/^\/[a-z]/i.test(context.path)) return;

      const urlPath = context.path.slice(1);
      const cwd = process.cwd();

      for (const dir of MODULE_DIRS) {
        const candidate = resolve(cwd, dir, urlPath);
        if (existsSync(candidate)) {
          return { body: readFileSync(candidate, "utf-8"), type: "css" };
        }
      }
    },
  };
}

function resolveWdsPath(urlPath, rootDir) {
  const match = urlPath.match(WDS_OUTSIDE_ROOT_RE);
  if (match) {
    return resolve(rootDir, "../".repeat(Number.parseInt(match[1], 10)), match[2]);
  }
  return resolve(rootDir, `.${urlPath}`);
}

/**
 * Dev-server plugin that converts CommonJS node_modules to ESM on-the-fly
 * using esbuild. Needed because nodeResolve serves node_modules files
 * directly to the browser, which can't handle require()/module.exports.
 * @returns {object} - A @web/dev-server plugin
 */
function cjsToEsmPlugin() {
  const CJS_PATTERN = /\b(require\s*\(|module\.exports\b|exports\.\w)/;
  const cache = new Map();
  let resolvedRootDir;

  return {
    name: "cjs-to-esm",

    async serverStart({ config }) {
      resolvedRootDir = resolve(config.rootDir);
    },

    async transform(context) {
      if (!context.path.includes("node_modules")) return;
      if (!context.path.endsWith(".js") && !context.path.endsWith(".cjs")) return;
      if (typeof context.body !== "string") return;
      if (!CJS_PATTERN.test(context.body)) return;

      const filePath = resolveWdsPath(context.path, resolvedRootDir);

      if (cache.has(filePath)) return cache.get(filePath);
      if (!existsSync(filePath)) return;

      try {
        const result = await esbuild.build({
          entryPoints: [filePath],
          bundle: true,
          format: "esm",
          platform: "browser",
          write: false,
          logLevel: "silent",
          external: builtinModules,
        });

        const output = { body: result.outputFiles[0].text };
        cache.set(filePath, output);
        return output;
      } catch (error) {
        console.error(`CJS-to-ESM bundling failed for ${context.path}:`, error.message);
      }
    },
  };
}

/**
 * Default server configuration
 */
const DEFAULT_CONFIG = {
  watch: true,
  nodeResolve: true,
  basePath: "/",
  rootDir: "./demo",
  hmrInclude: ["src/**/*", "demo/**/*", "apiExamples/**/*", "docs/**/*"],
};

/**
 * Starts the development server
 * @param {object} options - Server options
 * @param {boolean} [options.serve] - Whether to start the server
 * @param {number} [options.port] - Port number for the server
 * @param {boolean} [options.open] - Whether to open the browser
 * @param {string} [options.rootDir] - Root directory for serving files
 * @param {string[]} [options.hmrInclude] - Patterns to include for HMR
 * @returns {Promise<object>} - The server instance
 */
export async function startDevelopmentServer(options = {}) {
  if (!options.serve) return;

  const serverSpinner = ora("Firing up dev server...\n").start();

  try {
    const serverConfig = {
      port: Number(options.port) || undefined,
      open: options.open ? "/" : undefined,
      watch: options.watch ?? DEFAULT_CONFIG.watch,
      nodeResolve: options.nodeResolve ?? DEFAULT_CONFIG.nodeResolve,
      basePath: options.basePath ?? DEFAULT_CONFIG.basePath,
      rootDir: options.rootDir ?? DEFAULT_CONFIG.rootDir,

      middleware: [
        function rewriteIndex(context, next) {
          if (!context.url.endsWith("/") && !context.url.includes(".")) {
            context.url += ".html";
          }
          return next();
        },
      ],

      plugins: [
        nodeModulesCssPlugin(),
        cjsToEsmPlugin(),
        hmrPlugin({
          include: options.hmrInclude ?? DEFAULT_CONFIG.hmrInclude,
        }),
      ],
    };

    const server = await startDevServer({
      config: serverConfig,
      readCliArgs: false,
      readFileConfig: false,
    });

    serverSpinner.stop();
    return server;
  } catch (error) {
    serverSpinner.fail("Server snag! Couldn't start dev server.");
    console.error("Error starting development server:", error);
    throw new Error(`Development server failed to start: ${error.message}`);
  }
}
