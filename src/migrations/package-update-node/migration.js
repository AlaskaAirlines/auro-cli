import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

import fs from "node:fs";
// import { path } from "path";

// Run tasks sequentially
const run = () => {
	try {
		const version = "^20 || ^22";
		const packageJsonPath = "package.json";

		// Read package.json
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

		packageJson.engines.node = version;

		// Write the updated package.json back to the file
		fs.writeFileSync(
			packageJsonPath,
			`${JSON.stringify(packageJson, null, 2)}\n`, // eslint-disable-line no-magic-numbers
			"utf8",
		);
	} catch (error) {
		Logger.error(
			`Failed to update node engine version in package.json: ${error}`,
		);
	}

	Logger.success("Node engine version updated to version in package.json");
};

run();
