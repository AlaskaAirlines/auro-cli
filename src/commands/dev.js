import { program } from "commander";
import { shell } from "../utils/shell.js";

export default program
  .command("dev")
  .description("Runs web-dev-server command")
  .option("-o, --open <type>", "Open server to a specific directory")
  .option("-p, --port <type>", "Change the server port")
  .action((options) => {
    const port = options.port ? `--port ${options.port}` : "";

    shell("npx web-dev-server", [
      `--open ${options.open || "demo/"}`,
      port,
      "--node-resolve",
      "--watch",
    ]);
  });
