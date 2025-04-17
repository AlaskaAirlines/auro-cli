import { program } from "commander";
import { shell } from "#utils/shell.js";
import path from "node:path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import util from "util";
import process from "node:process";
import inquirer from "inquirer";

export default program
  .command("migrate")
  .description("Script runner to perform repetitive code change tasks")
  .requiredOption(
    "-i, --id <string>",
    "Select the migration you would like to run by id",
  )
  .option(
    "-m, --multi-gitter",
    "Run the migration on all repositories in the multi-gitter config",
  )
  .action(async (options) => {
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    const scriptPath = path.resolve(dirname, "migrations", options.id);

    if (options.multiGitter) {
      // Check if multi-gitter CLI command is available
      const execPromise = util.promisify(exec);

      try {
        await execPromise("command -v multi-gitter");
      } catch {
        console.error("multi-gitter is not installed.");
        process.exit(1);
      }

      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "dryRun",
          message:
            "Run migration in dry-run mode? (no changes will be committed)",
          default: true,
        },
      ]);

      if (answers.dryRun) {
        shell(
          `multi-gitter run ${scriptPath}/script.sh --config "${scriptPath}/multi-gitter.yml" --dry-run`,
        );
      } else {
        shell(
          `multi-gitter run ${scriptPath}/script.sh --config "${scriptPath}/multi-gitter.yml"`,
        );
      }
    } else {
      shell(`${scriptPath}/script.sh`);
    }
  });
