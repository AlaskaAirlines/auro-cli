// 1. design tokens
// 1. WCSS
// 1. skeleton
// 1. background
// 1. table
// 1. radio
// 1. lockup
// 1. icon
// 1. hyperlink
// 1. header
// 1. popover
// 1. banner
// 1. dropdown
// 1. alert
// 1. avatar
// 1. loader
// 1. button
// 1. datetime
// 1. hyperlink
// 1. drawer
// 1. dialog
// 1. input
// 1. nav
// 1. toast
// 1. badge
// 1. checkbox
// 1. radio
// 1. carousel
// 1. accordion
// 1. backtotop
// 1. menu
// 1. flightline
// 1. pane
// 1. card
// 1. alert
// 1. sidenav
// 1. select
// 1. flight
// 1. datepicker
// 1. combobox

import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const packageJson = await fs.readFile(
    path.resolve(process.cwd(), "package.json"),
  );
  const engineVersionString = "^20.x || ^22.x";

  /** @type {Record<string, object>} */
  const fileContents = JSON.parse(packageJson.toString("utf8"));
  const packageEngineVersion = fileContents.engines.node.trim();

  if (packageEngineVersion !== engineVersionString) {
    throw new Error(
      `${fileContents.name} -> engine version is out of date. Expected "${engineVersionString}" and received "${packageEngineVersion}"`,
    );
  }

  // Check wcss version

  const wcssPackageName = "@aurodesignsystem/webcorestylesheets";
  const wcssVersion = `^6.0.2`;
  const peerDepsVersion = fileContents.peerDependencies[wcssPackageName];

  if (peerDepsVersion && peerDepsVersion !== wcssVersion) {
    throw new Error(
      `${fileContents.name} -> wcss version out of date. Expected "${wcssVersion}" and received ${peerDepsVersion}`,
    );
  }

  const iconMetaPackage = "@alaskaairux/icons";
  const iconMetaVersion = `^5.0.0`;
  const iconPeerDepsVersion = fileContents.peerDependencies[iconMetaPackage];

  if (iconPeerDepsVersion && iconPeerDepsVersion !== iconMetaVersion) {
    throw new Error(
      `${fileContents.name} -> ${iconMetaPackage} out of date. Expected "${wcssVersion}" and received ${iconPeerDepsVersion}`,
    );
  }

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

  const root = "/Users/Doug.Hooker@alaskaair.com/code/auro/auro-cli/outputs";
  const outputJsonFile = path.join(
    root,
    `${fileContents.name.replace("@aurodesignsystem/", "")}Deps.json`,
  );

  await fs.writeFile(outputJsonFile, JSON.stringify(auroDependencies, null, 4));
}

await main();
