import fs from "fs";
import { promisify } from "util";
import simpleGit from "simple-git";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

const appendFile = promisify(fs.appendFile);
const readFile = promisify(fs.readFile);
const git = simpleGit();

/**
 * Function to check if pattern exists in .gitignore.
 * @async
 * @param {string} pattern .gitignore pattern.
 * @returns {boolean}
 */
const checkGitignore = async (pattern) => {
  if (pattern === "") return false;
  try {
    const fileContent = await readFile(".gitignore", "utf-8");
    return fileContent.includes(pattern);
  } catch (err) {
    Logger.error("Error reading file:", err);
    return false;
  }
};

/**
 * Function to add pattern to .gitignore.
 * @async
 * @param {String} pattern .gitignore pattern.
 * @param {Boolean} log If success message should be shown.
 */
const addToGitignore = async (pattern, log = true) => {
  await checkGitignore(pattern).then(async (result) => {
    if (result) {
      Logger.warn(`${pattern} already exists`);
    } else {
      try {
        await appendFile(".gitignore", `\n${pattern}`);
        if (log) {
          Logger.success(`${pattern} added to .gitignore`);
        }
      } catch (err) {
        Logger.error(err);
      }
    }
  });
};

/**
 * Function to remove file from git cache.
 * @async
 * @param {Array} files Array of files to remove from git cache.
 */
const removeFromGitCache = async (files) => {
  try {
    await git.rmKeepLocal(files);
    Logger.success(`${files.join(", ")} are removed from git cache`);
  } catch (err) {
    Logger.error(err);
  }
};

// Run tasks sequentially
const run = async () => {
  await addToGitignore(
    "## Added by Auro CLI migration (github-config-and-gitignore-changes)",
    false,
  );
  await addToGitignore("demo/*.md");
  await addToGitignore("demo/*.min.js");
  await addToGitignore("", false);
  await removeFromGitCache([
    "demo/api.md",
    "demo/index.md",
    "demo/index.min.js",
    "demo/api.min.js",
  ]);
};

run().catch(Logger.error);
