import fs from "node:fs/promises";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import ora from "ora";
// @ts-expect-error: No types available currently
import { processContentForFile, templateFiller } from "@aurodesignsystem/auro-library/scripts/utils/sharedFileProcessorUtils.mjs";

// BELOW TYPES ARE COPIED DIRECTLY FROM THE LIBRARY
// How can we import JSDoc types from the library?

/**
 * This is the expected object type when passing something other than a string.
 * @typedef {Object} InputFileType
 * @property {string} remoteUrl - The remote template to fetch.
 * @property {string} fileName - Path including file name to store.
 * @property {boolean} [overwrite] - Default is true. Choose to overwrite the file if it exists.
 */

interface FileProcessorConfig {
  identifier: string;
  input: string | {
    remoteUrl: string;
    fileName: string;
    overwrite?: boolean;
  };
  output: string;
  mdMagicConfig?: Partial<any>;
  preProcessors?: Array<(contents: string) => string>;
  postProcessors?: Array<(contents: string) => string>;
}


/**
 * Get folder items from a repository-relative path.
 * @param path - Repository-relative path (e.g. ".github/workflows")
 * @returns Promise resolving to an array of GitHub content items.
 */
async function getFolderItemsFromRelativeRepoPath(path: string, ref: string) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || '',
  });

  const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
    ref,
    owner: 'AlaskaAirlines',
    repo: 'auro-templates',
    path: path,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  const responseData = response.data;
  if (typeof responseData !== 'object' || !Array.isArray(responseData)) {
    const errorMessage = `Unexpected response format: ${JSON.stringify(responseData)}`;
    const errorSpinner = ora().start();
    errorSpinner.fail(errorMessage);
    throw new Error("Failed to retrieve folder items");
  }

  return responseData;
}

interface ProcessIntoFileConfigArgs {
  folderItems: Awaited<ReturnType<typeof getFolderItemsFromRelativeRepoPath>>;
  templatePathToReplace: string;
  rootDir: string;
  ref: string;
}

/**
 * Recursively convert GitHub contents API items into FileProcessorConfig objects.
 */
async function processFolderItemsIntoFileConfigs({
  folderItems,
  templatePathToReplace,
  rootDir,
  ref,
}: ProcessIntoFileConfigArgs): Promise<Array<FileProcessorConfig>> {
  const fileConfigs: Array<FileProcessorConfig> = [];

  for (const item of folderItems) {
    if (item.type == 'dir') {
      const directorySpinner = ora(`Processing directory: ${item.path}`).start();

      const nestedFolderItems = await getFolderItemsFromRelativeRepoPath(item.path, ref);
    
      directorySpinner.succeed(`Found ${nestedFolderItems.length} additional items in ${item.path}`);

      const nestedConfigs = await processFolderItemsIntoFileConfigs({
        folderItems: nestedFolderItems,
        templatePathToReplace,
        rootDir,
        ref,
      })

      fileConfigs.push(...nestedConfigs);

      continue;
    }

    const finalPath = item.path.replace(`${templatePathToReplace}/`, '');
    const outputPath = `${rootDir}/.github/${finalPath}`;

    const config = {
      identifier: item.name,
      input: {
        remoteUrl: item.download_url || '',
        fileName: outputPath,
        overwrite: true,
      },
      output: outputPath,
    } satisfies FileProcessorConfig;

    fileConfigs.push(config);
  }

  return fileConfigs;
}


/**
 * Recursively removes a directory and all its contents.
 * @param {string} dirPath - The path to the directory to remove.
 * @returns {Promise<void>} A promise that resolves when the directory is removed or rejects if an error occurs.
 * @throws {Error} If the directory cannot be removed.
 */
async function removeDirectory(dirPath: string) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    const successSpinner = ora().start();
    successSpinner.succeed(`Successfully removed directory: ${dirPath}`);
  } catch (error: any) {
    const errorSpinner = ora().start();
    errorSpinner.fail(`Error removing directory ${dirPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Generates a tree-like structure representation of a directory.
 * @param {string} dirPath - The path to the directory to analyze.
 * @param {string} [prefix=''] - The prefix for the current level (used for recursion).
 * @param {boolean} [isLast=true] - Whether this is the last item at the current level.
 * @returns {Promise<string>} A promise that resolves to the tree structure as a string.
 */
async function generateDirectoryTree(dirPath: string, prefix: string = '', isLast: boolean = true): Promise<string> {
  try {
    const stats = await fs.stat(dirPath);
    const baseName = path.basename(dirPath);
    
    if (!stats.isDirectory()) {
      return `${prefix}${isLast ? '└── ' : '├── '}${baseName}\n`;
    }

    let result = `${prefix}${isLast ? '└── ' : '├── '}${baseName}/\n`;
    
    try {
      const entries = await fs.readdir(dirPath);
      const sortedEntries = entries.sort();
      
      for (let i = 0; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        const entryPath = path.join(dirPath, entry);
        const isLastEntry = i === sortedEntries.length - 1;
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        
        result += await generateDirectoryTree(entryPath, newPrefix, isLastEntry);
      }
    } catch (readError) {
      // If we can't read the directory, just show it as a directory
      result += `${prefix}${isLast ? '    ' : '│   '}└── [Permission denied or error reading directory]\n`;
    }
    
    return result;
  } catch (error) {
    return `${prefix}${isLast ? '└── ' : '├── '}[Error: ${error}]\n`;
  }
}

/**
 * Sync the .github directory with the remote repository.
 * @param {string} rootDir - The root directory of the local repository.
 * @returns {Promise<void>} A promise that resolves when syncing is complete.
 */
export async function syncDotGithubDir(rootDir: string, ref = 'main') {
  if (!rootDir) {
    const errorSpinner = ora().start();
    errorSpinner.fail("Root directory must be specified");
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  // Remove .github directory if it exists
  const githubPath = ".github";

  const removeSpinner = ora("Removing existing .github directory...").start();
  try {
    await removeDirectory(githubPath);
    removeSpinner.succeed(".github directory removed successfully");
  } catch (error: any) {
    removeSpinner.fail(`Error removing .github directory: ${error.message}`);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }

  // Setup
  await templateFiller.extractNames();

  if (!process.env.GITHUB_TOKEN) {
    const tokenErrorSpinner = ora().start();
    tokenErrorSpinner.fail("GITHUB_TOKEN environment variable is not set.");
    process.exit(1);
  }

  const templatesDefaultGithubPath = 'templates/default/.github';
  const folderItems = await getFolderItemsFromRelativeRepoPath(templatesDefaultGithubPath, ref);
  const fileConfigs = await processFolderItemsIntoFileConfigs({
    folderItems,
    templatePathToReplace: templatesDefaultGithubPath,
    rootDir,
    ref,
  });

    // Process all files
  const processSpinner = ora("Processing all files...").start();
  try {
    await Promise.all(
      fileConfigs.map((config) => processContentForFile(config)),
    );
    processSpinner.succeed("All files processed.");

    // Generate and display tree output of the rootDir directory
    const treeSpinner = ora("Generating directory tree...").start();
    try {
      const githubDirPath = path.join(rootDir, '.github');
      const treeOutput = await generateDirectoryTree(githubDirPath);
      treeSpinner.succeed("Synced .github directory structure:");
      console.log(treeOutput);
    } catch (treeError: any) {
      treeSpinner.fail(`Error generating directory tree: ${treeError.message}`);
      // Don't exit here since the main operation succeeded
    }

  } catch (error: any) {
    processSpinner.fail(`Error processing files: ${error.message}`);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }
}
