import fs from "node:fs/promises";
import path from "node:path";
import ora from "ora";

import { withHomeDir } from "#utils/pathUtils.js";

const OUTPUT_DIR = withHomeDir("run-migrations", "outputs");

export async function getAuroPackageDependencies() {
  const packageJson = await fs.readFile(
    path.resolve(process.cwd(), "package.json"),
  );

  // Ensure the outputs directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  /** @type {Record<string, object>} */
  const fileContents = JSON.parse(packageJson.toString("utf8"));

  // Log auro dependencies
  const auroPackagePrefixes = ["@aurodesignsystem", "@alaskaairux"];
  const auroDependencies = {
    name: fileContents.name,
    peerDependencies: {},
    devDependencies: {},
    dependencies: {},
  };

  /**
   *
   * @param {Record<string, string> | undefined} dependencyObject
   * @param {string} prefix
   *
   * @returns {Record<string, string>}
   */
  function scrapeDependencyObject(dependencyObject, prefix) {
    const matchingDeps = {};

    if (!dependencyObject) {
      return matchingDeps;
    }

    Object.keys(dependencyObject).forEach((dependency) => {
      if (dependency.includes(prefix)) {
        matchingDeps[dependency] = dependencyObject[dependency];
      }
    });

    return matchingDeps;
  }

  for (const prefix of auroPackagePrefixes) {
    auroDependencies.peerDependencies = {
      ...auroDependencies.peerDependencies,
      ...scrapeDependencyObject(fileContents.peerDependencies, prefix),
    };

    auroDependencies.devDependencies = {
      ...auroDependencies.devDependencies,
      ...scrapeDependencyObject(fileContents.devDependencies, prefix),
    };

    auroDependencies.dependencies = {
      ...auroDependencies.dependencies,
      ...scrapeDependencyObject(fileContents.dependencies, prefix),
    };
  }

  console.log(
    `${fileContents.name} -> ${JSON.stringify(auroDependencies, null, 4)}`,
  );

  const root = OUTPUT_DIR;
  const outputJsonFile = path.join(
    root,
    `${fileContents.name.replace("@aurodesignsystem/", "")}_deps.json`,
  );

  await fs.writeFile(outputJsonFile, JSON.stringify(auroDependencies, null, 4));
}

const spinner = ora("Fetching Auro package dependencies...").start();
getAuroPackageDependencies()
  .then(() => {
    spinner.succeed(
      "Auro package dependencies have been written to the output file.",
    );
  })
  .catch((error) => {
    spinner.fail("Error fetching Auro package dependencies:");
    console.error(error);
  });
