import fs from "node:fs/promises";
import path from "node:path";

const cliRootDir = path.resolve(path.dirname(__filename), "../../");
const BASE_DIRECTORY = path.join(cliRootDir, "outputs");

export async function getAuroPackageDependencies() {
  const packageJson = await fs.readFile(
    path.resolve(process.cwd(), "package.json"),
  );

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
  function scrapeDependencyObject(
    dependencyObject: Record<string, string> | undefined,
    prefix: string,
  ) {
    const matchingDeps: Record<string, string> = {};

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

  const root = BASE_DIRECTORY;
  const outputJsonFile = path.join(
    root,
    `${fileContents.name.replace("@aurodesignsystem/", "")}_deps.json`,
  );

  await fs.writeFile(outputJsonFile, JSON.stringify(auroDependencies, null, 4));
}
