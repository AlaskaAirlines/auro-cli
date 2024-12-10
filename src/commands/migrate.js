import { program } from "commander";
import { shell } from "../utils/shell.js";
import path from "node:path";
import { fileURLToPath } from "url";

export default program
  .command("migrate")
  .description("Script runner to perform repetitive code change tasks")
  .requiredOption(
    "-id, --id <type>",
    "Select the migration you would like to run by id",
  )
  .action((options) => {
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    const scriptPath = path.resolve(dirname, "../migrations", options.id);

    shell(`node ${scriptPath}.js`);
  });
