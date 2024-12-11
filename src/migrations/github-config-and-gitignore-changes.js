import fs from "fs";
import { promisify } from "util";
import simpleGit from "simple-git";
import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";

import "../commands/sync.js";

const appendFile = promisify(fs.appendFile);
const git = simpleGit();

// Function to add file to .gitignore
const addToGitignore = async (pattern) => {
  try {
    await appendFile(".gitignore", `\n${pattern}`);
    Logger.success(`${pattern} added to .gitignore`);
  } catch (err) {
    Logger.error(err);
  }
};

// Function to remove file from git cache
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
  await addToGitignore("demo/*.md");
  await addToGitignore("demo/*min.js");
  await removeFromGitCache([
    "demo/api.md",
    "demo/index.md",
    "demo/index.min.js",
    "demo/api.min.js",
  ]);
};

run().catch(Logger.error);
