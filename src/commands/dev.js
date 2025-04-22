import { hmrPlugin } from "@open-wc/dev-server-hmr";
import { startDevServer } from "@web/dev-server";
import { program } from "commander";

export default program
  .command("dev")
  .description("Runs web-dev-server command")
  .option("-o, --open <type>", "Open server to a specific directory")
  .option("-p, --port <type>", "Change the server port")
  .option("-c, --closed", "Prevent the server from opening a browser window")
  .action((options) => {
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
          include: ["src/**/*", "demo/**/*", "apiExamples/**/*", "docs/**/*"],
        }),
      ],
    };

    startDevServer({
      config,
      readCliArgs: false,
      readFileConfig: false,
    });
  });
