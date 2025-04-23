/**
 * @param {import('commander').Command} command
 * @param {{ watch: boolean }} options
 * @returns {import('commander').Command}
 */
export function withBuildOptions(command, { watch = false }) {
  return command
    .option("-m, --module-paths [paths...]", "Path(s) to node_modules folder")
    .option(
      "--watch",
      "Watch for changes - default for dev mode, opt-in for build",
      watch,
    )

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
