/* eslint-disable no-underscore-dangle, no-undef */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Simple debug logger that only prints when DEBUG environment variable is set.
 * @param {string} message - The message to log.
 */
function debugLog(message) {
  if (process.env.DEBUG) {
    console.log(`[DEBUG] ${message}`);
  }
}

/**
 * Retrieves the version from the package.json file.
 * @returns {string} The version from package.json.
 */
export default function getPackageVersion() {
  try {
    // Get the directory path of the current module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    debugLog(`Current module path: ${__dirname}`);

    // Standard installed module location - current directory
    const packagePath = path.resolve(__dirname, "..", "package.json");

    debugLog(`Checking package.json at: ${packagePath}`);
    if (fs.existsSync(packagePath)) {
      debugLog(`Found package.json at: ${packagePath}`);
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      return packageJson.version;
    }

    // Fallback to a default version if we can't find the package.json
    debugLog(
      "Could not find package.json in the standard installed module location, using default version",
    );
    return "0.0.0";
  } catch (error) {
    console.error("Error retrieving package version:", error);
    return "0.0.0";
  }
}
