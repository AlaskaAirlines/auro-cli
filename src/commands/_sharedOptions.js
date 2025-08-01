import { parseBoolean } from "#utils/parseBoolean.js";

/**
 * @param {import('commander').Command} command
 * @param {{ watch: boolean }} options
 * @returns {import('commander').Command}
 */
export function withBuildOptions(command, { watch }) {
  return command
    .option("-m, --module-paths [paths...]", "Path(s) to node_modules folder")
    .option(
      "--watch [boolean]",
      "Watch for changes and rebuild automatically",
      parseBoolean,
      watch,
    )
    .option("--skip-docs", "Skip documentation generation", false)
    .option(
      "--wca-input [files...]",
      "Source file(s) to analyze for API documentation",
    )
    .option("--wca-output [files...]", "Output file(s) for API documentation");
}

/**
 * @param {import('commander').Command} command
 */
export function withServerOptions(command) {
  return command
    .option("-p, --port <number>", "Port for the dev server")
    .option("-o, --open", "Open the browser after starting the server");
}
