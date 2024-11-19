import { program } from "commander";
import { shell } from "../utils/shell.js";

export default program
  .command("dev")
  .description("Runs web-dev-server command")
  .option("-o, --open <type>", "Open server to a specific directory")
  .option("-p, --port <type>", "Change the server port")
  .action((options) => {
    shell("npx web-dev-server", [
      `--open ${options.open || "demo/"}`,
      `--port ${options.port || "8000"}`,
      "--node-resolve",
      "--watch",
    ]);
  });
