import { program } from "commander";
import ora from "ora";
import {
  withBuildOptions,
  withServerOptions,
} from "#commands/_sharedOptions.js";
import { buildWithRollup, cleanupDist } from "#scripts/build/rollup.js";

let devCommand = program
  .command("dev")
  .description("Runs development server for auro components");

devCommand = withBuildOptions(devCommand, {
  watch: true,
});
devCommand = withServerOptions(devCommand);

export default devCommand.action(async (options) => {
  try {
    const build = ora("Initializing...");

    if (options.watch) {
      build.text = "Waiting for changes...";
      build.spinner = "bouncingBar";
      build.color = "green";
    } else {
      build.text = "Building component";
    }

    build.start();

    cleanupDist();

    await buildWithRollup({ ...options, dev: true, watch: true });

    // build.succeed("Build completed successfully!");
  } catch (error) {
    // If there's any active spinner, we need to fail it
    ora().fail(`Build failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
});
