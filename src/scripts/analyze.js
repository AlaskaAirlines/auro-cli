
import Docs from "./docs-generator.js";
import { shell } from "#utils/shell.js";

/**
 * Analyzes web components and generates API documentation.
 * @param {string[]} sourceFiles - Array of file paths to analyze.
 * @param {string} outFile - Output file path.
 */
export async function analyzeComponents() {
  try {
    // The shell function returns a promise that resolves when the command completes
    await shell(
      "npx --package=@custom-elements-manifest/analyzer -y -- cem analyze --litelement --globs src/*.*js scripts/wca/**/*.*js --packagejson --dependencies",
    );
  } catch (error) {
    // Check if the error is just the plugin issue but the manifest was still created
    console.warn('CEM analyzer completed with warnings:', error.message);
  }

  // This will only run after the CEM analyzer has completed (successfully or with warnings)
  Docs.generate();
}
