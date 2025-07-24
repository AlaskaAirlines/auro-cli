import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Plop, run } from "plop";

const __filename = fileURLToPath(import.meta.url);
const cliRootDir = path.resolve(path.dirname(__filename), "..");

Plop.prepare(
  {
    configPath: path.join(
      cliRootDir,
      "docs-head-content-update",
      "plopfile.generator.js",
    ),
  },
  (env) => {
    Plop.execute(env, (env) => {
      const options = {
        ...env,
        dest: process.cwd(),
        completion: true,
        name: "auro-wow",
      };

      return run(options, undefined, true);
    });
  },
);
