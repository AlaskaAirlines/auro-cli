/* eslint-disable jsdoc/require-jsdoc, no-magic-numbers */

import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

import fs from "fs";

function updateBuildApiScript() {
  try {
    const newScript = "wca analyze 'scripts/wca/*' --outFiles docs/api.md";
    const packageJsonPath = "package.json";

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    packageJson.scripts["build:api"] = newScript;

    // Write the updated package.json back to the file
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    Logger.error(`Failed to update build:api script in package.json: ${error}`);
  }

  Logger.success(`build:api script updated in package.json`);
}

updateBuildApiScript();
