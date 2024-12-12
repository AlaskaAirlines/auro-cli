import {
  processContentForFile,
  templateFiller,
} from "@aurodesignsystem/auro-library/scripts/utils/sharedFileProcessorUtils.mjs";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

const REMOTE_TEMPLATE_BASE_URL =
  "https://raw.githubusercontent.com/AlaskaAirlines/auro-templates";
const BRANCH_BASE = "main";

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
    "bug_report.yml",
    "config.yml",
    "feature_request.yml",
    "general-support.yml",
  ],
  workflows: [
    "addToProject.yml",
    "autoAssign.yml",
    "codeql.yml",
    "publishDemo.yml",
    "testPublish.yml",
  ],
  _root: [
    "CODEOWNERS",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "PULL_REQUEST_TEMPLATE.md",
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
 * @param {string} _filePath - The path to the file in the remote repository.
 * @return {string}
 */
function branchNameToRemoteUrl(branchOrTag, _filePath) {
  const filePath = _filePath.replace(".github", "dot-github");

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
 * @returns {FileProcessorConfig}
 */
function filePathToRemoteInput(filePath, branchOrTag, outputPath) {
  console.log(filePath, branchNameToRemoteUrl(branchOrTag, filePath));
  return {
    // identifier is only used for logging
    identifier: filePath.split("/").pop(),
    input: {
      remoteUrl: branchNameToRemoteUrl(branchOrTag, filePath),
      fileName: outputPath,
      overwrite: true,
    },
    output: outputPath,
    overwrite: true,
  };
}

/**
 * Sync the .github directory with the remote repository.
 * @param {string} rootDir - The root directory of the local repository.
 */
export async function syncDotGithubDir(rootDir) {
  // setup
  await templateFiller.extractNames();

  /**
   * @type {Promise<unknown>[]}
   */
  const fileOperations = [];

  for (const dir of Object.keys(githubDirShape)) {
    for (const file of githubDirShape[dir]) {
      const inputPath = `${dir === "_root" ? "" : `${dir}/`}${file}`;
      const outputPath = `${rootDir}/.github/${inputPath}`;

      const fileConfig = filePathToRemoteInput(
        `.github/${inputPath}`,
        "dhook/init-github-templates",
        outputPath,
      );

      fileOperations.push(processContentForFile(fileConfig));
    }
  }

  await Promise.all(fileOperations)
    .then(() => {
      Logger.log("All files processed.");
    })
    .catch((error) => {
      Logger.error(`Error processing files: ${error.message}`);

      // eslint-disable-next-line no-undef
      process.exit(1);
    });
}
