import { program } from "commander";
import ora from "ora";
import { withBuildOptions } from "#commands/_sharedOptions.js";
import { buildWithRollup, cleanupDist } from "#scripts/build/index.js";

let buildCommand = program
  .command("build")
  .description("Builds auro components");

buildCommand = withBuildOptions(buildCommand, {
  watch: false,
});

export default buildCommand.action(async (options) => {
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

    await buildWithRollup(options);

    if (!options.watch) {
      build.succeed("Build completed successfully!");
    }
  } catch (error) {
    // If there's any active spinner, we need to fail it
    ora().fail(`Build failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
});
