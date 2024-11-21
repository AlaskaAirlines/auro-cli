import { program } from "commander";
import { startDevServer } from "@web/dev-server";
import { hmrPlugin, presets } from "@open-wc/dev-server-hmr";

export default program
  .command("dev")
  .description("Runs web-dev-server command")
  .option("-o, --open <type>", "Open server to a specific directory")
  .option("-p, --port <type>", "Change the server port")
  .action((options) => {
    const config = {
      ...(options.port && { port: options.port }),
      ...{
        open: options.open || "demo",
        watch: true,
        nodeResolve: true,
        basePath: "/",
        plugins: [
          hmrPlugin({
            include: ["src/**/*", "demo/**/*", "apiExamples/**/*", "docs/**/*"],
            presets: [presets.lit, presets.litElement],
          }),
        ],
      },
    };

    startDevServer({
      config,
      readCliArgs: false,
      readFileConfig: false,
    });
  });
