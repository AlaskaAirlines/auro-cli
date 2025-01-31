import {
  processContentForFile,
  templateFiller,
} from "@aurodesignsystem/auro-library/scripts/utils/sharedFileProcessorUtils.mjs";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import fs from "fs/promises";

const REMOTE_TEMPLATE_BASE_URL =
  "https://raw.githubusercontent.com/AlaskaAirlines/auro-templates";

// Constants for configuring sync branch and template selection
// ------------------------------------------------------------
const BRANCH_BASE = "main";
const TARGET_BRANCH_TO_COPY = "main";
const CONFIG_TEMPLATE = "default";

/**
 * @typedef {Object} GithubDirectory
 * @property {string[]} ISSUE_TEMPLATE - The issue template directory.
 * @property {string[]} workflows - The workflows directory.
 * @property {string} _root - The root directory (places files in .github directly).
 */

/**
 * @type {GithubDirectory} githubDirectory
 */
const githubDirShape = {
  ISSUE_TEMPLATE: [
    "bug_report.yaml",
    "config.yml",
    "feature_request.yaml",
    "general-support.yaml",
    "group.yaml",
    "story.yaml",
    "task.yaml",
  ],
  workflows: ["codeql.yml", "publishDemo.yml", "testPublish.yml"],
  _root: [
    "CODEOWNERS",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "PULL_REQUEST_TEMPLATE.md",
    "SECURITY.md",
    "settings.yml",
    "stale.yml",
  ],
};

// BELOW TYPES ARE COPIED DIRECTLY FROM THE LIBRARY
// How can we import JSDoc types from the library?

/**
 * This is the expected object type when passing something other than a string.
 * @typedef {Object} InputFileType
 * @property {string} remoteUrl - The remote template to fetch.
 * @property {string} fileName - Path including file name to store.
 * @property {boolean} [overwrite] - Default is true. Choose to overwrite the file if it exists.
 */

/**
 * @typedef {Object} FileProcessorConfig
 * @property {string} identifier - A unique identifier for this file (used for logging).
 * @property {string | InputFileType} input - Path to an input file, including filename.
 * @property {string} output - Path to an output file, including filename.
 * @property {Partial<MarkdownMagicOptions>} [mdMagicConfig] - Extra configuration options for md magic.
 * @property {Array<(contents: string) => string>} [preProcessors] - Extra processor functions to run on content AFTER markdownmagic and BEFORE templateFiller.
 * @property {Array<(contents: string) => string>} [postProcessors] - Extra processor functions to run on content.
 */

// BELOW NEEDS TO BE UPSTREAMED OR REMOVED FROM THE LIBRARY
/**
 * Take a branch or tag name and return the URL for the README file.
 * @param {string} branchOrTag - The git branch or tag to use for the README source.
 * @param {string} filePath - The path to the file in the remote repository.
 * @returns {string} The complete URL for the remote file.
 */
function branchNameToRemoteUrl(branchOrTag, filePath) {
  // check if tag starts with 'vX' since our tags are `v4.0.0`
  const isTag =
    branchOrTag.startsWith("v") &&
    /^\d+\.\d+\.\d+(?<_>-.*)?$/u.test(branchOrTag.slice(1));

  if (isTag) {
    return `${REMOTE_TEMPLATE_BASE_URL}/refs/tags/${branchOrTag}/${filePath}`;
  }

  if (branchOrTag !== BRANCH_BASE) {
    return `${REMOTE_TEMPLATE_BASE_URL}/refs/heads/${branchOrTag}/${filePath}`;
  }

  return `${REMOTE_TEMPLATE_BASE_URL}/${BRANCH_BASE}/${filePath}`;
}

/**
 * Take a branch or tag name and return the URL for the remote file.
 * @param {string} filePath - The name of the file to fetch.
 * @param {string} branchOrTag - The git branch or tag to use for the README source.
 * @param {string} outputPath - The path to the file in the local repository.
 * @returns {FileProcessorConfig} Configuration object for file processing.
 */
function filePathToRemoteInput(filePath, branchOrTag, outputPath) {
  const remoteUrl = branchNameToRemoteUrl(branchOrTag, filePath);

  return {
    // Identifier is only used for logging
    identifier: filePath.split("/").pop(),
    input: {
      remoteUrl,
      fileName: outputPath,
      overwrite: true,
    },
    output: outputPath,
    overwrite: true,
  };
}

/**
 * Recursively removes a directory and all its contents.
 * @param {string} dirPath - The path to the directory to remove.
 * @returns {Promise<void>} A promise that resolves when the directory is removed or rejects if an error occurs.
 * @throws {Error} If the directory cannot be removed.
 */
async function removeDirectory(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    Logger.log(`Successfully removed directory: ${dirPath}`);
  } catch (error) {
    Logger.error(`Error removing directory ${dirPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Sync the .github directory with the remote repository.
 * @param {string} rootDir - The root directory of the local repository.
 * @returns {Promise<void>} A promise that resolves when syncing is complete.
 */
export async function syncDotGithubDir(rootDir) {
  if (!rootDir) {
    Logger.error("Root directory must be specified");
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  // Remove .github directory if it exists
  const githubPath = ".github";

  try {
    await removeDirectory(githubPath);
    Logger.log(".github directory removed successfully");
  } catch (error) {
    Logger.error(`Error removing .github directory: ${error.message}`);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  // Setup
  await templateFiller.extractNames();

  const fileConfigs = [];
  const missingFiles = [];

  for (const dir of Object.keys(githubDirShape)) {
    for (const file of githubDirShape[dir]) {
      const inputPath = `${dir === "_root" ? "" : `${dir}/`}${file}`;
      const outputPath = `${rootDir}/.github/${inputPath}`;

      const fileConfig = filePathToRemoteInput(
        `templates/${CONFIG_TEMPLATE}/.github/${inputPath}`,
        TARGET_BRANCH_TO_COPY,
        outputPath,
      );
      fileConfigs.push(fileConfig);
    }
  }

  // Check if files exist
  await Promise.all(
    fileConfigs.map(async (config) => {
      try {
        const response = await fetch(config.input.remoteUrl, {
          method: "HEAD",
        });
        if (!response.ok) {
          missingFiles.push(config.input.remoteUrl);
        }
      } catch {
        missingFiles.push(config.input.remoteUrl);
      }
    }),
  );

  // If missing, log and exit
  if (missingFiles.length > 0) {
    const errorMessage = missingFiles
      .map((file) => `File not found: ${file}`)
      .join("\n");
    Logger.error(
      `Failed to sync .github directory. Confirm githubDirShape object is up to date:\n${errorMessage}`,
    );
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  // Process all files
  try {
    await Promise.all(
      fileConfigs.map((config) => processContentForFile(config)),
    );
    Logger.log("All files processed.");
  } catch (error) {
    Logger.error(`Error processing files: ${error.message}`);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }
}
