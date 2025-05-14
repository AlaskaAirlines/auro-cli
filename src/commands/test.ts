import path from "node:path";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import { shell } from "#utils/shell.js";

const __filename = fileURLToPath(import.meta.url);
const cliRootDir = path.resolve(path.dirname(__filename), "..");

export default program
  .command("test")
  .option("-w, --watch", "Set watch number for the test")
  .description("Run the web test runner to test the component library")
  .action(async (option) => {
    const command = `npx wtr --config ${cliRootDir}/dist/configs/web-test-runner.config.mjs`;

    if (option.watch) {
      shell(`${command} --watch`);
      return;
    }

    shell(command);
  });
