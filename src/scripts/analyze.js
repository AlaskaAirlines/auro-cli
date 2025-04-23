import { shell } from "#utils/shell.js";

/**
 * Analyzes web components and generates API documentation.
 * @param {string[]} sourceFiles - Array of file paths to analyze.
 * @param {string} outFile - Output file path.
 */
export async function analyzeComponents(sourceFiles, outFile) {
  shell(
    `npx wca analyze ${sourceFiles || "scripts/wca/*"} --outFiles ${outFile || "docs/api.md"}`,
  );
}
