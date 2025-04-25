import { startDevServer } from "@web/dev-server";
import { hmrPlugin } from "@web/dev-server-hmr";
import ora from "ora";

/**
 * Starts the development server
 * @param {object} options - Server options like port and open flag
 * @returns {object} - The server instance
 */
export async function startDevelopmentServer(options) {
  const serverSpinner = ora("Starting dev server...\n").start();

  try {
    const config = {
      port: Number(options.port) || undefined,
      open: options.open ? "/" : undefined,
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
          include: ["src/**/*", "demo/**/*", "apiExamples/**/*", "docs/**/*"],
        }),
      ],
    };

    const server = await startDevServer({
      config,
      readCliArgs: false,
      readFileConfig: false,
    });

    // Stop the spinner without showing a success message, as the calling function will show the message
    serverSpinner.stop();
    return server;
  } catch (error) {
    serverSpinner.fail(`Failed to start dev server: ${error.message}`);
    console.error(error);
    throw new Error(`Dev server failed: ${error.message}`);
  }
}
