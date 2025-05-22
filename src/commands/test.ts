import path from "node:path";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import open from "open";
import { shell } from "#utils/shell.js";

const __filename = fileURLToPath(import.meta.url);
const cliRootDir = path.resolve(path.dirname(__filename), "..");

export default program
  .command("test")
  .option("-w, --watch", "Set watch number for the test")
  .option("-c, --coverage-report", "Generate coverage report")
  .option("-o, --open", "Open the coverage report in the browser")
  .description("Run the web test runner to test the component library")
  .action(async (option) => {
    const configPath = path.join(
      cliRootDir,
      "dist",
      "configs",
      "web-test-runner.config.mjs",
    );
    let command = `npx wtr --config "${configPath}"`;
    const coveragePath = `${process.cwd()}/coverage/index.html`;

    if (option.coverageReport) {
      command += " --coverage";
    }

    if (option.watch) {
      command += " --watch";
    }

    shell(command);

    if (option.open) {
      await open(coveragePath);
    }
  });
