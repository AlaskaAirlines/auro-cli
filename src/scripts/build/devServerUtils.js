import { startDevServer } from "@web/dev-server";
import { hmrPlugin } from "@web/dev-server-hmr";
import ora from "ora";
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
    // Merge options with defaults
    const serverConfig = {
      port: Number(options.port) || undefined,
      open: options.open ? "/" : undefined,
      watch: options.watch ?? DEFAULT_CONFIG.watch,
      nodeResolve: options.nodeResolve ?? DEFAULT_CONFIG.nodeResolve,
      basePath: options.basePath ?? DEFAULT_CONFIG.basePath,
      rootDir: options.rootDir ?? DEFAULT_CONFIG.rootDir,

      // HTML file extension middleware
      middleware: [
        function rewriteIndex(context, next) {
          if (!context.url.endsWith("/") && !context.url.includes(".")) {
            context.url += ".html";
          }
          return next();
        },
      ],

      // Hot Module Replacement plugin
      plugins: [
        hmrPlugin({
          include: options.hmrInclude ?? DEFAULT_CONFIG.hmrInclude,
        }),
      ],
    };

    // Start the server with our configuration
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
