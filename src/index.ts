import { program } from "commander";
import auroSplash from "#utils/auroSplash.js";
import getPackageVersion from "#utils/packageVersion.js";

// Register commands (importing them will register them)
import "#commands/dev.js";
import "#commands/build.js";
import "#commands/migrate.js";
import "#commands/sync.js";
import "#commands/wca-setup.js";
import "#commands/check-commits.ts";
import "#commands/pr-release.ts";
import "#commands/test.js";
import "#commands/agent.ts";
import "#commands/docs.ts";
import "#commands/ado.ts";

program
  .name("auro")
  .version(getPackageVersion())
  .description("A cli tool to support the Auro Design System");

program.addHelpText("beforeAll", auroSplash());

program.parse();
