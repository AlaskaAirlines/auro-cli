/* eslint-disable jsdoc/require-jsdoc, no-magic-numbers */

import fs from "node:fs";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import { globSync } from "glob";

/**
 * Checks if a line contains a CSS custom property with a SCSS variable as fallback
 * that needs the #{} interpolation syntax
 * @param {string} line - The line to check
 * @returns {boolean} - Whether the line has incorrect syntax or not
 */
function hasIncorrectFallbackSyntax(line) {
  // Match only CSS custom property declarations (starting with --)
  // that have a var() function with an SCSS variable ($var) not wrapped in #{}
  const regex = /--[\w-]+\s*:\s*.*?var\(--[\w-]+,\s*\$[\w-]+(?!\})/;
  return regex.test(line);
}

/**
 * Fixes the line by wrapping SCSS variables in #{} interpolation
 * @param {string} line - The line to fix
 * @returns {string} - The fixed line
 */
function fixFallbackSyntax(line) {
  // Only replace SCSS variables within CSS custom property declarations
  // This pattern ensures we're only fixing variables within CSS custom property lines
  if (line.match(/--[\w-]+\s*:/)) {
    return line.replace(
      /var\(([^,]+),\s*(\$[\w-]+)(?!\})(.*?)\)/g,
      "var($1, #{$2}$3)",
    );
  }
  return line;
}

/**
 * Process a single SCSS file
 * @param {string} filePath - Path to the SCSS file
 * @returns {object} - Result of processing the file
 */
function processScssFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const issues = [];
    let hasIssues = false;

    const fixedLines = lines.map((line, index) => {
      if (hasIncorrectFallbackSyntax(line)) {
        hasIssues = true;
        issues.push({
          line: index + 1,
          content: line.trim(),
          fixed: fixFallbackSyntax(line).trim(),
        });
        return fixFallbackSyntax(line);
      }
      return line;
    });

    return {
      filePath,
      hasIssues,
      issues,
      fixedContent: fixedLines.join("\n"),
    };
  } catch (error) {
    Logger.error(`Error processing file ${filePath}: ${error.message}`);
    return { filePath, hasIssues: false, issues: [], error: error.message };
  }
}

/**
 * Main migration script function
 */
function migrationScript() {
  Logger.info("Starting CSS token fallback syntax check...");

  try {
    // Find all SCSS files in the project
    const scssFiles = globSync("**/*.scss", {
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
    });

    if (scssFiles.length === 0) {
      Logger.info("No SCSS files found in the project.");
      return;
    }

    Logger.info(`Found ${scssFiles.length} SCSS files to check.`);

    let filesWithIssues = 0;
    let totalIssues = 0;

    // Process each file
    for (const filePath of scssFiles) {
      const result = processScssFile(filePath);

      if (result.hasIssues) {
        filesWithIssues++;
        totalIssues += result.issues.length;

        Logger.info(`\nFound ${result.issues.length} issues in ${filePath}:`);
        for (const issue of result.issues) {
          Logger.info(`  Line ${issue.line}:`);
          Logger.info(`    Original: ${issue.content}`);
          Logger.info(`    Should be: ${issue.fixed}`);
        }

        // Ask if user wants to fix the file
        const shouldFix = process.argv.includes("--fix");

        if (shouldFix) {
          fs.writeFileSync(filePath, result.fixedContent, "utf8");
          Logger.success(`  Fixed issues in ${filePath}`);
        }
      }
    }

    // Summary
    Logger.info("\n--- Summary ---");
    Logger.info(`Total files checked: ${scssFiles.length}`);
    Logger.info(`Files with issues: ${filesWithIssues}`);
    Logger.info(`Total issues found: ${totalIssues}`);

    if (totalIssues > 0 && !process.argv.includes("--fix")) {
      Logger.info("\nRun with --fix flag to automatically fix these issues:");
      Logger.info("  node migration.js --fix");
    } else if (totalIssues > 0) {
      Logger.success("\nAll issues have been fixed!");
    } else {
      Logger.success(
        "\nNo issues found. All SCSS variable fallbacks are correctly formatted!",
      );
    }
  } catch (error) {
    Logger.error(`Error running migration script: ${error.message}`);
  }
}

//test
migrationScript();
