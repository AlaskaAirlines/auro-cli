//import path from "node:path";
// import minimist from "minimist";
// import { Plop, run } from "plop";
//
// const args = process.argv.slice(2);
// const argv = minimist(args);
//
// import { dirname } from "node:path";
// import { fileURLToPath } from "node:url";
//
// const __dirname = dirname(fileURLToPath(import.meta.url));
//
// Plop.prepare({
//   cwd: argv.cwd,
//   configPath: path.join(__dirname, 'plopfile.js'),
//   preload: argv.preload || [],
//   completion: argv.completion
// }, env => Plop.execute(env, run));
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import { Plop, run } from "plop";

const __filename = fileURLToPath(import.meta.url);
const cliRootDir = path.resolve(path.dirname(__filename));
const configDir = path.join(cliRootDir, "configs");

export default program
  .command("generate")
  .option(
    "-n, --name <name>",
    "Name of the new component (will be normalized automatically)",
  )
  .description("Generate a new Auro component")
  .action(async (_options) => {
    Plop.prepare(
      {
        configPath: path.join(configDir, "plopfile.generator.js"),
        completion: "huh",
      },
      (env) => {
        // @ts-ignore - invalid type signature on run, not our fault
        Plop.execute(env, (env) => {
          const options = {
            ...env,
            dest: process.cwd(),
            completion: true,
          };

          return run(options, undefined, true);
        });
      },
    );
  });
